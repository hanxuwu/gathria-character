# Five-sprint Kling wardrobe iteration

Baseline: `c9867a8` on `feat/kling-head-customization`, draft PR #30. The original Kling pair, source anchors and action timing remain authoritative. This is a bounded five-sprint implementation batch; each sprint produces a recoverable commit and evidence, without merging or deploying.

| Sprint | Deliverable | Acceptance | Status |
| --- | --- | --- | --- |
| 1 — Exact visual inspection | Previous/next frames, preview-only slow motion, same-frame source/dressed connection crops | Held frame positions remain addressable, left/right crops align, PNG/pack pixels and timing unchanged | Complete: frame inspection browser check and TypeScript passed |
| 2 — Targeted artwork corrections | Refined ponytail ear fragments and ivory dress waist; immutable previous banks and explicit revision selection | Actual difficult-pose before/after exports improve without source-face/anatomy/timing changes; previous projects remain reproducible | Complete: final V3 hair/waist revisions reviewed in actual same-frame exports; 96 poses and unchanged Gentle states verified; V2 intermediates retained |
| 3 — Named looks | Browser-local named combinations, restore and delete, safe source/hash matching | Names and selections survive reload; unavailable/custom material never silently substitutes; portable wardrobe saves remain available | Complete: 3 unit checks and 2 browser workflows passed (reload, exact pixels, changed-hash refusal, original appearance restoration) |
| 4 — Loading and cancellation | Bounded verified download reuse, progress, cancellation with accepted outfit retained | Repeat switches avoid duplicate transfers; corrupt/aborted downloads do not poison reuse; cancellation does not replace accepted pixels | Complete: bounded verified-byte reuse, progress and cancel; 3 unit cases and 7 browser checks passed |
| 5 — End-to-end delivery | Current UI captures, actual GIFs and packs, regression and reproduction notes | Five actions × both directions, saved projects, named looks, independent playback, alpha/frame timing and immutable baselines checked | Complete: 5 compared packs, 10 decoded GIFs, 8 native/integer-scale boards; 30 final independent playback cases; 239 unit tests and 26 browser cases passed |

Technical checks and visual inspection are recorded separately. New artwork is limited to correcting existing generated donors and source-bound fitting; no new character identities or unrelated skeleton work. Original banks and the previous collection's evidence are retained. If a visual revision regresses, preserve its evidence and keep the better candidate. Loading results report measured requests/bytes and local timings, not universal speed claims.

The plan is executed sequentially. A temporary remote credential failure does not stop local work: commits and a recoverable delivery are retained, and push status is stated explicitly.

## Recoverable commits

- Sprint 1: `4ad1584` — exact frame and connection inspection.
- Sprint 2: `69a5822` — additive donor/waist candidates and explicit revision binding.
- Sprint 3: `17759ce` — named look capture, exact restoration and deletion.
- Sprint 4: `017bde6` — bounded verified download reuse, progress and cancellation.
- Actual-export correction: `ecab1dc` — V3 pony silhouette and ownership-aware dress correction; V2 files/history retained.
- Sprint 5: this final review delivery, with [all current evidence and limits](kling-sprints/README.md).

All stage commits were pushed to `feat/kling-head-customization`. PR #30 remains a draft; no merge or deployment is part of this batch. The actual review caught two issues that the initial material checks did not: V2 pony pinholes and an ivory waist patch protected as hidden skin. Their final revisions are judged separately from passing tests. Near-ear sharpness and compressed crouch folds remain documented limitations.
