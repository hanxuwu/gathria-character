# Running limb connection review

These images, loops and CharacterPacks come from actual browser application exports. The four appearances, V6 artwork, expression, colors, 192 × 256 frame size, attachment anchor (96, 240), 12 run frames and 18 fps timing are held constant. The only saved configuration change between a matched before/after pair is `motionVersion: 2` → `motionVersion: 3`.

The frozen before capture was made from merged commit `ebec736e72966923304281bc0150505ae04f1c99` on 2026-10-17 at 00:09:28 UTC, before the new renderer was edited. Its browser-decoded PNGs matched the generator RGBA bytes. [`before/frozen-source-hashes.json`](before/frozen-source-hashes.json) preserves 41 historical renderer and source-art hashes; [`before/exports-validation.json`](before/exports-validation.json) records the complete appearance configurations and export hashes.

## Matched visual evidence

- [Native-size before/after](before-after-1x.png), [2× before/after](before-after-2x.png).
- Complete 12-frame sheets: before [1×](before/run-keyframes-1x.png) / [2×](before/run-keyframes-2x.png), after [1×](after/run-keyframes-1x.png) / [2×](after/run-keyframes-2x.png).
- Whole-figure connections: [before 3×](before/connections-3x.png), [after 3×](after/connections-3x.png).
- All 12 phases in paired local crops: [Coral wrists, sleeves and waist](coral-afternoon-details-4x.png); [Denim knees, cuffs and ankles](denim-daytrip-details-4x.png), [Sage knees and ankles](sage-weekend-details-4x.png), [Ochre knees, cuffs and ankles](ochre-traveler-details-4x.png).

| Appearance      | Synchronized before/after run                                                               | Original run                                                                                | Repaired run                                                                              | Repaired CharacterPack                     |
| --------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| Denim daytrip   | [Right](denim-daytrip-comparison-right.gif) / [Left](denim-daytrip-comparison-left.gif)     | [Right](before/denim-daytrip-run-right.gif) / [Left](before/denim-daytrip-run-left.gif)     | [Right](after/denim-daytrip-run-right.gif) / [Left](after/denim-daytrip-run-left.gif)     | [ZIP](after/denim-daytrip.character.zip)   |
| Coral afternoon | [Right](coral-afternoon-comparison-right.gif) / [Left](coral-afternoon-comparison-left.gif) | [Right](before/coral-afternoon-run-right.gif) / [Left](before/coral-afternoon-run-left.gif) | [Right](after/coral-afternoon-run-right.gif) / [Left](after/coral-afternoon-run-left.gif) | [ZIP](after/coral-afternoon.character.zip) |
| Sage weekend    | [Right](sage-weekend-comparison-right.gif) / [Left](sage-weekend-comparison-left.gif)       | [Right](before/sage-weekend-run-right.gif) / [Left](before/sage-weekend-run-left.gif)       | [Right](after/sage-weekend-run-right.gif) / [Left](after/sage-weekend-run-left.gif)       | [ZIP](after/sage-weekend.character.zip)    |
| Ochre traveler  | [Right](ochre-traveler-comparison-right.gif) / [Left](ochre-traveler-comparison-left.gif)   | [Right](before/ochre-traveler-run-right.gif) / [Left](before/ochre-traveler-run-left.gif)   | [Right](after/ochre-traveler-run-right.gif) / [Left](after/ochre-traveler-run-left.gif)   | [ZIP](after/ochre-traveler.character.zip)  |

The neutral background, integer zoom and animation phase match in each comparison. These previews show in-place animation. GIFs use one palette per clip and cumulative centisecond rounding: 12 frames over 670 ms, while the CharacterPack keeps the exact 18 fps / 666.67 ms run timing.

Representative wardrobe and palette regressions are exported separately: [idle/walk/run at native size](regressions/idle-walk-run-1x.png), [neckline and limb details](regressions/connections-3x.png), and running [right](regressions/lineup-run-right.gif) / [left](regressions/lineup-run-left.gif). They cover a wedding suit, wedding dress, dark skin with blonde hair and a joyful soft-top character, and light skin with a neutral hoodie character. Together with the main looks, all five upper garments and all three expressions are represented.

## Independent playback

The [player screenshot](after/independent-player.png), [recording](after/independent-player.webm) and [playback log](after/playback-validation.json) document loading each exported package and playing Run in both directions after the Studio page closed. The verification compares the live pixels with every declared exported run frame, with mirrored expected pixels for left-facing playback. The live pixel region is 192 × 230 px (the attachment guide is excluded); full PNG alpha, frame boundaries and unused atlas cells are checked separately.

The browser blocks renderer/editor imports in the consumer and records external requests and browser errors. A legacy idle/walk-only pack must still load and explicitly disable Run.

## Reproduction

The committed `before/` artifacts are immutable historical evidence. `capture-run-connections-baseline.mjs` refuses to overwrite them. New rendering work goes to named iterations, then to `after/` after inspection.

```sh
# Capture a recoverable candidate without final player recording.
RUN_CONNECTIONS_ITERATION=01 PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-run-connections-evidence.mjs
RUN_CONNECTIONS_ITERATION=01 python scripts/render-run-connections-review.py

# Capture representative wardrobe/recolor regressions after renderer freeze.
RUN_CONNECTIONS_REGRESSION=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-run-connections-evidence.mjs

# Freeze final exports, inspect all frames and both directions.
RUN_CONNECTIONS_EXPORT_ONLY=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-run-connections-evidence.mjs
python scripts/render-run-connections-review.py

# Reuse only if source, ZIP and extracted-member hashes remain identical.
RUN_CONNECTIONS_REUSE_EXPORTS=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-run-connections-evidence.mjs
python scripts/verify-run-connections-evidence.py
```

`exports-validation.json` records deterministic configuration round trips, decoded PNG equality and exact original V6/Motion 1/Motion 2 idle/walk rows. `preview-timelines.json` records every expected decoded GIF frame hash and duration. `file-validation.json` records complete PNG/GIF/ZIP decoding, before/after configuration and idle/walk equality, preserved historical sources, and independent player video decoding.

Application test results, causes of the repaired defects and remaining visual limits are recorded in the milestone review. Passing file and playback checks does not constitute user visual acceptance or production Gathria integration.

## Results from this capture

Final playback capture completed at **2026-10-17T00:21:20.553Z**. This batch decoded all **61 PNGs, 48 GIFs, 12 baseline/final/regression ZIPs plus four retained iteration-02 ZIPs**, and the complete **23.360000-second** independent-player video. All eight main-look run playback cases observed every declared frame with matching exported pixels. Browser errors, forbidden generator/editor imports and external requests were empty.

The four final packs exactly match the reviewed iteration-02 RGBA output, and their public sample copies are byte-identical. The original idle/walk atlas rows remain exact in every main and representative regression configuration. In all 12 run frames for all four main looks, the full-width top 111 px containing the head and neck are byte-identical to the frozen Motion 2 baseline. See [visual invariants](after/visual-invariants.json), [file validation](file-validation.json), and [browser evidence](after/evidence-index.json).

The valid intermediate [iteration 02](iterations/02/exports-validation.json) is retained for recovery and review. The rejected first local candidate was moved outside the repository; it is not presented as a final result. No source illustration was generated for this repair. All source-art and prior-renderer hashes remain unchanged.
