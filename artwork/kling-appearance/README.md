# Kling hair and gentle face source record

This is an optional head-appearance layer for the two approved Kling motion
characters. The original source ZIPs and all existing clothing assets are
unchanged. Generated portraits are **design donors, not application evidence**.

## Source artwork

- `source/male-reference.png` and `female-reference.png`: exact RGBA extraction
  of frame ID 0 (source video frame 336, 14.00 seconds) from the existing motion
  CharacterPacks. No redraw, background replacement or body rescale.
- `source/soft-crop-design.png`: OpenAI image generation, 2026-10-22. The input
  references were the existing male/female native-study portraits (frame 348).
  The exact request is retained in `source/soft-crop-prompt.txt`.
- `source/soft-bob-design.png`: OpenAI image generation, 2026-10-22, using the
  exact two frame-0 references above. Request: `source/soft-bob-prompt.txt`.
- The four `*-cutout.png` files keep only the generated hair. Generated eyes,
  skin, faces, necks, bodies and garments are discarded. Explicit hand-reviewed
  inner-hairline masks separate the donor artwork; premultiplied resampling
  prevents dark alpha-edge contamination. Small disconnected donor flecks are
  removed. The short bob ends around the ears/jaw; this is not long-hair physics.

All retained source files and registrations have checksums in
`source-hashes.json`. Generated hidden detail is authored supplementary artwork,
not an original Kling video layer. There is no runtime generation call.

## Registration and preparation

`scripts/prepare-kling-head-registration.py` registers all 88 male and 96 female
source poses. Frame 0 has manually placed skull/ear/eye/brow/mouth guides.
Unique SIFT correspondences, adjacent-pose fallback and a bounded skull-contour
fit propagate the head transform; a separate local flow estimate refines facial
guides. Weak motion-blurred frames are marked. Exported anchors are projected
inside the observed source head bounds; the independent hair transform is not
altered by this metadata boundary projection. These are inferred authoring
guides, not original skeletal measurements or recovered layers.

Head bounds include the existing registration polygon's two-pixel raster
tolerance so antialiased source skull edges cannot incorrectly occlude hair as
body pixels. Reviewed fast jump poses apply slight blur to the new hair only,
matching the already blurred source face. The female donor fit has additional
crown coverage to avoid exposing a thin original-scalp strip during running.

`scripts/prepare-kling-appearance.py` masks and fits only the new hair, applies
the per-pose head transform and packs cropped patches. `scripts/kling_gentle_face.py`
uses each original frame's own pixels for compact, smooth brow/upper-eyelid and
smile-corner adjustments plus restrained cheek warmth. It does not replace the
face silhouette. Original half-blinks, blinks and laughter are explicit no-op
entries. Foreground hand regions remain protected.

Runtime banks live in `docs/kling-appearance/banks/{male,female}.zip`; each binds
to the immutable source and clothing-registration SHA-256. Front hair has its
own ownership and source-over alpha. The format also supports a rear-hair layer,
but these short styles use one front layer with body/hand occlusion. No source
skin-color deletion is performed.

Active appearances add transparent padding (left/right 32, top 128, bottom 0),
giving 768×1184 frames and anchor (384,1126). This is an integer translation of
the original pixels, not a smaller body or a modified jump. The original/default
selection keeps 704×1056 and (352,998).

## Reproduce

Use Python dependencies pinned in `scripts/requirements-kling-wardrobe.txt`:

```sh
python scripts/prepare-kling-head-registration.py
python scripts/prepare-kling-appearance.py --character both
```

Registration review JPGs are authoring overlays. Final visual review must use
the actual application PNGs, GIFs and CharacterPacks documented in
`docs/kling-appearance/README.md`.
