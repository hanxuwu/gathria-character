"""Geometric regressions for hair-only ear follow; fixtures are not artwork.

Real registered poses exercise the difficult crouch/jump displacements. These
checks protect continuity and locality; visual acceptance still uses app exports.
"""
import copy
import json
from pathlib import Path
import unittest

import numpy as np
from PIL import Image

from kling_hair_ear_fit import ear_fit, inverse_ear_map, ear_weight, fit_ear_hair
from kling_hair_donor_mask import clean_donor, exclusion_alpha


ROOT = Path(__file__).resolve().parents[1]


def registrations():
    for character in ('male', 'female'):
        rows = json.loads((ROOT / 'artwork/kling-appearance/registration' /
                           f'{character}.json').read_text())['frames']
        reference = next(row for row in rows if row['frameId'] == 0)
        yield character, reference, rows


class HairEarFitRegression(unittest.TestCase):
    def test_every_registered_pose_is_continuous_and_inverts_below_pixel_precision(self):
        count = 0
        for character, reference, rows in registrations():
            for row in rows:
                with self.subTest(character=character, frame=row['frameId']):
                    local, center, radii = ear_fit(reference, row)
                    # Cover the full support and its unchanged outer boundary.
                    yy, xx = np.mgrid[
                        center[1] - radii[1] - 2:center[1] + radii[1] + 3:2,
                        center[0] - radii[0] - 2:center[0] + radii[0] + 3:2]
                    sx, sy = inverse_ear_map(xx, yy, local, center, radii)
                    self.assertTrue(np.isfinite(sx).all() and np.isfinite(sy).all())
                    weight = ear_weight(sx, sy, center, radii)
                    # Independent forward registration: blend skull to face
                    # only inside the ear support, then recover queried pixels.
                    face_x = local[0, 0] * sx + local[0, 1] * sy + local[0, 2]
                    face_y = local[1, 0] * sx + local[1, 1] * sy + local[1, 2]
                    forward_x = (1 - weight) * sx + weight * face_x
                    forward_y = (1 - weight) * sy + weight * face_y
                    error = float(np.max(np.hypot(forward_x - xx, forward_y - yy)))
                    self.assertLess(error, .05, 'Inverse sampling moves over 1/20 pixel')
                    # A negative determinant folds hair into itself; a near-zero
                    # determinant pinches a lock into a line. This checks the
                    # actual inverse map, not a symbolic copy of its equation.
                    sx_y, sx_x = np.gradient(sx, 2, 2)
                    sy_y, sy_x = np.gradient(sy, 2, 2)
                    determinant = sx_x * sy_y - sx_y * sy_x
                    self.assertGreater(float(determinant.min()), .25)
                    count += 1
        self.assertEqual(count, 184)

    def test_original_ear_guide_is_followed_while_crown_and_central_fringe_stay_fixed(self):
        for character, reference, rows in registrations():
            ear = np.array([reference['featureGuides']['earTop'][axis] for axis in ('x', 'y')])
            crown = np.array([reference['featureGuides']['crown'][axis] for axis in ('x', 'y')])
            central_fringe = np.array([425., 300.])
            for row in rows:
                with self.subTest(character=character, frame=row['frameId']):
                    local, center, radii = ear_fit(reference, row)
                    desired = (local @ np.r_[ear, 1])[:2]
                    sx, sy = inverse_ear_map(desired[:1], desired[1:], local, center, radii)
                    np.testing.assert_allclose([sx[0], sy[0]], ear, atol=.05)
                    fixed = np.array([crown, central_fringe])
                    sx, sy = inverse_ear_map(fixed[:, 0], fixed[:, 1], local, center, radii)
                    np.testing.assert_array_equal(np.column_stack([sx, sy]), fixed)

    def test_reference_and_remote_pixels_are_exact_and_inputs_are_not_modified(self):
        character, reference, rows = next(registrations())
        row = next(row for row in rows if row['frameId'] == 86)
        # The fixture has invisible RGB and soft alpha too. It is a numerical
        # buffer, not a substitute for a source or generated character drawing.
        yy, xx = np.indices((600, 704))
        donor = np.stack([xx % 256, yy % 256, (xx + yy) % 256,
                          (3 * xx + yy) % 256], axis=2).astype(np.uint8)
        baseline = donor.copy()
        saved_donor, saved_baseline = donor.copy(), baseline.copy()
        saved_row, saved_reference = copy.deepcopy(row), copy.deepcopy(reference)
        identity = np.eye(3)[:2]
        padding = {'left': 0, 'top': 0, 'right': 0, 'bottom': 0}
        unchanged = fit_ear_hair(donor, identity, reference, reference,
                                 padding, (704, 600), baseline)
        np.testing.assert_array_equal(unchanged, baseline)
        self.assertFalse(np.shares_memory(unchanged, baseline))
        result = fit_ear_hair(donor, identity, row, reference,
                              padding, (704, 600), baseline)
        repeated = fit_ear_hair(donor, identity, row, reference,
                                padding, (704, 600), baseline)
        np.testing.assert_array_equal(result, repeated)
        np.testing.assert_array_equal(donor, saved_donor)
        np.testing.assert_array_equal(baseline, saved_baseline)
        self.assertEqual(row, saved_row)
        self.assertEqual(reference, saved_reference)
        # Derive the fixed region from the independent reference-head inverse.
        head_inverse = np.linalg.inv(np.vstack([row['headTransform'], [0, 0, 1]]))
        qx = head_inverse[0, 0] * xx + head_inverse[0, 1] * yy + head_inverse[0, 2]
        qy = head_inverse[1, 0] * xx + head_inverse[1, 1] * yy + head_inverse[1, 2]
        _, center, radii = ear_fit(reference, row)
        outside = ((qx - center[0]) / radii[0]) ** 2 + ((qy - center[1]) / radii[1]) ** 2 >= 1
        np.testing.assert_array_equal(result[outside], baseline[outside])
        self.assertTrue(np.any(result[~outside] != baseline[~outside]))

    def test_unreviewed_large_displacement_is_rejected(self):
        _, reference, _ = next(registrations())
        row = copy.deepcopy(reference)
        row['faceTransform'][0][2] += 100
        with self.assertRaisesRegex(ValueError, 'Unreviewed ear displacement'):
            ear_fit(reference, row)


