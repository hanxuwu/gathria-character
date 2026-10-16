# Running review evidence

These files come from the application’s browser generator and CharacterPack exporter. They are not concept images. The art remains V6; the added run clips use explicit `motionVersion: 1`.

## Frozen baseline

[`../running-baseline/`](../running-baseline/) contains fresh browser-generated V6 bride/groom packs captured before adding running. Their PNG hashes match the previously delivered V6 packs. `baseline-index.json` freezes the V6 renderer and asset-bank source hashes. The new exports must keep both original atlas rows byte-for-byte identical.

## Review media

- [Idle/walk/run at native size](idle-walk-run-1x.png), [2× nearest-neighbor](idle-walk-run-2x.png), and [matched V6 regression panel](baseline-regression-1x.png).
- [Run key poses](run-keyframes.png), [head/shoulder/hand connections](run-connections-3x.png), [three expressions](run-expressions-2x.png), [five upper garments](run-wardrobe-1x.png), and [representative recolors](run-recolor-2x.png), and [shorts/skirt poses with exposed legs](run-lower-garments-2x.png).
- Bride: [right run](dress-run-right.gif), [left run](dress-run-left.gif). Groom: [right run](suit-run-right.gif), [left run](suit-run-left.gif).
- [Combined right run](run-right.gif), [left run](run-left.gif), and [idle/walk/run switching](action-switch.gif).
- Final packs: [bride](dress-joyful.character.zip), [groom](suit-joyful.character.zip).
- [Independent player recording](independent-player.webm), [player screenshot](independent-player.png), and [legacy pack without Run](legacy-pack-run-unavailable.png).

All review scenes are neutral backgrounds. Both applications and these previews show **in-place playback** at the fixed attachment point; there is no claimed world-space travel speed or production Gathria scene integration.

## Timing and validation

The exported run is 12 timeline frames at 18 fps (666.67 ms). The bride has 11 distinct visible drawings: frames 14 and 20 share the same visible pose on opposite hidden-leg phases. The groom has 12 distinct drawings. Live playback checks verify all declared frame IDs against their own exported pixels. GIF only supports whole centiseconds, so cumulative rounding produces a 670 ms cycle without dropping frames. `preview-timelines.json` records each GIF’s actual frame durations. PNGs retain binary transparent alpha; preview GIFs deliberately include a neutral opaque scene.

`evidence-index.json` records actual browser generation, PNG decode equality, round-trip determinism, unchanged V6 rows, and independent playback with Studio closed. Live consumer canvas pixels are compared against separately decoded exported PNG frames in both directions over a 192 × 230 px region, excluding the bottom attachment guide. The full spritesheet RGBA, frame boundaries and alpha are verified separately for every export. Generator and editor imports are blocked during consumer playback. `exports-validation.json` and `playback-validation.json` preserve completed stages independently. A resumed playback capture may reuse exports only after source-hash, ZIP-hash and extracted-member equality checks; the final index records that continuation explicitly. `file-validation.json` records full PNG/GIF/ZIP decode checks, frame order, timing, transparency, baseline equality, and full video decoding.

Run in sequence after the final code changes:

```sh
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-running-evidence.mjs
python scripts/render-running-review.py
python scripts/verify-running-evidence.py
```

The review renderer must run after export completes. Generation and panel rendering must not run concurrently against the same output directory.

## Retained iterations

`iterations/01/` is the first actual implementation export. The groom’s stride was distinct from walking, but trouser/heel protrusions and the bride’s restrained motion required further visual review. These files preserve the initial review state; final deliverables are the files directly in this directory. Later iteration folders preserve each subsequent actual export, including its decoded GIF and contact sheet. The final wedding poses match iteration 04: both bride hands share the gown deformation, her legs/shoes remain occluded by the full dress, and running-only source masks remove borrowed hair and pointed trouser-cuff fragments. The final generic-leg correction preserves exposed skin when shorts or a skirt are selected.

Current batch verification passed: 22 final CharacterPacks (528 frame bounds), 20 independent playback cases, 46 PNGs, 15 GIFs including four retained iteration previews, eight retained iteration ZIPs, and the full 56.2-second consumer recording. The final action-switch GIF decodes to 114 displayed frames over 13.2 seconds. Frozen V6 source hashes and both original atlas rows remain exact. Source generation/export was captured at `2026-10-16T21:36:42.023Z`; the isolated playback continuation completed at `2026-10-16T21:40:08.176Z`, reusing those validated exports with unchanged renderer hashes.

Passing technical checks establishes reproducibility and playback compatibility. It does not imply user visual acceptance.
