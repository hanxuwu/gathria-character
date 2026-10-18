# Portable identity trial downloads

These review artifacts come from actual Skin Studio imports, wardrobe choices
and exports. Source generation and part preparation are retained separately in
[`artwork/portable-identities`](../../artwork/portable-identities/).

## Start here

- [Two identities × three outfits, 2×](final/lineup-2x.png)
- [Four actions, right](final/four-actions-right-2x.gif) ·
  [left](final/four-actions-left-2x.gif)
- [Six outfits running right](final/outfits-run-right-1x.gif) ·
  [left](final/outfits-run-left-1x.gif)
- [Three expressions](final/expressions-2x.png)
- [Review, compatibility and limits](../PORTABLE_IDENTITIES_REVIEW.md)

## Editable sources and independent playback

| Character | Identity only                             | Complete editable look                     | Independent CharacterPack                          |
| --------- | ----------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| Maple     | [identity ZIP](final/maple.identity.zip)  | [project ZIP](final/maple-maple.rig.zip)   | [CharacterPack](final/maple-maple.character.zip)   |
| Willow    | [identity ZIP](final/willow.identity.zip) | [project ZIP](final/willow-willow.rig.zip) | [CharacterPack](final/willow-willow.character.zip) |

Open the project in `/skin-studio.html` to edit clothing, colors and expressions.
It embeds both identities and six custom clothing items. Open the CharacterPack
in `/player.html` for independent playback. Imported identities alone add to the
library; choosing them is explicit and preserves an existing wardrobe.

Prepared reusable Willow garments:
[cardigan](../../artwork/portable-identities/prepared/willow-top.wardrobe.zip),
[trousers](../../artwork/portable-identities/prepared/willow-bottom.wardrobe.zip),
[sneakers](../../artwork/portable-identities/prepared/willow-shoes.wardrobe.zip).
The original [Maple garments](../maple-action-poses/README.md) remain reusable.

## Motion and detailed checks

Individual right/left GIFs follow `final/{idle,walk,run,jump}-{right,left}-{1x,2x}.gif`.
Jump GIFs play once, matching the one-shot clip; four-action tours deliberately
repeat for review and label their reset. Timing uses cumulative centisecond
rounding for GIF storage; CharacterPacks retain the exact original FPS.

Every pose is shown in
[Maple run](final/maple-run-keyframes-2x.png),
[Willow run](final/willow-run-keyframes-2x.png),
[Maple jump](final/maple-jump-keyframes-2x.png) and
[Willow jump](final/willow-jump-keyframes-2x.png).

The [capture record](final/evidence-index.json) contains closed-editor independent
playback checks, old-project comparisons and source hashes. The
[media report](final/artifact-validation.json) checks actual frame content/order,
alpha, mirrors and GIF timing. [All-file integrity](final/file-integrity.json)
decodes every image and checks every ZIP member and CRC.

## Reproduce

From the repository root with dependencies, system Chromium and Python/Pillow:

```sh
node scripts/prepare-portable-identities.mjs
node scripts/generate-identity-evidence.mjs
python3 scripts/render-identity-review.py
```

The capture script owns port 5194 and closes its editor before independent
player checks. Run timing-sensitive capture separately from the full test suite.
Do not overwrite earlier batches' golden evidence.
