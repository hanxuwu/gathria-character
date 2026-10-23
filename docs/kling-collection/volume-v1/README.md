# Kling volume hair and nine outfits

This batch adds six independently selectable hairstyles and nine outfit presets for the original Kling pair. The new hair uses fuller crowns, curved lock silhouettes and separated highlight/shadow masses. The original face, ear pixels, head/body registration and action timings remain the reference.

Open `workbench.html?character=male&mode=wardrobe` or `workbench.html?character=female&mode=wardrobe`. Choose an outfit, then a hairstyle independently. Existing source characters, hair and clothing remain available. Historical/custom saved banks remain authoritative; choosing a new library style explicitly switches its embedded bank.

| Character | Outfit presets | New hairstyles |
| --- | --- | --- |
| Male | Oat weekend, Harbor day, Terracotta layer, Moss knit | Airy tousle, Soft curls, Swept quiff |
| Female | Honey garden, Harbor sailor, Rose picnic, Ivory celebration, Sage pinafore | Romantic waves, Ribbon pony, Braided crown |

Clothing comes from nine new painted donors; existing trousers/shoes are reused where selected. Outfit buttons keep the current hair/face/color. Each new hairstyle is a separate source-bound V1 appearance bank containing the existing Gentle expression. No source/configuration/CharacterPack schema changes are required.

Library browsing now retains the current outfit plus all unknown/custom imported items. Inactive items are released only when their hash exactly matches the catalog, so opening many styles does not accumulate every bank inside a saved project. Selected clothes and the current appearance bank remain embedded for offline reopen and standalone export. The 128 MiB project limit and runtime cache limits are unchanged.

Source/prompt/process records: [artwork provenance](../../../artwork/kling-collection/source/volume-v1/README.md). [baseline-hashes.json](baseline-hashes.json) pins the 37 pre-batch released assets, which remain byte-identical. The new assets are additive, not a replacement for the original Kling characters or previously saved projects.

## Review the actual exports

- [Nine outfits overview (0.5x)](review/nine-outfits-overview.png) / [native 1x gallery](review/nine-outfits-1x.png).
- [Six hairstyles at 1x](review/six-hairstyles-1x.png) / [ear and hair overlap at 2x](review/six-ear-crops-2x.png).
- Four male outfits running: [right](review/male-outfits-run-right.gif) / [left](review/male-outfits-run-left.gif).
- Five female outfits running: [right](review/female-outfits-run-right.gif) / [left](review/female-outfits-run-left.gif).
- Matched actual-export refinements: [Honey garden](review/honey-garden-refinement-before-after.png) / [Harbor sailor](review/harbor-sailor-refinement-before-after.png).
- Final workbench: [male desktop](ui/male-desktop.png), [female desktop](ui/female-desktop.png), [male mobile](ui/male-mobile.png), [female mobile](ui/female-mobile.png).

These previews are composed from browser-exported PNGs and decoded CharacterPacks, not from generated donor sheets. Native frames are 768 × 1184 with the existing padded anchor. The compact GIFs are explicitly 0.5x; the keyframe PNGs are 1x and connection crops use integer 2x enlargement. Review montages repeat, while the packs retain the original action loop/one-shot flags and fps. GIF timing uses cumulative centisecond rounding; identical consecutive holds may combine without changing total duration.

| Look | Suggested new hair | Five actions | Standalone CharacterPack |
| --- | --- | --- | --- |
| Oat weekend | Airy tousle | [right](review/oat-weekend-five-actions-right.gif) / [left](review/oat-weekend-five-actions-left.gif) | [ZIP](evidence/final-male/male-oat-weekend.character.zip) |
| Harbor day | Soft curls | [right](review/harbor-day-five-actions-right.gif) / [left](review/harbor-day-five-actions-left.gif) | [ZIP](evidence/final-male/male-harbor-day.character.zip) |
| Terracotta layer | Swept quiff | [right](review/terracotta-layer-five-actions-right.gif) / [left](review/terracotta-layer-five-actions-left.gif) | [ZIP](evidence/final-male/male-terracotta-layer.character.zip) |
| Moss knit | Airy tousle, espresso | [right](review/moss-knit-five-actions-right.gif) / [left](review/moss-knit-five-actions-left.gif) | [ZIP](evidence/final-male/male-moss-knit.character.zip) |
| Honey garden | Ribbon pony | [right](review/honey-garden-five-actions-right.gif) / [left](review/honey-garden-five-actions-left.gif) | [ZIP](evidence/final-honey-garden/female-honey-garden.character.zip) |
| Harbor sailor | Braided crown | [right](review/harbor-sailor-five-actions-right.gif) / [left](review/harbor-sailor-five-actions-left.gif) | [ZIP](evidence/final-harbor-sailor-refined/female-harbor-sailor.character.zip) |
| Rose picnic | Romantic waves | [right](review/rose-picnic-five-actions-right.gif) / [left](review/rose-picnic-five-actions-left.gif) | [ZIP](evidence/final-rose-picnic-refined/female-rose-picnic.character.zip) |
| Ivory celebration | Braided crown | [right](review/ivory-celebration-five-actions-right.gif) / [left](review/ivory-celebration-five-actions-left.gif) | [ZIP](evidence/final-ivory-celebration-refined/female-ivory-celebration.character.zip) |
| Sage pinafore | Romantic waves, espresso | [right](review/sage-pinafore-five-actions-right.gif) / [left](review/sage-pinafore-five-actions-left.gif) | [ZIP](evidence/final-sage-pinafore-refined/female-sage-pinafore.character.zip) |

