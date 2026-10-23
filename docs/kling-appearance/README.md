# Kling hair and gentle face review

**Current correction:** [male ear overlap](ear-overlap-review/README.md) restores
the bob's missing rear strand and fits the front hair over the upper ear. Actual
before/after exports retain the original face, ear, body and motion. Male bank
content is revision 4; female revision 3 is unchanged.

**Previous batch:** [appearance workflow and motion review](stability-review/README.md)
adds real-export style cards, named color swatches and explicit preview/save-copy
updates for old projects. Content revision 3 fixes fine rectangular hair seams
without changing the original face or any atlas PNG bytes.

**Previous correction:** [hair/ear-edge review](ear-edge-review/README.md) follows
the original ear during crouching and removes donor-skin edge residue. The
first-batch artifacts below remain as the earlier baseline; the correction's
page contains that revision's exports and matched before/after comparisons.

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

All previews below are decoded from actual application downloads. Each GIF shows
the original beside the edited character at matching placement and 0.5x scale,
through idle, walk, run, jump and celebrate. The PNG detail boards retain native
pixels or use integer enlargement. Source design sheets are not implementation
evidence.

| Look            | Right / left animation                                                                                      | Independent CharacterPack                                                | Editable V2 project                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Male everyday   | [Right](review/male-day-five-actions-right.gif) / [Left](review/male-day-five-actions-left.gif)             | [ZIP](review/evidence/final-male/exports/male-day.character.zip)         | [ZIP](review/evidence/final-male/exports/male-day.wardrobe.zip)         |
| Male wedding    | [Right](review/male-wedding-five-actions-right.gif) / [Left](review/male-wedding-five-actions-left.gif)     | [ZIP](review/evidence/final-male/exports/male-wedding.character.zip)     | [ZIP](review/evidence/final-male/exports/male-wedding.wardrobe.zip)     |
| Female everyday | [Right](review/female-day-five-actions-right.gif) / [Left](review/female-day-five-actions-left.gif)         | [ZIP](review/evidence/final-female/exports/female-day.character.zip)     | [ZIP](review/evidence/final-female/exports/female-day.wardrobe.zip)     |
| Female wedding  | [Right](review/female-wedding-five-actions-right.gif) / [Left](review/female-wedding-five-actions-left.gif) | [ZIP](review/evidence/final-female/exports/female-wedding.character.zip) | [ZIP](review/evidence/final-female/exports/female-wedding.wardrobe.zip) |

| Review                                    | Male                                                                                           | Female                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Both hairstyles and face choices          | [Lineup](review/male-appearance-lineup.png)                                                    | [Lineup](review/female-appearance-lineup.png)                                                      |
| Face and hairline detail                  | [1x](review/male-face-detail-1x.png) / [2x](review/male-face-detail-2x.png)                    | [1x](review/female-face-detail-1x.png) / [2x](review/female-face-detail-2x.png)                    |
| Three hair colors                         | [Native](review/male-hair-colors-1x.png)                                                       | [Native](review/female-hair-colors-1x.png)                                                         |
| Five-action keyframes, native size        | [Everyday](review/male-day-keyframes-1x.png) / [Wedding](review/male-wedding-keyframes-1x.png) | [Everyday](review/female-day-keyframes-1x.png) / [Wedding](review/female-wedding-keyframes-1x.png) |
| Same-frame seam and jump-fit corrections  | [Comparison](review/male-iteration-comparison.png)                                             | [Comparison](review/female-iteration-comparison.png)                                               |
| Actual wardrobe UI                        | [Screenshot](review/evidence/final-male/male-day-workbench.png)                                | [Screenshot](review/evidence/final-female/female-day-workbench.png)                                |
| Independent player after closing wardrobe | [Screenshot](review/evidence/final-male/male-day-independent.png)                              | [Screenshot](review/evidence/final-female/female-day-independent.png)                              |

## Verification performed in this batch

- **209 unit tests**, TypeScript checking and the production build passed. The
  built appearance-bank files were also checked against the final bank hashes.
- **8 Chromium workflow tests** passed: two appearance tests and six existing
  wardrobe regressions, including lazy loading, failed-load rollback, independent
  clothes/head resets, editable save/reopen and portable export.
- Actual browser captures downloaded **48 PNGs, 4 V2 projects and 4
  CharacterPacks**. The projects were reopened. After the wardrobe was closed,
  independent playback passed **40 combinations**: two characters, two outfits,
  five actions and two directions. Every action frame position was observed.
- All **368 exported character frames** preserve exact original RGBA outside
  selected garment, hair and inner-face ownership, including invisible RGB.
  Original animation sequences and timing remain unchanged. Two separately
  downloaded female left-facing PNGs exactly match the corresponding mirrored
  right-facing outputs.
- All ZIP entries passed integrity checks and all downloaded PNGs decoded.
  The **8 GIFs and 14 review PNGs** were decoded and checked. Each GIF lasts
  **5,080 ms**, with 88 male or 96 female frames; durations use cumulative
  centisecond rounding while CharacterPacks retain source timing.

Machine-readable records: [artifact validation](review/artifact-validation.json),
[male browser capture](review/evidence/final-male/evidence-index.json),
[female browser capture](review/evidence/final-female/evidence-index.json).
Capture records include input hashes and the commit present at capture; earlier
iteration captures are retained separately from the `final-*` results. Playback
reported no application errors, external requests or editor-module imports.
The only console error was a missing favicon; the longest observed frame
scheduling interval was 109.5 ms, so this does not claim perfect realtime timing.

Visual review covered all 184 head poses, with native detail checks for the
hairline, ears, raised-hand occlusion, jump blur and original closed-eye/laughing
expressions. Thin seams and the exposed female crown edge improved in the saved
same-frame comparisons. These checks are our review, not user visual acceptance.

To reproduce without overwriting the saved capture records:

```sh
APPEARANCE_RUN=repeat-male APPEARANCE_CHARACTER=male node scripts/capture-kling-appearance.mjs
APPEARANCE_RUN=repeat-female APPEARANCE_CHARACTER=female node scripts/capture-kling-appearance.mjs
python scripts/render-kling-appearance-review.py --run repeat
```

The capture script starts its own Vite server and launches Chromium from
`/usr/bin/chromium` (or `CHROMIUM_PATH`). Install the Python dependencies in
`scripts/requirements-kling-wardrobe.txt` for the review renderer. The renderer
updates the top-level review boards and validation report from the selected
captures; retain those changes as a new review if rerunning.

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
