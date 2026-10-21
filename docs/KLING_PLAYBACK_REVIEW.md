# Original Kling character playback

> Historical source/artwork delivery record. For the current Kling-only workspace,
> supported files and fresh checks, see [the cleanup review](KLING_FOCUS_REVIEW.md).
> Unrelated legacy editor/CharacterPack V1 compatibility described below was
> intentionally removed; the Kling sources and exports remain unchanged.

This opt-in batch uses the two supplied original videos, not the regenerated
reference-mother illustration or its skeletal reconstruction. The existing
Studio, Skin Studio, default V6 characters and historical exports stay intact.
The aim is to play the approved source appearance faithfully; user visual
acceptance is still pending.

## Open and review

Run `npm run dev`, open `/player.html`, and choose **Try the Kling character pair**.
The same page also accepts a Unified source ZIP by file upload. Choose male or
female, idle/walk/run/celebrate, left/right, pause, and scrub frames. Use **1×**
to inspect native source pixels; the initial smaller preview fits the screen
without changing the stored artwork. Comparison uses a shared playback clock.

- [Source archive](../artwork/kling-playback/prepared/kling-source.zip)
- [Male CharacterPack](kling-playback/exports/male.character.zip)
- [Female CharacterPack](kling-playback/exports/female.character.zip)
- [Review images and animations](kling-playback/README.md)
- [Extraction measurements](../artwork/kling-playback/prepared/extraction-report.json)
- [Browser/export evidence](kling-playback/browser/evidence-index.json)
- [Future modular feasibility](KLING_MODULAR_FEASIBILITY.md)

## Architecture audit and compatibility

Inspection covered `SKIN_PACK_V1.md`, `MOTION_LIBRARY_V2.md`,
`REFERENCE_MOTHER_REVIEW.md`, `WARDROBE_ITEMS_REVIEW.md`, the actual pack
validators, player, skeletal slots, renderer and import/export tests. Those
documents describe several separate authoring formats; they do not mean an
arbitrary whole-body image is already an editable skin.

| Existing component | Reuse or bounded extension |
| --- | --- |
| Independent Player | Same page, animation clock, frame selection, attachment drawing, mirroring and file-loading workflow. Adds source selection, comparison, scrubbing and source-pack download. |
| CharacterPack V1 | Unchanged reader/writer, limits, legacy appearance config and pixel-art semantics. Existing Studio/Skin Studio still export V1. |
| Native CharacterPack | Explicit `schemaVersion: 2` for baked, smooth source art. Same format ID and five-file envelope. Larger bounded atlas, optional celebrate, truthful noneditable recipe and source metadata. |
| Unified source archive | External input only. An explicit adapter validates and losslessly repacks its PNG pixels into native V2; it is never mistaken for native V1. |
| Shared skeletal rig | Actual 11-bone, 192×256 authoring family with registered attachments, mesh/IK and four existing actions. It cannot reproduce these original video frames through automatic fitting. It is untouched. |
| Identity/wardrobe imports | Real registered parts/material masks, currently tied to the existing body family. Source vest, shorts and shoes remain baked into each frame; no editable clothing is claimed. |

The existing bounded ZIP utility now lives in `src/core/bounded-archive.ts`.
Its old skeletal-module path reexports the unchanged implementation for saved
authoring workflows. This lets the standalone player reuse archive validation
without importing any skeletal editor/renderer module.

V2 uses `capabilities: { renderMode: "baked", editableAppearance: false }` and
`scale: { pixelArt: false, integerOnly: false, recommended: 1 }`. Its
`character.json` is a `gathria-baked-character` source/derivation recipe, not a
fabricated V6 appearance configuration. `celebrate` is optional and distinct
from historical one-shot `jump`. V1 files retain their original behavior;
older applications that only understand V1 must reject V2 rather than silently
discard celebration or quantize the art.

The native V2 limits are 8,192 pixels per atlas dimension, 64 Mi pixels decoded
and 64 MiB per archive. The delivered frames are **704×1024**, packed without
resizing into an 11×8 grid (7744×8192). Source/PNG/ZIP validation checks paths,
dimensions, alpha, checksums, bounded inflation, counts, references, timing and
fixed anchors. Atlas packing directly decodes/re-encodes RGBA8: no Canvas
premultiplication, binary-alpha conversion, palette reduction or artwork filter.

## Source extraction decisions

Both originals are 1920×1080, 24 fps, 361 frames. Source hashes, file locations,
crop origins and chroma profiles live in the [selection recipe](../artwork/kling-playback/source/selection.json).
The already committed male video is reused; only the new female original is
added. Derived frames are stored once in the source ZIP. Native exported packs
and reduced review animations are intentional delivery artifacts.

| Action | Zero-based source frames, inclusive | Frames | FPS | Loop duration |
| --- | --- | ---: | ---: | ---: |
| Idle | 336–359 | 24 | 24 | 1000 ms |
| Walk | 26–52 | 27 | 24 | 1125 ms |
| Run | 140–155 | 16 | 24 | 666⅔ ms |
| Celebrate | 253–268 | 16 | 24 | 666⅔ ms |

