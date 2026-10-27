#!/usr/bin/env python3
"""Register three newly painted tops on the immutable reviewed male shirt cut.

Only manually traced cloth RGB from the retained design sheet is sampled. The
released teal V5 bank supplies every ownership pixel, alpha value and crop for
all 88 source poses. No generated body or background is used. This is new cloth
artwork on an existing cut, not automatic fitting of a new silhouette.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import importlib.util
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd

from kling_male_limb_ownership import MaleLimbOwnership
from kling_wardrobe_common import ROOT, load_source, protected_mask, sha


SOURCE = ROOT / "artwork/kling-collection/source/warm-date-v1"
OUTPUT = ROOT / "artwork/kling-collection/prepared/warm-date-v1/male"
BASE = ROOT / "docs/kling-wardrobe/garments/male/teal-camp-shirt-v5.zip"
KEYS = (0, 35, 51, 55, 58, 59, 60, 77, 78, 79, 85, 86, 87, 95, 96, 97, 103, 104, 105)


def load_fitter():
    spec = importlib.util.spec_from_file_location(
        "warm_date_male_fit", ROOT / "scripts/prepare-kling-male-fit-polish.py"
    )
    fitter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fitter)
    return fitter


class Bank:
    """Keep atlas pages, decoding only a requested pose into native coordinates."""

    def __init__(self, path):
        self.path = Path(path)
        with zipfile.ZipFile(path) as archive:
            assert archive.testzip() is None
            self.files = {name: archive.read(name) for name in archive.namelist()}
        self.manifest = json.loads(self.files["manifest.json"])
        self.frames = {f["frameId"]: f for f in self.manifest["frames"]}
        self.pages = [
            np.asarray(Image.open(io.BytesIO(self.files[p["file"]])).convert("RGBA")).copy()
            for p in self.manifest["pages"]
        ]
        self.masks = [
            np.asarray(Image.open(io.BytesIO(self.files[p["maskFile"]])).convert("RGBA"))[:, :, 3] > 0
            for p in self.manifest["pages"]
        ]

    def frame(self, frame_id):
        entry = self.frames[frame_id]
        rect, offset = entry["rect"], entry["offset"]
        crop = np.s_[rect["y"]:rect["y"] + rect["height"], rect["x"]:rect["x"] + rect["width"]]
        destination = np.s_[offset["y"]:offset["y"] + rect["height"], offset["x"]:offset["x"] + rect["width"]]
        rgba = np.zeros((1056, 704, 4), np.uint8)
        owned = np.zeros((1056, 704), bool)
        rgba[destination] = self.pages[entry["page"]][crop]
        owned[destination] = self.masks[entry["page"]][crop]
        return rgba, owned

    def put(self, pages, frame_id, rgba):
        entry = self.frames[frame_id]
        rect, offset = entry["rect"], entry["offset"]
        crop = np.s_[rect["y"]:rect["y"] + rect["height"], rect["x"]:rect["x"] + rect["width"]]
        native = np.s_[offset["y"]:offset["y"] + rect["height"], offset["x"]:offset["x"] + rect["width"]]
        assert np.array_equal(pages[entry["page"]][crop][:, :, 3], rgba[native][:, :, 3])
        pages[entry["page"]][crop] = rgba[native]

    def write(self, pages, target, item, name, provenance):
        assert not target.exists(), f"Preserve existing output: {target}"
        files = dict(self.files)
        manifest = dict(self.manifest)
        manifest.update(id=item, name=name, provenance=provenance)
        files["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
        for spec, before, after in zip(manifest["pages"], self.pages, pages):
            assert np.array_equal(before[:, :, 3], after[:, :, 3])
            png = io.BytesIO()
            Image.fromarray(after).save(png, format="PNG", compress_level=9)
            files[spec["file"]] = png.getvalue()
            assert files[spec["maskFile"]] == self.files[spec["maskFile"]]
        with zipfile.ZipFile(target, "w") as archive:
            for filename, data in sorted(files.items()):
                info = zipfile.ZipInfo(filename, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, data)
        assert target.stat().st_size < 64 * 1024 * 1024
        return {"id": item, "name": name, "slot": "top", "file": str(target.relative_to(ROOT)),
                "sha256": sha(target.read_bytes()), "bytes": target.stat().st_size}


class Donor:
    """Explicit cloth and plain-material polygons avoid colour-based skin guesses."""

    def __init__(self, definition_path):
        self.record = json.loads(definition_path.read_text())
        self.path = definition_path.parent / self.record["image"]
        image = Image.open(self.path).convert("RGBA")
        assert list(image.size) == self.record["imageSize"]
        pixels = np.asarray(image)
        self.rgb = pixels[:, :, :3].astype(np.float32)
        self.opaque = pixels[:, :, 3] > 200
        self.definitions = self.record["items"]

    def polygon(self, points, size=None):
        canvas = Image.new("L", size or (self.rgb.shape[1], self.rgb.shape[0]))
        ImageDraw.Draw(canvas).polygon([tuple(p) for p in points], fill=255)
        return np.asarray(canvas) > 0

    @lru_cache(maxsize=3)
    def texture(self, item, region):
        definition = self.definitions[item]
        valid = self.polygon(definition[region]) & self.opaque
        for points in definition.get("excludedPolygons", {}).get(region, []):
            valid &= ~self.polygon(points)
        inside = nd.binary_erosion(valid, iterations=2)
        plain = np.zeros_like(inside)
        for points in definition["paddingPolygons"][region]:
            plain |= self.polygon(points)
        plain &= inside
        assert plain.sum() > 30, (item, region, "Trace plain donor cloth for safe padding")
        nearest = nd.distance_transform_edt(~plain, return_distances=False, return_indices=True)
        padding = nd.gaussian_filter(self.rgb[tuple(nearest)], sigma=(3, 3, 0))
        tile_box = definition.get("paddingTileBox", {}).get(region)
        if tile_box:
            # Knit fabric needs its real cable texture beyond the front donor
            # boundary. Reflect one explicitly traced, detail-only cloth patch;
            # unlike nearest-colour completion this does not form a flat strip.
            left, top, right, bottom = tile_box
            assert inside[top:bottom, left:right].all(), (item, region, "Unsafe fabric tile")
            yy, xx = np.indices(inside.shape, dtype=np.float32)
            def reflected(values, start, stop):
                span = stop - start - 1
                phase = np.mod(values - start, span * 2)
                return start + np.where(phase <= span, phase, span * 2 - phase)
            sx, sy = reflected(xx, left, right), reflected(yy, top, bottom)
            padding = np.stack([
                nd.map_coordinates(self.rgb[:, :, c], [sy, sx], order=1, mode="nearest")
                for c in range(3)
            ], axis=2)
            padding = nd.gaussian_filter(padding, sigma=(.6, .6, 0))
        texture = padding.copy()
        texture[inside] = self.rgb[inside]
        return texture, padding, inside

    def sample(self, item, region, sx, sy, plain=False):
        texture = self.texture(item, region)[1 if plain else 0]
        return np.stack([
            nd.map_coordinates(texture[:, :, c], [sy, sx], order=1, mode="nearest")
            for c in range(3)
        ], axis=2)


def prepare_frame(fitter, donor, item, original, guide, semantic, limbs, points):
    torso_mask, torso_color, progress = fitter.torso(item, original, semantic, guide["points"])
    definition = donor.definitions[item]
    xx, yy = fitter.XX, fitter.YY
    neck = fitter.old.point(guide["points"], "neck")
    wl, wr = (fitter.old.point(guide["points"], name) for name in ("waistLeft", "waistRight"))
    waist_y = wl[1] + (xx - wl[0]) * (wr[1] - wl[1]) / max(1, wr[0] - wl[0])
    extent = float(np.percentile((yy - waist_y)[torso_mask], 99.9))
    raw = (yy - neck[1] + 10) / np.maximum(60, waist_y + extent - neck[1] + 10)
    upper = raw < 0
    axis = np.asarray(definition["axis"])
    sx = axis[0, 0] + (xx - neck[0]) / (max(110, wr[0] - wl[0]) * 1.06) * definition["width"][0]
    sy = axis[0, 1] + raw * (axis[1, 1] - axis[0, 1])
    upper_color = donor.sample(item, "torso", sx, sy, plain=True)
    torso_color[upper] = upper_color[upper]
    outer = nd.distance_transform_edt(original[:, :, 3] > 0) <= 3
    luminance = original[:, :, :3].mean(axis=2)
    edge = torso_mask & outer & (luminance < 50)
    torso_color[edge] = original[edge, :3]
    rgb, sampled_owned = torso_color.copy(), torso_mask.copy()
    for side in ("far", "near"):
        mask, sleeve, _ = fitter.old.sleeve(item, side, original, limbs, points)
        outline = mask & outer & (luminance < 55)
        factor = np.clip(luminance / np.maximum(sleeve.mean(axis=2), 1), .2, .75)
        sleeve[outline] *= factor[outline, None]
        rgb[mask] = sleeve[mask]
        sampled_owned |= mask
        # Blend compatible fabric only. A cream sleeve under a cocoa vest keeps
        # its intentional garment boundary; contrasting collars never smear out.
        shoulder = fitter.old.point(points, side + "Shoulder")
        arm_distance = nd.distance_transform_edt(~mask)
        torso_distance = nd.distance_transform_edt(~torso_mask)
        local = (np.hypot(xx - shoulder[0], yy - shoulder[1]) < 72) & (progress < .52)
        signed = np.where(mask, torso_distance, -arm_distance)
        compatible = np.linalg.norm(torso_color - sleeve, axis=2) < 45
        transition = local & (mask | torso_mask) & (np.abs(signed) < 8) & compatible & ~outline
        weight = np.clip(.5 + signed / 16, 0, 1)
        blended = torso_color * (1 - weight[..., None]) + sleeve * weight[..., None]
        rgb[transition] = blended[transition]
    protected = (protected_mask(guide) | semantic["head"] | semantic["nearHand"]
                 | semantic["farHand"] | semantic["shoes"] | limbs["neckSkin"])
    sampled_owned &= ~protected & (original[:, :, 3] > 0)
    return rgb, sampled_owned, protected


def make_contact(images, path, item):
    width, height = 264, 420
    sheet = Image.new("RGB", (width * 5, height * ((len(images) + 4) // 5)), "#ece6dd")
    draw = ImageDraw.Draw(sheet)
    for index, (frame_id, image) in enumerate(images):
        x, y = (index % 5) * width, (index // 5) * height
        art = image.resize((264, 396), Image.Resampling.LANCZOS)
        sheet.paste(art, (x, y + 24), art)
        draw.text((x + 7, y + 7), f"{item} / {frame_id}", fill="#40352f")
    sheet.save(path, quality=94)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, help="Fresh retained run directory")
    parser.add_argument("--prototype", action="store_true")
    parser.add_argument("--item")
    parser.add_argument("--definitions", type=Path, default=SOURCE / "male-donors.json")
    args = parser.parse_args()
    output = OUTPUT / args.run
    if output.exists():
        parser.error("Preserve the existing run and choose a fresh --run name.")
    donor = Donor(args.definitions)
    if args.item and args.item not in donor.definitions:
        parser.error("Unknown item")
    fitter = load_fitter()
    fitter.old.DESIGN = donor.path
    fitter.old.DONORS = donor.definitions
    fitter.old.polygon_mask = donor.polygon
    fitter.old.sample = donor.sample
    author = MaleLimbOwnership()
    source_bytes, _, _, source = load_source("male")
    baseline = Bank(BASE)
    assert len(source) == len(baseline.frames) == 88
    assert baseline.manifest["sourceSha256"] == sha(source_bytes)
    assert baseline.manifest["registrationSha256"] == sha(author.registration_bytes)
    assert set(source) == set(baseline.frames) == set(author.guides)
    output.mkdir(parents=True)
    definitions_bytes = args.definitions.read_bytes()
    (output / "male-donors.json").write_bytes(definitions_bytes)
    report = {"prototype": args.prototype, "sourceSha256": sha(source_bytes),
              "registrationSha256": sha(author.registration_bytes), "baseline": str(BASE.relative_to(ROOT)),
              "baselineSha256": sha(BASE.read_bytes()), "donor": str(donor.path.relative_to(ROOT)),
              "donorSha256": sha(donor.path.read_bytes()), "definitionsSha256": sha(definitions_bytes),
              "items": [], "poses": [], "status": "Offline authored cloth; browser export review is separate."}
    for item in ([args.item] if args.item else donor.definitions):
        definition = donor.definitions[item]
        donor.texture.cache_clear()
        bottom = Bank(ROOT / f'docs/kling-wardrobe/garments/male/{definition["bottom"]}.zip')
        pages = [p.copy() for p in baseline.pages]
        images = []
        frame_ids = [frame_id for frame_id in KEYS if frame_id in source] if args.prototype else sorted(source)
        for frame_id in frame_ids:
            original = source[frame_id]
            before, owned = baseline.frame(frame_id)
            semantic = author.semantic(frame_id)
            limbs = author.for_frame(frame_id, original)
            rgb, sampled_owned, protected = prepare_frame(
                fitter, donor, item, original, author.guides[frame_id], semantic, limbs, author.points(frame_id)
            )
            shared = owned & sampled_owned
            remainder = owned & ~sampled_owned
            after = before.copy()
            after[shared, :3] = np.rint(np.clip(rgb[shared], 0, 255)).astype(np.uint8)
            if remainder.any():
                nearest = nd.distance_transform_edt(~shared, return_distances=False, return_indices=True)
                after[remainder, :3] = after[tuple(nearest)][remainder, :3]
            # V5 deliberately repaired pose 59 beyond the older sampler's
            # semantic sleeve labels. Its reviewed ownership is authoritative;
            # registered head/hand polygons remain an unconditional prohibition.
            registered_protected = protected_mask(author.guides[frame_id])
            assert not (owned & registered_protected & (original[:, :, 3] > 0)).any(), (item, frame_id, "registered protection")
            protected = registered_protected | (protected & ~owned)
            assert np.array_equal(after[:, :, 3], before[:, :, 3])
            assert np.array_equal(after[~owned], before[~owned])
            assert not after[~owned].any()
            composite = original.copy()
            composite[owned] = after[owned]
            assert np.array_equal(composite[~owned], original[~owned])
            assert np.array_equal(composite[protected], original[protected])
            assert np.array_equal(composite[:, :, 3], original[:, :, 3])
            baseline.put(pages, frame_id, after)
            report["poses"].append({"item": item, "frameId": frame_id,
                                    "ownedPixels": int(owned.sum()), "completionPixels": int(remainder.sum()),
                                    "changedClothRgbPixels": int(np.any(after[:, :, :3] != before[:, :, :3], axis=2).sum()),
                                    "rgbaSha256": sha(after.tobytes()), "ownershipSha256": sha(owned.tobytes()),
                                    "ownershipExact": True, "alphaExact": True, "protectedExact": True})
            if frame_id in KEYS:
                pants, pants_owned = bottom.frame(frame_id)
                preview = original.copy()
                preview[pants_owned] = pants[pants_owned]
                preview[owned] = after[owned]
                image = Image.fromarray(preview)
                images.append((frame_id, image))
                if frame_id in (0, 59, 78, 86, 96, 104):
                    image.save(output / f"{item}-{frame_id:03}-native.png")
            print(json.dumps({"item": item, "frameId": frame_id}), flush=True)
        make_contact(images, output / f"{item}-contact.jpg", item)
        if not args.prototype:
            provenance = (
                f'New OpenAI clothing donor {donor.path.relative_to(ROOT)} SHA256 {report["donorSha256"]}. '
                f'Manually reviewed cloth-only polygons and plain-material padding in {args.definitions.relative_to(ROOT)} '
                f'SHA256 {report["definitionsSha256"]}. Generated head, skin, body, trousers and background discarded. '
                f'Exact teal-camp-shirt-v5 ownership, alpha, atlas crops and 88 source-pose bindings; baseline SHA256 {report["baselineSha256"]}. '
                'New collar, placket, knit and panel artwork on the reviewed short-sleeve cut, not a palette-only variant. '
                'Only explicit donor cloth supplies RGB; hidden donor material is neighboring-cloth authoring completion. '
                'Original protected head, neck, hands, source coordinates, action timing and anchors remain exact. '
                'Offline registration, no new silhouette, skeleton or runtime generation.'
            )
            report["items"].append(baseline.write(pages, output / f"{item}.zip", item, definition["name"], provenance))
        (output / "audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(output), "items": report["items"], "poses": len(report["poses"])}))


if __name__ == "__main__":
    main()
