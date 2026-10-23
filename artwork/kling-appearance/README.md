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
own ownership and source-over alpha. Male bob revision 4 also uses a rear-hair
layer; other current short styles use one front layer with body/hand occlusion. No source
skin-color deletion is performed.

### Ear-edge revision (bank content revision 2)

The first exported review missed an anatomical registration mismatch during
crouching. The original source ear drops relative to the stable scalp during
facial squash; a single skull transform left a 20–26 px scalp crescent above
the ear in poses 86–88. `scripts/kling_hair_ear_fit.py` now smoothly blends the
new hair's near-ear arch and sideburn toward the existing independent face
registration, with a bounded support that leaves the crown and central fringe
fixed. No original ear, face or body is redrawn, scaled or remapped. The inverse
sampling uses premultiplied alpha; the existing jump blur is applied afterward.

Separately, the crop donors contained enclosed peach-colored skin between the
far-side locks, and bob donors retained skin along their inner edges. Reviewed
source-coordinate exclusions in `scripts/kling_hair_donor_mask.py` remove these
donor remnants. They only reduce cutout alpha, preserving all donor RGB and
hair highlights. They never inspect or delete the character's skin by color.
The original design sheets and prompts remain unchanged; no new generated art
was needed for this repair.

That revision's bank IDs end in `appearance-v2`; the bank schema is still V1. Existing
editable projects retain their embedded previous bank and exact old appearance.
The original review and packages
remain available beside [ear-edge review](../../docs/kling-appearance/ear-edge-review/README.md).

### Raster-fringe metadata revision (content revision 3)

Full-frame review found fine rectangular lines inside the hair where original
scalp raster pixels extended beyond the head box and were treated as body.
`scripts/revise-kling-hair-occlusion.py` adds an explicit three-native-pixel
top/side envelope, with the bottom edge unchanged. Two additional source-space
foreground polygons in `scripts/kling_hair_foreground.py` protect the female
thumb/wrist interiors in celebration poses 78 and 79. The old coarse boundary
cut across opaque hand pixels, letting hair form a triangular patch inside the
hand. The original foreground regions are retained; the additions cover only
reviewed original opaque hand pixels and leave the transparent gap untouched.
The bank's provenance records the fringe correction first, then the supplemental
hand correction. Its statement that foreground masks stay unchanged refers to
the retained original polygons; the subsequent note documents the two additions.
All 20 atlas and ownership PNG entries are byte-identical to revision 2. No new
generation, painting, resampling, head/face registration or source extraction was
performed. The full preparation script now emits the same metadata rule.

That revision's bank IDs end in `appearance-v3`. Old embedded banks keep their exact
behavior; the workbench's explicit preview/save-copy flow opts into this update.
[Revision 3 review and metadata verification](../../docs/kling-appearance/stability-review/README.md).

### Male ear overlap (content revision 4)

The bob donor contains a continuous strand behind and beneath its near ear.
The earlier single front-hair cutout removed that strand, leaving an oversized
transparent opening between the original Kling ear and the new hair. Following
the ear's motion alone could not close the missing rear silhouette.

`scripts/kling_hair_rear_lock.py` recovers only that existing hair with a reviewed
source-coordinate polygon. `source/male-soft-bob-rear-cutout.png` retains original
donor RGB and natural lower-edge alpha; no donor skin or new painted pixels are
introduced. A rear-only horizontal registration and shear tuck its lower end
behind the original head/neck. The existing renderer's `hair-back` layer places
it behind the original ear, head, hands and clothing.

`scripts/kling_hair_ear_overlap.py` also moves the male styles' existing hair
locally over the upper ear: a bounded smooth displacement of at most (10, 13)
native pixels near the reference ear, composed with the prior per-pose ear fit.
The crown, central fringe and original face are not transformed. Premultiplied
sampling and the existing new-hair-only jump blur are retained. All 88 male poses
are rebuilt; the female bank remains byte-identical revision 3. The original
generated design sheets, four front cutouts and source registrations are unchanged.

This is an offline reuse of the retained generated donor, not a new image-generation
call or a recovered original video layer. Male bank ID is now
`kling-male-appearance-v4`; schema stays V1. Existing saved banks keep their original
result until explicitly previewed and saved as a separate updated copy.
[Matched application exports and compatibility audit](../../docs/kling-appearance/ear-overlap-review/README.md).

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

## Additional side part and tucked bun (2026-10-23)

`source/expansion-design.png` is a new OpenAI-generated design donor. Its inputs
were the exact original `male-reference.png`, `female-reference.png` and the
existing bob design sheet as a rendering reference. The complete instruction
is retained in `source/expansion-prompt.txt`. It adds a swept side part for the
male and a compact low bun for the female. Generated faces, ears, necks and
clothing are excluded from runtime assets.

`scripts/kling_hair_expansion.py` retains explicit donor-coordinate front/rear
polygons and hair-only fitting parameters. Four-times sampled polygon masks
keep the original donor RGB, remove generated skin at hairline gaps, and split
the rear locks/bun into a layer behind the unchanged source head and hands.
Any rear lock geometry is newly authored supplementary artwork, not a recovered
original Kling layer. No original face or body pixels are moved or repainted.

`scripts/append-kling-hair-expansion.py` appends the two new styles from the
immutable release `4d2efaf` instead of repacking old pages. Male content becomes
revision 5 and female revision 4; the old style mappings and atlas PNG entries
remain exact. The existing local ear-follow fit and reviewed fast-pose blur
apply to the new hair only. Derived front/back cutouts and their source hashes
are saved with the design sheet. Current reproduction is:

```sh
python scripts/append-kling-hair-expansion.py --character both
python scripts/build-kling-wardrobe-catalog.py
python scripts/verify-kling-hair-expansion.py
```

The earlier `prepare-kling-appearance.py` commands reproduce the previous
two-style release; they do not include this appended expansion. The Git baseline
must be available to reproduce the expansion. [Actual application exports and
new-source visual limits](../../docs/kling-appearance/expansion-review/README.md)
are distinct from the generated design donor.
