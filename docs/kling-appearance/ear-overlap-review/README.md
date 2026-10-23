# Male ear overlap repair

The male Soft bob had an oversized transparent opening behind the original
Kling ear. The front-only hair cutout had discarded a continuous rear strand
already present in the donor. Matching the ear's motion did not restore that
missing silhouette. A smaller scalp wedge also remained above the ear in Soft crop.

This correction restores the bob's existing rear strand behind the ear/head and
fits both male styles locally over the upper ear. The ear can be partly covered
by hair; its original shape is retained. No source face, ear, body, clothes or
animation timing is repainted or rescaled. Female artwork is unchanged.

## Actual exported comparisons

Each comparison shows **Original source → Before → After** at the same pose.
Before uses retained actual V3 exports from `d6a50f0`; After is freshly exported
from the wardrobe using male content revision 4. The fresh old-project PNG is
also checked against its retained V3 pack. Donor sheets and offline fitting
prototypes are not used as application results.

- Soft bob, wedding: ear run [native-size GIF](soft-bob-ear-run-1x.gif) /
  [2× GIF](soft-bob-ear-run-2x.gif), and matched keyframes
  [1×](soft-bob-ear-keyframes-1x.png) / [2×](soft-bob-ear-keyframes-2x.png).
- Soft crop, everyday: ear run [native-size GIF](soft-crop-ear-run-1x.gif) /
  [2× GIF](soft-crop-ear-run-2x.gif), and matched keyframes
  [1×](soft-crop-ear-keyframes-1x.png) / [2×](soft-crop-ear-keyframes-2x.png).
- Full characters, five actions: Soft bob [right](soft-bob-five-actions-right.gif)
  / [left](soft-bob-five-actions-left.gif); Soft crop
  [right](soft-crop-five-actions-right.gif) / [left](soft-crop-five-actions-left.gif).
- Independent final CharacterPacks: [wedding bob](evidence/final/male-wedding.character.zip)
  / [everyday crop](evidence/final/male-day.character.zip).
- [Actual browser workflow and download record](evidence/final/evidence-index.json),
  [decoded artifact and pixel checks](artifact-validation.json),
  [visual review](visual-review.md).

Ear crops follow the original ear using integer crop offsets. Their 2× copies
use nearest-neighbor scaling. Full-character comparison GIFs are labeled 0.5×;
native RGBA PNGs and CharacterPack frames are authoritative for edge checks.
GIF palette and centisecond timing differ slightly from native RGBA playback.
The five-action review montage repeats; the exported jump's one-shot semantics
and source timing are unchanged.

## Asset and composition changes

- `scripts/kling_hair_rear_lock.py` selects the missing pure-hair strand from
  the retained bob donor. Original donor RGB and the natural lower alpha edge
  are retained; the polygon excludes donor skin. A rear-only horizontal fit
  tucks the lower strand behind the original head/neck, avoiding a new hanging
  curl. The derived cutout and hash are retained under `artwork/kling-appearance`.
- `scripts/kling_hair_ear_overlap.py` locally fits existing male ear-side hair
  over the upper ear, composed with the previous per-pose ear-follow transform
  in `scripts/kling_hair_ear_fit.py`. It leaves the crown and central fringe fixed.
- `scripts/prepare-kling-appearance.py` generates all 88 male poses with those
  assets. Soft bob now has explicit back/front layers. The existing renderer
  already places rear hair behind source ear/head/hands/clothes; no runtime
  compositing or project-schema change was needed.
- The catalog offers released male V3 projects an explicit preview and saved
  updated copy. Existing projects continue using their exact embedded bank.

Source and processing details: [asset provenance](../../../artwork/kling-appearance/README.md).
Male bank is `kling-male-appearance-v4`, SHA-256
`0a443a618a9744650f3aa45168aa5469b396d5d07c9887e97428d50e77d629b3`.
Female remains byte-identical `kling-female-appearance-v3`.

## Current verification

This repair ran eight new Python geometry/donor checks, six existing ear-fit
checks, 32 relevant appearance unit tests, TypeScript checking and the production
build. All passed; the build ran after refreshing the male thumbnails from the
final actual exports. Female thumbnails and their provenance remain unchanged.
The 10 upgrade tests are included in those 32, not an additional count.

[Bank compatibility audit](bank-compatibility-validation.json) verifies 15
protected files byte-for-byte, including original source packs, donor sheets,
registrations, female bank and runtime composition. All 88 male head/face/anchor
registrations are unchanged except the declared hair bounds. All 55 painted
Gentle-face crops and ownership masks are decoded-pixel identical; the other
33 source-expression entries remain unchanged.

The actual browser capture exercises preview/cancel/save-copy, preserved old
projects, same-pose reopened copies, both hairstyles, representative hair colors,
everyday/wedding combinations, PNG/CharacterPack exports and independent playback
after closing the editor. This run produced 30 actual downloads: 25 native PNGs,
three editable project downloads and two independent CharacterPacks. Twenty
independent playback combinations passed (two looks × five actions × two
directions). Artifact checks cover all 176 native pack frames outside old/new
hair ownership, and verify exact left/right mirrors, source frame order, timing,
anchors and transparent borders. All eight GIFs, four comparison boards, 25
downloaded PNGs and seven screenshots were decoded and hashed. Ear-run GIFs have
16 frames / 670 ms; the five-action GIFs have 88 frames / 5,080 ms. See the records above for
this run's detailed results. Previous 221-unit/50-browser counts belong to the
[earlier stability batch](../stability-review/README.md); they were not rerun here.

## Remaining limits

The repair addresses the missing rear strand and upper-ear fit. Original video
blur, colored keying fringes and closed-eye speckles are retained, as are existing
garment-fold limitations. Source alpha can still leave a fine pale fringe at
some raised-hand edges. The hair follows registered head motion without secondary
strand physics. Technical verification and the recorded visual inspection are
separate from final user visual acceptance.

## Reproduce

Use the pinned Python dependencies in `scripts/requirements-kling-wardrobe.txt`.

```sh
python scripts/prepare-kling-appearance.py --character male
python scripts/build-kling-wardrobe-catalog.py
python scripts/verify-kling-male-ear-compatibility.py
python scripts/test_kling_hair_ear_overlap.py
```

The browser capture script `scripts/capture-kling-ear-overlap.mjs` needs the
retained V3 editable projects/actual packs identified in `baseline-inputs.json`;
it starts an isolated local Vite server itself. Its baseline is not fabricated
from the new bank. After capture, run `scripts/render-kling-ear-overlap.py` to decode the
actual packs, assert unchanged source/body pixels and create the review copies.
