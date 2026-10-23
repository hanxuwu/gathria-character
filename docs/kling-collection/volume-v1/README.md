# Kling volume hair and nine outfits

This batch adds six independently selectable hairstyles and nine outfit presets for the original Kling pair. The new hair uses fuller crowns, curved lock silhouettes and separated highlight/shadow masses. The original face, ear pixels, head/body registration and action timings remain the reference.

Open `workbench.html?character=male&mode=wardrobe` or `workbench.html?character=female&mode=wardrobe`. Choose an outfit, then a hairstyle independently. Existing source characters, hair and clothing remain available. Historical/custom saved banks remain authoritative; choosing a new library style explicitly switches its embedded bank.

| Character | Outfit presets | New hairstyles |
| --- | --- | --- |
| Male | Oat weekend, Harbor day, Terracotta layer, Moss knit | Airy tousle, Soft curls, Swept quiff |
| Female | Honey garden, Harbor sailor, Rose picnic, Ivory celebration, Sage pinafore | Romantic waves, Ribbon pony, Braided crown |

Clothing comes from nine new painted donors; existing trousers/shoes are reused where selected. Outfit buttons keep the current hair/face/color. Each new hairstyle is a separate source-bound V1 appearance bank containing the existing Gentle expression. No source/configuration/CharacterPack schema changes are required.

Library browsing now retains the current outfit plus all unknown/custom imported items. Inactive items are released only when their hash exactly matches the catalog, so opening many styles does not accumulate every bank inside a saved project. Selected clothes and the current appearance bank remain embedded for offline reopen and standalone export. The 128 MiB project limit and runtime cache limits are unchanged.

Source/prompt/process records: [artwork provenance](../../../artwork/kling-collection/source/volume-v1/README.md). `baseline-hashes.json` pins the pre-batch released assets. New validation results and actual-export review links are appended after capture; prior batch results are not counted as this batch.

Remaining visual limits: source-bound head motion rather than secondary hair simulation; inherited deep-crouch skirt/waist fitting; fine detail can soften with source blur. This is a reviewable new collection, not a claim of user visual acceptance.
