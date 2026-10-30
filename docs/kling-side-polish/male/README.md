# Male walking hand / shorts contact repair

The PR53 candidate protected parts of the original dark shorts as if they were
near-hand artwork. This produced a dark wedge behind the palm or thumb when the
stone trousers were selected. It was visible at walk pack frame 26 and neighboring
poses, not a new trouser shadow or a garment layering-order error.

This repair changes only the nearHand protection contours at pack frames
24,25,26,27,28,29,31,32,34,36,37,38. The original source ZIP, frame mapping,
24 fps timing, head/face, body silhouette, every anchor and all other protection
contours remain unchanged. Registration remains a separate candidate; existing
saved projects retain their embedded previous registration.

The source-bound input is
[`qa-male-walk-boundary-refinement.json`](../../../artwork/kling-side-expansion/templates/source-review/qa-male-walk-boundary-refinement.json).
Its fixed native coordinates were reviewed against source / previous / repaired
crops. A bounded warm-source witness helped propose uncertain old-cloth edges;
frame 26's palm-side and thumb-side boundaries were traced and refined explicitly.
This is not a global color deletion rule, and no color segmentation runs in the
browser. Visible palm/finger skin, original dark hand ink and a narrow source
antialias margin remain intact. The accepted contours are applied by the existing
registration consolidator, and garment banks are regenerated against its hash.

An independent before/after decode caught a second, subtle issue: a local hand
contour changed the automatic leg-width percentile by 0.00006–0.015 source pixels,
causing distant trouser texture pixels to change. Seven source-measured width
values from the accepted baseline now keep that sampling scale stable. This
changes neither a leg anchor nor its silhouette, and prevents a hand-only repair
from perturbing the rest of the outfit.

## Evidence and reproducibility

- [Native contact review at integer 2×](walk-contact-review.png): source / previous
  candidate / repaired, all 12 reviewed poses.
- [Frame26 native composition](walk-26-native.png).
- [Independent ZIP / registration checks](audit.json).

These PNGs independently decode the actual garment bank ZIPs and composite their
explicit ownership over the frozen source. They are authoring evidence; the
parent review's workbench GIF / CharacterPack exports provide the separate actual
application evidence.

To reproduce the registration and garment build from repository inputs:

```sh
python artwork/kling-side-expansion/templates/source-review/consolidate.py
python scripts/prepare-kling-side-male-clothing.py
```

To independently compare against retained PR53 assets, supply a directory with
`male.registration.json`, `male-shirt.garment.zip` and
`male-trousers.garment.zip` from commit 4fd27f9:

```sh
python scripts/review-kling-side-male-polish.py --before /path/to/baseline
```

The validator decodes all 107 frames. It checks that 95 other frames retain exact
patch and ownership bytes; changed bank pixels stay within 4 pixels of the reviewed
hand-contact changes; head/anchors, protected source pixels and unowned source
pixels are preserved. Explicit hand-ink witnesses and visible hand-color witnesses
supplement the native visual review; they are not a proof of anatomical quality
by themselves.

## Remaining limits

This bounded repair removes the broad original-shorts wedges. A narrow original
ink / antialias fringe remains intentionally attached to the hand. Source matte
noise, the existing compressed sleeve shapes and source-video blur are unchanged.
No new garment pose artwork, body warp, temporal interpolation or source retiming
was introduced.
