#!/usr/bin/env python3
"""Independently decode UI exports and make native-clock study comparisons.

No new character artwork is made here. Presentation changes are limited to
whole-canvas uniform scaling, matte, mirroring and declared-anchor alignment.
GIFs are streamed one indexed frame at a time to bound memory for the 9 s loop.
"""
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
from fractions import Fraction
import re
import zipfile

import numpy as np
from PIL import GifImagePlugin, Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
STUDY = ROOT / os.environ.get("KLING_SOURCE_PIXEL_STUDY_DIR", "docs/kling-source-pixel-study")
OUT = STUDY / "evidence"
REVIEW = STUDY / "review"
spec = importlib.util.spec_from_file_location("theme_verify", ROOT / "scripts/verify-kling-themes.py")
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
Pack = old.helpers.Pack
sha = lambda value: hashlib.sha256(value).hexdigest()
relative = lambda path: str(path.relative_to(ROOT))
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
MATTE = (238, 233, 223)
INK = (40, 60, 53)


def timings(fps, count):
    return [(math.floor((i + 1) * 100 / fps + .5) - math.floor(i * 100 / fps + .5)) * 10 for i in range(count)]


def decode_gif(path):
    with Image.open(path) as gif:
        durations = []
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.load()
            durations.append(gif.info["duration"])
        return {"file": relative(path), "sha256": sha(path.read_bytes()), "bytes": path.stat().st_size,
                "size": list(gif.size), "frames": gif.n_frames, "durationsMs": durations,
                "totalDurationMs": sum(durations), "loop": gif.info.get("loop") == 0}


def stream_gif(path, frame_at, count, fps):
    """Shared palette; only sample thumbnails plus one full frame stay in RAM."""
    indices = list(dict.fromkeys(round(i * (count - 1) / min(23, count - 1)) for i in range(min(24, count)))) if count > 1 else [0]
    thumbnails = []
    for index in indices:
        image = frame_at(index).convert("RGB")
        image.thumbnail((384, 192), Image.Resampling.BOX)
        thumbnails.append(image)
    sample = Image.new("RGB", (384, 192 * len(thumbnails)), MATTE)
    for i, thumb in enumerate(thumbnails):
        sample.paste(thumb, (0, 192 * i))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    del sample, thumbnails
    durations = timings(fps, count)
    with path.open("wb") as stream:
        for i in range(count):
            frame = frame_at(i).convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
            if i == 0:
                header, _ = GifImagePlugin.getheader(frame, info={"loop": 0, "optimize": False})
                for chunk in header:
                    stream.write(chunk)
            for chunk in GifImagePlugin.getdata(frame, duration=durations[i], disposal=1, include_color_table=False):
                stream.write(chunk)
        stream.write(b";")
    result = decode_gif(path)
    assert result["frames"] == count and result["durationsMs"] == durations and result["loop"]
    return result


