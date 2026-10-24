# Sprints 46–55: local clothing repairs and explicit candidate handoff

PR #37 was merged after its two remote checks passed. This batch adds three
opt-in clothing revisions, a safe imported-clothing preview and explicit review
issue handoff. Existing looks, source drawings, shared anchors and action timing
remain reproducible. These are small repairs to existing materials, not three
newly generated outfits or a replacement character.

## Try the revisions

Open `/workbench.html?character=male&mode=wardrobe` or `character=female`.
The current recommended outfits remain available with their existing materials.
Choose an individual piece to use a repair:

| Character | Existing look to start from | New piece                                                         | Actual change                                                                         |
| --------- | --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Male      | Everyday soft cuff          | Top: **Teal joined sleeve** (`teal-camp-shirt-v5`)                | Source run pose 59: remove the triangular exposed-skin notch in the sleeve boundary.  |
| Female    | Everyday smooth waist       | Full body: **Coral reviewed arm join** (`coral-daydress-v9`)      | Source run poses 55/63: remove rectangular sash-color strips at the crossing forearm. |
| Female    | Wedding smooth waist        | Full body: **Ivory reviewed arm join** (`ivory-wedding-dress-v9`) | The same two arm/bodice blend corrections, retaining the bridal skirt.                |

Older saved projects keep their embedded originals; no revision is substituted
on reopen. Existing preset thumbnails and recommended selections stay intact.
The new pieces are also registered in the garment catalog, with ZIP files in
the source/provenance directories linked below.

## Preview imported clothing before applying

Use **Preview imported clothing** next to **Add clothing file**. Choose a
registered material ZIP for this character. The app validates the exact source,
registration, item identity, all poses and protected regions before presenting a
separate comparison dialog. **Add clothing file** retains its previous behavior
of adding an item to the inventory without selecting it.

In the candidate dialog, switch among idle/walk/run/jump/celebrate, choose either
direction, scrub, play, or inspect at native 1×/2×. Both drawings share the same
source pose and anchor; changing the dialog does not alter the main outfit or
its saved motion settings. **Save candidate comparison PNG** exports the actual
comparison. **Discard clothing candidate** restores the accepted session.
**Apply clothing candidate** performs another exact-base check and enters the
normal undo/redo history. Saving/reopening and CharacterPack export keep using
existing formats.

The guard covers unused inventory too: an older preview cannot erase clothing
imported since it was prepared. A changed source, selected artwork, appearance
bank or inventory makes a candidate stale. A conflicting ID must be given a new
material ID rather than silently overwriting an old revision. Cancellation,
leaving the workspace and character changes invalidate pending work.
Existing import limits still apply: a material ZIP is at most 64 MiB, and a
project holds at most 16 items / 128 MiB. Review-note JSON is limited to 1 MiB,
with at most 2,000 characters per note.

## Carry issues forward for another visual check

In **Open look review**, export the old look's notes first. After applying a new
revision, choose **Preview issues from another look** and load that notes JSON.
The preview identifies the source and target look hashes. **Copy issues as open**
explicitly copies the issues while retaining existing target notes. Every copied
issue becomes open, including previously resolved issues; no visual acceptance
is inherited. Different characters/registrations, invalid poses, duplicate IDs
and combined lists above 100 issues are rejected atomically.

**Export issue handoff** saves a separate lineage JSON containing the old and new
look identities and original issue states. This button exposes the latest handoff
in the current session, not a cumulative history. Export it before closing or
reloading. The copied review notes themselves persist through the existing local
review storage; wardrobe projects still contain artwork and settings, not review
notes. Storage errors are reported and portable export remains available.

## Why these repairs work

The male notch was an ownership boundary ending in a sharp wedge. A local
registration adjustment continues the existing sleeve edge, reusing nearby cloth
pixels. Only 671 displayed pixels in pose 59 change; 217 previously exposed upper-
arm pixels become cloth. The body alpha silhouette and protected head/fist pixels
are exact, and 87 other poses are unchanged. This does not claim that every visible
skin pixel is unchanged—the 217 pixels are intentionally covered by the sleeve.
[Male source, recipe, trial and audited limits](../../artwork/kling-repair-handoff/male/README.md).

The female strip came from V2's bodice-join routine: in crossing-arm poses, it
mistook the forearm occlusion edge for the waist hem, bringing sash/skirt colors
up into the bodice. V9 restores existing V1 garment RGB only inside that erroneous
blend domain. Each dress changes 451 pixels in pose 55 and 320 in pose 63; all ownership
and alpha values, protected areas and the other 94 poses are exact. The V8 waist
and skirt repairs remain. No new face, body or clothing drawing is generated.
[Female source, recipe, trial and audited limits](../../artwork/kling-repair-handoff/female/README.md).

Offline diagnostic images in `artwork/` are explicitly distinct from the actual
application downloads below. One visual trial was needed for each accepted repair.

## Export performance: measured outcomes

