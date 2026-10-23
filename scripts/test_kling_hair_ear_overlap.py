"""Regressions for the authored male ear overlap, not visual acceptance.

Use every real male registration to exercise the existing face-follow mapping
combined with the new local donor overlap. Numeric fixtures exercise pixel
ownership/immutability; they never substitute for exported character evidence.
"""
import copy
import json
from pathlib import Path
import unittest

import numpy as np
from PIL import Image

from kling_hair_ear_fit import ear_fit, ear_weight, fit_ear_hair, inverse_ear_map
from kling_hair_ear_overlap import inverse_overlap_map, male_ear_overlap, overlap_weight
from kling_hair_rear_lock import male_bob_rear_donor, male_bob_rear_fit


ROOT = Path(__file__).resolve().parents[1]


def male_registrations():
    rows = json.loads((ROOT / 'artwork/kling-appearance/registration/male.json').read_text())['frames']
    return next(row for row in rows if row['frameId'] == 0), rows


def combine_inverse(x, y, reference, row):
    local, center, radii = ear_fit(reference, row)
    sx, sy = inverse_ear_map(x, y, local, center, radii)
    overlap = male_ear_overlap(reference)
    return inverse_overlap_map(sx, sy, overlap['center'], overlap['radii'],
                               overlap['displacement'])


