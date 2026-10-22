# Kling hair and gentle face review

The two approved Kling characters now have optional **Soft crop** and **Soft bob**
hairstyles, **Chestnut / Espresso / Copper** hair colors, and an **Original / Gentle**
face choice in the existing wardrobe. The original face, body and action timing
remain the starting point. Both hairstyles work on either character.

## Open it

Run `npm ci && npm run dev`, open the address Vite prints, choose **Dress Kling
male** or **Dress Kling female**, then use **Hair & face** in the wardrobe controls.
Direct routes are `/workbench.html?character=male&mode=wardrobe` and the equivalent
`character=female` URL. No additional page or runtime image service is required.

Clothes and head choices are independent: **Original** restores the clothes;
**Reset appearance** restores the head. **Save wardrobe** keeps an editable,
self-contained V2 project. **Export CharacterPack** bakes the chosen look for
`/player.html`, where all five actions and both directions remain available.

## What changed

- Two development-time hair design sheets were prepared from the approved
  character references. Only their hair is used. Generated faces, bodies and
  clothes are discarded; new hair is fitted to each original head pose.
- Independent per-frame head registration records skull, eye and mouth guides,
  face ownership and foreground hands. It covers all 88 male / 96 female poses.
- Gentle uses smooth local edits of the original brows, upper eyelids, smile
  corners and cheeks. Original action half-blinks, blinks and laughter are kept.
- Transparent headroom prevents new hair from clipping during the high jump.
  Active looks translate pixels and anchors by (32,128), without scaling the
  character or changing any source frame or duration.
- Real export review found thin hair seams where source skull-edge pixels were
  incorrectly treated as body occlusion. The authored head bounds now include
  the existing two-pixel raster allowance. New hair alone matches the source's
  blur on reviewed fast jump poses; the female crown fit also covers a small
  exposed-scalp edge.
- Editable wardrobe V2 embeds the exact head bank and selections. V1 stays
  original, source-only exports keep their exact bytes, and the consumer still
  reads ordinary baked CharacterPack V2/V3. A sparse-frame PNG compression defect
  found during verification was fixed without changing decoded source artwork.

## Actual application evidence

Final capture and artifact validation are recorded here after the application
exports, project reopen checks and independent playback finish. Source design
sheets in `artwork/` are not substitutes for these results.

## Visual scope and limitations

This is a bounded first head-customization batch, not a complete face editor.
It has no eye-color, face-shape, feature-position or freehand controls. Gentle
is deliberately close to the approved identity; action expressions take priority.
The hairstyles follow registered head poses; there is no secondary hair physics
or new hand-drawn motion. Only short styles are provided.

The original Kling source contains some blurred jump frames, minor outline
fringes and pose-to-pose drawing changes. Source pixels remain intact outside
explicit clothes/head ownership. Source imperfections are not globally repainted.
Existing garment deformation and joint limits are unchanged. First appearance
load includes a checked bank of about 28–30 MB per character and complete pose
preflight; this batch does not claim that all first-load work is instant.

Review GIFs are reduced previews; original PNGs/CharacterPacks retain full
resolution. GIF montages repeat the review sequence, while the exported jump
keeps its original one-shot/recovery behavior. Technical checks are separate
from user visual acceptance. Production Gathria integration remains unverified.

[Asset sources and processing](../../artwork/kling-appearance/README.md) ·
[Format and compatibility](FORMAT.md)
