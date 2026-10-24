#!/usr/bin/env python3
"""Audit app downloads, then arrange their untouched frames into review GIFs.

No source artwork is generated or repainted. Native packs are temporary audit
inputs; direct action GIFs and PNGs are retained with exact download hashes.
"""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / os.environ.get("KLING_GALLERY_DIR", "docs/kling-combination-gallery")
REVIEW = OUT / "review"
BG = (238, 233, 223)
INK = (43, 67, 57)
ACTIONS = ["idle", "walk", "run", "jump", "celebrate"]
REPEATS = {"idle": 2, "walk": 2, "run": 3, "jump": 1, "celebrate": 2}
FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
SMALL = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
TITLE = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
spec = importlib.util.spec_from_file_location("export_helpers", ROOT / "scripts/verify-kling-look-workflow.py")
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_gif(path):
    images, times = [], []
    with Image.open(path) as gif:
        loop = gif.info.get("loop") == 0
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.load()
            images.append(gif.convert("RGB"))
            times.append(gif.info["duration"])
    return images, times, loop


def tile(image, case, action=None):
    board = Image.new("RGB", (image.width, image.height + 48), BG)
    board.paste(image, (0, 48))
    draw = ImageDraw.Draw(board)
    label = case["title"] + (" / " + action.capitalize() if action else "")
    draw.text((8, 4), label, font=FONT, fill=INK)
    face = "Gentle" if case["face"] else "Original face"
    draw.text((8, 26), f'{case["hairName"]} / {case["color"]} / {face}', font=SMALL, fill=INK)
    return board


