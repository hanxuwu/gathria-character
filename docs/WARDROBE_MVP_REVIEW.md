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

The renderer, existing four-action motion data, original built-in skins, historical V1–V7 artwork generators and source banks remain unchanged. Baked packages continue to use the existing reusable-rig generator IDs and CharacterPack schema 1. The recipe and catalog version are recorded in provenance; `character.json` remains only a compatibility appearance reference, not a recipe for reconstructing custom or wardrobe art.

## Review artifacts and verification

Actual application exports and the final validation results are recorded in [`wardrobe/`](wardrobe/). The evidence capture operates the UI, saves and reopens projects, exports CharacterPacks, closes the editor, and then checks independent playback against the exported atlas. PNG/GIF/ZIP validation decodes file contents and checks transparency, frame sequences and timing. The final verification record distinguishes this batch's test execution from earlier milestones.

## Remaining scope

- The catalog has two identities and eight registered item/identity choices, not arbitrary generated-image ingestion. New artwork needs explicit ownership masks, covered joints, hidden body coverage and source registration before catalog inclusion.
- Hair and face design remain tied to the selected identity; this batch exposes skin and garment colors, not independent face/hair authoring or accessories.
- There is one upper-clothing group at a time, no coat-over-shirt layering or general garment collision system.
- Existing painting-density differences and texture compression at deep knee bends remain. The shared jump remains a small in-place hop, with no scene physics or world movement.
- Full projects support further wardrobe editing; independently exported CharacterPacks contain baked pixels and do not provide live scene-level outfit changes.
- Gathria production integration and user visual acceptance remain unverified. This batch stops at draft review.
