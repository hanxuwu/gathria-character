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

Final actual-export evidence remains pending the complete runtime freeze.
