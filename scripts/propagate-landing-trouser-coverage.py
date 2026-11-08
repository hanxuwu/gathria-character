#!/usr/bin/env python3
"""Apply the side trouser cloth review to the matching painted wedding bank.

The source/registration is the same. Only reviewed missing original-short cloth
pixels are added, using existing navy cloth from this frame. This does not copy
the daily trousers' colors, change skin, or modify source poses.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
import tempfile
import zipfile
import numpy as np
from PIL import Image
from scipy import ndimage as nd
from kling_side_authoring import load_context, runtime_polygon_mask, pack_garment

ROOT = Path(__file__).resolve().parents[1]
PATH = "artwork/kling-landing-production/wedding/bases/male-wedding-bottom.garment.zip"
RECIPE = ROOT / "artwork/wardrobe-coverage/side/recipe.json"
REPORT = ROOT / "docs/wardrobe-coverage/landing-wedding-bottom.json"
sha = lambda data: hashlib.sha256(data).hexdigest()

def build():
    recipe = json.loads(RECIPE.read_text())
    item = next(i for i in recipe["items"] if i["path"] == "docs/kling-side-expansion/assets/male-trousers.garment.zip")
    baseline = (ROOT / "artwork/kling-landing-production/coverage/baseline-wedding-bottom.garment.zip").read_bytes()
    assert sha(baseline) == "194bfa9477df2ae2be1166343fd849c9ff446a96e6a1ca1d9d6546a555f1872f", "Frozen wedding baseline changed"
    ctx = load_context("male", registration_path=ROOT / item["registration"])
    assert ctx.source_sha256 == item["sourceSha256"]
    assert ctx.registration_sha256 == item["registrationSha256"]
    with zipfile.ZipFile(io.BytesIO(baseline)) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
    manifest = json.loads(files["manifest.json"])
    assert manifest["sourceSha256"] == ctx.source_sha256
    assert manifest["registrationSha256"] == ctx.registration_sha256
    pages = [np.array(Image.open(io.BytesIO(files[p["file"]])).convert("RGBA")) for p in manifest["pages"]]
    masks = [np.array(Image.open(io.BytesIO(files[p["maskFile"]])).convert("RGBA"))[:, :, 3] > 0 for p in manifest["pages"]]
    frames = {}
    for f in manifest["frames"]:
        r, o = f["rect"], f["offset"]
        patch = np.zeros((768, 512, 4), np.uint8); owned = np.zeros((768, 512), bool)
        crop = np.s_[r["y"]:r["y"]+r["height"], r["x"]:r["x"]+r["width"]]
        dest = np.s_[o["y"]:o["y"]+r["height"], o["x"]:o["x"]+r["width"]]
        patch[dest] = pages[f["page"]][crop]; owned[dest] = masks[f["page"]][crop]
        frames[f["frameId"]] = patch, owned
    reviews = {(r["frameId"], r["label"]): r for r in item["handProtectionReviews"]}
    used_reviews, records = {}, []
    for edit in item["frames"]:
        fid = edit["frameId"]
        source = ctx.frames[fid]
        assert sha(source.tobytes()) == edit["sourceRgbaSha256"]
        crop, owned = frames[fid]
        before, before_owned = crop.copy(), owned.copy()
        valid = (before_owned > 0) & (before[:, :, 3] >= 128)
        distance, nearest = nd.distance_transform_edt(~valid, return_indices=True)
        protected = np.zeros((768, 512), bool)
        original_regions = {}
        for region in ctx.registered[fid]["protected"]:
            review = reviews.get((fid, region["label"]))
            after = runtime_polygon_mask((review or region)["polygon"])
            original = runtime_polygon_mask(region["polygon"])
            original_regions[region["label"]] = original
            assert after.any() and not (after & ~original).any()
            protected |= after
        added = []
        for x, y, _, _ in edit["copyPixels"]:
            dx, dy = x, y
            assert 0 <= dx < 512 and 0 <= dy < 768
            if owned[dy, dx]:
                continue
            assert ctx.masks(fid)["bottom"][y, x] and not ctx.masks(fid)["skin"][y, x]
            assert not protected[y, x] and source[y, x, 3] > 0
            assert distance[dy, dx] <= 24, "Cloth donor must stay local to this reviewed gap"
            sy, sx = nearest[:, dy, dx]
            crop[dy, dx, :3] = before[sy, sx, :3]
            crop[dy, dx, 3] = source[y, x, 3]
            owned[dy, dx] = True
            added.append([x, y])
            for region in ctx.registered[fid]["protected"]:
                key = fid, region["label"]
                if key in reviews and original_regions[region["label"]][y, x]:
                    used_reviews[key] = reviews[key]
        released = []
        for x, y in edit.get("releasePixels", []):
            dx, dy = x, y
            assert fid == 57 and 215 <= x < 326 and 690 <= y < 716
            if 0 <= dx < 512 and 0 <= dy < 768 and owned[dy, dx]:
                crop[dy, dx] = 0; owned[dy, dx] = 0; released.append([x, y])
        changed = np.any(crop != before, axis=2) | (owned != before_owned)
        assert int(changed.sum()) == len(added) + len(released)
        if changed.any():
            records.append({"frameId": fid, "newClothPixels": len(added), "restoredShoePixels": len(released),
                            "copyTargets": added, "releaseTargets": released,
                            "sourceRgbaSha256": edit["sourceRgbaSha256"]})
    original_protected = ctx.protected_mask
    def garment_protected(fid, label=None):
        result = np.zeros((768, 512), bool)
        for region in ctx.registered[fid]["protected"]:
            if label is None or region["label"] == label:
                result |= runtime_polygon_mask(used_reviews.get((fid, region["label"]), region)["polygon"])
        return result & (ctx.frames[fid][:, :, 3] > 0)
    ctx.protected_mask = garment_protected
    with tempfile.TemporaryDirectory(prefix="wedding-coverage-") as tmp:
        path = Path(tmp) / "garment.zip"
        pack_garment(ctx, manifest["id"], manifest["name"], "bottom", {f: p for f, (p, _) in frames.items()},
                     path, manifest["provenance"], ownership={f: m for f, (_, m) in frames.items()}, painting_mode="patch")
        with zipfile.ZipFile(path) as archive:
            files = {name: archive.read(name) for name in archive.namelist()}
        manifest = json.loads(files["manifest.json"])
    ctx.protected_mask = original_protected
    if used_reviews:
        manifest["version"] = 2
        manifest["handProtectionReviews"] = [used_reviews[key] for key in sorted(used_reviews)]
    manifest["provenance"] += " Source-bound coverage review propagates only confirmed missing original-short cloth pixels and the same retained-fist boundaries from the daily trouser review. Navy RGB comes from existing adjacent wedding cloth in each frame. Source anatomy, source alpha, head, hands, registration, timing and unlisted garment pixels stay exact. See scripts/propagate-landing-trouser-coverage.py."
    assert len(manifest["provenance"]) <= 4000
    files["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    data = stream.getvalue()
    return data, {"baselineCommit": "863d761bbdc927ea65080250c765b9c5c78c8fc4", "sideRecipeBaselineCommit": recipe["baselineCommit"], "baselineSha256": sha(baseline),
                  "sha256": sha(data), "recipeSha256": sha(RECIPE.read_bytes()),
                  "sourceAndRegistrationUnchanged": True, "onlyReviewedClothAndSoleChanges": True,
                  "handReviews": len(used_reviews), "frames": records}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--check", action="store_true"); args = parser.parse_args()
    data, report = build()
    if args.check:
        assert (ROOT / PATH).read_bytes() == data, "Wedding trouser coverage differs from the reviewed recipe"
    else:
        (ROOT / PATH).write_bytes(data); REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"frames": len(report["frames"]), "newClothPixels": sum(f["newClothPixels"] for f in report["frames"]), "handReviews": report["handReviews"]}))
