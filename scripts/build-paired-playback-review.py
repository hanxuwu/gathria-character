#!/usr/bin/env python3
"""Replay measured browser frame-ID cadence using the unchanged exported atlas.

This is a diagnostic reconstruction, not a screen recording or a new application
GIF export. A common 20ms presentation grid avoids the sub-20ms delay clamping
used by many GIF viewers. Original observation timestamps remain in provenance.
"""
import argparse
from bisect import bisect_right
import hashlib
import json
import math
from pathlib import Path
import zipfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MATTE = (238, 233, 223)
INK = (43, 61, 52)
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
try:
    FONT = ImageFont.truetype(FONT_PATH, 12)
    SMALL = ImageFont.truetype(FONT_PATH, 11)
except OSError:
    FONT = SMALL = ImageFont.load_default()


def digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as file:
        for chunk in iter(lambda: file.read(65536), b""):
            value.update(chunk)
    return value.hexdigest()


def trace_row(document, character):
    matches = [row for row in document["results"]
               if row["character"] == character and row["view"] == "original"
               and row["cpuRate"] == 4]
    assert len(matches) == 1, "Expected one original-view CPU4 sample"
    samples = matches[0]["samples"]
    assert all(s["view"] == "original" and s["action"] == "run" for s in samples)
    assert all(b["at"] > a["at"] for a, b in zip(samples, samples[1:]))
    return matches[0]


def align(before, after, duration):
    # Select by chronology only, never by the largest performance difference.
    for old_index, old in enumerate(before):
        if before[-1]["at"] - old["at"] < duration:
            break
        for new_index, new in enumerate(after):
            if new["id"] == old["id"] and after[-1]["at"] - new["at"] >= duration:
                return (old_index, new_index)
    raise AssertionError("No shared starting drawing with a full observed window")


def load_frames(pack, ids, character):
    result, page_hashes = {}, {}
    receipt_path = ROOT / f"docs/kling-landing-run/review/{character}/original.character.zip.receipt.json"
    receipt = json.loads(receipt_path.read_text())
    pack_hash = digest(pack)
    assert pack_hash == receipt["sha256"], "Atlas source must match the actual archived download"
    with zipfile.ZipFile(pack) as archive:
        manifest_bytes = archive.read("manifest.json")
        manifest = json.loads(manifest_bytes)
        definitions = {frame["id"]: frame for frame in manifest["frames"]}
        assert ids <= set(manifest["animations"]["run"]["frames"])
        sheets = [manifest["spritesheet"], *manifest.get("additionalSheets", [])]
        for page in sorted({definitions[frame].get("page", 0) for frame in ids}):
            filename = sheets[page]["file"]
            with archive.open(filename) as source:
                page_hashes[filename] = hashlib.file_digest(source, "sha256").hexdigest()
            with archive.open(filename) as source, Image.open(source) as png:
                sheet = png.convert("RGBA")
            for frame_id in sorted(ids):
                frame = definitions[frame_id]
                if frame.get("page", 0) != page:
                    continue
                x, y, width, height = (frame[key] for key in ("x", "y", "width", "height"))
                result[frame_id] = sheet.crop((x, y, x + width, y + height))
            sheet.close()
    assert len({image.size for image in result.values()}) == 1
    return result, {
        "file": str(pack), "sha256": pack_hash,
        "committedDownloadReceipt": str(receipt_path.relative_to(ROOT)),
        "committedDownloadReceiptSha256": digest(receipt_path),
        "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
        "atlasPageSha256": page_hashes,
        "frameRgbaSha256": {str(key): hashlib.sha256(value.tobytes()).hexdigest()
                            for key, value in result.items()},
        "anchor": manifest["anchor"],
        "provenance": "Actual previously downloaded composed CharacterPack; shared by both panels.",
    }


def display_frames(frames, max_height):
    boxes = [image.getchannel("A").getbbox() for image in frames.values()]
    assert all(boxes)
    width, height = next(iter(frames.values())).size
    crop = (max(0, min(b[0] for b in boxes) - 10),
            max(0, min(b[1] for b in boxes) - 10),
            min(width, max(b[2] for b in boxes) + 10),
            min(height, max(b[3] for b in boxes) + 10))
    scale = min(1, max_height / (crop[3] - crop[1]), 180 / (crop[2] - crop[0]))
    size = (round((crop[2] - crop[0]) * scale), round((crop[3] - crop[1]) * scale))
    rendered = {}
    for frame_id, rgba in frames.items():
        display = rgba.crop(crop).resize(size, Image.Resampling.LANCZOS)
        rgb = Image.new("RGB", size, MATTE)
        rgb.paste(display, mask=display.getchannel("A"))
        rendered[frame_id] = rgb
    return rendered, crop, scale