class MaleHairEarOverlapRegression(unittest.TestCase):
    def test_all_male_poses_round_trip_without_foldover_or_pinching(self):
        reference, rows = male_registrations()
        overlap = male_ear_overlap(reference)
        count, worst_error, lowest_determinant = 0, 0., float('inf')
        for row in rows:
            with self.subTest(frame=row['frameId']):
                local, center, radii = ear_fit(reference, row)
                # Dense coverage includes both transition bands and fixed outer
                # margins. Two-pixel samples are smaller than visible hair locks.
                yy, xx = np.mgrid[
                    center[1]-radii[1]-4:center[1]+radii[1]+5:2,
                    center[0]-radii[0]-4:center[0]+radii[0]+5:2]
                sx, sy = combine_inverse(xx, yy, reference, row)
                self.assertTrue(np.isfinite(sx).all() and np.isfinite(sy).all())
                # Independent forward composition, in the opposite order:
                # authored donor overlap, then the existing ear/face movement.
                weight = overlap_weight(sx, sy, overlap['center'], overlap['radii'])
                ox = sx + weight * overlap['displacement'][0]
                oy = sy + weight * overlap['displacement'][1]
                weight = ear_weight(ox, oy, center, radii)
                fx = ox + weight * ((local[0, 0]-1)*ox + local[0, 1]*oy + local[0, 2])
                fy = oy + weight * (local[1, 0]*ox + (local[1, 1]-1)*oy + local[1, 2])
                error = float(np.max(np.hypot(fx-xx, fy-yy)))
                self.assertLess(error, .01, 'Combined inverse misses over 1/100 native pixel')
                sx_y, sx_x = np.gradient(sx, 2, 2)
                sy_y, sy_x = np.gradient(sy, 2, 2)
                determinant = float(np.min(sx_x*sy_y-sx_y*sy_x))
                self.assertGreater(determinant, .25, 'Hair locks fold or pinch at the ear')
                worst_error = max(worst_error, error)
                lowest_determinant = min(lowest_determinant, determinant)
                count += 1
        self.assertEqual(count, 88)
        print(f'combined male poses={count}; max inverse error={worst_error:.8f}px; '
              f'min inverse Jacobian={lowest_determinant:.8f}')

    def test_crown_eyes_fringe_chin_and_neck_keep_the_previous_mapping(self):
        reference, rows = male_registrations()
        guides = reference['featureGuides']
        points = np.array([[guides[name]['x'], guides[name]['y']]
                           for name in ('crown', 'nearEye', 'farEye', 'chin', 'neck')]
                          + [[425., 300.]])
        for row in rows:
            with self.subTest(frame=row['frameId']):
                local, center, radii = ear_fit(reference, row)
                old_x, old_y = inverse_ear_map(points[:, 0], points[:, 1], local, center, radii)
                new_x, new_y = combine_inverse(points[:, 0], points[:, 1], reference, row)
                # Eyes are outside the NEW overlap, even if the existing wider
                # face-follow transition has a small influence at those points.
                np.testing.assert_array_equal(new_x, old_x)
                np.testing.assert_array_equal(new_y, old_y)

    def test_authored_overlap_stays_within_the_existing_hair_edit_support(self):
        reference, _ = male_registrations()
        overlap = male_ear_overlap(reference)
        _, center, radii = ear_fit(reference, reference)
        yy, xx = np.mgrid[0:600:1, 0:704:1]
        weight = overlap_weight(xx, yy, overlap['center'], overlap['radii'])
        owned = weight > 0
        self.assertTrue(np.any(owned))
        # The source and destination supports must both be within the sampler's
        # existing ear region; otherwise its boundary would cut moving locks.
        self.assertTrue(np.all(ear_weight(xx[owned], yy[owned], center, radii) > 0))
        dx, dy = overlap['displacement']
        self.assertTrue(np.all(ear_weight(xx[owned]+dx*weight[owned],
                                         yy[owned]+dy*weight[owned], center, radii) > 0))
        outside = weight == 0
        sx, sy = inverse_overlap_map(xx[outside], yy[outside], overlap['center'],
                                     overlap['radii'], overlap['displacement'])
        np.testing.assert_array_equal(sx, xx[outside])
        np.testing.assert_array_equal(sy, yy[outside])

    def test_rendering_is_deterministic_nonmutating_and_keeps_remote_pixels_exact(self):
        reference, rows = male_registrations()
        overlap = male_ear_overlap(reference)
        # Include soft/invisible alpha and nonzero invisible RGB to detect broad
        # alpha cleanup or color transforms outside the local replacement.
        yy, xx = np.indices((600, 704))
        donor = np.stack([xx % 256, yy % 256, (xx+yy) % 256,
                          (3*xx+yy) % 256], axis=2).astype(np.uint8)
        baseline = donor.copy()
        donor_fit = np.eye(3)[:2]
        padding = {'left': 0, 'top': 0, 'right': 0, 'bottom': 0}
        saved = (donor.copy(), baseline.copy(), donor_fit.copy(),
                 copy.deepcopy(reference), copy.deepcopy(overlap), padding.copy())
        for frame_id in (0, 86, 88, 109):
            row = next(row for row in rows if row['frameId'] == frame_id)
            saved_row = copy.deepcopy(row)
            with self.subTest(frame=frame_id):
                result = fit_ear_hair(donor, donor_fit, row, reference,
                                     padding, (704, 600), baseline, overlap=overlap)
                repeat = fit_ear_hair(donor, donor_fit, row, reference,
                                     padding, (704, 600), baseline, overlap=overlap)
                np.testing.assert_array_equal(result, repeat)
                self.assertFalse(np.shares_memory(result, baseline))
                head_inv = np.linalg.inv(np.vstack([row['headTransform'], [0, 0, 1]]))
                qx = head_inv[0, 0]*xx + head_inv[0, 1]*yy + head_inv[0, 2]
                qy = head_inv[1, 0]*xx + head_inv[1, 1]*yy + head_inv[1, 2]
                _, center, radii = ear_fit(reference, row)
                outside = ear_weight(qx, qy, center, radii) == 0
                np.testing.assert_array_equal(result[outside], baseline[outside])
                self.assertTrue(np.any(result[~outside] != baseline[~outside]))
                self.assertEqual(row, saved_row)
        np.testing.assert_array_equal(donor, saved[0])
        np.testing.assert_array_equal(baseline, saved[1])
        np.testing.assert_array_equal(donor_fit, saved[2])
        self.assertEqual(reference, saved[3])
        self.assertEqual(overlap, saved[4])
        self.assertEqual(padding, saved[5])

    def test_omitting_the_overlap_keeps_legacy_reference_exact(self):
        reference, _ = male_registrations()
        yy, xx = np.indices((600, 704))
        donor = np.stack([xx % 256, yy % 256, (xx+yy) % 256,
                          np.full(xx.shape, 255)], axis=2).astype(np.uint8)
        identity = np.eye(3)[:2]
        padding = {'left': 0, 'top': 0, 'right': 0, 'bottom': 0}
        implicit = fit_ear_hair(donor, identity, reference, reference,
                               padding, (704, 600), donor)
        explicit = fit_ear_hair(donor, identity, reference, reference,
                               padding, (704, 600), donor, overlap=None)
        np.testing.assert_array_equal(implicit, donor)
        np.testing.assert_array_equal(explicit, donor)
        updated = fit_ear_hair(donor, identity, reference, reference, padding,
                              (704, 600), donor, overlap=male_ear_overlap(reference))
        self.assertTrue(np.any(updated != donor), 'Authored overlap must affect the rest pose too')


