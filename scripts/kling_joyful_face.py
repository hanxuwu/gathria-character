"""Author Joyful from original Kling pixels, without replacing eyes or a head.

The open smile is the character's own frame-78 celebration mouth. Its manually
reviewed donor polygon includes antialiasing and a small skin transition, never
the nose, chin or eyes. Per-pose registration follows the original mouth guides;
compact source-pixel warps lift the brows and cheeks around it. Blink artwork
remains native while the smile continues; source celebration laughter is exact.
"""
from __future__ import annotations

import cv2
import numpy as np

from kling_gentle_face import _point, _polygon_mask

DONOR_FRAME = 78
# Explicit source-native outlines; laugh feature guides are inferred and do not
# locate the actual painted mouth center closely enough to be donor annotations.
DONORS = {
    'male': {'center': (408.5, 445.5), 'polygon': [
        (358, 426), (363, 419), (377, 422), (400, 425), (431, 424),
        (455, 420), (460, 425), (452, 445), (440, 461), (420, 473),
        (399, 475), (381, 465), (368, 448)]},
    'female': {'center': (408, 429), 'polygon': [
        (358, 409), (363, 402), (377, 405), (400, 408), (431, 407),
        (455, 403), (460, 408), (452, 428), (440, 444), (420, 456),
        (399, 458), (381, 448), (368, 431)]},
}
PROVENANCE = (
    'Joyful v1: each original Kling character supplies its own frame-78 mouth '
    'painting, including teeth, tongue, ink and shading. Explicit source-native '
    'mouth outlines, per-pose mouth-guide registration and compact source-pixel '
    'brow/cheek lifts; no geometric face drawing or eye removal. Original eyes, '
    'blink schedule, nose, head silhouette, ears and neck are protected. Source '
    'celebration laughter remains unchanged. Authoring: scripts/kling_joyful_face.py.'
)