def panel(character, images, ids, pause=False):
    width, height = images[0].size
    panel_width = max(195, width + 12)
    image = Image.new("RGB", (2 * panel_width + 16, height + 108), MATTE)
    draw = ImageDraw.Draw(image)
    draw.text((8, 5), f"{character.title()} / original - browser trace replay", fill=INK, font=FONT)
    draw.text((8, 23), "Simulated CPU 4x; observed IDs on a 20ms grid", fill=INK, font=SMALL)
    for index, (frame, frame_id) in enumerate(zip(images, ids)):
        left = 8 + index * panel_width
        draw.text((left, 43), f"{'Before' if index == 0 else 'After'} / frame {frame_id}",
                  fill=INK, font=FONT)
        image.paste(frame, (left + (panel_width - width) // 2, 63))
    footer = "Review pause - replay follows" if pause else "Trace reconstruction, not video or an app export"
    draw.text((8, height + 79), footer, fill=INK, font=SMALL)
    return image


def save_gif(path, images, durations):
    sheet = Image.new("RGB", (64 * 16, 96 * math.ceil(len(images) / 16)), MATTE)
    for index, image in enumerate(images):
        sheet.paste(image.resize((64, 96), Image.Resampling.BOX),
                    ((index % 16) * 64, (index // 16) * 96))
    palette = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                             dither=Image.Dither.NONE)
    indexed = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                    loop=0, disposal=2, optimize=False)
    with Image.open(path) as check:
        decoded = []
        for index in range(check.n_frames):
            check.seek(index)
            decoded.append(check.info["duration"])
        assert all(value >= 20 and value % 10 == 0 for value in decoded)
        assert sum(decoded) == sum(durations)
    return {"decodedFrames": len(decoded), "decodedDurationsMs": decoded}


def build(args):
    before = json.loads(args.before.read_text())
    after = json.loads(args.after.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    comparisons = []
    for character in ("male", "female"):
        rows = [trace_row(document, character) for document in (before, after)]
        indices = align(rows[0]["samples"], rows[1]["samples"], args.duration_ms)
        windows = []
        for row, index in zip(rows, indices):
            start = row["samples"][index]["at"]
            samples = [{**sample, "relativeMs": sample["at"] - start}
                       for sample in row["samples"][index:]
                       if sample["at"] - start < args.duration_ms]
            windows.append({"firstSampleIndex": index, "originTimestampMs": start,
                            "samples": samples, "fullTraceSamples": len(row["samples"]),
                            "fullTraceWallDurationMs": row["wallDurationMs"]})
        assert windows[0]["samples"][0]["id"] == windows[1]["samples"][0]["id"]
        ids = {sample["id"] for window in windows for sample in window["samples"]}
        frames, source = load_frames(args.packs / character / "original.character.zip", ids, character)
        displays, crop, scale = display_frames(frames, args.panel_height)
        for frame in frames.values():
            frame.close()
        images, durations, events = [], [], []
        times = [[sample["relativeMs"] for sample in window["samples"]] for window in windows]
        for at in range(0, args.duration_ms, 20):
            selected = [window["samples"][bisect_right(timestamps, at) - 1]
                        for window, timestamps in zip(windows, times)]
            frame_ids = [sample["id"] for sample in selected]
            images.append(panel(character, [displays[value] for value in frame_ids], frame_ids))
            durations.append(20)
            events.append({"presentationMs": at, "durationMs": 20, "frameIds": frame_ids,
                           "sourceObservationMs": [sample["relativeMs"] for sample in selected]})
        for column, window in enumerate(windows):
            delays = []
            for sample in window["samples"]:
                times_shown = [event["presentationMs"] for event in events
                               if event["sourceObservationMs"][column] == sample["relativeMs"]]
                assert times_shown, "Presentation grid omitted an observed drawing"
                delay = min(times_shown) - sample["relativeMs"]
                assert 0 <= delay < 20
                delays.append(delay)
            window["presentationAudit"] = {
                "allSelectedObservationsShown": True,
                "maximumPresentationDelayMs": max(delays),
                "observationsInWindow": len(window["samples"]),
            }
        images.append(panel(character, [displays[value] for value in frame_ids], frame_ids, pause=True))
        durations.append(args.pause_ms)
        path = args.output / f"{character}-original-cpu4-trace-before-after.gif"
        decoded = save_gif(path, images, durations)
        comparisons.append({"character": character, "view": "original", "cpuRate": 4,
                            "alignment": "Earliest before sample with a matching after ID and a full observed window; no speed/phase retiming.",
                            "windows": windows, "atlas": source,
                            "presentation": {"file": path.name, "bytes": path.stat().st_size,
                                             "sha256": digest(path), "fixedCrop": crop, "uniformScale": scale,
                                             "durationMs": args.duration_ms, "gridMs": 20,
                                             "quantization": "Latest observed drawing at each grid point; each event is shown less than 20ms late. No 10ms frames, which GIF viewers may clamp.",
                                             "reviewPauseMs": args.pause_ms, "loop": True,
                                             "events": events, **decoded}})
        print(f"{character}: {path.stat().st_size} bytes", flush=True)
    assert sum(row["presentation"]["bytes"] for row in comparisons) < 3_000_000
    (args.output / "trace-provenance.json").write_text(json.dumps({
        "format": "gathria-browser-trace-presentation", "version": 1,
        "scope": "Diagnostic reconstruction from DOM frame-ID observations, not a screen recording, actual app GIF export, mobile-device benchmark or frame-rate guarantee.",
        "before": {"file": str(args.before), "sha256": digest(args.before),
                   "workspaceModuleSha256": before["workspaceModuleSha256"]},
        "after": {"file": str(args.after), "sha256": digest(args.after),
                  "workspaceModuleSha256": after["workspaceModuleSha256"]},
        "artwork": "Both panels share the exact same native atlas frames. Uniform crop, scale, matte and shared 256-color palette are presentation only; no pose retouching or interpolation.",
        "comparisons": comparisons,
    }, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, default=Path("/tmp/motion-continuity/before.json"))
    parser.add_argument("--after", type=Path, default=Path("/tmp/motion-continuity/after.json"))
    parser.add_argument("--packs", type=Path, default=Path("/tmp/landing-run/exports"))
    parser.add_argument("--output", type=Path, default=ROOT / "docs/paired-playback/review")
    parser.add_argument("--duration-ms", type=int, default=2000)
    parser.add_argument("--pause-ms", type=int, default=800)
    parser.add_argument("--panel-height", type=int, default=190)
    args = parser.parse_args()
    assert args.duration_ms >= 1000 and args.duration_ms % 20 == 0
    assert args.pause_ms >= 20 and args.pause_ms % 10 == 0
    build(args)