class MaleBobRearLockRegression(unittest.TestCase):
    def test_only_existing_hair_is_selected_without_repainting_or_skin_noise(self):
        source = np.array(Image.open(
            ROOT / 'artwork/kling-appearance/source/soft-bob-design.png'
        ).convert('RGBA'))
        saved = source.copy()
        result = male_bob_rear_donor(source)
        np.testing.assert_array_equal(result, male_bob_rear_donor(source))
        np.testing.assert_array_equal(source, saved)
        self.assertFalse(np.shares_memory(result, source))
        # No new RGB is painted, including invisible data. Ownership may only
        # reduce the original alpha and never invent an opaque source pixel.
        np.testing.assert_array_equal(result[:, :, :3], source[:, :, :3])
        self.assertTrue(np.all(result[:, :, 3] <= source[:, :, 3]))
        self.assertGreater(np.count_nonzero(result[:, :, 3]), 10_000)
        # Reviewed native coordinates: preserve the textured lock and its
        # antialiased source pixels, excluding the donor ear/cheek opening.
        for x, y in ((180, 500), (190, 540), (230, 580), (310, 635), (355, 650)):
            with self.subTest(retained_hair=(x, y)):
                self.assertGreater(int(source[y, x, 3]), 240)
                np.testing.assert_array_equal(result[y, x], source[y, x])
        for x, y in ((300, 520), (250, 570), (350, 600), (450, 600)):
            with self.subTest(excluded_skin=(x, y)):
                self.assertGreater(int(source[y, x, 0]), 225)
                self.assertGreater(int(source[y, x, 3]), 240)
                self.assertEqual(int(result[y, x, 3]), 0)
        # The last donor row contained a detached alpha-1 white pixel, not hair.
        np.testing.assert_array_equal(source[688, 359], [255, 255, 255, 1])
        self.assertEqual(int(result[688, 359, 3]), 0)

    def test_reviewed_rear_mask_rejects_resized_or_non_rgba_inputs(self):
        for shape, dtype in (((887, 1773, 4), np.uint8),
                             ((886, 1774, 4), np.uint8),
                             ((887, 1774, 3), np.uint8),
                             ((887, 1774, 4), np.float32)):
            with self.subTest(shape=shape, dtype=str(dtype)):
                with self.assertRaisesRegex(ValueError, '1774x887 RGBA'):
                    male_bob_rear_donor(np.zeros(shape, dtype))

    def test_rear_tuck_keeps_front_registration_and_vertical_contour_unchanged(self):
        # The lower lock is tucked towards the head, not shortened by clipping
        # or vertical scaling. Its front donor registration stays reusable.
        points = np.array([[180., 450., 1.], [250., 550., 1.], [355., 650., 1.]])
        for front in (np.eye(3)[:2], np.array([[.75, .04, 96.], [-.03, .76, 20.]])):
            saved = front.copy()
            rear = male_bob_rear_fit(front)
            np.testing.assert_array_equal(front, saved)
            self.assertFalse(np.shares_memory(rear, front))
            front_points = points @ front.T
            rear_points = points @ rear.T
            np.testing.assert_array_equal(rear_points[:, 1], front_points[:, 1])
            np.testing.assert_allclose(rear_points[:, 0]-front_points[:, 0], [18., 43., 68.])
            self.assertGreater(np.linalg.det(rear[:, :2]), 0)


if __name__ == '__main__':
    unittest.main()