def prepare_joyful_face(source_rgba, pose, donor_rgba, donor_pose, character):
    source = np.asarray(source_rgba, dtype=np.uint8)
    if source.ndim != 3 or source.shape[2] != 4:
        raise ValueError('Joyful face needs native RGBA source pixels.')
    if pose['expression']['kind'] == 'laugh':
        return None
    height, width = source.shape[:2]
    guides = pose['featureGuides']
    yy, xx = np.indices((height, width), dtype=np.float32)
    matrix = np.asarray(pose['faceTransform'], np.float32)[:, :2]
    inverse = np.linalg.inv(matrix)
    right_axis, down_axis = matrix[:, 0], matrix[:, 1]
    permitted = _polygon_mask(pose['facePolygon'], (width, height)) & (source[:, :, 3] == 255)
    for foreground in pose.get('foreground', []):
        permitted &= ~_polygon_mask(foreground, (width, height))
    # Explicit source-space feature protection, independent of changed-pixel
    # thresholds. Blinks retain the entire registered eye regions byte for byte.
    for feature, rx, ry in [('nearEye', 62, 52), ('farEye', 39, 50), ('nose', 13, 15)]:
        center = _point(guides[feature])
        ux, uy = xx-center[0], yy-center[1]
        u, v = inverse[0, 0]*ux+inverse[0, 1]*uy, inverse[1, 0]*ux+inverse[1, 1]*uy
        permitted &= (u/rx)**2+(v/ry)**2 > 1
    distance = cv2.distanceTransform(permitted.astype(np.uint8), cv2.DIST_L2, 5)
    edge = np.clip((distance-1.5)/4, 0, 1)
    edge = edge*edge*(3-2*edge)

    def influence(center, rx, ry):
        dx, dy = xx-center[0], yy-center[1]
        u, v = inverse[0, 0]*dx+inverse[0, 1]*dy, inverse[1, 0]*dx+inverse[1, 1]*dy
        return np.maximum(0, 1-(u/rx)**2-(v/ry)**2)**3

    dx, dy = np.zeros_like(xx), np.zeros_like(yy)
    # Source pixels provide all brow and cheek linework. Eye/iris/eyelash pixels
    # are outside these compact supports and remain the original pose's artwork.
    warmth = np.zeros_like(xx)
    for side in ('near', 'far'):
        brow = _point(guides[f'{side}Brow'][1])
        brow_weight = influence(brow, 43 if side == 'near' else 27, 17)
        cheek = _point(guides[f'{side}Cheek'])
        cheek_weight = influence(cheek, 27 if side == 'near' else 17, 15)
        movement = -2.7*brow_weight-1.3*cheek_weight
        dx += down_axis[0]*movement
        dy += down_axis[1]*movement
        warmth += cheek_weight
    dx *= edge
    dy *= edge
    warped = cv2.remap(source[:, :, :3], xx-dx, yy-dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    light = np.clip((warped.mean(axis=2)-105)/90, 0, 1)
    tint = np.minimum(1, warmth)*edge*light
    result = source.copy()
    result[:, :, :3] = np.clip(np.rint(warped.astype(float)+np.stack((5*tint, -3*tint, -3*tint), axis=2)), 0, 255).astype(np.uint8)

    annotation = DONORS[character]
    donor = np.asarray(donor_rgba, np.uint8)
    donor_mask = _polygon_mask([{'x': x, 'y': y} for x, y in annotation['polygon']], (width, height))
    # Native surrounding skin must fully cover the previous small smile, even
    # at its far corner on squashed blink poses. Expand this manually bounded
    # mouth-only donor envelope by four pixels before feathering, never eyes.
    donor_mask = cv2.dilate(donor_mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    donor_distance = cv2.distanceTransform(donor_mask.astype(np.uint8), cv2.DIST_L2, 5)
    donor_weight = np.clip(donor_distance/5, 0, 1)
    donor_weight = donor_weight*donor_weight*(3-2*donor_weight)
    # Align the donor's original head angle to the recipient. The compact smile
    # fits the existing inner-face ownership; no bounds or silhouette expansion.
    donor_axes = np.asarray(donor_pose['faceTransform'], np.float32)[:, :2]
    axes = matrix @ np.linalg.inv(donor_axes) * .72
    target = _point(guides['mouth'])-down_axis*6
    offset = target-axes@np.asarray(annotation['center'], np.float32)
    transform = np.column_stack((axes, offset))
    mouth = cv2.warpAffine(donor[:, :, :3], transform, (width, height), flags=cv2.INTER_LINEAR)
    weight = cv2.warpAffine(donor_weight, transform, (width, height), flags=cv2.INTER_LINEAR)*edge
    # Correct only the donor's surrounding skin toward target skin. A smooth
    # distance ramp preserves complete mouth ink/teeth/tongue shading.
    surrounding = (weight > .01) & (weight < .65) & permitted
    if surrounding.any():
        correction = np.median(source[:, :, :3][surrounding].astype(float)-mouth[surrounding].astype(float), axis=0)
        correction = np.clip(correction, -12, 12)
        skin_edge = np.clip((.98-weight)/.35, 0, 1)
        mouth = np.clip(mouth.astype(float)+correction*skin_edge[:, :, None], 0, 255)
    # Match only newly transferred paint to the original blurred jump frames.
    blur = {88: .65, 89: 1.6, 90: 1.8, 91: .7, 100: .6, 101: 1.6, 102: 1.6, 103: .65}.get(pose['frameId'], 0)
    if blur:
        mouth = cv2.GaussianBlur(mouth, (0, 0), blur)
        weight = cv2.GaussianBlur(weight, (0, 0), blur)*edge
    result[:, :, :3] = np.clip(np.rint(result[:, :, :3]*(1-weight[:, :, None])+mouth*weight[:, :, None]), 0, 255).astype(np.uint8)
    changed = np.any(result[:, :, :3] != source[:, :, :3], axis=2) & permitted & (edge > 0)
    patch = np.zeros_like(source)
    patch[changed] = result[changed]
    assert np.array_equal(patch[changed, 3], source[changed, 3])
    assert not np.any(changed & ~permitted)
    return patch, changed
