"""Author the optional gentle face from each *original* Kling source frame.

This is an offline derivative of the approved artwork, not recovered original
layers or a newly generated face.  Small, compact-support inverse warps relax
the existing upper eyelids/brows and lift the existing smile corners together.
The original pixels supply all linework and shading.  A restrained cheek tint
finishes the expression without replacing the face, silhouette, ears or neck.
Original blinks, half blinks and open-mouth laughter are explicitly retained.

``prepare_gentle_face(rgba, pose)`` returns a native-sized RGBA patch plus a
binary ownership mask, or None for a deliberately preserved expression.  The
caller records None as an explicit ``mode: source`` entry in the appearance
bank.  Source alpha is retained byte for byte at every owned pixel.  The patch
has no pixels outside the registered inner face or foreground-hand exclusion.
"""

from __future__ import annotations

import cv2
import numpy as np


PROVENANCE = (
    "Gentle face v1: original per-pose Kling artwork, locally remapped using "
    "registered brow, eyelid and mouth guides with compact smooth support; "
    "restrained source-shading-preserving cheek warmth. No generated face, "
    "jaw, ear, neck or body replacement. Original half blinks, blinks and "
    "laughter retained. Authoring: scripts/kling_gentle_face.py."
)


def _point(value):
    return np.array([float(value['x']), float(value['y'])], np.float32)


def _polygon_mask(points, size):
    """Match the browser's boundary-inclusive pixel-centre polygon rule."""
    width, height = size
    result = np.zeros((height, width), dtype=bool)
    left = max(0, int(np.floor(min(p['x'] for p in points))))
    top = max(0, int(np.floor(min(p['y'] for p in points))))
    right = min(width, int(np.ceil(max(p['x'] for p in points))) + 1)
    bottom = min(height, int(np.ceil(max(p['y'] for p in points))) + 1)
    if right <= left or bottom <= top:
        return result
    yy, xx = np.indices((bottom-top, right-left), dtype=np.float64)
    x, y = xx+left+.5, yy+top+.5
    inside = np.zeros(x.shape, dtype=bool)
    boundary = np.zeros_like(inside)
    for i, b in enumerate(points):
        a = points[i-1]
        cross = (x-a['x'])*(b['y']-a['y'])-(y-a['y'])*(b['x']-a['x'])
        boundary |= (abs(cross) < 1e-9) & (x >= min(a['x'], b['x'])) & (x <= max(a['x'], b['x'])) & (y >= min(a['y'], b['y'])) & (y <= max(a['y'], b['y']))
        if b['y'] != a['y']:
            inside ^= ((a['y'] > y) != (b['y'] > y)) & (x < (b['x']-a['x'])*(y-a['y'])/(b['y']-a['y'])+a['x'])
    result[top:bottom, left:right] = inside | boundary
    return result


