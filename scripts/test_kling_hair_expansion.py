"""New-style geometry/ownership regressions, separate from visual acceptance.

Use all real Kling poses to exercise the composed inverse sampler. Forward
registration and numerical Jacobians check its result independently; no image
fixture or numerical metric substitutes for reviewing exported characters.
"""
import copy
import json
from pathlib import Path
import unittest

import numpy as np
from PIL import Image

from kling_hair_ear_fit import ear_fit, ear_weight, fit_ear_hair, inverse_ear_map
from kling_hair_ear_overlap import inverse_overlap_map, overlap_weight
from kling_hair_expansion import DONOR_PATH, expansion_layers, expansion_overlap

ROOT = Path(__file__).resolve().parents[1]


def registrations():
    for character in ('male', 'female'):
        rows = json.loads((ROOT / 'artwork/kling-appearance/registration' /
                           f'{character}.json').read_text())['frames']
        yield character, next(row for row in rows if row['frameId'] == 0), rows


def composed_inverse(x, y, reference, row, overlap):
    local, center, radii = ear_fit(reference, row)
    sx, sy = inverse_ear_map(x, y, local, center, radii)
    return inverse_overlap_map(sx, sy, overlap['center'], overlap['radii'],
                               overlap['displacement'])


class ExpansionGeometryRegression(unittest.TestCase):
    def test_all_184_poses_invert_without_folding_or_pinching(self):
        count, worst_error, minimum_jacobian = 0, 0., float('inf')
        for character, reference, rows in registrations():
            overlap = expansion_overlap(character, reference)
            for row in rows:
                with self.subTest(character=character, frame=row['frameId']):
                    local, center, radii = ear_fit(reference, row)
                    yy, xx = np.mgrid[
                        center[1]-radii[1]-4:center[1]+radii[1]+5:2,
                        center[0]-radii[0]-4:center[0]+radii[0]+5:2]
                    sx, sy = composed_inverse(xx, yy, reference, row, overlap)
                    self.assertTrue(np.isfinite(sx).all() and np.isfinite(sy).all())
                    # Forward deformation has the reverse composition order.
                    weight = overlap_weight(sx, sy, overlap['center'], overlap['radii'])
                    ox = sx + weight * overlap['displacement'][0]
                    oy = sy + weight * overlap['displacement'][1]
                    weight = ear_weight(ox, oy, center, radii)
                    fx = ox + weight * ((local[0, 0]-1)*ox + local[0, 1]*oy + local[0, 2])
                    fy = oy + weight * (local[1, 0]*ox + (local[1, 1]-1)*oy + local[1, 2])
                    error = float(np.max(np.hypot(fx-xx, fy-yy)))
                    self.assertLess(error, .01, 'Inverse error exceeds 1/100 native pixel')
                    sx_y, sx_x = np.gradient(sx, 2, 2)
                    sy_y, sy_x = np.gradient(sy, 2, 2)
                    jacobian = float(np.min(sx_x*sy_y-sx_y*sy_x))
                    self.assertGreater(jacobian, .25, 'A hair lock folds or pinches')
                    worst_error = max(worst_error, error)
                    minimum_jacobian = min(minimum_jacobian, jacobian)
                    count += 1
        self.assertEqual(count, 184)
        print(f'expansion poses={count}; max inverse error={worst_error:.8f}px; '
              f'min inverse Jacobian={minimum_jacobian:.8f}')

    def test_local_overlap_does_not_escape_sampler_or_move_remote_features(self):
        yy, xx = np.mgrid[0:600:1, 0:704:1]
        for character, reference, rows in registrations():
            with self.subTest(character=character):
                overlap = expansion_overlap(character, reference)
                self.assertIsNone(expansion_overlap(character, reference, 'hair-back'))
                _, center, radii = ear_fit(reference, reference)
                weight = overlap_weight(xx, yy, overlap['center'], overlap['radii'])
                owned = weight > 0
                self.assertTrue(owned.any())
                self.assertTrue(np.all(ear_weight(xx[owned], yy[owned], center, radii) > 0),
                                'New overlap is cut off by the existing sampler boundary')
                dx, dy = overlap['displacement']
                self.assertTrue(np.all(ear_weight(xx[owned]+dx*weight[owned],
                                                 yy[owned]+dy*weight[owned], center, radii) > 0))
                guides = reference['featureGuides']
                points = np.array([[guides[name]['x'], guides[name]['y']]
                                   for name in ('crown', 'nearEye', 'farEye', 'chin', 'neck')]
                                  + [[425., 300.]])
                for row in rows:
                    local, center, radii = ear_fit(reference, row)
                    old = inverse_ear_map(points[:, 0], points[:, 1], local, center, radii)
                    actual = composed_inverse(points[:, 0], points[:, 1], reference, row, overlap)
                    np.testing.assert_array_equal(actual, old)

    def test_sampler_is_deterministic_nonmutating_and_preserves_remote_rgba(self):
        yy, xx = np.indices((600, 704))
        donor = np.stack([xx % 256, yy % 256, (xx+yy) % 256,
                          (3*xx+yy) % 256], axis=2).astype(np.uint8)
        baseline, fit = donor.copy(), np.eye(3)[:2]
        padding = {'left': 0, 'top': 0, 'right': 0, 'bottom': 0}
        donor_before, baseline_before, fit_before = donor.copy(), baseline.copy(), fit.copy()
        for character, reference, rows in registrations():
            overlap = expansion_overlap(character, reference)
            reference_before, overlap_before = copy.deepcopy(reference), copy.deepcopy(overlap)
            for row in (reference, rows[len(rows)//2], rows[-1]):
                with self.subTest(character=character, frame=row['frameId']):
                    row_before = copy.deepcopy(row)
                    args = donor, fit, row, reference, padding, (704, 600), baseline
                    result = fit_ear_hair(*args, overlap=overlap)
                    np.testing.assert_array_equal(result, fit_ear_hair(*args, overlap=overlap))
                    self.assertFalse(np.shares_memory(result, baseline))
                    inverse_head = np.linalg.inv(np.vstack([row['headTransform'], [0, 0, 1]]))
                    qx = inverse_head[0, 0]*xx + inverse_head[0, 1]*yy + inverse_head[0, 2]
                    qy = inverse_head[1, 0]*xx + inverse_head[1, 1]*yy + inverse_head[1, 2]
                    _, center, radii = ear_fit(reference, row)
                    outside = ear_weight(qx, qy, center, radii) == 0
                    np.testing.assert_array_equal(result[outside], baseline[outside])
                    self.assertTrue(np.any(result[~outside] != baseline[~outside]))
                    self.assertEqual(row, row_before)
            self.assertEqual(reference, reference_before)
            self.assertEqual(overlap, overlap_before)
        np.testing.assert_array_equal(donor, donor_before)
        np.testing.assert_array_equal(baseline, baseline_before)
        np.testing.assert_array_equal(fit, fit_before)
        self.assertEqual(padding, {'left': 0, 'top': 0, 'right': 0, 'bottom': 0})


class ExpansionDonorRegression(unittest.TestCase):
    def test_reviewed_hair_is_donor_exact_and_faces_ears_and_other_character_are_excluded(self):
        original_bytes = DONOR_PATH.read_bytes()
        source = np.array(Image.open(DONOR_PATH).convert('RGBA'))
        witnesses = {'male': {'hair-front': (500, 180), 'hair-back': (300, 625)},
                     'female': {'hair-front': (1330, 220), 'hair-back': (1010, 535)}}
        excluded = ((280, 530), (620, 310), (1160, 560), (1500, 330), (1440, 600))
        for character in ('male', 'female'):
            layers = expansion_layers(character)
            self.assertEqual([role for role, _, _ in layers], ['hair-back', 'hair-front'])
            for role, cutout, fit in layers:
                with self.subTest(character=character, layer=role):
                    visible = cutout[:, :, 3] > 0
                    np.testing.assert_array_equal(cutout[visible, :3], source[visible, :3])
                    self.assertTrue(np.all(cutout[:, :, 3] <= source[:, :, 3]))
                    self.assertGreater(np.count_nonzero(visible), 10_000)
                    self.assertGreater(np.linalg.det(fit[:, :2]), 0)
                    x, y = witnesses[character][role]
                    self.assertGreater(int(source[y, x, 3]), 240)
                    np.testing.assert_array_equal(cutout[y, x], source[y, x])
                    for x, y in excluded:
                        self.assertEqual(int(cutout[y, x, 3]), 0, f'Unowned donor skin at {x},{y}')
                    other = visible[:, 920:] if character == 'male' else visible[:, :900]
                    self.assertFalse(other.any(), 'The other donor character leaked into this style')
        self.assertEqual(DONOR_PATH.read_bytes(), original_bytes)


if __name__ == '__main__':
    unittest.main()
