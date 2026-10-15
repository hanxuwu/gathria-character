"""Compose review evidence only from actual exported PNGs and manifests.

Prerequisite: python3 with Pillow, plus generate-art-v2-evidence.mjs outputs.
No character artwork is drawn here. Sprites keep their exact RGB values, use
nearest-neighbor integer zoom, and face left using the package anchor contract.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/art-v2"
INDEX = json.loads((OUT / "evidence-index.json").read_text())
BG = "#F7F5EE"
PAPER = "#FFFDF7"
INK = "#3F443B"
MUTED = "#757A6D"
GREEN = "#486E5C"
LINE = "#D9DFD0"
TILE_A = "#EDF0E6"
TILE_B = "#E5EBDD"
FONT_ROOT = Path("/usr/share/fonts/truetype/dejavu")


def font(size: int, bold: bool = False):
    path = FONT_ROOT / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


FONTS = {"title": font(25, True), "label": font(16, True), "body": font(13), "small": font(11)}


def draw_for(image):
    draw = ImageDraw.Draw(image)
    # Text does not introduce hundreds of antialias colors into the GIF palette.
    draw.fontmode = "1"
    return draw


def header(canvas, title, description, badge=None):
    draw = draw_for(canvas)
    draw.text((30, 24), title, font=FONTS["title"], fill=INK)
    draw.text((31, 64), description, font=FONTS["body"], fill=MUTED)
    if badge:
        draw.text((canvas.width - 30, 36), badge, font=FONTS["label"], fill=GREEN, anchor="rm")


class Export:
    def __init__(self, entry, before=False):
        self.entry = entry
        directory = ROOT / entry["before" if before else "directory"]
        self.manifest = json.loads((directory / "manifest.json").read_text())
        self.config = json.loads((directory / "character.json").read_text())
        self.sheet = Image.open(directory / self.manifest["spritesheet"]["file"]).convert("RGBA")
        dimensions = self.manifest["spritesheet"]
        assert self.sheet.size == (dimensions["width"], dimensions["height"])
        assert {alpha for _, alpha in self.sheet.getchannel("A").getcolors()} == {0, 255}
        self.frames = {item["id"]: item for item in self.manifest["frames"]}

    def sprite(self, frame_id, zoom=5, facing="right"):
        frame = self.frames[frame_id]
        sprite = self.sheet.crop((frame["x"], frame["y"], frame["x"] + frame["width"], frame["y"] + frame["height"]))
        anchor_x = self.manifest["anchor"]["x"]
        if self.manifest["facing"][facing] == "mirror-x":
            sprite = ImageOps.mirror(sprite)
            anchor_x = frame["width"] - anchor_x
        sprite = sprite.resize((frame["width"] * zoom, frame["height"] * zoom), Image.Resampling.NEAREST)
        return sprite, (anchor_x * zoom, self.manifest["anchor"]["y"] * zoom)

    def paste(self, canvas, frame_id, anchor, zoom=5, facing="right"):
        sprite, attachment = self.sprite(frame_id, zoom, facing)
        canvas.paste(sprite, (anchor[0] - attachment[0], anchor[1] - attachment[1]), sprite)


def checker(draw, box, unit=10):
    left, top, right, bottom = box
    for y in range(top, bottom, unit):
        for x in range(left, right, unit):
            color = TILE_A if ((x - left) // unit + (y - top) // unit) % 2 == 0 else TILE_B
            draw.rectangle((x, y, min(x + unit - 1, right - 1), min(y + unit - 1, bottom - 1)), fill=color)


def three_panel(exports, title, description, animation="idle", facing="right", step=0):
    canvas = Image.new("RGB", (50 + len(exports) * 310, 552), BG)
    header(canvas, title, description)
    draw = draw_for(canvas)
    for index, item in enumerate(exports):
        left = 30 + index * 310
        draw.rounded_rectangle((left, 99, left + 290, 492), radius=10, fill=PAPER, outline=LINE)
        checker(draw, (left + 10, 109, left + 280, 449))
        draw.line((left + 18, 429, left + 272, 429), fill="#AEBDA0")
        sequence = item.manifest["animations"][animation]["frames"]
        item.paste(canvas, sequence[step % len(sequence)], (left + 145, 429), facing=facing)
        draw.text((left + 145, 469), item.entry["label"], font=FONTS["label"], fill=INK, anchor="mm")
    draw.text((30, 520), "Actual exported PNG pixels  ·  48 × 64 frame  ·  5× integer zoom", font=FONTS["small"], fill=MUTED)
    draw.text((canvas.width - 30, 520), "Neutral preview — not a Gathria scene", font=FONTS["small"], fill=GREEN, anchor="ra")
    return canvas


def before_after():
    canvas = Image.new("RGB", (920, 1270), BG)
    header(canvas, "Character Art V2 · matched comparison", "Same saved palette, hair/clothing choices, idle frame 0, 5× zoom and background.")
    draw = draw_for(canvas)
    for row, entry in enumerate(INDEX["matched"]):
        y = 106 + row * 374
        draw.text((30, y + 13), entry["label"], font=FONTS["label"], fill=INK)
        for column, (label, before) in enumerate((("V1 · original", True), (f"V2 · {entry['faceVariant']} face", False))):
            left = 140 + column * 374
            checker(draw, (left, y, left + 340, y + 328))
            draw.line((left + 16, y + 310, left + 324, y + 310), fill="#AEBDA0")
            item = Export(entry, before)
            item.paste(canvas, item.manifest["animations"]["idle"]["frames"][0], (left + 170, y + 310))
            draw.text((left + 170, y + 346), label, font=FONTS["label"], fill=GREEN if not before else MUTED, anchor="mm")
    draw.text((30, 1243), "V1 uses the original archived sample PNG. V2 adds explicit artwork version + face variant; all existing inputs are retained.", font=FONTS["small"], fill=MUTED)
    canvas.save(OUT / "before-after.png")


def native_lineup(exports):
    canvas = Image.new("RGB", (470, 200), BG)
    draw = draw_for(canvas)
    draw.text((18, 15), "V2 at native size · 1×", font=FONTS["label"], fill=INK)
    for index, item in enumerate(exports):
        center = 79 + index * 156
        checker(draw, (center - 34, 53, center + 34, 135), 4)
        item.paste(canvas, item.manifest["animations"]["idle"]["frames"][0], (center, 122), zoom=1)
        draw.text((center, 152), item.entry["label"], font=FONTS["body"], fill=INK, anchor="mm")
        draw.text((center, 175), f"{item.config['faceVariant']} face", font=FONTS["small"], fill=MUTED, anchor="mm")
    canvas.save(OUT / "lineup-native.png")


def mira_direction():
    entry = next(item for item in INDEX["matched"] if item["id"] == "mira")
    before, after = Export(entry, True), Export(entry)
    canvas = Image.new("RGB", (1000, 740), BG)
    header(canvas, "Mira · actual generated direction study", "Original archived V1 and current V2. Same configuration inputs, idle frame 0 and neutral background.")
    draw = draw_for(canvas)
    for item, center, label in ((before, 185, "Original V1 · 5×"), (after, 500, "Current V2 · 5×")):
        checker(draw, (center - 135, 106, center + 135, 436))
        item.paste(canvas, 0, (center, 416), zoom=5)
        draw.text((center, 456), label, font=FONTS["label"], fill=INK, anchor="mm")
    draw.text((805, 135), "Native size · 1×", font=FONTS["label"], fill=INK, anchor="mm")
    for item, center, label in ((before, 745, "V1"), (after, 865, "V2")):
        checker(draw, (center - 34, 175, center + 34, 255), 4)
        item.paste(canvas, 0, (center, 242), zoom=1)
        draw.text((center, 279), label, font=FONTS["body"], fill=MUTED, anchor="mm")
    draw.text((40, 501), "Current V2 · every walk pose · 2×", font=FONTS["label"], fill=INK)
    for index, frame_id in enumerate(dict.fromkeys(after.manifest["animations"]["walk"]["frames"])):
        left = 35 + index * 120
        checker(draw, (left, 536, left + 96, 664), 4)
        after.paste(canvas, frame_id, (left + 48, 656), zoom=2)
        draw.text((left + 48, 683), f"Frame {frame_id}", font=FONTS["small"], fill=MUTED, anchor="mm")
    draw.text((40, 716), "All artwork comes from actual exported PNGs. CharacterPack frame dimensions and attachment anchor are unchanged.", font=FONTS["small"], fill=MUTED)
    canvas.save(OUT / "mira-direction-study.png")


def contact_sheet(item):
    canvas = Image.new("RGB", (1252, 550), BG)
    idle = item.manifest["animations"]["idle"]
    walk = item.manifest["animations"]["walk"]
    header(canvas, f"{item.entry['label']} · every exported pose", f"Idle: {len(set(idle['frames']))} poses, {len(idle['frames'])} timeline entries at {idle['fps']} fps. Walk: {len(set(walk['frames']))} poses at {walk['fps']} fps. Right-facing, 3× zoom.")
    draw = draw_for(canvas)
    for row, animation in enumerate(("idle", "walk")):
        sequence = item.manifest["animations"][animation]
        for column, frame_id in enumerate(dict.fromkeys(sequence["frames"])):
            left = 18 + column * 154
            top = 100 + row * 216
            checker(draw, (left, top, left + 144, top + 192), 6)
            draw.line((left, top + 180, left + 143, top + 180), fill="#AEBDA0")
            item.paste(canvas, frame_id, (left + 72, top + 180), zoom=3)
            draw.text((left + 72, top + 201), f"{animation} · {frame_id:02}", font=FONTS["small"], fill=MUTED, anchor="mm")
    directory = OUT / "contacts"
    directory.mkdir(exist_ok=True)
    canvas.save(directory / f"{item.entry['id']}.png")


def animation(exports, filename, title):
    # Every phase contains whole loops. No speed changes or hand-picked poses.
    phases = [("idle", "right", 1), ("walk", "right", 2), ("idle", "left", 1), ("walk", "left", 2)]
    frames, durations = [], []
    for motion, facing, loops in phases:
        reference = exports[0].manifest["animations"][motion]
        for item in exports:
            sequence = item.manifest["animations"][motion]
            assert sequence["fps"] == reference["fps"]
            assert len(sequence["frames"]) == len(reference["frames"])
        for step in range(len(reference["frames"]) * loops):
            frames.append(three_panel(exports, title, f"{motion.upper()} · {facing.upper()}  |  {reference['fps']} fps from manifest  |  full animation loops", motion, facing, step))
            durations.append(round(1000 / reference["fps"]))

    # Exactly one palette across all frames avoids per-frame color flicker.
    # Refuse lossy quantization: a review GIF must not change the character colors.
    colors = set()
    for frame in frames:
        counts = frame.getcolors(maxcolors=65536)
        assert counts is not None
        colors.update(color for _, color in counts)
    assert len(colors) <= 256, f"{filename}: {len(colors)} colors exceeds exact GIF palette capacity"
    palette_colors = sorted(colors)
    color_indexes = {color: index for index, color in enumerate(palette_colors)}
    flat = [channel for color in palette_colors for channel in color]
    palette = flat + [0] * (768 - len(flat))
    indexed = []
    for frame in frames:
        # Pillow's nearest-palette quantizer can approximate neighboring colors
        # even when both RGB values exist in the palette. Map exact RGB tuples.
        pixels = getattr(frame, "get_flattened_data", frame.getdata)()
        encoded = Image.frombytes("P", frame.size, bytes(color_indexes[pixel] for pixel in pixels))
        encoded.putpalette(palette)
        indexed.append(encoded)
    for rgb, encoded in zip(frames, indexed):
        assert rgb.tobytes() == encoded.convert("RGB").tobytes(), "GIF changed source RGB values"
    path = OUT / filename
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations, loop=0, disposal=2, optimize=False)
    total = 0
    with Image.open(path) as result:
        assert result.info["loop"] == 0
        # GIF encoders may coalesce identical adjacent poses; verify elapsed time.
        for i in range(result.n_frames):
            result.seek(i)
            total += result.info["duration"]
    assert total == sum(durations)
    return {"file": str(path.relative_to(ROOT)), "durationMs": total, "colors": len(colors), "dimensions": list(frames[0].size), "sourceFrames": len(frames)}


def neutral_scene(lineup, outfits):
    # A labeled composition check, intentionally independent of Gathria assets.
    canvas = Image.new("RGB", (1020, 560), BG)
    header(canvas, "Neutral preview — not a Gathria scene", "Composition check with real exported characters. Gathria runtime integration remains unverified.")
    draw = draw_for(canvas)
    draw.rectangle((30, 100, 990, 499), fill="#EDF0E6")
    draw.rectangle((30, 395, 990, 499), fill="#D9CBB5")
    draw.rectangle((30, 395, 990, 399), fill="#B5B89D")
    draw.rectangle((70, 165, 220, 170), fill="#CAD6BC")
    draw.rectangle((800, 145, 920, 150), fill="#CAD6BC")
    participants = [(lineup[1], 180, "right"), (outfits[1], 402, "right"), (outfits[2], 590, "left"), (lineup[2], 825, "left")]
    for item, x, facing in participants:
        item.paste(canvas, item.manifest["animations"]["idle"]["frames"][0], (x, 416), zoom=4, facing=facing)
    draw.text((30, 526), "4× integer zoom · frame 0 · static neutral floor · no Gathria scene assets or integration claims", font=FONTS["small"], fill=MUTED)
    canvas.save(OUT / "neutral-scene.png")


lineup = [Export(entry) for entry in INDEX["lineup"]]
outfits = [Export(entry) for entry in INDEX["outfits"]]
faces = [Export(entry) for entry in INDEX["faces"]]
hairstyles = [Export(entry) for entry in INDEX["hairstyles"]]
before_after()
mira_direction()
native_lineup(lineup)
three_panel(lineup, "Character Art V2 · three familiar people", "Distinct heart, oval and round faces; original palettes and readable hair silhouettes.").save(OUT / "lineup-5x.png")
three_panel(outfits, "Character Art V2 · clothes for a memory", "Same Mira face, hair and skin in polished casual, a wedding suit and a wedding dress.").save(OUT / "outfits-5x.png")
three_panel(faces, "Character Art V2 · three face shapes", "Same palette, cropped hair and outfit. Only the selected face variant changes.").save(OUT / "face-study.png")
three_panel(hairstyles, "Character Art V2 · four familiar hairstyles", "Same heart face, palette and outfit. The four existing hairstyles keep distinct silhouettes.").save(OUT / "hairstyles-5x.png")
for item in [*lineup, *outfits]:
    contact_sheet(item)
neutral_scene(lineup, outfits)
results = [
    animation(lineup, "characters-motion.gif", "Character Art V2 · everyday stories"),
    animation(outfits, "outfits-motion.gif", "Character Art V2 · clothes in motion"),
]
(OUT / "animation-evidence.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
