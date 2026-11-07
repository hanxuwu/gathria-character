#!/usr/bin/env python3
"""Present exact compositor frames with fixed-camera, real-controller travel.

Input comes from review-landing-contact.ts. The only image transform is a uniform
half-size presentation resize, plus exact left-facing mirror. This never edits
source assets or normalizes a foot/head position on individual frames.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
data = json.loads(args.input.read_text())
args.out.mkdir(parents=True, exist_ok=True)
native = Path(data["nativeFramesDirectory"])
before, after = data["editions"]
assert before["sequence"]["window"] == after["sequence"]["window"]
assert before["sequence"]["fps"] == after["sequence"]["fps"] == 24
assert before["sequence"]["jumpRequestTick"] == after["sequence"]["jumpRequestTick"]
assert before["anchor"] == after["anchor"]
start = before["sequence"]["window"]["startTick"]
end = before["sequence"]["window"]["endTickExclusive"]
scale = 0.5
panel_width, panel_height, top = 480, 438, 42
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
look_names = ("original", "daily", "wedding")
ground_y = top + before["anchor"]["y"] * scale
receipts = []


def render_panel(edition, look, facing, tick):
    sample = edition["samples"][facing][tick]
    initial = edition["samples"][facing][start]
    frame = next(row for row in edition["frames"] if row["look"] == look and row["tick"] == tick)
    raw = (native / frame["file"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == frame["pngSha256"]
    image = Image.open(native / frame["file"]).convert("RGBA")
    assert hashlib.sha256(image.tobytes()).hexdigest() == frame["rgbaSha256"]
    if facing == "left":
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    # One uniform display reduction; body proportions and source RGBA remain
    # available unaltered in the native evidence and hashes.
    image = image.resize((256, 384), Image.Resampling.LANCZOS)
    origin_x = 40 if facing == "right" else panel_width - 40 - 256
    offset = (sample["worldX"] - initial["worldX"]) * scale
    canvas = Image.new("RGBA", (panel_width, panel_height), "#eee8dc")
    draw = ImageDraw.Draw(canvas)
    for x in range(24, panel_width, 40):
        draw.line((x, top, x, ground_y), fill="#ded8cc")
        draw.line((x, ground_y, x, ground_y + 7), fill="#8e897e", width=1)
    draw.line((0, ground_y, panel_width, ground_y), fill="#8e897e", width=1)
    canvas.alpha_composite(image, (round(origin_x + offset), top))
    draw.text((10, 7), f"{look.title()} / {edition['edition']} / {facing} / source {sample['frameId']}", font=font, fill="#263e34")
    draw.text((10, 25), f"Fixed camera | world x {sample['worldX']:.2f} | tick {tick}", font=small, fill="#625e55")
    draw.text((10, panel_height - 16), "700 native px/s | 24 fps | ground = source anchor | 0.5x", font=small, fill="#625e55")
    return canvas.convert("RGB")


durations = before["sequence"]["window"]["gifDurationsMs"]
assert len(durations) == end - start
for look in look_names:
    for facing in ("right", "left"):
        pairs = []
        for tick in range(start, end):
            combined = Image.new("RGB", (panel_width * 2, panel_height + 28), "#eee8dc")
            draw = ImageDraw.Draw(combined)
            draw.text((10, 7), "Landing window / normal speed / replay resets window; judge motion within each pass", font=font, fill="#263e34")
            combined.paste(render_panel(before, look, facing, tick), (0, 28))
            combined.paste(render_panel(after, look, facing, tick), (panel_width, 28))
            pairs.append(combined)
        name = f"{look}-fixed-ground-before-after-{facing}.gif"
        pairs[0].save(args.out / name, save_all=True, append_images=pairs[1:], duration=durations, loop=0, disposal=2, optimize=False)
        # Two rows keep the original scale. This is not a montage of normalized
        # poses: every panel retains its fixed camera and actual world offset.
        selected_ticks = [start, start + 1, start + 2, start + 3]
        contact = Image.new("RGB", (panel_width * 4, panel_height * 2), "#eee8dc")
        for column, tick in enumerate(selected_ticks):
            contact.paste(render_panel(before, look, facing, tick), (column * panel_width, 0))
            contact.paste(render_panel(after, look, facing, tick), (column * panel_width, panel_height))
        contact_name = f"{look}-fixed-ground-contact-{facing}.png"
        contact.save(args.out / contact_name)
        receipts.append({"gif": name, "contact": contact_name, "frames": len(pairs), "durationMs": sum(durations), "ticks": list(range(start, end)), "contactTicks": selected_ticks})
(args.out / "fixed-ground-presentation.json").write_text(json.dumps({
    "source": args.input.name,
    "transform": "Exact left mirror then uniform half-size display only; world origin remains constant through each pass.",
    "cameraRecenterPerFrame": False,
    "placement": {
        "panelWidth": panel_width,
        "panelHeight": panel_height,
        "scale": scale,
        "spriteOriginXAtWindowStart": {"right": 40, "left": panel_width - 40 - 256},
        "formula": "round(originX + (actualWorldX[tick] - actualWorldX[startTick]) * 0.5)",
        "worldReferenceTick": start,
        "groundSourceY": before["anchor"]["y"],
        "groundPanelY": ground_y,
    },
    "normalSpeed": True,
    "gifTiming": "Exact matching window from the application's gifDelays helper at 24 FPS; 10 ms GIF quantization.",
    "replay": "Short diagnostic windows reset at end; not advertised as seamless animation.",
    "outputs": receipts,
}, indent=2) + "\n")
