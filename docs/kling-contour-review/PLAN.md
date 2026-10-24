# Sprints 26–30: clothing contours and honest comparisons

Baseline: merged PR #34, `c36e11c880bba6ab27ee4db5841aa90d5f96c0b3`.
Its two CI checks passed before the user-authorized merge; those checks are
historical, not verification of this batch. Work happens on
`feat/kling-contour-review-v6`.

| Sprint | Scope                                    | Acceptance                                                                                                                                                                 |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26     | Male crossing-arm cuff contour           | Improve native pose 56's straight cuff and inspect adjacent running poses. Keep approved head, fist, registration and timing; save a new garment revision.                 |
| 27     | Female compressed right-waist silhouette | Remove the fabric step on both dresses in crouch/landing poses using garment-only ownership and documented native artwork. Preserve source anatomy and all previous banks. |
| 28     | Light/dark contour inspection            | Make edge defects visible in the existing connection inspector; keep the original/current crops identically registered and PNG exports self-describing.                    |
| 29     | Synchronized original/current action GIF | Download same-frame, same-anchor comparisons locally; preserve action order, holds, timing and direction, with bounded memory and cancellation.                            |
| 30     | Actual export delivery                   | Four looks, both directions, difficult poses, mixes, save/reopen and independent player. Decode PNG/GIF/ZIP, protect original bytes, publish evidence and a draft PR.      |

Implementation checkpoints: `6a462e6` prepares and audits the three clothing
revisions; `6bd1bc3` delivers the contour inspector; `ff06472` delivers paired
GIF export. `197fb25` records the passing current regression and enables the
asset audit in CI; `1e2f20a` saves the capture/verification workflow.

All five sprints are delivered for review. Production downloads and isolated
playback passed: four CharacterPacks / 368 poses, 72 matched PNGs, 24 direct GIFs,
four saved/reopened projects, 40 independent playback cases and 36 derived review
media. The native cuff and waist-edge comparisons show targeted improvement;
source blur and unrelated old seams remain. [Delivery and exact limits](README.md).

After two unhelpful visual trials of the same problem, retain the better existing
version and document the exact limitation. Do not redraw the source bodies or
call test success visual acceptance. Commit and push recoverable stages. Only
PR #34 is authorized for merge; keep this batch's PR unmerged for review.
