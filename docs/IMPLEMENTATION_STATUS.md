# Implementation status

**Current batch: calibrated body and eight-look kit.** Starts from merged main
`0a0fc06` on `feat/standard-character-kit`. One new source sheet separates
three expression faces from two hair overlays. Registered derivatives of two
existing tops, one trouser set and two shoe designs share exact Theo body
chains and all four original action clips. The source and preparation stages
are saved in `003620f`, `1fcdbab` and `0c774a1`.

[Review and limits](STANDARD_KIT_REVIEW.md) ·
[Repeatable authoring contract](STANDARD_CHARACTER_KIT.md) ·
[Actual exports and editable kit](standard-kit/README.md) ·
[Current verification](standard-kit/verification-results.json).

This asset/preparation batch leaves existing runtime modules, legacy art and
file formats unchanged. Hair remains separately editable in offline sources
and compiles into ordinary IdentityPack V1 variants; no runtime hair selector
or universal outfit fitting is claimed. The review separates functional
checks from remaining trouser, expression and source-finish limits. It remains
unmerged, without user visual acceptance or production Gathria integration.

**Historical batch: Ravi, Lina and Nora modular character trial.** Starts from
`38cfaa8` on `feat/character-roster-trial`; new source illustrations are saved in
`bc13ccf`, and registered playable projects/source corrections in `38362e6`.
Three new portable identities and two tops combine with existing garments.
Skin V4 / shoe item V5 retain shin-following footwear. Ravi keeps the original
gait; Lina and Nora save an explicit compact run profile. Nora's failed skirt
fit is preserved and her playable final outfit uses coral shorts.

[Review and discovered limitations](CHARACTER_ROSTER_REVIEW.md) ·
[Actual exports, GIFs and editable projects](character-roster/README.md) ·
[Current-session verification](character-roster/verification-results.json).
The review distinguishes passed functional checks from remaining face-tone,
deep-knee and retargeting limitations. Historical artwork stays unchanged; the
only existing runtime edit preserves an error message across TypeScript union
narrowing. This batch was merged as PR #12 (`0a0fc06`); production integration
and user visual acceptance remain unclaimed.

**Historical batch: Theo shoes parented to the solved shin.** Continues draft PR #11
from `8ed74d3`, on `feat/theo-passing-poses`; implementation and prepared project
are committed and pushed as `ce5f239`. Opt-in Skin V4 / shoe item V5 supply the
shoe's own source-shin axis. Run boots and trousers share the final ankle and
rotation, with coupled opaque-sole support and fixed-length leg reach. Old files
retain their renderer; all 19 source parts, anatomy, motion keys and non-run
frames remain exact. This corrects independent shoe/cuff rotation while retaining
the crowded ninth pose, fast recovery angle changes and old trouser folds.
[Review](THEO_ANKLE_FOLLOW_REVIEW.md) ·
[Actual comparisons and editable files](theo-ankle-follow/README.md) ·
[Source contract](RUN_SHOE_PARENTING.md) ·
[Current verification](theo-ankle-follow/verification-results.json).

This follow-up ran **489 unit tests / 39 files, eighteen relevant Chromium tests,
TypeScript and production build**, all passing. Actual export and closed-editor
playback results are recorded separately with the final evidence. This remains
an unmerged review delivery, not a claim of final natural running or user visual
acceptance.

**Historical batch: Theo registered running pose attachments.** Starts from merged
`main` at `30125e5`, on `feat/theo-passing-poses`. Opt-in Skin V3 / bottom-and-shoe
item V4 carry complete bent-leg and running-shoe source parts while preserving
original anatomy, motions, heads and all non-run frames. The chosen source
improves bent cloth contours and consistent shoe perspective; pose 9 still
crowds the boots, pose 10 retains a rear-trouser triangle, and base/bent cloth
transitions remain visible.
[Review](THEO_PASSING_POSES_REVIEW.md) ·
[Actual previews and editable files](theo-passing-poses/README.md) ·
[Source contract](RUN_POSE_ATTACHMENTS.md).

This batch passed **482 unit tests / 38 files, eighteen relevant Chromium tests,
TypeScript and production build**. Current command results and export checks
are recorded in the review directory. Existing projects remain reproducible;
the new study stays unmerged for review and does not imply natural-animation
completion, user visual acceptance or Gathria integration.

