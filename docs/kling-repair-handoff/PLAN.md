# Sprints 46–55: repair candidates and explicit handoff

Baseline: PR #37 merged after both checks passed (`891aaef`). Branch:
`feat/kling-repair-handoff-v9`. Keep accepted Kling bodies, old materials,
source schedules, project contracts and independent exports reproducible.

| Sprint | Deliverable and acceptance |
| --- | --- |
| 46 | Diagnose difficult source poses against actual exports; distinguish ownership/registration faults from missing art. |
| 47 | Try an isolated male sleeve-ownership revision; keep only a visible improvement, preserve protected head/fist pixels and other poses. |
| 48 | Try female inner-waist/hem ownership corrections; at most two visual trials, retain the best prior version when a trial regresses. |
| 49 | Validate imported clothing as an immutable candidate bound to the exact accepted look and inventory. |
| 50 | Compare candidate animation at shared anchors, all actions, directions and native integer zoom without changing the open look. |
| 51 | Explicit apply/discard, safe cancellation and stale-base rejection; applying enters the existing undo/redo flow. |
| 52 | Explicitly carry review issues to a new compatible look; reopen all copied issues and retain origin, never infer visual acceptance. |
| 53 | Reduce repeated atlas decoding in review export with bounded batching; benchmark real inputs and prove unchanged scan/PNG output. |
| 54 | Regress old revisions, protected areas, mixed outfits, save/reopen, handoff and failed imports. |
| 55 | Actual before/after PNG/GIF/pack evidence, independent playback, documented accepted/rejected trials and final draft PR. |

New asset revisions are opt-in. Failed visual trials remain documented rather
than promoted. Source body/head, timing and existing files are never overwritten
for a passing check. Actual art outcomes and functional checks are reported
separately. Recoverable stages are committed and pushed.
