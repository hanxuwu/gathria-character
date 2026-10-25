#!/usr/bin/env python3
"""Register newly painted sailor cloth using the delivered full-pose template.

The generated reference supplies clothing RGB only. Reviewed Teal joined sleeve
V5 supplies exact ownership and alpha; no generated anatomy reaches the bank.
The resulting template garment goes through the browser painting-kit workflow
before its final reusable garment is published to the library.
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
from kling_wardrobe_common import ROOT, load_source, protected_mask, save_garment, sha


SOURCE = ROOT / "artwork/kling-expression-shirt/source/shirt"
PREPARED = ROOT / "artwork/kling-expression-shirt/prepared/shirt"
BASE = ROOT / "docs/kling-wardrobe/garments/male/teal-camp-shirt-v5.zip"
ITEM_ID = "midnight-sailor-template-v1"
ITEM_NAME = "Midnight sailor template"
KEYS = (0, 55, 58, 59, 60, 86, 104)


def load_fitter():
    spec = importlib.util.spec_from_file_location(
        "midnight_sailor_fit", ROOT / "scripts/prepare-kling-male-fit-polish.py"
    )
    fit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fit)
    return fit


class ClothDonor:
    def __init__(self, image_path: Path, definition_path: Path):
        self.rgb = np.asarray(Image.open(image_path).convert("RGB"), dtype=np.float32)
        self.definition = json.loads(definition_path.read_text())
        assert list(Image.open(image_path).size) == self.definition["imageSize"]

    def polygon(self, points, size=None):
        size = size or (self.rgb.shape[1], self.rgb.shape[0])
        canvas = Image.new("L", size)
        ImageDraw.Draw(canvas).polygon([tuple(p) for p in points], fill=255)
        return np.asarray(canvas) > 0

    @lru_cache(maxsize=3)
    def texture(self, item, region):
        # These are manually traced cloth-only domains on the actual donor.
        # Padding can only use navy interior fabric, never cream trim, a bow,
        # backdrop, or generated skin. Actual inner painted detail is retained.
        valid = self.polygon(self.definition[region])
        r, g, b = np.moveaxis(self.rgb, 2, 0)
        for excluded in self.definition.get("excludedPolygons", {}).get(region, []):
            valid &= ~self.polygon(excluded)
        inside = nd.binary_erosion(valid, iterations=2)
        plain = inside & (b > r + 8) & (b > g + 1) & (b < 170)
        assert plain.sum() > 100, (region, "No plain navy cloth for padding")
        nearest = nd.distance_transform_edt(
            ~plain, return_distances=False, return_indices=True
        )
        texture = nd.gaussian_filter(self.rgb[tuple(nearest)], sigma=(4, 4, 0))
        texture[inside] = self.rgb[inside]
        return texture, inside

    def sample(self, item, region, sx, sy):
        texture, _ = self.texture(item, region)
        return np.stack(
            [nd.map_coordinates(texture[:, :, c], [sy, sx], order=1, mode="nearest") for c in range(3)],
            axis=2,
        )


def prototype_image(source, candidate, owned, bottom):
    composed = source.copy()
    pants, pants_owned = bottom
    composed[pants_owned] = pants[pants_owned]
    composed[owned] = candidate[owned]
    return Image.fromarray(composed)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prototype", action="store_true")
    parser.add_argument("--run", required=True, help="New output directory, never overwritten")
    args = parser.parse_args()
    output_dir = PREPARED / args.run
    if output_dir.exists():
        parser.error("Output run already exists; retain it and choose a new run name.")
    image_path = SOURCE / "design.png"
    definition_path = SOURCE / "donor.json"
    donor = ClothDonor(image_path, definition_path)
    fitter = load_fitter()
    fitter.old.DESIGN = image_path
    fitter.old.DONORS = {ITEM_ID: donor.definition}
    fitter.old.polygon_mask = donor.polygon
    fitter.old.donor_texture = donor.texture
    fitter.old.sample = donor.sample

    source_bytes, _, _, frames = load_source("male")
    author = MaleLimbOwnership()
    with zipfile.ZipFile(BASE) as archive:
        baseline_manifest = json.loads(archive.read("manifest.json"))
    assert baseline_manifest["sourceSha256"] == sha(source_bytes)
    assert baseline_manifest["registrationSha256"] == sha(author.registration_bytes)
    baseline = fitter.read_bank(BASE)
    bottom = fitter.read_bank(ROOT / "docs/kling-wardrobe/garments/male/ochre-chinos-v1.zip")
    output_dir.mkdir(parents=True)
    (output_dir / "donor.json").write_bytes(definition_path.read_bytes())
    prepared = {}
    audits = []
    contact_tiles = []

    for frame_id in (KEYS if args.prototype else sorted(frames)):
        original = frames[frame_id]
        semantic = author.semantic(frame_id)
        limbs = author.for_frame(frame_id, original)
        sampled, sampled_owned = fitter.prepare_frame(
            ITEM_ID, original, author.guides[frame_id], semantic, limbs, author.points(frame_id)
        )
        baseline_patch, owned = baseline[frame_id]
        candidate = np.zeros_like(baseline_patch)
        shared = owned & sampled_owned
        candidate[shared, :3] = sampled[shared, :3]
        # V5's repaired sleeve tip in pose 59 extends beyond V2 fitting's
        # sampling domain. Complete that small existing owned region from its
        # nearest newly sampled cloth. No new ownership or body pixels appear.
        remainder = owned & ~sampled_owned
        if remainder.any():
            nearest = nd.distance_transform_edt(
                ~shared, return_distances=False, return_indices=True
            )
            candidate[remainder, :3] = sampled[tuple(nearest)][remainder, :3]
        candidate[:, :, 3] = baseline_patch[:, :, 3]
        protected = protected_mask(author.guides[frame_id])
        assert not (owned & protected & (original[:, :, 3] > 0)).any()
        assert np.array_equal(candidate[:, :, 3], baseline_patch[:, :, 3])
        assert not candidate[~owned].any()
        composed = original.copy()
        composed[owned] = candidate[owned]
        assert np.array_equal(composed[~owned], original[~owned])
        assert np.array_equal(composed[:, :, 3], original[:, :, 3])
        assert np.array_equal(composed[protected], original[protected])
        prepared[frame_id] = (candidate, owned)
        audits.append({
            "frameId": frame_id,
            "ownedPixels": int(owned.sum()),
            "changedClothingRgbPixels": int(np.any(candidate[:, :, :3] != baseline_patch[:, :, :3], axis=2).sum()),
            "nearestClothCompletionPixels": int(remainder.sum()),
            "ownershipExact": True,
            "alphaExact": True,
            "outsideOwnershipRgbaExact": True,
            "protectedRgbaExact": True,
        })
        if frame_id in KEYS:
            art = prototype_image(original, candidate, owned, bottom[frame_id])
            art.save(output_dir / f"pose-{frame_id:03}-native.png")
            yy, xx = np.where(owned)
            box = (max(0, int(xx.min()) - 24), max(0, int(yy.min()) - 24), min(704, int(xx.max()) + 25), min(1056, int(yy.max()) + 25))
            crop = art.crop(box)
            crop.resize((crop.width * 2, crop.height * 2), Image.Resampling.NEAREST).save(output_dir / f"pose-{frame_id:03}-cloth-2x.png")
            tile = Image.new("RGBA", (352, 552), "#eee9df")
            tile.alpha_composite(art.resize((352, 528), Image.Resampling.LANCZOS), (0, 24))
            ImageDraw.Draw(tile).text((8, 7), f"OFFLINE candidate / pose {frame_id}", fill="#304036")
            contact_tiles.append(tile)
        print(json.dumps({"frameId": frame_id, "complete": len(prepared)}), flush=True)

    contact = Image.new("RGB", (352 * 4, 552 * ((len(contact_tiles) + 3) // 4)), "#eee9df")
    for index, tile in enumerate(contact_tiles):
        contact.paste(tile, (index % 4 * 352, index // 4 * 552))
    contact.save(output_dir / "offline-contact.png")
    report = {
        "design": "Midnight sailor shirt: newly painted navy cloth, cream sailor collar with inset stripes, short knotted neckerchief and trimmed short sleeves.",
        "artSource": str(image_path.relative_to(ROOT)),
        "artSha256": sha(image_path.read_bytes()),
        "donorDefinitionSha256": sha(definition_path.read_bytes()),
        "templateSha256": sha(author.template_bytes),
        "sourceSha256": sha(source_bytes),
        "registrationSha256": sha(author.registration_bytes),
        "ownershipBase": str(BASE.relative_to(ROOT)),
        "ownershipBaseSha256": sha(BASE.read_bytes()),
        "prototype": args.prototype,
        "poses": audits,
        "visualStatus": "Offline candidate; browser roundtrip and actual export review required.",
    }
    if not args.prototype:
        path = output_dir / f"{ITEM_ID}.zip"
        report["item"] = save_garment(
            "male", ITEM_ID, ITEM_NAME, "top", author.registration_bytes, prepared,
            f"New OpenAI sailor-shirt painting {image_path.relative_to(ROOT)} SHA256 {report['artSha256']}. "
            "Only manually traced clothing RGB is used; generated anatomy and backdrop are discarded. "
            f"Exact reviewed ownership and alpha from teal-camp-shirt-v5 SHA256 {report['ownershipBaseSha256']}. "
            "Complete offline pose registration from the delivered male template; all source pixels outside clothing, "
            "protected head/hands, source alpha, frame IDs, anchor and timing remain exact. "
            "Nearest new-cloth completion supplies existing reviewed sleeve ownership missing from the older sampler. "
            "New sailor collar, neckerchief and sleeve trim are painted artwork, not a palette transformation. "
            "No cloth simulation or automatic new-silhouette fitting. Recipe scripts/prepare-kling-midnight-sailor.py. "
            "This template bank is the input for the browser painting-kit roundtrip.", output=path,
        )
        with zipfile.ZipFile(BASE) as old_zip, zipfile.ZipFile(path) as new_zip:
            new_manifest = json.loads(new_zip.read("manifest.json"))
            assert new_manifest["frames"] == baseline_manifest["frames"]
            assert new_manifest["pages"] == baseline_manifest["pages"]
            for page in baseline_manifest["pages"]:
                assert old_zip.read(page["maskFile"]) == new_zip.read(page["maskFile"])
        report["ownershipPngBytesExact"] = True
        report["frameRecordsExact"] = True
    (output_dir / "audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output": str(output_dir), "item": report.get("item")}))


if __name__ == "__main__":
    main()
