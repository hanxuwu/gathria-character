# Original sprite action workspace

This batch makes the original Kling sprite frames the main authoring path. It
does not redraw the characters or extend the optional male/female skeletons.

## Open and use

Run `npm ci` and `npm run dev`, open the printed address, then choose **Open
character** in **Character library**. The Workbench opens **Sprite actions**.
Direct entries are `/workbench.html?character=male` and
`/workbench.html?character=female`.

1. Choose Idle, Walk, Run, Jump or Celebrate. Pause, scrub or step through frames.
2. Scroll below the player controls to **Sprite action settings**. Select the
   inclusive start/end positions, action FPS and loop behavior, then apply.
3. Inspect the first/last images at ½×, native 1× or 2×. Undo or reset to the
   original action whenever needed. A preview-speed change is not exported FPS.
4. **Save action project** retains the complete original pack and your settings;
   **Open action project** restores them. Applied settings survive character/tab
   changes within the session. Save before closing or reloading the page.
5. **Export edited CharacterPack**, close the workspace, and load that ZIP in
   `/player.html`. The independent player uses the selected frames and timing.

The separate **Export original CharacterPack** and **Open source player
separately** controls still refer to the original source. They do not publish
the current action edits.

## Actual interface and playback

- [Workbench entry](review/workbench-desktop.png) and
  [action controls](review/workbench-editor-desktop.png).
- [Narrow layout](review/workbench-narrow.png) and
  [narrow action controls](review/workbench-editor-narrow.png).
- [Male first/last inspection](review/male-action-editor.png) and
  [female first/last inspection](review/female-action-editor.png).
- Independent playback after closing the editor:
  [male right](review/male-independent-right.png),
  [male left](review/male-independent-left.png),
  [female right](review/female-independent-right.png),
  [female left](review/female-independent-left.png).

The evidence deliberately changes **Run to source positions 2–6 at 12 FPS,
once** to exercise metadata and persistence. This five-frame excerpt is a
workflow test, not a proposed replacement running cycle. Default playback
continues to use all original action settings. Screenshots show real browser
output; continuous playback and stopping/replay behavior are checked by the
browser tests and recorded in the evidence index.

## Portable examples and original characters

The actual male/female edited project, edited pack and reset pack downloads were
fully decoded and checked. Their original native PNG pages remain byte-exact.
These six large downloads are not duplicated in Git: their hashes, settings and
metadata are retained in [evidence-index.json](review/evidence-index.json),
[male settings](review/male-project-document.json) and
[female settings](review/female-project-document.json). Reproduce the downloads
with the steps above or `node scripts/verify-sprite-actions.mjs`; use a fresh
`EVIDENCE_PHASE` when rerunning to preserve previous evidence.

The unchanged complete originals remain downloadable:
[Kling male](../kling-jump/exports/male.character.zip) ·
[Kling female](../kling-jump/exports/female.character.zip).

Two smaller actual UI downloads are included to demonstrate the file formats:

- [Self-contained action project](review/imported-v2-stills.sprite-project.zip)
- [Edited CharacterPack](review/imported-v2-stills.character.zip)

These use the existing **female V2 skeletal stills fixture**, with the run hold
set to 2 FPS. They demonstrate portability and missing-action handling, not a
new animated character. Jump remains unavailable in that fixture.

## This batch's checks

Executed in this session on 2026-10-21:

- **119 unit tests passed**, including actual male/female V3 atlas-byte
  preservation, V2 repeated/nonsequential frame IDs, archive validation,
  deterministic project save/reopen and exact source ZIP restoration.
- **21 Chromium cases passed in the full suite**, then **1 additional focused
  Chromium case passed** for rejected metadata changes/imports preserving the
  accepted session. The final CSS-only button spacing/font adjustment was
  inspected through the actual desktop/narrow browser capture.
- TypeScript and final production build passed.
- Actual UI evidence: **8 ZIP downloads** validated, including nested ZIP CRC,
  nonempty members, JSON decoding and full PNG decoding. Original atlas bytes,
  frame rectangles, anchors and source mappings were preserved.
- **6 independent playback cases** after editor closure: male/female in both
  directions, plus the existing V2 stills fixture in both directions. No
  authoring/skeletal modules or external APIs were requested by the independent
  player.
- **12 screenshot PNGs** decoded. At desktop 1440 px and narrow 390 px, the
  document and embedded player had no horizontal overflow. Large endpoint
  images scroll inside their inspection panel.
- [Preservation audit](source-preservation.json): **496 existing files** match
  their baseline Git blobs, including artwork, review/export assets, Kling JSON
  records and the complete skeletal implementation.

[Command results](verification-results.json) ·
[Actual UI export and playback evidence](review/evidence-index.json).
Earlier review folders contain historical results, not additional tests run for
this batch.

## Limits and visual review

The inspected character faces, proportions, shading and alpha are the existing
source frames. No artistic quality improvement or user acceptance is claimed.
The source has frame-dependent pose/shape changes; adjusting FPS cannot repair
them. A poorly chosen range can still produce a loop seam. The endpoint view
helps identify it without modifying the image.

Editing is limited to contiguous ranges and uniform FPS within existing actions.
No arbitrary reordering, per-frame duration/offset, raw PNG import, interpolation,
appearance changes or new skeletal animation is included. The original large
native atlas decode cost remains; this is not a mobile performance optimization.

The [persistence/export contract](../SPRITE_ACTIONS_REVIEW.md) documents source
binding, format compatibility and limits. This branch is stacked on the female
candidate in PR #22; both remain unmerged until review.
