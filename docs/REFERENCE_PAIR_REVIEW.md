# Theo and Rose: reference-guided character pair

This batch adds a coordinated navy-suit character and coral-dress character to
the portable identity/wardrobe system. Rounded faces, grouped chestnut hair,
warm skin, floral details and three complete expressions follow the user's
reference direction. Actual assembled output remains the review target.

The branch starts from `cd89d61` on the unmerged portable-identities draft.
Source recovery commit `7c71e06` saves the three original image-generation
outputs and exact prompts; `562d870` saves the registered pair and `a87bd61`
repairs the remaining collar opening found in actual exports.
Existing runtime, rig, motion and historical assets
are retained; this is an asset-only addition on a separate stacked draft.

## Actual output for review

- Pair: [native](reference-pair/final/pair-1x.png),
  [2×](reference-pair/final/pair-2x.png).
- Expressions: [2×](reference-pair/final/expressions-2x.png).
- Four actions: [native](reference-pair/final/four-actions-1x.png),
  [2×](reference-pair/final/four-actions-2x.png),
  [right tour](reference-pair/final/four-actions-right-2x.gif),
  [left tour](reference-pair/final/four-actions-left-2x.gif).
- Running: [right](reference-pair/final/run-right-2x.gif),
  [left](reference-pair/final/run-left-2x.gif).
- Neck/shoulder: [Theo](reference-pair/final/theo-neck-shoulder-4x.png),
  [Rose](reference-pair/final/rose-neck-shoulder-4x.png).
- [Rose hair/skirt detail](reference-pair/final/rose-hair-skirt-3x.png) ·
  [Actual collar before/after](reference-pair/final/rose-collar-before-after-4x.png) ·
  [Outfit swaps](reference-pair/final/lineup-2x.png) ·
  [Recolor](reference-pair/final/recolor-2x.png).

See the [download index](reference-pair/README.md) for editable projects,
independent CharacterPacks, reusable identities/clothing, every run/jump key and
individual idle/walk/run/jump GIFs. These images use actual exported sprites on
a neutral review stage; original generated source boards are labeled separately.

## Sources and ownership

Three development-time OpenAI image-generation calls produced one complete
pair/expression design and separate Theo/Rose clothing sheets. The original
PNGs, prompts and processing notes are retained in
[`artwork/reference-pair`](../artwork/reference-pair/README.md).

Each identity owns its three full heads; Rose also owns a separate rear-hair
layer. Six garment items provide two tops, two bottoms and two shoe designs.
Both tops include their own run/jump forearms. The dress bottom owns the skirt
and legs, allowing either character to wear either outfit without changing its
face or hair. Both complete editable projects embed all eight library entries.

Offline preparation registers the sources to the existing 192×256 frame,
neck (96,118) and ground anchor (96,240), keeps binary alpha and writes explicit
skin/hair/fabric/fixed-detail masks. Source-colored heads retain their original
registered pixels. Garments use the existing wardrobe shading/recolor path.
There are no character-specific renderer branches or runtime generation calls.

## What the assembly trial found

- **Rose neck and rear hair:** the first preparation cut rear strands with a
  horizontal boundary, but also removed the lower neck. The collar exposed rear
  hair in that gap, and the hair masses met at a visible horizontal seam. The
  correction retains the complete head's neck and natural curl ends, overlapping
  the separate rear layer behind them.
- **Actual-export collar check:** the first complete export still showed a
  smaller dark crescent inside Rose's scoop neckline. Pixel isolation identified
  59 exposed rear-hair pixels below the head, while Theo in the same bodice had
  a transparent gap. The top now owns an exposed upper-chest skin allowance;
  restoring the original head alone cannot fill a deeper collar. This prompted
  a bounded material repair and a fresh actual export pass, preserving the head,
  neck anchor and collar contour. The prior exported pack, project and matched
  crop are retained in
  [02-before-collar](reference-pair/iterations/02-before-collar/README.md).
- **Rose material ownership:** a broad color rule marked the coral bodice as
  fixed trim, preventing recoloring. The revised mask separates coral fabric
  from the ivory neckline. The audit also reassigns 31 ivory cuff pixels from skin
  to fixed trim. Skin-shadow ownership is checked when recoloring the face;
  eyes, hair flowers, boutonniere and ivory details remain fixed.
