"""Recover the male bob's existing donor lock behind the original near ear.

All RGB comes from the retained design sheet. This reviewed polygon excludes
donor skin, selects only the missing rear lock, and retains its natural lower
alpha edge. Its upper/left joins lie inside opaque front hair. The runtime's
existing hair-back layer puts the original ear, head, hand and clothes in front.
"""
import numpy as np
from PIL import Image, ImageDraw

REAR_LOCK_POLYGON = [
    (169, 450), (212, 445), (251, 457), (253, 465), (238, 480),
    (226, 497), (219, 516), (219, 538), (228, 560), (244, 580),
    (268, 598), (292, 610), (321, 616), (350, 615), (365, 630),
    (365, 687), (220, 687), (220, 615), (205, 600), (184, 587),
    (168, 569), (157, 548), (153, 527), (154, 501), (160, 472),
]


def male_bob_rear_donor(rgba):
    if rgba.dtype != np.uint8 or rgba.shape != (887, 1774, 4):
        raise ValueError('Rear lock needs the original 1774x887 RGBA donor.')
    scale = 4
    mask = Image.new('L', (1774 * scale, 887 * scale))
    ImageDraw.Draw(mask).polygon([(x * scale, y * scale) for x, y in REAR_LOCK_POLYGON], fill=255)
    coverage = np.array(mask.resize((1774, 887), Image.Resampling.BOX))
    result = rgba.copy()
    result[:, :, 3] = ((rgba[:, :, 3].astype(np.uint32) * coverage + 127) // 255).astype(np.uint8)
    return result


def male_bob_rear_fit(front_fit):
    result = front_fit.copy()
    # Match the approved source ear rather than the donor's larger ear window.
    # Tuck the lower lock toward the original head/neck so it stays behind it;
    # do not create a new long curl below the earlobe or clip it horizontally.
    result[0, 2] += 18 - .25 * 450
    result[0, 1] += .25
    return result
