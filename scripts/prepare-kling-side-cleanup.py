"""Audit frozen side sprites and reproduce source-bound cleanup experiments.

Writes only cleanup audit artifacts. Never modifies a source pack or enables a
runtime patch. RGB-only restoration is rejected; a guarded cloth-interior matte
override is a separate opt-in review candidate, with exact reversible pixels.
"""

import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
PACK_SHA = {
    "male": "7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42",
    "female": "ee6d20ac1b6c973043a28bc7b0508cf4f3b1ea4f373424b0de75d88d724f955d",
}
VIDEO_SHA = "85b55d8fc757052d3d1cb09d7b397d1b8eb2981f2bacef0ea6f2288fe2a44cf7"
REG_SHA = "a2c835cb743a531077b3f6ad3daddf30192112cada4c6ebcaf49fb8280b7b5cd"
SOURCE_FRAME_SHA = "0e4ee290dfa262631b1957c1bad069b0da6ac1d72fc298d481a480fd5f598979"
RAW_SHA = "ecfdaa67630b0b2b80ed2ac9a1c3f0484e9b023e7a54360b8c5db825d97c377e"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def checked(path, expected):
    data = path.read_bytes()
    if sha(data) != expected:
        raise ValueError(f"Source identity mismatch: {path}")
    return data


