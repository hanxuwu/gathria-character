# Implementation status

Current batch: **Kling female native skeletal candidate**, based on merged main
`8dfbf83`, branch `feat/kling-female-native-rig`.

The active project contains two original Kling characters and two separately
registered editable skeletal candidates. Original playback remains the approved
visual baseline. Existing source assets, timing, resolution, alpha and exported
archives remain unchanged; the male candidate retains its original bytes/render.

Implemented:

- Original male/female idle, walk, run, jump and celebrate, comparison and V3 export.
- Each native skeleton: fifteen 704×1056 parts, four static poses, joint edits,
  undo/reset, project save/reopen, PNG and V2 still-pack export.
- Three primary destinations; separate male/female skeleton buttons and retained
  editing sessions. Loaded project identity follows imports in both editor and
  outer workbench.
- Independent V2/V3 and Kling source ZIP loading, local validation and HTTP SHA fallback.
- Final batch verification: 113 unit tests, 17 Chromium E2E tests, typecheck/build,
  real UI exports and independent playback. See the linked records below.

Not implemented: interchangeable outfits/expressions, complete skeletal animation
cycles, independent wrist controls, or production game integration. Existing
shoulder/shorts deformation limits and female hidden-paint shading differences
remain visible and documented. Technical success is not user visual acceptance.

Non-Kling characters, old skin/identity/wardrobe authoring, unrelated labs and
earlier redrawn mother studies were removed in the previous cleanup. They remain
recoverable from Git history; this batch does not reintroduce them.

[Female review and verification](KLING_FEMALE_NATIVE_REVIEW.md) ·
[Female actual exports and downloads](kling-native-female/README.md) ·
[Original source playback](KLING_JUMP_REVIEW.md) ·
[Male candidate](KLING_NATIVE_STUDY_REVIEW.md) ·
[Previous cleanup scope](KLING_FOCUS_REVIEW.md).

Historical review folders retain their original evidence and test counts, which
describe previous commits rather than this batch.
