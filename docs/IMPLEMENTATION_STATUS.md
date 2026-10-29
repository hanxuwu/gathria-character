# Implementation status

Latest side-view candidate: **visual garment fitting, contact refinements and
measured cold-load scheduling** on `feat/kling-side-fitting-workbench`, based on
unmerged PR #53 (`220ea2f`). The new panel reuses native mask editing, bound drafts
and reviewed candidate import. Cloth-only sleeve/hem fits and a local nape repair
preserve original source frames and timing. [Current implementation and evidence](kling-side-fitting/README.md).


Latest side-view follow-up: **clothing polish and practical review tools**.
Reviewed male walk hand boundaries release old shorts, female action-consistent
skirt artwork reduces fold jumps, and a bounded male rear-hair correction covers
an exposed scalp strip. Slow preview, integer detail and source/look-bound issue
notes are available inside the existing side-view workspace. Offline painting
guides and garment preflight reuse current contracts. The loader parallelizes
downloads and retains only bounded verified source ZIP bytes; mutable outfits
and old saved projects remain independently validated.
[Current evidence, checks and visual limits](kling-side-polish/README.md).

Previous side-view candidate: **tailored clothes and hair**, separate from the
original material collection. Male shirt/trousers and female blouse/skirt use
new painted silhouettes; each character has one side-view hairstyle and three
hair colors. A separately source-reviewed registration corrects hand/thigh and
head/shoulder ownership errors without mutating old packs or disabling validation.
Action queuing/endpoint feedback and directional-key handling are also refined.
[Current scope, actual exports, checks and limitations](kling-side-expansion/README.md).
The chronological notes below include earlier batches and their original counts.

Current expansion: **male Side part and female Tucked bun**. Each character
has one additional source-bound hairstyle, with separate front/back hair and
the existing three colors, face choices, clothes and motion. Released atlas
PNG bytes and previous style mappings are retained; new patches are appended.
Catalog style summaries expose the new choices before the bank loads, while
saved/custom banks retain their own styles until explicitly upgraded as a copy.
[Actual exports, preservation checks and limits](kling-appearance/expansion-review/README.md).

Previous follow-up: **male ear overlap**. The bob's missing donor rear strand is
restored behind the original ear/head, and existing front hair locally overlaps
the upper ear. Male bank content is revision 4; source pixels, face layers,
registrations, timing and female revision 3 remain unchanged. Existing projects
retain their embedded banks until an explicit preview and save-copy update.
[Actual exports, compatibility checks and remaining limits](kling-appearance/ear-overlap-review/README.md).

Previous follow-up: **appearance workflow and raster-fringe stability**. Existing
short styles now have real-export thumbnails and named color swatches. Older
embedded banks can be explicitly compared at the same pose and saved as an
updated copy, preserving the original session and its settings. Content revision
3 adds a three-pixel top/side hair occlusion envelope to cover original scalp
raster remnants; all atlas PNG bytes, face ownership, lower head edges and source
timing remain unchanged. Old banks retain their exact previous occlusion behavior.
Two reviewed foreground additions also prevent female celebration poses 78/79
from drawing hair over the original thumb and wrist. Original hand pixels and
all existing masks are retained; no source artwork is repainted.
[Current checks, workflow evidence and remaining visual issues](kling-appearance/stability-review/README.md).

Current review batch: **Kling hair and gentle face customization**, branch
`feat/kling-head-customization`, based on merged main `1dc3e56`.
The existing wardrobe now offers two short hairstyles on both approved Kling
characters, three hair colors and a source-derived gentle face preset. Original
blinks, half-blinks and laughter are retained. Separate head registrations cover
all 184 motion poses; active appearances add transparent headroom and translate
the ground anchor without scaling source pixels. Editable wardrobe V2 embeds
the head assets; V1 and independent CharacterPack V2/V3 remain supported.
[Current appearance review, verification and limits](kling-appearance/README.md).

Follow-up correction: appearance content revision 2 locally follows the source
ear during crouching while retaining the stable crown/fringe, and removes donor
skin trapped along hair cutout edges. The original ear/face/body and action
timing stay intact. Existing saved V2 projects retain their embedded older bank;
new catalog sessions use the corrected bank. [Matched ear-edge comparisons and
current exports](kling-appearance/ear-edge-review/README.md).

Previous batch: **Kling wardrobe cold-start preparation**, branch
`perf/kling-cold-start`, based on merged main `d0bf0ad`.
Cold source ZIP parsing and lossless PNG preparation now run in cancellable
workers, with bounded native zlib decoding, actual progress and full appearance
validation before playback. Worker infrastructure failure retains checked fallback
behavior. [Measurements, actual exports and limits](kling-wardrobe/cold-start/README.md).
The previous [garment loading reuse](kling-wardrobe/loading-reuse/README.md) remains
in place: private checked archives/pages speed up first and repeat outfit selection.

The registered wardrobe uses the complete motion candidates introduced at
`b5edec14df9a748fa35a069d977fd4e0fba195aa`; original default packs and optional
skeletal candidates remain unchanged.

Current artwork: **clothing seam and hem fit polish**. Male top V2 removes
copied interior tank ink, joins shoulder sampling and fits the jacket's real
lower contour. Female dress V4 repairs painted hem extraction and its foreground
leg/shoe boundary. Separate versioned garment IDs preserve existing projects;
source packs, original registration and anchors stay unchanged.
[Current actual-export review](kling-wardrobe/fit-polish/README.md). The earlier
[complete outfits](kling-wardrobe/full-outfits/README.md) remain the before baseline.
The subsequent [loading experiment](kling-wardrobe/fit-polish/loading/README.md)
is retained for review but not adopted: measured browser startup gains were
inconsistent. That row-filter experiment remains excluded; this batch changes
decompression and thread placement while retaining the pixel reconstruction.

The preceding [dress fitting V2](kling-wardrobe/fit-v2/README.md) remains the
female before baseline. Its direct-playback replay and retained atlas decoding
fixes remain in place without changing source pixels or action timing.

The primary workflow uses the two original Kling characters' own sprite frames.
The two registered skeletal candidates remain optional. Original playback is the
visual baseline: source artwork, resolution, alpha, anchors and existing archives
remain unchanged. New action projects can explicitly adjust clip selection and
timing without changing any source PNG bytes.

Implemented:

- A third workbench tool, Wardrobe, with direct male/female library entries.
  Seventeen per-pose authoring anchors, source/registration-bound garment banks,
  16 casual/wedding clothing items across the two bodies, independent slots,
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
autofitting and physical cloth simulation are not implemented. The new sleeve
items have finite source-specific pose banks, not a general sleeve generator. Existing
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
