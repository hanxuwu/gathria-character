"""Compose unaltered direct-renderer diagnostic frames; never edit source art."""

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SCRATCH = Path(sys.argv[1])
OUTPUT = Path(sys.argv[2])
DATA = json.loads((SCRATCH / "diagnostics.json").read_text())
BACKGROUND = "#e5eadc"
PAPER = "#f5f0e5"
INK = "#333333"


def load_frame(variant, action, key):
    path = SCRATCH / variant["sweep"] / variant["name"] / f"{action}-{key}.png"
    with Image.open(path) as image:
        image.load()
        assert image.size == (192, 256), path
        rgba = image.convert("RGBA")
    assert set(rgba.getchannel("A").tobytes()) == {0, 255}, path
    return rgba


def decode_artifact(path):
    with Image.open(path) as image:
        count = getattr(image, "n_frames", 1)
        durations = []
        for index in range(count):
            image.seek(index)
            image.load()
            assert image.getbbox() is not None, path
            if path.suffix == ".gif":
                durations.append(image.info["duration"])
        result = {
            "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "dimensions": list(image.size),
            "decodedFrames": count,
        }
        if durations:
            result["durationsMilliseconds"] = durations
        return result


# Verify the renderer's unchanged baseline against the prior actual UI export.
baseline = ROOT / DATA["baseline"]
manifest = json.loads((baseline / "manifest.json").read_text())
sheet = Image.open(baseline / "spritesheet.png").convert("RGBA")
baseline_variant = next(v for v in DATA["variants"] if v["name"] == "baseline")
verified = []
for action, offset, count in [
    ("idle", 0, 4), ("walk", 4, 8), ("run", 12, 12), ("jump", 24, 12)
]:
    for key in range(count):
        rectangle = manifest["frames"][offset + key]
        x, y = rectangle["x"], rectangle["y"]
        exported = sheet.crop((x, y, x + 192, y + 256))
        rendered = load_frame(baseline_variant, action, key)
        assert rendered.tobytes() == exported.tobytes(), (action, key)
        verified.append(f"{action}-{key:02}")

# Decode every temporary frame, including configurations not selected for panels.
decoded = 0
for variant in DATA["variants"]:
    for action, count in [("idle", 4), ("walk", 8), ("run", 12), ("jump", 12)]:
        for key in range(count):
            load_frame(variant, action, key)
            decoded += 1
assert decoded == 540

artifacts = []
keys = [("run", 1), ("run", 5), ("run", 9), ("jump", 4)]
width, height = 135 * 3, 100 * 3
for sweep in ["mesh", "source-knee"]:
    variants = [v for v in DATA["variants"] if v["sweep"] == sweep]
    panel = Image.new("RGB", (width * len(keys) + 160, (height + 24) * len(variants) + 45), PAPER)
    text = ImageDraw.Draw(panel)
    title = "DIRECT renderer diagnostic / 3x nearest-neighbor / "
    title += "mesh parameters only; same poses" if sweep == "mesh" else "source knee offsets; IK poses can differ"
    text.text((10, 10), title, fill=INK)
    for row, variant in enumerate(variants):
        y = 45 + row * (height + 24)
        label = variant["name"] + "\n"
        if sweep == "mesh":
            label += f"radius={variant['blendRadius']}\nvolume={variant['volume']}"
        else:
            label += f"knee dx={variant['kneeDx']}\nknee dy={variant['kneeDy']}"
        text.text((10, y + 40), label, fill=INK)
        for column, (action, key) in enumerate(keys):
            crop = load_frame(variant, action, key).crop((35, 149, 170, 249))
            crop = crop.resize((width, height), Image.Resampling.NEAREST)
            tile = Image.new("RGB", (width, height), BACKGROUND)
            tile.paste(crop, mask=crop.getchannel("A"))
            x = 160 + column * width
            panel.paste(tile, (x, y))
            text.text((x, y + height + 4), f"{action} key {key + 1:02}", fill=INK)
    path = OUTPUT / f"{sweep}-sweep-3x.png"
    panel.save(path)
    artifacts.append(path)

frames = []
for key in range(12):
    panel = Image.new("RGB", (384 * 3, 512 + 48), BACKGROUND)
    text = ImageDraw.Draw(panel)
    text.text((10, 5), "DIRECT renderer diagnostic / same existing run motion / 2x nearest-neighbor", fill=INK)
    for column, name in enumerate(["r3", "baseline", "r10"]):
        variant = next(v for v in DATA["variants"] if v["name"] == name and v["sweep"] == "mesh")
        image = load_frame(variant, "run", key).resize((384, 512), Image.Resampling.NEAREST)
        panel.paste(image, (column * 384, 48), image)
        text.text((column * 384 + 10, 26), f"{name} / key {key + 1:02}", fill=INK)
    frames.append(panel)
durations = [round((i + 1) * 100 / 18) * 10 - round(i * 100 / 18) * 10 for i in range(12)]
gif = OUTPUT / "mesh-candidate-run-comparison-2x.gif"
frames[0].save(gif, save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2)
artifacts.append(gif)
inventory = {str(path.relative_to(ROOT)): decode_artifact(path) for path in artifacts}
gif_info = inventory[str(gif.relative_to(ROOT))]
assert gif_info["decodedFrames"] == 12
assert gif_info["durationsMilliseconds"] == durations

report = {
    "format": "gathria-maple-knee-diagnostics",
    "version": 1,
    "purpose": "Direct renderer diagnostic outputs, NOT UI exports. No candidate adopted; no production source pixel, runtime or motion changed by this script.",
    "reproduce": "node scripts/diagnose-maple-knees.mjs",
    "inputs": DATA["inputHashes"],
    "runtimeSources": DATA["runtimeHashes"],
    "scripts": {
        path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        for path in ["scripts/diagnose-maple-knees.mjs", "scripts/render-maple-knee-diagnostics.py"]
    },
    "baselineExportPixelExactFrames": len(verified),
    "baselinePixelExactKeys": verified,
    "decodedRenderedFrames": decoded,
    "variants": DATA["variants"],
    "recommendation": {
        "adoptedCandidate": None,
        "blendRadius": 6,
        "volume": 0.65,
        "nearKnee": [79, 198],
        "farKnee": [110, 198],
        "reason": "Neither bounded sweep produced a clear overall improvement. Keep original bindings and source art."
    },
    "findings": [
        "Radius 3/4 concentrates the compressed fold into a pointed corner; radius 8/10 spreads or smears it and broadens parts of the contour.",
        "Volume 0 thins a folded knee; volume 1 slightly balloons it without recovering the painted crease.",
        "Source knee offsets +/-2 pixels x/y and +4 pixels y shift IK and hip silhouettes but retain crease compression. They do not preserve identical poses.",
        "The mesh setting is shared by all four chains, so changing it to repair one knee also changes elbow handling.",
        "Straight trouser art lacks the newly visible fabric and crease of a tight bend. Authored bent-cloth artwork or pose-local geometry is needed for a material visual improvement."
    ],
    "visualInspection": "Same-key 3x crops of run 02/06/10 and jump 05 were inspected across both sweeps, plus the original full run key sheet. GIF is a review artifact, not a claim of user visual acceptance.",
    "gifTiming": {"fps": 18, "loop": True, "rounding": "Cumulative centisecond rounding", "frames": 12},
    "artifacts": inventory,
}
(OUTPUT / "diagnostic-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(f"Knee diagnostics: {decoded} decoded renders, {len(verified)} baseline export frames pixel-exact; 2 PNGs + 12-frame GIF validated. No candidate adopted.")
