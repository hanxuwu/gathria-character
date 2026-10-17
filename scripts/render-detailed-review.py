"""Compose review evidence only from actual exported PNGs and manifests.

Prerequisite: python3 with Pillow, plus generate-detailed-evidence.mjs outputs.
No character artwork is drawn here. PNG comparisons retain exported RGB values
and use nearest-neighbor integer zoom. GIF previews use one shared palette and
may quantize illustration colors; exported PNGs remain the lossless reference.
"""

from __future__ import annotations

import json
import hashlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/art-detailed"
INDEX = json.loads((OUT / "evidence-index.json").read_text())
assert hashlib.sha256((ROOT / INDEX["artworkSource"]["file"]).read_bytes()).hexdigest() == INDEX["artworkSource"]["sha256"], "Illustration bank differs from captured exports; recapture before assembling review media."
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
        sheet_path = directory / self.manifest["spritesheet"]["file"]
        if not before:
            assert hashlib.sha256(sheet_path.read_bytes()).hexdigest() == entry["spritesheetSha256"], f"Export changed since browser capture: {sheet_path}"
        self.sheet = Image.open(sheet_path).convert("RGBA")
        dimensions = self.manifest["spritesheet"]
        assert self.sheet.size == (dimensions["width"], dimensions["height"])
        assert {alpha for _, alpha in self.sheet.getchannel("A").getcolors()} == {0, 255}
        self.frames = {item["id"]: item for item in self.manifest["frames"]}

    def sprite(self, frame_id, zoom=1, facing="right"):
        frame = self.frames[frame_id]
        sprite = self.sheet.crop((frame["x"], frame["y"], frame["x"] + frame["width"], frame["y"] + frame["height"]))
        anchor_x = self.manifest["anchor"]["x"]
        if self.manifest["facing"][facing] == "mirror-x":
            sprite = ImageOps.mirror(sprite)
            anchor_x = frame["width"] - anchor_x
        sprite = sprite.resize((frame["width"] * zoom, frame["height"] * zoom), Image.Resampling.NEAREST)
        return sprite, (anchor_x * zoom, self.manifest["anchor"]["y"] * zoom)

    def paste(self, canvas, frame_id, anchor, zoom=1, facing="right"):
        sprite, attachment = self.sprite(frame_id, zoom, facing)
        canvas.paste(sprite, (anchor[0] - attachment[0], anchor[1] - attachment[1]), sprite)