def load_frames(root, identity):
    data = checked(root / f"docs/kling-side-workspace/assets/{identity}.source.zip", PACK_SHA[identity])
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        character = json.loads(archive.read("character.json"))
        pages = [Image.open(io.BytesIO(archive.read(p["file"]))).convert("RGBA")
                 for p in [manifest["spritesheet"], *manifest.get("additionalSheets", [])]]
        derivation = {f["frameId"]: f["sourceFrame"] for f in character["derivation"]["frames"]}
        frames = {}
        for f in manifest["frames"]:
            if f["id"] in manifest["animations"]["jump"]["frames"]:
                image = pages[f.get("page", 0)].crop((f["x"], f["y"], f["x"] + f["width"], f["y"] + f["height"]))
                frames[derivation[f["id"]]] = (f["id"], np.array(image))
    return frames


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def sheet(path, samples, crop, scale, columns):
    width, height = (crop[2] - crop[0]) * scale, (crop[3] - crop[1]) * scale
    rows = (len(samples) + columns - 1) // columns
    result = Image.new("RGB", (columns * (width + 16), rows * (height + 40)), "#eee7db")
    draw = ImageDraw.Draw(result)
    for i, (label, array) in enumerate(samples):
        x, y = (i % columns) * (width + 16), (i // columns) * (height + 40)
        image = Image.fromarray(array).crop(crop).resize((width, height), Image.Resampling.NEAREST)
        result.paste(image, (x + 8, y + 30), image if image.mode == "RGBA" else None)
        draw.text((x + 8, y + 8), label, fill="#222222")
    result.save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=ROOT)
    parser.add_argument("--output-root", type=Path, default=ROOT)
    args = parser.parse_args()
    root, output = args.repo_root.resolve(), args.output_root.resolve()
    art = output / "artwork/kling-side-expansion/cleanup"
    docs = output / "docs/kling-side-expansion/cleanup"
    art.mkdir(parents=True, exist_ok=True)
    docs.mkdir(parents=True, exist_ok=True)
    male, female = load_frames(root, "male"), load_frames(root, "female")
    frame_id, source = male[242]
    assert frame_id == 99 and sha(source.tobytes()) == SOURCE_FRAME_SHA
    video = root / "artwork/kling-side-selection/source/male-2360.mp4"
    checked(video, VIDEO_SHA)
    registration = json.loads(checked(root / "docs/kling-side-selection/registered-selection.json", REG_SHA))
    affine = registration["registration"]["male-2360"]["inverseAffine"]
    # Decode just the original frame. This is a reproduction of its existing
    # fixed canvas registration, not a new deformation or per-frame adjustment.
    with tempfile.TemporaryDirectory(prefix="kling-cleanup-") as tmp:
        raw_path = Path(tmp) / "video242.png"
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", "select=eq(n\\,242)", "-frames:v", "1", str(raw_path)], check=True)
        raw_image = Image.open(raw_path).convert("RGB")
        raw_hash = sha(raw_image.tobytes())
        if raw_hash != RAW_SHA:
            raise ValueError("Decoded original RGB differs; review before regenerating patches")
        raw = np.array(raw_image.transform((512, 768), Image.Transform.AFFINE, affine, resample=Image.Resampling.BICUBIC))
    rgb = source[:, :, :3].astype(np.int16)
    # Reviewed shorts-only bounds. Dark raw-video pixels exclude green-screen
    # background and skin; purple excess isolates the unmix contamination.
    region = np.zeros(source.shape[:2], bool)
    region[444:480, 178:204] = True
    mask = (region & (source[:, :, 3] > 0) & (rgb[:, :, 0] > rgb[:, :, 1] + 8)
            & (rgb[:, :, 2] > rgb[:, :, 1] + 8) & (raw.max(axis=2) < 85))
    candidate = source.copy()
    candidate[mask, :3] = raw[mask]
    assert mask.sum() == 470
    assert np.array_equal(candidate[:, :, 3], source[:, :, 3])
    assert np.array_equal(candidate[~mask], source[~mask])
    ys, xs = np.where(mask)
    pixels = [[int(x), int(y), source[y, x].tolist(), candidate[y, x].tolist()] for y, x in zip(ys, xs)]
    restored = candidate.copy()
    for x, y, before, after in pixels:
        assert restored[y, x].tolist() == after
        restored[y, x] = before
    assert np.array_equal(restored, source)
    sparse = {
        "format": "gathria-source-cleanup-sparse-experiment", "version": 1,
        "status": "rejected-do-not-enable", "defaultEnabled": False,
        "sourcePackSha256": PACK_SHA["male"], "characterId": "kling-male-side-workspace-v1",
        "frameId": 99, "sourceId": "male-2360", "sourceFrame": 242,
        "sourceRgbaSha256": sha(source.tobytes()), "candidateRgbaSha256": sha(candidate.tobytes()),
        "canvas": [512, 768], "operation": "exact-pixel-replace-not-source-over",
        "pixelColumns": ["x", "y", "beforeRGBA", "afterRGBA"], "pixels": pixels,
        "applyContract": "Verify pack SHA and full source RGBA SHA before applying every beforeRGBA precondition. Replace only listed coordinates. Reverse by verifying candidate SHA and afterRGBA, then copying beforeRGBA. Reject identity mismatches; do not scale, mirror, interpolate or approximate.",
    }
    patch_path = art / "male-source242-rejected-rgb-restoration.json"
    write_json(patch_path, sparse)
    # Separately authorized diagnostic candidate: original dark cloth is
    # conservatively eroded twice with a 4-neighbor cross. This leaves a native
    # two-pixel Manhattan guard from bright/green background before changing
    # alpha. No pixels outside the declared shorts ROI can change.
    safe = raw.max(axis=2) < 85
    for _ in range(2):
        padded = np.pad(safe, 1, constant_values=False)
        safe = (padded[1:-1, 1:-1] & padded[:-2, 1:-1] & padded[2:, 1:-1]
                & padded[1:-1, :-2] & padded[1:-1, 2:])
    matte_mask = region & safe & (source[:, :, 3] > 0) & (source[:, :, 3] < 255)
    matte_candidate = source.copy()
    matte_candidate[matte_mask, :3] = raw[matte_mask]
    matte_candidate[matte_mask, 3] = 255
    assert matte_mask.sum() == 502
    assert np.array_equal(matte_candidate[~matte_mask], source[~matte_mask])
    matte_y, matte_x = np.where(matte_mask)
    matte_pixels = [[int(x), int(y), source[y, x].tolist(), matte_candidate[y, x].tolist()]
                    for y, x in zip(matte_y, matte_x)]
    matte_restored = matte_candidate.copy()
    for x, y, before, after in matte_pixels:
        assert matte_restored[y, x].tolist() == after
        matte_restored[y, x] = before
    assert np.array_equal(matte_restored, source)
    matte_sparse = {**sparse,
        "status": "optional-review-candidate-not-enabled",
        "candidateRgbaSha256": sha(matte_candidate.tobytes()), "pixels": matte_pixels,
        "declaredRegion": {"x": 178, "y": 444, "width": 26, "height": 36},
        "selection": "Within declaredRegion, 0 < source alpha < 255, and original registered RGB max < 85 after two iterations of 4-neighbor binary erosion. No expansion beyond existing nonzero alpha.",
        "replacement": "Exact registered original-video RGB; alpha=255 in reviewed dark-cloth interior only.",
        "sourceVideoSha256": VIDEO_SHA, "decodedRgbSha256": raw_hash,
        "registrationSha256": REG_SHA, "inverseAffine": affine,
        "changedAlphaPixels": len(matte_pixels),
        "alphaDiff": {"minimumIncrease": int((255 - source[:, :, 3][matte_mask]).min()),
                      "maximumIncrease": int((255 - source[:, :, 3][matte_mask]).max()),
                      "sumIncrease": int((255 - source[:, :, 3][matte_mask]).sum())},
    }
    matte_path = art / "male-source242-cloth-matte-candidate.json"
    write_json(matte_path, matte_sparse)
    Image.fromarray(matte_mask.astype(np.uint8) * 255).crop((178, 444, 204, 480)).save(art / "male-source242-cloth-matte-mask.png")
    alpha = source[444:480, 178:204, 3]
    checks = {
        "candidatePixelCount": len(pixels), "changedAlphaPixels": 0,
        "outsideSparseCoordinatesExact": True, "inverseRestoresSourceExactly": True,
        "sourcePackHashesRecheckedAfterRun": True,
        "partialAlphaPixelsInReviewedRoi": int(((alpha > 0) & (alpha < 255)).sum()),
        "candidateIsAccepted": False,
        "clothMatteCandidate": {"changedRgbPixels": int(np.any(matte_candidate[:, :, :3] != source[:, :, :3], axis=2).sum()),
            "changedAlphaPixels": len(matte_pixels), "outsideSparseCoordinatesExact": True,
            "outsideDeclaredRegionExact": True, "inverseRestoresSourceExactly": True,
            "nonzeroAlphaFootprintExact": bool(np.array_equal(matte_candidate[:, :, 3] > 0, source[:, :, 3] > 0)),
            "defaultEnabled": False},
    }
    audit = {
        "format": "gathria-side-cleanup-audit", "version": 1, "status": "bounded-audit-complete-optional-cloth-matte-candidate",
        "sourcePackSha256": PACK_SHA, "acceptedPatches": [],
        "reviewedJumpContacts": {"male": list(range(200, 250)), "female": list(range(200, 250))},
        "nativeDetailReview": {"male": [240, 241, 242, 243, 244], "female": [242, 243]},
        "sourceEvidence": {"videoPath": str(video.relative_to(root)), "videoSha256": VIDEO_SHA,
            "decodedSourceFrame": 242, "decodedRgbSha256": raw_hash,
            "registrationSha256": REG_SHA, "inverseAffine": affine},
        "rejectedExperiments": [{"file": str(patch_path.relative_to(output)), "sha256": sha(patch_path.read_bytes()),
            "reason": "Original-video RGB restoration removes purple but preserved damaged alpha leaves visible checkerboard holes/gray-green blocks. Not suitable for activation."}],
        "reviewCandidates": [{"file": str(matte_path.relative_to(output)), "sha256": sha(matte_path.read_bytes()),
            "status": "optional-review-candidate-not-enabled", "defaultEnabled": False,
            "finding": "502 source242 shorts-interior RGBA replacements remove the blocky purple/alpha defect by restoring original video RGB and opaque cloth alpha within a guarded reviewed region. Source boundary and all other pixels remain exact. Native crop and full-frame visual review show clear local improvement."}],
        "deferred": [
            {"region": "male source242 outer shorts", "finding": "Purple contamination is absent in original video RGB. Existing keyed alpha is also damaged; RGB-only restoration is insufficient."},
            {"region": "male/female neck and raised-arm gaps, especially source241/242", "finding": "Green includes original-video shaded background wedges and retained opaque pixels in negative space. RGB-only neutralization would leave false shapes; no edit issued."}],
        "checks": checks,
    }
    write_json(art / "audit.json", audit)
    sheet(docs / "shorts-original-video-before-after.png", [
        ("Frozen source", source), ("Original video RGB", raw), ("Rejected RGB restoration", candidate)], (170, 425, 250, 510), 4, 3)
    sheet(docs / "shorts-neighboring-poses.png", [(f"Male source{n}", male[n][1]) for n in range(240, 245)], (160, 385, 340, 575), 1, 5)
    sheet(docs / "neck-retained.png", [("Male source242", male[242][1]), ("Female source242", female[242][1]), ("Male source243", male[243][1]), ("Female source243", female[243][1])], (165, 285, 380, 395), 2, 2)
    sheet(docs / "male-source242-native-before-after.png", [("Frozen source / unchanged", source), ("Rejected RGB-only experiment", candidate)], (0, 0, 512, 768), 1, 2)
    sheet(docs / "shorts-cloth-matte-before-after.png", [("Frozen source", source), ("Guarded cloth matte candidate", matte_candidate)], (170, 425, 250, 510), 4, 2)
    sheet(docs / "male-source242-matte-native-before-after.png", [("Frozen source / unchanged", source), ("Optional cloth matte candidate", matte_candidate)], (0, 0, 512, 768), 1, 2)
    for identity in PACK_SHA:
        checked(root / f"docs/kling-side-workspace/assets/{identity}.source.zip", PACK_SHA[identity])
    print(json.dumps(checks, indent=2))


if __name__ == "__main__":
    main()
