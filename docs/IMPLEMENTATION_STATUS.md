# Implementation status

**V6 running implemented; awaiting user visual review.** Branch `fix/character-art-cohesion`, [draft PR #2](https://github.com/hanxuwu/gathria-character/pull/2), based on the verified V6 default-restoration commit `eb877ca`. Keep the PR unmerged and do not deploy. V7 remains an unaccepted visual iteration with its files and history preserved.

## Current behavior

New characters retain `artworkVersion: 6` and explicitly add `motionVersion: 1`. The editor offers idle, walk and run in either direction. Running-enabled configuration saves the selected action/facing in optional `preview` metadata; it has no effect on generated pixels. Old V6 files gain running only through **Add running**. V1–V5 can create a V6 polished copy first. Existing V1–V7 files are never silently converted.

`generator-motion-v1.ts` copies the complete original V6 1536×512 atlas into the new image, then appends twelve running timeline frames (eleven distinct bride drawings and twelve groom drawings). The new sheet is 1536×1024 with 192×256 frames and anchor (96,240). Idle stays 3 seconds, walk 0.8 seconds, and run has 12 frames at 18 fps (2/3 second). CharacterPack stays schema 1 with optional `animations.run`. Old packs remain playable with Run disabled and explained.

`running-rig.ts` reuses the frozen V6 art and color treatment. Head, neck, collar and torso share a rigid lean. Groom legs use two-bone posing, bent arms counter the stride, and contact/flight phases preserve the ground reference. The bride uses two hands to lightly hold the full gown, with bounded lift and delayed hem/hair motion. No new model calls or source illustrations were needed. Run-only material/joint masks remove pixels exposed by the larger limb rotations; historical art and actions do not use those masks.

The independent player supports the optional run clip using only exported images and metadata. It safely resets when loading a pack without run. Preview labels state that animation is in place: there is no world translation or claimed speed-to-stride integration.

## Recovery points and review evidence

- `40c4200`: actual browser-generated V6 baseline packs, original PNG equality and frozen renderer/source hashes.
- `b0ed59e`: integrated running capability, final wedding pose selection, representative geometry tests and retained iterations 01–04.
- The delivery commit containing this handoff adds final exported evidence, media decoding and the review documentation.

See [RUNNING_REVIEW.md](RUNNING_REVIEW.md) for direct GIF/PNG/ZIP links, implementation/compatibility details and reproduction commands. Sources for comparison are in [`running-baseline/`](running-baseline/); final evidence is in [`running/`](running/) and public examples in [`samples/running/`](../public/samples/running/).

## Verification for this running batch

The final typecheck and production build pass. **247 unit tests** pass, including frozen V6 source/atlas checks, motion/config compatibility, optional-run validation, deterministic rendering, connected wedding poses, contact/flight bounds and visible bare legs for shorts/skirts. **18 Chromium E2E tests** cover editing, save/reopen, export, explicit old-config upgrades, unavailable old-pack Run, actual independent playback and mirrored pixels. Final validation decoded 22 actual exported packs (528 declared frames), 46 PNGs, 15 GIFs, 8 retained iteration packs and the complete 56.2-second independent-player recording. Twenty Studio-closed playback cases passed. See [verification record](running/verification-results.json) and [decoded-file report](running/file-validation.json).

The 18-test browser run preceded the last shorts/skirts material-mask correction. The correction changed no wedding pixels and was checked with all 247 unit tests, including two new all-frame bare-leg regressions, plus fresh final browser exports. The complete GitHub verification workflow also passed after the correction at implementation commit `b0ed59e`: [CI run](https://github.com/hanxuwu/gathria-character/actions/runs/38970034178). Historical V5/V6/V7 test counts remain in their own review documents and are not counted as new executions.

## Remaining limits

The bride reads as a careful gown-holding trot rather than a sprint. Dress folds are deformed from the existing artwork, not redrawn for each footfall; stronger running would need dedicated running/cloth poses. Groom cuffs and shoes retain some rigid cutout character. Whole-face expressions remain authored states, and bob/crest retain their original expression limitations. User visual acceptance is outstanding.

Stop after delivery for review. Production Gathria integration and travel-speed calibration remain unverified. Firefox/Safari, photo input and runtime image generation are outside this batch. The studio retains its large build-chunk warning because every historical artwork bank remains bundled.
