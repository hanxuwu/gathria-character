# Imported wardrobe item review

All character images and GIFs are made from CharacterPacks downloaded through the real Skin Studio. Images use nearest-neighbor integer zoom on a neutral preview stage. No new generative artwork is presented as implementation evidence.

- [Native lineup](item-lineup-1x.png) · [2× lineup](item-lineup-2x.png)
- [Original vs authored jacket detail, 4×](custom-detail-before-after-4x.png)
- [Four actions, native](four-actions-1x.png) · [2×](four-actions-2x.png)
- [Four-action tour right, 2×](four-actions-right-2x.gif) · [Left, 2×](four-actions-left-2x.gif)
- [Right native](four-actions-right-1x.gif) · [Left native](four-actions-left-1x.gif)
- [Jump plays once, right](jump-right-1x.gif) · [Left](jump-left-1x.gif)
- [Run keyframes](run-keyframes-1x.png) · [Studio workflow](studio-workflow.png) · [Mobile](studio-mobile.png)

| Download | Portable editable project | Independent CharacterPack |
| --- | --- | --- |
| Crop / custom embroidered denim | [Project ZIP](crop-custom.rig.zip) | [CharacterPack ZIP](crop-custom.character.zip) |
| Waves / same imported item recolored | [Project ZIP](waves-custom.rig.zip) | [CharacterPack ZIP](waves-custom.character.zip) |
| Waves / joyful | [Project ZIP](waves-joyful.rig.zip) | [CharacterPack ZIP](waves-joyful.character.zip) |

The [custom clothing ZIP](embroidered-denim.wardrobe.zip) derives from the application-exported [denim template](denim-top-template.wardrobe.zip). The capture script adds a small embroidered flower badge on existing upper-material torso pixels at (81,138), changes those pixels to fixed material 0, and retains the existing alpha, joints and source extent. This demonstrates a real source-art edit that remains visible while the jacket is recolored, with identical skeleton and motion data. It is a workflow sample, not a full new outfit art batch. No image-generation API was used. Full attribution and derivation remain in item.json, the portable project library, and CharacterPack provenance.

[Registered trousers](bottom-registered.wardrobe.zip) and [registered lace-ups](shoes-registered.wardrobe.zip) are renamed, visually unchanged templates used to verify all three clothing groups. Their saved item ZIPs have identical decoded PNG/mask pixels and metadata after UI import/export. The Waves project embeds all three custom items; it reopened after reloading the editor and exported an identical manifest and spritesheet.

The editor was closed before the independent player loaded the Waves CharacterPack. All four actions were checked in both directions (8 complete playback cases); every native frame matched its exported PNG, loops wrapped, and jump held its last pose and replayed. Authoring/generator modules were blocked, none were requested, and there were no external requests or browser errors. [Right player screenshot](waves-custom/independent-jump-right.png) · [Left](waves-custom/independent-jump-left.png).

Both earlier version-1 wardrobe projects (crop-mixed and waves-mixed) were reopened and re-exported: all 72 frame pixels and both manifests were identical to the prior checked-in exports. Full current results are recorded in [evidence-index.json](evidence-index.json).

GIF timing uses cumulative centisecond rounding. Every decoded GIF frame and duration is compared with the intended palette-converted exported frame. Individual jump GIFs have no loop extension; the four-action review tour deliberately repeats after a labelled hold. All characters animate in place.

- [Browser evidence and source hashes](evidence-index.json)
- [PNG/GIF/ZIP decoding and playback validation](artifact-validation.json)
- [Every-file integrity inventory](file-integrity.json)

This feature accepts registered, split clothing on the existing 192×256 skeleton; it does not automatically segment or rig arbitrary illustrations. The existing collar remnant and bent-knee texture compression remain inherited art limitations. Functional verification and visual acceptance are separate; these previews are available for review.
