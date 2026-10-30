# Female near-forearm ownership repair

Baseline: PR #54 commit `16fb1405239188a453d66cda94927106028eefbf`.
The remaining run40 wedge and the adjacent run41 thin spike both belong to the
**skirt**, even though they appear beside the blouse sleeve and wrist. Isolating
source, blouse, skirt and the complete outfit shows the original arm is intact
until the skirt is applied. The prior foreground-arm hint stopped at a wrist
cutoff; the skirt's diagonal outer edge then crossed the lower forearm.

This pass releases those locally misassigned pixels to their exact original
source RGBA. The [source-bound contour recipe](../../../artwork/kling-side-refinement/female/foreground-contours.json)
records manually inspected native-coordinate boundaries; the dark arm outline
and its antialiasing come from the source. No skin is painted, no color is
globally erased, and no garment pose is regenerated.

| Pack frame | Original video frame | Restored source pixels |
| --- | --- | --- |
| 40 | 141 | 158 |
| 41 | 142 | 126 |

The other **100 skirt poses remain exact** in reconstructed native RGBA,
including the full jump sequence and its approved pleated folds. The blouse,
registration, source, head/hand protection, hair, playback order, 24 fps and loop
flags stay unchanged. Both repaired contacts also survive the complete
blouse-plus-skirt composition. Existing saved projects retain their embedded
original garment bytes; the current catalog loads the corrected asset under the
existing garment ID and V1 format.

The first narrow contour trial left part of the skirt crossing the source ink.
It was rejected. The retained contour follows the original outline, including
five antialiased source pixels at frame41; transparent source pixels are not
used to cut a hole in the skirt.

## Inspect and reproduce

- [Source / old / repaired native key poses](contacts-native.png)
- [Same-frame details and neighboring poses at integer 2×](contacts-2x.png)
- [Two repaired contacts at a comfortable integer 2× size](contacts-focus-2x.png)
- Complete run diagnostics: [right](run-offline-right.gif) · [left](run-offline-left.gif)
- [Exact-frame audit](audit.json) · [package audit](pack-audit.json) · [V1 preflight](preflight.json)
- [Byte-exact reproduction](reproduction.json)

```sh
PYTHONPATH=/tmp/side-polish/python-deps python scripts/refine-kling-side-forearm-ownership.py
PYTHONPATH=/tmp/side-polish/python-deps python scripts/kling_side_tools.py \
  --identity female lint docs/kling-side-expansion/assets/female-skirt.garment.zip \
  --report /tmp/female-forearm-preflight.json
```

The optional `--output` and `--review` arguments write a separate candidate and
its diagnostics without changing the shipped asset. Every run starts from the
pinned PR54 skirt rather than the already corrected output.

All 102 garment poses decode and roundtrip exactly; source binding and strict
protected ownership checks pass. Both diagnostic GIFs decode with all 18 run
frames and the original 750 ms cycle rounded to GIF centiseconds.

These are **offline full-outfit diagnostics**, not browser export evidence.
Final application GIFs and standalone playback are recorded by the parent
iteration's review. Existing blouse donor seams, neckline/waist remnants,
source matte fringes and the crouched end of the original jump remain outside
this small ownership repair.
