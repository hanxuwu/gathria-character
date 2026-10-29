"""Corrupted-package and source-binding checks for the offline authoring CLI."""
from __future__ import annotations

from copy import deepcopy
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import numpy as np

from PIL import Image

from kling_side_authoring import SideContext, W, H, encode_rgba, sha
from kling_side_tools import context_for, lint_garment, main, select_frames, write_guides


class SideToolsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        polygon = [{"x": 4, "y": 4}, {"x": 9, "y": 4}, {"x": 9, "y": 9}, {"x": 4, "y": 9}]
        frames, registered, audits = {}, {}, {}
        for fid in (10, 11):
            source = np.zeros((H, W, 4), np.uint8)
            source[4:9, 4:9] = [200, 130, 80, 255]
            source[100:102, 100:102] = [80, 80, 90, 255]
            frames[fid] = source
            registered[fid] = {"frameId": fid, "sourceFrame": fid + 40,
                               "points": {}, "protected": [{"label": "head", "polygon": polygon}]}
            audits[fid] = {"action": "walk", "source": "fixture-source", "reviewedSeed": True, "trackedSteps": 0}
        cls.ctx = SideContext(
            "male", Path("/tmp"), b"fixture-source", b"fixture-registration",
            {"animations": {"walk": {"frames": [11, 10], "fps": 24, "loop": True}, "run": {"frames": []}}},
            {"characterId": "fixture"}, {"characterId": "fixture"}, frames, registered, audits, [],
        )

    def setUp(self):
        self.ctx = deepcopy(type(self).ctx)
        self.temporary = tempfile.TemporaryDirectory(prefix="side-tools-test-", dir="/tmp")
        self.folder = Path(self.temporary.name)
        self.path = self.folder / "fixture.garment.zip"
        self.patch = np.zeros((2, 4, 4), np.uint8)
        self.patch[:, :, :] = [30, 90, 130, 255]
        self.ownership = np.zeros_like(self.patch)
        self.ownership[:, :, 3] = 255
        self.manifest = {
            "format": "gathria-sprite-garment", "version": 1,
            "id": "fixture", "name": "Source-bound fixture", "slot": "top",
            "sourceSha256": self.ctx.source_sha256, "registrationSha256": self.ctx.registration_sha256,
            "characterId": "fixture", "frameWidth": W, "frameHeight": H,
            "pages": [{"file": "patches-0.png", "maskFile": "ownership-0.png", "width": 4, "height": 2}],
            "frames": [{"frameId": fid, "page": 0,
                        "rect": {"x": index * 2, "y": 0, "width": 2, "height": 2},
                        "offset": {"x": 100, "y": 100}} for index, fid in enumerate((10, 11))],
            "provenance": "Small synthetic fixture; no production artwork.",
        }

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, extra=None):
        files = {"manifest.json": json.dumps(self.manifest).encode(),
                 "patches-0.png": encode_rgba(self.patch),
                 "ownership-0.png": encode_rgba(self.ownership)}
        files.update(extra or {})
        with zipfile.ZipFile(self.path, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, data in files.items():
                archive.writestr(name, data)

    def inspect(self):
        self.write()
        return lint_garment(self.ctx, self.path)

    def expect_issue(self, code, report=None):
        report = report or self.inspect()
        self.assertFalse(report["ok"])
        matches = [issue for issue in report["issues"] if issue["code"] == code]
        self.assertTrue(matches, report["issues"])
        return matches[0]

    def test_valid_package_and_transparent_erasure_are_not_flagged(self):
        self.patch[0, 0] = [0, 0, 0, 0]
        self.write()
        before = sha(self.path.read_bytes())
        report = lint_garment(self.ctx, self.path)
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["checkedFrames"], 2)
        self.assertEqual(report["frames"][0]["erasedSourcePixels"], 1)
        self.assertEqual(sha(self.path.read_bytes()), before)

    def test_binding_mismatch_reports_both_expected_and_actual(self):
        self.manifest["registrationSha256"] = "b" * 64
        issue = self.expect_issue("binding-mismatch")
        self.assertEqual(issue["expected"], self.ctx.registration_sha256)
        self.assertEqual(issue["actual"], "b" * 64)

    def test_missing_pose_reports_original_action_and_video_frame(self):
        self.manifest["frames"].pop(0)
        issue = self.expect_issue("missing-frame")
        self.assertEqual((issue["frameId"], issue["action"], issue["position"], issue["sourceFrame"]), (10, "walk", 1, 50))

    def test_duplicate_and_unknown_frames_are_rejected(self):
        self.manifest["frames"][1]["frameId"] = 10
        report = self.inspect()
        self.expect_issue("duplicate-frame", report)
        self.expect_issue("missing-frame", report)
        self.manifest["frames"][1]["frameId"] = 999
        self.expect_issue("unknown-frame")

    def test_nonbinary_ownership_reports_page_and_affected_frame(self):
        self.ownership[0, 0, 3] = 128
        report = self.inspect()
        self.expect_issue("nonbinary-page-ownership", report)
        self.assertEqual(self.expect_issue("nonbinary-frame-ownership", report)["frameId"], 10)

    def test_visible_paint_without_ownership_is_rejected(self):
        self.ownership[0, 0, 3] = 0
        self.assertEqual(self.expect_issue("unowned-frame-art")["frameId"], 10)

    def test_protected_ownership_even_matching_source_color_is_rejected(self):
        self.manifest["frames"][0]["offset"] = {"x": 5, "y": 5}
        self.patch[:, :2] = [200, 130, 80, 255]
        issue = self.expect_issue("protected-overlap")
        self.assertEqual(issue["label"], "head")
        self.assertEqual(issue["pixels"], 4)
        self.assertEqual(issue["samplePixels"][0], [5, 5])

    def test_protection_on_transparent_source_is_not_a_false_positive(self):
        self.manifest["frames"][0]["offset"] = {"x": 4, "y": 4}
        self.ctx.frames[10][4:6, 4:6, 3] = 0
        try:
            report = self.inspect()
            self.assertTrue(report["ok"], report)
            self.assertEqual(report["frames"][0]["extendedSilhouettePixels"], 4)
        finally:
            self.ctx.frames[10][4:6, 4:6, 3] = 255

    def test_atlas_and_native_bounds_rejected_without_clipping(self):
        self.manifest["frames"][0]["rect"]["width"] = 5
        self.expect_issue("atlas-bounds")
        self.manifest["frames"][0]["rect"]["width"] = 2
        self.manifest["frames"][0]["offset"]["x"] = W - 1
        self.expect_issue("native-bounds")

    def test_float_bool_and_invalid_page_geometry_rejected(self):
        self.manifest["frames"][0]["offset"]["x"] = 100.5
        self.expect_issue("frame-geometry")
        self.manifest["frames"][0]["offset"]["x"] = True
        self.expect_issue("frame-geometry")
        self.manifest["frames"][0]["offset"]["x"] = 100
        self.manifest["frames"][0]["page"] = 4
        self.expect_issue("frame-page")

    def test_decode_failure_reports_frame_not_only_page(self):
        self.write({"patches-0.png": b"badPNG"})
        report = lint_garment(self.ctx, self.path)
        self.expect_issue("page-decode", report)
        self.expect_issue("unavailable-frame-page", report)

    def test_archive_extra_paths_and_duplicate_entries_rejected(self):
        self.write({"../outside.png": b"unused"})
        self.expect_issue("archive-members", lint_garment(self.ctx, self.path))
        self.assertFalse((self.folder.parent / "outside.png").exists())
        self.write()
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with zipfile.ZipFile(self.path, "a") as archive:
                archive.writestr("manifest.json", b"{}")
        self.expect_issue("archive-members", lint_garment(self.ctx, self.path))

    def test_huge_declared_dimensions_rejected_before_decode(self):
        self.manifest["pages"][0]["width"] = 8192
        self.manifest["pages"][0]["height"] = 8192
        self.expect_issue("pixel-budget")

    def test_unrecognized_format_does_not_claim_compatibility(self):
        self.manifest["version"] = 2
        self.expect_issue("unsupported-version")

    def test_frame_selection_preserves_clip_order_and_rejects_errors(self):
        self.assertEqual(select_frames(self.ctx, "walk", [10, 11]), [11, 10])
        for args in (("walk", [10, 10]), ("walk", [99]), ("run", [10]), (None, [])):
            with self.assertRaises(ValueError):
                select_frames(self.ctx, *args)

    def test_guides_refuse_to_overwrite_existing_art(self):
        existing = self.folder / "paint.png"
        existing.write_bytes(b"approved work")
        with self.assertRaisesRegex(ValueError, "never overwritten"):
            write_guides(self.ctx, self.folder, [10])
        self.assertEqual(existing.read_bytes(), b"approved work")

    def test_cli_does_not_overwrite_unrelated_json(self):
        self.write()
        target = self.folder / "art-metadata.json"
        target.write_text('{"approvedArtwork":true}\n')
        with patch("kling_side_tools.context_for", return_value=self.ctx), contextlib.redirect_stderr(io.StringIO()):
            result = main(["--identity", "male", "lint", str(self.path), "--report", str(target)])
        self.assertEqual(result, 2)
        self.assertEqual(target.read_text(), '{"approvedArtwork":true}\n')

    def test_cli_exit_code_and_structured_error_agree(self):
        self.manifest["frames"].pop()
        self.write()
        target = self.folder / "preflight.json"
        with patch("kling_side_tools.context_for", return_value=self.ctx), contextlib.redirect_stdout(io.StringIO()):
            result = main(["--identity", "male", "lint", str(self.path), "--report", str(target)])
        self.assertEqual(result, 1)
        report = json.loads(target.read_bytes())
        self.assertFalse(report["ok"])
        self.assertIn("missing-frame", [issue["code"] for issue in report["issues"]])