**Historical batch: Theo run stride and shoulder repair.** Continued draft PR #10
from `1ab97c5`, on `feat/theo-pose-study`. Explicit motion-library V2 centers
run targets on the pelvis and shares rotated shoe support with the leg ankle;
V1 defaults and historical projects remain unchanged. A new top adds 113
same-cloth shoulder backing pixels and removes eight misplaced hand pixels.
The tuned run retains head/identity, anatomy, clothing design and 12-key/18 FPS
timing. [Review](THEO_RUN_REPAIR_REVIEW.md) ·
[Actual exports and editable downloads](theo-run-repair/README.md) ·
[Motion contract](MOTION_LIBRARY_V2.md) ·
[Source record](../artwork/theo-run-repair/README.md).

This follow-up passed **469 unit tests across 37 files, eleven relevant Chromium
tests, TypeScript and build**. Historical Theo/Rose/Maple/Willow frames remain
exact. V2 editing, reset, undo/redo and project reopen retain their explicit
semantics. Contact ankle separation is now 41 px in both half-cycles; recovery
is smoother and the shoulder wedge is closed. The ninth run pose still crowds
the two boots, and deep knee folds remain a source/mesh limitation. The old
forehead recolor mask and expression drawing drift are separate outstanding
issues. Current execution and export checks are recorded with this review;
neither passing tests nor a draft delivery implies user visual acceptance.

**Historical batch: Theo whole-figure pose study.** Starts from `2471785` on
unmerged draft PR #9, using `feat/theo-pose-study`. One complete standing model
establishes fuller body/hand/suit proportions before splitting into the existing
skeleton. Source `acec98b`, explicit source-color item V3 implementation
`e653abe`, and registered artwork/project `9f9c385` are committed and pushed.
Old items, projects, global motions and historical renderers remain unchanged.
[Review](THEO_POSE_STUDY_REVIEW.md) · [Actual outputs and downloads](theo-pose-study/README.md) ·
[V3 color contract](WARDROBE_ITEM_V3.md) · [Sources](../artwork/theo-pose-study/README.md).

This batch passed **463 unit tests, nine relevant Chromium E2E tests, TypeScript
and production build**. Prior Theo/Rose/Maple/Willow exports retain exact pixels
and manifests. Preparation checks all 108 expression/action poses and preserves
all fifteen registered source slot arrays at their source colors. The new
project owns a twelve-key run and a four-key jump clearance adjustment; the
same-art old-run comparator isolates the motion change. Small expression drawing
drift, unequal half-cycle strides, deep knee compression, shoulder overlap gaps
and misclassified forehead boundary pixels remain. Actual UI capture verifies
six packs / 216 poses, 88 editor comparisons and ten closed-editor playback
cases; 79 PNGs, ten GIFs and 21 ZIPs decode. Evidence is linked from the review;
functional verification is separate from user visual acceptance.

**Historical batch: Theo and Rose reference pair.** Starts from `cd89d61` on
unmerged draft PR #8, using a separate `feat/reference-character-pair` branch.
Three retained source-generation calls produce two coordinated identities and
six reusable clothing items on the unchanged shared rig. Source commit `7c71e06`
and registration commit `562d870` are pushed; `a87bd61` fills a remaining
scoop-collar gap found in the actual exports. The trial repairs a neck/rear-hair
ownership cut, coral/ivory masks and duplicated trouser/waist/sock source parts.
[Review](REFERENCE_PAIR_REVIEW.md) · [Actual previews and downloads](reference-pair/README.md) ·
[Sources](../artwork/reference-pair/README.md).

This asset-only batch ran **84 focused unit tests, two identity-library Chromium
E2E tests, TypeScript and production build**, all passing. The
[current execution record](reference-pair/verification-results.json) distinguishes
these checks from the preceding full suites. Functional exports and visual review
are recorded separately. Final actual capture passes ten exports/360 poses,
160 editor comparisons, six saved-project roundtrips and 20 closed-editor
independent playback cases. All final 133 PNGs, 20 GIFs and 38 ZIPs decode;
the original passing export's remaining collar defect is retained in a matched
before/after comparison and repaired in the final capture. Deep-knee compression and modest skirt sway
remain. The new work stays draft/unmerged with user visual acceptance pending.

**Historical batch: portable identities and Willow.** Starts from unmerged draft
PR #7 at `fa3b5d2` on `feat/portable-character-identities`. Identity ZIPs and an
explicit wardrobe recipe v3 let Maple/Willow retain their full heads while
changing clothes, skin/hair colors and expressions. The generated Willow outfit
uses the existing skeleton and four actions. Projects embed both identity and
clothing libraries; historical files remain unchanged. Implementation `74923c0`
and the real-export provenance repair `654de23` are committed and pushed.
[Review](PORTABLE_IDENTITIES_REVIEW.md) ·
[Sources, editable projects and actual exports](portable-identities/README.md) ·
[Identity format](IDENTITY_PACK_V1.md).
This batch passed **454 unit tests, all 52 Chromium E2E tests, TypeScript and
production build**. Its execution and export results are recorded in
[verification-results.json](portable-identities/verification-results.json).
Final actual evidence verifies 12 new exports, 176 editor frame/facing checks,
eight save/reopen roundtrips and 24 closed-editor independent playback cases;
all 155 PNGs, 20 GIFs and 46 ZIPs decode. Four historical projects retain exact
pixels and manifests. Review media and source hashes accompany the delivery.
The branch is stacked on PR #7; no merge, deployment, final visual acceptance
or production Gathria integration is implied. Deep knee folds remain unchanged.

