# Native side-view painting templates

The offline helper [kling_side_authoring.py](../../../scripts/kling_side_authoring.py)
extracts the exact frozen male107/female102 source frames, exposes all 17 fitting
anchors, exports partial source-visible limb hints, and packs new-cut clothing
into existing garment V1. Sources remain 512×768, 24 fps, four actions and anchor
(256,710). No body pixels, animation frames or runtime protection rules change.

The tailored collection uses **separate reviewed registration files**. Original
side-workspace registration and material garments retain their original hashes.
Inspection found original hand polygons on thighs/knees and head polygons
crossing shoulders in moving poses. These are corrected from native source
evidence in the new edition, rather than weakening compositor protection.

| Character | Source SHA-256 | Tailored registration SHA-256 |
| --- | --- | --- |
| Male | `7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42` | `7fa05a051d6dc1aa7184aaf484f82bb512042d276189606eee9da366d65cb43e` |
| Female | `ee6d20ac1b6c973043a28bc7b0508cf4f3b1ea4f373424b0de75d88d724f955d` | `7f49437c617e01141622e1ca3d463347edf51adce068a344c01d545e58567cef` |

## Files and evidence

- [Male registration](../../../artwork/kling-side-expansion/templates/male.registration.json)
  and [review audit](../../../artwork/kling-side-expansion/templates/male.registration-audit.json).
- [Female registration](../../../artwork/kling-side-expansion/templates/female.registration.json)
  and [review audit](../../../artwork/kling-side-expansion/templates/female.registration-audit.json).
- [Male native templates](../../../artwork/kling-side-expansion/templates/male/index.json):
  run frame48 / male-1885 source141 and jump frame97 / male-2360 source240.
- [Female native templates](../../../artwork/kling-side-expansion/templates/female/index.json):
  run frame49 / female-1927 source150 and jump frame95 / female-2394 source243.
- [Male protection masks](../../../artwork/kling-side-expansion/templates/male/protection/index.json)
  and [female protection masks](../../../artwork/kling-side-expansion/templates/female/protection/index.json)
  cover all209 frames with exact source/registration/RGBA and PNG hashes.
- [Selected male hand corrections](source-review/male-hands-selected.jpg),
  [all male jump head corrections](source-review/README.md), and
  [female source review](source-review/qa-female/README.md).

Each template includes an unchanged native source PNG, transparent paint layer,
guide overlay, single-channel segment-label PNG, uncertainty PNG, and JSON with
exact source video/frame IDs. Source PNGs retain exact RGBA; the guide is a
separate review image. Pink points are visible estimates; orange points and
dashed lines are hidden or low-confidence estimates; green outlines are reviewed
head/hands. Hatched skin hints indicate ambiguous limb association.

The eight limb labels are source-visible upper arms, forearms, thighs and shins
on the estimated near/far sides. Only independent partial warm-skin proof pixels
are labelled. Pale highlights, ink, blur and occluded regions can be absent.
Closest-anchor assignment is a painting hint, **not exact anatomy, a recovered
skeleton, an ownership permission, or a proven depth order**. Inspect each actual
pose where limbs cross. The masks must never fabricate hidden arms or legs.

## Author and pack

Run from the repository root with Python, NumPy and Pillow:

```python
from pathlib import Path
import sys
sys.path.insert(0, "scripts")
from kling_side_authoring import load_context, pack_garment

ctx = load_context(
    "male",
    registration_path="artwork/kling-side-expansion/templates/male.registration.json",
)
source = ctx.frames[48]                 # read-only native uint8 RGBA
anchors = ctx.registered[48]["points"] # all 17 anchors, confidence/visibility
guides = ctx.source_visible_segments(48)
protected = ctx.protected_mask(48)      # head/hands AND original source alpha>0
metadata = ctx.frame_metadata(48)       # action, source video/frame and hashes

# Provide every frame. These are full final RGBA paintings, not resized sprites.
paintings = {fid: rgba.copy() for fid, rgba in ctx.frames.items()}
# ...paint native pose-specific cloth into paintings...
audit = pack_garment(
    ctx, "my-side-shirt-v1", "My side shirt", "top", paintings,
    Path("/tmp/side-expansion/my-shirt.garment.zip"),
    "Describe the actual artwork method, source observations and limitations.",
)
```

