# Wardrobe catalog v1: artwork sources and registration

This catalog reuses the repository's reviewed V6 character heads, everyday
clothing, and Motion 3 arm/skirt ownership repairs. No new image generation,
third-party illustration, or runtime drawing service was used for this batch.
The original AI-assisted source history remains in
[ASSET_PROVENANCE.md](ASSET_PROVENANCE.md). The existing source banks, built-in
skins and earlier character renderers are unchanged.

## Catalog ownership

| Item                  | Source                                             | Owned slots                                   |
| --------------------- | -------------------------------------------------- | --------------------------------------------- |
| Cropped hair identity | V6 `crop` portraits                                | Three complete expression heads               |
| Long waves identity   | V6 `waves` portraits                               | Three complete expression heads and back hair |
| Denim jacket          | Existing `jacket` upper clothing                   | Torso, both upper arms and forearms           |
| Soft top              | Existing `tee`, with Motion 3 repaired ownership   | Torso, both upper arms and forearms           |
| Trousers              | Existing `trousers` lower clothing                 | Hips, both thighs and shins                   |
| Short skirt           | Existing `skirt`, with Motion 3 repaired ownership | Hips, both thighs and shins, skirt overlay    |
| Lace-up shoes         | Existing trousers shoe attachments                 | Both shoes                                    |
| Flats                 | Existing skirt shoe attachments                    | Both shoes                                    |

The identity owns its face, hairstyle, expression registration and jaw shaping.
Clothing choices do not select another head or expression. Exposed skin in the
current garment attachments follows the identity's selected skin material color.
This is a bounded modular wardrobe, not a newly painted universal nude body:
hand and exposed-leg source shapes still belong to each prepared garment cut.
All choices use the same 192 × 256 humanoid family and existing animation system.

## Reproducible preparation

Run from the repository root:

```sh
node scripts/prepare-wardrobe-assets.mjs
```

The script reads `polishedBank` and `repairRunningArmParts` only during offline
preparation. It writes
[`src/skeletal/wardrobe-assets.generated.ts`](../src/skeletal/wardrobe-assets.generated.ts),
containing 32 registered, losslessly compressed source parts. Each pixel has five
bytes: RGBA followed by its authored material ID. Source file SHA256 values are
recorded in the generated file header; the script also prints part ownership and
material counts. There is no timestamp or random input in the generated catalog.

The material IDs are preserved from the source artwork:

| ID  | Meaning                                                |
| --- | ------------------------------------------------------ |
| 0   | Fixed ink, eyes, stitching and other uncolored details |
| 1   | Skin                                                   |
| 2   | Hair                                                   |
| 3   | Upper clothing                                         |
| 4   | Lower clothing                                         |
| 5   | Shoes                                                  |

No material is inferred from RGB values. Each source part retains its palette
reference, allowing local recoloring to preserve source shadows and highlights.
V6 head parts are explicitly marked to retain the same warm skin chroma as the
existing built-in skin adapter. The hair color uses the existing restrained
highlight treatment. Fixed pixels remain fixed, including the short skirt's
blue underskirt ink; changing an outfit does not globally erase blue pixels.

The preparation script applies the same anatomical arm capsule as the existing
`builtins.ts` adapter, after the Motion 3 contour repairs. The capsule and contour
operate on all five pixel channels together. They preserve hand/sleeve ownership,
remove adjacent material from moving arms, and keep the repaired waist/skirt
backplates. Neither old bank data nor the old built-in extraction is modified.

The source crops also overlap at the waist and shoe openings. Matching original
outfits hide these overlaps; independently swapping parts would reveal borrowed
fabric or the previous shoe. Catalog preparation makes these ownership repairs:

- The jacket and soft-top torsos contain 40 and 39 pixels of lower-clothing
  material at the waist. Their alpha coverage stays intact; the nearest authored
  upper-fabric sample supplies those pixels and assigns upper material ownership.
- The trousers hips, skirt hips and skirt overlay contain 155, 152 and 152 pixels
  of upper-fabric hem. The same bounded seam-allowance treatment extends adjacent
  lower fabric into those pixels. This prevents an old shirt hem from following a
  new skirt or trousers, while retaining continuous waist coverage. The treatment
  is restricted to source rows 155–180 and never modifies fixed ink.
- The old shoe alpha footprint owns both shoe material and its fixed contour.
  It is removed from the corresponding shin: 132/168 pixels for trousers and
  124/132 for skirt, near/far respectively. This removes only overlapping source
  shoe pixels, not all pixels of a particular visible color.
- The original boots contain 24/26 near/far trouser-cuff pixels. They are returned
  to their matching shins and removed from the shoes, so a boot does not bring
  trouser cloth onto a bare leg.

These changes are confined to the new catalog, with exact counts printed by the
preparation script. The identities and their three expression images are copied
without these clothing repairs.

## Registration and occlusion

All parts occupy a transparent 192 × 256 source frame. Both upper garments share
the neck region and waist registration; both lower garments share the waist
region. Complete garment groups carry their source attachment chains, rather
than forcing differently cut illustrations onto identical numerical joints.
For example, the skirt's visible leg begins below its hem, so that attachment's
first landmark is lower than the trousers' first landmark. These are source-cut
landmarks within one hierarchy, not a second skeleton or a different head/body
scale.

Shoes carry both original ankle landmarks. Assembly registers them to the chosen
lower garment using the ankle and sole as separate anchors: horizontal ankle
translation and a small vertical fit around the stationary sole. This keeps a
boot's opening connected when paired with the skirt's shorter visible-leg cut;
plain vertical translation would be canceled by the renderer's sole alignment
and leave a gap. The fit uses nearest-neighbor sampling, not blurred scaling.
The existing renderer keeps the sole on the common ground anchor and rotates it
around the selected leg's ankle. Shoe swaps therefore need
checks in standing, walking, running and jumping, including foot crossing and
the return leg. Keeping the original sole baseline is more important than making
the two differently shaped shoe images have equal bounding boxes.

The existing draw order remains: back hair, far arm, legs, hips/skirt, torso,
near arm, then head. Group ownership avoids replacing only a sleeve while
leaving an old hand or torso behind. This catalog does not introduce arbitrary
layer stacking, coat-over-shirt combinations, or mesh-weight editing.

## Scope and limits

- Two identities, two upper garments, two lower garments and two shoe pairs.
- Three complete expressions remain tied to each identity; head position and
  face design do not change with an outfit selection.
- Same existing humanoid family, crisp source pixels and transparency.
- Existing deep-knee texture compression and small original garment shading
  differences remain possible; this batch does not redraw the source paintings.
- A new generated illustration still needs authored part boundaries, material
  masks and registration before it can become a catalog item. Arbitrary complete
  character pictures are not automatically split or reliably bound.
- Independent CharacterPacks contain baked animation pixels. Editing a wardrobe
  requires the saved authoring project and catalog-aware editor; playback of a
  CharacterPack alone does not implement live scene-level wardrobe changes.

The repository's existing artwork reuse follows its MIT notice. Imported or
future generated sources must retain their own provenance and applicable terms.
