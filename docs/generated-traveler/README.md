# Maple pipeline trial

[Review and known defects](../GENERATED_CHARACTER_REVIEW.md) ·
[Source art, prompts and registration](../../artwork/generated-traveler/README.md)

The source is a newly generated character. All previews below use the existing
shared skeleton and actual application exports.

- [Before/after 2×](final/before-after-2x.png)
- [Four actions right](final/four-actions-right-2x.gif) · [left](final/four-actions-left-2x.gif)
- [Run before/after](final/before-after-run-right-2x.gif)
- [Wrist/waist comparison](final/before-after-arm-waist-4x.png)
- [Leg connections comparison](final/before-after-leg-joints-4x.png)
- [Generated clothing reused](final/reused-clothing-2x.png)
- [Cuff recolor defect and repair](final/cuff-mask-before-after-4x.png)

## Open in Skin Studio

Use **Open project ZIP** with [Maple editable project](final/traveler-neutral.rig.zip).
It retains the complete new identity, source pixels, bindings and four actions.
[Skin only](final/traveler.skin.zip) imports just its appearance/bindings.

Open the wardrobe on an existing identity, then use **Import clothing ZIP** for:

- [Knit sweater](final/traveler-top.wardrobe.zip)
- [Trousers](final/traveler-bottom.wardrobe.zip)
- [Boots](final/traveler-shoes.wardrobe.zip)

[Crop with the new clothes](final/crop-traveler-clothes.rig.zip) and
[Waves recolored](final/waves-traveler-recolored.rig.zip) retain an editable
embedded item library. Maple itself is not yet a selectable wardrobe identity;
opening the wardrobe on its flat project selects a built-in identity.

## Independent CharacterPacks

- [Maple neutral](final/traveler-neutral.character.zip)
- [Maple gentle](final/traveler-gentle.character.zip)
- [Maple joyful](final/traveler-joyful.character.zip)
- [Crop wearing generated clothes](final/crop-traveler-clothes.character.zip)
- [Waves wearing recolored generated clothes](final/waves-traveler-recolored.character.zip)

Unzip a pack and open its `manifest.json` and `spritesheet.png` in the independent
player. Baked packs do not restore editable materials; keep the `.rig.zip` too.

[Final evidence index](final/README.md) includes every action, both facings,
keyframes, screenshots and decode checks. [Initial trial](phase-1/README.md)
preserves the faulty actual exports. [Execution record](verification-results.json)
distinguishes this run's checks from prior milestones.
