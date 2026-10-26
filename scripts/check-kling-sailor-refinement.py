#!/usr/bin/env python3
"""Independently decode and audit the shipped Midnight sailor V2 archive."""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw

from kling_wardrobe_common import ROOT, load_source, protected_mask, sha


def decode(path):
    with zipfile.ZipFile(path) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        pages = [np.asarray(Image.open(io.BytesIO(archive.read(p["file"]))).convert("RGBA")) for p in manifest["pages"]]
        mask_bytes = [archive.read(p["maskFile"]) for p in manifest["pages"]]
        masks = [np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))[:, :, 3] > 0 for data in mask_bytes]
    frames = {}
    for frame in manifest["frames"]:
        r, o = frame["rect"], frame["offset"]
        src = np.s_[r["y"]:r["y"] + r["height"], r["x"]:r["x"] + r["width"]]
        dst = np.s_[o["y"]:o["y"] + r["height"], o["x"]:o["x"] + r["width"]]
        patch = np.zeros((1056, 704, 4), np.uint8)
        mask = np.zeros((1056, 704), bool)
        patch[dst] = pages[frame["page"]][src]
        mask[dst] = masks[frame["page"]][src]
        frames[frame["frameId"]] = (patch, mask)
    return manifest, mask_bytes, frames


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "artwork/kling-sailor-refinement/final-v2/independent-validation.json")
    args = parser.parse_args()
    old_path = ROOT / "docs/kling-wardrobe/garments/male/midnight-sailor-v1.zip"
    new_path = ROOT / "docs/kling-wardrobe/garments/male/midnight-sailor-v2.zip"
    old_m, old_masks, before = decode(old_path)
    new_m, new_masks, after = decode(new_path)
    assert old_masks == new_masks
    for field in ("frames", "pages", "sourceSha256", "registrationSha256", "characterId", "frameWidth", "frameHeight", "slot"):
        assert old_m[field] == new_m[field], field
    assert old_m["id"] == "midnight-sailor-v1" and new_m["id"] == "midnight-sailor-v2"
    source_bytes, source_manifest, _, source = load_source("male")
    assert sha(source_bytes) == new_m["sourceSha256"]
    template = ROOT / "docs/kling-wardrobe/templates/male-full-outfits-v1.wardrobe-template.zip"
    with zipfile.ZipFile(template) as archive:
        registration_bytes = archive.read("registration.json")
        registration = json.loads(registration_bytes)
        assert sha(registration_bytes) == new_m["registrationSha256"]
        guides = {frame["frameId"]: frame for frame in registration["frames"]}
        assert set(before) == set(after) == set(source) == set(guides)
        yy, xx = np.indices((1056, 704))
        rows = []
        for fid in sorted(source):
            old, old_owned = before[fid]
            new, owned = after[fid]
            assert np.array_equal(old_owned, owned)
            assert np.array_equal(old[:, :, 3], new[:, :, 3])
            assert not new[~owned].any()
            assert np.array_equal(new[owned, 3], source[fid][owned, 3])
            old_composite, new_composite = source[fid].copy(), source[fid].copy()
            old_composite[owned], new_composite[owned] = old[owned], new[owned]
            changed = np.any(old_composite != new_composite, axis=2)
            assert not (changed & ~owned).any()
            assert np.array_equal(new_composite[~owned], source[fid][~owned])
            assert np.array_equal(new_composite[:, :, 3], source[fid][:, :, 3])
            protected = protected_mask(guides[fid])
            for name in ("head", "nearHand", "farHand", "shoes"):
                data = archive.read(f"masks/{fid:03}/{name}.png")
                protected |= np.asarray(Image.open(io.BytesIO(data)).convert("L")) > 0
            assert np.array_equal(new_composite[protected], source[fid][protected])
            tank = np.asarray(Image.open(io.BytesIO(archive.read(f"masks/{fid:03}/tank.png"))).convert("L")) > 0
            p = guides[fid]["points"]
            left, right, neck = p["waistLeft"], p["waistRight"], p["neck"]
            waist_y = left["y"] + (xx - left["x"]) * (right["y"] - left["y"]) / max(1, right["x"] - left["x"])
            extent = np.percentile((yy - waist_y)[tank], 99.9)
            lower_start = neck["y"] - 10 + .52 * np.maximum(60, waist_y + extent - neck["y"] + 10)
            lower = yy >= lower_start
            assert np.array_equal(old_composite[lower], new_composite[lower]), fid
            count = int(changed.sum())
            assert count > 0, fid
            cy, cx = np.where(changed)
            rows.append({"frameId": fid, "changedRgbPixels": count,
                         "changedBounds": [int(cx.min()), int(cy.min()), int(cx.max()) + 1, int(cy.max()) + 1],
                         "ownershipAlphaAndProtectedPixelsExact": True, "lowerTorsoWaistAndOutsideClothingExact": True})
    author_report = json.loads((ROOT / "artwork/kling-sailor-refinement/final-v2/audit.json").read_text())
    assert [(r["frameId"], r["changedRgbPixels"]) for r in rows] == [(r["frameId"], r["changedRgbPixels"]) for r in author_report["poses"]]
    _, _, pants = decode(ROOT / "docs/kling-wardrobe/garments/male/ochre-chinos-v1.zip")
    board = Image.new("RGB", (1408, 280 * ((len(after) + 7) // 8)), "#eee9df")
    draw = ImageDraw.Draw(board)
    for index, fid in enumerate(sorted(after)):
        composed = source[fid].copy()
        bottom, bottom_owned = pants[fid]
        patch, owned = after[fid]
        composed[bottom_owned] = bottom[bottom_owned]
        composed[owned] = patch[owned]
        tile = Image.fromarray(composed).resize((176, 264), Image.Resampling.LANCZOS)
        x, y = index % 8 * 176, index // 8 * 280
        board.paste(tile, (x, y + 16), tile)
        draw.text((x + 3, y + 3), f"OFFLINE V2 / {fid}", fill="#304036")
    overview = args.output.parent / "offline-all-88-poses.jpg"
    board.save(overview, quality=92)
    result = {"status": "passed", "method": "Independent archive decoding; no authoring or fitting functions imported.",
              "authoringRecipeSha256": sha((ROOT / "scripts/prepare-kling-midnight-sailor-refinement.py").read_bytes()),
              "validationRecipeSha256": sha(Path(__file__).read_bytes()),
              "oldSha256": sha(old_path.read_bytes()), "newSha256": sha(new_path.read_bytes()),
              "sourceSha256": sha(source_bytes), "registrationSha256": sha(registration_bytes),
              "sourceManifestSha256": sha(json.dumps(source_manifest, sort_keys=True).encode()),
              "poseCount": len(rows), "changedRgbPixels": sum(row["changedRgbPixels"] for row in rows),
              "ownershipPngBytesExact": True, "frameAndPageRecordsExact": True,
              "sourceDimensionsAnchorAndAnimationScheduleReferencedExactly": True,
              "offlineOverview": {"file": overview.name, "sha256": sha(overview.read_bytes()),
                                  "pantsSha256": sha((ROOT / "docs/kling-wardrobe/garments/male/ochre-chinos-v1.zip").read_bytes())},
              "poses": rows}
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "poses"}, indent=2))


if __name__ == "__main__":
    main()
