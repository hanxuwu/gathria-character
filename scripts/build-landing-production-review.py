"""Arrange actual UI-exported GIFs for visual comparison; never changes source assets."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence

ap = argparse.ArgumentParser()
ap.add_argument("--input", type=Path, required=True)
ap.add_argument("--out", type=Path, required=True)
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
        draw.text((10, 25), f"Run > one jump > run / {facing} / experimental review loop", fill="#625e55", font=font)
        combined.append(canvas)
    name = f"three-looks-run-jump-run-{facing}.gif"
    combined[0].save(args.out / name, save_all=True, append_images=combined[1:], duration=durations[0], loop=0, disposal=2, optimize=False)
    report["outputs"].append({"file": name, "frames": len(combined), "durationMs": sum(durations[0]), "note": "GIF palette quantization is for review only; native PNGs carry the exact pixels."})
    if facing == "right":
        strip = Image.new("RGB", (w * 7, (h + 30) * 3), "#eee8dc")
        draw = ImageDraw.Draw(strip)
        source_ids = [87, 88, 89, 107, 108, 48, 49]
        for row, look in enumerate(looks):
            for column, (tick, frame_id) in enumerate(zip(range(47,54), source_ids)):
                strip.paste(frames[row][tick], (column*w, row*(h+30)+30))
                draw.text((column*w+8,row*(h+30)+7),f"{look} / {frame_id}",fill="#263e34",font=font)
        strip.save(args.out / "three-looks-landing-contact.png")
        combined[51].save(args.out / "three-looks-landing108.png")
(args.out / "presentation-receipt.json").write_text(json.dumps(report,indent=2)+"\n")
