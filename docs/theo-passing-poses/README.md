# Theo passing-pose review files

Open the [review](../THEO_PASSING_POSES_REVIEW.md) for scope, compatibility,
current verification and remaining visual defects. This is an explicit opt-in
study; existing projects and Studio defaults remain unchanged.

## Actual exported comparisons

- [Right-running comparison, 2×](final/run-comparison-right-2x.gif)
  · [left, 2×](final/run-comparison-left-2x.gif)
  · [native-size comparison](final/run-comparison-right-1x.gif).
- [Complete before/after run keys, native](final/before-after-run-keyframes-1x.png)
  · [2×](final/before-after-run-keyframes-2x.png).
- [Passing/deep-bend poses 7–10, 4×](final/passing-07-10-before-after-4x.png)
  · [isolated leg/shoe contributions](final/isolated-contributions-2x.png).
- [Unchanged head/neck](final/head-neck-before-after-4x.png)
  · [three expressions](final/expressions-2x.png)
  · [recoloring](final/recolor-2x.png).
- [Four actions, right](final/four-actions-right-2x.gif)
  · [left](final/four-actions-left-2x.gif).

All poses above come from actual application exports. Source views in
`source-variants-vs-base-3x.png` show registered Studio attachments, not animated
poses. Offline preparation diagnostics remain under the artwork directory.

## Reusable downloads

- [Editable Theo project](final/theo-passing.rig.zip): open in `/skin-studio.html`.
- [Independent CharacterPack](final/theo-passing.character.zip): load in
  `/player.html`, or extract its PNG/manifest. Studio can be closed.
- [Bent-trouser item](../../artwork/theo-passing-poses/prepared/theo-passing-bottom.wardrobe.zip)
  · [side-view running shoes](../../artwork/theo-passing-poses/prepared/theo-passing-shoes.wardrobe.zip).
- [Original baseline project](../theo-run-repair/final/theo-run.rig.zip).

New authoring attachments require this branch's Skin V3 / item V4 support.
Existing independent players consume the unchanged baked CharacterPack format.
The final directory also retains baseline, legs-only, shoes-only, joyful and
recolored packs so the contributions can be reviewed separately.

## Reproduce and inspect

Run these sequentially from the repository root with dependencies, Chromium
and Python/Pillow installed:

```sh
node scripts/prepare-theo-passing-poses.mjs
EVIDENCE_PHASE=iterations/review node scripts/generate-theo-passing-evidence.mjs
EVIDENCE_PHASE=iterations/review python3 scripts/render-theo-passing-review.py
```

The evidence harness refuses to overwrite a populated phase. It checks real
UI saves/exports, source editing and undo, clothing-library round trips,
non-run equality and closed-editor independent playback. The renderer decodes
all delivered PNG/GIF/ZIP files and checks frame order, timing and integrity.
Use a new phase name for another capture; retain the reviewed `final/` files.

[Source/provenance](../../artwork/theo-passing-poses/README.md) ·
[This batch's command results](verification-results.json) ·
[Actual capture record](final/evidence-index.json) ·
[Decoded final-file inventory](final/file-integrity.json) ·
[Source/trial archive checks](source-file-checks.json).
