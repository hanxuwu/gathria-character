#!/usr/bin/env python3
"""Place actual browser GIF downloads side by side without retiming frames."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("--before", type=Path, required=True)
parser.add_argument("--after", type=Path, required=True)
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
records = []
for look in ("daily", "wedding"):
    for facing in ("right", "left"):
        name = f"{look}-run-jump-run-{facing}.gif"
        before = Image.open(args.before / name)
        after = Image.open(args.after / name)
        assert before.n_frames == after.n_frames and before.size == after.size
        w, h = before.size
        frames, delays = [], []
        for i in range(after.n_frames):
            before.seek(i); after.seek(i)
            assert before.info["duration"] == after.info["duration"]
            delays.append(after.info["duration"])
            panel = Image.new("RGB", (w * 2 + 12, h + 24), "#eee9df")
            panel.paste(before.convert("RGB"), (0, 24))
            panel.paste(after.convert("RGB"), (w + 12, 24))
            draw = ImageDraw.Draw(panel)
            draw.text((8, 6), f"BEFORE / {look}", fill="#324b41")
            draw.text((w + 20, 6), f"AFTER / {look}", fill="#324b41")
            frames.append(panel)
        # One palette for the complete comparison; GIF is a lossy review only.
        samples = Image.new("RGB", (frames[0].width, frames[0].height * len(frames)))
        for i, frame in enumerate(frames): samples.paste(frame, (0, i * frame.height))
        palette = samples.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        encoded = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
        path = args.out / f"{look}-run-jump-before-after-{facing}.gif"
        encoded[0].save(path, save_all=True, append_images=encoded[1:], duration=delays,
                        loop=0, optimize=False, disposal=2)
        records.append({"file": path.name, "look": look, "facing": facing,
                        "frames": len(frames), "durationMs": sum(delays),
                        "beforeGifSha256": hashlib.sha256((args.before/name).read_bytes()).hexdigest(),
                        "afterGifSha256": hashlib.sha256((args.after/name).read_bytes()).hexdigest(),
                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(args.out / "presentation.json").write_text(json.dumps({
    "method": "Side-by-side actual browser GIF downloads, exact frame count and original per-frame durations; shared preview palette. This does not alter source frames, playback or CharacterPacks.",
    "files": records,
}, indent=2) + "\n")
print(json.dumps(records, indent=2))
