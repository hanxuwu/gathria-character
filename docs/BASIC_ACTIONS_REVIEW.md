# Four basic skeletal actions

This batch starts from `de59c39ba639e0f1f2874cd574c23719aa5cc8a3` on `feat/reusable-character-rig`, draft PR #5. The goal is a small reusable foundation: idle, walk, run and jump driven locally by one humanoid hierarchy and motion library, with registered skins supplying artwork. No new illustrations or image-generation calls were needed.

## What is usable

Skin Studio offers all four actions and both facings. **Skeleton only** hides artwork and shows actual animated root/torso/head and near/far arm/leg chains; it is a view aid and never enters exported character pixels. The same actions drive Denim and Coral, and remain available when registered PNG parts or expression heads are replaced.

Idle, walk and run loop as before. Jump has twelve source keys at 15 FPS (0.8 seconds): preparation, anticipation, compression, takeoff, rise, apex, descent, contact, absorption and recovery. Both legs participate in the same phase, with grounded ankles during compression, two-link knee placement, coordinated shoulder/elbow motion and complete shoe/body translation during flight. The default first and last poses exactly match idle pose 0 for each expression.

Jump plays once, receives its final frame's full duration, then holds the final authored pose. **Replay** restarts it. The motion editor exposes root height and elbow bend alongside existing pose controls; FPS, held entries, undo/redo, skin replacement and complete project save/reopen work as before. The player independently reads jump from the exported manifest and provides replay without importing the authoring engine.

## Compatibility

The skin, rig and authoring envelope remain version 1. The motion library accepts an optional jump clip and jump-only optional `rootY`/`armBend` fields; old clips are not rewritten. New defaults identify the library as `gathria-shared-basic-actions-2`. Existing projects without jump open with Jump unavailable, and **Add jump action** explicitly adds the default clip without touching their authored idle/walk/run data. This edit can be undone. Old application revisions that reject unknown clips cannot edit a new jump project; use the current Skin Studio.

Three-action projects retain generator `gathria-reusable-rig-v1`, 24 populated frames and a 1536×1024 atlas. A project containing jump exports `gathria-reusable-rig-v2`, appending IDs 24–35 in rows 4–5 of a 1536×1536 atlas. Existing frames, rectangles and animation metadata are preserved. The frame remains 192×256 and anchor (96, 240). CharacterPack schema 1 adds optional `animations.jump`; absent actions are disabled rather than invented.

Legacy character configurations and V1–V7 art generators are unchanged. In a baked pack, `character.json` remains a compatibility appearance reference; a jump preview falls back to idle there. The full authoring ZIP preserves jump selection, motion data and source PNGs. Save that ZIP to reproduce or continue editing. The proposed Gathria adapter carries optional jump metadata but remains unverified against production Gathria.

## Visual checks and limits

The existing complete hairstyles have only 6–7 native pixels of headroom. The default hop therefore raises the body 4 pixels and folds the legs enough for 14 pixels of sole clearance, preserving complete hair and the existing frame size. This is a modest in-place hop. A larger world-space jump needs scene-level movement or a separately designed larger-frame contract; this batch adds no physics or travel distance.

The default poses were inspected at native size and integer zoom. The neutral/landing poses remain registered, planted soles remain at y=239 and default apex soles reach y=225. All three expressions on both skins retain transparent boundaries. Old idle/walk/run frames and skin art stay unchanged. Source textures can still compress at bent knees, and the mesh is not a cloth collision solver. Edited extreme pose values can clip artwork; numeric validation cannot guarantee every authored pose looks good. User aesthetic acceptance and production scene integration are not claimed.

## Implementation and verification

`definition.ts` supplies the shared clip; `renderer.ts` evaluates jump limbs/root translation and inspected body bones. `types.ts`, `skin-io.ts` and `bake.ts` preserve old projects while validating/exporting the optional action. Studio/MotionEditor and `playback.ts` handle one-shot controls and skeleton view. Core manifest parsing, the consumer and proposed adapter accept optional jump without widening legacy appearance configuration actions.

Implementation recovery point: `7241753f61ac943e2722c5ce5dafad5e4ce06d29`, committed and pushed. The following delivery commit retains actual UI/export evidence and processing scripts; draft PR #5 remains unmerged.

This batch passed **357 unit tests across 27 files**, **41 Chromium E2E tests**, TypeScript and the production build. The three new browser cases exercise actual skeleton motion, jump authoring/project round trips, exact exported pixels, one-shot completion/replay, and explicit legacy-project upgrade/undo. Historical tests continue to cover old renderers, clothing/color/expression edits and independent playback.

The focused browser capture caught a real transient blank frame when the independent player stopped: reassigning unchanged canvas dimensions cleared its bitmap before the next animation frame. The consumer now resizes only when necessary and draws immediately when its playback effect starts. The strict full-frame pixel comparison remains in place.

An initial new round-trip unit assertion compared millions of individual typed-array entries and exceeded the test timeout. It now compares all metadata directly and SHA256 of every image buffer, retaining complete image equality while avoiding assertion-library per-element overhead. An initial browser attempt was also interrupted by a source hot reload; that attempt is not reported as passing.

Actual evidence includes **51 decoded PNGs, six GIFs and six ZIPs**, with 23 matching source/script hashes. Sixteen closed-editor independent playback cases cover both skins, all four actions and both directions. Both project round trips preserve full pixels/manifest and jump selection. The complete previous 24-frame atlases and action metadata remain identical. The final capture reports no browser errors, external requests or blocked authoring/generator imports.

Actual application exports and the guide-only UI captures are indexed separately:

- [Pure skeleton: all four actions](basic-actions/skeleton-four-actions-2x.gif)
- [Characters: all four actions](basic-actions/four-actions-tour-2x.gif)
- [Native action lineup](basic-actions/four-actions-1x.png) · [2× lineup](basic-actions/four-actions-2x.png)
- [Jump right](basic-actions/jump-right-2x.gif) · [jump left](basic-actions/jump-left-2x.gif)
- [Native jump key phases](basic-actions/jump-keyframes-1x.png) · [2× key phases](basic-actions/jump-keyframes-2x.png)
- [Editable projects, CharacterPacks and independent-player evidence](basic-actions/README.md)
- [Current verification record](basic-actions/verification-results.json)

The jump-only GIFs play once. The clearly labelled four-action tours repeat for review and include an explicit reset after the jump; this does not change the nonloop CharacterPack timing. Historical authoring review test counts are not executions of this batch.
