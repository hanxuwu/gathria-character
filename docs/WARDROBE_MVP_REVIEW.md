# Modular wardrobe MVP

This batch starts from `56e73af21f2c5da6c3aa2fd6ae9f221612e58ba5` on `feat/reusable-character-rig`, draft PR #5. It adds a small wardrobe on the existing shared skeleton: two character identities, two tops, two bottoms, two shoe designs, and separate skin/clothing colors. No new illustrations or image-generation calls are used.

## Workflow

Open `/skin-studio.html` and choose **Open wardrobe**. Select Cropped hair or Long waves, then independently choose Denim jacket/Soft top, Trousers/Short skirt and Lace-up shoes/Flats. Both identities accept all items. Switching clothing leaves the identity's complete expression heads and hair unchanged. Skin, top, bottom and shoe colors use existing authored material masks; **Apply colors** records one undoable edit.

Idle, walk, run and one-shot jump remain available in either direction. The existing rig and motion library drive every combination; the wardrobe introduces no character-specific motion code. Project names, authored motion changes, selected action, facing and expression survive an outfit change.

**Save project ZIP** preserves the composition recipe, complete flat PNG parts, bindings, skeleton, motions and preview. Reopen that file to continue choosing clothes. **Save skin ZIP** saves a portable flat skin without the recipe. **Export CharacterPack** bakes all available actions for the independent player; it does not require the wardrobe catalog to play.

## Material ownership and registration

The new catalog is prepared offline from the existing V6 heads and everyday garment sources with Motion 3 arm repairs. Each item owns a complete group: identity owns the three heads/back hair; top owns torso and both arm chains; bottom owns hips, legs and optional skirt; shoes own both foot images. Switching a group replaces all its parts and source joint landmarks together. Old optional skirt images cannot remain behind when trousers are selected.

The source audit found overlapping ownership that was hidden by matched outfits: old shoe pixels inside shins, trouser pixels inside shoe crops, upper hem pixels in hips, and lower garment pixels in torso. The preparation script uses authored material IDs and spatial attachment coverage to resolve these boundaries, retaining the short skirt's fixed blue underskirt. This is not a global color-removal filter. Source banks and the existing built-in skins are unchanged. [Source preparation](WARDROBE_ASSET_SOURCES.md) records the precise processing and source hashes.

The catalog keeps one 192 × 256 humanoid family and the existing (96, 240) anchor. Each garment retains its own source-cut landmarks. Shoes register to the selected bottom's ankle positions; the renderer retains its sole normalization. These are registered asset groups rather than a universal unclothed body: hands and visible lower-leg shapes still come from the garment's original prepared cuts.

## Compatibility

The opt-in recipe identifies `gathria-wardrobe-recipe`, version 1, catalog version 1. It stores item IDs and four normalized hexadecimal colors. The authoring envelope remains version 1 with this optional field. Existing flat projects have no recipe and are never silently converted. Current imports validate the recipe, complete saved slot pixels and bindings together; a stale recipe or unknown catalog version is rejected before replacing the live project. Import does not regenerate saved artwork.

Low-level PNG, whole-skin or binding changes detach the recipe while retaining the edited pixels. Undo restores both recipe and artwork. Reopening the wardrobe is an explicit new assembly. Renaming a character, changing expressions and editing motion data keep the recipe. Old application revisions that reject unknown fields need updating to edit wardrobe projects; a separate flat skin remains portable without the recipe.

New wardrobe skins explicitly set `bindings.mesh.preserveAnkleOverlap: true`. This keeps their source-owned shin allowance behind separately owned shoes; old skins omit the flag and keep the original shoe-exclusion path. The optional flag is retained in skin/project ZIPs and requires this reader revision. Existing four-action motion data, original built-in skins, historical V1–V7 artwork generators and source banks remain unchanged. Baked packages continue to use the existing reusable-rig generator IDs and CharacterPack schema 1. The recipe and catalog version are recorded in provenance; `character.json` remains only a compatibility appearance reference, not a recipe for reconstructing custom or wardrobe art.

## Review artifacts and verification

Recovery points: initial assembly `90fae7f0ed1e9c210c4c5467fad63920e7f240a6` and articulated shoe repair `3ec349351ca1eb83485ab8ae57db207ab036b080`, both committed and pushed. This batch passed **389 unit tests across 29 files, 45 Chromium E2E tests, TypeScript and the production build**. The 32 new unit cases cover catalog assembly, material isolation, shoe fitting, stale recipes, old flat projects and saved artwork integrity. Four new browser flows cover opt-in/undo, identity preservation, colors, round trips, invalid imports, manual editing and independent four-action playback. Existing historical-art, wedding/everyday clothing and authoring workflows also ran in this suite. These counts are current executions, not copied historical results.

