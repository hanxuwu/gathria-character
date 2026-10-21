"""Focused fitting regressions. Toy masks are tests, not visual evidence."""
import unittest
import numpy as np
from kling_dress_fit import continuous_side_allowance, join_bodice, overlap_cloth


class DressFitRegression(unittest.TestCase):
    def test_almost_opaque_interior_does_not_leave_old_hem_ink(self):
        tank = np.zeros((100, 100), dtype=bool)
        tank[10:70, 10:90] = True
        top = np.zeros((100, 100, 4), dtype=np.uint8)
        top[tank] = [60, 40, 40, 255]
        lower = np.zeros_like(top)
        lower[40:90, 10:90] = [230, 115, 95, 255]
        # Bilinear fitting produced alpha254 next to255 in an opaque waist.
        lower[68, 45, 3] = 254
        joined = join_bodice(top, lower, tank, 68)
        np.testing.assert_array_equal(joined[68, 45, :3], lower[68, 45, :3])
        np.testing.assert_array_equal(joined[68, 45, :3], joined[68, 46, :3])
        np.testing.assert_array_equal(joined[20, 45], top[20, 45])

    def test_translucent_old_edge_cannot_punch_holes_in_new_cloth(self):
        top = np.array([[[100, 60, 50, 40], [100, 60, 50, 40]]], dtype=np.uint8)
        lower = np.array([[[230, 115, 95, 255], [0, 0, 0, 0]]], dtype=np.uint8)
        joined = overlap_cloth(top, lower)
        self.assertEqual(joined[0, 0, 3], 255)
        np.testing.assert_array_equal(joined[0, 1], top[0, 1])

    def test_thigh_clearance_rejoins_existing_hem(self):
        yy, xx = np.indices((120, 160))
        cloth = (yy >= 10) & (yy < 110) & (xx >= 50 - yy / 4) & (xx <= 90 + yy / 4)
        fill = (yy >= 45) & (yy <= 55) & (xx >= 100) & (xx <= 111)
        left, right = continuous_side_allowance(cloth, fill, 10)
        self.assertGreater(right[50], 0)
        self.assertEqual(float(np.max(left)), 0)
        self.assertEqual(float(np.max(right[88:])), 0)
        edge = np.where(cloth, xx, -1).max(axis=1)
        # Clearance covers the raised thigh and never pinches inward below it.
        self.assertGreaterEqual(edge[50] + right[50], 111)
        self.assertTrue(np.all(np.diff((edge + right)[10:88]) >= -1e-8))


if __name__ == '__main__':
    unittest.main()
