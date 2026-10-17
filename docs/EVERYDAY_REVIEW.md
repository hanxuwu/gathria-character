# Everyday wardrobe review

Four everyday/travel outfit presets now extend the studio beyond wedding examples. This is a bounded outfit-catalog batch using the existing V6 artwork and compact running renderer. It does not introduce a new art version, garment illustration or animation rig.

## The four looks

| Look            | Clothes                                                                 | Complete example                          |
| --------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| Denim daytrip   | Denim-blue jacket, cream inner shirt, tan trousers and warm brown shoes | Short crop, gentle smile                  |
| Coral afternoon | Soft coral puff-sleeved top, cocoa skirt and brown shoes                | Long waves, gentle smile                  |
| Sage weekend    | Sage hoodie, slate shorts and cream sneakers                            | Short crop, deeper complexion, happy eyes |
| Ochre traveler  | Ochre jacket, cream inner shirt, navy trousers and brown shoes          | Long waves, neutral expression            |

The complete examples intentionally show several identities. Applying an **Everyday looks** card only changes clothing/colors and clears the rose hairpiece: name, face, skin, hair, expression, artwork/motion version, selected action and direction stay with the current character. Every garment/color remains editable. The detailed `tee` layer is labeled **Soft top**, matching its painted puff sleeves; older artwork keeps its existing tee label.

The independent player's main example now loads Denim daytrip. Wedding, original running and older artwork examples remain accessible.

## Actual application exports

- Outfit lineup: [native size](everyday/lineup-idle-1x.png), [2×](everyday/lineup-idle-2x.png).
- Running lineup: [native size](everyday/lineup-run-1x.png), [2×](everyday/lineup-run-2x.png); [all run key frames](everyday/run-keyframes.png); [neck, sleeve, wrist and waist crops](everyday/connections-3x.png).
- Animations: idle [right](everyday/idle-right.gif) / [left](everyday/idle-left.gif), walk [right](everyday/walk-right.gif) / [left](everyday/walk-left.gif), run [right](everyday/run-right.gif) / [left](everyday/run-left.gif), [action switching](everyday/action-switch.gif).
- [Same-scale idle/walk/run comparison](everyday/idle-walk-run-1x.png).
- Independent playback after closing Studio: [recording](everyday/independent-player.webm), [screenshot](everyday/independent-player.png).
- [Browser/export index](everyday/evidence-index.json), [decoded-file verification](everyday/file-validation.json).

| Portable CharacterPack | ZIP                                                                  |
| ---------------------- | -------------------------------------------------------------------- |
| Denim daytrip          | [Download](../public/samples/everyday/denim-daytrip.character.zip)   |
| Coral afternoon        | [Download](../public/samples/everyday/coral-afternoon.character.zip) |
| Sage weekend           | [Download](../public/samples/everyday/sage-weekend.character.zip)    |
| Ochre traveler         | [Download](../public/samples/everyday/ochre-traveler.character.zip)  |

Each ZIP includes editable configuration, transparent spritesheet, manifest, integration notes and provenance. Extracted copies are also under [`everyday/`](everyday/). Preview backgrounds are neutral and animation is in place; these are not production Gathria scene captures.

## Compatibility and verification

No renderer, generated asset bank, historical preset constant or prior exported pack changed. New examples use `artworkVersion: 6`, `motionVersion: 2`, 192×256 frames, anchor (96,240) and a 1536×1024 sheet. Idle remains 3 seconds, walk 0.8 seconds and run 12 frames at 18 fps. Older configuration versions retain their version; unsupported accessory/motion fields are not injected by applying a look.

This batch passed **259 unit tests, 25 Chromium E2E tests, TypeScript and production build**. New focused browser checks cover all four looks on a customized character, preserved identity/run-left settings, flower removal, further color editing, save/reopen pixel equality, actual ZIP/PNG decoding, legacy field preservation and the everyday player example.

Final evidence checks passed for **4 actual CharacterPack ZIPs / 96 frames, 14 PNGs, 7 GIFs and the complete 20.96-second independent-player recording**. Four outfits × two directions produced **8 Studio-closed running cases**, each showing all 12 run frame IDs and matching exported PNG pixels. Live comparison covers 192×230 pixels above the attachment guide; complete exported RGBA, transparency and bounds are checked separately.

Each ZIP member matches its extracted file, and public examples match the reviewed ZIP bytes. GIF order is checked against quantized source-frame hashes as well as frame count/duration. Idle GIFs last 3000 ms, walk 800 ms, run 670 ms (GIF precision; actual run packs use exact 18 fps). No browser errors, external requests or forbidden editor/generator imports occurred. Final PNG/config bytes match the visually reviewed candidate. See [verification record](everyday/verification-results.json).

Visual review inspected native and integer-zoom outputs, joint crops and the run loop transition. All four looks read as everyday clothing, with no rose hairpiece, veil or boutonniere. Palettes and neck connections remain coherent. This is internal visual review, not user acceptance. Historical milestone test counts are not claimed as new executions.

## Known visual limits

- Coral's moving arms retain small skin-colored waist slivers and blue trim fragments from the generic soft-top layers. These are visible in the supplied crops; this batch does not claim to repair that rig.
- Trousers and shorts can show angular knee/cuff cuts at stronger bends. Existing shoes and hands retain some cutout rigidity.
- The skirt has a blue underskirt and the jackets have a cream inner shirt that do not fully follow the main garment color. These are existing painted material details.
- No backpacks, hats, new clothing silhouettes or pure-profile body artwork were added. The work provides usable combinations of current garments.
- Production Gathria integration and world-speed matching remain unverified. No deployment or merge is part of this batch.

Regeneration commands and validated capture checkpoints are in [the evidence README](everyday/README.md). Source ownership is recorded in [provenance](ASSET_PROVENANCE.md#everyday-outfit-catalog). Keep PR #2 draft and stop for visual review.