The new catalog's six complete expression heads and waves back-hair attachment compare byte-for-byte with the original built-in skin images at their original colors. Changing clothing leaves these identity attachments unchanged. Repeated offline preparation produces identical catalog bytes. The old source banks, built-in adapter, motion definitions, baker and consumer are unchanged from the starting commit. The renderer's overlap change is explicit and opt-in; [216 complete old frames](wardrobe/legacy-frame-equality.json), covering both skins and three expressions through all four actions, retain identical RGBA hashes.

Actual application exports and the final validation results are recorded in [`wardrobe/`](wardrobe/). The evidence capture operates the UI, saves and reopens projects, exports CharacterPacks, closes the editor, and then checks independent playback against the exported atlas. PNG/GIF/ZIP validation decodes file contents and checks transparency, frame sequences and timing. The final verification record distinguishes this batch's test execution from earlier milestones.

The delivered set validates **31 PNGs, 10 GIFs and 18 ZIPs**, including two frozen initial CharacterPacks. Sixteen closed-editor playback cases cover both crossed outfits, four actions and both directions; complete native frames match the exported PNGs. Both edited projects reopen exactly, and 144 final exported poses pass the focused detached-footwear check. All 22 captured source/script hashes match the final files. Native/2× lineups, expression panels, recolor samples and 4× shoe comparisons were visually inspected; the corrected ankle gap is closed. The remaining source-art limits below are still visible and are not presented as fixed.

- [Same identity, different clothing: native](wardrobe/wardrobe-lineup-1x.png) · [2×](wardrobe/wardrobe-lineup-2x.png)
- [Four actions, right](wardrobe/four-actions-right-2x.gif) · [left](wardrobe/four-actions-left-2x.gif)
- [Expressions](wardrobe/expressions-2x.png) · [Skin/clothing recolor](wardrobe/recolor-2x.png) · [Joint and waist details](wardrobe/connections-3x.png)
- [Editable project and CharacterPack downloads](wardrobe/README.md)
- [Browser evidence](wardrobe/evidence-index.json) · [Decoded media validation](wardrobe/artifact-validation.json) · [Current verification](wardrobe/verification-results.json)

Reproduce in sequence, with no concurrent source edits or heavy test runs during capture:

```sh
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium CHROMIUM_ARGS_JSON='["--no-sandbox","--disable-dev-shm-usage"]' npm run test:e2e
node scripts/generate-wardrobe-evidence.mjs
python3 scripts/render-wardrobe-review.py
```

The initial visual pass exposed a roughly three-pixel gap when the shorter skirt leg used the other shoe design. A simple vertical translation was canceled by the renderer's sole alignment. An ankle/sole fit improved the resting connection, but full exported animation revealed another failure: independently rotating the shin and shoe exposed their zero-overlap boundary. The old mesh then erased any overlap using the shoe's alpha footprint. The final catalog supplies a bounded four-pixel allowance of the leg's own cloth/skin, explicitly preserves it behind the shoe, and normalizes the shoe sole to y239. Leg geometry, source ankle positions and motion keys stay fixed. [Initial exports](wardrobe/iterations/01/) retain the visible failure for comparison; [matched shoe details](wardrobe/shoe-fit-before-after-4x.png) show the correction. Functional tests do not establish aesthetic approval; exported native frames, enlarged joints and complete playback are reviewed separately.

## Remaining scope

- The catalog has two identities and eight registered item/identity choices, not arbitrary generated-image ingestion. New artwork needs explicit ownership masks, covered joints, hidden body coverage and source registration before catalog inclusion.
- Hair and face design remain tied to the selected identity; this batch exposes skin and garment colors, not independent face/hair authoring or accessories.
- There is one upper-clothing group at a time, no coat-over-shirt layering or general garment collision system.
- Existing painting-density differences and texture compression at deep knee bends remain. The shared jump remains a small in-place hop, with no scene physics or world movement.
- The preserved crop head includes a tiny pale collar edge that is more visible with the soft top's open neckline. Removing that inherited head detail is a separate identity-art refinement; this batch retains the complete original heads.
- Full projects support further wardrobe editing; independently exported CharacterPacks contain baked pixels and do not provide live scene-level outfit changes.
- Gathria production integration and user visual acceptance remain unverified. This batch stops at draft review.
