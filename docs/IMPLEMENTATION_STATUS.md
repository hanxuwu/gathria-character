# Implementation status

Current batch: **Kling registered wardrobe**, based on motion-flow commit
`b5edec14df9a748fa35a069d977fd4e0fba195aa`, branch `feat/kling-wardrobe`.
The wardrobe uses those complete motion candidates; original default packs and
optional skeletal candidates remain unchanged.

Follow-up: **dress fitting V2** improves the female waist overlap and side
clearance using distinct garment IDs; older saved clothes remain unchanged.
Completed direct-playback one-shots now replay with Play. [Current refinement,
actual exports and verification](kling-wardrobe/fit-v2/README.md).
Independent playback retains decoded atlas pages where supported to avoid the
first cross-page stall reproduced after exercising all actions; source pixels,
frame sequences and action timing stay unchanged.

The primary workflow uses the two original Kling characters' own sprite frames.
The two registered skeletal candidates remain optional. Original playback is the
visual baseline: source artwork, resolution, alpha, anchors and existing archives
remain unchanged. New action projects can explicitly adjust clip selection and
timing without changing any source PNG bytes.

Implemented:

- A third workbench tool, Wardrobe, with direct male/female library entries.
  Seventeen per-pose authoring anchors, source/registration-bound garment banks,
  12 casual/wedding clothing items across the two bodies, independent slots,
  all five actions and both facings, source comparison and anchor overlays.
  Editable projects embed source, registration and clothes for offline reopening.
  Actual composited CharacterPacks remain independently playable in V3 format.
  All-frame preflight checks ownership and protects the original head/hand pixels.
  Downloadable authoring kits retain complete per-pose masks and inventories.

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
- Three primary destinations; direct wardrobe and separate male/female skeleton buttons and retained
  editing sessions. Loaded project identity follows imports in both editor and
  outer workbench.
- Independent V2/V3 and Kling source ZIP loading, local validation and HTTP SHA fallback.
- Current verification, actual UI exports and independent playback evidence are
  recorded in the [wardrobe review](kling-wardrobe/README.md). Earlier motion,
  keyframe and skeleton test counts belong to their respective commits.

Not implemented: sprite redraw/interpolation, arbitrary frame reordering,
interactive per-frame hold editing or alignment, interchangeable expressions, complete
skeletal animation cycles, independent wrist controls, or production game integration.
Wardrobe requires complete pose-specific clothing assets; arbitrary single-image
autofitting, new sleeve silhouettes and physical cloth simulation are not implemented. Existing
shoulder/shorts deformation limits and female hidden-paint shading differences
remain visible and documented. Technical success is not user visual acceptance.

Non-Kling characters, old skin/identity/wardrobe authoring, unrelated labs and
earlier redrawn mother studies were removed in the previous cleanup. They remain
recoverable from Git history; this batch does not reintroduce them.

[Registered wardrobe and exports](kling-wardrobe/README.md) ·
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
