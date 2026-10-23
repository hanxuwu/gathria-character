# Kling fit and material workflow — Sprints 16–20

Baseline: main `7f76524` (PR #32 merged, both verify checks passed).
Branch: `feat/kling-fit-and-materials-v4`.

The two approved Kling sources, proportions, pose registration and timing are
fixed. Existing garment/appearance archives and saved projects remain exact.

| Sprint | Scope | Completion gate | Status |
| --- | --- | --- | --- |
| 16 | Male shirt/jacket sleeve and cuff transitions | Same-frame actual exports; source skin/hand ownership protected | Authored and audited; actual export review underway |
| 17 | Compressed dress waist folds | Daily/wedding same-frame comparisons; retain best if two trials fail | Two trials rejected; released V6 retained and limitation recorded |
| 18 | Saved artwork storage management | Show use; reclaim only unused materials; preserve saved looks across tabs | Complete; save/cleanup concurrency and local restoration tests pass |
| 19 | Repeat look loading and decode work | Exact saved bytes first; bounded cache; measured unchanged pixels | Complete; bounded decode optimization measured, mixed results disclosed |
| 20 | Complete export review | Four outfits, left/right five actions, mixes, reopen and independent playback | Actual exports and full regression running |

Each completed stage is committed and pushed. Supplementary artwork is labeled
as such. Visual inspection is separate from automated verification and user
acceptance. No new body, skeleton rewrite, runtime image API, or implicit upgrade.
