"""Versioned garment-only fitting; source body pixels and guides never move."""
import numpy as np
from scipy import ndimage as ndi


def continuous_side_allowance(cloth, fill, waist_y):
    """Distribute thigh clearance along the side seam instead of a local lump.

    The old fit stretched only rows adjacent to an exposed thigh island. That
    expanded and then contracted the silhouette above the hem. A skirt side
    now opens gradually from its waist to its hem, keeping interior folds fixed.
    """
    height, width = cloth.shape
    _, xx = np.indices(cloth.shape)
    valid = cloth.any(axis=1)
    left = np.where(cloth, xx, width).min(axis=1).astype(float)
    right = np.where(cloth, xx, -1).max(axis=1).astype(float)
    hem = int(np.where(valid)[0].max())
    start = max(int(waist_y), int(np.where(valid)[0].min()))
    end = max(start + 1, hem - 22)
    extra = []
    for edge, needed in [(-left, np.max(np.where(fill, left[:, None] - xx, 0), axis=1)),
                         (right, np.max(np.where(fill, xx - right[:, None], 0), axis=1))]:
        allowance = np.zeros(height)
        if not (needed > 0).any():
            extra.append(allowance)
            continue
        desired = edge[start:end + 1] + needed[start:end + 1]
        # Smallest concave majorant: a continuous outward side seam covering
        # the thigh, then rejoining the existing broad hem. Preserve scallops
        # below this span instead of stretching their tiny disconnected rows.
        hull = []
        for i, value in enumerate(desired):
            while len(hull) >= 2:
                a, b = hull[-2], hull[-1]
                if (desired[b] - desired[a]) * (i - b) > (value - desired[b]) * (b - a):
                    break
                hull.pop()
            hull.append(i)
        curve = np.interp(np.arange(len(desired)), hull, desired[hull])
        allowance[start:end + 1] = np.maximum(0, curve - edge[start:end + 1])
        allowance[~valid] = 0
        extra.append(allowance)
    return extra


def join_bodice(top, lower, tank, waist_y):
    """Replace the source tank hem with a continuous cloth-to-cloth transition.

    Only effectively opaque overlapping garment pixels blend. Arms, head, skin and outside
    alpha edges are resolved separately by the unchanged ownership compositor.
    Source tank ink must reach zero influence at the join, not leave a dark
    staircase on top of the new skirt as a partial colour blend does.
    """
    yy = np.indices(tank.shape)[0]
    bottom = np.max(np.where(tank, yy, -1), axis=0).astype(float)
    valid = bottom >= 0
    smooth = np.interp(np.arange(len(bottom)), np.flatnonzero(valid), bottom[valid])
    smooth = ndi.gaussian_filter1d(smooth, 7)
    # Respect the actual mask edge as well as the smoothed material seam.
    distance = np.minimum(bottom, smooth)[None, :] - yy - 3
    weight = np.clip(distance / 22, 0, 1)
    weight = weight * weight * (3 - 2 * weight)
    # A one-level interpolation roundoff must not leave isolated old ink dots.
    # Actual translucent contour edges remain outside this interior operation.
    seam = tank & (lower[:, :, 3] >= 254) & (yy > waist_y - 45)
    result = top.copy()
    result[seam, :3] = np.round(top[seam, :3] * weight[seam, None]
                               + lower[seam, :3] * (1 - weight[seam, None])).astype(np.uint8)
    return result


def overlap_cloth(top, lower):
    """A translucent old tank edge cannot punch pinholes in opaque new cloth."""
    result = lower.copy()
    visible = top[:, :, 3] > 0
    result[visible] = top[visible]
    overlap = visible & (lower[:, :, 3] > 0)
    a = top[overlap, 3].astype(float) / 255
    b = lower[overlap, 3].astype(float) / 255 * (1 - a)
    combined = a + b
    result[overlap, :3] = np.round((top[overlap, :3] * a[:, None]
                                   + lower[overlap, :3] * b[:, None]) / combined[:, None]).astype(np.uint8)
    result[overlap, 3] = np.round(combined * 255).astype(np.uint8)
    return result


def preserve_side_ink(patch, stretched, left, right, extra_left, extra_right, band=24, ink_band=6):
    """Keep a painted side outline's width while fitting cloth inside it.

    Revision 2's stretch carries the edge ink through the full clearance factor.
    Translate the outer ink strip as a unit and distribute the required extra
    fabric through the interior of the existing fitting band instead. Alpha is
    copied from the accepted V2 silhouette; original body/ownership is untouched.
    Premultiplied sampling avoids interpolating opaque ink against zero RGB just
    outside the original cloth patch.
    """
    yy, xx = np.indices(patch.shape[:2])
    x = xx.astype(float)
    valid = patch[:, :, 3].any(axis=1)
    left_edge = left[:, None] - extra_left[:, None]
    right_edge = right[:, None] + extra_right[:, None]
    for source_edge, target_edge, allowance, sign in [
        (left[:, None], left_edge, extra_left[:, None], 1),
        (right[:, None], right_edge, extra_right[:, None], -1),
    ]:
        distance = (xx - target_edge) * sign
        interior = ink_band + (distance - ink_band) * (band - ink_band) / (band + allowance - ink_band)
        mapped = source_edge + sign * np.where(distance <= ink_band, distance, interior)
        change = valid[:, None] & (allowance > .01) & (distance < band + allowance)
        x = np.where(change, mapped, x)
    changed = np.abs(x - xx) > .001
    alpha = patch[:, :, 3].astype(float) / 255
    sampled_alpha = ndi.map_coordinates(alpha, [yy, x], order=1, mode='constant', cval=0)
    usable = changed & (stretched[:, :, 3] > 0) & (sampled_alpha > 1e-6)
    result = stretched.copy()
    for channel in range(3):
        premultiplied = patch[:, :, channel].astype(float) * alpha
        sampled = ndi.map_coordinates(premultiplied, [yy, x], order=1, mode='constant', cval=0)
        color = np.clip(np.rint(sampled / np.maximum(sampled_alpha, 1e-6)), 0, 255)
        result[usable, channel] = color[usable].astype(np.uint8)
    return result