class HairDonorOwnershipRegression(unittest.TestCase):
    def test_reviewed_skin_holes_are_removed_without_cutting_hair_highlights(self):
        # These fixed native coordinates are visibly peach donor skin trapped
        # between far-side locks, paired with unaffected warm hair highlights.
        examples = (
            ('soft-crop', 'male', (784, 355), (417, 271)),
            ('soft-crop', 'female', (1546, 376), (1156, 267)),
            ('soft-bob', 'male', (715, 375), (352, 205)),
            ('soft-bob', 'female', (1537, 385), (1179, 226)),
        )
        for style, character, skin, highlight in examples:
            with self.subTest(style=style, character=character):
                source = np.array(Image.open(
                    ROOT / f'artwork/kling-appearance/source/{style}-design.png'
                ).convert('RGBA'))
                saved = source.copy()
                result = clean_donor(source, style, character)
                x, y = skin
                self.assertGreater(int(source[y, x, 0]), 225)
                self.assertGreater(int(source[y, x, 3]), 240)
                self.assertEqual(int(result[y, x, 3]), 0)
                hx, hy = highlight
                self.assertGreater(int(source[hy, hx, 0]), 200)
                np.testing.assert_array_equal(result[hy, hx], source[hy, hx])
                # An exclusion can only reduce alpha, never recolor, brighten,
                # add donor pixels or alter data outside its reviewed coverage.
                self.assertTrue(np.all(result[:, :, 3] <= source[:, :, 3]))
                np.testing.assert_array_equal(result[:, :, :3], source[:, :, :3])
                outside = exclusion_alpha(source.shape, style, character) == 0
                np.testing.assert_array_equal(result[outside], source[outside])
                np.testing.assert_array_equal(source, saved)

    def test_reviewed_masks_reject_a_resized_or_wrong_shape_donor(self):
        with self.assertRaisesRegex(ValueError, '1774x887'):
            clean_donor(np.zeros((886, 1774, 4), np.uint8), 'soft-crop', 'male')
        with self.assertRaisesRegex(ValueError, '1774x887'):
            clean_donor(np.zeros((887, 1773, 4), np.uint8), 'soft-crop', 'male')
        with self.assertRaisesRegex(ValueError, 'uint8 RGBA'):
            clean_donor(np.zeros((887, 1774, 3), np.uint8), 'soft-crop', 'male')


if __name__ == '__main__':
    unittest.main()
