# Kling expressions and Midnight sailor shirt

This batch adds **Joyful** alongside the existing Natural and Gentle expressions
for both Kling characters, plus one reusable male **Midnight sailor shirt**.
The character source artwork and original action clocks remain the baseline.
Implementation: `feat/kling-expressions-shirt`, based on main
`ce4c38e82381a128e242e18c7296f647bad1ac54`. The separate Source pixel draft is not
part of this branch.

## Try it

Open `/workbench.html?character=male&mode=wardrobe`, or use `character=female`.
Under **Hair & face → Face expression**, choose **Natural (original)**,
**Gentle smile**, or **Joyful**. Existing hairstyle and hair-color choices still
work independently of clothes. Natural and Gentle keep their existing artwork.
Joyful uses the original character's painted laughter mouth, with registered
brow/cheek treatment; original eye blinks and celebration laughter are retained.
These are expression treatments over the source animation, not three frozen
faces or a general facial-animation editor.

Older saved projects keep their embedded banks. Use **Preview updated appearance**,
save a separate updated copy and reopen it to access Joyful; loading an old
project does not upgrade it silently.

For the male shirt, search **Find an outfit → Midnight sailor**, or select
**Top → Midnight sailor shirt** and mix trousers. The new design has a navy
pullover front, ivory sailor collar, short tie and inset sleeve stripes. It uses
the reviewed short-sleeve cut; it is a new painted design, not a new sleeve cut.

## Review actual exports

- [Review gallery](review/index.html)
- Three expressions, matching right-run clocks: [male](review/male-expressions-run-right.gif) · [female](review/female-expressions-run-right.gif)
- Same-frame faces: [native](review/expression-faces-1x.png) · [integer 2x](review/expression-faces-2x.png)
- New shirt: [left/right run](review/midnight-sailor-run-both-directions.gif) · [keyframes](review/midnight-sailor-keyframes.png)

Review panels are assembled from actual application PNG/GIF downloads. Their
index records inputs, hashes, sizes and timing. Authoring prototypes elsewhere
are labeled offline and are not application evidence. GIFs use the application's
half-native matte presentation and centisecond timing; exported CharacterPack
PNGs retain native transparent pixels and exact 24 FPS schedules.

The main expression matrix deliberately uses the retained **Everyday/Wedding**
preset versions for compatibility. Exact garment IDs are recorded. A separate
supplement covers the current recommended soft/curved-cuff and smooth-waist
presets; old preset comparisons must not be labeled the latest clothing fixes.

Current recommended outfit runs with Joyful:
[male everyday](evidence/recommended-v1/male-day-soft-cuff-joyful-run-right.gif) ·
[male wedding](evidence/recommended-v1/male-wedding-curved-cuff-joyful-run-right.gif) ·
[female everyday](evidence/recommended-v1/female-day-smooth-waist-joyful-run-right.gif) ·
[female wedding](evidence/recommended-v1/female-wedding-smooth-waist-joyful-run-right.gif).
Their separate [capture](evidence/recommended-v1/evidence-index.json) and
[audit](recommended-artifact-validation.json) cover 12 PNGs and four GIFs;
they do not add another set of exported packs or saved projects.

### Download and reopen

The packs below were exported after reopening their saved projects. Close the
workbench and load a pack in the independent player. These are the main matrix's
retained compatibility outfits, plus the new sailor shirt.

| Look | Independent CharacterPack | Editable wardrobe project |
| --- | --- | --- |
| Male everyday, Joyful | [Download](evidence/final-v1/male-day-joyful.character.zip) | — |
| Male wedding, Joyful | [Download](evidence/final-v1/male-wedding-joyful.character.zip) | — |
| Male Midnight sailor, Joyful | [Download](evidence/final-v1/male-midnight-sailor-joyful.character.zip) | [Reopen and edit](projects/male-midnight-sailor-joyful.wardrobe.zip) |
| Female everyday, Joyful | [Download](evidence/final-v1/female-day-joyful.character.zip) | — |
| Female wedding, Joyful | [Download](evidence/final-v1/female-wedding-joyful.character.zip) | [Reopen and edit](projects/female-wedding-joyful.wardrobe.zip) |

All five projects were reopened and checked. Two editable downloads are retained
here as exact copies of the browser downloads; [their hashes](delivered-projects.json)
match the original capture records. The other three temporary validation projects
are not included as downloadable deliverables.

## Artwork and preservation