**Historical batch: Maple action forearms.** Continues draft PR #7 from `2b10770`.
A generated closed-hand pair is registered under the original cuffs and selected
only for run/jump through opt-in skin/top-item v2. The editor, garment library,
source/project ZIPs and baking support the paired alternatives; old v1 files and
idle/walk retain their outputs. Two knee parameter sweeps found no clear visual
improvement, so the original mesh/joints remain. See
[review](MAPLE_ACTION_POSES_REVIEW.md) and
[actual exports and reusable files](maple-action-poses/README.md).
This follow-up passed 437 unit tests, all 50 Chromium E2E tests and TypeScript/build;
18 actual-export ZIPs, 61 PNGs and 24 GIFs were decoded and checked. The earlier
concurrent-load unit timeout and successful isolated rerun are recorded in
[verification-results.json](maple-action-poses/verification-results.json).
The PR remains draft/unmerged; user visual acceptance and production integration
remain unverified.

**Historical batch: generated character pipeline trial.** Starts from PR #6's
merged `main` at `51c708a`, on `feat/generated-character-pipeline`. Newly generated
Maple artwork is registered into 15 slots, animated with the unchanged four-action
rig, exported through Skin Studio and played independently. New clothing is also
reused on both built-in identities. Actual exports exposed and guided repairs to
duplicate torso sleeves, pelvis/leg ownership and cuff material masks.
[Review and remaining defects](GENERATED_CHARACTER_REVIEW.md) ·
[Source, projects and actual evidence](generated-traveler/README.md) ·
[Current-session execution record](generated-traveler/verification-results.json).
No runtime source or original artwork is changed. New identity registration in
the wardrobe, alternate running hands and better deep-bend texture handling
were future work at that checkpoint. The follow-up above implements alternate
hands; original evidence remains retained. PR #7 stays draft/unmerged.

**Historical batch: portable clothing items.** Continuing merged `main` at
`ffad05d82bad2d2f481488d6496df5cfb47a3fee` on `feat/custom-wardrobe-items`.
Skin Studio imports and exports registered top, bottom and shoe item ZIPs,
selects them through the same wardrobe and embeds the complete item library in
saved projects. The four actions, renderer, identities and old source art remain
unchanged. Recipe v1 remains supported; imported clothing uses recipe v2 with
explicit source items. [Current review](WARDROBE_ITEMS_REVIEW.md) records the
workflow, ownership/format contracts and limitations. Implementation `e7b9a92`
is pushed. This batch passed **418 unit tests, 48 Chromium E2E tests, TypeScript
and build**, with 14 PNGs, six GIFs, 20 ZIPs and eight closed-editor independent
playback cases verified. Two old wardrobe projects retain all 72 frames and both
manifests exactly. Current evidence is in [wardrobe-items/](wardrobe-items/).
The follow-up delivery commit `e45475e` records the artifacts; PR #6 was merged
into main at `51c708a`. These counts are that batch's historical verification.

**Historical batch: modular wardrobe MVP.** Skin Studio explicitly assembles two identities, two tops, two bottoms and two shoe designs, with separate skin/clothing colors, on the existing four-action skeleton. A pinned recipe and complete slot PNGs travel in the saved project. Manual artwork/binding edits detach the recipe without losing pixels; undo restores the full look. Original skins, legacy renderers, motions and production Studio remain preserved; the shared renderer retains old pixels and opts only clean wardrobe skins into ankle overlap. [Current review](WARDROBE_MVP_REVIEW.md) records material ownership repairs, ankle/sole fitting, compatibility, actual exports and limitations. This batch passed **389 unit tests, 45 Chromium E2E tests, TypeScript and production build**. Implementation `90fae7f` and ankle repair `3ec3493` are committed and pushed; the follow-up delivery commit contains export evidence. PR #5 was merged into its parent; PR #4 subsequently integrated the complete history into main at `ffad05d`. User visual acceptance and production Gathria integration are not claimed.

