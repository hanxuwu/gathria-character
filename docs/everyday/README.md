# Everyday character review

Four complete everyday examples use the existing Artwork V6 / Motion 2 renderer. They come directly from `EVERYDAY_EXAMPLES` in [`src/core/everyday-presets.ts`](../../src/core/everyday-presets.ts), the same catalog used by the editor. This batch changes look definitions and editor choices; it does not repaint source art or alter historical rigs, assets or export evidence.

## Actual exported looks

| Look            | Clothing                                 | Pack                                           |
| --------------- | ---------------------------------------- | ---------------------------------------------- |
| Denim daytrip   | Blue jacket, warm trousers, light shoes  | [CharacterPack](denim-daytrip.character.zip)   |
| Coral afternoon | Coral soft top, muted skirt, dark shoes  | [CharacterPack](coral-afternoon.character.zip) |
| Sage weekend    | Sage hoodie, denim shorts, light shoes   | [CharacterPack](sage-weekend.character.zip)    |
| Ochre traveler  | Ochre jacket, blue trousers, light shoes | [CharacterPack](ochre-traveler.character.zip)  |

Each example is a complete editable configuration with no floral hair accessory or wedding garments. Applying a wardrobe preset in the editor preserves the user's character identity, expression and supported artwork/motion version.

- [Native idle lineup](lineup-idle-1x.png), [2× idle lineup](lineup-idle-2x.png), [native run lineup](lineup-run-1x.png), [2× run lineup](lineup-run-2x.png).
- [Idle/walk/run comparison](idle-walk-run-1x.png), [all run frames](run-keyframes.png), and [neckline, shoulder, wrist and waist details](connections-3x.png).
- Idle [right](idle-right.gif) / [left](idle-left.gif); walk [right](walk-right.gif) / [left](walk-left.gif); run [right](run-right.gif) / [left](run-left.gif).
- [Action switching](action-switch.gif), [Studio screenshot](studio-everyday.png), [independent player screenshot](independent-player.png), and [independent player recording](independent-player.webm).

All images and loops are rendered from actual exported PNGs. The backgrounds are neutral preview scenes; playback is in place at the fixed attachment point.

## Verification method

The browser generates and exports all four catalog examples, reopens each package, and compares the decoded PNG RGBA with the renderer. Configuration round trips must generate identical pixels. The original V6 idle/walk rows must match both the plain V6 and explicit Motion 1 rendering of the same appearance.

After Studio closes, the independent player loads all four packages and plays Run left and right: eight cases. Every declared frame ID must be observed with pixels matching its exported frame. Live comparison covers 192 × 230 px, excluding the attachment guide; full spritesheet alpha and frame boundaries are checked separately. Renderer/editor imports and external HTTP requests are blocked or recorded.

`exports-validation.json` and `playback-validation.json` preserve completed stages. Final capture may reuse visually reviewed exports only after unchanged source hashes, captured ZIP hashes and extracted-member equality checks. `evidence-index.json` records the export and playback timestamps. `file-validation.json` records full PNG/GIF/ZIP/video decoding, exact frame order and durations, historical renderer hashes and public sample equality.

GIFs use a shared palette and cumulative centisecond rounding. The 12-frame run GIF lasts 670 ms; the exported clip retains exact 18 fps (666.67 ms). Every decoded GIF frame hash and duration must match the sequence constructed from exported PNGs.

```sh
# First inspect candidate actual exports without repeating player recording.
EVERYDAY_EXPORT_ONLY=1 CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-everyday-evidence.mjs
python scripts/render-everyday-review.py

# After look definitions are frozen, reuse those verified packages for playback.
EVERYDAY_REUSE_EXPORTS=1 CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-everyday-evidence.mjs
python scripts/verify-everyday-evidence.py
```

If look definitions or renderer hashes change, run a fresh export and rerender the previews before final verification.

## Remaining visual limits

The soft top can reveal thin skin-colored flecks at the waist during running, most visible on Coral afternoon. Generic exposed knees and cuffs retain some angular silhouettes. These are inherited limitations of the preserved layered rig and source assets; this batch keeps the four looks and documents the tradeoff instead of changing previously delivered rendering behavior.

The existing figures retain the original V6 viewing angle and local layered animation. Production Gathria scene integration and user visual acceptance remain unverified.

## Results from this capture

The final capture completed on 2026-10-16 at 22:25:53 UTC. All four fresh export configurations and spritesheet PNGs exactly matched the visually reviewed candidate. Validation decoded 14 PNGs, 4 complete CharacterPack ZIPs containing 96 frames, 7 GIFs, and the full 20.96-second independent-player video. All eight run playback cases observed every declared run frame with matching live pixels; browser errors, forbidden imports and external requests were empty.

Idle GIFs decode to five timed frames (four unique drawings) over 3000 ms, walk to eight frames over 800 ms, and run to twelve frames over 670 ms. The action-switch preview contains 61 timed frames over 6470 ms. V6 idle/walk pixels, historical V6/Motion 1/Motion 2 renderer hashes, transparent atlas margins, and the four public sample ZIPs passed verification. These are checks performed for this evidence capture; application unit/build/E2E results are recorded separately in the milestone handoff.
