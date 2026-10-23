"""Reviewed source-space hand ownership for two female celebration poses.

The original coarse foreground boundary cut across the thumb/wrist interior.
These small polygons restore original opaque hand pixels in front of new hair;
they do not repaint skin, expand head bounds, or include the transparent gap.
See docs/kling-appearance/stability-review for actual export comparisons.
"""
import copy

FEMALE_HAND_FOREGROUND = {
    78: [(150, 414), (163, 403), (163, 409), (160, 417), (159, 422), (163, 430)],
    79: [(145, 445), (150, 441), (169, 430), (169, 441),
         (167, 451), (165, 460), (168, 470), (156, 470)],
}
HAND_PROVENANCE = (
    ' Revision 3 also restores original female thumb/wrist foreground ownership '
    'in celebration poses 78 and 79 with two reviewed source-space polygons. '
    'All newly protected pixels are opaque original hand pixels; no source, '
    'face, atlas or motion pixels are repainted.'
)


def reviewed_hand_foreground(character, pose):
    regions = copy.deepcopy(pose['foreground'])
    points = FEMALE_HAND_FOREGROUND.get(pose['frameId']) if character == 'female' else None
    if points:
        polygon = [{'x': x, 'y': y} for x, y in points]
        if polygon not in regions:
            regions.append(polygon)
    return regions
