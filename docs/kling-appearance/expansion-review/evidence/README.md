# Actual application capture workflow

This directory holds fresh browser downloads for the two-style expansion, kept
separate from the earlier ear repairs. `baseline` opens retained real saved
projects with their embedded banks and exports the two established hairstyles
at frame 0. It does not generate or replace a bank.

Run after the accepted banks and catalog are finalized:

```sh
EXPANSION_RUN=final-male EXPANSION_CHARACTER=male CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-kling-appearance-expansion.mjs
EXPANSION_RUN=final-female EXPANSION_CHARACTER=female CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-kling-appearance-expansion.mjs
python scripts/render-kling-appearance-expansion.py --runs final-male final-female
```

A new run name is required if a capture fails or an artwork iteration changes;
the harness does not overwrite a previous evidence index. It reads available
frame IDs and style names from actual manifests. The new style IDs are
`side-part` (male) and `tucked-bun` (female).

Each final role capture exercises:

- The new style is visible on first opening, before loading an older style.
- Original, both retained styles and the new style, same frame and original face.
- Chestnut, Espresso and Copper with Original/Gentle faces, standing/crouching.
- Everyday/Wedding, all five actions, both directions and selected difficult poses.
- Saving and reopening the exact hair, face, color, clothing and action/direction.
- One complete CharacterPack, including every selected source frame and unchanged timing.
- Closing the editor before independently loading and playing the exported pack
  through all five actions and both directions, with authoring modules blocked.

Large editable projects are downloaded and validated under `/tmp`; their hashes,
embedded source/bank checks and captured paths are recorded. One full independent
CharacterPack per role is retained here. The rendering script decodes PNGs,
archives and every GIF frame, verifies timing and mirrors, checks original RGBA
outside selected appearance/clothing ownership, and compares old-style frame-0
pixels against the fresh baseline downloads. Baseline source frames are padded
by (32,128) for aligned review only; their pixels are never rescaled or warped.

Technical checks and review images do not constitute user visual approval.

After the checked lineups have refreshed the style thumbnails, capture only the
final interface without exporting the large packs again:

```sh
EXPANSION_RUN=post-thumbnail-ui node scripts/capture-kling-appearance-expansion.mjs --ui-only
python scripts/render-kling-appearance-expansion.py --attach-ui-only --ui-run post-thumbnail-ui
```

This separate index verifies the six thumbnail images load, stores their exact
file hashes, and records the selected new style on desktop and mobile. The two
full workflow indexes remain the source for export and independent-playback
claims; the UI-only run does not repeat them.

## Completed capture in this batch

Both `final-male` and `final-female` passed using the final catalog banks. Each
records 54 real downloads: 52 transparent PNGs, one editable project and one
independent CharacterPack. Across the two roles, 20 independent action/direction
playbacks passed after the editors closed; no selected frame position was absent
from the observation windows. The largest adjacent observation gap was 72.6 ms
(male) / 86.4 ms (female). These are browser scheduling observations, not a claim
that every display refresh occurred at exactly 24 FPS.

The renderer checked all 184 native exported frames outside selected garment,
hair and face ownership, exact source action order/timing/anchor, transparent
outer frame boundaries, 20 actual PNG mirror pairs, and unchanged RGBA for all
four old-style frame-0 comparisons. The four baseline PNGs are separate from the
final captures and remain in `baseline` with their original embedded bank hashes.

`post-thumbnail-ui` adds four desktop/mobile screenshots and checks all six
actual thumbnail files loaded; it performs zero further downloads or pack
exports. Both mobile layouts have no horizontal document overflow at 390 px.

The final artifact index covers 146 decoded images: 104 downloaded PNGs, 20
native/integer-scale comparison boards, six GIFs and 16 screenshots. Each native
ear-run GIF has 16 frames / 670 ms and uses one fixed crop throughout the run.
The five-action GIFs contain 88 male / 96 female encoded frames, each 5,080 ms;
consecutive identical source holds are combined without changing their duration.
Native CharacterPack action metadata remains authoritative.

These results are fresh workflow/export checks for the new hairstyles. Earlier
ear-repair tests are not counted here. Independent visual findings and remaining
source-edge limitations are recorded separately in the batch visual review.
