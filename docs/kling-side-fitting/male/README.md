# Male compressed-jump sleeve fitting

The near shoulder guide in the original registration is an approximate anatomical
attachment, sometimes near the lower armhole. At pack frame 89 it is `(219,490)`,
while the visible shoulder cap is higher. Reusing that point as the start of the
painted short sleeve produced a vertical rectangular cuff and compressed fold
sampling. The underlying source arm itself is continuous.

This repair introduces **cloth-only shoulder-cap guides** for pack frames 80–95,
covering the compressed second-jump passage. The guides are source-measured,
visually reviewed, limited to 10 pixels of horizontal adjustment and 35 pixels
vertically, and tapered at the range boundaries. Existing painted cotton is
resampled using the adjusted cap; the existing source arm and the registered
joints do not move. Forearm depth still uses the canonical shoulder/elbow/wrist
relationship, so fitting a sleeve cannot accidentally change which forearm is
in front.

A broad first trial changed the forearm-fold test together with the cap guide.
It improved crouched poses but made raised-arm poses 67/102 worse; it was rejected.
The retained version is bounded to the demonstrably improved compressed passage.
No new source drawing, recoloring, timing change or body deformation is included.

## Review

- [Native integer 2× sleeve comparison](sleeves-before-after-2x.png).
- [Complete original two-jump passage before/after](jump-before-after.gif).
- [Run regression before/after](run-before-after.gif): unchanged.
- [Source-bound validation](audit.json).
- Full native examples: [before89](before-89.png), [after89](after-89.png),
  [before82](before-82.png), [after82](after-82.png).

These images independently decode the final garment bank and compose it over the
source with the existing trousers. The GIF uses a half-size presentation layout
and indexed colors. They are authoring diagnostics; the main review's actual
workbench exports remain the application acceptance evidence.

## Reproduce

```sh
python scripts/refine-kling-side-male-sleeves.py
```

Requires the same NumPy/SciPy/Pillow authoring environment as the existing fitting
script. The fixed recipe is
[`sleeve-guides.json`](../../../artwork/kling-side-fitting/male/sleeve-guides.json).
The baseline comes from `item-0.zip` in the preserved historical **actual exported**
`docs/kling-side-polish/review/male.wardrobe.zip`, hash-checked before use. The
script always starts from that baseline, so repeated runs do not accumulate
fitting. It only writes the male shirt and its dedicated diagnostic outputs.

It computes old/new sleeve fitting under the same current dependencies, then
transfers only that local delta onto the exact historical garment. Thus tiny
unrelated library-rounding differences cannot change accepted folds elsewhere.
Every changed pixel is within 95 native pixels of the original near shoulder;
all 91 other frames, including the entire idle/walk/run actions, retain exact
native patch and ownership arrays. The final bank is independently decoded and
checked against the intended native arrays. Original source, registration,
trousers, protected head/hands, unowned source pixels and animation timing remain
unchanged.

## Limits

The most conspicuous rectangular cuffs in the compressed second jump improve.
Other raised-arm sleeves still have the prior fit. Small notches near the armpit,
retained original tank-top neckline/shoulder fringe, source blur and matte edges
remain visible. This is a local garment fitting repair, not physical cloth
simulation or a claim that every shoulder pose is finished.
