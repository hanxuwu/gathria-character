#!/usr/bin/env python3
"""Lay out the actual AppearanceRenderer PNGs from verify-kling-side-nape.mjs.

This step adds labels/crops/GIF quantization only. It does not fit or paint hair.
Full garment/workbench export evidence is produced by the parent review suite.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path("/tmp/side-fitting/hair/runtime")
OUTPUT = ROOT / "docs/kling-side-fitting/hair"
spec = importlib.util.spec_from_file_location("review", ROOT / "scripts/review-kling-side-exports.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def image(gender, fid, color):
    result = Image.open(INPUT / f"{gender}-{fid}-{color}.png").convert("RGBA")
    row = next(row for row in AUDIT[gender]["frames"] if row["frameId"] == fid)
    digest = hashlib.sha256(np.asarray(result).tobytes()).hexdigest()
    check = row["colors"][0]["baselineRgbaSha256"] if color == "before" else next(c for c in row["colors"] if c["color"] == color)["renderRgbaSha256"]
    assert digest == check, f"Stale renderer PNG: {gender}/{fid}/{color}"
    return result


def labeled(crop, label, zoom):
    art = crop.resize((crop.width * zoom, crop.height * zoom), Image.Resampling.NEAREST)
    panel = Image.new("RGB", (art.width + 20, art.height + 40), review.BG)
    panel.paste(art, (10, 32), art)
    ImageDraw.Draw(panel).text((10, 10), label, fill="black")
    return panel


def row(panels):
    result = Image.new("RGB", (sum(p.width for p in panels), max(p.height for p in panels)), review.BG)
    x = 0
    for panel in panels:
        result.paste(panel, (x, 0))
        x += panel.width
    return result


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    colors = ["before", "chestnut", "espresso", "copper"]
    row([labeled(image("male", 67, color).crop((160, 340, 285, 450)), f"{color} / pack67 / 3x", 3) for color in colors]).save(OUTPUT / "male67-colors-3x.png")
    row([labeled(image("male", 67, color), f"{color} / pack67 / native", 1) for color in ["before", "chestnut"]]).save(OUTPUT / "male67-native.png")
    rows = []
    for color in ["before", "chestnut"]:
        rows.append(row([labeled(image("male", fid, color).crop((100, 230, 400, 490)), f"{color} / {fid}", 1) for fid in range(63, 70)]))
    neighbors = Image.new("RGB", (rows[0].width, sum(p.height for p in rows)), review.BG)
    y = 0
    for panel in rows:
        neighbors.paste(panel, (0, y))
        y += panel.height
    neighbors.save(OUTPUT / "male-jump-neighbors.png")
    with zipfile.ZipFile(ROOT / "docs/kling-side-workspace/assets/male.source.zip") as z:
        manifest = json.loads(z.read("manifest.json"))
    clip = manifest["animations"]["jump"]
    frames = [review.panel([image("male", fid, "before"), image("male", fid, "chestnut")], ["Before / original body + hair", f"Nape fit / jump {fid}"]) for fid in clip["frames"]]
    gif = review.save_gif(OUTPUT / "male-jump-hair-runtime.gif", frames, loop=clip["loop"])
    summary = {"method": "Actual AppearanceRenderer PNGs, labels/crops/nearest-neighbor layout/GIF encoding only. No garment rendering in this focused hair review.", "gif": gif, "sourceTimingPreserved": True, "sourceArtworkUnchanged": True, "runtimeAuditSha256": hashlib.sha256((OUTPUT / "runtime-audit.json").read_bytes()).hexdigest()}
    (OUTPUT / "review-index.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    AUDIT = {c["gender"]: c for c in json.loads((OUTPUT / "runtime-audit.json").read_text())["characters"]}
    main()
