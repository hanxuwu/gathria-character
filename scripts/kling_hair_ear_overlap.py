"""Local authored hair overlap over the original male ear, offline only.

This deformation moves existing hair pixels, not original ear/face pixels.
It closes the oversized donor ear opening while retaining the crown, central
fringe and lower face. Female artwork and older baked banks are unchanged.
"""
import numpy as np


def male_ear_overlap(reference):
    ear = reference['featureGuides']['earTop']
    return {'center': (ear['x'] - 8, ear['y'] + 11),
            'radii': (85, 105), 'displacement': (10, 13)}


def overlap_weight(x, y, center, radii):
    distance = np.sqrt(((x - center[0]) / radii[0]) ** 2 +
                       ((y - center[1]) / radii[1]) ** 2)
    t = np.clip((distance - .15) / .85, 0, 1)
    return 1 - t * t * t * (10 - 15 * t + 6 * t * t)


def inverse_overlap_map(x, y, center, radii, displacement):
    sx, sy = x.copy(), y.copy()
    for _ in range(24):
        weight = overlap_weight(sx, sy, center, radii)
        sx, sy = x - displacement[0] * weight, y - displacement[1] * weight
    return sx, sy