For isolated cloth RGBA, pass `painting_mode="patch"` and an explicit
`ownership={frameId: bool_mask}` dictionary. Every nonowned RGBA byte must be zero.
In default composite mode, omitted ownership is inferred from byte differences;
with explicit ownership, every outside pixel must equal the source exactly.
Explicit owned transparency erases old cloth. New sleeves, trousers and hems may
cover source arm/leg skin and extend the silhouette inside the native canvas.
Head/hands cannot be owned, even when a patch would copy the same source bytes.

The packer crops sparse patches, zeroes nonowned pixels, emits RGBA8 PNG pairs
with binary ownership alpha, and binds both exact hashes. It requires every
registered frame once, at most4 pages and32 Mi pixels per atlas kind, native crop
bounds, at most64 MiB compressed/expanded archive bytes and strict V1 metadata.
Unchanged poses use valid transparent1×1 records. PNG color-profile chunks are
copied exactly from the source. Audit JSON stays outside the strict garment ZIP.

`ctx.masks(frameId)` exposes the **original-cut** top/bottom/shoes masks and
partial skin proof. Their hashes are checked against the original registration
audit. They remain useful source observations; they do not limit new cloth to
the original tank and shorts silhouette. To load the unchanged old edition,
omit `registration_path`.

## Review and reproduction

All107 male and102 female source/protection contacts were reviewed. The new
registration audits retain before/after polygons, source RGBA hashes, reasons,
added/removed source-visible coverage and any changed anchors. Male idle regions
remain unchanged; moving hand windows were reviewed individually and traced
conservatively around observed skin and source ink. Existing visible wrist
guides already inside the real hand were retained; misplaced guides receive
explicitly low-confidence contour-attachment proposals. Female changes come
from the separate native source review. These are authoring estimates, not
anatomical measurements.

Review proposals live under
[`artwork/kling-side-expansion/templates/source-review`](../../../artwork/kling-side-expansion/templates/source-review).
`apply_registration_reviews(ctx, changes, output_path)` applies explicit reviewed
geometry to a separate file, verifies source/frame hashes, records before/after
coverage and refuses to overwrite either frozen registration. It does not
automatically discover or approve anatomy corrections. The male hand review
reproducer additionally uses SciPy; its manual source windows are persisted.
[Concave source contact refinements](source-review/male-concave-hands/README.md)
remove reviewed tank/thigh bridges while retaining observed hand ink.
The [final run contact review](source-review/male-run-contact/README.md) supersedes
the earlier color-assisted run-edge witness with native observed contours; narrow
blended source ink/AA margins are deliberately retained. Female
frame31 also corrects the visible waistRight attachment from the far forearm to
the actual tank contour; no female head/hand protection changes in that update.
Run `python artwork/kling-side-expansion/templates/source-review/consolidate.py`
to reproduce both separate registrations from the persisted source reviews.

```sh
python scripts/kling_side_authoring.py check
python scripts/kling_side_authoring.py templates --output /tmp/side-expansion/templates
python docs/kling-side-expansion/templates/verification/check_helper.py
node_modules/.bin/esbuild docs/kling-side-expansion/templates/verification/runtime-check.ts --bundle --platform=node --format=esm --outfile=/tmp/side-expansion/templates/verification/runtime-check.mjs
node /tmp/side-expansion/templates/verification/runtime-check.mjs
node_modules/.bin/esbuild docs/kling-side-expansion/templates/verification/candidate-check.ts --bundle --platform=node --format=esm --outfile=/tmp/side-expansion/templates/verification/candidate-check.mjs
node /tmp/side-expansion/templates/verification/candidate-check.mjs
```

The default `templates` command exports original-edition difficult poses to
temporary storage. For tailored templates use `export_templates(ctx, directory,
frame_ids)` with the explicit reviewed context above.

Verification records: [Python validation](verification/python-checks.json),
[existing runtime cross-check](verification/runtime-checks.json), and
[candidate registration import](verification/candidate-registration-checks.json),
plus the final [source/template/mask binding check](verification/artifact-checks.json).
All209 replacement/erasure/extension fixtures match the actual TypeScript
compositor byte for byte, and its protection raster matches the Python helper.
Missing frames, protected ownership, nonbinary ownership and nonowned patch
bytes are rejected. Both candidate registrations import through the existing
strict V1 runtime and preserve all original RGBA frames exactly.

Bulk native contacts and temporary fixture banks live under
`/tmp/side-expansion/templates`; only selected evidence is retained here.
