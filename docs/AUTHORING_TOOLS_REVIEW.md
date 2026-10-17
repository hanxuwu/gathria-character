# Visual binding, motion editing and undo

This batch continues the reusable Skin Studio from `73e87c67a37c0f8b6b8b9ea1908d57ee86eaac59` on `feat/reusable-character-rig`, draft PR #5. Both parent-commit CI checks passed before editing. The work makes the existing source joints and shared motion data editable in the browser; it introduces no new illustration, rig family, renderer or file version.

## Editing workflow

- Select a limb attachment and drag its shoulder/elbow/wrist or hip/knee/ankle handles in the source canvas. The artwork stays in native right-facing coordinates even when the posed preview faces left. Pointer positions account for actual displayed scale. Handles retain a generous hit area but small visible markers so they do not cover the artwork.
- Focus a handle and use arrow keys for one-pixel movement, or Shift plus arrows for ten pixels. Escape, pointer cancellation or window blur cancels an active drag. Numeric coordinate edits commit on blur or Enter; incomplete numbers remain drafts rather than corrupting the binding. Escape discards a numeric draft.
- Use the motion timeline to select a playback frame, choose its source pose, edit that pose's applicable parameters, change FPS, add a held frame or remove a playback entry. A native-size preview beside the fields shows the same actual pixels as the main preview. Angles display in degrees and remain radians in the stored format. Repeated playback entries share their source pose, so editing it affects every use. Near and far limbs also use opposing half-cycle source poses.
- Undo/redo restores bindings, source PNG replacements, loaded skins/projects and motion edits. A continuous drag is one entry. History retains twenty edits in memory, sharing immutable source image buffers. It is not saved into project files. Preview navigation does not consume history. Ctrl/Command-Z and Ctrl/Command-Shift-Z work outside text/form fields; native field editing keeps its own keyboard behavior.
- Save the complete project ZIP to retain edited motion and art, then export its CharacterPack. A skin ZIP preserves the appearance and bindings; the shared motion library belongs to the full project. Skin swapping preserves motion edits. Undoing a skin/project import also restores the previous loaded binding reset point.

## Compatibility and source ownership

`gathria-rig-authoring` and `gathria-motion-library` stay version 1. Four idle, eight walk and twelve run source poses remain fixed. The existing sequence contract supports repeated/omitted source poses and 1–120 timed playback entries; FPS remains within 1–60. The editor uses those existing fields rather than silently changing old projects or introducing a new export layout.

The renderer, default motion library, baking path, ZIP parsers, old Studio and independent player are unchanged. Default project exports must still decode to the previous batch's pixels. New edited examples are deliberately labeled authoring demonstrations, not a claim that the underlying character art was repainted or visually approved. Source PNGs still derive from the repository's documented V6/earlier artwork.

The main changes are `Studio.tsx`, `BindingCanvas.tsx`, `binding-edit.ts`, `MotionEditor.tsx`, `motion-edit.ts`, `history.ts` and their styles/tests. The shared renderer continues to evaluate the same supplied data locally without Spine or a drawing API.

## Limits

This is a discrete pose and playback-sequence editor for the current family. It does not yet create arbitrary bones, paint individual mesh weights, automatically split whole illustrations, or interpolate a free-form animation curve. Parameter bounds prevent invalid data but cannot guarantee a pleasing pose: inspect the full loop after editing. Strong bends can still compress the source texture. Skin binding and garment ownership require preparation as described in the material guide.

Undo and the playback cursor are session tools, not autosave. A reopened project restores its action, direction, expression and authored motion data, then starts at the first playback entry. Keep the source project ZIP. Production Gathria scene integration and user aesthetic acceptance remain unverified.

## Current verification and delivery

This batch executed **335 unit tests across 24 files**, **38 Chromium E2E tests**, TypeScript and the production build successfully. The twelve new unit cases cover binding coordinate mapping/cancellation, immutable motion edits and bounded transactional history. Four new browser workflows cover real pointer and keyboard editing, one-step undo, incomplete numeric input, shared motion across skins, source PNG replacement, old-project compatibility, actual ZIP round trips and independent playback. The original binding-input browser cases now commit with Enter before checking saved pixels; their previous assertions remain intact.

Manual inspection covered the desktop controls and a 390-pixel mobile viewport, source handles at native size, and the actual-pixel pose preview beside the motion fields. A large opaque handle that covered small source pieces was reduced to a small outlined marker without shrinking the hit target. A binding coordinate could previously reject the first digit before a complete value was entered; draft commits now allow `75 → 80` with one undo step and preserve the previous binding after invalid input.

The actual UI capture delivered **18 PNGs, five GIFs and eight ZIPs**. Two projects reopened and re-exported with exact atlas/manifest equality. Default exports matched the previous batch pixel-for-pixel; the deliberate example changes only run source pose 0, FPS and a held playback entry. Idle/walk pixels are unchanged. Nineteen captured source/script hashes match the delivered files.

After closing Skin Studio, four independent run cases (two skins × both facings) matched all twelve native PNG poses and their sequence. Measured loops were 850–886 ms against 866.67 ms nominal; the held first pose measured 131–151 ms against 133.33 ms nominal. GIFs preserve thirteen timed entries as twelve decoded frames with a combined first-frame hold, totaling 870 ms at GIF centisecond precision. All PNG/GIF frames and ZIP members were decoded, with archive CRC and file hashes checked.

The first capture stopped because its observer assumed the React frame label and canvas paint committed together. The completed capture instead identifies every sampled pose through a unique full-native RGBA match, retaining strict pixel, frame-order and timing checks. No app code changed during this correction. The final browser capture reported no errors, external requests or blocked generator/authoring imports.

- [Actual editing walkthrough GIF](authoring-tools/authoring-workflow.gif)
- [Edited run right](authoring-tools/edited-run-right-2x.gif) · [left](authoring-tools/edited-run-left-2x.gif)
- [Native same-pose comparison](authoring-tools/pose-edit-comparison-1x.png) · [2× comparison](authoring-tools/pose-edit-comparison-2x.png)
- [Editable projects, CharacterPacks and full evidence index](authoring-tools/README.md)
- [Current verification record](authoring-tools/verification-results.json)

Visual inspection covered the native key poses, integer-zoom comparison, desktop/mobile editor and independent player. Character identity, head and height remain stable; existing texture compression at deep knee folds remains. These examples demonstrate editing and reproducible export, not a new art direction or user aesthetic acceptance.

Implementation recovery point: `276a17b2f2e4289df076824841c3525f321d3a8d`, committed and pushed on the existing feature branch. The follow-up delivery commit contains the actual UI/export artifacts and verification records under `docs/authoring-tools/`. The draft PR remains #5 and targets the unmerged skeleton experiment. No merge or deployment is performed.

Earlier counts in the reusable-rig review are historical. This review and the current verification record describe only the executions for this batch.
