# Original Kling jump: implementation and review

> Historical source/artwork delivery record. For the current Kling-only workspace,
> supported files and fresh checks, see [the cleanup review](KLING_FOCUS_REVIEW.md).
> Unrelated legacy editor/CharacterPack V1 compatibility described below was
> intentionally removed; the Kling sources and exports remain unchanged.

The existing independent player now offers a genuine one-shot **Jump** for both
original Kling characters. Open `/player.html`, choose **Try the Kling character
pair**, then **Jump**. It plays the original takeoff/airborne/landing sequence,
holds the final frame and offers replay. Pause, frame scrubbing, left/right,
comparison, source import and portable export retain their existing controls.

[Actual previews and packs](kling-jump/README.md) ·
[Source selection and provenance](../artwork/kling-jump/README.md).

## Source and visual decisions

Both clips use original frames 171–209 at 24 fps, 39 frames / 1.625 s. Frames 171–177
anticipate, 178–179 take off, 180–189 are airborne, 190 touches down, 191–197 absorb
landing and 198–209 recover. These are continuous forward original frames, not
reordered celebration, a translated standing sprite, interpolated poses or a
new skeletal rendering.

The old crop cut the apex. A common 32 px transparent top extension makes the
canvas 704×1056 and anchor (352,998). Every frame receives the same extension.
Removing this extension from the old four clips yields all 166 previous RGBA
frames exactly. Visible proportions, in-frame movement and position relative
to the anchor remain unchanged. Every fully opaque pixel retains source RGB.

The original source itself cuts a small scalp arc at frames 183–186. Padding
recovers pixels outside the old crop but cannot recover pixels outside the
video. The review includes the original source and actual exported apex so
this limit remains visible. The clip also retains source motion blur and a
small pose change when switching back to the separately recorded idle clip.
No blend or corrective redraw is applied.

## Why native V3 is needed

The previous 83 original frames nearly filled one 8192-bounded atlas. Adding 39
original frames while extending the transparent canvas cannot fit that atlas
without dropping or shrinking approved artwork. V3 explicitly adds pages:

- `spritesheet` remains the primary page; `additionalSheets` lists the others.
- Every V3 frame has a required zero-based `page` alongside its rectangle.
- All pages keep identical native frame dimensions, anchor and playback rules.
- The package contains every declared PNG, manifest, recipe and documentation.
- Each image retains the 8192 dimension / 64 Mi-pixel limits. Total pages are bounded
  to 4, aggregate decoded pixels to 128 Mi, and the ZIP to 64 MiB.
- Complete ZIP import is required for V3; the old single-PNG form clearly rejects
  it. Consumers that only know V1/V2 must reject V3 rather than discard pages.

Old V1/V2 packages, five-file envelopes and single-sheet writers remain valid.
The old four-action source archive is untouched and still produces V2. Optional
source `jump_once` is validated with `loop:false` and `repeat:0`. Missing jump
remains unavailable; celebration never substitutes for it. The recent HTTP
SHA-256 fallback is retained and tested with this batch.

Implementation: `src/core/baked-source.ts`, `pack-v3.ts`, `pack.ts`, `types.ts`,
`src/consumer/player.ts`, `PackPlayer.tsx`; preparation and evidence scripts are
under `scripts/`. No Studio default, skeletal motion or historical artwork is
changed.

## Verification and remaining limits

Current-batch results are recorded in [verification](kling-jump/verification-results.json),
[browser evidence](kling-jump/browser/evidence-index.json), and
[media validation](kling-jump/artifact-validation.json). Earlier four-action
and HTTP reports remain historical. Tests and exact-pixel checks establish
technical playback fidelity, not final user visual acceptance.

This batch passed typecheck, production build and 582 unit tests. The initial
full browser run passed 65 tests and exposed one canvas-polling sampling issue;
after fixing that observation, all five focused playback tests passed. Actual
native exports passed 20 independent action/direction cases after closing the
source context, including all 39 jump positions in each character/direction.
Independent decoding matched all 244 source RGBA frames and all 166 historical
frames. Five GIFs and all delivered PNGs and ZIPs passed decode/integrity checks.
The logs retain earlier failed attempts separately from successful final checks.

The expanded native source ZIP is about 62.4 MiB. Each character uses two pages
(7744×7392 and 6336×5280), about 346 MiB decoded RGBA, or about 692 MiB for both. Original-resolution imports and paired decoded
atlases are still substantial desktop operations: the final initial import took
58.08 seconds in this environment. This change
does not claim mobile memory optimization. Runtime uses local bundled assets
and deterministic playback without a drawing API. Editable wardrobe, new jump
poses, smoother source transitions and production Gathria scene integration
remain separate work.