A proposed bounded image-batching optimization was rejected. In a paired real
female run benchmark it took 21.24 s on average versus 17.36 s for the original
scan+sheet pipeline, despite fewer look switches and identical output. The
original algorithms and memory behavior were restored; the rejected patch and
measurements remain reviewable.

The shipped optimization retains only a completed scan's scalar metrics. When
comparison object, action and threshold still match, exporting a review bundle
reuses that scan instead of repeating it. Relevant input changes invalidate the
cache. This avoids a measured 7.34–10.82 s scan stage for that specific workflow;
it is not a promise that every export or first load is faster. No extra full-frame
cache is retained. [Measurements and rejected experiment](performance/README.md).

## Actual review downloads

| Look            | Run right / left                                                                                                    | Jump right / left                                                                                                     | Difficult-pose detail                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Male everyday   | [Right](evidence/male-day-run-right-comparison.gif) · [Left](evidence/male-day-run-left-comparison.gif)             | [Right](evidence/male-day-jump-right-comparison.gif) · [Left](evidence/male-day-jump-left-comparison.gif)             | [Pose59](evidence/male-day-pose-59-detail-3x.png)                                                                 |
| Female everyday | [Right](evidence/female-day-run-right-comparison.gif) · [Left](evidence/female-day-run-left-comparison.gif)         | [Right](evidence/female-day-jump-right-comparison.gif) · [Left](evidence/female-day-jump-left-comparison.gif)         | [Pose55](evidence/female-day-pose-55-detail-3x.png) · [Pose63](evidence/female-day-pose-63-detail-3x.png)         |
| Female wedding  | [Right](evidence/female-wedding-run-right-comparison.gif) · [Left](evidence/female-wedding-run-left-comparison.gif) | [Right](evidence/female-wedding-jump-right-comparison.gif) · [Left](evidence/female-wedding-jump-left-comparison.gif) | [Pose55](evidence/female-wedding-pose-55-detail-3x.png) · [Pose63](evidence/female-wedding-pose-63-detail-3x.png) |

Playable after packs: [male everyday](evidence/male-day-after.character.zip),
[female everyday](evidence/female-day-after.character.zip),
[female wedding](evidence/female-wedding-after.character.zip).
The before-pack bytes come from the retained prior delivery and are labeled
historical in the record; before/after same-frame PNGs are freshly exported this
batch. Detail boards are cropped from decoded actual packs with identical
rectangles and 3× nearest-neighbor scaling, without repainting.

[Production capture](evidence/evidence-index.json) ·
[Decoded export checks](export-checks.json) ·
[This batch's verification](verification.json) · [Ten-sprint plan](PLAN.md).
Editable project ZIPs are temporary validation files; their hashes and reopen
results are recorded. Source material ZIPs, recipes, actual packs and provenance
remain committed and recreatable.
The complete decoder also checks those temporary project ZIPs. On a clean clone,
rerun the production capture before that full check; the recorded result alone
is not a claim that temporary project bytes are included in this repository.

## Checks executed in this batch

- TypeScript and production build passed; 309 unit tests and 76 Chromium
  end-to-end tests passed. The three new browser tests cover candidate isolation,
  discard/apply/undo and explicit review-issue handoff.
- Read-only asset checks cover the retained legacy bank and all three newly
  published revisions. These are separate from actual application export checks.
- The production app downloaded 60 frame PNGs, 30 native comparison PNGs,
  12 run/jump comparison GIFs and three new CharacterPacks. An independent
  decoder verified PNG pixels, GIF frame order/durations/loop metadata, mirrored
  directions, nested ZIP contents and the three temporary saved projects.
- All 280 before/after pose pairs were compared. Only the five reviewed cases
  change: male pose 59, plus poses 55/63 for each dress. The other 275 poses are
  RGBA-identical; alpha, anchors, frame layout and animation timing stay exact
  for every pose. Five 3× detail boards use decoded actual pack pixels.
- After every editor context closed, all three exported packs played five
  actions in both directions: 30 standalone checks with no editor-module,
  external-network, failed HTTP or runtime errors. Save/reopen and undo/redo
  preserve the accepted pixels and main motion settings.

The implementation was captured at `8b17e4d`; later commits add verification
scripts, reports and documentation. The decoder rechecked every captured
application/test/configuration source hash against the final working files.

## Remaining limits

The male jump pose 102 shoulder/neck stair-step, unrelated wedding crouch cuffs,
source motion blur, some ear/hair edges and remaining bodice/skirt drawing-style
differences are not fixed here. The repaired poses still use the original source
movement. The separate skeletons are unchanged. Technical checks and the agent's
visual review are separate from the user's final visual acceptance.

To recapture, build first, then run `scripts/capture-kling-repair-handoff.mjs`
and `scripts/verify-kling-repair-handoff.py`. Set `KLING_REPAIR_REVIEW_DIR` for
both commands to a fresh folder such as `docs/kling-repair-handoff/recapture/evidence`,
and `KLING_REVIEW_TEMP` for capture to a fresh temporary folder. Do not overwrite
a completed capture. Chromium and Python image dependencies are required. The
asset-only male/female verification scripts read and validate the shipped
archives without regenerating them.
