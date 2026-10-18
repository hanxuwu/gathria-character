# Generated traveler / final

These previews use actual Skin Studio-exported CharacterPack spritesheets, on a labelled neutral stage at native or nearest-neighbor integer zoom. The original generated illustration is documented separately and is not substituted for the posed outputs.

- [Four actions, native](four-actions-1x.png) · [2×](four-actions-2x.png)
- [Expressions, native](expressions-1x.png) · [2×](expressions-2x.png) · [Face and neck, 4×](face-neck-4x.png)
- [Run right, native](run-right-1x.gif) · [Left](run-left-1x.gif) · [2× right](run-right-2x.gif)
- [Walk right](walk-right-1x.gif) · [Left](walk-left-1x.gif)
- [Idle right](idle-right-1x.gif) · [Left](idle-left-1x.gif)
- [Jump right](jump-right-1x.gif) · [Left](jump-left-1x.gif): plays once and holds the last pose.
- [Four-action tour, right](four-actions-right-2x.gif) · [Left](four-actions-left-2x.gif): explicitly repeats after a labelled hold.
- [Run keyframes](run-keyframes-1x.png) · [Jump keyframes](jump-keyframes-1x.png) · [Walk keyframes](walk-keyframes-1x.png)
- [Shoulder, wrist and waist](arm-waist-4x.png) · [Hip, knee and ankle](leg-joints-4x.png)
- [Generated clothing reused on built-in identities](reused-clothing-1x.png)
- [Cuff and skin recolor ownership, 4×](recolor-cuff-4x.png)
- [Studio and source binding](studio-binding-inspection.png) · [Studio workflow](studio-workflow.png)
- [Independent player, right](traveler-neutral/independent-jump-right.png) · [Left](traveler-neutral/independent-jump-left.png)

## Portable files

| Look | Editable project | Independent CharacterPack |
| --- | --- | --- |
| Traveler neutral | [Project](traveler-neutral.rig.zip) | [CharacterPack](traveler-neutral.character.zip) |
| Traveler gentle | [Project](traveler-gentle.rig.zip) | [CharacterPack](traveler-gentle.character.zip) |
| Traveler joyful | [Project](traveler-joyful.rig.zip) | [CharacterPack](traveler-joyful.character.zip) |
| Crop with generated clothing | [Project](crop-traveler-clothes.rig.zip) | [CharacterPack](crop-traveler-clothes.character.zip) |
| Waves with recolored clothing | [Project](waves-traveler-recolored.rig.zip) | [CharacterPack](waves-traveler-recolored.character.zip) |

[Full skin](traveler.skin.zip) · [Top item](traveler-top.wardrobe.zip) · [Bottom item](traveler-bottom.wardrobe.zip) · [Shoes item](traveler-shoes.wardrobe.zip).

The actual imported source attachments are saved under `isolated/`. These diagnose ownership before deformation; they are not separate finished characters. The editor PNGs under `editor/` were sampled through the actual preview controls and verified against exported frames.

Every delivery ZIP is decoded with member hashes and CRC checks. Every PNG is decoded; every GIF's decoded palette-converted frame pixels, order and centisecond timing are compared with its source events. Mirroring, full-frame transparency and edge clearance are checked. Editor close, independent playback, project reopen, item roundtrip and recolor checks are recorded in [evidence-index.json](evidence-index.json).

[Media validation](artifact-validation.json) · [Every-file integrity inventory](file-integrity.json).

Functional checks do not establish visual acceptance. Remaining source/skeleton defects and the limits of one-view joint deformation are documented in the parent review.

[Before/after cuff recolor ownership, 4×](cuff-mask-before-after-4x.png) compares the preserved real exports with the corrected masks. The source artwork pixels are identical; only semantic material assignments changed. The final sleeve follows top color while the ivory cuff remains fixed and the hand follows skin color.
