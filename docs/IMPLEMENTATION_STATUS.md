# Implementation status

**Current batch: run-only limb ownership and joint repair; awaiting user visual review.** Branch `fix/run-limb-connections` starts from the verified PR #2 merge `ebec736`. That merge is on `feat/character-art-v2`; `main` remains unchanged. The new PR stays draft and unmerged. Existing V1–V7 artwork, Motion 1/2 files and prior exports remain available.

## Current behavior and recovery points

New Studio characters and the main Denim player sample use artwork V6 + `motionVersion: 3`. Saved Motion 1/2 files keep their exact original pixels until **Create corrected running copy** is selected. Original V6 idle/walk atlas rows are copied byte-for-byte; frames remain 192×256, anchor (96,240), run 12 frames at 18 fps. Head/neck pixels and current pose targets, limb phase, stride and shoe pitch remain unchanged.

Coral's source-space forearm contours now exclude neighboring skirt cloth and recover misplaced anatomical pixels. The fixed torso/skirt no longer retain stationary hand pixels. Blue underskirt and existing colors remain. Continuous original-texture leg strips replace separately rotated rectangular thigh/shin cuts; separate shoe ownership and finite endpoint sampling prevent duplicate shoe pixels and ankle spikes. No new illustration/model call was needed.

- `816dabc`: four real merged-baseline exports, configurations, PNGs and original left/right loops frozen and pushed before the implementation.
- `f38f8f0`: integrated Motion 3 repair, source ownership audit and focused regressions.
- [Review](RUN_CONNECTIONS_REVIEW.md), [matched exports and player evidence](run-connections/README.md), [verification record](run-connections/verification-results.json).

This batch passed **284 unit tests, 26 Chromium E2E tests, TypeScript and production build**. Media validation decoded 61 PNGs, 48 GIFs, 16 ZIPs and the full 23.36-second player recording; all eight independent run cases matched exported pixels. All counts below are historical. Deep knee folds remain visibly rounded and original hands/boots retain some rigid cutout character. Production Gathria integration and user aesthetic acceptance are not claimed.

## Historical batch: everyday clothing

Four new **Everyday looks** cards provide denim/tan, coral/skirt, sage/shorts and ochre/navy combinations. They preserve the current identity, expression, version and action/facing, remove the rose hairpiece, and remain freely editable. Complete example files use V6 + motion version 2; the player’s main example is now Denim daytrip and retains wedding/older examples. No renderers, source banks or old export artifacts changed.

See [EVERYDAY_REVIEW.md](EVERYDAY_REVIEW.md) for the actual native/2× lineup, idle/walk/run GIFs, four CharacterPacks, independent playback evidence and inherited visual limitations. The coral soft-top waist flecks and angular generic knee cuts remain visible and are not claimed fixed.

This batch passed **259 unit tests, 25 Chromium E2E tests, TypeScript and production build**. Final evidence passed 4 exported packs / 96 frames, 14 PNGs, 7 GIFs, 8 independent left/right run cases and the complete 20.96-second player recording. See [verification record](everyday/verification-results.json). Earlier running counts below remain historical records.

## Historical Motion 2 behavior

New characters retain `artworkVersion: 6` and explicitly add `motionVersion: 2`. The editor offers idle, walk and run in either direction. Running-enabled configuration saves the selected action/facing in optional `preview` metadata; it has no effect on generated pixels. Old V6 files gain running only through **Add running**. Existing Motion 1 files preserve their original poses until **Create compact running copy** is selected. V1–V5 can create a V6 polished copy first. Existing V1–V7 files are never silently converted.

`generator-motion-v2.ts` copies the complete original V6 1536×512 atlas into the new image, then appends twelve running timeline frames (eleven distinct bride drawings and twelve groom drawings). The new sheet is 1536×1024 with 192×256 frames and anchor (96,240). Idle stays 3 seconds, walk 0.8 seconds, and run has 12 frames at 18 fps (2/3 second). CharacterPack stays schema 1 with optional `animations.run`. Old packs remain playable with Run disabled and explained.

`running-rig-v2.ts` reuses the frozen V6 art and color treatment. Head, neck, collar and torso share a rigid lean. Groom legs use compact hip-relative targets and folded recovery; arms keep near-right-angle flexion through their fore/aft pump. Smaller body bounce and modest shoe pitch preserve the ground reference. Original motion-version-1 modules stay untouched. The bride uses two hands to lightly hold the full gown, with bounded lift and delayed hem/hair motion. No new model calls or source illustrations were needed. Run-only material/joint masks remove pixels exposed by the larger limb rotations; historical art and actions do not use those masks.

The independent player supports the optional run clip using only exported images and metadata. It safely resets when loading a pack without run. Preview labels state that animation is in place: there is no world translation or claimed speed-to-stride integration.

## Recovery points and review evidence

- `40c4200`: actual browser-generated V6 baseline packs, original PNG equality and frozen renderer/source hashes.
- `b0ed59e`: integrated running capability, final wedding pose selection, representative geometry tests and retained iterations 01–04.
- `e09251e`: original Motion 1 final evidence and documentation.
- `37db61b`: Motion 2 compact pose refinement, explicit-copy workflow and compatibility/geometry regressions.
- The current delivery commit adds Motion 2 final evidence and documentation.

See [RUNNING_V2_REVIEW.md](RUNNING_V2_REVIEW.md) for the current before/after GIF, native/2× comparisons, portable packs and verification. Final evidence is in [`running-v2/`](running-v2/), samples in [`samples/running-v2/`](../public/samples/running-v2/). Prior [Motion 1 review](RUNNING_REVIEW.md), [`running/`](running/) exports and [`running-baseline/`](running-baseline/) remain unchanged.

## Verification for the compact running batch

**259 unit tests across 13 files, 22 Chromium E2E tests, TypeScript and production build passed.** This batch separately decoded 10 final packs / 240 frames, 28 PNGs, 10 GIFs, 4 iteration packs and the complete 14.2-second independent-player recording. Four Studio-closed run cases cover two identities and both facings. Full V6 idle/walk rows and delivered Motion 1 wedding pixels reproduce exactly. See [verification record](running-v2/verification-results.json) and [decoded-file report](running-v2/file-validation.json).

The prior Motion 1 batch's 247 unit / 18 browser tests and 22 exports remain historical results in its own review. They are not presented as current executions.

## Remaining limits

The user reference’s third row guided motion mechanics, but the preserved V6 artwork remains three-quarter facing. A true profile requires new artwork. The bride reads as a careful gown-holding trot rather than a sprint. Dress folds are deformed from the existing artwork, not redrawn for each footfall; stronger running would need dedicated running/cloth poses. Groom cuffs and shoes retain some rigid cutout character. Whole-face expressions remain authored states, and bob/crest retain their original expression limitations. User visual acceptance is outstanding.

Stop after delivery for review. Production Gathria integration and travel-speed calibration remain unverified. Firefox/Safari, photo input and runtime image generation are outside this batch. The studio retains its large build-chunk warning because every historical artwork bank remains bundled.
