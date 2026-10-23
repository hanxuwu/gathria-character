#!/usr/bin/env python3
"""Verify real browser exports of bounded head and two hand-ownership repairs.

Inputs are the actual captures from capture-kling-appearance-stability.mjs.
The day packs can remain temporary: their exact hashes and evidence indexes are
recorded. Old reviewed packs stay in Git; no artwork is redrawn by this script.
"""
from pathlib import Path
import argparse
import importlib.util
import io
import subprocess
import json
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "review_helpers", ROOT / "scripts/render-kling-appearance-review.py"
)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def relative_or_absolute(path):
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def contains(rect, x, y):
    return (
        (x >= rect["x"])
        & (x <= rect["x"] + rect["width"])
        & (y >= rect["y"])
        & (y <= rect["y"] + rect["height"])
    )


HAND_REPAIRS = {
    78: [(150, 414), (163, 403), (163, 409), (160, 417), (159, 422), (163, 430)],
    79: [(145, 445), (150, 441), (169, 430), (169, 441), (167, 451), (165, 460), (168, 470), (156, 470)],
}


def in_polygon(points, x, y):
    result = np.zeros(x.shape, dtype=bool)
    boundary = np.zeros(x.shape, dtype=bool)
    for a, b in zip(points, points[1:] + points[:1]):
        if a[1] != b[1]:
            result ^= ((a[1] > y) != (b[1] > y)) & (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])
        # Runtime polygonRows includes pixel centers exactly on the contour.
        cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])
        boundary |= (np.abs(cross) < 1e-9) & (x >= min(a[0], b[0])) & (x <= max(a[0], b[0])) & (y >= min(a[1], b[1])) & (y <= max(a[1], b[1]))
    return result | boundary


def compare_frame(before, after, pose, character, source):
    assert before.size == after.size
    changed = np.any(np.array(before) != np.array(after), axis=2)
    y, x = np.where(changed)
    # Bank bounds use source pixel centers; baked appearance adds translation.
    sx, sy = x - 32 + 0.5, y - 128 + 0.5
    original = pose["headBounds"]
    allowance = pose["hairOcclusionBounds"]
    guard_delta = ~contains(original, sx, sy) & contains(allowance, sx, sy)
    hand_polygon = HAND_REPAIRS.get(pose["frameId"]) if character == "female" else None
    hand_delta = in_polygon(hand_polygon, sx, sy) if hand_polygon else np.zeros(x.shape, bool)
    assert (guard_delta | hand_delta).all(), (character, pose["frameId"], "unexpected changed pixel")
    if hand_delta.any():
        source_array = np.array(source)
        restored = np.array(after)[y[hand_delta], x[hand_delta]]
        expected = source_array[y[hand_delta] - 128, x[hand_delta] - 32]
        assert np.array_equal(restored, expected), (pose["frameId"], "hand must restore exact source RGBA")
        assert (expected[:, 3] == 255).all()
    face = [(p["x"], p["y"]) for p in pose["facePolygon"]]
    assert not in_polygon(face, sx, sy).any(), (character, pose["frameId"], "face changed")
    assert allowance["y"] + allowance["height"] == original["y"] + original["height"]
    return {
        "frameId": pose["frameId"],
        "changedPixels": int(changed.sum()),
        "boundaryAllowanceChangedPixels": int(guard_delta.sum()),
        "sourceHandRestoredPixels": int(hand_delta.sum()),
        "onlyExplicitBoundaryOrTwoHandRepairs": True,
        "faceAndOtherPixelsExact": True,
        "restoredHandExactSourceRgba": True,
        "changedPixelBoundsInclusive": (
            [int(x.min()), int(y.min()), int(x.max()), int(y.max())]
            if len(x)
            else None
        ),
    }


