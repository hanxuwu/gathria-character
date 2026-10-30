# Independent fitting iteration QA

Baseline: `220ea2fd7588c1fe784c8454d66469d60fba096a` (PR #53).
Checks in this directory belong to the fitting iteration. Prior polish and
expansion reports remain historical baselines, not new acceptance results.
Technical checks and visual judgments are separate below.

## Read-only implementation review

- The fitting panel reuses the established mask editor and source-bound draft
  format. Corrected garments receive a separate ID and retain the original
  source and registration. The candidate checks source, registration, current
  look and inventory before application; the parent validates every selected
  appearance pose before replacing the active renderer.
- Cancellation/closing leaves the current project unchanged. Starting another
  parent operation invalidates panel work through request and project guards.
  Stage gameplay input is disabled while the fitting panel is open.
- Guides and the geometry audit are separate from exports. Area changes or small
  isolated components are review prompts, not automated aesthetic judgments.
  Looping clips check the last-to-first edge; the original one-shot jump is
  never incorrectly joined to its start.
- The cooperative-yield change preserves every import/render/ownership check.
  It checks cancellation per work item and yields after a short elapsed budget.
  A single existing synchronous decode is not preempted; first-load speed and
  responsiveness require separate measurement.
- Clothing and hair repairs remain asset authoring changes. Source ZIPs,
  canonical registrations, original frame ordering, 24 fps and loop flags remain
  exact. Source face/body pixels outside authored ownership are preserved.

No blocking issue was found in this static review. It does not establish artistic
quality or freedom from every source-video artifact.

## Previous project compatibility

`tests/e2e/side-fitting-legacy.spec.ts` reopens the two actual PR #53 wardrobe
projects, pinned by [the new baseline](../baseline.json). Old baked
CharacterPacks provide the independent RGBA oracle: male walk 26, jump 89 and
hair 67; female walk 31, run 49 and jump 95, each in both facings. Re-saving
preserves every embedded file and its document binding; only preview
action/facing changes.

Both cases passed in 44.0 seconds: 12 decoded native PNG comparisons plus exact
preserved embedded files ([run log](legacy-browser.log)). These are two browser
cases, not 12 additional cases. Any later combined-suite repetition is not an
additional distinct test. The older 4fd27f9 compatibility tests remain in
`side-polish.spec.ts` unchanged; their historical fixtures were not replaced.

## Actual exports and independent players

Final actual-export verification passed for both characters:

| Check                                                         | Male                           | Female                             |
| ------------------------------------------------------------- | ------------------------------ | ---------------------------------- |
| Frozen source / clothing frames                               | 107                            | 102                                |
| Styled chestnut + mixed espresso hair compositions            | 214                            | 204                                |
| Actual UI GIFs, three looks, four actions and both directions | 24                             | 24                                 |
| Mixed and legacy project save/reopen                          | Pass                           | Pass                               |
| Fresh player contexts after closing the workbench             | 2                              | 2                                  |
| Current report                                                | [Male](male-final-report.json) | [Female](female-final-report.json) |
| Run log                                                       | [Male](male-final.log)         | [Female](female-final.log)         |

The [summary](summary.json) records exact start/end times. All 246 runtime/asset
inputs in each report were rehashed after completion; all 241 common inputs
match. No page errors, failed HTTP requests or forbidden workbench requests
occurred in the standalone player. Native RGBA, authored alpha, protected source
pixels, left mirrors, GIF frame order/durations/loop flags and original jump
source IDs 200–249 were checked independently. Independent player re-export is
exact. These are current runs, not historical test records.

## Independent actual-export visual findings

- [Male contacts at integer 2×](male-actual-contacts-2x.png): the rear-scalp
  serration at frame 67 is reduced and rectangular compressed shoulder panels
  at 82/86/89 become more natural angled sleeves. The [decoded actual delta](male-actual-baseline-delta.json)
  confirms exactly 17 changed poses (67 and 80–95); the other 90 frames are
  byte-exact against PR #53. Source timing and anchor are unchanged.
- [Female running contacts at integer 2×](female-actual-contacts-2x.png): the
  misplaced small/oversized puff sleeves now follow the upper arm through the
  full run cycle. Lower-forearm cuts at 39 and 49 are visibly restored to the
  original arm silhouette. The [decoded actual delta](female-actual-baseline-delta.json)
  confirms exactly 68 changed poses (18 run and 50 jump); all 34 idle/walk
  frames remain byte-exact.
- [Female jump hips at integer 2×](female-actual-jump-2x.png): frames 60/67/76/89
  retain the complete pleated design without the intermediate trial's exposed
  dark hip strip. The consistent fold identity reduces whole-drawing changes
  across actions, with less flutter than the prior lifted donor.

The pre-existing triangular forearm/cuff wedge at female run frame 40 remains
visible in the actual contact sheet. Male gray tank-top neckline/armhole
fringes, a sleeve notch around 91, some far-sleeve donor changes, source blur,
matte edges and the jump's crouched endpoint remain limitations. No new source
poses or physical cloth simulation are claimed. These residuals are separate
from the successful technical checks; the retained version is a bounded visual
improvement, not blanket approval that every seam is finished.

Reproduce the detail layouts and exact per-frame deltas with
`scripts/review-kling-side-fitting-qa.py CHARACTER ACTUAL_STYLED_CHARACTERPACK`.
It reads preserved PR #53 actual exports as the before oracle, validates timing,
anchor and dimensions, and adds only labels/layout and integer magnification.
The parent review links full actual-export GIFs for continuous motion review.

The later combined 19-case suite reproduced a test-only slider/readout race in
the male PR #53 case: an input was filled before its jump range was published.
After explicitly waiting for the action and slider maximum, both cases passed
again in 46.0 seconds. Exact pixel/binding assertions and application code were
unchanged. See [combined run](../checks/browser-final.log) and
[focused rerun](../checks/browser-legacy-final.log). These repetitions are not
additional distinct tests.
