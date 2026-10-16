# Compact running review (motion version 2)

The supplied movement study's **third row** guides this refinement: a compact running cycle with bent-knee recovery beneath the body, fore/aft elbow pumping and restrained rise/fall. The preserved V6 artwork remains three-quarter facing. This is a motion study, not a claim to have redrawn a pure-profile character or achieved user visual acceptance.

## Actual exported comparison

- [Before/after animation](running-v2/before-after-run.gif), [native-size comparison](running-v2/before-after-1x.png), [2× comparison](running-v2/before-after-2x.png). Matched identities, expressions, frames, scale and background.
- [All running key frames](running-v2/run-keyframes.png), [neck/shoulder/wrist crops](running-v2/run-connections-3x.png), [three expressions](running-v2/run-expressions-2x.png).
- Bride [right](running-v2/dress-run-right.gif) / [left](running-v2/dress-run-left.gif); groom [right](running-v2/suit-run-right.gif) / [left](running-v2/suit-run-left.gif).
- [Idle/walk/run comparison](running-v2/idle-walk-run-1x.png), [action switching](running-v2/action-switch.gif), [recoloring](running-v2/run-recolor-2x.png), [shorts/skirt](running-v2/run-lower-garments-2x.png).
- Portable packs: [bride](../public/samples/running-v2/dress.character.zip), [groom](../public/samples/running-v2/suit.character.zip).
- [Independent playback recording](running-v2/independent-player.webm), [player screenshot](running-v2/independent-player.png), [browser index](running-v2/evidence-index.json), [decoded-file report](running-v2/file-validation.json).

All images and animations use actual application-exported PNGs. Neutral backgrounds and in-place animation are explicitly labeled. No Gathria scene or world travel speed is asserted.

## Changes and iteration result

| Area            | Change                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stride          | Foot targets now originate from the posed hip. The standing artwork's ankle splay is no longer added to every stride. Smaller airborne separation and earlier folded recovery replace the broad split/leap. |
| Arms            | Near-right-angle elbow flexion stays consistent through the forward/back pump. The hidden far shoulder moves inward 8 px, keeping its swing closer to the torso.                                            |
| Weight and feet | Body rise/fall spans 6 px rather than 11 px. Recovery shoes pitch modestly; planted soles keep the original y239 floor pixel.                                                                               |
| Identity        | Head, neck, collar, torso and flower retain their common rigid transform and original V6 shape. The hair and accessory stay registered.                                                                     |
| Bride           | Both hands stay on the gown grips. Reduced body bounce and hem lift make the full-skirt trot steadier. No shoes or artificial leg holes are exposed.                                                        |

Iteration 01 established the compact cycle. Iteration 02 corrected the hidden far-shoulder transform so the upper-arm/forearm targets share the intended flexion. Native-size and integer-zoom inspection found the groom's folded recovery and pump clearer, with no new shoulder/wrist gap. The frame 11→0 transition stays within ordinary adjacent-frame change and shows no abrupt reset. Iteration 02 is the retained version; [both actual export iterations](running-v2/iterations/) remain available.

No source illustrations were regenerated. The new rig reuses frozen V6 layers, recoloring and run-only joint masks. The user reference informed motion analysis; no reference pixels entered the source bank. See [provenance](ASSET_PROVENANCE.md#compact-running-refinement-motion-version-2).

## Compatibility

- Independent `motionVersion: 2` with artwork V6; generator ID `gathria-polished-pixels-v6-motion-v2`. Motion 1 rig/generator and V1–V7 artwork remain unchanged.
- New Studio characters and the main player sample use Motion 2. Existing Motion 1 files retain their rendering, presets and preview. **Create compact running copy** explicitly upgrades them. Old V6 files use **Add running**; other artwork versions follow their existing explicit-copy rules.
- Original V6 idle/walk rows are copied exactly. Frame size 192×256, anchor (96,240), extended sheet 1536×1024, CharacterPack schema 1 and optional `animations.run` remain unchanged.
- Run retains IDs 12–23 at 18 fps (666.67 ms). The bride has 11 distinct drawings across 12 timed frames; the groom has 12. GIF's centisecond quantization produces 670 ms. Saved action/facing is preview metadata only.
- Old packs remain loadable and play their saved pixels; Run is unavailable when absent. The consumer requires no runtime generator or model API.

## Verification executed in this batch

**259 unit tests**, **22 Chromium E2E tests**, TypeScript and production build passed. Focused regressions protect original Motion 1 source and complete exported RGBA hashes, explicit upgrades, deterministic Motion 2 rendering, unchanged V6 rows, connected silhouettes, contact/flight bounds and reduced maximum airborne groom spread.

Browser evidence verified **10 actual exported configurations / 240 frames**, including both identities in three expressions, deep skin/blonde hair, shorts and a skirt. After Studio closed, **4 independent running cases** (two identities × two directions) played every declared frame and matched decoded exported pixels. Live proof covers 192×230 px above the attachment overlay; full exported RGBA, alpha and bounds are checked separately.

The final verifier decoded **28 PNGs, 10 final ZIPs, 4 retained iteration ZIPs, 10 GIFs** (8 final previews + 2 iterations), and the complete **14.2-second player recording**. GIF frame order is checked against hashes of the quantized exported source frames, as well as frame count and duration. Public ZIPs match the reviewed packages. No capture errors, external requests or forbidden editor/generator imports occurred.

These counts are this batch's executions, not historical results. The previous Motion 1 review and evidence remain intact. Reproduction commands and capture checkpoints are in [the evidence README](running-v2/README.md).

## Remaining limits

The compact three-quarter jog is closer to the reference's movement mechanics; a true profile silhouette still needs authored side-view artwork. The full gown hides the bride's knees and feet, so her stride is less explicit and remains a restrained skirt-holding trot. Generic clothing joints and rotated shoe shapes retain some cutout rigidity. Cloth folds are deformed from standing layers, not individually painted poses. Production scene integration, world-speed matching and user visual acceptance remain outstanding.

Implementation recovery point: `37db61b`. The following delivery commit adds this review and the final export evidence. Keep PR #2 draft and unmerged, and stop for review.
