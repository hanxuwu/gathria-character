# Source-mouth gentle expression for the native side view

This is an offline derivative of each original male/female Kling drawing. It
does not generate a new face, replace the eyes, or change source proportions,
frame order, duration or opacity. The ordinary expression is still the original
source when no face layer is selected.

`scripts/prepare-dual-looks-side-face.py` adapts the mouth-only treatment in
`scripts/refine-kling-expressions.py`. The native painted smile is widened by
12% in its inner support and its corners lifted by at most 1.4 reference pixels.
The change has smooth compact support in the head's feature axes; its outer
half-width/height is 28/16 reference pixels. Original nose, foreground hands,
face boundaries and transparent pixels are explicitly excluded. Original
source ink supplies all color and linework. There is no runtime face warp.

The sources are the immutable side-view packs in
`docs/kling-side-workspace/assets/`. Existing side appearance poses provide
head/mouth anchors and inner face polygons; their head-feature transforms come
from `artwork/kling-side-expansion/hair/*-head-registration.json`. Every output
audit records those exact inputs by SHA-256. The candidate registration is the
already reviewed side-tailored registration, not a new relaxation of protection.

The source-native contact sheets were visually reviewed for expression changes.
Male native IDs 62–67 and female 57–62 retain their complete original
half-blink/blink expressions. Very soft jump mouths retain their original
artwork too: male 75, 90, 91, 98; female 70, 85, 86, 94. The adjacent two drawings
ease mouth strength toward zero (0.75 then 0.35), so retention does not impose
an abrupt full-strength smile change. Source action clocks remain unchanged.
There are no open-mouth laughter drawings in this side source selection; this
does not add a side-view celebration action.

The first trial enlarged the mouth vertically. It made the small profile ink
stroke too thick, and was rejected. Its two proof sheets are retained under
`trials/`. The final candidate translates corners instead; the difference is
deliberately modest because the accepted originals already have a gentle smile.

## Output and verification

Each character directory contains `layer.json`, native RGBA mouth patches,
native RGBA ownership masks (owned alpha 255, otherwise zero), and `audit.json`.
The layer uses `mode: source` with a reason on retained drawings. The parent
appearance-bank publisher packs these entries under `gentle-side-v1` without
changing the existing pose or hair geometry.

The checks assert exact source alpha, exact RGBA outside mouth ownership,
no ownership of the protected nose region or registered foreground, and exact
whole-source frames at preserved expressions. The native source/current sheets
and eight source-clock GIFs cover the four available actions. Jump remains a
one-shot and the three looping clips retain their loop flags. The GIFs use one
shared palette for both panels; quantized previews do not replace native PNG
pixel proofs. They are **offline authoring evidence**;
the final app-exported PNG/GIF/CharacterPack review remains separate.

## Rebuild

Install Python dependencies NumPy, Pillow and `opencv-python-headless`, then:

```sh
python scripts/prepare-dual-looks-side-face.py
```

`--prototype` only prepares the fourteen reviewed difficult poses per character;
`--character male|female` limits the build. The complete build prepares all 107
male and 102 female native poses. It writes only this new artwork directory,
never any old source, registration, bank or runtime asset.

This run used OpenCV 5.0.0, NumPy 2.3.5 and Pillow 12.3.0. A second complete build
reproduced all 382 native patch/mask/layer/audit files byte for byte. The eight
GIFs were independently decoded; results and hashes are in
`reproducibility.json`. Male has 97 painted and 10 retained source poses;
female has 92 painted and 10 retained source poses.
