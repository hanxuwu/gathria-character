# Sprints 56–65: browser paint round-trip and motion continuity

Baseline: merged PR #38, `1ebf62f69ee7fb804503b90d07ea1d67feeebe71`.
Branch: `feat/kling-paint-roundtrip`. Keep approved Kling source pixels,
existing clothing, anchors, action schedules and portable formats unchanged.

| Sprint | Deliverable / acceptance |
| --- | --- |
| 56 | Define a bounded browser import contract for the existing native pose painting kit; bind it to the exact worn material and registration. |
| 57 | Rebuild edited clothing RGB into its original atlas, preserving ownership, alpha, crop offsets and every unedited pose. Reject edits outside the garment. |
| 58 | Support atomic multi-pose imports with per-pose before/after hashes, deterministic output, cancellation and duplicate/overlap guards. |
| 59 | Connect painted ZIPs to the existing isolated candidate preview, explicit apply/discard, undo, editable save/reopen and material download. |
| 60 | Analyze consecutive action positions, repeated holds and loop closure; compare motion changes against the original/pinned look without claiming an automatic aesthetic score. |
| 61 | Add a before/after transition viewer and direct navigation to difficult transitions, retaining shared anchors and left/right parity. |
| 62 | Export an integrity-indexed transition report with exact native PNG pairs and an actual, original-timing comparison GIF. |
| 63 | Exercise malformed archives, stale imports, protected pixels, late-frame failures, canceled work and one-shot boundaries. |
| 64 | Verify the production flow on male/female daily and wedding outfits, measure import/scan cost and keep memory bounded by sequential pose/page processing. |
| 65 | Decode actual downloads, check independent playback after editors close, publish review GIFs, provenance/limits and a new draft PR. |

These are implementation milestones, not calendar estimates. Each completed
stage is committed and pushed. Browser painting accepts RGB corrections inside
existing ownership; new silhouettes and ownership changes still require the
full authoring workflow. No character redraw or automatic fitting is promised.
Functional checks and visual review are reported separately. The current batch
does not silently update any garment or preset and does not merge itself.

## Recorded implementation stages

- **56–59 — `4a757df`:** Added the browser recipe contract and native RGB atlas
  rebuild. Multiple poses validate atomically; every mask/alpha/crop stays fixed.
  New material IDs, per-pose hashes and candidate downloads are available through
  the existing explicit preview/apply/undo workflow. The new unit cases exercise
  identity, edited pixels, deterministic output, late errors and cancellation.
- **60–62 — `9b2706e`:** Added signed premultiplied motion residuals, ordered
  transition inspection, direct seeking, real loop/hold handling and native PNG /
  GIF / hash-indexed evidence export. Measurements do not infer aesthetic approval.
- **63 — `9ce8e3b`:** All 333 unit tests and 79 Chromium tests passed this batch.
  Final candidate-footer layout passed the focused browser flow and production
  build again. Existing stale-candidate and protected-head tests remain passing;
  new browser tests cover atomic late-pose failure, save/reopen and mirrored
  transition exports. No old artwork, catalog or motion files changed.
- **64–65:** Production matrix capture and independent output decoding are the
  final acceptance steps. Results and actual downloadable evidence are recorded
  alongside this plan when those steps finish.
