"""Build labeled review sheets/GIFs from actual browser-downloaded packs only."""

import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image, ImageDraw, ImageFont, ImageOps

BG = (239, 236, 226)
try:
    FONT = ImageFont.truetype("DejaVuSans.ttf", 14)
except OSError:
    FONT = ImageFont.load_default()


def read_pack(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        manifest = json.loads(archive.read("manifest.json"))
        pages = [Image.open(io.BytesIO(archive.read(p["file"]))).convert("RGBA")
                 for p in [manifest["spritesheet"], *manifest.get("additionalSheets", [])]]
        frames = {f["id"]: pages[f.get("page", 0)].crop(
            (f["x"], f["y"], f["x"] + f["width"], f["y"] + f["height"]))
                  for f in manifest["frames"]}
    return manifest, frames


def panel(frames, labels, *, scale=0.5, direction="right"):
    w, h = round(512 * scale), round(768 * scale)
    result = Image.new("RGB", (w * len(frames), h + 44), BG)
    draw = ImageDraw.Draw(result)
    for i, (frame, label) in enumerate(zip(frames, labels)):
        if direction == "left":
            frame = ImageOps.mirror(frame)
        if scale != 1:
            frame = frame.resize((w, h), Image.Resampling.NEAREST if scale > 1 else Image.Resampling.LANCZOS)
        result.paste(frame, (i * w, 38), frame)
        draw.text((i * w + 8, 7), label, font=FONT, fill=(57, 65, 61))
    return result


def save_gif(path, frames, *, loop):
    # One shared palette across the clip avoids per-frame palette flicker.
    thumbs = [f.resize((128, max(1, round(f.height * 128 / f.width)))) for f in frames[::max(1, len(frames)//24)]]
    mosaic = Image.new("RGB", (128 * len(thumbs), thumbs[0].height), BG)
    for i, thumb in enumerate(thumbs):
        mosaic.paste(thumb, (128 * i, 0))
    palette = mosaic.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    encoded = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    delays = [10 * (round((i + 1) * 100 / 24) - round(i * 100 / 24)) for i in range(len(frames))]
    options = {"loop": 0} if loop else {}
    encoded[0].save(path, save_all=True, append_images=encoded[1:], duration=delays,
                    disposal=2, optimize=False, **options)
    with Image.open(path) as gif:
        duration = 0
        for i in range(gif.n_frames):
            gif.seek(i)
            gif.load()
            duration += gif.info.get("duration", 0)
        assert duration == sum(delays)
        assert ("loop" in gif.info) == loop
        return {"file": path.name, "decodedFrames": gif.n_frames,
                "sourceFrames": len(frames), "durationMs": duration,
                "loop": loop, "size": list(gif.size)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {"source": "Actual UI-downloaded CharacterPacks; labels, comparison layout and GIF encoding added offline.",
              "inputs": [], "gifs": []}
    bank = {}
    for gender in ["male", "female"]:
        bank[gender] = {}
        for look in ["original", "daily"]:
            path = args.evidence / f"{gender}-{look}.character.zip"
            bank[gender][look] = read_pack(path)
            report["inputs"].append({"file": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        original, changed = bank[gender]["original"], bank[gender]["daily"]
        assert original[0]["animations"] == changed[0]["animations"]
        for action in ["idle", "walk", "run", "jump"]:
            clip = original[0]["animations"][action]
            assert clip["fps"] == 24
            for direction in ["right", "left"]:
                frames = [panel([original[1][fid], changed[1][fid]],
                                [f"{gender} original / {action}", f"daily / {direction} / {i+1}"], direction=direction)
                          for i, fid in enumerate(clip["frames"])]
                report["gifs"].append(save_gif(args.output / f"{gender}-{action}-{direction}.gif", frames, loop=clip["loop"]))
        poses = [("idle", 0), ("walk", 5), ("run", 8), ("jump", 14), ("jump", 38), ("jump", 49)]
        rows = []
        for look, (_, frames) in [("original", original), ("daily", changed)]:
            ids = [original[0]["animations"][a]["frames"][i] for a, i in poses]
            rows.append(panel([frames[fid] for fid in ids], [f"{look} / {a} [{i}]" for a, i in poses], scale=1))
        sheet = Image.new("RGB", (rows[0].width, sum(r.height for r in rows)), BG)
        sheet.paste(rows[0], (0, 0)); sheet.paste(rows[1], (0, rows[0].height))
        sheet.save(args.output / f"{gender}-keyposes-native.png")
    # Synchronized review timeline, separate from interactive state-machine evidence.
    timeline = [(a, i) for a, repetitions in [("walk", 2), ("run", 2), ("jump", 1)]
                for _ in range(repetitions) for i in range(len(bank["male"]["daily"][0]["animations"][a]["frames"]))]
    sequence = []
    for action, position in timeline:
        frames, labels = [], []
        for gender in ["male", "female"]:
            for look in ["original", "daily"]:
                manifest, sprites = bank[gender][look]
                frames.append(sprites[manifest["animations"][action]["frames"][position]])
                labels.append(f"{gender} {look} / {action}")
        sequence.append(panel(frames, labels))
    report["gifs"].append(save_gif(args.output / "pair-walk-run-two-jumps.gif", sequence, loop=False))
    (args.output / "review-index.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"gifs": len(report["gifs"]), "output": str(args.output)}))


if __name__ == "__main__":
    main()