## Historical batch: four basic skeletal actions

New Skin Studio projects provide idle, walk, run and a one-shot jump on the same humanoid skeleton. Skeleton-only view exposes the animated root, torso, head and limb chains; source skin swapping reuses the motions. Old projects keep their original clips and pixels until explicit jump addition. [Basic actions review](BASIC_ACTIONS_REVIEW.md) records the implementation, compatibility and evidence. That batch passed **357 unit tests, 41 Chromium E2E tests, TypeScript and the production build**. Evidence validates 51 PNGs, six GIFs, six ZIPs and sixteen independent playback cases. Implementation `7241753` and delivery `56e73af` are pushed.

## Historical batch: visual binding, motion editing and undo

Continuing draft PR #5 from verified `73e87c6`, Skin Studio now edits source joints with pointer/keyboard controls and shared poses, FPS and playback entries through a timeline. Twenty-step undo/redo covers the whole authoring project, including imported artwork and the loaded binding reset point. The existing renderer, default motions, file formats and production Studio are preserved. [Authoring tools review](AUTHORING_TOOLS_REVIEW.md) records this batch's workflow, evidence and limits.

Implementation `276a17b` is committed and pushed. This batch passed **335 unit tests, 38 Chromium E2E tests, TypeScript and production build**; the follow-up delivery commit saves the actual UI walkthrough, two edited source projects, playback packages and four independent run cases. All 18 PNGs, five GIFs and eight ZIPs decode and pass integrity checks; both default outputs remain pixel-identical. Earlier results below remain historical.

## Historical batch: reusable skeleton, skin packs and Skin Studio

Branch `feat/reusable-character-rig` starts from verified `391d842` on `experiment/denim-skeletal-rig`. The new authoring app at `/skin-studio.html` uses the same rig hierarchy and motion library for Denim, Coral and externally imported skins. Production Studio, historical renderers/configurations, the original rig lab and independent consumer are preserved.

The workflow accepts registered PNG attachments, edits source joints and integer offsets, shows posed bones/mesh, saves portable skins and self-contained authoring projects, then bakes ordinary five-file CharacterPacks. All three actions are generated by the reusable renderer. Imported artwork does not require identity-specific rendering code, but it does need correct part ownership and joint coverage. The first family supports V6-scale anatomy, not arbitrary proportions or automatically segmented illustrations.

[Implementation review](REUSABLE_RIG_REVIEW.md), [new material guide](SKIN_PACK_V1.md), and [actual export evidence](reusable-rig/README.md) document the formats, reproducible source packages and known mesh/art limits. This batch passed **323 unit tests, 34 Chromium E2E tests, TypeScript and production build**, plus twelve independent action/direction playback cases and decoded export/GIF checks. The review records the initial concurrent-load timeout and successful isolated rerun separately. Implementation `57cb0c7` is pushed; the following commit contains delivery evidence. No user visual acceptance or production Gathria integration is claimed.

## Historical batch: independent Denim skeletal authoring trial

Branch `experiment/denim-skeletal-rig` starts from verified `ea01dd8` on `fix/run-limb-connections`. PR #3 remained draft/unmerged; the experiment was a separate stacked draft targeting that repair branch. The Studio default and all production core sources remained unchanged.

`/rig-lab.html` implements local bones, normalized mesh weights, keyframe controls, project save/reopen and native frame baking without Spine or any new animation dependency. Default run targets, V6 identity, head/neck treatment, frame dimensions, anchors and cadence stay fixed. Experimental packs identify `gathria-denim-skeletal-v1`; idle/walk rows stay byte-identical. Keep the separate rig-project JSON to reproduce the experiment: ordinary Studio intentionally interprets its appearance configuration as production Motion 3.

Implementation recovery point: `4908e48` (pushed). [Skeletal review](SKELETAL_RIG_REVIEW.md) contains actual comparisons/GIFs, source and baked packs, independent playback proof and limitations. This batch passed **293 unit tests, 29 Chromium E2E tests, TypeScript and production build**; the expanded idle-timeline E2E also passed on a targeted rerun. Two packs, eleven PNGs including the two atlases, five GIFs and six independent action/direction cases were verified. The mesh gives modest local bend changes, but deep folded knees and overlapping inner mesh triangles remain limitations. No user visual acceptance or production Gathria integration is claimed. Stop here for review; all counts below are historical.

## Historical batch: run-only limb ownership and joint repair

Branch `fix/run-limb-connections` starts from the verified PR #2 merge `ebec736`. That merge is on `feat/character-art-v2`; `main` remains unchanged. Existing V1–V7 artwork, Motion 1/2 files and prior exports remain available.

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
