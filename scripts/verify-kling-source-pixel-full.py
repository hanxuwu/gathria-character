#!/usr/bin/env python3
"""Verify real Source pixel UI exports against approved original RGBA.

All four source banks are independently projected and palette-mapped here.
Presentation GIFs only matte, mirror, uniformly scale and align declared anchors.
They use each clip's native clock; no body fitting or frame interpolation occurs.
"""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import re
import zipfile

import numpy as np
from PIL import GifImagePlugin, Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / os.environ.get("KLING_SOURCE_PIXEL_FULL_DIR", "docs/kling-source-pixel-full")
EVIDENCE = OUTPUT / "evidence"
REVIEW = OUTPUT / "review"
ARTWORK = ROOT / "artwork/kling-source-pixel-full"
ACTIONS = ["idle", "walk", "run", "jump", "celebrate"]
FACINGS = ["right", "left"]
MATTE = (238, 233, 223)
INK = (40, 60, 53)
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
spec = importlib.util.spec_from_file_location("theme_verify", ROOT / "scripts/verify-kling-themes.py")
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
Pack = old.helpers.Pack


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path):
    return str(path.relative_to(ROOT))


def json_file(path):
    return json.loads(path.read_bytes())


def timings(fps, count):
    return [(math.floor((i + 1) * 100 / fps + .5) - math.floor(i * 100 / fps + .5)) * 10 for i in range(count)]


def project_rgba(image, look_id, colors):
    """Independent fixed-grid BOX + exact nearest-palette implementation.

    Sum the sixteen pixel phases directly rather than importing authoring code.
    Rounding uses integers, including ties and projected zero-alpha cleanup.
    """
    padding = (32, 130, 32, 6) if look_id == "base" else (0, 2, 0, 6)
    left, top, right, bottom = padding
    assert image.size == ((704, 1056) if look_id == "base" else (768, 1184))
    padded = np.pad(np.asarray(image), ((top, bottom), (left, right), (0, 0)))
    assert padded.shape == (1192, 768, 4)
    total_alpha = np.zeros((298, 192), dtype=np.uint64)
    weighted_rgb = np.zeros((298, 192, 3), dtype=np.uint64)
    for y in range(4):
        for x in range(4):
            sample = padded[y::4, x::4].astype(np.uint64)
            total_alpha += sample[:, :, 3]
            weighted_rgb += sample[:, :, :3] * sample[:, :, 3, None]
    projected = np.zeros((298, 192, 4), dtype=np.uint8)
    projected[:, :, 3] = (total_alpha * 2 + 16) // 32
    denominator = np.maximum(total_alpha * 2, 1)[:, :, None]
    projected[:, :, :3] = (weighted_rgb * 2 + total_alpha[:, :, None]) // denominator
    visible = projected[:, :, 3] != 0
    unique, inverse = np.unique(projected[:, :, :3][visible], axis=0, return_inverse=True)
    palette = np.asarray(colors, dtype=np.int32)
    assignments = np.empty((len(unique), 3), dtype=np.uint8)
    for first in range(0, len(unique), 1024):
        values = unique[first:first + 1024].astype(np.int32)
        distances = np.sum((values[:, None] - palette[None]) ** 2, axis=2)
        assignments[first:first + len(values)] = palette[np.argmin(distances, axis=1)]
    projected[:, :, :3][visible] = assignments[inverse]
    projected[~visible] = 0
    return Image.fromarray(projected)


