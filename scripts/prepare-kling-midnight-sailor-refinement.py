#!/usr/bin/env python3
"""Bounded Midnight sailor V2 RGB registration; the V1 recipe stays frozen.

The upper torso extrapolates donor Y instead of repeating its first row. At
shoulder joins broad blending is confined to navy cloth; collar edges feather
only inside the torso. Every V1 ownership mask and alpha value remains exact.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_male_limb_ownership import MaleLimbOwnership
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha


BASE = ROOT / "docs/kling-wardrobe/garments/male/midnight-sailor-v1.zip"
OUT = ROOT / "artwork/kling-sailor-refinement"
ITEM_ID = "midnight-sailor-v2"
KEYS = (0, 58, 59, 60, 77, 78, 79, 85, 86, 87, 95, 96, 97, 103, 104, 105)
DETAIL_KEYS = (59, 78, 86, 96, 104)


def load_recipe():
    spec = importlib.util.spec_from_file_location(
        "frozen_sailor_v1", ROOT / "scripts/prepare-kling-midnight-sailor.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def navy(rgb):
    r, g, b = np.moveaxis(rgb, 2, 0)
    # Exactly the existing donor's plain-navy predicate, not a skin detector.
    return (b > r + 8) & (b > g + 1) & (b < 170)


def refined_torso(fitter, item, original, semantic, points):
    mask, color, progress = fitter.torso(item, original, semantic, points)
    d = fitter.old.DONORS[item]
    neck = fitter.old.point(points, "neck")
    wl = fitter.old.point(points, "waistLeft")
    wr = fitter.old.point(points, "waistRight")
    xx, yy = fitter.XX, fitter.YY
    waist_y = wl[1] + (xx - wl[0]) * (wr[1] - wl[1]) / max(1, wr[0] - wl[0])
    hem_extent = float(np.percentile((yy - waist_y)[mask], 99.9))
    raw_progress = (yy - neck[1] + 10) / np.maximum(60, waist_y + hem_extent - neck[1] + 10)
    upper = raw_progress < 0
    # Preserve V1 X/centre/width registration, including its zero-progress X.
    # Only Y above the old clamp samples the existing cloth-only donor padding.
    axis = np.asarray(d["axis"])
    width = max(110, wr[0] - wl[0]) * 1.06
    sx = axis[0, 0] + (xx - neck[0]) / width * d["width"][0]
    sy = axis[0, 1] + raw_progress * (axis[1, 1] - axis[0, 1])
    # The donor's tiny upper collar tip otherwise becomes a detached ivory chip
    # where the immutable source shoulder occludes it. Use the same plain-navy
    # padding as the donor recipe in this newly extrapolated upper domain.
    sampled = np.stack([
        nd.map_coordinates(fitter.upper_torso_texture[:, :, c], [sy, sx], order=1, mode="nearest")
        for c in range(3)
    ], axis=2)
    changed = color.copy()
    changed[upper] = sampled[upper]
    # Retain the same source outside-body ink as the frozen torso recipe.
    outer = nd.distance_transform_edt(original[:, :, 3] > 0) <= 3
    edge = mask & outer & (original[:, :, :3].mean(axis=2) < 50)
    changed[edge] = original[edge, :3]
    assert np.array_equal(changed[~upper], color[~upper])
    return mask, changed, progress, upper


def prepare_frame(fitter, original, guide, semantic, limbs, points):
    torso_mask, color, torso_progress, upper = refined_torso(
        fitter, ITEM_ID, original, semantic, guide["points"]
    )
    owned = torso_mask.copy()
    rgb = color.copy()
    rejected_blends = np.zeros_like(owned)
    for side in ("far", "near"):
        mask, sleeve_color, _ = fitter.old.sleeve(ITEM_ID, side, original, limbs, points)
        shoulder = fitter.old.point(points, side + "Shoulder")
        outer = nd.distance_transform_edt(original[:, :, 3] > 0) <= 3
        lum = original[:, :, :3].mean(axis=2)
        outline = mask & outer & (lum < 55)
        factor = np.clip(lum / np.maximum(sleeve_color.mean(axis=2), 1), .2, .75)
        sleeve_color[outline] *= factor[outline, None]
        rgb[mask] = sleeve_color[mask]
        owned |= mask
        distance_arm = nd.distance_transform_edt(~mask)
        distance_torso = nd.distance_transform_edt(~torso_mask)
        radius = np.hypot(fitter.XX - shoulder[0], fitter.YY - shoulder[1])
        local = (radius < 72) & (torso_progress < .52) & (mask | torso_mask)
        signed = np.where(mask, distance_torso, -distance_arm)
        weight = np.clip(.5 + signed / 28, 0, 1)
        blendcolor = color * (1 - weight[..., None]) + sleeve_color * weight[..., None]
        transition = local & (np.abs(signed) < 14) & ~outline
        plain_pair = navy(color) & navy(sleeve_color)
        rejected_blends |= transition & ~plain_pair
        rgb[transition & plain_pair] = blendcolor[transition & plain_pair]
        # A hard torso/sleeve switch exposed a vertical cut in the collar in
        # prototype 1. Feather its last five torso pixels toward sleeve navy;
        # never transfer ivory from torso into sleeve-owned pixels.
        collar_edge = transition & ~plain_pair & ~mask & navy(sleeve_color)
        narrow_weight = np.clip(1 - distance_arm / 5, 0, 1)
        narrow_color = color * (1 - narrow_weight[..., None]) + sleeve_color * narrow_weight[..., None]
        rgb[collar_edge] = narrow_color[collar_edge]
    protected = (protected_mask(guide) | semantic["head"] | semantic["nearHand"]
                 | semantic["farHand"] | semantic["shoes"] | limbs["neckSkin"])
    owned &= ~protected & (original[:, :, 3] > 0)
    patch = np.zeros_like(original)
    patch[owned, :3] = np.rint(np.clip(rgb[owned], 0, 255)).astype(np.uint8)
    patch[owned, 3] = original[owned, 3]
    return patch, owned, upper | rejected_blends, torso_progress


def finish_patch(sampled, sampled_owned, baseline, owned):
    candidate = np.zeros_like(baseline)
    shared = owned & sampled_owned
    candidate[shared, :3] = sampled[shared, :3]
    remainder = owned & ~sampled_owned
    if remainder.any():
        nearest = nd.distance_transform_edt(~shared, return_distances=False, return_indices=True)
        candidate[remainder, :3] = sampled[tuple(nearest)][remainder, :3]
    candidate[:, :, 3] = baseline[:, :, 3]
    return candidate, remainder


def preview(output, frame_id, original, before, after, owned, bottom):
    pairs = []
    pants, pants_owned = bottom
    for patch in (before, after):
        composed = original.copy()
        composed[pants_owned] = pants[pants_owned]
        composed[owned] = patch[owned]
        pairs.append(Image.fromarray(composed))
    if frame_id in DETAIL_KEYS:
        yy, xx = np.where(owned)
        box = (max(0, int(xx.min()) - 12), max(0, int(yy.min()) - 12),
               min(704, int(xx.max()) + 13), min(1056, int(yy.max()) + 13))
        w, h = box[2] - box[0], box[3] - box[1]
        board = Image.new("RGB", (w * 2, h + 28), "#eee9df")
        draw = ImageDraw.Draw(board)
        for index, art in enumerate(pairs):
            crop = art.crop(box)
            board.paste(crop, (index * w, 28), crop)
            draw.text((index * w + 8, 8), f"OFFLINE / {frame_id} / {'V1' if index == 0 else 'V2'}", fill="#304036")
        board.save(output / f"pose-{frame_id:03}-comparison-native.png")
    tile = Image.new("RGB", (704, 552), "#eee9df")
    draw = ImageDraw.Draw(tile)
    for index, art in enumerate(pairs):
        small = art.resize((352, 528), Image.Resampling.LANCZOS)
        tile.paste(small, (352 * index, 24), small)
        draw.text((352 * index + 8, 7), f"OFFLINE / {frame_id} / {'V1' if index == 0 else 'V2'}", fill="#304036")
    return tile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True, help="New immutable output directory")
    parser.add_argument("--prototype", action="store_true")
    parser.add_argument("--garment-output", type=Path)
    args = parser.parse_args()
    output = OUT / args.run
    if output.exists():
        parser.error("Run already exists; retain it and choose a new name")
    garment_output = args.garment_output.resolve() if args.garment_output else ROOT / f"docs/kling-wardrobe/garments/male/{ITEM_ID}.zip"
    if not args.prototype and garment_output.exists():
        parser.error("Garment output exists; existing revisions are immutable")
    recipe = load_recipe()
    fitter = recipe.load_fitter()
    image_path = recipe.SOURCE / "design.png"
    definition_path = recipe.SOURCE / "donor.json"
    donor = recipe.ClothDonor(image_path, definition_path)
    fitter.old.DESIGN = image_path
    fitter.old.DONORS = {ITEM_ID: donor.definition}
    fitter.old.polygon_mask = donor.polygon
    fitter.old.donor_texture = donor.texture
    fitter.old.sample = donor.sample
    valid = donor.polygon(donor.definition["torso"])
    for excluded in donor.definition.get("excludedPolygons", {}).get("torso", []):
        valid &= ~donor.polygon(excluded)
    plain = nd.binary_erosion(valid, iterations=2) & navy(donor.rgb)
    nearest = nd.distance_transform_edt(~plain, return_distances=False, return_indices=True)
    fitter.upper_torso_texture = nd.gaussian_filter(donor.rgb[tuple(nearest)], sigma=(4, 4, 0))
    source_bytes, source_manifest, _, frames = load_source("male")
    author = MaleLimbOwnership()
    baseline = fitter.read_bank(BASE)
    bottom = fitter.read_bank(ROOT / "docs/kling-wardrobe/garments/male/ochre-chinos-v1.zip")
    baseline_hash = sha(BASE.read_bytes())
    with zipfile.ZipFile(BASE) as archive:
        baseline_manifest = json.loads(archive.read("manifest.json"))
    assert baseline_manifest["sourceSha256"] == sha(source_bytes)
    assert baseline_manifest["registrationSha256"] == sha(author.registration_bytes)
    output.mkdir(parents=True)
    prepared, audits, tiles = {}, [], []
    for frame_id in (KEYS if args.prototype else sorted(frames)):
        original = frames[frame_id]
        semantic = author.semantic(frame_id)
        limbs = author.for_frame(frame_id, original)
        points = author.points(frame_id)
        before, owned = baseline[frame_id]
        old_sampled, old_owned = fitter.prepare_frame(
            ITEM_ID, original, author.guides[frame_id], semantic, limbs, points
        )
        reproduced, _ = finish_patch(old_sampled, old_owned, before, owned)
        assert np.array_equal(reproduced, before), (frame_id, "Frozen V1 recipe no longer reproduces published RGB")
        sampled, sampled_owned, allowed, torso_progress = prepare_frame(
            fitter, original, author.guides[frame_id], semantic, limbs, points
        )
        after, remainder = finish_patch(sampled, sampled_owned, before, owned)
        changed = np.any(before[:, :, :3] != after[:, :, :3], axis=2)
        assert not (changed & ~(allowed | remainder)).any(), (frame_id, "Unbounded RGB change")
        assert np.array_equal(before[:, :, 3], after[:, :, 3])
        assert not after[~owned].any()
        assert not (changed & (torso_progress >= .52)).any(), (frame_id, "Lower torso/waist changed")
        protected = protected_mask(author.guides[frame_id]) | semantic["head"] | semantic["nearHand"] | semantic["farHand"] | limbs["neckSkin"]
        assert not (changed & protected).any()
        composed = original.copy()
        composed[owned] = after[owned]
        assert np.array_equal(composed[~owned], original[~owned])
        assert np.array_equal(composed[:, :, 3], original[:, :, 3])
        prepared[frame_id] = (after, owned)
        audits.append({"frameId": frame_id, "changedRgbPixels": int(changed.sum()),
                       "ownedPixels": int(owned.sum()), "remainderPixels": int(remainder.sum()),
                       "publishedV1RecipeReproduced": True, "boundedRgbChanges": True,
                       "ownershipExact": True, "alphaExact": True, "protectedRgbaExact": True,
                       "outsideOwnershipRgbaExact": True, "lowerTorsoAndWaistRgbExact": True})
        if frame_id in KEYS:
            tiles.append(preview(output, frame_id, original, before, after, owned, bottom[frame_id]))
        print(json.dumps({"frameId": frame_id, "changedRgbPixels": int(changed.sum())}), flush=True)
    # Half-size boards retain all neighbor comparisons without large duplicate PNGs.
    for name, ids in (("run", (0, 58, 59, 60)), ("raised-arms", (77, 78, 79)),
                      ("crouch", (85, 86, 87)), ("flight", (95, 96, 97)),
                      ("landing", (103, 104, 105))):
        selected = [tiles[KEYS.index(fid)] for fid in ids]
        board = Image.new("RGB", (704, 552 * len(selected)), "#eee9df")
        for index, tile in enumerate(selected):
            board.paste(tile, (0, 552 * index))
        board.save(output / f"offline-{name}-neighbors.jpg", quality=92)
    report = {"revision": ITEM_ID, "prototype": args.prototype,
              "recipe": str(Path(__file__).relative_to(ROOT)),
              "base": str(BASE.relative_to(ROOT)), "baseSha256": baseline_hash,
              "sourceSha256": sha(source_bytes), "registrationSha256": sha(author.registration_bytes),
              "donorSha256": sha(image_path.read_bytes()), "donorDefinitionSha256": sha(definition_path.read_bytes()),
              "changes": ["Negative upper torso progress extrapolates donor Y into cloth-only navy padding; nonnegative torso samples stay exact.",
                          "Broad shoulder blending is navy-only; ivory has a five-pixel torso-side feather and never spreads into sleeves."],
              "preserved": ["Published V1 ownership and alpha", "Protected source pixels and source body proportions",
                            "Lower torso and waist RGB", "Source frame IDs, dimensions, anchors and animation timing"],
              "sourceAnimationsSha256": sha(json.dumps(source_manifest["animations"], sort_keys=True).encode()),
              "poses": audits, "visualStatus": "Offline candidate; actual application review required."}
    if not args.prototype:
        report["item"] = save_garment(
            "male", ITEM_ID, "Midnight sailor shirt · refined collar", "top", author.registration_bytes, prepared,
            f"Bounded V2 RGB registration of midnight-sailor-v1 SHA256 {baseline_hash}. "
            f"Reuses original painted donor SHA256 {report['donorSha256']} and cloth-only trace SHA256 {report['donorDefinitionSha256']}. "
            "Only donor Y is extrapolated into cloth-only navy padding above the torso mapping's former upper clamp. "
            "Broad shoulder blending is navy-only; a five-pixel torso-side feather softens the collar edge without spreading ivory into sleeves. "
            "All V1 ownership/alpha and lower torso/waist RGB remain exact. Source body, protected pixels, proportions, anchors, frames and timing remain exact. "
            "No new anatomy, silhouette, cloth simulation or source motion. Recipe scripts/prepare-kling-midnight-sailor-refinement.py.",
            output=garment_output,
        )
        with zipfile.ZipFile(BASE) as old_zip, zipfile.ZipFile(garment_output) as new_zip:
            manifest = json.loads(new_zip.read("manifest.json"))
            assert manifest["frames"] == baseline_manifest["frames"]
            assert manifest["pages"] == baseline_manifest["pages"]
            for page in manifest["pages"]:
                assert old_zip.read(page["maskFile"]) == new_zip.read(page["maskFile"])
        report["ownershipPngBytesExact"] = True
        report["frameAndPageRecordsExact"] = True
    assert sha(BASE.read_bytes()) == baseline_hash
    (output / "audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(output), "item": report.get("item")}))


if __name__ == "__main__":
    main()
