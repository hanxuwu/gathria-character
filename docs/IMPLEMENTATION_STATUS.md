# Implementation status

Current batch: **Original sprite action authoring**, based on `d583cda` from
the female native candidate in PR #22, branch `feat/kling-sprite-actions`.

The primary workflow uses the two original Kling characters' own sprite frames.
The two registered skeletal candidates remain optional. Original playback is the
visual baseline: source artwork, resolution, alpha, anchors and existing archives
remain unchanged. New action projects can explicitly adjust clip selection and
timing without changing any source PNG bytes.

Implemented:

- Original male/female idle, walk, run, jump and celebrate, comparison and V3 export.
- Sprite action workspace: frame stepping, first/last frame inspection,
  contiguous range selection, FPS and loop settings, undo/reset, self-contained
  project save/reopen and export through the existing CharacterPack format.
- The independent player consumes edited packs without loading authoring tools.
- Each native skeleton: fifteen 704×1056 parts, four static poses, joint edits,
  undo/reset, project save/reopen, PNG and V2 still-pack export.
- Three primary destinations; separate male/female skeleton buttons and retained
  editing sessions. Loaded project identity follows imports in both editor and
  outer workbench.
- Independent V2/V3 and Kling source ZIP loading, local validation and HTTP SHA fallback.
- Current verification and actual UI evidence are recorded in the
  [sprite actions review](sprite-actions/README.md). Historical female-candidate
  counts (113 unit tests and 17 Chromium E2E tests) describe the previous batch.

Not implemented: sprite redraw/interpolation, arbitrary frame reordering,
per-frame durations or alignment, interchangeable outfits/expressions, complete
skeletal animation cycles, independent wrist controls, or production game integration. Existing
shoulder/shorts deformation limits and female hidden-paint shading differences
remain visible and documented. Technical success is not user visual acceptance.

Non-Kling characters, old skin/identity/wardrobe authoring, unrelated labs and
earlier redrawn mother studies were removed in the previous cleanup. They remain
recoverable from Git history; this batch does not reintroduce them.

[Sprite actions and persistence contract](SPRITE_ACTIONS_REVIEW.md) ·
[Female review and verification](KLING_FEMALE_NATIVE_REVIEW.md) ·
[Female actual exports and downloads](kling-native-female/README.md) ·
[Original source playback](KLING_JUMP_REVIEW.md) ·
[Male candidate](KLING_NATIVE_STUDY_REVIEW.md) ·
[Previous cleanup scope](KLING_FOCUS_REVIEW.md).

Historical review folders retain their original evidence and test counts, which
describe previous commits rather than this batch.
