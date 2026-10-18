# Theo study: review and downloads

This batch focuses on one complete character, one navy suit and a project-owned
run trial. [Review, verification and remaining limits](../THEO_POSE_STUDY_REVIEW.md).

## Actual exported artwork

- Standing before/after: [1×](final/before-after-standing-1x.png) ·
  [2×](final/before-after-standing-2x.png).
- Old art / new art with old run / new art with tuned run:
  [matched poses 1×](final/before-after-run-keyframes-1x.png) ·
  [2×](final/before-after-run-keyframes-2x.png) ·
  [right GIF](final/run-comparison-right-1x.gif) ·
  [left GIF](final/run-comparison-left-1x.gif).
- Final run: [right 1×](final/run-right-1x.gif) ·
  [right 2×](final/run-right-2x.gif) · [left 2×](final/run-left-2x.gif) ·
  [all twelve keys](final/run-keyframes-2x.png).
- [Expressions](final/expressions-2x.png) ·
  [head/neck](final/head-neck-before-after-4x.png) ·
  [arms/waist](final/arms-waist-before-after-4x.png) ·
  [legs](final/legs-before-after-3x.png) · [recolor](final/recolor-2x.png).
- Four actions: [right tour](final/four-actions-right-2x.gif) ·
  [left tour](final/four-actions-left-2x.gif).
- [Registered gentle source master versus actual gentle assembly](final/source-master-vs-assembly-2x.png).
  The original concept is labeled and is not animation-export evidence.

## Reusable files

- [Final editable project](final/theo-study.rig.zip): open in Skin Studio with
  **Open project ZIP**. Contains the identity, three clothing items, complete
  split skin, source joints, project motions and preview settings.
- [Final CharacterPack](final/theo-study.character.zip): load in the independent
  `/player.html`; supports idle/walk/run and one-shot jump in both directions.
- [Same new art with old run](final/new-art-old-run.rig.zip): isolates the
  motion change from the artwork change.
- Individual source packages:
  [identity](../../artwork/theo-pose-study/prepared/theo-study.identity.zip),
  [top](../../artwork/theo-pose-study/prepared/theo-study-top.wardrobe.zip),
  [bottom](../../artwork/theo-pose-study/prepared/theo-study-bottom.wardrobe.zip),
  [shoes](../../artwork/theo-pose-study/prepared/theo-study-shoes.wardrobe.zip).

New V3 clothes require this revision of the editor; old garment outputs remain
unchanged. The baked CharacterPack has no dependency on source images or
authoring code. See the [V3 color contract](../WARDROBE_ITEM_V3.md).

## Reproducibility

[Untouched sources and exact prompts](../../artwork/theo-pose-study/README.md) ·
[source registration](../../artwork/theo-pose-study/prepared/registration.json) ·
[executed tests](verification-results.json) ·
[actual UI capture and closed-editor playback](final/evidence-index.json) ·
[decoded media/archive integrity](final/file-integrity.json).

All actual previews use exported pixels, nearest-neighbor integer zoom and a
neutral background. GIF palettes may quantize colors; PNG and CharacterPack
spritesheets preserve the exported RGBA. Visual acceptance remains pending.
