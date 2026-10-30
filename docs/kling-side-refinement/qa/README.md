# Independent refinement QA

Baseline: `16fb1405239188a453d66cda94927106028eefbf` (PR #54).
This directory records the current refinement; previous test totals are not reused.

## Review scope

The original source packs, registrations, head and hand protection, frame IDs,
24 fps and loop flags stay exact. The bounded male collar and female foreground
forearm ownership repairs retain the existing garment V1 format. There is no
new head-protection exception in this iteration.

The existing strict actual-export verifier remains unchanged: original source
RGBA, every remaining protected pixel, garment replacement RGBA/alpha, unowned
pixels, GIF timing/frame sequence, mirroring, project reopen and fresh independent
players all continue to use the same assertions. Guide overlays and local review
scores must not affect exported artwork.

## New compatibility and recovery cases

`tests/e2e/side-refinement-recovery.spec.ts` loads both actual PR #54 wardrobe
projects pinned by this iteration's baseline. Their baked CharacterPacks provide
12 native PNG oracles across both facings, including frames repaired in the new
catalog. Saved embedded artwork and bindings must remain exact.

The male case runs without Workers, exercising the identical strict fallback.
It then imports a valid re-signed ZIP containing a malformed inner garment PNG:
this reaches the PNG validation path, must reject the candidate and must preserve
the accepted renderer and exported PNG. The female case uses normal browser workers.
Existing source503/retry, invalid ZIP, stale export disabling and worker lifecycle
checks remain in their original suites.

## Current browser results

The three focused cases passed in 1.1 minutes: the two actual PR #54 compatibility
cases above and `side-loading-workers.spec.ts`'s real browser worker lifecycle
case. The latter cancels one preparation, completes a separate request, checks
exact worker/fallback RGBA and archive parity, rejects damaged PNG bytes, and
verifies retained input buffers. [Current log](recovery-browser.log).

There are 3 browser cases, not 12 additional tests for the individual PNG oracles.
The male compatibility case took 39.2 seconds; female 23.5 seconds; lifecycle
640 ms. These are functional test durations, not controlled performance results.

## Actual exports

The male final run passed from 18:24:08 to 18:28:42 UTC on 2026-10-29:
107 native source/clothing poses, 214 styled/mixed appearance compositions,
24 actual UI GIF downloads and two fresh independent-player contexts after
closing the workbench. All 256 runtime/asset input hashes remained exact.
[Report](male-final-report.json) · [log](male-final.log).

The female final run passed from 18:28:56 to 18:33:56 UTC on 2026-10-29:
102 native source/clothing poses, 204 styled/mixed appearance compositions,
24 actual UI GIF downloads and two fresh independent-player contexts after
closing the workbench. All 256 runtime/asset input hashes remained exact.
[Report](female-final-report.json) · [log](female-final.log).

Totals: **209 native source/clothing poses, 418 appearance compositions,
48 actual GIF downloads and four fresh independent players**. Source timing,
frame order, exact authored RGBA/alpha, protected head/hands, unowned pixels,
left/right mirrors, decoded GIF durations/loop flags, saved project reopen and
independent re-export all pass. Neither run logged page errors, failed HTTP
requests or forbidden authoring requests in the standalone player.

The [summary](summary.json) records report hashes and times. All 256 inputs in
each report were rehashed after both runs; all 251 shared inputs match.
These are this iteration's actual runs, separately from previous records.

## Actual-export visual review

[Male 2× same-frame details](male-actual-contacts-2x.png) show a narrower gray
original-tank neckline band in idle0, walk26 and run40. The
[actual per-frame comparison](male-actual-comparison.json) measures exactly
105 changed poses / 9,372 changed pixels; poses59/61 stay exact. Original
source timing and anchors match PR #54. This is bounded neckline cleanup:
jagged or double collar ink and broad gray cloth/armhole seams in the difficult
jump poses67/89/91 remain. Those limitations are not hidden by the passing
pixel-protection checks.

[Female 2× same-frame contacts](female-actual-contacts-2x.png) show the triangular
skirt cut at run40 and thin spike at run41 removed from the original lower arm.
The [actual per-frame comparison](female-actual-comparison.json) confirms only
158 and 126 pixels changed respectively; all other 100 poses stay exact,
including the full jump and approved pleated skirt. Original forearm ink and
antialiasing are restored rather than repainted. Neighboring run39/42 remain
unchanged. Existing blouse/waist donor seams and source blur remain limitations.
The [unchanged jump detail board](female-actual-jump-2x.png) provides a visual
regression reference for 60/67/76/89.

Reproduce comparison boards and per-frame measurements with
`scripts/review-kling-side-refinement-qa.py CHARACTER ACTUAL_STYLED_CHARACTERPACK`.
It reads preserved PR #54 actual exports; only layouts and integer magnification
are added. The final comparison GIFs are linked by the parent review.
