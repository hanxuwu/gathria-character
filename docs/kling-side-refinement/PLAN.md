# Side-view clothing stability and responsive fitting

Baseline: `16fb1405239188a453d66cda94927106028eefbf`, draft PR #54; its parent PR #53 remains unmerged. Remote main checked at `bfd3b4d4df9d58821bf23a7134e93a8026eb877b`. Original sources and registrations are pinned in [baseline.json](baseline.json).

## Eight workstreams

1. Male original tank neckline / armpit clothing ownership.
2. Female run40–41 skirt / foreground forearm ownership.
3. Anatomy-aligned temporal clothing diagnostics, including true loop seams.
4. Reusable, source-bound fitting review templates for compatible clothes.
5. Move strict garment page preparation to a disposable worker; preserve exact checks and outputs.
6. Adjacent-pose fitting UI, direct review-to-repair and explicit preview/apply/download state.
7. Independent export, legacy project, cancellation and error recovery verification.
8. Lead integration, visual comparison, CI failure diagnosis and review delivery.

Six workers run alongside the lead; independent QA starts when a worker finishes. Shared code interfaces and browser execution are coordinated. No source body, canonical anchors, 24 fps, frame IDs, action order or loop flags may change. Existing saved embedded artwork remains reproducible. New garment-specific permissions, if needed, must be immutable and pinned to exact source/registration with native pixel-reviewed cloth masks.

Technical success and visual acceptance are reported separately. Trials live under `/tmp/side-refinement`; final actual UI exports and independent player evidence are retained here. This branch stays reviewable and unmerged.

## Inherited CI investigation

PR #54 local scoped checks passed, but final remote runs failed. The pull-request run recorded 137 browser passes and one obsolete per-pose timer/progress assumption in `wardrobe.spec.ts`. The push run also exposed action-slider range synchronization and a reopened live-animation frame selection race. Preserve exact pixel and saved-file assertions; wait for actual action/frame state instead of assuming scheduling. Current results will be recorded separately from historical ones.
