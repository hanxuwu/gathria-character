# Theo: whole-figure design before split assets

This bounded follow-up improves one Theo and one navy suit. The complete
standing illustration establishes the body mass and clothing silhouette before
the character is separated for the existing skeleton. It starts from `2471785`
on the unmerged `feat/reference-character-pair` branch. Source checkpoint
`acec98b` preserves the two original generation outputs and prompts. Color
implementation `e653abe` and registered artwork/project checkpoint `9f9c385`
are also committed and pushed.

## What changed

- **Whole figure:** fuller shoulders, sleeves, hands and shoes, a compact torso
  and shorter legs follow one complete model. Visible standing-master parts use
  a common scale derived from the neck and sole, rather than independent sizing
  into the previous narrower template.
- **Ownership:** explicit source polygons separate the coat, arms, pelvis,
  thighs, shins and shoes. Hidden coverage is derived from supplementary art;
  generated static trouser fragments and misplaced hand pixels are excluded.
- **Colors:** new item V3 `source-relative-v1` preserves authored garment RGB at
  its source palette. Historical recoloring changed even the selected source
  color, creating a head/clothing mismatch. Old items retain that historical
  behavior exactly; the new contract is opt-in.
- **Motion:** a project-owned run trial fits the new shorter limbs. Actual
  exports compare old Theo, new artwork with the old run, and the final new-art
  run separately. Hidden-pelvis hip annotations improve first-contact foot
  separation without changing standing pixels. The shared renderer and global
  motion library are unchanged. The two halves still have unequal stride
  silhouettes; this trial does not claim fully redrawn running poses.

The source board's five running illustrations establish pose intentions. They
are not a complete animation cycle, and they are never substituted for actual
application output in the review GIFs.

## Actual exports

- Standing: [native](theo-pose-study/final/before-after-standing-1x.png) ·
  [2×](theo-pose-study/final/before-after-standing-2x.png).
- Three-stage run: [native](theo-pose-study/final/before-after-run-keyframes-1x.png) ·
  [2×](theo-pose-study/final/before-after-run-keyframes-2x.png).
- Final running: [right](theo-pose-study/final/run-right-2x.gif) ·
  [left](theo-pose-study/final/run-left-2x.gif) ·
  [all twelve poses](theo-pose-study/final/run-keyframes-2x.png).
- [Three expressions](theo-pose-study/final/expressions-2x.png) ·
  [head/neck](theo-pose-study/final/head-neck-before-after-4x.png) ·
  [arms/waist](theo-pose-study/final/arms-waist-before-after-4x.png) ·
  [legs](theo-pose-study/final/legs-before-after-3x.png).
- [Four-action tour](theo-pose-study/final/four-actions-right-2x.gif) ·
  [source-master versus actual gentle assembly](theo-pose-study/final/source-master-vs-assembly-2x.png).
- [Editable project](theo-pose-study/final/theo-study.rig.zip) ·
  [independent CharacterPack](theo-pose-study/final/theo-study.character.zip).

All actual-output images come from Studio-exported CharacterPacks on a neutral
review stage. The separately labeled master/assembly image compares two
different production stages at the same scale and expression.

## Compatibility and reproduction

New identity and clothing IDs keep the earlier Theo/Rose projects intact.
The identity/recipe/skin/project/CharacterPack envelopes retain their existing
versions; only the new garment items opt into V3. Older app revisions cannot
edit those V3 items, but baked packs play without the authoring libraries.
Only this new project caps jump keys 4–7 from rootY `[-3,-4,-4,-3]` to `-2`
to keep all expression heads inside the frame. The old-run comparator has the
same cap; their run-clip comparison remains isolated. Idle/walk clips remain
unchanged.

See the [color contract](WARDROBE_ITEM_V3.md) and
[source and preparation notes](../artwork/theo-pose-study/README.md).

Run `node scripts/prepare-theo-pose-study.mjs`, then
`node scripts/generate-theo-pose-evidence.mjs` and
`python3 scripts/render-theo-pose-review.py` with a supported Chromium browser.
Freeze source/runtime files before capture. Preparation diagnostics and
generated source artwork are not application-export evidence.

## Verification

This batch passed **463 unit tests across 36 files, nine relevant Chromium
E2E tests, TypeScript and production build**. The build retains its existing
chunk-size warning. Browser regression compares the previous Theo, Rose, Maple
and Willow project slots, metadata, complete baked pixels and manifests exactly
against their saved exports. V3 ZIP/project roundtrips cover mixed V1/V2/V3 items
and a V3 top without action forearms.

Preparation checks 108 expression/action frames, 15 exact source slot arrays,
unchanged standing pixels after hip annotation and three face/skin masks. The
executed results are in [verification-results.json](theo-pose-study/verification-results.json).
Historical suite counts from earlier batches are not counted as rerun here.

Actual UI capture exports six semantic CharacterPacks / 216 baked poses, checks
88 editor frame/direction pairs, three garment and one identity roundtrip, and
two saved-project roundtrips. Studio closes before ten independent playback
cases: all four final actions in both directions, plus previous Theo running
in both directions. Pixel order, timing, loop wrap and one-shot jump/replay pass.
There are no page errors, external requests or authoring-module consumer imports.
All 104 runtime/harness and 13 source/prepared/baseline hashes remain fixed.

All final 79 PNGs, ten GIFs and 21 ZIPs decode and pass frame/timing/loop or
member/CRC checks. The initial evidence attempt stopped on a harness sequencing
mistake: an imported identity had to be explicitly selected before clothing
could be imported into a flat legacy project. The corrected harness reran all
assertions; the final files were audited as newer than that successful rerun.
See [execution record](theo-pose-study/final/execution-record.json),
[UI/playback index](theo-pose-study/final/evidence-index.json) and
[file integrity](theo-pose-study/final/file-integrity.json).

Independent final review additionally matches all 36 gentle export frames and
three expression idle frames to the frozen prepared candidate, confirms the
rig/motions and fifteen slot PNGs exactly, and checks all four run GIFs against
actual exported frame order and mirroring. Their loops last 670 ms after GIF
time quantization; the loop-boundary image change is within the normal adjacent
frame-change range.

Final visual inspection is deliberately stricter than those structural checks:
the shallow shoulder notch and forehead mask error below remain visible despite
passing deterministic export, source-color and alpha assertions.

## Remaining visual limits

- Some run poses expose a small triangular background notch between the near
  sleeve cap and collar/torso. The separate source pieces need better hidden
  shoulder coverage; this batch is not presented as seam-free animation.
- Exposed forehead skin at some bang boundaries is still assigned to the hair
  material. Dark-skin/blonde recoloring exposes light triangles. For example,
  neutral source pixel `(110,60)` changes from RGB `(250,173,125)` to
  `(255,226,162)` with the hair channel. This is a source-mask ownership error,
  not a defect in preserving the selected source palette. The earlier bright
  hair/skin mixup was corrected, but these boundary pixels need further authoring.

- The complete source has pose-specific folds and silhouette changes that the
  current layered/weighted skeleton cannot reproduce. Deep knee compression,
  fixed right-angle running elbows and limited torso rotation remain constraints.
- Neutral and joyful heads were drawn separately from the gentle master. Ear,
  hair and eye placement have a mild 2–4 px authored-angle drift; they are not
  identical facial geometry with a procedural mouth replacement.
- This is an in-place motion study on a neutral background, not production
  Gathria scene integration. No new props, celebration poses or Rose redesign
  are included. User visual acceptance remains pending.

Functional verification and visual judgment are separate. The batch stops with
reviewable source, reusable parts, actual exports and preserved previous work.