def grid(tiles, title, columns):
    w, h = tiles[0].size
    assert all(im.size == (w, h) for im in tiles)
    gap, heading = 12, 44
    rows = math.ceil(len(tiles) / columns)
    result = Image.new("RGB", (w * columns + gap * (columns - 1), h * rows + gap * (rows - 1) + heading), BG)
    draw = ImageDraw.Draw(result)
    draw.text((10, 8), title, fill=INK, font=TITLE)
    for i, im in enumerate(tiles):
        result.paste(im, ((i % columns) * (w + gap), heading + (i // columns) * (h + gap)))
    return result


def write_gif(path, images, times, source_files):
    """One shared palette, no frame interpolation, preserve timed holds."""
    assert len(images) == len(times) and images
    sample_w, sample_h, cols = 80, 100, 8
    samples = Image.new("RGB", (cols * sample_w, math.ceil(len(images) / cols) * sample_h), BG)
    for i, im in enumerate(images):
        # Sample existing colors, not averaged thumbnail colors. Averaging here
        # would invent palette entries and unnecessarily alter the app's GIFs.
        samples.paste(im.resize((sample_w, sample_h), Image.Resampling.NEAREST), ((i % cols) * sample_w, (i // cols) * sample_h))
    palette = samples.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    encoded = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
    encoded[0].save(path, save_all=True, append_images=encoded[1:], duration=times, loop=0, disposal=1, optimize=False)
    del encoded, samples, palette
    # Pillow may coalesce identical adjacent frames. Check every original timed
    # interval against the decoded hold, instead of forcing a redundant frame.
    actual, actual_times, loop = read_gif(path)
    assert loop and sum(actual_times) == sum(times)
    cursor = 0
    remaining = actual_times[0]
    max_error = 0.0
    for expected, duration in zip(images, times):
        assert duration <= remaining
        delta = float(np.abs(np.asarray(expected, dtype=np.int16) - np.asarray(actual[cursor], dtype=np.int16)).mean())
        assert delta < 4.0, (path, cursor, delta)
        max_error = max(max_error, delta)
        remaining -= duration
        if remaining == 0:
            cursor += 1
            if cursor < len(actual):
                remaining = actual_times[cursor]
    assert cursor == len(actual)
    return {"file": str(path.relative_to(ROOT)), "sha256": digest(path), "bytes": path.stat().st_size,
            "size": list(images[0].size), "inputTimelineFrames": len(images), "encodedFrames": len(actual),
            "durationMs": sum(times), "loop": True, "maxPaletteMeanError": max_error,
            "sources": [{"file": str(p.relative_to(ROOT)), "sha256": digest(p)} for p in source_files],
            "presentation": "Added captions; body pixels use decoded direct application GIFs at their original half-native size. No crop, tween, pose generation or retiming."}


def main():
    REVIEW.mkdir(exist_ok=True)
    assert not (OUT / "validation.json").exists(), "Preserve completed gallery validation; choose a fresh directory."
    capture_path = OUT / "capture.json"
    capture = json.loads(capture_path.read_text())
    assert capture["passed"] and len(capture["cases"]) == 8
    for key in ["errors", "failedRequests", "externalRequests"]:
        assert capture[key] == []
    for path, sha in capture["sourceHashes"].items():
        assert digest(ROOT / path) == sha
    for row in capture["downloads"]:
        path = ROOT / row["file"]
        assert path.stat().st_size == row["bytes"] and digest(path) == row["sha256"]
    report = {"captureSha256": digest(capture_path), "sourceHashesStillExact": True,
              "packs": [], "pngs": [], "gifs": [], "mirrors": [], "derived": [], "posters": []}
    loaded = {}
    for case in capture["cases"]:
        pack = helpers.Pack(ROOT / case["pack"])
        assert pack.m == case["manifest"]
        for fid in pack.frames:
            frame = pack.frame(fid)
            assert frame.mode == "RGBA" and frame.getchannel("A").getextrema() == (0, 255)
        report["packs"].append({"id": case["id"], "posesDecoded": len(pack.frames), "sourceTimingsRetained": True})
        # The selected appearance may add canvas padding but source action IDs,
        # frame order, fps and loop flags must be unchanged.
        catalog = json.loads((ROOT / "docs/kling-wardrobe/catalog.json").read_text())
        source_file = next(c["sourceUrl"] for c in catalog["characters"] if c["key"] == case["character"])
        import zipfile
        with zipfile.ZipFile(ROOT / source_file.lstrip("/")) as z:
            source_manifest = json.loads(z.read("manifest.json"))
        assert pack.m["animations"] == source_manifest["animations"]
        assert digest(ROOT / source_file.lstrip("/")) == case["originalSourceSha256"]
        data = {}
        for row in [r for r in capture["downloads"] if r["id"] == case["id"] and r["kind"] != "pack"]:
            path = ROOT / row["file"]
            action, facing = row["action"], row["facing"]
            clip = pack.m["animations"][action]
            if row["kind"] == "png":
                with Image.open(path) as image:
                    image.load()
                    expected = pack.frame(row["frameId"])
                    assert image.mode == "RGBA" and image.size == expected.size and image.tobytes() == expected.tobytes()
                report["pngs"].append({"file": row["file"], "exactToPack": True})
                continue
            frames, times, loop = read_gif(path)
            expected_times = [(math.floor((i + 1) * 100 / clip["fps"] + .5) - math.floor(i * 100 / clip["fps"] + .5)) * 10 for i in range(len(clip["frames"]))]
            assert len(frames) == len(clip["frames"]) and times == expected_times and loop == clip["loop"]
            errors = []
            for image, fid in zip(frames, clip["frames"]):
                native = pack.frame(fid)
                expected = helpers.matte(native, BG).resize((math.ceil(native.width / 2), math.ceil(native.height / 2)), Image.Resampling.BOX)
                if facing == "left":
                    expected = ImageOps.mirror(expected)
                assert image.size == expected.size
                error = float(np.abs(np.asarray(image, dtype=np.int16) - np.asarray(expected, dtype=np.int16)).mean())
                assert error < 4.0, (path, fid, error)
                errors.append(error)
            data[(action, facing)] = (frames, times, path)
            report["gifs"].append({"file": row["file"], "frames": len(frames), "durationMs": sum(times), "loop": loop,
                                   "timingAndFrameOrderExact": True, "maxMeanPaletteError": max(errors)})
        left = data[("run", "left")][0]
        right = data[("run", "right")][0]
        assert all(a.tobytes() == ImageOps.mirror(b).tobytes() for a, b in zip(left, right))
        report["mirrors"].append({"id": case["id"], "all16RunFramesExactMirrors": True})
        pack.close()
        loaded[case["id"]] = data
        images, times, sources = [], [], []
        for action in ACTIONS:
            frames, durations, path = data[(action, "right")]
            sources.append(path)
            for _ in range(REPEATS[action]):
                images.extend(tile(im, case, action) for im in frames)
                times.extend(durations)
        report["derived"].append(write_gif(REVIEW / f'{case["id"]}-five-actions.gif', images, times, sources))
        print(f'Validated and assembled {case["id"]}', flush=True)
        del images
    for character in ["male", "female"]:
        cases = [c for c in capture["cases"] if c["character"] == character]
        assert len(cases) == 4
        images, files = [], []
        reference_times = loaded[cases[0]["id"]][("run", "right")][1]
        for case in cases:
            frames, times, path = loaded[case["id"]][("run", "right")]
            assert times == reference_times
            files.append(path)
        for i in range(len(reference_times)):
            tiles = [tile(loaded[c["id"]][("run", "right")][0][i], c) for c in cases]
            images.append(grid(tiles, f'{character.capitalize()} looks / Run / right / 0.5x', 2))
        report["derived"].append(write_gif(REVIEW / f'{character}-run-gallery.gif', images, reference_times, files))
        images[0].save(REVIEW / f'{character}-run-gallery.png')
        print(f'Assembled {character} running gallery', flush=True)
    tiles = [tile(loaded[c["id"]][("idle", "right")][0][0], c) for c in capture["cases"]]
    board = grid(tiles, "8 Kling combinations / actual application exports / 0.5x", 4)
    board.save(REVIEW / "eight-looks.png")
    for path in REVIEW.glob("*.png"):
        with Image.open(path) as image:
            image.load()
            report["posters"].append({"file": str(path.relative_to(ROOT)), "size": list(image.size), "sha256": digest(path)})
    report["montageSchedule"] = {"repeats": REPEATS, "note": "A labeled review montage, not newly synthesized action transitions. Jump plays once per montage; raw jump GIFs remain one-shot."}
    report["passed"] = True
    (OUT / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: len(v) for k, v in report.items() if isinstance(v, list)}))


if __name__ == "__main__":
    main()
