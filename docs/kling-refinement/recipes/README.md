# Reusable clothing recipes

The wardrobe now exposes **Fitting guides → Clothing to use as a starting point
→ Download clothing recipe** for the currently worn top, trousers or dress.
The download contains the exact garment ZIP, source-bound registration, an
editable recipe and instructions. It is an authoring kit, not a playable pack.

This workflow makes color/material variants and local pose repainting quick.
It does not fit a new standing design to every action. New sleeve lengths,
skirts or silhouettes still need the full clothing template, explicit ownership
and a review of every source pose. Existing heads, body pixels, source frames,
anchors and animation timing remain authoritative.

## Reproduce the included variant

With the repository's artwork Python environment (Pillow and NumPy):

```sh
python scripts/build-kling-garment-variant.py \
  docs/kling-refinement/recipes/ocean-linen.json \
  --output /tmp/ocean-linen-rebuilt.zip
```

The recipe uses `teal-camp-shirt-v3.zip` and produces **Ocean linen**, a blue
material variation of the existing camp-shirt design. It is not a new shirt
silhouette. The material rule preserves shading, alpha and ownership; pixels
outside the selected chromatic range, such as buttons, remain unchanged.
Four checked starters cover shirt, jacket, trousers and dress categories.

For a downloaded kit, extract it, choose a new output id/name in `recipe.json`,
then run from the repository:

```sh
python scripts/build-kling-garment-variant.py /path/to/kit/recipe.json \
  --root /path/to/kit --output /tmp/my-new-shirt.zip
```

The output path must be new. Import it using **Add clothing file**, select the
new item, check five actions in both directions, save the wardrobe, then export
a CharacterPack. Importing the authoring kit itself is intentionally unsupported.

## Pose corrections

In **Fitting guides**, select the currently worn item, pause/scrub to the pose,
then enable **Inspect clothing layer**. **Show editable area** displays the
binary ownership mask. **Download this pose for painting** includes the actual
native clothing layer, mask, source anchors and a ready-bound pose override.
The downloaded pose always faces **right**, even when the preview faces left.
Paint inside the white mask, preserve alpha/coordinates and update the image
SHA-256 in the recipe. The unedited kit builds the same artwork under a new ID.
When making a full-bank material variant, remove an unedited pose override;
otherwise that one pose intentionally replaces the material change.

A `poseOverrides` entry has `frameId`, `image` and `mask`. Both files use the
native 704 × 1056 registered frame coordinates, including transparent pixels:

```json
{
  "frameId": 86,
  "image": { "file": "paint-86.png", "sha256": "<SHA256 of PNG bytes>" },
  "mask": { "file": "mask-86.png", "sha256": "<SHA256 of PNG bytes>" }
}
```

Paint an RGBA image; use a binary grayscale mask (0 or 255) selecting only
existing clothing-owned pixels. Preserve their original alpha. The base garment
manifest supplies the crop offsets and ownership atlas; `registration.json`
supplies joints and occlusion guides. The builder rejects ownership expansion,
alpha changes, wrong hashes, category/slot mismatches, duplicate or
unknown pose IDs, and files outside the recipe root. The browser separately
checks the copied body/source registrations when importing. Review neighboring poses
as well: a correct static repaint can still cause a visible temporal pop.

The recipe copies source/registration bindings and every pose record exactly.
The browser revalidates the resulting archive before accepting it. Source face,
hands and anatomy are never repainted by this mechanism. Shoes retain the
existing template workflow; this first recipe UI intentionally covers clothing.

## Evidence

`../evidence/primary-fit-v3/evidence-index.json` records a recipe downloaded from
the live workbench, edited and built offline, imported back into the wardrobe,
saved/reopened and exported. Its PNG/ownership payload is checked against the
published Ocean linen recipe output. ZIP provenance differs because a portable
kit uses a relative `base.garment.zip` reference.

Six Python contract tests cover material preservation, deterministic output,
pose paint, hash/category errors, ownership/alpha rejection and invalid IDs.
The TypeScript test checks exact downloaded base/registration bytes, selected
item eligibility and rejection of damaged inputs.

**Save look** now retains exact ZIP artwork in this browser. After refreshing,
custom materials saved this way restore without reopening a project. Recipes
still bind exact IDs and SHA-256 hashes; damaged or unavailable artwork never
silently becomes a different revision. The shared artwork store is bounded to
256 MiB and never evicts materials. Deleted looks currently leave reusable
material bytes in the store. Keep `.wardrobe.zip` files for transfer or recovery;
browser storage is not a backup. For older looks saved before this change,
reopen the wardrobe project and save the look again to retain its artwork.
See the [current actual authoring review](../../kling-polish/README.md).
