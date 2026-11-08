#!/usr/bin/env python3
"""Repair reviewed sleeve/underarm omissions using the existing painted donor.

The source and shared registration are immutable. Each cuff review belongs to
this wedding top only; its retained hand polygon is a raster subset of the old
region. This script consumes explicit source-bound review planes, not runtime
joint inference. Existing cloth outside the added pixels remains byte exact.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image
from scipy import ndimage as nd

from kling_side_authoring import load_context, pack_garment, runtime_polygon_mask

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artwork/kling-landing-production/coverage"
W, H = 512, 768
YY, XX = np.indices((H, W), dtype=float)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def clip(poly, center, direction):
    """Intersect an authored hand polygon with its retained wrist half-plane."""
    result = []
    center, direction = np.array(center), np.array(direction)
    points = [np.array([p["x"], p["y"]], float) for p in poly]
    for previous, current in zip(points[-1:] + points[:-1], points):
        da, db = np.dot(previous - center, direction), np.dot(current - center, direction)
        if (da >= 0) != (db >= 0):
            point = previous + (current - previous) * da / (da - db)
            result.append({"x": float(point[0]), "y": float(point[1])})
        if db >= 0:
            result.append({"x": float(current[0]), "y": float(current[1])})
    assert 3 <= len(result) <= 64
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", type=Path, default=Path("/tmp/coverage-audit/renderer/wedding-repair"))
    args = ap.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    review = json.loads((ART / "reviewed-cuffs.json").read_text())
    baseline = ART / "baseline-wedding-top.garment.zip"
    assert sha(baseline.read_bytes()) == review["baselineSha256"]
    ctx = load_context("male", registration_path=ROOT / "artwork/kling-side-expansion/templates/male.registration.json")
    assert ctx.source_sha256 == review["sourceSha256"]
    assert ctx.registration_sha256 == review["registrationSha256"]
    wedding = module("wedding_coverage_donor", ROOT / "scripts/prepare-landing-side-wedding.py")
    assert sha(wedding.DONOR.read_bytes()) == review["paintedDonorSha256"]
    manifest, before = wedding.unpack_bank(baseline)
    after = {fid: (patch.copy(), mask.copy()) for fid, (patch, mask) in before.items()}
    old_protected = ctx.protected_mask
    reviews, review_masks, additions = [], {}, {}
    evidence = []
    for entry in review["cuffs"]:
        fid, side = entry["frameId"], entry["side"]
        label = side + "Hand"
        original = next(r for r in ctx.registered[fid]["protected"] if r["label"] == label)
        polygon = entry.get("polygon") or clip(original["polygon"], entry["center"], entry["direction"])
        initial = runtime_polygon_mask(original["polygon"])
        retained = runtime_polygon_mask(polygon)
        assert retained.any() and not (retained & ~initial).any(), (fid, side, "non-subset review")
        source = ctx.frames[fid]
        release = initial & ~retained & (source[:, :, 3] > 0)
        if "paintBounds" in entry:
            x0, y0, x1, y1 = entry["paintBounds"]
            extra = np.zeros((H, W), bool)
            extra[y0:y1, x0:x1] = True
            center, direction = np.array(entry["center"]), np.array(entry["direction"])
            extra &= ((XX-center[0])*direction[0]+(YY-center[1])*direction[1]) < 0
            release |= extra & ~retained & (source[:, :, 3] > 0)
        others = np.zeros((H, W), bool)
        for region in ctx.registered[fid]["protected"]:
            if region["label"] != label:
                others |= runtime_polygon_mask(region["polygon"])
        masks = ctx.masks(fid)
        r, g, b = source[:, :, :3].astype(int).transpose(2, 0, 1)
        warm = (r > 140) & (r - g > 25) & (g - b > 15) & (source[:, :, 3] > 0)
        domain = release & ~others & ~masks["bottom"] & ~masks["shoes"]
        domain &= nd.distance_transform_edt(~warm) <= 3
        domain &= ~before[fid][1]
        # Preserve the separately reviewed visible hand/fingers, including its
        # original antialiasing. Never repaint the opposite hand or head.
        assert not (domain & retained).any()
        chain = [wedding.point(ctx.registered[fid]["points"], side + name) for name in ("Shoulder", "Elbow")]
        chain.append(np.array(entry["center"], float))
        rgb, _, _ = wedding.chain_sample(side, chain, wedding.ARM_DONOR[side], 23 if side == "near" else 17, domain)
        patch, owned = after[fid]
        # Match the already accepted sleeve at the join; all samples are from
        # its painted pixels or the same original generated fabric donor.
        sleeve = before[fid][1] & (before[fid][0][:, :, 3] > 180)
        distance, nearest = nd.distance_transform_edt(~sleeve, return_indices=True)
        weight = np.clip(distance / 5.0, 0, 1)
        adjacent = before[fid][0][tuple(nearest)][:, :, :3].astype(float)
        rgb = adjacent * (1 - weight[:, :, None]) + rgb * weight[:, :, None]
        # A narrow darker fabric edge reads as a cuff, without changing the
        # source hand, outer alpha, or adding a synthetic sleeve silhouette.
        direction = np.array(entry["direction"], float)
        direction /= np.linalg.norm(direction)
        center = np.array(entry["center"], float)
        from_cuff = -((XX - center[0]) * direction[0] + (YY - center[1]) * direction[1])
        shade = .76 + .24 * np.clip(from_cuff / 2.5, 0, 1)
        rgb *= shade[:, :, None]
        patch[domain, :3] = np.rint(np.clip(rgb[domain], 0, 255)).astype(np.uint8)
        patch[domain, 3] = source[domain, 3]
        owned |= domain
        reviews.append({"frameId": fid, "label": label, "polygon": polygon,
                        "reason": "Source-visible forearm was included in conservative hand protection. The reviewed cuff retains the complete visible fist/wrist; only this long-sleeved wedding top may cover the released forearm. See artwork/kling-landing-production/coverage/reviewed-cuffs.json."})
        review_masks[(fid, label)] = retained
        additions.setdefault(fid, np.zeros((H, W), bool))[:] |= domain
        evidence.append({"frameId": fid, "side": side, "addedSleevePixels": int(domain.sum()),
                         "retainedHandSourcePixels": int((retained & (source[:, :, 3] > 0)).sum()),
                         "sourceRgbaSha256": sha(source.tobytes()),
                         "retainedHandRgbaSha256": sha(source[retained].tobytes()),
                         "releaseMaskSha256": sha(domain.tobytes())})

    for entry in review.get("extraHandReviews", []):
        fid, label, polygon = entry["frameId"], entry["label"], entry["polygon"]
        old = next(r for r in ctx.registered[fid]["protected"] if r["label"] == label)
        retained = runtime_polygon_mask(polygon)
        assert retained.any() and not (retained & ~runtime_polygon_mask(old["polygon"])).any()
        assert (fid, label) not in review_masks
        review_masks[(fid, label)] = retained
        reviews.append(entry)

    def scoped_protection(fid):
        result = np.zeros((H, W), bool)
        for region in ctx.registered[fid]["protected"]:
            result |= review_masks.get((fid, region["label"]), runtime_polygon_mask(region["polygon"]))
        return result & (ctx.frames[fid][:, :, 3] > 0)

    # Close only documented original tank fragments. Skin and original head/
    # hands are still forbidden; neck openings and bare arms are not inferred
    # to be defects merely because their color resembles the source costume.
    cloth_fixes = []
    for entry in review["clothGaps"]:
        fid = entry["frameId"]
        source, (patch, owned) = ctx.frames[fid], after[fid]
        region = np.zeros((H, W), bool)
        x0, y0, x1, y1 = entry["bounds"]
        region[y0:y1, x0:x1] = True
        region &= ctx.masks(fid)["top"] & ~before[fid][1] & ~old_protected(fid) & (source[:, :, 3] > 0)
        if not region.any():
            continue
        valid = before[fid][1] & (before[fid][0][:, :, 3] > 180)
        _, nearest = nd.distance_transform_edt(~valid, return_indices=True)
        patch[region, :3] = before[fid][0][tuple(nearest)][region, :3]
        patch[region, 3] = source[region, 3]
        owned |= region
        additions.setdefault(fid, np.zeros((H, W), bool))[:] |= region
        cloth_fixes.append({"frameId": fid, "bounds": entry["bounds"], "coveredOriginalTankPixels": int(region.sum())})

    for entry in review.get("sourceClothCopies", []):
        fid = entry["frameId"]
        source, (patch, owned) = ctx.frames[fid], after[fid]
        assert sha(source.tobytes()) == entry["sourceRgbaSha256"]
        points = entry["pixels"]
        region = np.zeros((H, W), bool)
        for x, y in points:
            region[y, x] = True
        assert not (region & scoped_protection(fid)).any(), (fid, "cloth guide overlaps reviewed hand")
        assert not (region & ctx.masks(fid)["skin"]).any(), (fid, "cloth guide overlaps source skin proof")
        assert not (region & (source[:, :, 3] == 0)).any()
        region &= ~owned
        valid = before[fid][1] & (before[fid][0][:, :, 3] > 180)
        _, nearest = nd.distance_transform_edt(~valid, return_indices=True)
        patch[region, :3] = before[fid][0][tuple(nearest)][region, :3]
        patch[region, 3] = source[region, 3]
        owned |= region
        additions.setdefault(fid, np.zeros((H, W), bool))[:] |= region
        cloth_fixes.append({"frameId": fid, "independentSourceClothGuide": True,
                            "coveredOriginalTankPixels": int(region.sum())})

    # Packer validation uses these garment-scoped reviews; registration bytes,
    # registration object, anchors, and global runtime protection stay intact.
    ctx.protected_mask = scoped_protection
    out = args.output / "male-wedding-top.garment.zip"
    provenance = manifest["provenance"] + " Source-bound V2 cuff reviews repair false hand protection over visible forearms. Existing painted sleeve fabric covers only individually reviewed source forearm pixels; original fists/head and source/registration/timing stay exact. Local source-tank omissions use adjacent accepted jacket pixels. Reproduce with scripts/refine-landing-wedding-coverage.py."
    pack_garment(ctx, manifest["id"], manifest["name"], "top", {f: p for f, (p, _) in after.items()}, out, provenance, ownership={f: m for f, (_, m) in after.items()}, painting_mode="patch")
    with zipfile.ZipFile(out) as z:
        files = {name: z.read(name) for name in z.namelist()}
    result = json.loads(files["manifest.json"])
    result.update(version=2, handProtectionReviews=reviews)
    files["manifest.json"] = (json.dumps(result, separators=(",", ":")) + "\n").encode()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    changed = []
    for fid, (patch, owned) in after.items():
        old, old_owned = before[fid]
        domain = additions.get(fid, np.zeros((H, W), bool))
        assert np.array_equal(patch[~domain], old[~domain])
        assert np.array_equal(owned[~domain], old_owned[~domain])
        assert not (owned & scoped_protection(fid)).any()
        source = ctx.frames[fid]
        composite = source.copy()
        composite[owned] = patch[owned]
        assert np.array_equal(composite[scoped_protection(fid)], source[scoped_protection(fid)])
        if domain.any():
            changed.append(fid)
        Image.fromarray(composite).save(args.output / f"after-{fid:03}.png")
    report = {"format": "gathria-landing-wedding-coverage-review", "version": 1,
              "baselineSha256": review["baselineSha256"], "sha256": sha(out.read_bytes()),
              "sourceSha256": ctx.source_sha256, "registrationSha256": ctx.registration_sha256,
              "changedFrameIds": changed, "handReviews": evidence, "clothFixes": cloth_fixes,
              "allUnreviewedClothPixelsExact": True, "sourceAndRegistrationUnchanged": True,
              "reviewCount": len(reviews), "addedSleevePixels": sum(e["addedSleevePixels"] for e in evidence)}
    required = [(entry["frameId"], x, y) for entry in review.get("sourceClothCopies", []) for x, y in entry["pixels"]]
    old_missing = sum(not before[fid][1][y, x] for fid, x, y in required)
    new_missing = sum(not after[fid][1][y, x] for fid, x, y in required)
    assert old_missing > 0 and new_missing == 0
    witnesses = []
    for entry in review["coverageWitnesses"]:
        fid, (x, y) = entry["frameId"], entry["point"]
        source = ctx.frames[fid][y, x]
        assert not before[fid][1][y, x] and after[fid][1][y, x]
        assert np.array_equal(source, np.array(entry["sourceRgba"], np.uint8))
        assert after[fid][0][y, x, 3] == source[3]
        assert not np.array_equal(after[fid][0][y, x], source), "Owned source-skin copies are not sleeve coverage"
        witnesses.append({**entry, "afterRgba": after[fid][0][y, x].tolist()})
    report["independentCoverageRegression"] = {
        "sourceClothPixels": len(required), "baselineUnownedPixels": int(old_missing),
        "resultUnownedPixels": int(new_missing), "sourceForearmWitnesses": witnesses,
        "scope": "Frozen independently reviewed source-cloth targets and three manually inspected forearm points; detects opaque original-pixel leakage, not only transparent holes."}
    (args.output / "audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k not in ("handReviews", "clothFixes")}, indent=2))


if __name__ == "__main__":
    main()