def stream_gif(path, frame_at, count, fps, loop):
    """One common palette; only thumbnails and one full indexed frame in RAM."""
    indices = sorted({round(i * (count - 1) / max(1, min(23, count - 1))) for i in range(min(24, count))})
    sample = Image.new("RGB", (480, 192 * len(indices)), MATTE)
    for row, index in enumerate(indices):
        thumbnail = frame_at(index).convert("RGB")
        thumbnail.thumbnail((480, 192), Image.Resampling.BOX)
        sample.paste(thumbnail, (0, row * 192))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    del sample
    durations = timings(fps, count)
    with path.open("wb") as target:
        for index in range(count):
            frame = frame_at(index).convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
            if index == 0:
                info = {"optimize": False}
                if loop:
                    info["loop"] = 0
                header, _ = GifImagePlugin.getheader(frame, info=info)
                for chunk in header:
                    target.write(chunk)
            for chunk in GifImagePlugin.getdata(frame, duration=durations[index], disposal=1, include_color_table=False):
                target.write(chunk)
        target.write(b";")
    with Image.open(path) as gif:
        assert gif.n_frames == count and (gif.info.get("loop") == 0) == loop
        for index, duration in enumerate(durations):
            gif.seek(index)
            gif.load()
            assert gif.info["duration"] == duration
        size = list(gif.size)
    return {"file": rel(path), "sha256": file_sha(path), "bytes": path.stat().st_size,
            "frames": count, "size": size, "durationsMs": durations,
            "totalDurationMs": sum(durations), "loop": loop}


def five_action_board(pack, case, facing):
    """A finite six-second window: looping clips loop, jump holds its last pose."""
    width, height, zoom, gap, caption = 192, 298, 1, 10, 76
    clips = [pack.m["animations"][action] for action in ACTIONS]
    assert {clip["fps"] for clip in clips} == {24}
    count, fps = 144, 24
    banks = {}
    for fid in {fid for clip in clips for fid in clip["frames"]}:
        image = pack.frame(fid)
        if facing == "left":
            image = ImageOps.mirror(image)
        banks[fid] = old.helpers.matte(image, MATTE)
    mapping = []
    for tick in range(count):
        positions = [tick % len(clip["frames"]) if clip["loop"] else min(tick, len(clip["frames"]) - 1) for clip in clips]
        mapping.append({"tick": tick, "positions": positions, "frameIds": [clip["frames"][position] for clip, position in zip(clips, positions)]})

    def frame_at(tick):
        board = Image.new("RGB", (width * len(ACTIONS) + gap * (len(ACTIONS) - 1), height + caption), MATTE)
        draw = ImageDraw.Draw(board)
        for column, (action, clip, fid) in enumerate(zip(ACTIONS, clips, mapping[tick]["frameIds"])):
            x = column * (width + gap)
            board.paste(banks[fid], (x, caption))
            draw.text((x + 4, 3), f"{case['character']} {case['lookId']} / {facing}", font=FONT, fill=INK)
            draw.text((x + 4, 21), f"{action}: {len(clip['frames'])} at 24 FPS", font=FONT, fill=INK)
            draw.text((x + 4, 39), "192x298 / exact native 1x", font=FONT, fill=INK)
            draw.text((x + 4, 57), "6 s window; " + ("native loop" if clip["loop"] else "jump holds final"), font=FONT, fill=INK)
        return board

    path = REVIEW / f"{case['key']}-five-actions-{facing}.gif"
    artifact = stream_gif(path, frame_at, count, fps, False)
    still = path.with_suffix(".png")
    frame_at(0).save(still)
    return {**artifact, "kind": "five-action-board", "still": rel(still), "source": rel(pack.path),
            "sourceSha256": file_sha(pack.path), "actions": ACTIONS, "facing": facing,
            "displayScale": zoom, "nativeClock": True, "retimed": False, "mapping": mapping,
            "note": "Finite non-looping six-second presentation. Looping source clips use their own native clocks; jump runs once and holds. This board is a presentation, not an app export."}