def comparison(packs, labels, action, character, facing, name, scales, seconds):
    """Use elapsed time independently for every clip, never normalized phase."""
    fps = math.lcm(*(int(pack.m["animations"][action]["fps"]) for pack in packs))
    count = int(seconds * fps)
    assert Fraction(count, fps) == seconds
    sizes = [(round(pack.m["spritesheet"]["frameWidth"] * scale), round(pack.m["spritesheet"]["frameHeight"] * scale)) for pack, scale in zip(packs, scales)]
    anchors = []
    for pack, size, scale in zip(packs, sizes, scales):
        anchor = pack.m["anchor"]
        anchors.append((round((pack.m["spritesheet"]["frameWidth"] - anchor["x"] if facing == "left" else anchor["x"]) * scale), round(anchor["y"] * scale)))
    left = max(a[0] for a in anchors)
    right = max(size[0] - a[0] for size, a in zip(sizes, anchors))
    above = max(a[1] for a in anchors)
    below = max(size[1] - a[1] for size, a in zip(sizes, anchors))
    width, height, gap, caption = left + right, above + below, 12, 78
    clips = [pack.m["animations"][action] for pack in packs]
    # Cache only uniformly transformed native frames, not complete GIF boards.
    banks = []
    for pack, clip, size in zip(packs, clips, sizes):
        bank = {}
        for fid in dict.fromkeys(clip["frames"]):
            image = pack.frame(fid)
            if facing == "left":
                image = ImageOps.mirror(image)
            image = image.resize(size, Image.Resampling.NEAREST if pack.m["scale"]["pixelArt"] else Image.Resampling.BOX)
            bank[fid] = image
        banks.append(bank)
    mapping = []
    for tick in range(count):
        positions = [(tick * int(clip["fps"]) // fps) % len(clip["frames"]) for clip in clips]
        mapping.append({"tick": tick, "elapsedSeconds": tick / fps, "positions": positions,
                        "frameIds": [clip["frames"][position] for clip, position in zip(clips, positions)]})

    def frame_at(tick):
        board = Image.new("RGBA", (width * len(packs) + gap * (len(packs) - 1), height + caption), (*MATTE, 255))
        draw = ImageDraw.Draw(board)
        for column, (pack, label, size, anchor, bank, fid, scale, clip) in enumerate(zip(packs, labels, sizes, anchors, banks, mapping[tick]["frameIds"], scales, clips)):
            x = column * (width + gap)
            board.alpha_composite(bank[fid], (x + left - anchor[0], caption + above - anchor[1]))
            native = pack.m["spritesheet"]
            draw.text((x + 5, 4), label, font=FONT, fill=INK)
            draw.text((x + 5, 23), f"{character} BASE / {action} {facing}", font=FONT, fill=INK)
            draw.text((x + 5, 42), f"{native['frameWidth']}x{native['frameHeight']} native / {float(scale):g}x uniform", font=FONT, fill=INK)
            draw.text((x + 5, 60), f"{len(clip['frames'])} positions @ {clip['fps']} FPS / native clock", font=FONT, fill=INK)
        return board.convert("RGB")

    path = REVIEW / f"{character}-{action}-{name}-{facing}.gif"
    artifact = stream_gif(path, frame_at, count, fps)
    first = REVIEW / f"{character}-{action}-{name}-{facing}.png"
    frame_at(0).save(first)
    return {**artifact, "still": relative(first), "sources": [{"file": relative(pack.path), "sha256": sha(pack.path.read_bytes()), "label": label} for pack, label in zip(packs, labels)],
            "displayScales": [float(scale) for scale in scales], "nativeSizes": [[pack.m["spritesheet"]["frameWidth"], pack.m["spritesheet"]["frameHeight"]] for pack in packs],
            "sharedPresentationAnchor": {"x": left, "y": caption + above}, "commonLoopSeconds": float(seconds),
            "timelineFps": fps, "mapping": mapping, "retimed": False, "interpolatedDrawings": False,
            "geometry": "Whole native canvases uniformly scaled and declared anchors aligned. Original 1/2, pixels integer 2x; different native canvas sizes remain visible."}


def contact_sheet(pack, action, key, facing):
    clip = pack.m["animations"][action]
    w, h = pack.m["spritesheet"]["frameWidth"], pack.m["spritesheet"]["frameHeight"]
    columns = 8
    rows = math.ceil(len(clip["frames"]) / columns)
    board = Image.new("RGB", (w * columns, (h + 25) * rows), MATTE)
    draw = ImageDraw.Draw(board)
    for position, fid in enumerate(clip["frames"]):
        image = old.expected_gif(pack.frame(fid), True, facing)
        x, y = (position % columns) * w, (position // columns) * (h + 25)
        board.paste(image, (x, y + 25))
        draw.text((x + 4, y + 4), f"Position {position} / source {fid}", font=FONT, fill=INK)
    path = REVIEW / f"{key}-{action}-{facing}-all-positions-native.png"
    board.save(path)
    return {"file": relative(path), "sha256": sha(path.read_bytes()), "nativeSize": [w, h], "positions": len(clip["frames"]), "uniqueDrawings": len(set(clip["frames"])), "displayScale": 1}


def main():
    REVIEW.mkdir(parents=True, exist_ok=True)
    capture_bytes = (OUT / "capture.json").read_bytes()
    capture = json.loads(capture_bytes)
    assert capture["passed"] and capture["production"] and capture["isolatedImports"]
    assert capture["catalogUnchanged"] and capture["defaultSelectionUnchanged"]
    assert len(capture["cases"]) == 4 and len(capture["playback"]) == 8 and len(capture["idleChecks"]) == 8
    assert len(capture["sessions"]) == 2 and len(capture["timeline"]) == 8 and len(capture["defaults"]) == 2
    assert len(capture["unavailableChecks"]) == 8 and capture["editorsClosedAt"]
    for field in ["errors", "failedRequests", "externalRequests", "independentEditorRequests"]:
        assert not capture[field]
    for file, expected in {**capture["sourceHashes"], **capture["assetHashes"], **capture["protectedHashes"]}.items():
        assert sha((ROOT / file).read_bytes()) == expected, (file, "changed after capture")
    result = {"passed": False, "captureSha256": sha(capture_bytes), "capturedCommit": capture["commitAtCapture"], "packs": [], "pngs": [], "gifs": [], "sessions": [], "presentations": [], "contactSheets": [], "sourceTimelines": [], "screenshots": [],
              "catalogUnchanged": True, "defaultSelectionUnchanged": True, "noRejectedRevisionInputs": True,
              "historicalReferenceNote": "Original and R2 are retained actual prior UI exports, not new exports in this capture. The study packs/PNGs/GIFs are new production UI exports.",
              "presentationTimingNote": "Male native cycles: original/study 16@24 and R2 8@12 = 2/3 s. Female original/study 27@24 = 1.125 s; R2 8@8 = 1 s. The three-column female comparison runs 9 s (8 source cycles, 9 R2 cycles), without retiming."}
    packs = {}
    cases = {row["key"]: row for row in capture["cases"]}
    for row in capture["downloads"]:
        data = (ROOT / row["file"]).read_bytes()
        assert len(data) == row["bytes"] and sha(data) == row["sha256"]
        if row["kind"] != "pack":
            continue
        path = ROOT / row["file"]
        pack = Pack(path)
        packs[row["key"]] = pack
        with zipfile.ZipFile(ROOT / row["themeFile"]) as theme_zip:
            theme = old.verify_theme((ROOT / row["themeFile"]).read_bytes())
            assert theme["id"] != "pixel-storybook" and theme["revision"] == 1
            assert len(theme["looks"]) == 1 and theme["looks"][0]["logicalId"] == "base"
            assert theme_zip.read(theme["looks"][0]["file"]) == data
        # Reject references to the superseded authored R3 inputs, while allowing
        # source frame IDs containing the digit 3.
        for name in pack.zip.namelist():
            assert not re.search(r"pixel[-_]storybook.*(?:v3|r3|@3)", name, re.I)
        case = cases[row["key"]]
        assert theme["reference"]["sourceSha256"] == sha((ROOT / f"docs/kling-motion/exports/{case['character']}.character.zip").read_bytes())
        for metadata in [theme, pack.m, pack.c]:
            assert not re.search(r"pixel[-_]storybook[^\"\n]*(?:v3|r3|@3)", json.dumps(metadata), re.I)
        assert pack.m == case["manifest"]
        assert pack.m["schemaVersion"] == 4 and pack.m["scale"]["pixelArt"] and pack.m["scale"]["integerOnly"]
        expected_actions = {"idle", "walk", "run"} if case["character"] == "male" else {"idle", "walk"}
        assert set(pack.m["animations"]) == expected_actions
        assert pack.m["facing"] == {"native": "right", "right": "none", "left": "mirror-x"}
        assert (pack.m["spritesheet"]["frameWidth"], pack.m["spritesheet"]["frameHeight"]) == (176, 266)
        assert pack.m["anchor"]["x"] == 88 and pack.m["anchor"]["y"] == 250
        alpha_values = set()
        for fid in pack.frames:
            image = pack.frame(fid)
            assert image.mode == "RGBA" and image.size == (176, 266) and image.getbbox()
            alpha_values.update(np.unique(np.asarray(image)[:, :, 3]).tolist())
        assert min(alpha_values) == 0 and max(alpha_values) == 255
        result["packs"].append({"file": row["file"], "sha256": row["sha256"], "allFramesDecoded": True, "frames": len(pack.frames), "nativeSize": [176, 266], "alphaValues": sorted(alpha_values), "exactImportedBytes": True})
    assert set(packs) == {f"{character}-{variant}" for character in ["male", "female"] for variant in ["detail", "compact"]}
    for row in capture["downloads"]:
        path = ROOT / row["file"]
        if row["kind"] == "frame":
            expected = packs[row["key"]].frame(row["frameId"])
            if row["facing"] == "left":
                expected = ImageOps.mirror(expected)
            with Image.open(path) as image:
                image.load()
                assert image.mode == "RGBA" and image.size == expected.size and image.tobytes() == expected.tobytes(), path
            result["pngs"].append({"file": row["file"], "nativeRgbaExact": True, "action": row["action"], "facing": row["facing"], "position": row["position"]})
        elif row["kind"] == "gif":
            result["gifs"].append(old.check_gif(path, packs[row["key"]], row["action"], row["facing"]))
        elif row["kind"] == "session":
            with zipfile.ZipFile(path) as session:
                assert session.testzip() is None
                document = json.loads(session.read("session.json"))
                assert document["selection"] == row["selection"]
                assert {entry["key"] for entry in document["themes"]} == set(row["themeKeys"])
                assert len(document["themes"]) == 2
                for entry in document["themes"]:
                    data = session.read(entry["file"])
                    assert sha(data) == entry["sha256"]
                    matching = next(case for case in cases.values() if case["themeKey"] == entry["key"])
                    assert data == (ROOT / matching["themeFile"]).read_bytes()
                    old.verify_theme(data)
            result["sessions"].append({"file": row["file"], "bothExactVariantsDecoded": True, "selectionRetained": True})
    assert len(result["pngs"]) == 180 and len(result["gifs"]) == 8 and len(result["sessions"]) == 2
    for case in cases.values():
        key, action = case["key"], case["action"]
        pack = packs[key]
        for facing in ["right", "left"]:
            frame_rows = [row for row in capture["downloads"] if row["kind"] == "frame" and row["key"] == key and row["action"] == action and row["facing"] == facing]
            assert [row["position"] for row in frame_rows] == list(range(len(pack.m["animations"][action]["frames"])))
            assert [row["frameId"] for row in frame_rows] == pack.m["animations"][action]["frames"]
            timeline = next(row for row in capture["timeline"] if row["key"] == key and row["facing"] == facing)
            assert [row["frameId"] for row in timeline["observed"]] == pack.m["animations"][action]["frames"]
            for field, animation in [("playback", action), ("idleChecks", "idle")]:
                playback = next(row for row in capture[field] if row["key"] == key and row["facing"] == facing)
                clip = pack.m["animations"][animation]
                assert playback["startedAfterEditorsClosed"]
                assert {row["position"] for row in playback["observed"]} == set(range(len(clip["frames"])))
                assert all(row["frameId"] == clip["frames"][row["position"]] for row in playback["observed"])
            result["contactSheets"].append(contact_sheet(pack, action, key, facing))
        gif_rows = {row["facing"]: ROOT / row["file"] for row in capture["downloads"] if row["kind"] == "gif" and row["key"] == key}
        old.mirror_gifs(gif_rows["left"], gif_rows["right"])
    for character, action in [("male", "run"), ("female", "walk")]:
        reference = Pack(ROOT / f"docs/kling-themes/evidence/{character}-original-base.character.zip")
        r2 = Pack(ROOT / f"docs/kling-theme-stability/evidence/{character}-pixel-v2-base.character.zip")
        detail, compact = packs[f"{character}-detail"], packs[f"{character}-compact"]
        original_clip = reference.m["animations"][action]
        approved_source = ROOT / f"docs/kling-motion/exports/{character}.character.zip"
        # The historical ordinary pack is an exact retained export of this
        # approved source. Verify all members so historical evidence cannot
        # silently substitute a different pose bank.
        with zipfile.ZipFile(approved_source) as approved:
            assert set(approved.namelist()) == set(reference.zip.namelist())
            for name in approved.namelist():
                assert approved.read(name) == reference.zip.read(name)
        assert original_clip["fps"] == 24 and len(original_clip["frames"]) == (16 if character == "male" else 27)
        for pack in [detail, compact]:
            assert pack.m["animations"][action] == original_clip, "Every source position, hold and FPS must survive unchanged."
            for animation in pack.m["animations"]:
                assert pack.m["animations"][animation] == reference.m["animations"][animation]
            # Preserve every projected alpha value: no threshold or silent
            # opacity change. This independent calculation does not import the
            # authoring projection implementation.
            divisor = 4 if pack is detail else 8
            for fid in pack.frames:
                source_alpha = np.asarray(reference.frame(fid))[:, :, 3]
                padded = np.pad(source_alpha, ((2, 6), (0, 0)))
                sums = padded.astype(np.uint64).reshape(1064 // divisor, divisor, 704 // divisor, divisor).sum(axis=(1, 3))
                projected = ((sums * 2 + divisor * divisor) // (divisor * divisor * 2)).astype(np.uint8)
                if divisor == 8:
                    projected = np.repeat(np.repeat(projected, 2, axis=0), 2, axis=1)
                assert np.array_equal(np.asarray(pack.frame(fid))[:, :, 3], projected), (pack.path, fid, "Projected alpha changed")
        result["sourceTimelines"].append({"character": character, "action": action, "source": relative(reference.path), "sourceSha256": sha(reference.path.read_bytes()), "approvedSource": relative(approved_source), "approvedSourceSha256": sha(approved_source.read_bytes()), "allSourceArchiveMembersExact": True, "allProjectedAlphaBytesExact": True, "frames": original_clip["frames"], "positions": len(original_clip["frames"]), "uniqueDrawings": len(set(original_clip["frames"])), "fps": 24, "exactInBothVariants": True})
        assert len(r2.m["animations"][action]["frames"]) == 8 and r2.m["animations"][action]["fps"] == (12 if character == "male" else 8)
        for facing in ["right", "left"]:
            result["presentations"].append(comparison([reference, r2, detail], ["Original / historical UI export", "R2 / historical UI export", "Source detail / new UI export"], action, character, facing, "original-r2-detail", [Fraction(1, 2), 2, 2], Fraction(2, 3) if character == "male" else Fraction(9, 1)))
            result["presentations"].append(comparison([detail, compact], ["Detail / 176x266 pixel grid", "Compact / 88x133 grid doubled"], action, character, facing, "detail-compact", [2, 2], Fraction(len(original_clip["frames"]), 24)))
        reference.close()
        r2.close()
    for path in sorted(OUT.glob("*.png")):
        with Image.open(path) as image:
            image.load()
            assert min(image.size) > 0
        if path.name.endswith(("-workspace.png", "-independent.png")):
            result["screenshots"].append({"file": relative(path), "sha256": sha(path.read_bytes())})
    assert len(result["screenshots"]) == 8
    for pack in packs.values():
        pack.close()
    result["passed"] = True
    (STUDY / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"passed": True, **{name: len(value) for name, value in result.items() if isinstance(value, list)}}))


if __name__ == "__main__":
    main()
