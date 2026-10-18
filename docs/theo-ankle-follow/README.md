# Theo ankle-follow review files

This correction makes running shoes inherit the solved shin direction through
their own registered source axis. It preserves every source pixel and the
existing motion keys. These comparisons use **actual Studio-exported PNGs**;
the beige/green review stage is not part of the transparent CharacterPack.

## Look at the change

| Review                            | Files                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Matched before/after loop, 2×     | [Right](final/run-comparison-right-2x.gif) · [Left](final/run-comparison-left-2x.gif)                                          |
| Matched before/after loop, native | [Right](final/run-comparison-right-1x.gif) · [Left](final/run-comparison-left-1x.gif)                                          |
| Corrected run only, 2×            | [Right](final/run-right-2x.gif) · [Left](final/run-left-2x.gif)                                                                |
| Every matched key                 | [Native](final/before-after-run-keyframes-1x.png) · [2×](final/before-after-run-keyframes-2x.png)                              |
| Cuff, ankle and boot              | [All twelve poses, 4×](final/cuff-ankle-all-poses-before-after-4x.png) · [Poses 7–10](final/passing-07-10-before-after-4x.png) |
| Preserved head/neck               | [Matched 4× crop](final/head-neck-before-after-4x.png)                                                                         |
| Other actions                     | [Four-action comparison](final/four-actions-1x.png) · [Playback tour](final/four-actions-right-2x.gif)                         |
| Appearance compatibility          | [Expressions](final/expressions-2x.png) · [Recoloring](final/recolor-2x.png)                                                   |

The loops contain twelve poses at the existing 18 FPS. GIF centisecond timing
rounds a 666.67 ms cycle to 670 ms; it does not alter the exported pack's timing.
All loops are in place. CharacterPack left-facing playback mirrors the native
right-facing frames.

## Use the result

- [Corrected editable project](final/theo-ankle-follow.rig.zip): open in
  `/skin-studio.html`. Includes registered artwork, both item/identity libraries
  and the original four-action motion library.
- [Independent CharacterPack](final/theo-ankle-follow.character.zip): load in
  `/player.html`; no generator or editor is required.
- [Portable following shoes](../../artwork/theo-ankle-follow/prepared/theo-ankle-follow-shoes.wardrobe.zip):
  import as clothing, then select explicitly. This is a registered Theo source
  item, not automatic fitting of arbitrary shoe illustrations.
- [Original baseline project](../theo-passing-poses/final/theo-passing.rig.zip)
  and [baseline CharacterPack](../theo-passing-poses/final/theo-passing.character.zip)
  retain the earlier rendering.

Skin V4 / shoe item V5 opt into the new binding; old projects are not silently
upgraded. See the [format and editor contract](../RUN_SHOE_PARENTING.md).

## Evidence and limitations

[Review and remaining motion limits](../THEO_ANKLE_FOLLOW_REVIEW.md) ·
[Current test execution](verification-results.json) ·
[Actual application evidence](final/evidence-index.json) ·
[Media validation](final/artifact-validation.json) ·
[All-file integrity](final/file-integrity.json) ·
[Source preparation](../../artwork/theo-ankle-follow/README.md).

The shoe/cuff rotation is corrected, but the ninth pose still crowds the feet,
some recovery keys turn rapidly, and the older trouser folds/source transitions
remain. This delivery is available for visual review; it does not claim final
user acceptance or production Gathria integration.
