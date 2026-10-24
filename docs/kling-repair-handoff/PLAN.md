# Sprints 46–55: repair candidates and explicit handoff

Baseline: PR #37 merged after both checks passed (`891aaef`). Branch:
`feat/kling-repair-handoff-v9`. Keep accepted Kling bodies, old materials,
source schedules, project contracts and independent exports reproducible.

| Sprint | Deliverable and acceptance                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 46     | Diagnose difficult source poses against actual exports; distinguish ownership/registration faults from missing art.                   |
| 47     | Try an isolated male sleeve-ownership revision; keep only a visible improvement, preserve protected head/fist pixels and other poses. |
| 48     | Repair female crossing-arm/bodice blending after diagnosing the apparent waist fault; preserve existing hem and waist improvements.   |
| 49     | Validate imported clothing as an immutable candidate bound to the exact accepted look and inventory.                                  |
| 50     | Compare candidate animation at shared anchors, all actions, directions and native integer zoom without changing the open look.        |
| 51     | Explicit apply/discard, safe cancellation and stale-base rejection; applying enters the existing undo/redo flow.                      |
| 52     | Explicitly carry review issues to a new compatible look; reopen all copied issues and retain origin, never infer visual acceptance.   |
| 53     | Benchmark bounded batching, reject it when slower, and retain exact-input completed-scan reuse without additional image buffers.      |
| 54     | Regress old revisions, protected areas, mixed outfits, save/reopen, handoff and failed imports.                                       |
| 55     | Actual before/after PNG/GIF/pack evidence, independent playback, documented accepted/rejected trials and final draft PR.              |

New asset revisions are opt-in. Failed visual trials remain documented rather
than promoted. Source body/head, timing and existing files are never overwritten
for a passing check. Actual art outcomes and functional checks are reported
separately. Recoverable stages are committed and pushed.

## Recorded outcomes

- **46–48:** Localized the male pose 59 sleeve notch and female poses 55/63
  crossing-arm strips. Three additive garment revisions retain all other poses.
  Each accepted asset needed one visual trial; provenance, recipes and independent
  archive guards are committed in `8b17e4d` and `e6f0044`.
- **49–52:** Candidate validation, separate animation preview, explicit
  apply/discard with undo and reopened review-note handoff are in `d80e995`.
  A focused browser check caught an undo-history omission; it was fixed before
  that commit. All three new end-to-end tests pass.
- **53:** Batching produced identical output but was 22.4% slower in the paired
  benchmark. It was rejected, with measurements and patch preserved in
  `e6f0044`. The shipped scalar scan reuse avoids repeating a completed scan only
  while its exact inputs still match; no general latency promise is made.
- **54:** This batch ran 309 unit tests and 76 Chromium end-to-end tests, all
  passing, plus TypeScript, the production build and read-only asset guards.
  These counts are new executions, not inherited validation claims.
- **55:** Production capture and independent decoding are recorded in
  [the delivery report](README.md), with actual downloaded GIFs, PNGs and packs.
  The new branch is delivered through a draft PR; only the preceding PR #37 was
  merged as requested.
