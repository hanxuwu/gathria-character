#!/usr/bin/env python3
"""Present actual before/after browser GIFs without changing their motion timing.

The comparison is a looping review presentation. Each input remains one-shot;
the shorter panel holds its last drawing, then a labelled review pause is added.
No source files or original downloads are modified.
"""
import argparse
from bisect import bisect_right
import hashlib
import json
import math
from pathlib import Path
import zipfile

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
MATTE = (238, 233, 223)
INK = (43, 61, 52)
try:
    FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
    SMALL = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
except OSError:
    FONT = SMALL = ImageFont.load_default()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_json(path):
    return json.loads(Path(path).read_text())


def decode(path):
    frames, durations, starts = [], [], [0]
    with Image.open(path) as image:
        assert "loop" not in image.info, f"Expected actual one-shot export: {path}"
        size = image.size
        for index in range(image.n_frames):
            image.seek(index)
            duration = image.info.get("duration", 0)
            assert duration > 0 and duration % 10 == 0
            frames.append(image.convert("RGB"))
            durations.append(duration)
            starts.append(starts[-1] + duration)
    return {"frames": frames, "durations": durations, "starts": starts,
            "durationMs": starts[-1], "size": size, "path": path}


def fixed_crop(frames, padding=10):
    # Background-only corners of these UI exports provide their encoded matte.
    # A single union across BOTH revisions/all selected frames prevents jitter.
    boxes = []
    width, height = frames[0].size
    for frame in frames:
        assert frame.size == (width, height)
        background = frame.getpixel((0, 0))
        assert all(frame.getpixel(p) == background for p in
                   [(width - 1, 0), (0, height - 1), (width - 1, height - 1)])
        box = ImageChops.difference(frame, Image.new("RGB", frame.size, background)).getbbox()
        assert box is not None
        boxes.append(box)
    return (max(0, min(b[0] for b in boxes) - padding),
            max(0, min(b[1] for b in boxes) - padding),
            min(width, max(b[2] for b in boxes) + padding),
            min(height, max(b[3] for b in boxes) + padding))


def resized_frames(clip, crop, max_height):
    width, height = crop[2] - crop[0], crop[3] - crop[1]
    scale = min(1, max_height / height, 320 / width)
    size = (round(width * scale), round(height * scale))
    frames = [frame.crop(crop).resize(size, Image.Resampling.LANCZOS)
              for frame in clip["frames"]]
    return frames, size, scale


def draw_comparison(frames, labels, title, complete, pause=False):
    width, height = frames[0].size
    output = Image.new("RGB", (2 * width + 24, height + 80), MATTE)
    draw = ImageDraw.Draw(output)
    draw.text((8, 5), title, fill=INK, font=FONT)
    for i, (frame, label) in enumerate(zip(frames, labels)):
        x = 8 + i * (width + 8)
        suffix = " (held)" if complete[i] else ""
        draw.text((x, 25), label + suffix, fill=INK, font=FONT)
        output.paste(frame, (x, 46))
    footer = "Review pause - replay follows" if pause else "Source timing preserved; shorter clip held"
    draw.text((8, height + 57), footer, fill=INK, font=SMALL)
    return output