def checker(draw, box, unit=10):
    left, top, right, bottom = box
    for y in range(top, bottom, unit):
        for x in range(left, right, unit):
            color = TILE_A if ((x - left) // unit + (y - top) // unit) % 2 == 0 else TILE_B
            draw.rectangle((x, y, min(x + unit - 1, right - 1), min(y + unit - 1, bottom - 1)), fill=color)


def three_panel(exports, title, description, animation="idle", facing="right", step=0, zoom=2, gif_preview=False):
    frame_width = exports[0].manifest["spritesheet"]["frameWidth"] * zoom
    frame_height = exports[0].manifest["spritesheet"]["frameHeight"] * zoom
    card_width = frame_width + 48
    card_top, card_bottom = 102, 102 + frame_height + 66
    content_width = 60 + len(exports) * card_width + (len(exports) - 1) * 20
    canvas = Image.new("RGB", (max(820, content_width), card_bottom + 60), BG)
    header(canvas, title, description)
    draw = draw_for(canvas)
    for index, item in enumerate(exports):
        left = 30 + (canvas.width - content_width) // 2 + index * (card_width + 20)
        draw.rounded_rectangle((left, card_top, left + card_width, card_bottom), radius=10, fill=PAPER, outline=LINE)
        checker(draw, (left + 10, card_top + 10, left + card_width - 10, card_top + frame_height + 26), 8)
        anchor_y = card_top + 20 + item.manifest["anchor"]["y"] * zoom
        draw.line((left + 18, anchor_y, left + card_width - 18, anchor_y), fill="#AEBDA0")
        sequence = item.manifest["animations"][animation]["frames"]
        item.paste(canvas, sequence[step % len(sequence)], (left + card_width // 2, anchor_y), zoom=zoom, facing=facing)
        draw.text((left + card_width // 2, card_top + frame_height + 45), item.entry["label"], font=FONTS["label"], fill=INK, anchor="mm")
    footer = f"Actual exported PNG frames · 192 × 256 · {zoom}× integer scale"
    if gif_preview: footer = "GIF preview uses a shared limited palette; exported PNGs are the lossless reference."
    draw.text((30, card_bottom + 28), footer, font=FONTS["small"], fill=MUTED)
    draw.text((canvas.width - 30, card_bottom + 47), "Neutral preview — not a Gathria scene", font=FONTS["small"], fill=GREEN, anchor="ra")
    return canvas

def before_after():
    # Each pair has exactly the same displayed frame dimensions and anchor.
    for suffix, before_zoom, after_zoom in (("native", 4, 1), ("enlarged", 8, 2)):
        frame_width, frame_height = 192 * after_zoom, 256 * after_zoom
        card_width, row_height = frame_width + 32, frame_height + 76
        width = 170 + 2 * card_width + 40
        height = 112 + len(INDEX["matched"]) * row_height + 45
        canvas = Image.new("RGB", (width, height), BG)
        header(canvas, "Detailed art · matched comparison", f"Same inputs, pose and physical size: V2 {before_zoom}× / detailed {after_zoom}×.")
        draw = draw_for(canvas)
        for row, entry in enumerate(INDEX["matched"]):
            top = 110 + row * row_height
            draw.text((25, top + 15), entry["label"], font=FONTS["label"], fill=INK)
            for column, before in enumerate((True, False)):
                x = 130 + column * (card_width + 40)
                checker(draw, (x, top, x + card_width, top + frame_height + 20), 8)
                item = Export(entry, before)
                zoom = before_zoom if before else after_zoom
                item.paste(canvas, item.manifest["animations"]["idle"]["frames"][0], (x + frame_width // 2 + 16, top + 10 + 240 * after_zoom), zoom=zoom)
                label = f"V2 48 × 64 · {before_zoom}×" if before else f"Detailed 192 × 256 · {after_zoom}×"
                draw.text((x + frame_width // 2 + 16, top + frame_height + 42), label, font=FONTS["body"], fill=MUTED if before else GREEN, anchor="mm")
        draw.text((25, height - 28), "Archived V2 PNG unchanged; only explicit artworkVersion changes from 2 to 3.", font=FONTS["small"], fill=MUTED)
        canvas.save(OUT / f"before-after-{suffix}.png")

def native_lineup(exports):
    three_panel(exports, "Detailed artwork · native size", "Actual 192 × 256 export pixels at 1×. Face, hair and colors remain editable.", zoom=1).save(OUT / "lineup-native.png")

def mira_direction():
    entry = next(item for item in INDEX["matched"] if item["id"] == "mira")
    before, after = Export(entry, True), Export(entry)
    canvas = Image.new("RGB", (1684, 1040), BG)
    header(canvas, "Mira · actual application output study", "Same archived V2 appearance inputs. Production illustration assets are composed and exported by the application.")
    draw = draw_for(canvas)
    for item, center, label, zoom in ((before, 250, "Art V2 · 8×", 8), (after, 720, "Detailed · 2×", 2)):
        checker(draw, (center - 210, 110, center + 210, 642))
        item.paste(canvas, 0, (center, 610), zoom=zoom)
        draw.text((center, 665), label, font=FONTS["label"], fill=INK, anchor="mm")
    draw.text((1310, 150), "Actual native resolutions · both 1×", font=FONTS["label"], fill=INK, anchor="mm")
    for item, center, label in ((before, 1135, "V2 · 48 × 64"), (after, 1435, "Detailed · 192 × 256")):
        checker(draw, (center - 108, 210, center + 108, 490), 4)
        item.paste(canvas, 0, (center, 460), zoom=1)
        draw.text((center, 520), label, font=FONTS["body"], fill=MUTED, anchor="mm")
    draw.text((35, 706), "Detailed artwork · every walk pose · native 1×", font=FONTS["label"], fill=INK)
    for index, frame_id in enumerate(dict.fromkeys(after.manifest["animations"]["walk"]["frames"])):
        left = 18 + index * 206
        checker(draw, (left, 746, left + 192, 1002), 8)
        after.paste(canvas, frame_id, (left + 96, 986), zoom=1)
        draw.text((left + 96, 1021), f"Frame {frame_id}", font=FONTS["small"], fill=MUTED, anchor="mm")
    canvas.save(OUT / "mira-direction-study.png")

def resolution_study():
    mira = next(item for item in INDEX["lineup"] if item["id"] == "mira")
    original, _ = Export(mira).sprite(0, zoom=1)
    reduced = original.resize((48, 64), Image.Resampling.NEAREST)
    canvas = Image.new("RGB", (1180, 730), BG)
    header(canvas, "Resolution study · information loss", "Same exported frame shown at equal physical size. Downsampling is a diagnostic, never an exported character pack.")
    draw = draw_for(canvas)
    for image, x, label in ((original.resize((384, 512), Image.Resampling.NEAREST), 35, "Actual 192 × 256 export · 2×"), (reduced.resize((384, 512), Image.Resampling.NEAREST), 465, "Downsampled 48 × 64 · 8×")):
        checker(draw, (x, 110, x + 404, 642), 8)
        canvas.paste(image, (x + 10, 120), image)
        draw.text((x + 202, 670), label, font=FONTS["body"], fill=INK, anchor="mm")
    draw.text((1025, 165), "Actual export · native 1×", font=FONTS["body"], fill=INK, anchor="mm")
    checker(draw, (917, 200, 1133, 480), 4)
    canvas.paste(original, (929, 212), original)
    draw.text((1025, 510), "192 × 256 original pixels", font=FONTS["body"], fill=MUTED, anchor="mm")
    draw.text((30, 707), "The reduced diagnostic discards eye, curl and lace detail. Production exports retain original 192 × 256 pixels.", font=FONTS["small"], fill=MUTED)
    canvas.save(OUT / "resolution-study.png")


def previous_draft_comparison():
    """Historical 96px outputs are raster evidence, never a supported pack."""
    history = json.loads((OUT / "previous-draft/provenance.json").read_text())
    current = {item["id"]: item for item in [*INDEX["lineup"], *INDEX["outfits"]]}
    canvas = Image.new("RGB", (1410, 862), BG)
    header(canvas, "Rejected procedural draft → current illustrated output", "Same appearance inputs and idle frame 0. Historical 96 × 128 at 2× / current 192 × 256 at 1×; equal physical size.")
    draw = draw_for(canvas)
    for index, entry in enumerate(history["entries"]):
        left, top = 25 + (index % 3) * 465, 106 + (index // 3) * 350
        item = Export(current[entry["detailedId"]])
        for key, value in entry["appearanceInputs"].items():
            assert item.config[key] == value, f"Historical {entry['id']} appearance changed: {key}"
        historical_path = OUT / "previous-draft" / entry["file"]
        assert hashlib.sha256(historical_path.read_bytes()).hexdigest() == entry["sha256"]
        sheet = Image.open(historical_path).convert("RGBA")
        assert sheet.size == (768, 256)
        old = sheet.crop((0, 0, 96, 128)).resize((192, 256), Image.Resampling.NEAREST)
        new, _ = item.sprite(0, zoom=1)
        draw.text((left + 218, top + 9), item.entry["label"], font=FONTS["label"], fill=INK, anchor="mm")
        for sprite, x, label in ((old, left, "Previous draft · 2×"), (new, left + 225, "Current output · 1×")):
            checker(draw, (x, top + 30, x + 208, top + 302), 8)
            canvas.paste(sprite, (x + 8, top + 38), sprite)
            draw.text((x + 104, top + 324), label, font=FONTS["body"], fill=MUTED, anchor="mm")
    draw.text((25, 831), "The previous draft is historical raster evidence, not a supported artwork version or package. Current panels come from actual new exports.", font=FONTS["small"], fill=MUTED)
    canvas.save(OUT / "previous-draft-comparison.png")

def contact_sheet(item):
    canvas = Image.new("RGB", (1684, 692), BG)
    idle = item.manifest["animations"]["idle"]
    walk = item.manifest["animations"]["walk"]
    header(canvas, f"{item.entry['label']} · every exported pose", f"Idle: {len(set(idle['frames']))} poses, {len(idle['frames'])} timeline entries at {idle['fps']} fps. Walk: {len(set(walk['frames']))} poses at {walk['fps']} fps. Right-facing, native 1×.")
    draw = draw_for(canvas)
    for row, animation in enumerate(("idle", "walk")):
        sequence = item.manifest["animations"][animation]
        for column, frame_id in enumerate(dict.fromkeys(sequence["frames"])):
            left = 18 + column * 206
            top = 100 + row * 286
            checker(draw, (left, top, left + 192, top + 256), 8)
            draw.line((left, top + 240, left + 191, top + 240), fill="#AEBDA0")
            item.paste(canvas, frame_id, (left + 96, top + 240), zoom=1)
            draw.text((left + 96, top + 269), f"{animation} · {frame_id:02}", font=FONTS["small"], fill=MUTED, anchor="mm")
    directory = OUT / "contacts"
    directory.mkdir(exist_ok=True)
    canvas.save(directory / f"{item.entry['id']}.png")


def wedding_pair():
    items = {entry["id"]: Export(entry) for entry in INDEX["referencePair"]}
    canvas = Image.new("RGB", (1320, 785), BG)
    header(canvas, "Wedding looks · freely combined appearance options", "Actual exported configurations assembled by the application. These are output pixels, not production master illustrations.")
    draw = draw_for(canvas)
    checker(draw, (30, 105, 820, 647), 8)
    checker(draw, (850, 195, 1290, 505), 4)
    for item, x, facing in ((items["dress"], 260, "right"), (items["suit"], 600, "left")):
        item.paste(canvas, 0, (x, 610), zoom=2, facing=facing)
    for item, x, facing in ((items["dress"], 970, "right"), (items["suit"], 1160, "left")):
        item.paste(canvas, 0, (x, 475), zoom=1, facing=facing)
    draw.text((425, 679), "192 × 256 exports at 2×", font=FONTS["label"], fill=INK, anchor="mm")
    draw.text((1070, 545), "Same exports at native 1×", font=FONTS["label"], fill=INK, anchor="mm")
    draw.text((30, 735), "Appearance options combine freely; these are example configurations, not gender-locked presets.", font=FONTS["body"], fill=MUTED)
    draw.text((30, 761), "Sources: docs/art-detailed/reference-pair/{dress,suit}/spritesheet.png + manifest.json. Neutral preview, not a Gathria scene.", font=FONTS["small"], fill=MUTED)
    canvas.save(OUT / "wedding-pair.png")

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
            frames.append(three_panel(exports, title, f"{motion.upper()} · {facing.upper()}  |  {reference['fps']} fps from manifest  |  full animation loops", motion, facing, step, zoom=1, gif_preview=True))
            durations.append(round(1000 / reference["fps"]))

    # All frames share one palette to avoid palette-switch flicker. Illustration
    # colors can exceed GIF's limit; quantize only this review copy, with no dither.
    colors = set()
    for frame in frames:
        counts = frame.getcolors(maxcolors=1 << 24)
        assert counts is not None
        colors.update(color for _, color in counts)
    quantized = len(colors) > 256
    indexed = []
    if quantized:
        # Include every unique source frame in palette selection, so later poses
        # and facing directions receive the same color treatment as frame zero.
        unique = {frame.tobytes(): frame for frame in frames}
        atlas = Image.new("RGB", (frames[0].width, frames[0].height * len(unique)))
        for row, frame in enumerate(unique.values()):
            atlas.paste(frame, (0, row * frame.height))
        palette = atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    else:
        palette_colors = sorted(colors)
        color_indexes = {color: index for index, color in enumerate(palette_colors)}
        flat = [channel for color in palette_colors for channel in color]
        palette = flat + [0] * (768 - len(flat))
        for frame in frames:
            pixels = getattr(frame, "get_flattened_data", frame.getdata)()
            encoded = Image.frombytes("P", frame.size, bytes(color_indexes[pixel] for pixel in pixels))
            encoded.putpalette(palette)
            indexed.append(encoded)
        for rgb, encoded in zip(frames, indexed):
            assert rgb.tobytes() == encoded.convert("RGB").tobytes()
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
    return {"file": str(path.relative_to(ROOT)), "durationMs": total, "sourceColors": len(colors), "paletteColors": min(len(colors), 256), "quantized": quantized, "dither": False, "losslessReference": "Exported PNG spritesheets", "dimensions": list(frames[0].size), "sourceFrames": len(frames)}


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
        item.paste(canvas, item.manifest["animations"]["idle"]["frames"][0], (x, 416), zoom=1, facing=facing)
    draw.text((30, 526), "1× native size · frame 0 · static neutral floor · no Gathria scene assets or integration claims", font=FONTS["small"], fill=MUTED)
    canvas.save(OUT / "neutral-scene.png")


lineup = [Export(entry) for entry in INDEX["lineup"]]
outfits = [Export(entry) for entry in INDEX["outfits"]]
faces = [Export(entry) for entry in INDEX["faces"]]
hairstyles = [Export(entry) for entry in INDEX["hairstyles"]]
reference_pair = [Export(entry) for entry in INDEX["referencePair"]]
before_after()
mira_direction()
resolution_study()
previous_draft_comparison()
wedding_pair()
native_lineup(lineup)
three_panel(lineup, "Detailed character art · three familiar people", "Distinct heart, oval and round faces; original palettes and readable hair silhouettes.").save(OUT / "lineup-2x.png")
three_panel(outfits, "Detailed character art · clothes for a memory", "Same Mira face, hair and skin in polished casual, a wedding suit and a wedding dress.").save(OUT / "outfits-2x.png")
three_panel(faces, "Detailed character art · three face shapes", "Same palette, cropped hair and outfit. Only the selected face variant changes.").save(OUT / "face-study.png")
three_panel(hairstyles, "Detailed character art · four familiar hairstyles", "Same heart face, palette and outfit. The four existing hairstyles keep distinct silhouettes.").save(OUT / "hairstyles-2x.png")
for item in [*lineup, *outfits]:
    contact_sheet(item)
neutral_scene(lineup, outfits)
results = [
    animation(lineup, "characters-motion.gif", "Detailed character art · everyday stories"),
    animation(outfits, "outfits-motion.gif", "Detailed character art · clothes in motion"),
    animation(reference_pair, "wedding-pair-motion.gif", "Wedding looks · actual exported motion"),
]
(OUT / "animation-evidence.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
