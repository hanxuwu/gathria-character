#!/usr/bin/env python3
"""Decode new production UI downloads and compare with retained R2 exports.

Presentation only: atlas cropping, declared mirroring, matte and integer pixel
scales. No character retouching, head locking, fitting or synthetic drawings.
"""
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get("KLING_THEME_CONTINUITY_DIR", "docs/kling-theme-continuity/evidence")
REVIEW = OUT.parent / "review"
REVIEW.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location("theme_verify", ROOT / "scripts/verify-kling-themes.py")
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
helpers = old.helpers
sha = lambda data: hashlib.sha256(data).hexdigest()
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
MATTE = (238, 233, 223)
ACTIONS = ["idle", "walk", "run", "jump", "celebrate"]
FOCUS = {("female", "base"): "walk", ("male", "base"): "run"}


def duration(clip):
    return len(clip["frames"]) / clip["fps"]


def timings(count, seconds):
    return [(math.floor((i + 1) * seconds * 100 / count + .5) - math.floor(i * seconds * 100 / count + .5)) * 10 for i in range(count)]


def save_gif(frames, delays, path, loop):
    w, h = max(1, frames[0].width // 3), max(1, frames[0].height // 3)
    sample = Image.new("RGB", (w, h * len(frames)))
    for i, frame in enumerate(frames):
        sample.paste(frame.resize((w, h), Image.Resampling.BOX), (0, i * h))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    quantized = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    quantized[0].save(path, save_all=True, append_images=quantized[1:], duration=delays, disposal=1, optimize=False, **({"loop": 0} if loop else {}))
    with Image.open(path) as gif:
        assert (gif.info.get("loop") == 0) == loop
        actual = 0
        for i in range(gif.n_frames):
            gif.seek(i); gif.load(); actual += gif.info["duration"]
        assert actual == sum(delays)


def phase_schedule(packs, action):
    clips = [pack.m["animations"][action] for pack in packs]
    seconds = duration(clips[0])
    assert all(abs(duration(clip) - seconds) < 1e-10 for clip in clips), "Do not retime reference animation to hide cadence differences."
    assert all(clip["loop"] == clips[0]["loop"] for clip in clips)
    count = math.lcm(*(len(clip["frames"]) for clip in clips))
    assert count <= 96, "Unexpected comparison sampling grid."
    mapping = [[clip["frames"][i * len(clip["frames"]) // count] for clip in clips] for i in range(count)]
    return clips, mapping, timings(count, seconds)


def comparison(packs, labels, action, character, look, facing, path, original_first=False):
    clips, mapping, delays = phase_schedule(packs, action)
    height = packs[-1].m["spritesheet"]["frameHeight"] * 2
    scales = [height / packs[0].m["spritesheet"]["frameHeight"] if original_first and i == 0 else 2 for i in range(len(packs))]
    sizes = [(round(pack.m["spritesheet"]["frameWidth"] * scale), height) for pack, scale in zip(packs, scales)]
    anchors = [(round(pack.m["anchor"]["x"] * scale), round(pack.m["anchor"]["y"] * scale)) for pack, scale in zip(packs, scales)]
    left = max(anchor[0] for anchor in anchors)
    right = max(size[0] - anchor[0] for size, anchor in zip(sizes, anchors))
    above = max(anchor[1] for anchor in anchors)
    below = max(size[1] - anchor[1] for size, anchor in zip(sizes, anchors))
    width, display_height, gap, title = left + right, above + below, 12, 64
    frames = []
    for ids in mapping:
        board = Image.new("RGBA", (len(packs) * width + (len(packs) - 1) * gap, display_height + title), (*MATTE, 255))
        draw = ImageDraw.Draw(board)
        for i, (pack, fid, size, anchor, label) in enumerate(zip(packs, ids, sizes, anchors, labels)):
            image = pack.frame(fid)
            if facing == "left": image = ImageOps.mirror(image)
            image = image.resize(size, Image.Resampling.LANCZOS if original_first and i == 0 else Image.Resampling.NEAREST)
            x = i * (width + gap)
            board.alpha_composite(image, (x + left - anchor[0], title + above - anchor[1]))
            draw.text((x + 5, 5), label, font=font, fill=(40, 60, 53))
            draw.text((x + 5, 25), f"{character} / {look} / {action} / {facing}", font=font, fill=(40, 60, 53))
            draw.text((x + 5, 45), "Display height normalized" if original_first and i == 0 else "Native integer 2x / actual timing", font=font, fill=(40, 60, 53))
        frames.append(board.convert("RGB"))
    save_gif(frames, delays, path, clips[0]["loop"])
    return {"file": str(path.relative_to(ROOT)), "sources": [{"file": str(pack.path.relative_to(ROOT)), "sha256": sha(pack.path.read_bytes()), "label": label} for pack, label in zip(packs, labels)], "cycleSeconds": duration(clips[0]), "scales": scales, "frameIdMapping": mapping, "delaysMs": delays, "interpolatedDrawings": False, "retimedNativeClips": False}


def keyframes(previous, current, action, character, look, revision):
    rows = []
    packs = [previous, current]
    columns = max(len(pack.m["animations"][action]["frames"]) for pack in packs)
    for zoom in [1, 2]:
        w, h, title = 192 * zoom, 272 * zoom, 27
        sheet = Image.new("RGB", (w * columns, 2 * (h + title)), MATTE)
        draw = ImageDraw.Draw(sheet)
        for row, pack in enumerate(packs):
            clip = pack.m["animations"][action]
            for i, fid in enumerate(clip["frames"]):
                frame = old.expected_gif(pack.frame(fid), True, "right").resize((w, h), Image.Resampling.NEAREST)
                x, y = i * w, row * (h + title)
                sheet.paste(frame, (x, y + title))
                draw.text((x + 4, y + 4), f"R{2 if row == 0 else revision} / {i} / {round(i / clip['fps'] * 1000)}ms", font=font, fill=(40, 60, 53))
        path = REVIEW / f"{character}-{look}-{action}-keyframes-{zoom}x.png"
        sheet.save(path); rows.append({"file": str(path.relative_to(ROOT)), "displayScale": zoom, "note": "Each row lists every native timeline drawing once; different frame counts are not stretched into equal-count rows."})
    crop = (22, 10, 174, 146)
    w, h, title = 456, 408, 27
    sheet = Image.new("RGB", (w * columns, 2 * (h + title)), MATTE)
    draw = ImageDraw.Draw(sheet)
    for row, pack in enumerate(packs):
        for i, fid in enumerate(pack.m["animations"][action]["frames"]):
            frame = old.expected_gif(pack.frame(fid), True, "right").crop(crop).resize((w, h), Image.Resampling.NEAREST)
            x, y = i * w, row * (h + title)
            sheet.paste(frame, (x, y + title)); draw.text((x + 4, y + 4), f"R{2 if row == 0 else revision} / {action} {i} / fixed 3x crop", font=font, fill=(40, 60, 53))
    path = REVIEW / f"{character}-{look}-{action}-heads-3x.png"
    sheet.save(path); rows.append({"file": str(path.relative_to(ROOT)), "displayScale": 3, "crop": list(crop)})
    return rows


def landmarks(pack, action):
    rows = []
    for fid in dict.fromkeys(pack.m["animations"][action]["frames"]):
        image = np.asarray(pack.frame(fid))
        y, x = np.where(image[:, :, 3] > 128)
        top, bottom = int(y.min()), int(y.max())
        ys, xs = np.where(image[top:min(top + 75, 140), :, 3] > 128)
        rows.append({"frameId": fid, "crownTopY": top, "upperSilhouetteCenterX": (int(xs.min()) + int(xs.max())) / 2, "opaqueBottomY": bottom})
    metrics = {}
    for field in ["crownTopY", "upperSilhouetteCenterX", "opaqueBottomY"]:
        values = [row[field] for row in rows]
        metrics[field] = {"range": max(values) - min(values), "maxAdjacentStepIncludingWrap": max(abs(values[i] - values[(i + 1) % len(values)]) for i in range(len(values)))}
    return {"frames": rows, "metrics": metrics, "note": "Opaque silhouette proxies; not inferred face/neck joints or a visual acceptance score."}


def compare_regression(previous, current, character, look):
    records = []
    assert current.m["anchor"] == previous.m["anchor"]
    assert current.m["facing"] == previous.m["facing"]
    assert current.m["spritesheet"]["frameWidth"] == previous.m["spritesheet"]["frameWidth"] == 192
    assert current.m["spritesheet"]["frameHeight"] == previous.m["spritesheet"]["frameHeight"] == 272
    assert set(current.m["animations"]) == set(previous.m["animations"]) == set(ACTIONS)
    for action in ACTIONS:
        a, b = previous.m["animations"][action], current.m["animations"][action]
        assert a["loop"] == b["loop"] and abs(duration(a) - duration(b)) < 1e-10
        same_timeline = len(a["frames"]) == len(b["frames"]) and a["fps"] == b["fps"]
        pixels_equal = same_timeline and all(previous.frame(fa).tobytes() == current.frame(fb).tobytes() for fa, fb in zip(a["frames"], b["frames"]))
        allowed = FOCUS.get((character, look)) == action
        if not allowed:
            assert pixels_equal, (character, look, action, "Unrelated artwork or timeline changed")
        if character == "female" and action == "walk":
            assert same_timeline, "Female walk repair retains eight-frame cadence."
        if character == "male" and look == "base" and action == "run" and not same_timeline:
            assert len(b["frames"]) == 16 and b["fps"] == 24, "Only declared 16-drawing/24fps run experiment is permitted."
            hashes = [sha(current.frame(fid).tobytes()) for fid in b["frames"]]
            assert len(set(hashes)) == 16, "Repeated frames are not sixteen distinct authored drawings."
        records.append({"character": character, "lookId": look, "action": action, "sameNativePixelsAndTimeline": pixels_equal, "sameCycleDuration": True, "beforeDrawingCount": len(set(a["frames"])), "afterDrawingCount": len(set(b["frames"])), "beforeFps": a["fps"], "afterFps": b["fps"], "changeWithinDeclaredScope": allowed or pixels_equal})
    return records


def main():
    raw = (OUT / "capture.json").read_bytes()
    evidence = json.loads(raw)
    assert evidence["passed"] and evidence["production"]
    assert len(evidence["cases"]) == 4 and len(evidence["playback"]) == 40
    assert len(evidence["sessions"]) == 2 and len(evidence["switches"]) == 4 and len(evidence["comparisonPlayback"]) == 4
    assert {(c["character"], c["lookId"]) for c in evidence["cases"]} == {(g, l) for g in ["male", "female"] for l in ["base", "wedding"]}
    for field in ["errors", "failedRequests", "externalRequests", "independentEditorRequests"]: assert not evidence[field]
    for file, expected in {**evidence["sourceHashes"], **evidence["assetHashes"]}.items():
        assert sha((ROOT / file).read_bytes()) == expected, (file, "changed since production capture")
    for baseline in [evidence["baselineCapture"], *evidence["baselinePacks"]]:
        assert sha((ROOT / baseline["file"]).read_bytes()) == baseline["sha256"]
    preserved = []
    historical = json.loads((ROOT / evidence["baselineCapture"]["file"]).read_text())
    for file, expected in historical["assetHashes"].items():
        if file.endswith(".theme.zip"):
            assert sha((ROOT / file).read_bytes()) == expected, (file, "Published original/R1/R2 must stay immutable")
            preserved.append(file)
    for row in evidence["comparisonPlayback"]:
        assert sorted({sample["pixelFrameId"] for sample in row["observed"]}) == row["pixelFrameIds"]
        assert sorted({sample["referenceFrameId"] for sample in row["observed"]}) == row["referenceFrameIds"]
    result = {"passed": False, "captureSha256": sha(raw), "capturedCommit": evidence["commitAtCapture"], "verifiedSource": "current-worktree", "packs": [], "pngs": [], "gifs": [], "sessions": [], "presentations": [], "landmarkDiagnostics": [], "actionRegressions": [], "preservedPublishedBundles": preserved, "initialLoads": evidence["initialLoads"], "retainedBaselineEvidence": evidence["baselineCapture"]}
    packs = {}
    for row in evidence["downloads"]:
        data = (ROOT / row["file"]).read_bytes()
        assert len(data) == row["bytes"] and sha(data) == row["sha256"]
        if row["kind"] != "pack": continue
        pack = helpers.Pack(ROOT / row["file"]); packs[row["key"]] = pack
        helpers.nested_zip(data)
        with zipfile.ZipFile(ROOT / row["themeFile"]) as bundle:
            manifest = json.loads(bundle.read("theme.json")); look = next(l for l in manifest["looks"] if l["logicalId"] == row["lookId"])
            assert bundle.read(look["file"]) == data and sha(data) == look["sha256"]
        assert pack.m["schemaVersion"] == 4 and pack.m["scale"]["pixelArt"] and pack.m["scale"]["integerOnly"]
        assert pack.m["anchor"]["x"] == 96 and pack.m["anchor"]["y"] == 251
        for fid in pack.frames:
            image = pack.frame(fid); assert image.mode == "RGBA" and image.size == (192, 272) and image.getbbox()
            low, high = image.getchannel("A").getextrema(); assert low == 0 and high >= 250
        result["packs"].append({"file": row["file"], "allFramesDecoded": True, "frames": len(pack.frames), "exactPublishedBytes": True, "transparentNativeCanvas": True})
    assert len(packs) == 4
    assert sum(row["kind"] == "session" for row in evidence["downloads"]) == 4
    expected_gifs = {(case["key"], action, facing) for case in evidence["cases"] for action in ACTIONS for facing in ["right", "left"] if action in ["idle", "walk", "run"] or facing == "right"}
    actual_gifs = {(row["key"], row["action"], row["facing"]) for row in evidence["downloads"] if row["kind"] == "gif"}
    assert actual_gifs == expected_gifs and len(actual_gifs) == 32
    for case in evidence["cases"]:
        pack = packs[case["key"]]
        for action in ACTIONS:
            for facing in ["right", "left"]:
                assert any(row["kind"] == "frame" and row["key"] == case["key"] and row["action"] == action and row["facing"] == facing and row["frameId"] == pack.m["animations"][action]["frames"][0] for row in evidence["downloads"]), "Initial PNG must exist for every action/direction."
    for row in evidence["downloads"]:
        path = ROOT / row["file"]
        if row["kind"] == "frame":
            expected = packs[row["key"]].frame(row["frameId"])
            if row["facing"] == "left": expected = ImageOps.mirror(expected)
            with Image.open(path) as image:
                image.load(); assert image.mode == "RGBA" and image.size == expected.size and image.tobytes() == expected.tobytes()
            result["pngs"].append({"file": row["file"], "nativeRgbaExact": True})
        elif row["kind"] == "gif":
            result["gifs"].append(old.check_gif(path, packs[row["key"]], row["action"], row["facing"]))
        elif row["kind"] == "session":
            with zipfile.ZipFile(path) as session:
                assert session.testzip() is None
                document = json.loads(session.read("session.json")); assert document["selection"] == row["selection"]
                revisions = []
                for entry in document["themes"]:
                    content = session.read(entry["file"]); assert sha(content) == entry["sha256"]
                    revisions.append(old.verify_theme(content)["revision"])
                assert sorted(revisions) == sorted(row["revisions"])
            result["sessions"].append({"file": row["file"], "revisionsDecoded": revisions, "selectionRetained": True})
    for case in evidence["cases"]:
        key, character, look = case["key"], case["character"], case["lookId"]
        after = packs[key]
        before_row = next(row for row in evidence["baselinePacks"] if row["character"] == character and row["lookId"] == look and row["kind"] == "r2")
        original_row = next(row for row in evidence["baselinePacks"] if row["character"] == character and row["lookId"] == look and row["kind"] == "original")
        before = helpers.Pack(ROOT / before_row["file"])
        original = helpers.Pack(ROOT / original_row["file"])
        revision = int(case["themeKey"].rsplit("@", 1)[1])
        result["actionRegressions"].extend(compare_regression(before, after, character, look))
        for action in ["idle", "walk", "run"]:
            rows = {row["facing"]: ROOT / row["file"] for row in evidence["downloads"] if row["kind"] == "gif" and row["key"] == key and row["action"] == action}
            assert set(rows) == {"left", "right"}; old.mirror_gifs(rows["left"], rows["right"])
            result["landmarkDiagnostics"].append({"key": key, "action": action, "before": landmarks(before, action), "after": landmarks(after, action)})
        if (character, look) in FOCUS:
            action = FOCUS[(character, look)]
            expected_frames = set(after.m["animations"][action]["frames"])
            for facing in ["right", "left"]:
                exported_frames = {row["frameId"] for row in evidence["downloads"] if row["kind"] == "frame" and row["key"] == key and row["action"] == action and row["facing"] == facing}
                assert exported_frames == expected_frames, "Every focused drawing must also be exported from UI as native PNG."
                path = REVIEW / f"{character}-{look}-{action}-before-after-{facing}-2x.gif"
                result["presentations"].append(comparison([before, after], ["Pixel R2 / retained actual export", f"Pixel R{revision} / current UI export"], action, character, look, facing, path))
            result["presentations"].extend(keyframes(before, after, action, character, look, revision))
        for facing in ["right", "left"]:
            path = REVIEW / f"{character}-{look}-run-original-r2-current-{facing}-2x.gif"
            result["presentations"].append(comparison([original, before, after], ["Original / retained actual export", "Pixel R2 / retained actual export", f"Pixel R{revision} / current UI export"], "run", character, look, facing, path, original_first=True))
        before.close(); original.close()
    for row in evidence["playback"]:
        clip = packs[row["key"]].m["animations"][row["action"]]
        positions = {sample["position"] for sample in row["observed"] if sample["action"] == row["action"]}
        assert positions == set(range(len(clip["frames"])))
        for sample in row["observed"]:
            assert sample["frameId"] == packs[row["key"]].m["animations"][sample["action"]]["frames"][sample["position"]]
    for path in sorted(OUT.glob("*.png")):
        with Image.open(path) as image: image.load(); assert min(image.size) > 0
    result["decodedPresentations"] = []
    for path in sorted(REVIEW.iterdir()):
        with Image.open(path) as image:
            for i in range(getattr(image, "n_frames", 1)): image.seek(i); image.load()
        result["decodedPresentations"].append({"file": str(path.relative_to(ROOT)), "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size})
    for pack in packs.values(): pack.close()
    result["passed"] = True
    (OUT.parent / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"passed": True, **{name: len(value) for name, value in result.items() if isinstance(value, list)}}))


if __name__ == "__main__": main()