class ActualSourceGuideTests(unittest.TestCase):
    def test_native_source_and_protection_roundtrip(self):
        ctx = context_for("female")
        with tempfile.TemporaryDirectory(prefix="side-tools-guide-", dir="/tmp") as temporary:
            output = Path(temporary) / "guides"
            index = write_guides(ctx, output, [49])
            entry = index["frames"][0]
            metadata = json.loads((output / entry["files"]["metadata"]).read_bytes())
            self.assertEqual(metadata["sourceFrame"], ctx.registered[49]["sourceFrame"])
            self.assertEqual(metadata["registrationSha256"], ctx.registration_sha256)
            source = np.array(Image.open(output / entry["files"]["source"]))
            self.assertTrue(np.array_equal(source, ctx.frames[49]))
            paint = np.array(Image.open(output / entry["files"]["paintLayer"]))
            self.assertFalse(paint.any())
            for label, record in entry["protection"]["masks"].items():
                data = (output / record["file"]).read_bytes()
                pixels = np.array(Image.open(io.BytesIO(data)))
                self.assertEqual(sha(data), record["sha256"])
                self.assertTrue(np.isin(pixels, [0, 255]).all())
                self.assertTrue(np.array_equal(pixels == 255, ctx.protected_mask(49, label)))
            for name, expected in entry["fileSha256"].items():
                self.assertEqual(sha((output / entry["files"][name]).read_bytes()), expected)


if __name__ == "__main__":
    unittest.main(verbosity=2)
