# Kling refinement — Sprints 6–10

Baseline: PR #30 merged at `8f2f87f`. Branch: `feat/kling-fit-and-authoring-v2`.
Only the approved Kling pair is used. Source pixels, geometry, anchors and
action timing remain authoritative; released banks and saved projects retain
their exact versions. This batch ends with a reviewable draft PR.

| Sprint | Scope | Acceptance | Status |
| --- | --- | --- | --- |
| 6 | Repair ear/temple donor boundaries; inspect male and female hair | Same-frame native and 2x exports, five actions and both directions; no source anatomy changes | Complete: 20 related unit checks; actual same-frame exports, project/recipe restoration and 10 isolated-player cases |
| 7 | Difficult-pose shoulder, cuff, waist and skirt fitting | Four primary outfits and representative mixes, actual export comparisons; local ownership changes only | Pending |
| 8 | Reusable category recipes and bounded pose overrides | Reproduce daily/occasion items and one derived look; source/hash/ownership safeguards | Pending |
| 9 | Measure and reduce first preparation cost | Cold/warm timings, unchanged exports and strict validation, cancellation and failure recovery | Pending |
| 10 | Whole-library review and portable delivery | Decoded GIFs/PNGs/ZIPs, saved/reopened looks, isolated player and regression report | Pending |

Technical checks and visual judgment are reported separately. Offline authoring
previews are not application exports. If two visual attempts do not improve a
problem, retain the best candidate and document the limitation. No expansion of
the skeleton system, runtime generation API, new character identity or page is
part of this batch.
