# Sprints 36–45: reproducible wardrobe review

Baseline: PR #36 merged after both remote checks passed; new branch
`feat/kling-review-workbench-v8`. Preserve all original drawings, schedules,
clothing revisions, editable projects and CharacterPack formats.

| Sprint | Goal | Acceptance |
| --- | --- | --- |
| 36 | Exact review identity | Source, registration and selected artwork hashes; preview changes do not change identity; custom revisions do. |
| 37 | Frame-specific review records | Issues identify action, source pose, direction, body area, severity and resolution. Invalid references rejected. |
| 38 | Portable, persistent review notes | Bounded strict JSON; local storage recovery and explicit failures; wrong-look imports rejected atomically. |
| 39 | Alpha-aware pixel diagnostics | Ignore hidden RGB, separate silhouette changes, show bounds; metrics explicitly do not determine art quality. |
| 40 | Cancellable full-action audit | Inspect every position, account for holds, rank changed poses, report temporal neighbors and loop seam; no artificial jump wrap. |
| 41 | Registered overlay and difference view | Same-anchor native crops, left/right mirroring, split/overlay/difference and readable backgrounds. |
| 42 | Issue navigation and resolution | Jump to a recorded pose/direction, pause safely, resolve/reopen without changing character art. |
| 43 | Paginated action sheets | All action positions and timings, both reference/current panels, bounded raster pages and cancellation. |
| 44 | Self-describing review bundle | Notes, exact reference/current identities, scan metrics and actual PNG pages with SHA-256; portable review without embedding duplicate artwork. |
| 45 | Actual production verification | Male/female UI, persistence/import failures, GIF/ZIP decode, regression tests and independent existing pack playback. |

The ten sprints form one complete review workflow. They do not generate new
clothing or automatically repair the existing ear/armhole/shoulder drawing.
Automated metrics locate changes; visual judgment remains necessary. Commit and
push recoverable stages, then deliver a separate draft PR.
