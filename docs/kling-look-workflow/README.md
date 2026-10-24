# Sprints 31–35: try, undo and compare Kling looks

PR #35 was merged first as `aa11f5b` after both remote checks passed. This batch
keeps the approved Kling source, every prior clothing/hair asset and existing
portable formats. It improves trying combinations and reviewing their actual
pixels. No new clothing, hair, face or body artwork is generated in this batch.

## Open and use

Run `npm ci` and `npm run dev`, then open
`/workbench.html?character=male&mode=wardrobe` (or `character=female`).

1. **Find an outfit** searches all named outfits, including older versions that
   are normally collapsed. Cards show actual exported standing pictures with
   the original head. Choosing clothing keeps the current hair and expression.
2. **Undo styling / Redo styling** restores exact clothing, imported materials,
   hairstyles, hair colors and face choices. Action, facing and the current
   playhead are retained. Preview controls do not add undo steps. Failed or
   canceled preparations leave the outfit and its history intact.
3. **Pin current look**, then try another outfit or hairstyle. The pinned/current
   board follows the same source pose and direction. Its common canvas aligns
   both attachment points, including unequal hair padding; it never independently
   scales or recenters the characters. **Replace pinned look** explicitly updates
   that reference. **Compare original** still offers the separate Kling baseline.
4. **Save look comparison PNG** saves a native-size, labeled same-pose board.
   **Download look comparison GIF** saves the entire current action, pinned on
   the left and current on the right, at original timing. Panels mirror in place;
   labels stay readable. One-shot jump remains one-shot. Slow preview playback
   does not slow the export. **Cancel preparation** also cancels GIF generation.
5. **Save wardrobe** remains the portable editable backup. **Export CharacterPack**
   retains all actions for the independent `/player.html` player.

History is session-only, isolated by character, with up to 12 recent steps and
at most 128 MiB of additional retained material buffers per character. Large
artwork can shorten the stack. Snapshots share immutable source/asset data and
do not retain renderer atlases. Undo/redo is committed only after the target
look has passed the existing validation. Saving does not erase history; opening
a saved project starts a new one.

One pinned look is retained in the session. Switching character, opening a saved
project or leaving the page clears it. A pinned reference and undo history are
not added to the saved wardrobe or CharacterPack schema. Save both editable
looks separately if you need them after reloading.

## Actual pictures and comparisons

The [37 native standing PNG downloads](thumbnails/native/) produced the small
outfit cards. Their [index](../../src/wardrobe/outfit-previews/index.json) retains
source, registration, selected material hashes, source pose and the exact
downsampling recipe. Runtime cards refuse stale hashes and imported ID
collisions; a missing valid picture leaves a named choice available.

The final [browser evidence](evidence/evidence-index.json) and
[decoded export audit](export-checks.json) record this batch's production
downloads, exact comparisons to PR #35 and isolated playback after every editor
context closes. The independent player blocks editor/wardrobe modules.

| Character | Same-pose PNG                                                                             | Run comparison                                                                                              | Jump comparison                                                                                               | Standalone packs                                                                                 |
| --------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Male      | [Right](evidence/male-run-right-looks.png) · [Left](evidence/male-run-left-looks.png)     | [Right](evidence/male-run-right-pinned-current.gif) · [Left](evidence/male-run-left-pinned-current.gif)     | [Right](evidence/male-jump-right-pinned-current.gif) · [Left](evidence/male-jump-left-pinned-current.gif)     | [Everyday](evidence/male-day.character.zip) · [Wedding](evidence/male-wedding.character.zip)     |
| Female    | [Right](evidence/female-run-right-looks.png) · [Left](evidence/female-run-left-looks.png) | [Right](evidence/female-run-right-pinned-current.gif) · [Left](evidence/female-run-left-pinned-current.gif) | [Right](evidence/female-jump-right-pinned-current.gif) · [Left](evidence/female-jump-left-pinned-current.gif) | [Everyday](evidence/female-day.character.zip) · [Wedding](evidence/female-wedding.character.zip) |

[Male unequal hair padding](evidence/male-different-padding.png) ·
[Female unequal hair padding](evidence/female-different-padding.png).
These compare different styling choices, not before/after art repairs.

PNG comparisons are cream-matted viewing boards; transparent single PNG and
CharacterPack exports keep the original RGBA. GIF uses a shared 256-color palette
at half native size with centisecond timing. The recorded quantization tolerance
does not apply to the exact PNG/pack regression checks.

## Validation and limitations

[Current tests and source hashes](test-results.json) distinguish this run from
previous batches. The media audit decodes every delivered PNG/GIF/ZIP, matches
comparison panels with their actual packs, checks mirrored body pixels and
unmirrored labels, and verifies saved-project nested assets.

This batch passed TypeScript checking and the production build, 253 full-suite
unit tests plus two additional thumbnail checks, and all 71 Chromium tests.
The production capture finished on 2026-10-24 at 03:22 UTC. After all editor
contexts closed, the independent player passed 40 cases: four packs, five
actions and both directions. Looped actions wrapped and jump returned to idle.
There were no browser errors, failed requests, external requests or requests for
blocked editor/wardrobe modules in the independent player.

The completed content audit passed four CharacterPack ZIPs (368 poses), 54 PNGs,
10 GIFs, two saved projects with nested assets, and eight screenshots. All four
packs' metadata and decoded RGBA match the merged baseline exactly. Every GIF's
frame order, centisecond durations and loop mode match the source action; both
panels match their respective exported packs within recorded palette error.
The repeated asset regression audit also preserves 101 prior archives and four
source files, and checks 280 poses in three current garment banks.

No new claim of improved clothing anatomy is made. Existing source motion blur,
some cuff/armhole/vest seams and frame-to-frame drawing variation remain. The
improvement is an exact, reversible way to inspect and choose existing looks.
Technical verification is separate from user visual acceptance.

The male native comparisons make two existing limits particularly visible:
the small underarm cut on the everyday shirt in run pose 59, and the stepped
shoulder/neck outline in jump pose 102. They are present in the unchanged merged
packs as well. Both looks' heads remain at the same position; the comparison
does not hide those defects with a different scale or crop.
Female run pose 55 also retains a rectangular inner-arm/waist transition and a
dark rear-hair edge near the ear. The unequal-padding board makes these visible;
they require a later art/ownership repair and are not marked resolved here.

The source capture scripts are `scripts/capture-kling-outfit-thumbnails.mjs` and
`scripts/capture-kling-look-workflow.mjs`; verification is
`scripts/verify-kling-look-workflow.py`. Use `CHROMIUM_PATH` for a local Chromium
or install the Playwright browser. Build first, then run capture and verification.
Set `KLING_LOOK_REVIEW_DIR` to a fresh evidence directory to avoid overwriting a
completed capture. `KLING_REVIEW_TEMP` chooses temporary editable project ZIPs;
the default `.review-tmp/kling-look-workflow` is ignored by Git. Their hashes and
reopen checks are retained; saved-source banks and baked packs are committed.
For a separate thumbnail recapture, set `KLING_THUMBNAIL_DIR` and
`KLING_THUMBNAIL_EVIDENCE` to fresh directories as well.