- **Clothing split:** the Theo torso source included static trouser pixels;
  the Rose sheets repeated the waistband and included sock feet beneath the
  independent shoes. Offline ownership cuts remove these duplicated parts while
  retaining coat tails, one visible waist seam and ankle overlap.

The first technical renders are retained in
[`prepared/iterations/01-initial`](../artwork/reference-pair/prepared/iterations/01-initial/).
Those are preparation diagnostics, distinct from the final actual Studio exports.

## Compatibility and use

The addition uses identity v1, wardrobe top v2 (paired active forearms), bottom
and shoe v1, recipe v3 and the existing project v1 envelope. Old projects do not
upgrade or change automatically. Open either `.rig.zip` in Skin Studio, or import
the individual identity and clothing ZIPs. Importing an identity adds it to the
library; selecting it is explicit. The baked `.character.zip` plays independently
and does not require authoring libraries or source images.

## Verification in this batch

The unchanged runtime passed **84 focused unit tests across seven files, two
Chromium identity-library E2E tests, TypeScript and production build**. The build
retains its existing bundle-size warning. The preceding batch's 454-unit/52-browser
full-suite result is historical; it is not reported as newly rerun here.

Preparation verifies 238 output hashes and four source hashes. All 254 prepared
and retained comparison PNGs decode with 192×256 binary alpha; ten current
archives and two preserved actual-before packs pass ZIP CRC/member checks.
Six registered heads remain exact. The final collar repair changes no existing
opaque clothing pixels, and all six identity/expression gap checks pass.

The repaired actual capture exports ten look/expression/recolor CharacterPacks
covering 360 source poses, with deterministic PNG equality and 160 editor
frame/facing comparisons. Both identities and all six garments roundtrip with
exact artwork/masks. The parent Maple and Willow v3 projects retain all 36
poses and manifests each. Explicit checks require the coral bodice to change
color while its fixed trim and transparent silhouette stay unchanged.

After closing Studio, **20 independent timed playback cases** pass all four
actions and both facings; jump stops/replays correctly. Maximum observed timing
error is 36 ms. Six saved-project roundtrips pass. There are no page errors,
external requests or authoring-module fetches in the consumer checks. Runtime
103-file and ten prepared-input hashes remain fixed during capture.

All final **133 PNGs, 20 GIFs and 38 ZIPs** decode. GIF frame sequence, durations,
mirroring and loop flags, PNG alpha, and ZIP member/CRC integrity are checked.
The retained before-collar subset separately verifies two ZIPs and two PNGs.
The matched actual collar comparison confirms that all 59 previously exposed
Rose pixels now belong to skin and agree with the torso export, while all 2,398
previously opaque torso pixels stay unchanged. Independent final review compares
all 144 primary/swapped outfit poses to frozen prepared pixels exactly.

Execution details are in [verification-results.json](reference-pair/verification-results.json),
actual UI records in [evidence-index.json](reference-pair/final/evidence-index.json),
and every delivered file/member in [file-integrity.json](reference-pair/final/file-integrity.json).
Native and integer-zoom visual inspection is separate from numerical checks:
the first passing export still exposed the collar defect, so the corrected
version was exported and checked again. No final user visual acceptance is claimed.

## Visual limits

- Rose's registered outfit omits the concept sheet's bag/strap. A strap crossing
  body and skirt needs an accessory attachment design; it is not baked into a
  moving arm or waist fragment.
- Neutral and gentle expressions remain close. Joyful is clearly differentiated;
  these are complete expression heads, without a new celebration body pose.
- Hair and skirt use existing layered motion, with modest sway. The reference's
  individually redrawn curls, lifted skirt, heart/bouquet props and gestures are
  not implemented by this batch.
- Deep knee folds, compressed limb silhouettes and small active hands remain
  limits of the shared rig/source registration. No new anatomy or motion changes
  were introduced to chase them here.
- Deep-skin/blonde recolors retain warm hairline boundary pixels and dark fixed
  outlines. These are source-specific authored masks, not general segmentation.
- Animation is in place on a neutral review stage. Production Gathria scene
  integration and final user visual acceptance remain unverified.

Functional verification and visual review are reported separately. This batch
stops at a reviewable pair rather than expanding the animation system.
