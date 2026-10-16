# Motion 2 running review

This batch keeps Artwork V6 and introduces explicit `motionVersion: 2`. The review images use application-exported spritesheets. Earlier Motion 1 exports and all files in `docs/running/` remain unchanged.

## Actual export comparisons

- [Motion 1 / Motion 2 at native size](before-after-1x.png) and [2× nearest-neighbor](before-after-2x.png), with identical character configurations, backgrounds and frame IDs.
- [Timed before/after](before-after-run.gif), [run key poses](run-keyframes.png), and [head/shoulder/hand connections](run-connections-3x.png).
- [Idle/walk/run at native size](idle-walk-run-1x.png), [2×](idle-walk-run-2x.png), and [action switching](action-switch.gif).
- Bride [right](dress-run-right.gif) / [left](dress-run-left.gif); groom [right](suit-run-right.gif) / [left](suit-run-left.gif); [combined right](run-right.gif) / [combined left](run-left.gif).
- [Three expressions](run-expressions-2x.png), [deep skin and blonde hair](run-recolor-2x.png), and [shorts/skirt poses](run-lower-garments-2x.png).
- Final packs: [bride](dress-joyful.character.zip) and [groom](suit-joyful.character.zip).
- [Independent player recording](independent-player.webm), [player screenshot](independent-player.png), and [legacy pack without Run](legacy-pack-run-unavailable.png).

These are in-place previews in a neutral scene. They do not establish world-space speed matching or production Gathria integration.

## Capture and verification

The bounded batch contains ten configurations: the two wedding characters in three expressions, two deep-skin/blonde combinations, one jacket/shorts combination and one tee/skirt combination.

Browser generation checks deterministic round trips, decoded PNG equality, and exact V6 idle/walk rows. Explicit Motion 1 generation must still reproduce the previously delivered wedding spritesheets. A separate consumer page loads the new packages only after Studio closes; renderer/editor imports are blocked. The two characters each play Run left and right, with every declared frame ID checked against the corresponding exported PNG. Live pixel comparison covers 192 × 230 px, excluding the attachment guide; full PNG boundaries and alpha are checked separately.

`exports-validation.json` and `playback-validation.json` preserve successful stages. A continued playback capture must check unchanged source hashes, saved ZIP hashes and extracted-member equality before reusing exports. The final `evidence-index.json` records any continuation explicitly.

`file-validation.json` records recursive PNG/GIF/ZIP decoding, frame order, timing, alpha, historical source hashes, public sample equality, and full video decoding. GIF frames are checked against the quantized source-frame hash sequence before delivery. The pack retains exact 18 fps; the 12-frame GIF cycle uses cumulative centisecond rounding and lasts 670 ms rather than 666.67 ms.

Run sequentially after the final rig is stable:

```sh
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-running-v2-evidence.mjs
python scripts/render-running-v2-review.py
python scripts/verify-running-v2-evidence.py
```

Completed exports can be reused for a playback-only continuation with `RUNNING_V2_REUSE_EXPORTS=1`, subject to the integrity checks above. Do not render review panels while the exporter is replacing spritesheets.

This batch passed actual capture and validation at `2026-10-16T21:54:06.566Z`: ten final exports (240 frame boundaries), four independent left/right run cases, 28 decoded PNGs, ten GIFs including two retained iteration previews, four retained iteration ZIPs, and the full 14.2-second consumer recording. There were no page errors, external requests or forbidden renderer/editor imports. All final GIFs also matched the intended quantized frame hash sequence and durations. V6 idle/walk pixels and delivered Motion 1 wedding pixels remain reproducible, with historical renderer/asset hashes unchanged.

The groom’s stride and arm silhouettes are more compact. Bride changes are more subtle because the full gown still hides both legs. The existing V6 heads and garments retain their original viewing angle; these previews do not claim a newly painted strict profile. Technical verification and user visual acceptance are separate.
