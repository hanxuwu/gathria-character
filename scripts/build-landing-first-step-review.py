"""Compare actual V6/V7 male downloads at the same encoded presentation times.

This is evidence assembly, not an animation renderer. Original exports are
copied byte for byte; the labelled comparison uses a common review palette.
"""

import argparse
from bisect import bisect_right
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFont


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode(path):
    image = Image.open(path)
    frames, delays, times = [], [], [0]
    for index in range(image.n_frames):
        image.seek(index)
        frame = image.convert("RGB")
        assert frame.size == (256, 384), (path, frame.size)
        delay = image.info.get("duration", 0)
        assert delay > 0, (path, index, delay)
        frames.append(frame)
        delays.append(delay)
        times.append(times[-1] + delay)
    assert len(frames) == 68 and times[-1] == 2830, (path, len(frames), times)
    return {"frames": frames, "delays": delays, "times": times}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, default=Path("docs/kling-landing-forward/review"))
    parser.add_argument("--after", type=Path, required=True, help="Actual male UI export directory")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    required = [
        root / name
        for direction in ("right", "left")
        for root, name in (
            (args.before, f"male-run-jump-run-{direction}.gif"),
            (args.after, f"side-run-jump-run-{direction}.gif"),
        )
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("Actual exports are required:\n" + "\n".join(missing))

    args.out.mkdir(parents=True, exist_ok=True)
    evidence = {
        "method": "Actual application downloads; identical encoded clocks; fixed display scale; no new poses, warping, interpolation or recentering.",
        "comparisonPauseMs": 700,
        "raw": [],
    }
    for direction in ("right", "left"):
        before_path = args.before / f"male-run-jump-run-{direction}.gif"
        after_path = args.after / f"side-run-jump-run-{direction}.gif"
        before, after = decode(before_path), decode(after_path)
        assert before["delays"] == after["delays"], "Encoded timing changed"
        # Run starts one native phase earlier. No preceding pose or pixels change.
        # GIF palette quantization is verified separately against native PNGs.
        copied = args.out / f"male-run-jump-run-{direction}.gif"
        shutil.copyfile(after_path, copied)
        assert digest(after_path) == digest(copied)
        evidence["raw"].append({
            "facing": direction,
            "beforeSha256": digest(before_path),
            "afterSha256": digest(after_path),
            "file": copied.name,
            "bytes": copied.stat().st_size,
            "frameCount": len(after["frames"]),
            "durationMs": after["times"][-1],
            "identicalFrameDelays": True,
        })

    before = decode(args.before / "male-run-jump-run-right.gif")
    after = decode(args.after / "side-run-jump-run-right.gif")
    bg, ink = (238, 233, 223), (42, 44, 41)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    font, small = ImageFont.truetype(font_path, 12), ImageFont.truetype(font_path, 10)
    frames, durations, samples = [], [], []
    # Full head, hands and feet remain visible at one fixed scale.
    for index in range(43, 59):
        time = before["times"][index]
        canvas = Image.new("RGB", (416, 334), bg)
        draw = ImageDraw.Draw(canvas)
        draw.text((8, 5), f"Male / landing / {time / 1000:.2f}s", font=font, fill=ink)
        for column, (label, data) in enumerate((("Main V6 / Run49", before), ("Candidate V7 / Run48", after))):
            frame_index = bisect_right(data["times"], time) - 1
            assert frame_index == index
            x = 8 + column * 204
            draw.text((x, 24), label, font=small, fill=ink)
            canvas.paste(data["frames"][frame_index].resize((192, 288), Image.Resampling.LANCZOS), (x, 40))
        frames.append(canvas)
        durations.append(before["delays"][index])
        samples.append({"timeMs": time, "beforeFrame": index, "afterFrame": index})
    pause = frames[-1].copy()
    draw = ImageDraw.Draw(pause)
    draw.rectangle((0, 0, 416, 20), fill=bg)
    draw.text((8, 5), "REVIEW PAUSE 0.70s / replay", font=font, fill=ink)
    frames.append(pause)
    durations.append(700)
    palette_source = Image.new("RGB", (416, 334 * len(frames)))
    for index, frame in enumerate(frames):
        palette_source.paste(frame, (0, index * 334))
    palette = palette_source.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    quantized = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    comparison = args.out / "male-landing-before-after.gif"
    quantized[0].save(comparison, save_all=True, append_images=quantized[1:], duration=durations, loop=0, disposal=1)

    sheet = Image.new("RGB", (236 * 6, 738), bg)
    draw = ImageDraw.Draw(sheet)
    draw.text((5, 5), "Same presentation time / full head, arms and feet / fixed crop", font=font, fill=ink)
    for row, (label, data) in enumerate((("Main V6", before), ("Candidate V7", after))):
        for column, index in enumerate(range(47, 53)):
            x, y = column * 236, 26 + row * 356
            draw.text((x + 4, y + 2), f"{label} / {data['times'][index] / 1000:.2f}s / f{index}", font=small, fill=ink)
            sheet.paste(data["frames"][index].crop((24, 48, 252, 368)), (x + 4, y + 23))
    strip = args.out / "male-landing-same-time.png"
    sheet.save(strip, optimize=True)
    evidence["comparison"] = {"file": comparison.name, "sha256": digest(comparison), "samples": samples}
    evidence["strip"] = {"file": strip.name, "sha256": digest(strip), "crop": [24, 48, 252, 368]}
    (args.out / "review-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
    print(json.dumps({"out": str(args.out), "bytes": sum(p.stat().st_size for p in args.out.iterdir() if p.is_file())}))


if __name__ == "__main__":
    main()
