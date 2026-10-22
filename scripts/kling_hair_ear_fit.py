"""Offline, local hair fitting around the original Kling near ear.

The scalp fit keeps the crown steady but cannot follow the source's facial
squash. Blend back to the independent face registration only around the ear.
This remaps the NEW hair donor, never the approved source face or ear pixels.
"""
import cv2
import numpy as np


def ear_fit(reference, row):
    head = np.vstack([row['headTransform'], [0, 0, 1]])
    face = np.vstack([row['faceTransform'], [0, 0, 1]])
    local = np.linalg.inv(head) @ face
    ear = reference['featureGuides']['earTop']
    # The plateau follows the ear arch and sideburn together. The smooth support
    # ends before the central fringe, eyes and crown; no whole-head translation.
    center = np.array([ear['x'] + 16, ear['y'] + 12], dtype=float)
    radii = np.array([142., 145.])
    delta = (local @ np.r_[center, 1])[:2] - center
    if np.linalg.norm(delta) > 40:
        raise ValueError(f"Unreviewed ear displacement in frame {row['frameId']}: {delta}")
    return local, center, radii


def ear_weight(x, y, center, radii):
    distance = np.sqrt(((x - center[0]) / radii[0]) ** 2 +
                       ((y - center[1]) / radii[1]) ** 2)
    t = np.clip((distance - .4) / .6, 0, 1)
    # Quintic smoothstep: no crease at the plateau or fixed outer boundary.
    return 1 - t * t * t * (10 - 15 * t + 6 * t * t)


def inverse_ear_map(x, y, local, center, radii):
    """Invert a bounded local displacement, retaining a continuous hair mesh."""
    sx, sy = x.copy(), y.copy()
    for _ in range(24):
        weight = ear_weight(sx, sy, center, radii)
        dx = (local[0, 0] - 1) * sx + local[0, 1] * sy + local[0, 2]
        dy = local[1, 0] * sx + (local[1, 1] - 1) * sy + local[1, 2]
        sx, sy = x - weight * dx, y - weight * dy
    return sx, sy


def fit_ear_hair(rgba, donor_fit, row, reference, padding, size, baseline):
    """Sample the donor once with premultiplied alpha; keep remote pixels exact."""
    local, center, radii = ear_fit(reference, row)
    if np.allclose(local, np.eye(3), atol=1e-7):
        return baseline.copy()
    head = np.vstack([row['headTransform'], [0, 0, 1]])
    head[:2, 2] += [padding['left'], padding['top']]
    inverse_head = np.linalg.inv(head)
    yy, xx = np.indices((size[1], size[0]), dtype=np.float32)
    x = inverse_head[0, 0] * xx + inverse_head[0, 1] * yy + inverse_head[0, 2]
    y = inverse_head[1, 0] * xx + inverse_head[1, 1] * yy + inverse_head[1, 2]
    owned = ear_weight(x, y, center, radii) > 0
    sx, sy = inverse_ear_map(x[owned], y[owned], local, center, radii)
    donor_inverse = np.linalg.inv(np.vstack([donor_fit, [0, 0, 1]]))
    mx = donor_inverse[0, 0] * sx + donor_inverse[0, 1] * sy + donor_inverse[0, 2]
    my = donor_inverse[1, 0] * sx + donor_inverse[1, 1] * sy + donor_inverse[1, 2]
    # A full-size map avoids OpenCV's 32767-pixel limit on a flattened scanline.
    map_x = np.full(xx.shape, -1, np.float32)
    map_y = np.full(yy.shape, -1, np.float32)
    map_x[owned], map_y[owned] = mx, my
    premultiplied = rgba.astype(np.float32) / 255
    premultiplied[:, :, :3] *= premultiplied[:, :, 3:4]
    out = cv2.remap(premultiplied, map_x, map_y, cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_CONSTANT)
    alpha = out[:, :, 3:4]
    out[:, :, :3] = np.divide(out[:, :, :3], alpha,
                              out=np.zeros_like(out[:, :, :3]), where=alpha > 0)
    result = baseline.copy()
    result[owned] = np.clip(np.rint(out[owned] * 255), 0, 255).astype(np.uint8)
    return result


def blur_hair(rgba, sigma):
    """Match existing jump blur only after the local fit, without alpha halos."""
    if not sigma:
        return rgba
    f = rgba.astype(np.float32) / 255
    f[:, :, :3] *= f[:, :, 3:4]
    out = cv2.GaussianBlur(f, (0, 0), sigmaX=sigma, sigmaY=sigma)
    alpha = out[:, :, 3:4]
    out[:, :, :3] = np.divide(out[:, :, :3], alpha,
                              out=np.zeros_like(out[:, :, :3]), where=alpha > 0)
    return np.clip(np.rint(out * 255), 0, 255).astype(np.uint8)