Every look also has `{look}-keyframes-1x.png`, `{look}-complete-run-frames.png`, `{look}-connections-2x.png`, `{look}-hair-before-after-1x.png` and individual left/right run GIFs in [review](review). The nine packs embed finished animation pixels and run in the independent player without clothing or appearance assets. To edit later, use **Save wardrobe** in the workbench; editable projects embed their selected source, clothes and appearance bank.

## What changed after visual inspection

The new art gives the crowns more height and separates large shaded locks from bright curved strands. Airy tousle, curls and quiff have different silhouettes; waves, ponytail and braid add distinct rear masses. Hair and clothing are generated only during authoring. Runtime rendering remains deterministic and local.

Actual exports exposed a gap between the ponytail crown and rear root, a braided jaw curl disappearing behind the face, donor-only eyebrow/strap fragments, and holes inside the yellow dress's daisy centers. The final donor ownership and overlap rules address these. A hard polygon brow cut produced a notch and was rejected in favor of local donor-ink exclusion. The original ear and face pixels were not redrawn. Clothes continue to use the existing registered fitting and foreground-hand protection.

## Validation executed in this batch

- Full unit suite: **231 tests in 20 files passed** before the final UI-status fix. After that small fix, **18 targeted appearance catalog/upgrade tests passed**, including one new exact-library-identity case. These counts overlap and are not added together.
- **22 Python tests passed**. All six hair banks and nine garment banks decode; 1,104 front/rear hair layer poses and 832 clothing poses were checked. The copied Gentle RGBA/ownership remains exact; no new hair bank touches the padded frame boundary. See [asset-validation.json](asset-validation.json).
- The first targeted Chromium run passed 18 existing cases and exposed one legacy catalog-summary fallback bug. After its fix, the new library case passed. Final upgrade/library checks and real desktop/mobile captures were rerun after correcting the new library's misleading “custom assets” hint. The final command results are recorded in [verification.json](verification.json); previous batches are not counted again.
- TypeScript and production build passed. The shipped-catalog decoded-page budget check passed after the last art revision. Limits were not relaxed for this collection.
- **Nine actual CharacterPacks, 832 native frames**: ZIP/PNG decoding, source-pixel protection outside selected ownership, unchanged animation order/timing, alpha boundaries, exact exported PNG-to-pack matches and nine real left/right mirror pairs passed.
- **Nine saved-project roundtrips** retained selections, preview direction/action and exact PNG pixels. Three additional male separates/shoe mixes and two existing daily/wedding outfit roundtrips passed; Sage pinafore also uses the optional brown shoes. Existing Gentle behavior is covered by exact bank copying and appearance workflow checks.
- All editors were closed before **90 standalone action/direction cases** (nine looks × five actions × left/right). Each exported pack played independently without wardrobe, appearance or skeleton modules. Expected frame positions were observed. See the retained capture indexes and screenshots in [evidence](evidence).
- **40 GIFs** were decoded frame-by-frame and checked for timing; review PNGs were decoded and hashed. Detailed current-pack checks: [male report](artifact-validation-male.json), [female report](artifact-validation-female.json), [gallery report](gallery-validation.json), [final UI report](ui/evidence-index.json).

Final capture directories are `final-male`, `final-honey-garden`, and the four other female `final-…-refined` folders. The earlier `final-female` run was deliberately stopped and is not a passed validation. Other intermediate female folders retain PNGs and original hashes, with superseded archives kept only temporarily. Refined captures reuse explicitly marked before-hair PNGs from matched actual exports; their after PNGs, packs, saved-project reopen and player checks are new. See [evidence notes](evidence/README.md).

## Visual limits and review status

Manual inspection covered the nine-look native gallery, complete run contact sheets, ear crops and representative raised-arm/deep-crouch poses. New crowns and curls have substantially more volume, and the new clothes are distinguishable by construction and detail as well as color. This visual review is separate from test success and does not claim user acceptance.

Hair follows the registered source head without secondary strand/ponytail physics. Fine ear/hairline antialiasing and original matte fringes can still show at enlarged scale. Deep crouches retain a sharp inward far-waist turn and compressed skirt folds from the existing fitter; large arm raises can make short sleeves angular. Lace can look noisy or soft in blurred source poses and quantized GIFs. Female designs use the current sleeveless ownership, not the donor's generated puff sleeves. The new female banks are around 35–38 MB and can take time to prepare on first selection; loading optimization is not part of this art batch.
