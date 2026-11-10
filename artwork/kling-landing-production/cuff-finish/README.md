# Curved wedding cuffs and compressed waistcoat fit

This is a separate authoring revision over the exact `e12ea…` coverage top.
The previous coverage recipe/audit remain historical and reproducible.
`baseline-top.garment.zip` is the immutable input, not a selectable garment.

The new [painted cloth donor](painted-cuff-donor.png) was made with image
generation from the original fitted frame 100. The [prompt](prompt.txt) and
[provenance](generation.json) are retained. Only manually traced navy sleeve
and ivory cuff pixels are sampled. Generated anatomy, hands, face, shorts,
background, halo, and brown hand-outline samples are discarded.

[recipe.json](recipe.json) contains native source wrist/shoulder controls,
observed hand contours, and item-scoped retained hand polygons. Source frame
63 labels the visible left hand `farHand`; this revision follows that binding
without changing the shared registration. Observed source hand contours may
extend beyond an old conservative polygon, but every manifest review is still
a raster subset of the corresponding original protected region. Those extra
observed hand pixels are explicitly restored from the source and excluded
from clothing ownership.

The sleeve stage corrects 16 native poses: 63–66, 74–80, and 97–101. It replaces
the old straight/stepped cuff join with painted cloth continuing around the
actual fist and wrist. It also restores source hand pixels covered by the old
straight sleeve edge. It does not redraw or move the hands.

The waistcoat stage corrects the front panel's excessive pull toward the hip
midpoint in compressed poses. It resamples existing painted cloth RGB only,
with offsets `0 → 3 → 7 → 12 → 7 → 3 → 0` across neighboring frames around
63, 74, 85, and 97. All ownership, alpha, silhouette and body pixels stay fixed;
the original torso lean remains. This is cloth fitting, not new anatomy or a
frame-rate/interpolation change.

Combined: **27 changed native frames, 80 unchanged**, with all 2,555 previously
reviewed source-tank targets still covered. See [audit.json](audit.json).
Production extension frames 107/108 are outside this base revision.

```sh
python scripts/finish-landing-wedding-cuffs.py --output /tmp/wedding-cuffs --check
node scripts/review-wedding-cuff-finish.mjs
python scripts/present-wedding-cuff-finish.py
```

`--publish` explicitly replaces the existing 107-frame wedding-top base.
The production builder separately binds it to its 109-frame candidate source.
The runtime review checks the actual full wedding outfit, all 107 frames,
the authored pixel results, unchanged frames, and saving/reopening the project.

Remaining limits: the original video has hand/edge blur and pose drift, the
jacket still contains some hard old folds, and its far sleeve has not been
redesigned. The UV offset bound is a technical continuity guard; final
perceptual acceptance remains a visual judgment on the exported animation.