- [Expression authoring, prototypes and all-184-pose checks](../kling-expression/README.md).
  Eight new bank copies append one Joyful layer. Existing styles, atlas PNGs,
  registrations and padding remain exact; all old bank files remain available.
- [Shirt source and provenance](../../artwork/kling-expression-shirt/source/shirt/README.md).
  The development-time image-generation edit supplies clothing artwork only.
  Generated faces, skin, body and trousers are discarded. The registered shirt
  uses the existing clothing ownership and alpha on all 88 male source poses.
- [Shirt iterations](../../artwork/kling-expression-shirt/prepared/shirt/ITERATIONS.md).
  Initial collar/tie chips and cuff fraying were corrected by tracing donor cloth
  accurately and moving the sleeve trim inside its existing clothing boundary.
- [Baseline preservation](baseline-preservation.json): 63 retained files remain
  byte-identical; the catalog is the one intentional change among 64 recorded
  baseline files. No runtime image service, skeleton replacement or action
  retiming is introduced.

The browser painting-kit roundtrip was intentionally a **zero-pixel-change**
validation of the accepted new design. It verified native pose kits, import,
candidate application and saving a reusable garment; it is not presented as an
additional artistic correction. The actual saved garment is
[midnight-sailor-v1.zip](../kling-wardrobe/garments/male/midnight-sailor-v1.zip).
Its successful record is [shirt-final-v2](evidence/shirt-final-v2/evidence-index.json).
The first attempt remains recorded; its sole terminal failure was a missing
favicon diagnostic after the garment workflow had completed.

## Validation and limits

This batch's [verification record](verification.json),
[independent export audit](artifact-validation.json) and [test logs](logs/)
separate technical checks from visual review. Fixture browser tests establish
workflow behavior; real downloads and player runs establish shipped-art behavior.
Saved-project verification uses exact source, material and bank hashes, with
same-frame canvas equality after reopening. Independent playback follows editor
closure, with authoring-module requests disallowed.

The main capture provides 104 native PNGs, 24 GIFs, five CharacterPacks and five
exact project reopens. The independent audit reconstructed all 456 pack frames
byte for byte and checked 50 playback cases across five actions and both
directions. The recommended-outfit supplement adds 12 PNGs and four GIFs.

Final local checks passed: **398 unit tests across 40 files**, 30 targeted
Chromium workflow tests, and the production build. The first remote CI run found
a missing outfit thumbnail and a slow cache-budget test. The thumbnail now comes
from a separately recorded [development-server UI export](evidence/thumbnail-v1/capture-report.json);
all 37 prior preview rows and 74 PNGs remain exact. The budget test still checks
all 387,360 combinations against unchanged limits, with aggregate assertions.
The final build includes the new thumbnail. This narrow UI addition does not
change the character renderer or the production artwork previously captured.

The new mouth is slightly sharper than the most motion-blurred source features
on a few fast jump frames. The sailor collar/shoulder fit retains the existing
source-bound cut and is not a freely deforming cloth model. Gentle remains a
subtle expression. Original celebration laughter is intentionally identical
between states. Existing source anatomy and clothing deformation limitations
are not claimed solved, and technical checks do not constitute user visual
acceptance. Full skeletal animation, freeform face editing and pixel-theme
conversion remain outside this batch.

## Reproduce

Use the Python environment described in `scripts/requirements-kling-wardrobe.txt`.
The expression append script uses frozen prior bank references in its release
index after publication; the shirt preparation retains its exact generated donor.
Run the authoring and independent asset-check scripts before publication.

`scripts/publish-kling-expression-shirt.py --expressions-only` updates just the
eight appearance entries while preserving every existing outfit. Build, then
use `scripts/capture-kling-expression-shirt.mjs --shirt-roundtrip --run <fresh-id> --shirt-output /tmp/<fresh-id>-shirt.zip`
to obtain the actual reusable shirt download. Publish that exact garment with
`scripts/publish-kling-expression-shirt.py`, then rebuild and capture final looks.
Use a fresh run directory and `--temp /tmp/kling-expression-shirt-<fresh-id>` for
large temporary editable projects. Existing evidence is never overwritten.

The complete independent re-audit needs all five temporary project downloads and
the matching captured production build, in addition to the retained exports.
Only two project copies are delivered here. To repeat the whole audit later,
make a fresh complete capture and retain its build and temporary projects until
verification finishes. The main capture's exact helper is preserved in
`evidence/final-v1/capture-script.mjs`; its compiled-file hashes identify the
historical build, rather than whichever build happens to be installed later.
