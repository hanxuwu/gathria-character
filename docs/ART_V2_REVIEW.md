# Character Art V2 milestone — expressive revision

The latest revision continues the warm Japanese chibi direction with **artworkVersion 4**. It adds a gentle blink, optional happy eyes, a rose hairpiece, softer dark-hair highlights, and a more articulated walk. Existing V1, V2 and V3 characters retain their exact renderers. This remains a draft for visual review; the [previous V3 review](ART_V3_REVIEW.md) and its exports are preserved.

## Visual changes

- Dark hair retains more of its selected pigment in highlights instead of turning silver. The existing rounded faces, curls, cloth folds and lace are retained.
- Gentle expressions blink once per three-second idle loop: open, half lid, closed, half lid, open. The head layer owns the expression so the eyes follow its pose and face shape.
- **Happy eyes** is a separately saved expression. **Rose hairpiece** is an optional, freely combinable accessory, independent of outfit and appearance. Both are available for all four hairstyles.
- Walking has a wider stride, more knee lift, asymmetric elbow/wrist movement, stronger trailing hair and hem sway. Planted soles remain on row 239; the attachment anchor stays (96, 240).
- Frame size remains **192×256**, sheet **1536×512**, native right-facing with mirrored left playback. V4 uses four idle images across 24 timing entries at 8 fps and eight walking images at 10 fps. The CharacterPack format remains version 1.

## Actual output evidence

All comparisons and GIFs below use actual exported PNGs and their manifests. Source illustrations are production inputs, not substitutes for generator evidence.

| Review                                             | Artifact                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matched V3 → V4, same inputs/frame/background/zoom | [Native comparison](art-expressive/before-after-native.png), [2× comparison](art-expressive/before-after-enlarged.png)                                                                                                    |
| Mira, Rowan and Jun                                | [Native lineup](art-expressive/lineup-native.png), [2× lineup](art-expressive/lineup-2x.png)                                                                                                                              |
| Casual and wedding clothing                        | [Outfits](art-expressive/outfits-2x.png), [wedding pair at 1× and 2×](art-expressive/wedding-pair.png)                                                                                                                    |
| Expressions and identity options                   | [Happy eyes](art-expressive/expressions-2x.png), [face shapes](art-expressive/face-study.png), [hairstyles](art-expressive/hairstyles-2x.png)                                                                             |
| Full idle/walk loops, both directions              | [Wedding GIF](art-expressive/wedding-pair-motion.gif), [happy wedding GIF](art-expressive/happy-wedding-motion.gif), [lineup GIF](art-expressive/characters-motion.gif), [outfits GIF](art-expressive/outfits-motion.gif) |
| Actual independent player capture                  | [Browser recording](art-expressive/independent-player-motion.webm)                                                                                                                                                        |
| Workflow and validation                            | [Studio](art-expressive/studio-expressive.png), [player](art-expressive/player-expressive.png), [export/playback index](art-expressive/evidence-index.json), [GIF metadata](art-expressive/animation-evidence.json)       |
| Composition                                        | [Labeled neutral preview](art-expressive/neutral-scene.png); not a Gathria scene                                                                                                                                          |

Eight public packs: [Mira](../public/samples/expressive/mira.character.zip), [Rowan](../public/samples/expressive/rowan.character.zip), [Jun](../public/samples/expressive/jun.character.zip), [casual](../public/samples/expressive/mira-casual.character.zip), [suit](../public/samples/expressive/mira-wedding-suit.character.zip), [dress](../public/samples/expressive/mira-wedding-dress.character.zip), [happy suit](../public/samples/expressive/joyful-suit.character.zip), [happy dress](../public/samples/expressive/joyful-dress.character.zip).

PNG outputs retain binary alpha and lossless colors. GIFs use one shared palette without dithering; they may quantize colors. GIF timing alternates 120/130 ms for 8 fps idle entries because GIF has 10 ms precision, retaining the exact three-second loop. PNG packs and browser playback are the authoritative assets.

## Saved-work compatibility

Configuration schema stays 2 and explicitly selects artwork 2, 3 or 4. V4 requires `expression: "gentle" | "joyful"` and `hairAccessory: "none" | "flowers"`. Old configurations need neither field. **Create expressive copy** is the explicit editor migration action; loading, editing, presets, reset and save retain old artwork versions. Existing V3 defaults/presets now have dedicated exports so historical scripts and tests keep selecting V3.

V1/V2 remain 48×64; V3 remains 192×256 with its original timing and shading. No existing sample directory or prepared V3 asset bank is modified. Independent playback consumes dimensions, timing and anchors from the manifest and needs no generator or source-art dependency. The original V3 migration API remains supported and rejects an implicit V4 downgrade.

## Verification

Validated on 2026-10-15 with Node 24.19.0 and system Chromium:

- **186 unit tests**, no skips, including all previous checks. New regressions cover published V3 decoded pixel hashes, V4 determinism and configuration validation, four hairstyles' blink regions, face variation, stable walking portraits, hair/hem motion, palette support, and connected/grounded/unclipped casual and wedding poses.
- **9 browser workflows**: old V1/V2/V3 pixels and save/reopen/export remain exact; explicit copies, expression/accessory export, both mirrored directions, independent playback with generator modules blocked, responsive controls and malformed input handling.
- **Typecheck and production build pass.** Both studio and independent player build.
- **20 actual PNG exports** checked against generator RGBA; eight public packs plus two wedding reference looks play independently. All **40 animation/facing cases** observe every declared frame ID. Native and integer-zoom images, all walk poses, and recorded playback frames are inspected.
- Accessory preparation is deterministic from the committed source. The previous V3 bank and exported evidence remain unchanged.

## Reproduce

With Vite running:

```sh
# Only needed when rebuilding the committed accessory:
python3 scripts/prepare-expressive-accessory.py
# Actual browser exports, validation and live independent playback capture:
CHROMIUM_PATH=/usr/bin/chromium node scripts/generate-expressive-evidence.mjs
# Compose PNG comparisons and GIFs from those exported assets:
python3 scripts/render-expressive-review.py
```

Preparation uses the pinned Pillow/NumPy dependencies in `artwork/requirements.txt`. The application needs no Python, API key or model service. [Provenance](ASSET_PROVENANCE.md) records the AI-assisted production banks and new flower asset.

## Limits and next work

This is a refinement of the existing layered illustration rig. The reference sheets' running, jumping, heart/bouquet gestures and large open-mouth expressions are **not implemented**. Walking uses transformed layers rather than individually painted poses; hair and fabric use restrained deformation, not cloth physics. Happy eyes are a held expression; their closed eyes do not blink separately. Asymmetric details mirror with the character. Body shapes and other viewing angles remain limited.

Gathria integration remains **unverified**; no accessible actual scene assets were available in this task. The neutral preview does not establish production scale, layering or runtime compatibility. AI/photo input and production Gathria integration remain separate later milestones. Keep the draft PR unmerged and stop for user review.