def source_comparison(reference, pixel, character, action):
    """Historical original at uniform half scale, pixel at exact integer 2x."""
    clip = pixel.m["animations"][action]
    assert reference.m["animations"][action] == clip
    packs, scales = [reference, pixel], [.5, 2]
    sizes = [(round(pack.m["spritesheet"]["frameWidth"] * scale), round(pack.m["spritesheet"]["frameHeight"] * scale)) for pack, scale in zip(packs, scales)]
    anchors = [(round(pack.m["anchor"]["x"] * scale), round(pack.m["anchor"]["y"] * scale)) for pack, scale in zip(packs, scales)]
    left = max(anchor[0] for anchor in anchors)
    right = max(size[0] - anchor[0] for size, anchor in zip(sizes, anchors))
    above = max(anchor[1] for anchor in anchors)
    below = max(size[1] - anchor[1] for size, anchor in zip(sizes, anchors))
    width, height, gap, caption = left + right, above + below, 12, 82
    banks = []
    for pack, size in zip(packs, sizes):
        banks.append({fid: pack.frame(fid).resize(size, Image.Resampling.NEAREST if pack.m["scale"]["pixelArt"] else Image.Resampling.BOX) for fid in dict.fromkeys(clip["frames"])})

    def frame_at(position):
        board = Image.new("RGBA", (width * 2 + gap, height + caption), (*MATTE, 255))
        draw = ImageDraw.Draw(board)
        fid = clip["frames"][position]
        for column, (pack, bank, anchor, scale, label) in enumerate(zip(packs, banks, anchors, scales, ["Original / retained prior UI export", "Source pixel / new production UI export"])):
            x = column * (width + gap)
            board.alpha_composite(bank[fid], (x + left - anchor[0], caption + above - anchor[1]))
            draw.text((x + 5, 4), label, font=FONT, fill=INK)
            draw.text((x + 5, 24), f"{character} BASE / {action} right", font=FONT, fill=INK)
            sheet = pack.m["spritesheet"]
            draw.text((x + 5, 44), f"{sheet['frameWidth']}x{sheet['frameHeight']} native / uniform {scale:g}x", font=FONT, fill=INK)
            draw.text((x + 5, 64), f"Position {position} / source {fid} / 24 FPS", font=FONT, fill=INK)
        return board.convert("RGB")

    path = REVIEW / f"{character}-base-{action}-original-source-pixel-right.gif"
    artifact = stream_gif(path, frame_at, len(clip["frames"]), clip["fps"], clip["loop"])
    still = path.with_suffix(".png")
    frame_at(0).save(still)
    return {**artifact, "kind": "original-source-pixel", "still": rel(still), "character": character,
            "action": action, "facing": "right", "sourceFrameIds": clip["frames"], "fps": clip["fps"],
            "sources": [{"file": rel(pack.path), "sha256": file_sha(pack.path)} for pack in packs],
            "displayScales": scales, "alignedAnchor": [left, caption + above], "retimed": False,
            "note": "Original is a retained historical UI export; pixel is this capture's export. Whole canvases are uniformly scaled and declared anchors aligned. Padding never alters body proportions."}


