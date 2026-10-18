# Theo run repair: review and downloads

This follow-up starts from the complete Theo study at `1ab97c5`. The original
project and evidence remain in `../theo-pose-study/`. The new files use an
explicit V2 motion library and a separately identified repaired top.

## Actual output

- Before/after running: [right, 2×](final/run-comparison-right-2x.gif) ·
  [left, 2×](final/run-comparison-left-2x.gif).
- Final running: [right](final/run-right-2x.gif) ·
  [left](final/run-left-2x.gif).
- All matched keys: [native](final/before-after-run-keyframes-1x.png) ·
  [2×](final/before-after-run-keyframes-2x.png).
- [Shoulder/cuff](final/shoulder-cuff-before-after-4x.png) ·
  [knee/ankle](final/knee-ankle-before-after-3x.png) ·
  [head/neck](final/head-neck-before-after-4x.png).
- [Three expressions](final/expressions-2x.png) ·
  [recolor](final/recolor-2x.png) ·
  [four actions](final/four-actions-right-2x.gif).

Preview backgrounds are neutral and animations run in place. PNGs retain actual
export pixels; GIFs introduce palette and timing quantization. Pose 9 still has
crowded boots. See the [review](../THEO_RUN_REPAIR_REVIEW.md) for remaining
visual limitations and this batch's verification.

## Reusable files

- [Editable full project](final/theo-run.rig.zip): open in Skin Studio to retain
  identity, clothes, source images, masks, bindings, tuned motions and preview.
- [Independent CharacterPack](final/theo-run.character.zip): open in the
  independent player; no editor, source library or renderer is required.
- [Repaired top item](../../artwork/theo-run-repair/prepared/theo-run-top.wardrobe.zip):
  reusable garment; importing it alone does not replace a project's motions.
- [Source preparation](../../artwork/theo-run-repair/README.md) ·
  [exact registration](../../artwork/theo-run-repair/prepared/registration.json).

## Reproduction

Run sequentially from the repository root, with dependencies and Chromium:

```sh
node scripts/prepare-theo-run-repair.mjs
node scripts/generate-theo-run-repair-evidence.mjs
python3 scripts/render-theo-run-repair-review.py
```

The preparation and browser capture start their own local servers. Capture
uses port 5198 by default. Freeze runtime, scripts and prepared inputs before
capture; do not run heavy tests alongside the timed independent playback.
The export harness uses real Studio controls/downloads and closes Studio before
the consumer tests. The renderer verifies every delivered PNG/GIF/ZIP, including
decoded frames, timing, mirroring and archive CRCs.

[Execution record](verification-results.json) ·
[UI and independent-playback index](final/evidence-index.json) ·
[File integrity](final/file-integrity.json).
