# Male neckline ownership refinement

Baseline: PR #54, commit `16fb140`, using the exact shirt embedded in the
preserved actual exported `docs/kling-side-fitting/review/male.wardrobe.zip`.

## Cause and retained repair

The original top segmentation misses a thin band of visible tank cloth along
its neckline. That band was outside the terracotta shirt's ownership, so it
remained gray after composition. This is principally an ownership gap, not a
new neckline or body proportion problem. Difficult motion-blurred poses also
have gray/shadow pixels within head protection or the partial source skin proof.

The retained repair assigns only an explicitly reviewed set of native cloth
pixels to the shirt and copies their colors from nearby fully opaque interior
pixels of the accepted shirt. The production script consumes a fixed pixel-copy
recipe; it does not run a general color deletion, body deformation or classifier.
Each target is checked against both full head/hand protection and source skin
proof before packing. Its original source alpha is preserved. All previously
painted shirt pixels, sleeves, collar drawing and folds stay exact.

All 107 native source/old/new neckline crops were reviewed. The proposal was
bounded to the source neckline, within 12 native pixels of the original top
mask; a conservative cloth-color gate only proposed candidates for that review.
The saved recipe records the exact source hash, registration hash, old garment,
source frame hashes, skin-proof hashes and the source coordinates of every
copied garment pixel. This is a source-specific reviewed repair, not a reusable
skin detector or automatic segmentation guarantee.

A broader trial in jump poses 67/91 followed hand-traced neckline cloth contours,
but intersected ambiguous motion-blurred source skin-proof pixels. That trial
was rejected. No new V3 permission profile, relaxed head/hand rule, or registration
change ships. Existing V1 garments and saved embedded projects retain their rules.

## Review and limits

- [Native original / before / after](neckline-details-1x.png).
- [Integer 2× details](neckline-details-2x.png).
- [Idle](idle-diagnostic.gif), [walk](walk-diagnostic.gif),
  [run](run-diagnostic.gif), [jump](jump-diagnostic.gif).
- Native full frames: [before 0](before-0.png), [after 0](after-0.png),
  [before 67](before-67.png), [after 67](after-67.png),
  [before 91](before-91.png), [after 91](after-91.png).
- [Pixel and source-bound audit](audit.json).

These are offline diagnostics from independently decoded garment and source
archives. Main delivery uses separate actual application exports. The comparison
GIFs use a half-size presentation and indexed colors; native PNGs retain the
lossless reference, and the original jump remains a one-shot.

The thin gray collar band improves, especially in idle, walk and run. The broad
blurred shoulder/neck remnants in jump 67/91, original armpit notches, dark source
ink and matte edges remain visible. This iteration does not claim invisible
seams or invent skin behind the original clothing.

## Reproduce

```sh
PYTHONPATH=/tmp/side-polish/python-deps python scripts/refine-kling-side-male-neckline.py
```

Use a Python environment with NumPy, SciPy and Pillow; the temporary dependency
path above describes this execution environment only. The recipe lives at
[`neckline-cloth-copy.json`](../../../artwork/kling-side-refinement/male/neckline-cloth-copy.json).
The command always reads the pinned historical export, so repeated runs do not
accumulate changes. Only the male shirt and this dedicated diagnostic directory
are written. `--output` and `--review` can target temporary comparison files.