def verify_source_projection(pack, case, input_row, colors):
    source_path = ROOT / input_row["file"]
    assert file_sha(source_path) == input_row["sha256"]
    reference_path = ROOT / f"docs/kling-themes/evidence/{case['character']}-original-{case['lookId']}.character.zip"
    source = Pack(source_path)
    with zipfile.ZipFile(reference_path) as historical:
        assert set(historical.namelist()) == set(source.zip.namelist())
        for name in historical.namelist():
            assert historical.read(name) == source.zip.read(name), (source_path, name, "Historical reference must match approved source")
    assert pack.m["animations"] == source.m["animations"], "Every source action, position, hold, FPS and loop flag must survive."
    assert set(pack.frames) == set(source.frames), "All native support cells must remain in the pack."
    assert pack.c["derivation"] == source.c["derivation"], "Original frame derivation must remain exact."
    for key, value in source.c["sourceMetadata"].items():
        assert pack.c["sourceMetadata"][key] == value, (case["key"], key, "Original motion/source metadata changed")
    processing = pack.c["sourceMetadata"]["sourcePixelFull"]
    assert pack.c["source"] == {"kind": "unified-archive", "name": input_row["file"], "sha256": input_row["sha256"]}
    assert processing["sourcePack"] == input_row["file"] and processing["sourceSha256"] == input_row["sha256"]
    assert processing["sourceDivisor"] == 4 and processing["nativeFrame"] == [192, 298]
    assert processing["paddedSourceSize"] == [768, 1192]
    assert processing["paletteSha256"] == file_sha(ARTWORK / "palette.json")
    expected_anchor = {"x": 96, "y": 282, "units": "pixels", "origin": "top-left"}
    assert pack.m["anchor"] == expected_anchor
    padding = {"left": 32, "top": 130, "right": 32, "bottom": 6} if case["lookId"] == "base" else {"left": 0, "top": 2, "right": 0, "bottom": 6}
    actual_padding = input_row.get("padding")
    if actual_padding is not None:
        assert actual_padding == padding
    assert processing["sourcePadding"] == padding
    assert processing["bodyTransform"] == {"scaleNumerator": 1, "scaleDenominator": 4,
                                            "translateSourcePixels": [padding["left"], padding["top"]]}
    exact, source_hashes, output_hashes = [], {}, {}
    for fid in pack.frames:
        native = source.frame(fid)
        source_hashes[fid] = sha(native.tobytes())
        assert source_hashes[fid] == input_row["nativePixelSha256"][str(fid)]
        projected = project_rgba(native, case["lookId"], colors)
        actual = pack.frame(fid)
        assert actual.tobytes() == projected.tobytes(), (case["key"], fid, "RGBA differs from fixed source projection + shared palette")
        output_hashes[fid] = sha(actual.tobytes())
        exact.append({"frameId": fid, "rgbaSha256": output_hashes[fid], "alphaSha256": sha(actual.getchannel("A").tobytes())})
    unique_poses = {}
    for action, clip in source.m["animations"].items():
        native_count = len({source_hashes[fid] for fid in clip["frames"]})
        output_count = len({output_hashes[fid] for fid in clip["frames"]})
        assert native_count == output_count, (case["key"], action, "Unique source pose collapsed")
        unique_poses[action] = {"positions": len(clip["frames"]), "uniqueNativeSourceRgba": native_count,
                                "uniqueOutputRgba": output_count, "fps": clip["fps"], "loop": clip["loop"]}
    source.close()
    return {"key": case["key"], "source": rel(source_path), "sourceSha256": input_row["sha256"],
            "historicalReference": rel(reference_path), "historicalReferenceSha256": file_sha(reference_path),
            "allHistoricalArchiveMembersExact": True, "allAnimationsExact": True,
            "originalDerivationAndMotionMetadataExact": True, "sourcePadding": padding,
            "uniformDivisor": 4, "nativeSize": [192, 298], "anchor": expected_anchor,
            "allProjectedRgbaExact": True, "allProjectedAlphaExact": True,
            "uniquePoses": unique_poses, "frames": exact}