def prepare_gentle_face(source_rgba, pose):
    """Return ``(native_patch, owned_bool)``; None retains an action expression.

    Pose metadata comes from prepare-kling-head-registration.py.  Feature
    displacement follows the head's own rotated axes, avoiding vertical-only
    edits when the source head tilts during running or jumping.
    """
    source = np.asarray(source_rgba, dtype=np.uint8)
    if source.ndim != 3 or source.shape[2] != 4:
        raise ValueError('Gentle face needs native RGBA source pixels.')
    expression = pose['expression']
    if expression['kind'] != 'open' or expression.get('preserveSource', False):
        return None
    guides = pose['featureGuides']
    height, width = source.shape[:2]
    permitted = _polygon_mask(pose['facePolygon'], (width, height)) & (source[:, :, 3] == 255)
    for foreground in pose.get('foreground', []):
        permitted &= ~_polygon_mask(foreground, (width, height))
    if not permitted.any():
        return None
    # A zero displacement/tint band at the face edge prevents cutout seams.
    distance = cv2.distanceTransform(permitted.astype(np.uint8), cv2.DIST_L2, 5)
    edge = np.clip((distance-2.0)/7.0, 0, 1)
    edge = edge*edge*(3-2*edge)
    yy, xx = np.indices((height, width), dtype=np.float32)
    dx, dy = np.zeros_like(xx), np.zeros_like(yy)
    matrix = np.asarray(pose['headTransform'], dtype=np.float32)
    right_axis, down_axis = matrix[:, 0], matrix[:, 1]
    scale = float(np.sqrt(abs(np.linalg.det(matrix[:, :2]))))
    if not .45 <= scale <= 2:
        raise ValueError('Gentle face head scale is outside reviewed bounds.')

    def influence(center, radius_x, radius_y):
        relative_x, relative_y = xx-center[0], yy-center[1]
        # Axes include native pose scale; radii below are reference-frame px.
        inverse = np.linalg.inv(matrix[:, :2])
        u = inverse[0, 0]*relative_x + inverse[0, 1]*relative_y
        v = inverse[1, 0]*relative_x + inverse[1, 1]*relative_y
        r2 = (u/radius_x)**2+(v/radius_y)**2
        return np.maximum(0, 1-r2)**3

    def move(center, delta, radii):
        nonlocal dx, dy
        weight = influence(center, *radii)
        displacement = right_axis*delta[0]+down_axis*delta[1]
        dx += displacement[0]*weight
        dy += displacement[1]*weight

    for side in ('near', 'far'):
        brow = [_point(p) for p in guides[f'{side}Brow']]
        eye_line = [_point(p) for p in guides[f'{side}EyeLine']]
        # The far eye is foreshortened in the source three-quarter view.
        breadth = float(np.linalg.norm(eye_line[-1]-eye_line[0])/scale)
        breadth = np.clip(breadth, 26, 96)
        brow_middle = brow[len(brow)//2]
        move(brow_middle, (0, 1.5), (breadth*.72, 18))
        # Relax the upper lid a few pixels, preserving the lower iris and pupil.
        eye = _point(guides[f'{side}Eye'])
        eye_upper = (eye_line[0]+eye_line[-1])*.5
        if np.dot(eye_upper-eye, down_axis) > -3*scale:
            eye_upper = eye-down_axis*24
        move(eye_upper, (0, 3.2 if side == 'near' else 2.5), (breadth*.68, 24))

    left, right = [_point(p) for p in guides['mouthCorners']]
    mouth = _point(guides['mouth'])
    # Original curved line is widened and lifted at the corners, never redrawn.
    move(left, (-2.3, -4.0), (22, 18))
    move(right, (2.3, -4.0), (20, 18))
    move(mouth, (0, .8), (29, 15))
    dx *= edge
    dy *= edge
    warped = cv2.remap(source[:, :, :3], xx-dx, yy-dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    result = source.copy()
    result[:, :, :3] = warped

    # Warmth follows existing skin shading instead of an opaque cheek symbol.
    cheek = np.zeros_like(xx)
    for side in ('near', 'far'):
        cheek += influence(_point(guides[f'{side}Cheek']), 24 if side == 'near' else 17, 15)
    cheek = np.minimum(1, cheek)*edge
    skin = warped.astype(np.float32)
    # Exclude dark facial ink from tint so eyelashes and contours stay crisp.
    light = np.clip((skin.mean(axis=2)-90)/90, 0, 1)
    strength = cheek*light
    delta = np.stack((3*strength, -3*strength, -3*strength), axis=2)
    result[:, :, :3] = np.clip(np.rint(skin+delta), 0, 255).astype(np.uint8)
    changed = np.any(result[:, :, :3] != source[:, :, :3], axis=2) & permitted & (edge > 0)
    if not changed.any():
        return None
    patch = np.zeros_like(source)
    patch[changed] = result[changed]
    assert np.array_equal(patch[changed, 3], source[changed, 3])
    assert not np.any(changed & ~permitted)
    return patch, changed