These replace the earlier 12-fps/80-image candidate archive's selections with
**166 contiguous original frames**. The original uploaded 384×576 archive is
still supported by the adapter; its own timing/order are not rewritten.
There is no ping-pong, duplicated closing endpoint, interpolation or morphing.

Each character uses one constant 704×1024 crop: x=586 for both, y=12 for male,
y=28 for female. No frame is rescaled or independently recentered. The 16-pixel
vertical offset aligns the original standing grounds while retaining each
character's own head/body proportions. Anchor (352,966) is a fixed source-ground
reference, not a guarantee that moving feet stay planted.

Chroma key estimates alpha from relative green dominance using separate
profiles for the originals' different screens. It removes green floor shadows
and performs edge-only green unmix/despill. Every final fully opaque pixel
retains the decoded original RGB exactly. Partially transparent edge RGB and
alpha are estimates, so source-to-matte is not advertised as lossless. From
prepared RGBA PNG through import, atlas, export and reimport, pixel preservation
is exact. No image generation, anatomy reconstruction or runtime AI is involved.

## Visual review and limits

All selected source poses were inspected chronologically and at cycle borders.
The original round head, eyes, short neck, shoulder structure, limbs, clothing,
outlines and smooth shading are retained. The selected arm/head/shoe bounds fit
the fixed crop, with at least 26 native pixels of horizontal clearance before
matting. Native and enlarged transparency reviews check dark and light backgrounds.

- Idle is almost a held pose with original video microtexture/compression
  movement; no breathing motion is invented.
- Walk retains a small original quarter-view body turn and cadence variation.
  Loop-boundary similarity is inspected, not declared mathematically seamless.
- Run preserves original hand/forearm and shoe motion blur, particularly source
  frames 143–145 and 151–154. Those soft forms are present in the video.
- Celebration is one real continuous bounce, with original closed-eye expression.
- Action changes select a different original pose at a stable canvas anchor;
  there is no transition blending or anatomical stabilization.
- Left-facing playback mirrors the right three-quarter source. No unseen left
  artwork is inferred. All previews are in place, with no world-speed claim.
- RGB beneath fully transparent pixels is zeroed during matting. Soft contours
  may still reveal small chroma-key edge differences against strongly contrasting
  backgrounds. The unchanged original videos remain available for comparison.
- GIF review copies use a palette and smaller display size; native PNG and
  CharacterPack pixels are the fidelity reference.
- Baked files support playback/export, not independent garments, expressions or
  bone edits. Full jump integration and modular rebuilding are later work.
- Native source import is substantial: the source ZIP is about 44 MiB and each
  decoded atlas occupies about 242 MiB. Paired playback retains both atlases.
  Real Chromium source imports took about 33–42 seconds in this environment;
  this is a desktop review workflow, not a certified low-memory mobile path.
  Resolution is retained rather than silently reducing the artwork.

## Reproduction and verification

1. `python scripts/prepare-kling-playback.py` verifies source hashes, extracts
   the fixed forward sequences and records every PNG/RGBA hash and matte check.
2. `node scripts/generate-kling-evidence.mjs` imports through the real player,
   exports both native packs and closes the source view before independent replay.
3. `python scripts/render-kling-review.py` renders review media from those actual
   exported atlases and decodes every delivered PNG, GIF and ZIP.
4. Run TypeScript, unit tests, production build and Chromium E2E as recorded in
   the batch's verification results. Historical reports remain historical.

Executed on the final implementation in this batch:

- `npm run typecheck`: passed.
- `npm test`: **549 tests across 44 files passed**.
- `npm run build`: passed; existing large-bundle warnings remain.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`: **63 passed**.
- Actual native source import/export: **166/166 frames exactly equal in RGBA**
  after independent PNG decoding. All original frame indices, timestamps,
  clip order/FPS, fixed anchors and derivation metadata remain intact.
- Fresh standalone context after closing the source page: **16 playback cases**,
  both characters × four actions × both directions; every source position was
  observed through two loop boundaries, with no browser errors or forbidden
  editor/skeletal/source-asset requests.
- Original 384×576 source compatibility also passed in a
  [separate final-code check](kling-playback/browser/legacy-source-check.json).
  The final full native capture omits that optional input; its earlier combined
  run is not substituted for this separate result.
- Every delivered review PNG/GIF, browser PNG, source crop, source ZIP frame
  and exported atlas is decoded. **14 GIFs** retain their stated frame counts
  and cumulative timing within GIF's 10 ms clock. All three delivered ZIPs
  pass CRC checks. The production build's bundled source ZIP matches the
  prepared source hash.

See [verification results and final hashes](kling-playback/verification-results.json),
[browser evidence](kling-playback/browser/evidence-index.json), and
[media validation](kling-playback/artifact-validation.json).

The initial full browser run found two integration defects: the new source
button duplicated the legacy sample button's selector, and its ZIP adapter
imported a generic utility through the skeletal directory, breaking strict
independent-player isolation. The new button now has its own class, and the
unchanged utility moved to core with a legacy reexport. Original assertions
were retained; new baked checks also block all skeletal/experiment modules.
All 11 focused browser checks and the subsequent full 63-test suite passed
after the fixes. Technical checks remain distinct from user visual acceptance.
