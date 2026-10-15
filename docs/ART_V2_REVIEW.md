# Character Art V2 review

V2 redraws the generated characters in a warm, compact life-simulation style. Review the **exported artwork** below; these are actual application outputs, not concept illustrations. This milestone is ready for visual review, not a claim of final Gathria art approval.

## Visual changes

- Rounded three-quarter faces replace the prominent profile nose. Paired eyes, softer eyebrows, a small interior nose, restrained cheek color, and a small smile keep the expression readable.
- Mira has a tapered heart face and broad swept waves; Rowan has a longer oval face and a compact silver sweep; Jun has fuller cheeks and a rounded bob. Three faces remain distinct with identical hair and colors.
- Larger rounded head masses, a short visible neck, bent resting forearms, smaller shoes, and material-colored outlines soften the body. Hair uses connected clusters and a single broad highlight instead of heavy face shadows.
- Four existing hairstyles were redrawn. Polished casual, wedding suit, and wedding dress are editable starting points; all garments and colors remain freely combinable. The dress overlaps the hips and moving legs, with a small hem sway.
- Every idle/walk drawing uses the same portrait geometry. Idle holds four drawings over three seconds, including a blink; walking retains eight poses with opposing arm/leg movement and a planted foot. Both directions use the existing mirror convention.

## Actual visual evidence

| Review item                                                           | Artifact                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Matched V1/V2, same palette/options, frame 0, background, and 5× zoom | [Before/after](art-v2/before-after.png)                                                          |
| Representative Mira, native/enlarged and walking poses                | [Direction study](art-v2/mira-direction-study.png)                                               |
| Three characters                                                      | [Native 1×](art-v2/lineup-native.png), [5×](art-v2/lineup-5x.png)                                |
| Controlled face and hair comparisons                                  | [Faces](art-v2/face-study.png), [Hairstyles](art-v2/hairstyles-5x.png)                           |
| Casual and wedding clothing                                           | [Outfits](art-v2/outfits-5x.png)                                                                 |
| Complete idle/walk cycles, right and left                             | [Character GIF](art-v2/characters-motion.gif), [Outfit GIF](art-v2/outfits-motion.gif)           |
| Actual independent-consumer playback                                  | [Browser recording](art-v2/independent-player-motion.webm)                                       |
| Every exported drawing                                                | [Contact sheets](art-v2/contacts/)                                                               |
| Static composition, explicitly not a Gathria scene                    | [Neutral scene](art-v2/neutral-scene.png)                                                        |
| Editor and consumer                                                   | [Studio](art-v2/studio-v2.png), [Player](art-v2/player-v2.png)                                   |
| Validated inputs and evidence metadata                                | [Export index](art-v2/evidence-index.json), [Animation metadata](art-v2/animation-evidence.json) |

The GIFs use exact exported RGB values, integer nearest-neighbor scaling, metadata frame order/FPS, one full idle loop and two walk loops in each direction. Each lasts 9.2 seconds. PNGs and ZIPs retain transparency; review backgrounds are added only for viewing. The browser recording captures live consumer playback, not spritesheet assembly.

Sample ZIPs: [Mira](../public/samples/v2/mira.character.zip), [Rowan](../public/samples/v2/rowan.character.zip), [Jun](../public/samples/v2/jun.character.zip), [casual](../public/samples/v2/mira-casual.character.zip), [wedding suit](../public/samples/v2/mira-wedding-suit.character.zip), [wedding dress](../public/samples/v2/mira-wedding-dress.character.zip). Extracted versions are adjacent to them.

Reproduce with a running Vite server:

```sh
CHROMIUM_PATH=/usr/bin/chromium node scripts/generate-art-v2-evidence.mjs
python3 scripts/render-art-v2-review.py
```

Python assembly requires Pillow. Omit `CHROMIUM_PATH` when using Playwright's installed Chromium. No character art is drawn by the evidence assembler.

## Compatibility decisions

- V1 saved JSON dispatches to the frozen V1 renderer. The three original decoded RGBA hashes, configurations, manifests, and archived packages remain unchanged. Opening, editing, resetting, or saving V1 does not opt into V2.
- **Create Art V2 copy** is explicit. V2 configuration requires `schemaVersion: 2`, `artworkVersion: 2`, and `faceVariant`. Determinism is scoped to configuration and artwork version. Hybrid V1/V2 inputs are rejected.
- CharacterPack **manifest schema remains 1**. Frames remain 48×64, sheet 384×128, anchor (24, 60); right is native and left is mirrored. Generator IDs distinguish artwork. V2 idle repeats frame IDs in its timing list rather than changing the format. V1 timing is untouched.
- The independent consumer still requires only PNG and manifest for playback. It offers both V2 and original V1 example ZIPs and does not import generator/editor code.
- `npm run samples` deliberately regenerates legacy samples only. V2 evidence/export scripts write separate directories.

## Verification

Executed on 2026-10-15 with Node 24.19.0, npm 11.9.0, and system Chromium:

- **137 unit tests passed**, no skips: config/version validation, frozen V1 pixel hashes, determinism, transparency, frame boundaries/anchors, distinct face silhouettes, portrait stability, garment connectivity, malformed imports, pack and playback contracts.
- **7 Chromium workflows passed**, including V1 import/save preservation, explicit migration, V2 editing/reopen, real wedding ZIP export, both playback directions, V1 independent playback, mobile layout, and generator-blocked consumer loading.
- **Typecheck and production build passed.** Both studio and player entrypoints build.
- Evidence generation validates 16 real exports, compares decoded PNG bytes with generated pixels, and opens all six public V2 packs in the independent player with generator/editor routes blocked.
- Native and integer-zoom portraits, all outfit poses, mirrored playback samples, loop timing, and the six built-in skin tones were inspected. The complete recorded playback and GIFs are included for further visual review.

## Known limits and remaining work

The art uses one compact body rig and a single mirrored three-quarter view. Faces, fingers, cloth folds, and shoes are intentionally simplified at 48×64; there is no cloth physics, secondary hair motion, rear view, or body-shape selector. Arbitrary custom colors can reduce contrast. Visual preference still needs user review.

Actual Gathria scene assets/runtime were inaccessible (read-only repository request returned HTTP 403). The neutral composition is not an integration test. Obtain runtime access, record its revision and loader contract, then verify these unchanged dimensions, anchors, timing, scale, and mirroring in a real scene. Firefox and Safari remain unverified. AI/photo generation and production Gathria integration are separate later milestones.
