#!/usr/bin/env python3
"""Decode actual app exports and assemble clearly labeled comparison presentations.

This script does not retouch anatomy. Contact sheets/GIF boards only crop atlas
frames, mirror, matte and display at integer scale; exported source bytes remain
the acceptance reference. Measured silhouette landmarks are diagnostic proxies,
not a substitute for visual review of faces or joint anatomy.
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
OUT = ROOT / os.environ.get("KLING_THEME_STABILITY_DIR", "docs/kling-theme-stability/evidence")
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


def timings(clip):
    return [(math.floor((i + 1) * 100 / clip["fps"] + .5) - math.floor(i * 100 / clip["fps"] + .5)) * 10 for i in range(len(clip["frames"]))]


def save_gif(frames, durations, path, loop):
    # One shared palette and exact native schedule; no morphology/interpolation.
    w, h = max(1, frames[0].width // 3), max(1, frames[0].height // 3)
    sample = Image.new("RGB", (w, h * len(frames)))
    for i, frame in enumerate(frames):
        sample.paste(frame.resize((w, h), Image.Resampling.BOX), (0, i * h))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    quantized = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    options = {"loop": 0} if loop else {}
    quantized[0].save(path, save_all=True, append_images=quantized[1:], duration=durations, disposal=1, optimize=False, **options)
    with Image.open(path) as gif:
        # Identical held frames may be coalesced by Pillow; validate cumulative
        # timing and every decoded image, not artificial unique drawing counts.
        assert (gif.info.get("loop") == 0) == loop
        actual_duration = 0
        for i in range(gif.n_frames):
            gif.seek(i); gif.load(); actual_duration += gif.info["duration"]
        assert actual_duration == sum(durations)


def pair_frame(before, after, old_id, new_id, facing, caption, zoom=2):
    w, h = before.m["spritesheet"]["frameWidth"], before.m["spritesheet"]["frameHeight"]
    assert (w, h) == (after.m["spritesheet"]["frameWidth"], after.m["spritesheet"]["frameHeight"])
    gap, title = 12, 50
    board = Image.new("RGB", (w * zoom * 2 + gap, h * zoom + title), MATTE)
    draw = ImageDraw.Draw(board)
    for i, (pack, fid, text) in enumerate([(before, old_id, "Before / pixel revision 1"), (after, new_id, "After / pixel revision 2")]):
        image = old.expected_gif(pack.frame(fid), True, facing).resize((w * zoom, h * zoom), Image.Resampling.NEAREST)
        x = i * (w * zoom + gap)
        board.paste(image, (x, title)); draw.text((x + 6, 5), text, font=font, fill=(40, 60, 53)); draw.text((x + 6, 26), caption, font=font, fill=(40, 60, 53))
    return board


def before_after(before, after, key, character, look):
    rows = []
    for action in ["idle", "walk", "run"]:
        a, b = before.m["animations"][action], after.m["animations"][action]
        assert a == b, "Registration/art corrections must not change the accepted action cadence."
        for facing in ["right", "left"]:
            frames = [pair_frame(before, after, old_id, new_id, facing, f"{character} / {look} / {action} / {facing} / 2x") for old_id, new_id in zip(a["frames"], b["frames"])]
            path = REVIEW / f"{character}-{look}-{action}-before-after-{facing}-2x.gif"
            save_gif(frames, timings(b), path, b["loop"])
            rows.append({"file": str(path.relative_to(ROOT)), "source": "Actual current UI CharacterPack and preserved prior UI CharacterPack", "displayScale": 2, "sameNativeSchedule": True})
        if action in ["walk", "run"]:
            for zoom in [1, 2]:
                # Rows match exact frame positions across revisions, with common
                # native canvas/anchor. No pose fitting or head alignment here.
                width, height = 192 * zoom, 272 * zoom
                sheet = Image.new("RGB", (width * 8, 2 * (height + 25)), MATTE)
                draw = ImageDraw.Draw(sheet)
                for row, pack in enumerate([before, after]):
                    for position, fid in enumerate(pack.m["animations"][action]["frames"]):
                        frame = old.expected_gif(pack.frame(fid), True, "right").resize((width, height), Image.Resampling.NEAREST)
                        x, y = position * width, row * (height + 25)
                        sheet.paste(frame, (x, y + 25)); draw.text((x + 4, y + 4), f'{"Before" if row == 0 else "After"} / {position}', font=font, fill=(40, 60, 53))
                path = REVIEW / f"{character}-{look}-{action}-keyframes-{zoom}x.png"
                sheet.save(path)
                rows.append({"file": str(path.relative_to(ROOT)), "source": "Actual selected CharacterPack atlas frames", "displayScale": zoom, "sameNativeSchedule": True})
    # Head crop only is a presentation aid. It never becomes new character art.
    for action in ["walk", "run"]:
        crop = (22, 10, 174, 146)
        sheet = Image.new("RGB", (152 * 3 * 8, 2 * (136 * 3 + 25)), MATTE)
        draw = ImageDraw.Draw(sheet)
        for row, pack in enumerate([before, after]):
            for i, fid in enumerate(pack.m["animations"][action]["frames"]):
                image = old.expected_gif(pack.frame(fid), True, "right").crop(crop).resize((456, 408), Image.Resampling.NEAREST)
                x, y = i * 456, row * 433
                sheet.paste(image, (x, y + 25)); draw.text((x + 4, y + 4), f'{"Before" if row == 0 else "After"} / {action} {i} / fixed crop 3x', font=font, fill=(40, 60, 53))
        sheet.save(REVIEW / f"{character}-{look}-{action}-heads-3x.png")
    return rows


def landmarks(pack, action):
    rows = []
    for fid in dict.fromkeys(pack.m["animations"][action]["frames"]):
        image = pack.frame(fid)
        a = np.asarray(image)
        y, x = np.where(a[:, :, 3] > 128)
        top, bottom = int(y.min()), int(y.max())
        ys, xs = np.where(a[top:min(top + 75, 140), :, 3] > 128)
        rows.append({"frameId": fid, "crownTopY": top, "upperSilhouetteCenterX": (int(xs.min()) + int(xs.max())) / 2, "opaqueBottomY": bottom})
    def spread(name):
        values = [r[name] for r in rows]; return max(values) - min(values)
    return {"frames": rows, "crownTopRange": spread("crownTopY"), "upperSilhouetteXRange": spread("upperSilhouetteCenterX"), "soleRange": spread("opaqueBottomY")}


def triple_run(reference, previous, current, character, look):
    """Retained actual original export + retained r1 + new actual r2 UI export.

    Original16@24 FPS and pixel8@12 FPS have the same 2/3-second cycle.
    Display each original frame and hold each pixel drawing for two positions;
    no synthesized in-between drawing, body fitting, or native export mutation.
    """
    packs = [reference, previous, current]
    target_height = current.m["spritesheet"]["frameHeight"] * 2
    scales = [target_height / reference.m["spritesheet"]["frameHeight"], 2, 2]
    sizes = [(round(pack.m["spritesheet"]["frameWidth"] * scale), target_height) for pack, scale in zip(packs, scales)]
    anchors = [(round(pack.m["anchor"]["x"] * scale), round(pack.m["anchor"]["y"] * scale)) for pack, scale in zip(packs, scales)]
    left = max(anchor[0] for anchor in anchors)
    right = max(size[0] - anchor[0] for size, anchor in zip(sizes, anchors))
    above = max(anchor[1] for anchor in anchors)
    below = max(size[1] - anchor[1] for size, anchor in zip(sizes, anchors))
    width, height, gap, caption = left + right, above + below, 12, 62
    clips = [pack.m["animations"]["run"] for pack in packs]
    assert len(clips[0]["frames"]) == 16 and clips[0]["fps"] == 24
    assert all(len(clip["frames"]) == 8 and clip["fps"] == 12 for clip in clips[1:])
    assert all(clip["loop"] for clip in clips)
    frames, mapping = [], []
    for position in range(16):
        ids = [clips[0]["frames"][position], clips[1]["frames"][position // 2], clips[2]["frames"][position // 2]]
        board = Image.new("RGBA", (width * 3 + gap * 2, height + caption), (*MATTE, 255))
        draw = ImageDraw.Draw(board)
        for column, (pack, frame_id, size, anchor, title) in enumerate(zip(packs, ids, sizes, anchors, ["Original / retained actual export", "Pixel r1 / before", "Pixel r2 / current UI export"])):
            image = pack.frame(frame_id).resize(size, Image.Resampling.LANCZOS if column == 0 else Image.Resampling.NEAREST)
            x = column * (width + gap)
            board.alpha_composite(image, (x + left - anchor[0], caption + above - anchor[1]))
            draw.text((x + 5, 5), title, font=font, fill=(40, 60, 53))
            draw.text((x + 5, 25), f"{character} / {look} / run right", font=font, fill=(40, 60, 53))
            draw.text((x + 5, 43), "Display height normalized" if column == 0 else "Exact integer 2x / same 2/3s cycle", font=font, fill=(40, 60, 53))
        frames.append(board.convert("RGB"))
        mapping.append({"position": position, "originalFrameId": ids[0], "pixelR1FrameId": ids[1], "pixelR2FrameId": ids[2]})
    path = REVIEW / f"{character}-{look}-run-original-r1-r2-right-2x.gif"
    save_gif(frames, timings(clips[0]), path, True)
    return {"file": str(path.relative_to(ROOT)), "originalSource": str(reference.path.relative_to(ROOT)), "originalSourceSha256": sha(reference.path.read_bytes()), "originalEvidence": "Retained actual prior application export, byte-identical immutable original pack; not newly re-exported this capture.", "beforeSource": str(previous.path.relative_to(ROOT)), "afterSource": str(current.path.relative_to(ROOT)), "displayScales": scales, "sharedPresentationAnchor": {"x": left, "y": caption + above}, "cycleSeconds": 2 / 3, "mapping": mapping, "interpolatedDrawings": False}


def main():
    evidence_bytes = (OUT / "capture.json").read_bytes()
    evidence = json.loads(evidence_bytes)
    assert evidence["passed"] and evidence["production"]
    assert len(evidence["cases"]) == 4 and len(evidence["playback"]) == 40 and len(evidence["downloads"]) == 80
    assert len(evidence["sessions"]) == 2 and len(evidence["switches"]) == 4 and len(evidence["comparisonPlayback"]) == 4
    for row in evidence["comparisonPlayback"]:
        assert len({sample["pixelFrameId"] for sample in row["observed"]}) == 8
        assert len({sample["referenceFrameId"] for sample in row["observed"]}) == 16
    assert {(c["character"], c["lookId"]) for c in evidence["cases"]} == {(g, l) for g in ["male", "female"] for l in ["base", "wedding"]}
    for field in ["errors", "failedRequests", "externalRequests", "independentEditorRequests"]: assert not evidence[field]
    for file, expected in {**evidence["sourceHashes"], **evidence["assetHashes"]}.items():
        assert sha((ROOT / file).read_bytes()) == expected, (file, "changed since this capture")
    legacy = json.loads((ROOT / "docs/kling-themes/evidence/capture.json").read_text())
    preserved = []
    for file, expected in legacy["assetHashes"].items():
        if file.endswith(".theme.zip"):
            assert sha((ROOT / file).read_bytes()) == expected, (file, "published revision 1 must remain immutable")
            preserved.append(file)
    result = {"passed": False, "captureSha256": sha(evidence_bytes), "capturedCommit": evidence["commitAtCapture"], "verifiedSource": "current-worktree", "packs": [], "pngs": [], "gifs": [], "sessions": [], "presentations": [], "landmarkDiagnostics": [], "preservedLegacyBundles": preserved, "initialLoads": evidence["initialLoads"]}
    packs = {}
    for row in evidence["downloads"]:
        data = (ROOT / row["file"]).read_bytes()
        assert len(data) == row["bytes"] and sha(data) == row["sha256"]
        if row["kind"] != "pack": continue
        pack = helpers.Pack(ROOT / row["file"]); packs[row["key"]] = pack
        with zipfile.ZipFile(ROOT / row["themeFile"]) as bundle:
            manifest = json.loads(bundle.read("theme.json")); look = next(l for l in manifest["looks"] if l["logicalId"] == row["lookId"])
            assert bundle.read(look["file"]) == data and sha(data) == look["sha256"]
        assert pack.m["schemaVersion"] == 4 and pack.m["scale"]["pixelArt"] and pack.m["scale"]["integerOnly"]
        assert pack.m["anchor"]["x"] == 96 and pack.m["anchor"]["y"] == 251
        for fid in pack.frames:
            image = pack.frame(fid); assert image.mode == "RGBA" and image.size == (192, 272) and image.getbbox()
        result["packs"].append({"file": row["file"], "allFramesDecoded": True, "frames": len(pack.frames), "exactPublishedBytes": True})
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
                assert len(document["themes"]) == 2
                revisions = []
                for entry in document["themes"]:
                    content = session.read(entry["file"]); assert sha(content) == entry["sha256"]
                    manifest = old.verify_theme(content); revisions.append(manifest["revision"])
                assert sorted(revisions) == [1, 2]
            result["sessions"].append({"file": row["file"], "bothRevisionsDecoded": True, "selectionRetained": True})
    for case in evidence["cases"]:
        key, character, look = case["key"], case["character"], case["lookId"]
        after = packs[key]
        previous_path = ROOT / f"docs/kling-themes/evidence/{character}-pixel-storybook-{look}.character.zip"
        previous = helpers.Pack(previous_path)
        assert previous.m["animations"] == after.m["animations"]
        for action in ["idle", "walk", "run"]:
            rows = {row["facing"]: ROOT / row["file"] for row in evidence["downloads"] if row["kind"] == "gif" and row["key"] == key and row["action"] == action}
            assert set(rows) == {"left", "right"}; old.mirror_gifs(rows["left"], rows["right"])
            result["landmarkDiagnostics"].append({"key": key, "action": action, "before": landmarks(previous, action), "after": landmarks(after, action), "note": "Opaque upper silhouette landmarks, not inferred eye/neck anatomy. Changes must be read with actual GIFs and contact/flight poses."})
        result["presentations"].extend(before_after(previous, after, key, character, look))
        reference = helpers.Pack(ROOT / f"docs/kling-themes/evidence/{character}-original-{look}.character.zip")
        result["presentations"].append(old.compare_themes(reference, after, character, look, REVIEW, font))
        result["presentations"].append(triple_run(reference, previous, after, character, look))
        previous.close(); reference.close()
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
