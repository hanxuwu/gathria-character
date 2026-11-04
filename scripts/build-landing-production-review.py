"""Arrange actual UI-exported GIFs for visual comparison; never changes source assets."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence

ap = argparse.ArgumentParser()
ap.add_argument("--input", type=Path, required=True)
ap.add_argument("--out", type=Path, required=True)
ap.add_argument("--before", type=Path, help="Actual prior workbench GIF exports for same-clock comparisons")
args = ap.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
looks = ("original", "daily", "wedding")
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
report = {"source": "Actual workbench GIF downloads", "visualAcceptance": "pending", "outputs": []}
for facing in ("right", "left"):
    images = [Image.open(args.input / f"{look}-run-jump-run-{facing}.gif") for look in looks]
    frames = [[frame.convert("RGB") for frame in ImageSequence.Iterator(im)] for im in images]
    durations = [[frame.info.get("duration", 0) for frame in ImageSequence.Iterator(im)] for im in images]
    assert len({len(rows) for rows in frames}) == 1
    assert durations[0] == durations[1] == durations[2]
    w, h = images[0].size
    assert all(im.size == (w, h) for im in images)
    combined = []
    for index in range(len(frames[0])):
        canvas = Image.new("RGB", (w * 3, h + 44), "#eee8dc")
        draw = ImageDraw.Draw(canvas)
        for column, look in enumerate(looks):
            canvas.paste(frames[column][index], (column * w, 44))
            draw.text((column * w + 10, 6), look.title(), fill="#263e34", font=font)
        draw.text((10, 25), f"Run > one jump > run / {facing} / replay resets phase", fill="#625e55", font=font)
        combined.append(canvas)
    name = f"three-looks-run-jump-run-{facing}.gif"
    combined[0].save(args.out / name, save_all=True, append_images=combined[1:], duration=durations[0], loop=0, disposal=2, optimize=False)
    report["outputs"].append({"file": name, "frames": len(combined), "durationMs": sum(durations[0]), "note": "GIF palette quantization is for review only; native PNGs carry the exact pixels."})
    if facing == "right":
        strip = Image.new("RGB", (w * 7, (h + 30) * 3), "#eee8dc")
        draw = ImageDraw.Draw(strip)
        sequence = json.loads((args.out / "runtime-sequence.json").read_text())["frames"]
        ticks = list(range(47, 54))
        source_ids = [sequence[tick]["frameId"] for tick in ticks]
        for row, look in enumerate(looks):
            for column, (tick, frame_id) in enumerate(zip(ticks, source_ids)):
                strip.paste(frames[row][tick], (column*w, row*(h+30)+30))
                draw.text((column*w+8,row*(h+30)+7),f"{look} / {frame_id}",fill="#263e34",font=font)
        strip.save(args.out / "three-looks-landing-contact.png")
        combined[51].save(args.out / "three-looks-landing108.png")
        if args.before:
            for row, look in enumerate(looks):
                old = Image.open(args.before / f"{look}-run-jump-run-right.gif")
                old_frames = [frame.convert("RGB") for frame in ImageSequence.Iterator(old)]
                old_durations = [frame.info.get("duration", 0) for frame in ImageSequence.Iterator(old)]
                assert len(old_frames) == len(frames[row]) and old.size == (w, h)
                assert old_durations == durations[row], "Before/after must use identical playback clocks"
                comparisons = []
                for tick in range(len(old_frames)):
                    canvas = Image.new("RGB", (w * 2, h + 44), "#eee8dc")
                    draw = ImageDraw.Draw(canvas)
                    canvas.paste(old_frames[tick], (0,44))
                    canvas.paste(frames[row][tick], (w,44))
                    draw.text((10,6), f"{look.title()} / before", fill="#263e34", font=font)
                    draw.text((w+10,6), "After / same clock", fill="#263e34", font=font)
                    draw.text((10,25), "Normal speed / replay resets phase", fill="#625e55", font=font)
                    comparisons.append(canvas)
                name = f"{look}-before-after-right.gif"
                comparisons[0].save(args.out / name, save_all=True, append_images=comparisons[1:], duration=old_durations, loop=0, disposal=2, optimize=False)
                report["outputs"].append({"file":name,"comparison":"actual before/after exports, identical clocks","frames":len(comparisons),"durationMs":sum(old_durations)})
                detail = []
                for tick in range(47,57):
                    canvas = comparisons[tick].copy()
                    draw = ImageDraw.Draw(canvas)
                    draw.rectangle((0,23,w*2,43), fill="#eee8dc")
                    draw.text((10,25), f"Landing detail / 3x slower / source {sequence[tick]['frameId']}", fill="#625e55", font=font)
                    detail.append(canvas)
                name = f"{look}-landing-detail-before-after.gif"
                detail[0].save(args.out / name, save_all=True, append_images=detail[1:], duration=[old_durations[tick]*3 for tick in range(47,57)], loop=0, disposal=2, optimize=False)
                report["outputs"].append({"file":name,"comparison":"same frames with explicit 3x review slowdown","ticks":list(range(47,57))})
(args.out / "presentation-receipt.json").write_text(json.dumps(report,indent=2)+"\n")
