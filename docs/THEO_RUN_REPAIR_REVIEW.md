# Theo: stride and shoulder repair

This bounded follow-up starts from `1ab97c5` on draft PR #10. It retains Theo's
head, face, hair, stature, suit design, source colors and twelve-key / 18 FPS
running cadence. The old project, original artwork and previous exports remain
available. This batch makes no image-generation call.

## Findings and changes

| Visible problem | Confirmed cause | Repair |
| --- | --- | --- |
| Alternating short and long steps | Each foot's travel was relative to a different anatomical hip | Explicit motion-library V2 targets both feet relative to the posed hip midpoint, retaining the original hip joints |
| Abrupt recovery and weak heel/toe support | A steep lift drop, and shoe placement calculated independently of the IK ankle | Smoother project-owned recovery keys; rotated opaque sole determines the same ankle used by the leg and shoe |
| Background wedge between sleeve and collar | The moving sleeve owned the cap, but the torso had no hidden overlap | New top adds 113 torso-owned backing pixels copied from the same sleeve cloth |
| Orange flecks beside the coat | Eight hand pixels leaked into the old torso extraction | Remove only those eight explicitly recorded pixels from the new top |
| Upper assembly moves as a rigid block | One shared lean transform | A small V2 run-only upper-body response around the pelvis |

The two contact poses now have equal 41 px ankle separation; the previous
project's alternating contacts were approximately 30 and 64 px. This is a
geometry check, not a claim that the two differently drawn shoes have identical
silhouettes. After two bounded recovery candidates, the selected motion brings
the recovering foot forward earlier without excessively folding the knee.

The shoulder repair and recovery trials remain recoverable in
[`artwork/theo-run-repair/iterations`](../artwork/theo-run-repair/iterations/).
The [source record](../artwork/theo-run-repair/README.md), preparation script and
registration JSON record every copied and removed source pixel. No global
color deletion, final-frame patch painting or lower-body illustration change
is used.

## Actual application exports

- Matched run: [native keyframes](theo-run-repair/final/before-after-run-keyframes-1x.png)
  · [2× keyframes](theo-run-repair/final/before-after-run-keyframes-2x.png).
- Before/after loops: [right](theo-run-repair/final/run-comparison-right-2x.gif)
  · [left](theo-run-repair/final/run-comparison-left-2x.gif).
- Final run: [right](theo-run-repair/final/run-right-2x.gif)
  · [left](theo-run-repair/final/run-left-2x.gif).
- [Shoulder detail](theo-run-repair/final/shoulder-cuff-before-after-4x.png)
  · [leg detail](theo-run-repair/final/knee-ankle-before-after-3x.png)
  · [three expressions](theo-run-repair/final/expressions-2x.png).
- [Four-action tour](theo-run-repair/final/four-actions-right-2x.gif)
  · [editable project](theo-run-repair/final/theo-run.rig.zip)
  · [independent CharacterPack](theo-run-repair/final/theo-run.character.zip).

These PNGs and GIFs use actual Studio output on a labeled neutral preview
stage. The preparation diagnostics are separate. Playback is in place, without
world displacement. GIF color and 10 ms timing quantization are presentation
limits; the pack retains exact RGBA and 18 FPS timing.

## Compatibility

[Motion library V2](MOTION_LIBRARY_V2.md) is explicit and run-only. V1 projects
are never upgraded by importing a garment or editing a preview. Old generators,
items and default project creation remain unchanged. New project Reset retains
V2 semantics but restores the generic starting run; Undo restores Theo's tuned
clip. Baked CharacterPacks need no new independent-player format or runtime.

The new `custom-theo-run-top` preserves the existing identity, lower garments,
shoes, arms and source head PNGs. Idle/walk/jump motion clips are unchanged.
Their new-top frames intentionally close the old shoulder seam and can remove
the tiny misplaced hand fringe; they are not claimed to be full-frame identical
to the old top. The historical project itself remains exactly reproducible.

## Verification

This follow-up executed **469 unit tests across 37 files, eleven relevant
Chromium E2E tests, TypeScript and the production build**, all passing. The
existing build chunk-size warning remains. The browser checks cover V2-only
controls, editing/reset/undo/redo, saved project reopen, the four actions,
source-color item roundtrips and historical Theo/Rose/Maple/Willow exact baked
pixels. Historical counts in the earlier Theo study remain historical.

Preparation verifies all 108 expression/action frames stay inside their frame
and fourteen non-torso source arrays remain exact. The new torso changes exactly
121 source pixels: 113 added and eight removed. This includes intentional
non-running seam changes, recorded separately from historical V1 compatibility.

See [this session's execution record](theo-run-repair/verification-results.json)
and the [final evidence index](theo-run-repair/final/evidence-index.json).
Actual UI capture passed on its first attempt: four semantic packs / 144 baked
poses, 80 editor pose/facing comparisons, top-item import/export and saved-project
roundtrips. Studio closed before ten independent playback cases: the four final
actions in both directions plus the old run in both directions. Frame order,
timing, loop wrap and one-shot jump hold/replay passed, with no page errors,
external requests or consumer imports of authoring modules.

All 114 runtime/harness hashes and 133 input hashes remained fixed. All final
66 PNGs, sixteen GIFs and fifteen ZIPs decode, including GIF frame/timing/loop
checks and ZIP member/CRC checks. The [file inventory](theo-run-repair/final/file-integrity.json)
records each artifact. Run loops retain twelve frames and total 670 ms after
GIF timing quantization.

Inspection of the actual exports confirms the proximal shoulder notch is filled
and the misplaced orange pixels are gone. Maximum per-key ankle displacement
changes from 17 to 14 px horizontally and from 14 to 8/9 px vertically for the
near/far legs. The nearest-neighbor shoe support matches the planned contact or
flight height in all twelve keys, with no leg-segment extension in this fitted
Theo project. These numeric checks do not resolve the remaining boot overlap.

## Remaining visual limitations

- Pose 9 still partly overlaps the recovering front-view boot with the side-view
  supporting boot. The moderate second candidate improves travel without
  achieving a clear silhouette gap. Raising it further compresses the short
  leg; a compatible passing-pose shoe/leg drawing is the next useful input.
- Deep knee folds, especially the triangular trouser fold in pose 10, and fixed
  right-angle elbows still expose the limits of the current layered/weighted
  source parts. This is not redrawn frame animation.
- A small dark shoulder backing edge remains stylized in some forward swings,
  although the open background wedge is closed.
- The existing forehead skin/hair mask error under dark-skin/blonde recoloring
  and mild expression-head drawing drift remain outside this run-only repair.
- Production Gathria integration and user visual acceptance remain pending.

Functional checks and visual judgment are separate. The batch stops at a
reviewable draft; it does not claim all run silhouettes are resolved.