def main(capture_root, workflow_root, female_run):
    result = {
        "format": "gathria-head-boundary-export-validation",
        "version": 2,
        "baselineCommit": "055e95116cd441be7a630554409738b4a0b67ef9",
        "scope": "Actual browser day CharacterPacks and selected both-style PNGs; exact RGBA deltas against retained pre-fix exports. Only the explicit three-pixel top/side hair allowance and two source-backed female hand polygons may differ. Face pixels and all other pixels remain exact. The hand changes restore the original opaque source RGBA. This does not claim the source artwork itself is free from blemishes.",
        "packs": [],
        "actualPngSamples": [],
    }
    for character in ["male", "female"]:
        default_style = "soft-crop" if character == "male" else "soft-bob"
        run = female_run if character == "female" else "final-male"
        directory = workflow_root / run
        capture_directory = capture_root / run
        current = capture_directory / f"{character}-day.character.zip"
        manifest, frames = helper.decode_pack(current)
        index = json.loads((directory / "evidence-index.json").read_text())
        assert index["passed"], "complete browser workflow must pass before final validation"
        download = next(record for record in index["downloads"] if record["file"] == str(current))
        assert download["sha256"] == helper.sha(current)
        bank_path = ROOT / f"docs/kling-appearance/banks/{character}.zip"
        assert index["inputs"][str(bank_path.relative_to(ROOT))] == helper.sha(bank_path)
        with zipfile.ZipFile(bank_path) as archive:
            bank = json.loads(archive.read("manifest.json"))
        poses = {pose["frameId"]: pose for pose in bank["poses"]}
        _, source_frames = helper.decode_pack(ROOT / f"docs/kling-motion/exports/{character}.character.zip")
        original_bank_bytes = subprocess.check_output(["git", "show", f"{result['baselineCommit']}:docs/kling-appearance/banks/{character}.zip"], cwd=ROOT)
        with zipfile.ZipFile(io.BytesIO(original_bank_bytes)) as archive:
            original_bank = json.loads(archive.read("manifest.json"))
        prior_poses = {p["frameId"]: p for p in original_bank["poses"]}
        for fid, pose in poses.items():
            prior = prior_poses[fid]["foreground"]
            if character == "female" and fid in HAND_REPAIRS:
                expected = [{"x": x, "y": y} for x, y in HAND_REPAIRS[fid]]
                assert pose["foreground"] == prior + [expected]
                original = np.array(source_frames[fid])
                yy, xx = np.mgrid[:original.shape[0], :original.shape[1]]
                patch = in_polygon(HAND_REPAIRS[fid], xx + 0.5, yy + 0.5)
                assert (original[patch, 3] == 255).all(), "hand polygon includes nonopaque background"
            else:
                assert pose["foreground"] == prior
        for style in ["soft-crop", "soft-bob"]:
            baseline = ROOT / f"docs/kling-appearance/ear-edge-review/evidence/final-{character}/exports/{character}-{style}.character.zip"
            previous_manifest, previous = helper.decode_pack(baseline)
            if style == default_style:
                assert frames.keys() == previous.keys()
                assert manifest["animations"] == previous_manifest["animations"]
                assert manifest["anchor"] == previous_manifest["anchor"]
                checks = [compare_frame(previous[fid], frames[fid], poses[fid], character, source_frames[fid]) for fid in frames]
                result["packs"].append({
                    "character": character,
                    "hairstyle": style,
                    "baselinePack": relative_or_absolute(baseline),
                    "baselineSha256": helper.sha(baseline),
                    "capturedPack": str(current),
                    "capturedSha256": helper.sha(current),
                    "capturedPackRetainedInRepository": False,
                    "captureIndex": relative_or_absolute(directory / "evidence-index.json"),
                    "appearanceBankSha256": helper.sha(bank_path),
                    "uniqueFrames": len(checks),
                    "changedFrames": sum(check["changedPixels"] > 0 for check in checks),
                    "changedPixels": sum(check["changedPixels"] for check in checks),
                    "actionsAndAnchorExact": True,
                    "captureIndexPassedAndHashesMatched": True,
                    "frameChecks": checks,
                })
            samples = [(0, directory / f"{character}-thumbnail-{style}-0-right.png")]
            if character == "male":
                samples.append((90, directory / f"{character}-guard-{style}-90-right.png"))
            if character == "female":
                hand_ids = list(HAND_REPAIRS) + ([75, 80] if style == default_style else [])
                samples.extend((fid, directory / f"female-hand-{style}-{fid}-right.png") for fid in hand_ids)
            for fid, path in samples:
                with Image.open(path) as png:
                    actual = png.convert("RGBA")
                    actual.load()
                result["actualPngSamples"].append({
                    "character": character,
                    "hairstyle": style,
                    "png": relative_or_absolute(path),
                    "sha256": helper.sha(path),
                    **compare_frame(previous[fid], actual, poses[fid], character, source_frames[fid]),
                })
    output = workflow_root.parent / "final-visual-validation.json"
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({
        "file": relative_or_absolute(output),
        "packFrames": sum(p["uniqueFrames"] for p in result["packs"]),
        "pngSamples": len(result["actualPngSamples"]),
        "changedPixels": sum(p["changedPixels"] for p in result["packs"]),
    }))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-root", type=Path, default=Path("/tmp/gathria-appearance-stability"))
    parser.add_argument("--workflow-root", type=Path, default=ROOT / "docs/kling-appearance/stability-review/workflow")
    parser.add_argument("--female-run", default="final-female-hand-fix")
    arguments = parser.parse_args()
    main(arguments.capture_root, arguments.workflow_root, arguments.female_run)
