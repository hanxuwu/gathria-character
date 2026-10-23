"""Reviewed donor-only cutouts for two additional Kling hairstyles.

Coordinates below belong to expansion-design.png (1774 x 887). The donor is
used only for hair. Polygons exclude its generated face, ears, neck and clothes;
the approved Kling source pixels are never repainted by this module. Alpha is
multiplied by a 4x sampled geometric mask; retained RGB stays donor-exact.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DONOR_PATH = ROOT / 'artwork/kling-appearance/source/expansion-design.png'

DONOR_EYES = {
    'male': ((552., 508.), (738., 514.)),
    'female': ((1439., 522.), (1608., 528.)),
}
SOURCE_EYES = {
    'male': ((380., 400.), (501., 403.)),
    'female': ((379., 377.), (499., 378.)),
}
VERTICAL_SCALE = {'male': .85, 'female': .89}
# The generated female face has a narrower eye spacing relative to its hair
# volume than the approved source. Fit only its hair more tightly around the
# fixed near-eye registration; never change source face proportions.
HORIZONTAL_FIT = {'male': 1., 'female': .915}

# The lower edge follows the HAIR side of the donor hairline. Concave turns
# retain sideburn tips without including the donor's upper ear or cheek.
FRONT_BOUNDARIES = {
    'male': [(0,540),(172,540),(204,502),(229,476),(260,463),
             (292,461),(320,468),(341,483),(348,506),(370,530),
             (389,548),(400,551),(390,538),(384,520),(381,495),
             (389,470),(391,442),(417,411),(437,398),(456,377),
             (470,368),(484,354),(493,344),
             (518,330),(539,295),(550,279),(564,271),(577,267),
             (590,266),(600,265),(593,260),(615,267),(620,264),
             (628,271),(638,265),(654,262),(646,268),(669,265),
             (684,267),(678,271),(703,275),(725,282),(743,291),
             (754,305),(761,325),(763,344),(761,359),(756,371),
             (756,370),(763,369),(772,350),(780,327),(788,345),
             (795,367),(799,390),(800,410),
             (793,424),(791,452),(780,479),(805,463),(822,429),
             (836,401),(846,389),(885,376),(906,337),(915,450)],
    'female': [(920,385),(975,385),(985,415),(1007,445),
               (1045,465),(1085,477),(1120,487),(1146,490),
               (1174,490),(1200,496),(1217,509),(1228,532),
               (1239,559),(1257,590),(1280,609),(1308,623),
               (1326,620),(1309,620),(1287,606),(1267,578),
               (1252,531),(1254,490),(1290,457),(1325,428),
               (1360,398),(1397,355),(1431,310),(1455,282),
               (1486,264),(1507,265),(1515,270),(1525,302),
               (1537,333),(1549,357),(1566,381),(1584,395),
               (1604,402),(1586,388),(1568,367),(1556,344),
               (1545,316),(1546,300),(1566,330),(1585,356),
               (1611,379),(1634,394),
               (1663,427),(1674,449),(1678,479),(1666,507),
               (1653,527),(1677,515),(1699,490),(1718,450),
               (1740,435),(1774,610)],
}

# Rear regions retain the donor's natural lower silhouette and exclude the ear
# interior explicitly. The joins begin inside opaque front hair, not at its AA
# outer edge. These layers compose behind the original source head and hands.
REAR_POLYGONS = {
    'male': [(153,480),(207,468),(218,480),(211,505),(212,537),
             (222,565),(240,586),(266,604),(300,611),(329,611),
             (346,606),(356,615),(382,635),(398,652),(398,679),
             (280,688),(170,640),(145,570)],
    'female': [(935,425),(1013,411),(1095,446),(1150,479),
               (1127,491),(1110,513),(1101,540),(1102,569),
               (1114,596),(1136,617),(1165,632),(1200,639),
               (1227,633),(1242,646),(1265,662),(1292,677),
               (1290,697),(1205,715),(1060,700),(920,655),
               (904,500)],
}
FRONT_GAPS = {
    'male': [[(438,386),(451,369),(474,346),(497,322),(511,302),
              (511,338),(490,356),(473,373),(454,386)]],
    'female': [],
}

# Rear-only horizontal fit tucks lower locks behind the source neck. It does
# not move the scalp/front fringe or deform any source body pixel.
REAR_TUCK = {
    'male': {'offsetX': 34., 'shearX': .25, 'donorPivotY': 500.},
    'female': {'offsetX': 32., 'shearX': .28, 'donorPivotY': 500.},
}


def expansion_overlap(character, reference, role='hair-front'):
    """New-style-only upper-ear fit, chosen against native source probes."""
    if role != 'hair-front':
        return None
    ear = reference['featureGuides']['earTop']
    return {'center': ((ear['x'] - 12, ear['y'])
                       if character == 'male' else (ear['x'] + 2, ear['y'] + 6)),
            'radii': (95., 112.) if character == 'male' else (105., 125.),
            'displacement': (6., 34.) if character == 'male' else (18., 32.)}


def _cutout(donor, points, gaps=()):
    height, width = donor.shape[:2]
    mask = Image.new('L', (width * 4, height * 4))
    ImageDraw.Draw(mask).polygon([(round(x * 4), round(y * 4))
                                 for x, y in points], fill=255)
    for gap in gaps:
        ImageDraw.Draw(mask).polygon([(round(x * 4), round(y * 4))
                                     for x, y in gap], fill=0)
    mask = np.asarray(mask.resize((width, height), Image.Resampling.BOX),
                      dtype=np.uint16)
    result = donor.copy()
    result[:, :, 3] = ((donor[:, :, 3].astype(np.uint16) * mask + 127)
                       // 255).astype(np.uint8)
    result[result[:, :, 3] == 0] = 0
    return result


def expansion_layers(character):
    """Return ordered (role, RGBA donor cutout, source-reference 2x3 fit)."""
    if character not in DONOR_EYES:
        raise ValueError(f'Unsupported expansion character: {character}')
    donor = np.asarray(Image.open(DONOR_PATH).convert('RGBA'))
    if donor.shape != (887, 1774, 4):
        raise ValueError(f'Unexpected expansion donor shape: {donor.shape}')
    a, b = np.asarray(DONOR_EYES[character], float)
    c, d = np.asarray(SOURCE_EYES[character], float)
    sx = (d[0] - c[0]) / (b[0] - a[0]) * HORIZONTAL_FIT[character]
    sy = sx * VERTICAL_SCALE[character]
    fit = np.asarray([[sx, 0., c[0] - sx * a[0]],
                      [0., sy, c[1] - sy * a[1]]])
    boundary = FRONT_BOUNDARIES[character]
    front = _cutout(donor, [(boundary[0][0], 0),
                           (boundary[-1][0], 0), *reversed(boundary)],
                    FRONT_GAPS[character])
    rear = _cutout(donor, REAR_POLYGONS[character])
    tuck = REAR_TUCK[character]
    rear_fit = fit.copy()
    rear_fit[0, 1] += tuck['shearX']
    rear_fit[0, 2] += tuck['offsetX'] - tuck['shearX'] * tuck['donorPivotY']
    return [('hair-back', rear, rear_fit), ('hair-front', front, fit)]