def main():
    REVIEW.mkdir(parents=True, exist_ok=True)
    capture_bytes = (EVIDENCE / "capture.json").read_bytes()
    capture = json.loads(capture_bytes)
    assert capture["passed"] and capture["production"]
    assert capture["originalCatalogUnchanged"] and capture["defaultSelectionUnchanged"]
    for field in ["errors", "failedRequests", "externalRequests", "independentEditorRequests"]:
        assert not capture[field], field
    assert len(capture["cases"]) == 4 and len(capture["defaults"]) == 2
    assert len(capture["timeline"]) == 40 and len(capture["playback"]) == 40
    assert len(capture["sessions"]) == 2 and capture["editorsClosedAt"]
    assert len(capture["comparisonPlayback"]) == 4
    assert len(capture["jumpReturns"]) == 8 and len(capture["switches"]) == 12
    for row in capture["defaults"]:
        assert row["originalSelected"] and row["sourcePixelOptIn"] and row["lookId"] == "base"
        assert row["themeKey"] == f"{row['character']}:kling-original@1"
    for row in capture["switches"]:
        if row["kind"] == "original-to-source":
            assert row["phaseRetained"] and row["fromPosition"] == row["toPosition"] == 6
        elif row["kind"] == "source-r2-source":
            assert row["phaseRetained"] and row["positions"] == [6, 3, 6]
        elif row["kind"] == "look-endpoint":
            assert row["endpointRetained"] and row["paused"] and row["position"] == 38
        else:
            assert row["kind"] == "playing-look" and row["playbackContinued"]
    for file, digest in {**capture["sourceHashes"], **capture["assetHashes"], **capture["protectedHashes"]}.items():
        assert file_sha(ROOT / file) == digest, (file, "Changed after capture")
    index = json_file(ARTWORK / "index.json")
    palette_path = ARTWORK / "palette.json"
    palette = json_file(palette_path)
    colors = palette["colors"]
    assert len(colors) == 128 and all(len(color) == 3 and all(0 <= value <= 255 for value in color) for color in colors)
    assert index["palette"]["sha256"] == file_sha(palette_path)
    inputs = {(row["character"], row.get("look", row.get("lookId"))): row for row in index["inputs"]}
    prepared_outputs = {(row["character"], row["look"]): row for row in index["outputs"]}
    cases = {row["key"]: row for row in capture["cases"]}
    assert set(cases) == {f"{character}-{look}" for character in ["male", "female"] for look in ["base", "wedding"]}
    result = {"passed": False, "captureSha256": sha(capture_bytes), "capturedCommit": capture["commitAtCapture"],
              "originalCatalogUnchanged": True, "defaultSelectionUnchanged": True,
              "explicitQuarterScaleUiVerified": True,
              "palette": {"file": rel(palette_path), "sha256": file_sha(palette_path), "colors": 128},
              "packs": [], "pngs": [], "gifs": [], "sessions": [], "coverage": [], "sourceVerification": [],
              "presentations": [], "screenshots": [],
              "historicalReferenceNote": "Original comparison packs are retained actual prior UI exports, proved byte-for-byte equivalent by ZIP member to approved source inputs. New Source pixel packs, native PNGs and GIFs are this production UI capture's downloads.",
              "timingNote": "Native clip tables remain exact at 24 FPS, including held positions. GIF delays use cumulative centisecond rounding; this format approximation does not retime pack playback."}
    packs = {}
    for row in capture["downloads"]:
        path = ROOT / row["file"]
        assert path.stat().st_size == row["bytes"] and file_sha(path) == row["sha256"]
        if row["kind"] != "pack":
            continue
        case = cases[row["key"]]
        pack = Pack(path)
        packs[row["key"]] = pack
        assert pack.m == case["manifest"]
        assert pack.m["schemaVersion"] == 4 and set(pack.m["animations"]) == set(ACTIONS)
        assert pack.m["scale"]["pixelArt"] and pack.m["scale"]["integerOnly"]
        assert pack.m["facing"] == {"native": "right", "right": "none", "left": "mirror-x"}
        assert (pack.m["spritesheet"]["frameWidth"], pack.m["spritesheet"]["frameHeight"]) == (192, 298)
        prepared = prepared_outputs[(case["character"], case["lookId"])]
        metadata = json_file(ROOT / prepared["metadata"])
        assert prepared["packSha256"] == row["sha256"]
        assert file_sha(ROOT / prepared["pack"]) == row["sha256"]
        assert metadata["manifest"] == pack.m and metadata["processing"] == pack.c["sourceMetadata"]["sourcePixelFull"]
        assert metadata["paletteSha256"] == file_sha(palette_path)
        assert metadata["atlasSha256"] == prepared["atlasSha256"] == file_sha(ROOT / prepared["atlas"])
        assert sha(pack.zip.read(pack.m["spritesheet"]["file"])) == prepared["atlasSha256"]
        theme_path = ROOT / case["themeFile"]
        theme = old.verify_theme(theme_path.read_bytes())
        assert theme["id"] == "kling-source-pixel" and theme["revision"] == 1 and theme["rendering"] == "pixel"
        assert {look["logicalId"] for look in theme["looks"]} == {"base", "wedding"}
        selected = next(look for look in theme["looks"] if look["logicalId"] == case["lookId"])
        with zipfile.ZipFile(theme_path) as archive:
            assert archive.read(selected["file"]) == path.read_bytes()
        for metadata in [theme, pack.m, pack.c]:
            assert not re.search(r"pixel[-_]storybook[^\"\n]*(?:v3|r3|@3)", json.dumps(metadata), re.I)
        for fid in pack.frames:
            frame = pack.frame(fid)
            assert frame.mode == "RGBA" and frame.size == (192, 298) and frame.getchannel("A").getbbox()
            assert frame.getchannel("A").getextrema() == (0, 255)
        result["packs"].append({"file": row["file"], "sha256": row["sha256"], "allFramesDecoded": True,
                                "frameCount": len(pack.frames), "nativeSize": [192, 298], "exactPublishedLookBytes": True})
    assert len(packs) == 4
    for row in capture["comparisonPlayback"]:
        clip = packs[row["key"]].m["animations"][row["action"]]
        assert row["exactSourceTimeline"] and row["action"] == "run"
        assert row["geometry"] == [
            {"testId": "theme-preview", "backing": [192, 298], "display": ["384px", "596px"], "sampling": "nearest"},
            {"testId": "theme-reference", "backing": [384, 596], "display": ["384px", "596px"], "sampling": "smooth"},
        ], "Actual comparison canvases must preserve fixed quarter scale and common padding."
        assert {sample["position"] for sample in row["observed"]} == set(range(len(clip["frames"])))
        for sample in row["observed"]:
            assert sample["position"] == sample["originalPosition"]
            assert sample["frameId"] == sample["originalFrameId"] == clip["frames"][sample["position"]]
    for row in capture["downloads"]:
        path = ROOT / row["file"]
        if row["kind"] == "frame":
            pack = packs[row["key"]]
            assert pack.m["animations"][row["action"]]["frames"][row["position"]] == row["frameId"]
            expected = pack.frame(row["frameId"])
            if row["facing"] == "left":
                expected = ImageOps.mirror(expected)
            with Image.open(path) as actual:
                actual.load()
                assert actual.mode == "RGBA" and actual.size == expected.size and actual.tobytes() == expected.tobytes(), path
            result["pngs"].append({"file": row["file"], "nativeRgbaExact": True, "frameId": row["frameId"], "facing": row["facing"]})
        elif row["kind"] == "gif":
            result["gifs"].append(old.check_gif(path, packs[row["key"]], row["action"], row["facing"]))
        elif row["kind"] == "session":
            with zipfile.ZipFile(path) as archive:
                assert archive.testzip() is None
                document = json.loads(archive.read("session.json"))
                assert document["selection"] == row["selection"]
                assert len(document["themes"]) == 1
                assert {entry["key"] for entry in document["themes"]} == set(row["themeKeys"])
                entry = document["themes"][0]
                data = archive.read(entry["file"])
                assert sha(data) == entry["sha256"]
                case = next(case for case in cases.values() if case["themeKey"] == entry["key"])
                assert data == (ROOT / case["themeFile"]).read_bytes()
                theme = old.verify_theme(data)
                assert {look["logicalId"] for look in theme["looks"]} == {"base", "wedding"}
            result["sessions"].append({"file": row["file"], "exactThemeAndBothLooksDecoded": True, "selectionRetained": True})
    assert len(result["gifs"]) == 40 and len(result["sessions"]) == 2
    for key, case in cases.items():
        pack = packs[key]
        referenced = {fid for clip in pack.m["animations"].values() for fid in clip["frames"]}
        for facing in FACINGS:
            rows = [row for row in capture["downloads"] if row["kind"] == "frame" and row["key"] == key and row["facing"] == facing]
            assert {row["frameId"] for row in rows} == referenced
            assert len(rows) == len(referenced), "Native frame downloads should cover each unique referenced source cell once per facing."
        for action in ACTIONS:
            clip = pack.m["animations"][action]
            assert clip["fps"] == 24
            for facing in FACINGS:
                timeline = next(row for row in capture["timeline"] if row["key"] == key and row["action"] == action and row["facing"] == facing)
                assert [row["position"] for row in timeline["observed"]] == list(range(len(clip["frames"])))
                assert [row["frameId"] for row in timeline["observed"]] == clip["frames"]
                playback = next(row for row in capture["playback"] if row["key"] == key and row["action"] == action and row["facing"] == facing)
                assert playback["startedAfterEditorsClosed"]
                samples = [sample for sample in playback["observed"] if sample["action"] == action]
                assert {sample["position"] for sample in samples} == set(range(len(clip["frames"])))
                for sample in playback["observed"]:
                    assert sample["frameId"] == pack.m["animations"][sample["action"]]["frames"][sample["position"]]
                if clip["loop"]:
                    assert playback["completion"] == "loop-wrap" and not playback["motionFlow"]
                    assert any(sample["position"] < samples[index - 1]["position"] for index, sample in enumerate(samples) if index)
                else:
                    assert playback["completion"] == "hold-final-frame" and not playback["motionFlow"]
                    assert any(sample["position"] == len(clip["frames"]) - 1 for sample in samples)
                    assert samples[-1]["position"] == len(clip["frames"]) - 1
                    returned = next(row for row in capture["jumpReturns"] if row["key"] == key and row["facing"] == facing)
                    assert returned["startedAfterEditorsClosed"] and returned["motionFlow"]
                    assert returned["completion"] == "return-to-idle-after-recovery"
                    jump_samples = [sample for sample in returned["observed"] if sample["action"] == "jump"]
                    assert {sample["position"] for sample in jump_samples} == set(range(len(clip["frames"])))
                    first_idle = next(index for index, sample in enumerate(returned["observed"]) if sample["action"] == "idle")
                    assert any(sample["position"] == len(clip["frames"]) - 1 for sample in returned["observed"][:first_idle])
                    for sample in returned["observed"]:
                        assert sample["frameId"] == pack.m["animations"][sample["action"]]["frames"][sample["position"]]
            gifs = {row["facing"]: ROOT / row["file"] for row in capture["downloads"] if row["kind"] == "gif" and row["key"] == key and row["action"] == action}
            assert set(gifs) == set(FACINGS)
            old.mirror_gifs(gifs["left"], gifs["right"])
        result["coverage"].append({"key": key, "allFiveTimelinesObservedBothDirections": True,
                                   "allUniqueTimelineCellsExportedBothDirections": True, "referencedFrames": sorted(referenced),
                                   "supportFramesDecodedAndSourceVerifiedInPack": sorted(set(pack.frames) - referenced)})
        result["sourceVerification"].append(verify_source_projection(pack, case, inputs[(case["character"], case["lookId"])], colors))
        for facing in FACINGS:
            result["presentations"].append(five_action_board(pack, case, facing))
    for character in ["male", "female"]:
        reference = Pack(ROOT / f"docs/kling-themes/evidence/{character}-original-base.character.zip")
        for action in ["walk", "run", "jump"]:
            result["presentations"].append(source_comparison(reference, packs[f"{character}-base"], character, action))
        reference.close()
    for path in sorted(EVIDENCE.glob("*.png")):
        with Image.open(path) as image:
            image.load()
            assert min(image.size) > 0
        if path.name.endswith(("-workspace.png", "-comparison.png", "-independent.png")):
            result["screenshots"].append({"file": rel(path), "sha256": file_sha(path)})
    assert len(result["screenshots"]) == 12
    assert len(result["presentations"]) == 14
    for pack in packs.values():
        pack.close()
    result["passed"] = True
    (OUTPUT / "validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"passed": True, **{key: len(value) for key, value in result.items() if isinstance(value, list)}}))


if __name__ == "__main__":
    main()
