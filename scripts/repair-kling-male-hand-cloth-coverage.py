#!/usr/bin/env python3
"""Repair five reviewed source-tank fringes beside the original male fist.

Uses the immutable reviewed pixel runs and per-item hand polygons. No source,
registration, body, animation, face, or garment geometry is regenerated. The
before archives are read from the recorded Git commit for reproducibility.
"""
from pathlib import Path
import io
import json
import subprocess
import zipfile

import numpy as np
from PIL import Image
from scipy import ndimage as nd

from kling_wardrobe_common import ROOT, json_bytes, load_source, protected_mask, sha

REVIEW = ROOT / "artwork/kling-coverage/male-original-hand-cloth-review.json"
REPORT = ROOT / "docs/kling-coverage/review/original-male/repair-report.json"


def png(array):
    out = io.BytesIO()
    Image.fromarray(array).save(out, format="PNG", compress_level=9)
    return out.getvalue()


def main():
    review = json.loads(REVIEW.read_text())
    source_bytes, _, _, sources = load_source("male")
    assert sha(source_bytes) == review["sourceSha256"]
    report = {"format": "gathria-male-hand-cloth-repair", "version": 1,
              "reviewSha256": sha(REVIEW.read_bytes()), "items": []}
    for item in review["items"]:
        path = item["url"].lstrip("/")
        before = subprocess.check_output(["git", "show", f"{review['baselineCommit']}:{path}"], cwd=ROOT)
        assert sha(before) == item["baselineSha256"], item["id"]
        with zipfile.ZipFile(io.BytesIO(before)) as archive:
            files = {name: archive.read(name) for name in archive.namelist()}
        manifest = json.loads(files["manifest.json"])
        registration = json.loads((ROOT / item["registrationUrl"].lstrip("/")).read_text())
        assert manifest["sourceSha256"] == review["sourceSha256"]
        assert manifest["registrationSha256"] == sha((ROOT / item["registrationUrl"].lstrip("/")).read_bytes())
        assert manifest["slot"] == "top"
        pages = {}
        frame_reports = []
        reviews = manifest.get("handProtectionReviews", [])
        for correction in review["frames"]:
            fid = correction["frameId"]
            source = sources[fid]
            mask = np.zeros(source.shape[:2], bool)
            for run in correction["clothRuns"]:
                mask[run["y"], run["x0"]:run["x1"]+1] = True
            assert mask.sum() == correction["clothPixelCount"]
            assert sha(source[mask].tobytes()) == correction["sourceClothSha256"]
            guide = next(f for f in registration["frames"] if f["frameId"] == fid)
            original_hand = next(h for h in guide["protected"] if h["label"] == correction["label"])
            old_protection = protected_mask({"protected": [original_hand]})
            new_protection = protected_mask({"protected": [{"label": correction["label"], "polygon": correction["polygon"]}]})
            assert not (new_protection & ~old_protection).any()
            assert not (new_protection & mask).any()
            assert not (mask & ~old_protection).any()
            assert not (mask & protected_mask({"protected": [h for h in guide["protected"] if h["label"] != correction["label"]]})).any()
            frame = next(f for f in manifest["frames"] if f["frameId"] == fid)
            page = manifest["pages"][frame["page"]]
            if frame["page"] not in pages:
                pages[frame["page"]] = [np.array(Image.open(io.BytesIO(files[page[name]])).convert("RGBA"))
                                          for name in ("file", "maskFile")]
            rgba, ownership = pages[frame["page"]]
            rect, offset = frame["rect"], frame["offset"]
            src_slice = (slice(offset["y"], offset["y"]+rect["height"]), slice(offset["x"], offset["x"]+rect["width"]))
            atlas_slice = (slice(rect["y"], rect["y"]+rect["height"]), slice(rect["x"], rect["x"]+rect["width"]))
            local = mask[src_slice]
            assert local.sum() == mask.sum(), "Repair must fit the unchanged native crop."
            patch, owned = rgba[atlas_slice], ownership[atlas_slice]
            assert not owned[local, 3].any()
            original_patch, original_owned = patch.copy(), owned.copy()
            available = (owned[:, :, 3] == 255) & (patch[:, :, 3] >= 240)
            distance, nearest = nd.distance_transform_edt(~available, return_indices=True)
            assert available.any() and float(distance[local].max()) <= 8, "No local authored cloth sample."
            patch[local] = original_patch[tuple(nearest[:, local])]
            # Preserve source alpha exactly; these opaque interior cloth pixels do
            # not change the silhouette or any source/body transparency.
            patch[local, 3] = source[src_slice][local, 3]
            owned[local, 3] = 255
            assert np.array_equal(patch[~local], original_patch[~local])
            assert np.array_equal(owned[~local], original_owned[~local])
            reviews = [r for r in reviews if (r["frameId"], r["label"]) != (fid, correction["label"])]
            reviews.append({k: correction[k] for k in ("frameId", "label", "polygon", "reason")})
            frame_reports.append({"frameId": fid, "changedClothPixels": int(local.sum()),
                                  "maximumSampleDistance": round(float(distance[local].max()), 4),
                                  "changedPixelsOutsideReviewedCloth": 0, "sourceAlphaChanges": 0})
        for index, (patch, ownership) in pages.items():
            spec = manifest["pages"][index]
            files[spec["file"]], files[spec["maskFile"]] = png(patch), png(ownership)
        manifest["version"] = max(2, manifest["version"])
        manifest["handProtectionReviews"] = sorted(reviews, key=lambda r: (r["frameId"], r["label"]))
        files["manifest.json"] = json_bytes(manifest)
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, data)
        payload = output.getvalue()
        (ROOT / path).write_bytes(payload)
        record = {"id": item["id"], "url": item["url"], "beforeSha256": sha(before),
                  "sha256": sha(payload), "bytes": len(payload), "frames": frame_reports}
        report["items"].append(record)
        print(item["id"], sum(f["changedClothPixels"] for f in frame_reports), "cloth pixels", flush=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
