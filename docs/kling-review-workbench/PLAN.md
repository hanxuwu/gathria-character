# Sprints 36–45: reproducible wardrobe review

Baseline: PR #36 merged after both remote checks passed; new branch
`feat/kling-review-workbench-v8`. Preserve all original drawings, schedules,
clothing revisions, editable projects and CharacterPack formats.

| Sprint | Goal                                   | Acceptance                                                                                                                                      |
| ------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 36     | Exact review identity                  | Source, registration and selected artwork hashes; preview changes do not change identity; custom revisions do.                                  |
| 37     | Frame-specific review records          | Issues identify action, source pose, direction, body area, severity and resolution. Invalid references rejected.                                |
| 38     | Portable, persistent review notes      | Bounded strict JSON; local storage recovery and explicit failures; wrong-look imports rejected atomically.                                      |
| 39     | Alpha-aware pixel diagnostics          | Ignore hidden RGB, separate silhouette changes, show bounds; metrics explicitly do not determine art quality.                                   |
| 40     | Cancellable full-action audit          | Inspect every position, account for holds, rank changed poses, report temporal neighbors and loop seam; no artificial jump wrap.                |
| 41     | Registered overlay and difference view | Same-anchor native crops, left/right mirroring, split/overlay/difference and readable backgrounds.                                              |
| 42     | Issue navigation and resolution        | Jump to a recorded pose/direction, pause safely, resolve/reopen without changing character art.                                                 |
| 43     | Paginated action sheets                | All action positions and timings, both reference/current panels, bounded raster pages and cancellation.                                         |
| 44     | Self-describing review bundle          | Notes, exact reference/current identities, scan metrics and actual PNG pages with SHA-256; portable review without embedding duplicate artwork. |
| 45     | Actual production verification         | Male/female UI, persistence/import failures, GIF/ZIP decode, regression tests and independent existing pack playback.                           |

The ten sprints form one complete review workflow. They do not generate new
clothing or automatically repair the existing ear/armhole/shoulder drawing.
Automated metrics locate changes; visual judgment remains necessary. Commit and
push recoverable stages, then deliver a separate draft PR.

## Delivered stages

All ten acceptance groups are complete, with the original artwork unchanged:

- Sprints 36–40: `91cc405` — exact look identity, portable issues and full-action diagnostics.
- Sprints 41–44: `e0b6286` — native views, issue navigation, paginated sheets and review bundles.
- Sprint 45: `c46653b` — browser/production capture and audit, including the lazy-entry regression fix; the final delivery commit records completed evidence.

Current checks: 296 unit tests; final full browser suite 73/73; 4 review bundles
with 28 PNG pages/110 positions; 8 GIFs; 2 unchanged CharacterPacks/184 poses;
20 independent playback cases. The final production smoke proves the lazy-only
fix preserves a real bundle's entire unzipped output. See [delivery details](README.md).

Known drawing seams remain explicitly unresolved. The new draft PR is for review;
it is not automatically merged or treated as user visual approval.
