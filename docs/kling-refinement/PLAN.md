# Kling refinement — Sprints 6–10

Baseline: PR #30 merged at `8f2f87f`. Branch: `feat/kling-fit-and-authoring-v2`.
Only the approved Kling pair is used. Source pixels, geometry, anchors and
action timing remain authoritative; released banks and saved projects retain
their exact versions. This batch ends with a reviewable draft PR.

| Sprint | Scope                                                            | Acceptance                                                                                             | Status                                                                                                                                                   |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6      | Repair ear/temple donor boundaries; inspect male and female hair | Same-frame native and 2x exports, five actions and both directions; no source anatomy changes          | Complete: 20 related unit checks; actual same-frame exports, project/recipe restoration and 10 isolated-player cases                                     |
| 7      | Difficult-pose shoulder, cuff, waist and skirt fitting           | Four primary outfits and representative mixes, actual export comparisons; local ownership changes only | Complete with limits: additive jacket/shirt/dress revisions; deeper waist compression remains documented                                                 |
| 8      | Reusable category recipes and bounded pose overrides             | Reproduce daily/occasion items and one derived look; source/hash/ownership safeguards                  | Complete: four starters, selected-clothing kit download, Ocean linen build/import/save/export; custom materials require their saved project after reload |
| 9      | Measure first preparation cost and evaluate optimization         | Cold/repeat timings, unchanged exports and strict validation                                           | Evaluation complete; optimization rejected after female regression. Released runtime retained; speed improvement deferred pending profiling              |
| 10     | Whole-library review and portable delivery                       | Decoded GIFs/PNGs/ZIPs, saved/reopened looks, isolated player and regression report                    | Complete: 70 isolated-player cases, 13 actual packs, 24 decoded GIFs, 26 review PNG boards and source-protection checks; user visual approval pending    |

Technical checks and visual judgment are reported separately. Offline authoring
previews are not application exports. If two visual attempts do not improve a
problem, retain the best candidate and document the limitation. No expansion of
the skeleton system, runtime generation API, new character identity or page is
part of this batch.
