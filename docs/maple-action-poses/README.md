# Maple action poses — review files

This follow-up adds closed-hand run/jump alternatives while retaining the
original relaxed-hand idle/walk. [Implementation, compatibility and limitations](../MAPLE_ACTION_POSES_REVIEW.md).

## Actual Skin Studio exports

- [Before/after, native size](final/before-after-1x.png) · [2×](final/before-after-2x.png)
- [Wrist/cuff comparison, 4×](final/before-after-arm-waist-4x.png)
- [Running comparison](final/before-after-run-right-2x.gif)
- [Four actions, right](final/four-actions-right-2x.gif) · [left](final/four-actions-left-2x.gif)
- [Every running key](final/run-keyframes-1x.png) · [Every jumping key](final/jump-keyframes-1x.png)
- [Three expressions](final/expressions-2x.png) · [Clothing reuse](final/reused-clothing-2x.png)

## Editable sources and standalone playback

| Look                     | Editable project                                  | Independent CharacterPack                            |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------------- |
| Maple neutral            | [Project](final/traveler-neutral.rig.zip)         | [Pack](final/traveler-neutral.character.zip)         |
| Maple gentle             | [Project](final/traveler-gentle.rig.zip)          | [Pack](final/traveler-gentle.character.zip)          |
| Maple joyful             | [Project](final/traveler-joyful.rig.zip)          | [Pack](final/traveler-joyful.character.zip)          |
| Crop, generated clothes  | [Project](final/crop-traveler-clothes.rig.zip)    | [Pack](final/crop-traveler-clothes.character.zip)    |
| Waves, recolored clothes | [Project](final/waves-traveler-recolored.rig.zip) | [Pack](final/waves-traveler-recolored.character.zip) |

Reusable prepared imports:
[Skin v2](../../artwork/maple-action-poses/prepared/traveler.skin.zip),
[Sweater with active hands, v2](../../artwork/maple-action-poses/prepared/traveler-top.wardrobe.zip),
[Trousers, v1](../../artwork/maple-action-poses/prepared/traveler-bottom.wardrobe.zip),
[Boots, v1](../../artwork/maple-action-poses/prepared/traveler-shoes.wardrobe.zip).
Maple remains a flat skin/project; the new sweater is freely reusable on the two
catalog identities. Keep project ZIPs to retain imported artwork and editable
motions. The appearance reference alone does not reproduce arbitrary imported art.

## Inspection records

- [Browser workflow and independent playback](final/evidence-index.json)
- [Decoded artifact validation](final/artifact-validation.json)
- [File integrity](final/file-integrity.json)
- [Current-batch test record](verification-results.json)
- [Source generation and measured preparation](../../artwork/maple-action-poses/README.md)
- [Knee diagnostic sweeps](knee-diagnostics/diagnostic-results.json) · [mesh comparison](knee-diagnostics/mesh-sweep-3x.png) · [source-joint comparison](knee-diagnostics/source-knee-sweep-3x.png)

Knee sweeps are direct renderer experiments and are labeled separately; no
candidate was adopted. Main review PNG/GIFs above use actual exported assets.
