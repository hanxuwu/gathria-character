# Portable clothing items

This batch starts from merged `main` at `ffad05d82bad2d2f481488d6496df5cfb47a3fee`.
It lets Skin Studio load reusable tops, bottoms and shoes without changing the
renderer or adding items to the checked-in catalog. Identities, proportions,
source art and the four shared actions are preserved.

## Workflow

1. Open `/skin-studio.html` and choose **Open wardrobe**.
2. Under **Your clothing**, choose a template group and **Download item template**.
3. Edit the template's PNG artwork, matching material masks and `item.json`.
   Keep the 192×256 canvases, registration and covered areas behind joints.
   Give the item a unique `custom-…` ID, name and accurate provenance.
4. Use **Import clothing ZIP**. A valid item is added to this project's library
   and selected in one undoable edit. It can then be selected for either identity,
   recolored, and used with idle, walk, run and jump.
5. **Save project ZIP** includes the library and the complete assembled skin.
   Reopen it to continue choosing imported items. **Save item ZIP** shares one
   item; **Export CharacterPack** bakes ordinary independent playback frames.

The project holds up to eight imported items. IDs cannot overwrite an existing
item. Choose a different garment before removing an item currently worn; removal
is undoable. Editing a flat PNG or binding still detaches the active recipe,
while retaining the imported library and edited artwork. Opening the wardrobe
again is explicit.

## Ownership and file contract

An item has `format: gathria-wardrobe-item`, version 1, the existing humanoid
`rigId`, an ID, name, provenance, group and part metadata. A top owns torso and
both upper-arm/forearm chains. A bottom owns hips, both thigh/shin chains and an
optional garment overlay. Shoes own the near/far shoe images. Item registration
contains only that group's arm/leg chains or ankle points. Head and hair slots
cannot be imported through clothing.

The `.wardrobe.zip` contains `item.json`, `artwork/<slot>.png`,
`masks/<slot>.png` and preparation instructions. Each visible mask pixel is
`[material ID, 0, 0, 255]`; transparent pixels are all zero. Mask alpha must match
the corresponding artwork. Material IDs retain the catalog meanings: 0 fixed,
1 skin, 2 hair, 3 upper clothing, 4 lower clothing, 5 shoe. Each group accepts
only its own appropriate materials. Fixed details are not recolored.

Imports check archive paths, sizes, checksums, dimensions, alpha, material IDs,
slot ownership, registration and version before replacing the live look.
Registration checks do not establish aesthetic quality or infer missing pixels.

Each PNG is limited to 1 MiB; item/project ZIPs to 12 MiB. Embedded source items
must fit the shared 4 MiB library budget before they can be installed, so the
editor cannot accept a library that its project writer cannot save. Material
palettes specify non-black source reference colors, not the desired garment
colors; target colors remain independently editable in the wardrobe. Joint
landmarks use integer source pixels and the supported V6-scale segment lengths.

## Compatibility

Recipe version 1 retains the original built-in-only contract and output.
Imported clothing uses recipe version 2 with custom item references. Both use
catalog version 1. The authoring envelope remains version 1 with an optional
`wardrobe.json` library in the project ZIP. It stores the losslessly encoded
source parts and binding data; it is not a reference to browser storage or a
remote service. The saved assembled skin is checked against the recipe and
embedded items before import. Detached projects may retain an unused library.

Older projects still load without modification. Old application revisions
cannot edit the new item-library extension; a flat skin ZIP or baked
CharacterPack remains the way to share the result with those readers.
CharacterPack schema, player, skeleton, motion curves, source banks and historical
artwork generators are unchanged. The final skin's provenance includes imported
item provenance. `character.json` remains a legacy appearance reference, not
the source for rebuilding arbitrary custom artwork.

## Verification and review

Implementation `e7b9a92` is committed and pushed. This batch passed **418 unit
tests across 31 files, 48 Chromium E2E tests, TypeScript and the production build**.
The three new browser flows also passed separately after runtime files were
frozen. An earlier focused run failed waiting for the template control during
active source editing; assertions were retained, and both final runs passed.

The actual-export review decoded **14 PNGs, 6 GIFs and 20 ZIPs**, including every
archive member. Eight closed-editor independent playback cases checked all four
actions in both directions, with exact native pixels, frame order, loop wrap and
one-shot jump hold/replay. All three item groups round-trip their PNGs, masks and
metadata; the edited Waves project reopens with its three embedded items and
reproduces its atlas and manifest exactly. Both older v1 wardrobe projects also
reopen and reproduce **72 frames and both manifests exactly**. All 21 captured
runtime/script hashes match the final files. No browser errors, external requests
or forbidden authoring imports occurred during independent playback.

Visual inspection covers the native lineup, integer zoom, matched 4× torso
detail, all running poses and desktop/mobile UI. The fixed-color embroidery stays
with the torso and survives recoloring; sample geometry, identity and poses are
preserved. Inherited neckline details and compressed cloth at deeply bent knees
remain visible. The sample demonstrates real source editing and import rather
than a new full-outfit art direction. Functional success is separate from user
visual acceptance.

- [Native comparison](wardrobe-items/item-lineup-1x.png) · [2×](wardrobe-items/item-lineup-2x.png)
- [Four-action GIF right](wardrobe-items/four-actions-right-2x.gif) · [left](wardrobe-items/four-actions-left-2x.gif)
- [Source detail comparison](wardrobe-items/custom-detail-before-after-4x.png) · [Run keys](wardrobe-items/run-keyframes-1x.png)
- [Clothing, projects and CharacterPack downloads](wardrobe-items/README.md)
- [Execution record](wardrobe-items/verification-results.json) · [Browser evidence](wardrobe-items/evidence-index.json) · [Decoded media validation](wardrobe-items/artifact-validation.json)

Reproduce with `npm test`, `npm run build`, the Chromium command recorded in the
execution record, then `node scripts/generate-wardrobe-item-evidence.mjs` and
`python3 scripts/render-wardrobe-item-review.py`. Avoid editing runtime files
while capturing evidence. The earlier wardrobe batch's counts remain historical.

Review also corrected two workflow defects before delivery: detached v2 Waves
projects now reopen the wardrobe with the same identity, and the 4 MiB library
budget is enforced before installing an item. The existing large-bundle warning
remains; eight-item libraries also involve noticeable synchronous validation
work. Caching validated source data is a possible later optimization.

## Limits

- Artwork still needs deliberate separation, material masks, hidden joint
  coverage and registration. Arbitrary full-character images are not split
  automatically.
- This first external-item contract covers clothing, not new identities,
  hairstyles, accessories or different skeleton proportions.
- One top, one bottom and one pair of shoes are composed at a time. There is no
  general coat/shirt layering or collision solver.
- Existing neckline details, deep-knee texture compression and fixed 2D joint
  deformation remain. The batch adds a reusable import workflow, not newly
  painted animation poses or a claim of visual acceptance.
- Save files explicitly; browser reload does not autosave the project. Gathria
  production integration remains unverified.