def save_gif(path, frames, durations):
    # One palette for the entire review prevents a palette change at the seam.
    palette_sheet = Image.new("RGB", (64 * 16, 96 * math.ceil(len(frames) / 16)), MATTE)
    for index, frame in enumerate(frames):
        palette_sheet.paste(frame.resize((64, 96), Image.Resampling.BOX),
                            ((index % 16) * 64, (index // 16) * 96))
    palette = palette_sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT,
                                     dither=Image.Dither.NONE)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                    loop=0, disposal=2, optimize=False)
    with Image.open(path) as check:
        assert check.info["loop"] == 0
        decoded_duration = 0
        for i in range(check.n_frames):
            check.seek(i)
            decoded_duration += check.info["duration"]
        assert decoded_duration == sum(durations)


def profile(path):
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            config = json.loads(archive.read("character.json"))
    else:
        config = load_json(path)
    return config["sourceMetadata"]["gameplayMotion"]


def native_sequence(p):
    # Browser review requests Jump after one run cycle, then runs one more cycle.
    run, jump = p["actions"]["run"]["frames"], p["actions"]["jump"]["frames"]
    approach = min(r["exit"] for r in p["routes"] if r["from"] == "run" and r["to"] == "jump")
    resume = min((r for r in p["routes"] if r["from"] == "jump" and r["to"] == "run"),
                 key=lambda r: r["exit"])
    first_jump = len(run) + approach
    first_return = first_jump + resume["exit"]
    sequence = run + run[:approach] + jump[:resume["exit"]]
    sequence += [run[(resume["entry"] + i) % len(run)] for i in range(len(run))]
    return sequence, first_jump, first_return


def seam_sheet(path, before, after, sequences, seams, title):
    ticks = [[seam + offset for offset in range(-4, 4)] for seam in seams]
    selected = [[clip["frames"][i] for i in row] for clip, row in zip([before, after], ticks)]
    crop = fixed_crop(selected[0] + selected[1], 8)
    width, height = crop[2] - crop[0], crop[3] - crop[1]
    cellw, cellh = 125, 230
    scale = min((cellw - 8) / width, (cellh - 50) / height)
    size = (round(width * scale), round(height * scale))
    sheet = Image.new("RGB", (8 * cellw, 2 * cellh + 48), MATTE)
    draw = ImageDraw.Draw(sheet)
    draw.text((6, 4), title + " - each row aligned on its own return-to-run seam", fill=INK, font=FONT)
    draw.text((6, 24), "Before / After use the same fixed crop and scale; no framewise recentering", fill=INK, font=SMALL)
    rows = []
    for r, (clip, ids) in enumerate(zip([before, after], ticks)):
        for c, tick in enumerate(ids):
            x, y = c * cellw, 48 + r * cellh
            fid = sequences[r][tick]
            label = "Before" if r == 0 else "After"
            draw.text((x + 4, y + 4), f"{label}: ID {fid}", fill=INK, font=FONT)
            draw.text((x + 4, y + 24), f"tick {tick} / {clip['starts'][tick]} ms", fill=INK, font=SMALL)
            frame = clip["frames"][tick].crop(crop).resize(size, Image.Resampling.LANCZOS)
            sheet.paste(frame, (x + (cellw - size[0]) // 2, y + 46))
        rows.append({"label": "Before" if r == 0 else "After", "exportTicks": ids,
                     "nativeFrameIds": [sequences[r][i] for i in ids]})
    sheet.save(path, optimize=True)
    return {"crop": crop, "scale": scale, "rows": rows}


def build(args):
    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    for character in ("male", "female"):
        proof = load_json(args.input / character / "pixel-verification.json")
        assert proof.get("passed") is True, "Run the independent export audit first"
        for view in ("original", "side"):
            filename = f"{view}-run-jump-run-right.gif"
            old_path = args.baseline / character / filename
            new_path = args.input / character / filename
            old_profile = profile(args.baseline / character / f"{view}.character.json")
            new_profile = profile(args.input / character / f"{view}.character.zip")
            before, after = decode(old_path), decode(new_path)
            sequences, first_jumps, seams = [], [], []
            for clip, p in zip([before, after], [old_profile, new_profile]):
                sequence, first_jump, first_return = native_sequence(p)
                assert len(sequence) == len(clip["frames"]), "Export timeline differs from reviewed profile"
                sequences.append(sequence); first_jumps.append(first_jump); seams.append(first_return)
            assert first_jumps[0] == first_jumps[1], "Before/after takeoff must share one clock"
            assert before["size"] == after["size"]
            crop = fixed_crop(before["frames"] + after["frames"])
            old_frames, panel_size, scale = resized_frames(before, crop, args.panel_height)
            new_frames, _, _ = resized_frames(after, crop, args.panel_height)
            end = max(before["durationMs"], after["durationMs"])
            events = sorted(set(before["starts"] + after["starts"]))
            rows, frames, durations = [], [], []
            title = f"{character.title()} / {view} - exported GIFs"
            for start, stop in zip(events, events[1:]):
                indices = [min(bisect_right(c["starts"], start) - 1, len(c["frames"]) - 1)
                           for c in [before, after]]
                held = [start >= c["durationMs"] for c in [before, after]]
                frames.append(draw_comparison([old_frames[indices[0]], new_frames[indices[1]]],
                                               ["Before", "After"], title, held))
                durations.append(stop - start)
                rows.append({"startMs": start, "durationMs": stop - start,
                             "sourceExportFrameIndices": indices, "held": held})
            frames.append(draw_comparison([old_frames[-1], new_frames[-1]], ["Before", "After"],
                                          title, [True, True], pause=True))
            durations.append(args.pause_ms)
            stem = f"{character}-{view}-landing-run"
            gif_path, sheet_path = args.output / f"{stem}-before-after.gif", args.output / f"{stem}-seams.png"
            save_gif(gif_path, frames, durations)
            sheet = seam_sheet(sheet_path, before, after, sequences, seams, title)
            records.append({"character": character, "view": view,
                            "before": {"path": str(old_path), "sha256": digest(old_path),
                                       "profileId": old_profile["id"], "frameDurationsMs": before["durations"]},
                            "after": {"path": str(new_path), "sha256": digest(new_path),
                                      "profileId": new_profile["id"], "frameDurationsMs": after["durations"]},
                            "comparison": {"file": gif_path.name, "sha256": digest(gif_path),
                                           "bytes": gif_path.stat().st_size, "fixedCrop": crop,
                                           "uniformScale": scale, "panelSize": panel_size,
                                           "sourceTimelineMs": end, "reviewPauseMs": args.pause_ms,
                                           "loop": True, "events": rows},
                            "seamSheet": {"file": sheet_path.name, "sha256": digest(sheet_path),
                                          "bytes": sheet_path.stat().st_size, **sheet},
                            "firstJumpTicks": first_jumps, "firstRunReturnTicks": seams})
            print(f"Rendered {character}/{view}: {gif_path.stat().st_size} GIF bytes", flush=True)
            del frames, old_frames, new_frames, before, after
    report = {"format": "gathria-landing-run-presentation-review", "version": 1,
              "provenance": "Only decoded actual UI GIFs. Original downloads unchanged.",
              "presentationOnly": True,
              "timing": "Union of input GIF event times retains every original frame duration. The shorter clip holds its last frame; a labelled review pause is added. Comparison loops; actual exports do not.",
              "imageProcessing": "One fixed union crop and scale per comparison; no framewise recentering. Preview resize and one shared 256-color GIF palette are presentation-only.",
              "exports": records}
    (args.output / "comparison-inventory.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"comparisons": len(records), "artifactBytes": sum(
        r["comparison"]["bytes"] + r["seamSheet"]["bytes"] for r in records)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("/tmp/landing-run/exports"))
    parser.add_argument("--baseline", type=Path, default=ROOT / "docs/kling-single-jump/review")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/kling-landing-run/review")
    parser.add_argument("--panel-height", type=int, default=210)
    parser.add_argument("--pause-ms", type=int, default=900)
    args = parser.parse_args()
    assert args.pause_ms > 0 and args.pause_ms % 10 == 0
    build(args)
