# Kling-only workspace delivery

This batch removes unrelated characters and tools while preserving both original
Kling characters and the male native skeletal candidate. It does not redraw art
or fix the candidate's existing deformation limits.

- [Desktop library with the visible skeleton button](workspace/library-desktop.png)
- [Mobile library](workspace/library-mobile.png)
- [Edited male skeletal workbench](workspace/workbench-skeleton-edited.png)
- [Original male player](workspace/male-player.png) · [Female player](workspace/female-player.png)
- [Native independent player after the editor was closed](../kling-native-study/iterations/kling-focus/independent-player.png)
- [Current native editable project](../kling-native-study/iterations/kling-focus/kling-male-native-study.project.zip)
- [Current native static-pose CharacterPack](../kling-native-study/iterations/kling-focus/kling-male-native-stills.character.zip)
- [Original male V3 pack](../kling-jump/exports/male.character.zip) · [Female V3 pack](../kling-jump/exports/female.character.zip)
- [Actual browser verification](browser-evidence.json)
- [Source/export preservation and male video relocation](source-preservation.json)
- [Current tests and logs](verification-results.json)
- [Cleanup scope, removed formats and remaining limits](../KLING_FOCUS_REVIEW.md)

The full current local run passed 109 unit tests, 13 Chromium E2E tests,
TypeScript and production build. Actual browser evidence covers both originals'
five actions in two directions, byte-identical original exports, native joint
editing/save/reopen, and independent static-pose display after closing authoring.
49 PNGs and three exported ZIPs decode successfully with CRC checks.

Original videos, source selections and prepared imagery are retained. The male
video moves from the old mother-study folder to `artwork/kling-playback/source/male.mp4`
with the same bytes/SHA256. Only the two recipes' video path changes; their frame
selection, crop, alpha parameters and source hashes are unchanged.
