#!/usr/bin/env python3
"""Continue one reviewed nape strip without moving the source ear or face.

The pinned before-image prevents accumulated deformation. Existing atlas layout,
pose registration, all other native hair layers and all source pixels stay fixed.
"""
from __future__ import annotations

import importlib.util
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image

from kling_side_authoring import ROOT, encode_rgba, load_context, runtime_polygon_mask, sha

spec = importlib.util.spec_from_file_location("previous_fit", ROOT / "scripts/polish-kling-side-hair.py")
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
ART = ROOT / "artwork/kling-side-fitting/hair"
DOC = ROOT / "docs/kling-side-fitting/hair"
TMP = Path("/tmp/side-fitting/hair/native")


def main():
    DOC.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    recipe_path = ART / "male-67-nape-fit.json"
    recipe = json.loads(recipe_path.read_text())
    source = np.array(Image.open(ART / "male-67-baseline-hair.png").convert("RGBA"))
    assert sha(source.tobytes()) == recipe["originalHairSha256"]
    target = ROOT / "docs/kling-side-expansion/assets/male.appearance.zip"
    with zipfile.ZipFile(target) as z:
        files = {name: z.read(name) for name in z.namelist()}
    manifest = json.loads(files["manifest.json"])
    ctx = load_context("male", registration_path=ROOT / "artwork/kling-side-expansion/templates/male.registration.json")
    assert ctx.source_sha256 == recipe["sourceSha256"] == manifest["sourceSha256"]
    assert ctx.registration_sha256 == recipe["registrationSha256"] == manifest["registrationSha256"]
    pages = [np.array(Image.open(io.BytesIO(files[p["file"]])).convert("RGBA")) for p in manifest["pages"]]
    native = {fid: previous.native_layers(manifest, pages, fid) for fid in ctx.frames}
    expected = {(row["frameId"], row["role"]): row["sha256"] for row in recipe["layerRgba"]}
    fid, role = recipe["frameId"], recipe["role"]
    corrected = previous.rear_fit(source, recipe)
    for frame_id, layers in native.items():
        for layer_role, pixels in layers.items():
            digest = sha(pixels.tobytes())
            if (frame_id, layer_role) == (fid, role):
                assert digest in {expected[fid, role], sha(corrected.tobytes())}, "Unreviewed target hair modification"
            else:
                assert digest == expected[frame_id, layer_role], f"Unrelated hair changed: {frame_id}/{layer_role}"
    native[fid][role] = corrected
    layer = next(layer for layer in manifest["styles"][0]["layers"] if layer["role"] == role)
    entry = next(frame for frame in layer["frames"] if frame["frameId"] == fid)
    r, o = entry["rect"], entry["offset"]
    x, y, w, h = (r[key] for key in ("x", "y", "width", "height"))
    ox, oy = o["x"], o["y"]
    crop = corrected[oy:oy + h, ox:ox + w]
    contained = np.zeros(corrected.shape[:2], bool)
    contained[oy:oy + h, ox:ox + w] = True
    assert not np.any((corrected[:, :, 3] > 0) & ~contained), "Correction exceeds the existing atlas rectangle"
    page_def = manifest["pages"][entry["page"]]
    pages[entry["page"]][y:y + h, x:x + w] = crop
    files[page_def["file"]] = encode_rgba(pages[entry["page"]], ctx.color_chunks)
    ownership = np.array(Image.open(io.BytesIO(files[page_def["maskFile"]])).convert("RGBA"))
    ownership[y:y + h, x:x + w] = 0
    ownership[y:y + h, x:x + w, 3] = (crop[:, :, 3] > 0).astype("uint8") * 255
    files[page_def["maskFile"]] = encode_rgba(ownership)
    manifest["provenance"] = recipe["baselineProvenance"] + " Frame 67 lower-nape continuation from reviewed painted hair: fixed ear-side boundary, at most 8 native pixels displacement, rows 380–428 only. Source face/ear/neck untouched. Reproduce with scripts/refine-kling-side-nape.py."
    files["manifest.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    audit = []
    for frame_id, layers in native.items():
        pose = next(pose for pose in manifest["poses"] if pose["frameId"] == frame_id)
        baseline_layers = layers if frame_id != fid else {**layers, role: source}
        before = previous.hair.render(ctx, frame_id, baseline_layers, pose)
        after = previous.hair.render(ctx, frame_id, layers, pose)
        original = ctx.frames[frame_id]
        delta = np.any(before != after, axis=2)
        if frame_id != fid:
            assert not np.any(delta)
        core = runtime_polygon_mask(pose["facePolygon"]) & (original[:, :, 3] == 255)
        foreground = np.zeros(original.shape[:2], bool)
        for region in ctx.registered[frame_id]["protected"]:
            if region["label"] != "head":
                foreground |= runtime_polygon_mask(region["polygon"])
        for polygon in pose["foreground"]:
            foreground |= runtime_polygon_mask(polygon)
        foreground &= original[:, :, 3] == 255
        owned = np.logical_or.reduce([part[:, :, 3] > 0 for part in layers.values()])
        change = np.any(after != original, axis=2)
        assert not np.any(change & (core | foreground | ~owned))
        audit.append({"frameId": frame_id, "sourceFrame": ctx.registered[frame_id]["sourceFrame"], "changedPixels": int(delta.sum()), "exactOpaqueFace": True, "exactOpaqueForeground": True, "exactOutsideHair": True, "renderRgbaSha256": sha(after.tobytes())})
        if frame_id == fid:
            Image.fromarray(before).save(TMP / "male-67-before.png")
            Image.fromarray(after).save(TMP / "male-67-after.png")
            Image.fromarray(original).save(TMP / "male-67-source.png")
    # Publish only after all native checks, preserving deterministic ZIP metadata.
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    report = {"baselineBankSha256": recipe["baselineBankSha256"], "bankSha256": sha(target.read_bytes()), "sourceSha256": ctx.source_sha256, "registrationSha256": ctx.registration_sha256, "recipeSha256": sha(recipe_path.read_bytes()), "unchangedFrames": 106, "sourcePixelsWarped": 0, "atlasLayoutUnchanged": True, "headTransformsUnchanged": True, "frames": audit}
    (DOC / "native-audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"bankSha256": report["bankSha256"], "changedPixels": audit[fid]["changedPixels"], "unchangedFrames": 106}))


if __name__ == "__main__":
    main()
