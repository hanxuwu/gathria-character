"""Reviewed exclusions for the four Kling hair donor cutouts.

Coordinates are in the unmodified 1774 x 887 design-sheet pixel space. These
small polygons remove generated skin trapped at the central hairline peak,
between the far-side locks and along their inner face edge. The original sheet,
hair highlights, character
skin and runtime recoloring are never inspected or changed by a color rule.

The crop design contains an interior peach triangle that the original outer
hairline mask cannot reach. Both bob cutouts retain a narrow peach strip along
the concave inner lock. Polygons were reviewed at 6x against the exact source
cutouts; they follow the dark hair boundary outside those skin remnants. They
are exclusions, not new drawings or filled hair patches.
"""

from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw


# (style, character) -> authored source-sheet exclusion polygons.
# The central peak, interior hole and narrow inner-edge strip are kept separate
# so a later donor revision can be reviewed without broadening ownership by color.
EXCLUSIONS = {
    ("soft-crop", "male"): (
        # Donor skin at the central forehead peak and its immediately adjacent
        # slopes. Follow the existing dark hair edge, not the generated face.
        ((524, 280), (539, 272), (553, 267), (566, 265),
         (579, 265), (583, 266), (588, 271), (591, 279),
         (598, 290), (608, 304), (619, 317), (632, 329),
         (640, 334), (640, 345), (518, 345), (518, 309),
         (523, 290)),
        # Skin triangle between the two far-side swept locks.
        ((751, 323), (758, 330), (769, 338), (782, 347),
         (797, 356), (805, 361), (809, 369), (802, 366),
         (795, 363), (785, 363), (779, 365), (773, 360),
         (767, 352), (760, 340), (754, 331)),
        # Peach edge immediately inside the right temple lock.
        ((788, 385), (800, 386), (808, 389), (813, 394),
         (816, 400), (817, 410), (816, 420), (815, 430),
         (816, 442), (814, 447), (805, 447), (805, 420),
         (784, 420)),
    ),
    ("soft-crop", "female"): (
        # The central peak retained a short peach band and a sloping strip.
        ((1323, 287), (1332, 281), (1343, 277), (1355, 277),
         (1367, 278), (1379, 281), (1386, 286), (1395, 298),
         (1406, 312), (1416, 324), (1428, 336), (1438, 345),
         (1440, 358), (1317, 358), (1317, 306)),
        # Same intentional opening in the female donor, at its own coordinates.
        ((1502, 337), (1510, 346), (1521, 355), (1533, 364),
         (1546, 372), (1558, 379), (1562, 384), (1551, 381),
         (1540, 381), (1534, 384), (1527, 376), (1518, 365),
         (1511, 351), (1505, 343)),
        # Narrow skin sliver beside the long far-side temple point.
        ((1571, 385), (1578, 388), (1583, 393), (1588, 399),
         (1592, 406), (1593, 415), (1592, 426), (1587, 427),
         (1580, 414), (1574, 403), (1566, 390)),
    ),
    ("soft-bob", "male"): (
        # Peach antialias fringe at the central part and short inner slope.
        ((557, 246), (564, 241), (571, 241), (576, 243),
         (583, 247), (588, 252), (591, 258), (595, 268),
         (600, 278), (605, 286), (611, 295), (610, 310),
         (550, 310), (550, 268)),
        # Narrow skin opening under the swept fringe. The old bright-skin edge
        # filter removed its center but left peach edge pixels along its length.
        ((661, 329), (670, 336), (678, 343), (688, 351),
         (700, 358), (712, 365), (723, 371), (732, 376),
         (732, 380), (727, 385), (719, 382), (710, 379),
         (701, 374), (692, 367), (683, 357), (675, 347),
         (669, 339), (664, 334)),
        # Concave inner edge; stop before the dark lower curl.
        ((756, 392), (768, 392), (778, 395), (785, 400),
         (788, 407), (788, 421), (787, 432), (785, 438),
         (778, 438), (769, 419), (750, 403)),
    ),
    ("soft-bob", "female"): (
        # Same central-part cleanup, using this donor's own hair contour.
        ((1380, 256), (1384, 251), (1392, 250), (1401, 253),
         (1408.5, 257), (1410, 263), (1413, 270), (1417, 280),
         (1421, 290), (1426, 300), (1431, 310), (1436, 320),
         (1436, 325), (1374, 325),
         (1374, 270)),
        # Corresponding opening under this donor's swept fringe, ending at the
        # fringe/side-lock notch. This is not a general skin-color threshold.
        ((1475, 333), (1483, 341), (1493, 351), (1504, 359),
         (1517, 368), (1529, 376), (1543, 383), (1557, 388),
         (1560, 391), (1553, 397), (1546, 394), (1535, 388),
         (1522, 382), (1509, 377), (1498, 365), (1488, 353),
         (1481, 342)),
        # Peach residue along the right face-facing lock, including the upper
        # one-pixel anti-aliased fringe. No lower-curl artwork is removed.
        ((1587, 405), (1598, 407), (1605, 412), (1609, 418),
         (1610, 427), (1610, 439), (1608, 451), (1607, 459),
         (1597, 459), (1594, 436), (1581, 415)),
    ),
}


def exclusion_alpha(shape, style, character):
    """Return reviewed exclusion coverage in [0, 255], with 4x edge sampling."""
    height, width = shape[:2]
    polygons = EXCLUSIONS[(style, character)]
    coverage = np.zeros((height, width), np.uint8)
    scale = 4
    for polygon in polygons:
        x0 = max(0, int(np.floor(min(p[0] for p in polygon))) - 1)
        y0 = max(0, int(np.floor(min(p[1] for p in polygon))) - 1)
        x1 = min(width, int(np.ceil(max(p[0] for p in polygon))) + 2)
        y1 = min(height, int(np.ceil(max(p[1] for p in polygon))) + 2)
        if x1 <= x0 or y1 <= y0:
            continue
        patch = Image.new("L", ((x1 - x0) * scale, (y1 - y0) * scale))
        ImageDraw.Draw(patch).polygon(
            [((x - x0) * scale, (y - y0) * scale) for x, y in polygon],
            fill=255,
        )
        # BOX averages subpixel coverage without ringing beyond the authored
        # contour. This cannot create semi-opaque pixels outside the polygon.
        patch = np.asarray(
            patch.resize((x1 - x0, y1 - y0), Image.Resampling.BOX)
        )
        coverage[y0:y1, x0:x1] = np.maximum(
            coverage[y0:y1, x0:x1], patch
        )
    return coverage


def clean_donor(rgba, style, character):
    """Copy a donor and reduce alpha only inside reviewed geometric exclusions."""
    if rgba.dtype != np.uint8 or rgba.ndim != 3 or rgba.shape[2] != 4:
        raise ValueError("Hair donor must be a uint8 RGBA array.")
    if rgba.shape[:2] != (887, 1774):
        raise ValueError("Reviewed hair masks require the original 1774x887 sheet.")
    coverage = exclusion_alpha(rgba.shape, style, character)
    result = rgba.copy()
    result[:, :, 3] = (
        (rgba[:, :, 3].astype(np.uint32) * (255 - coverage.astype(np.uint32)) + 127)
        // 255
    ).astype(np.uint8)
    return result
