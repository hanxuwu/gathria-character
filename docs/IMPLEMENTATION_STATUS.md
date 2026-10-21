# Implementation status

Current batch: **Kling motion cadence and action flow**, based on main `fd914ef`,
branch `feat/kling-motion-flow`.

The primary workflow uses the two original Kling characters' own sprite frames.
The two registered skeletal candidates remain optional. Original playback is the
visual baseline: source artwork, resolution, alpha, anchors and existing archives
remain unchanged. New action projects can explicitly adjust clip selection and
timing without changing any source PNG bytes.

Implemented:

- Separate motion-flow candidates restore moving source poses (88 male / 96
  female drawings). Reviewed phase routes queue action changes at support or
  landing boundaries; the complete one-shot jump recovers upright before the
  next action or idle. Paused inspection remains immediate. Independent ZIPs
  carry exact action snapshots and routes, which are disabled after clip edits.
- Separate male/female keyframe loop candidates with 52 distinct source drawings
  each, explicit pose holds, all five repeating actions and existing V2 export.
  Jump is a repeated crouched hop; the original remains a full one-shot. A visible
  review link opens the candidates without replacing default playback or art.
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
- Current verification and actual UI/export evidence are recorded in the
  [motion review](KLING_MOTION_REVIEW.md). The earlier 120 unit / 25 Chromium
  counts belong to the keyframe batch, not this one. The subsequent main E2E
  failure is documented separately; it is not relabeled as a passing run.

Not implemented: sprite redraw/interpolation, arbitrary frame reordering,
interactive per-frame hold editing or alignment, interchangeable outfits/expressions, complete
skeletal animation cycles, independent wrist controls, or production game integration. Existing
shoulder/shorts deformation limits and female hidden-paint shading differences
remain visible and documented. Technical success is not user visual acceptance.

Non-Kling characters, old skin/identity/wardrobe authoring, unrelated labs and
earlier redrawn mother studies were removed in the previous cleanup. They remain
recoverable from Git history; this batch does not reintroduce them.

[Motion cadence and action flow](KLING_MOTION_REVIEW.md) ·
[Keyframe loops and visual limits](KLING_KEYFRAMES_REVIEW.md) ·
[Sprite actions and persistence contract](SPRITE_ACTIONS_REVIEW.md) ·
[Female review and verification](KLING_FEMALE_NATIVE_REVIEW.md) ·
[Female actual exports and downloads](kling-native-female/README.md) ·
[Original source playback](KLING_JUMP_REVIEW.md) ·
[Male candidate](KLING_NATIVE_STUDY_REVIEW.md) ·
[Previous cleanup scope](KLING_FOCUS_REVIEW.md).

Historical review folders retain their original evidence and test counts, which
describe previous commits rather than this batch.
