# Theo: footwear follows the trouser ankle

This follow-up preserves every source pixel of the selected passing-pose study.
It makes no image-generation call and does not redraw or rescale any source.
The baseline is the actual Studio-exported
`docs/theo-passing-poses/final/theo-passing.rig.zip`.

The previous run footwear had a registered ankle point but no registered shin
direction. Its pose used an independent shoe angle, allowing the rotating cuff
and shoe opening to disagree even when their ankle coordinates matched. The
new item supplies the missing source direction explicitly.

## Source registration

The side-profile boot was extracted from the upper-right running character in
`artwork/theo-pose-study/source/complete-pose-model.png`. Its original source
knee is `(1284,405)` and its ankle is `(1268,456)`. Applying the retained uniform
scale `0.484` to that vector maps the reference shin point into each registered
shoe canvas:

| Side | Source shin point | Source ankle |
| ---- | ----------------- | ------------ |
| Near | `(74,197)`        | `(66,222)`   |
| Far  | `(119,197)`       | `(111,222)`  |

The native registration has a shin direction of approximately 107.7 degrees.
This comes from the boot's own source drawing. The independently generated
bent trousers have a different source angle and must not supply the footwear's
rest direction. Source joints describe attachment registration; the anatomical
rig, registered anatomical chains and all motion keys remain unchanged.

## Explicit compatibility

`custom-theo-ankle-shoes` is an opt-in wardrobe item V5 with `source-relative-v1`
coloring. It retains the complete previous parts, material masks, source palette
and base shoe ankles. Each paired `runShoes` entry adds only `sourceShin`.
Composition creates Skin V4. Earlier items and skins retain their old rendering
behavior; importing an old project never upgrades its shoes implicitly.

For these explicitly following shoes, rotation comes from the posed shin and
the registered source direction. The old independent run `shoePitch` values
remain saved for compatibility but do not override the attachment; Studio
disables that control while this footwear is active. Rotated opaque-sole
support and leg IK share the same ankle. As a result, rendered running ankle
height and knee positions can change even though the authored rig and motion
data are identical.

The `.078` bent trousers, repaired top, identity heads, expressions and all
base parts are unchanged. Idle, walk and jump retain their previous pixels.

## Reproduce and review

Run `node scripts/prepare-theo-ankle-follow.mjs`. The script opens a local
Vite/Chromium session, derives the new portable item from the actual baseline
project and exports:

- `prepared/theo-ankle-follow.rig.zip`
- `prepared/theo-ankle-follow-shoes.wardrobe.zip`
- Before/after renderer run frames, integer-zoom keyframes, ankle details and
  labeled left/right GIF diagnostics.

`prepared/registration.json` records input hashes, source registration, exact
source-array preservation, unchanged non-running outputs, upper-character
comparisons, frame bounds, compact pose inspections and ZIP roundtrips. It
retains output hashes for reproducibility. These are preparation diagnostics;
final Studio exports and closed-editor independent playback are verified and
documented separately.

Preparation checks cover all 19 source-image comparisons, 24
non-running frame comparisons, 36 running upper-character comparisons and
108 frame-boundary/binary-alpha checks, plus project/item ZIP roundtrips.
The selected twelve-frame run had zero measured pixel-support error for both
shoes in every key. These functional and geometric checks do not replace
reviewing the real animation: the crossing pose still overlaps the two shoes,
and the underlying trouser mesh and source-switch limitations remain.
