# Wedding character harmony — Artwork V7

**Review outcome:** The user judged V7 worse than V6. V6 is restored as the default; V7 is retained as an unaccepted iteration with its original files and evidence. See [V6_DEFAULT_RESTORATION.md](V6_DEFAULT_RESTORATION.md). The implementation and verification notes below describe the V7 delivery at that time.

V7 continues V6 `c307a8f` on `fix/character-art-cohesion`, with [PR #2](https://github.com/hanxuwu/gathria-character/pull/2) kept draft and unmerged. Work date: **17 October 2026 (Australia/Sydney)**. This batch concentrates on the waves bride and crop groom. User visual approval and production Gathria integration are still outstanding.

## What changed

| V6 issue seen in actual exports                                                      | Source-art work                                                                                                               | Composition/animation work                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Groom's chin sits too close to the collar.                                           | New complete groom source; a focused second edit creates exposed neck skin, a chin shadow and a separate shirt collar.        | Register chin, collar, waist and soles separately; retain the neck through face-shape changes and other necklines.                                                           |
| Smooth faces, fine hair gradients and dense cloth do not read as one drawing method. | New complete bride/groom sheets preserve identities and wedding designs while grouping locks, folds and directional lighting. | Shared, face-weighted 96-color palette per identity; crisp nearest-neighbor sampling and restrained warm hair/skin chroma. Lace remains more detailed than the face.         |
| Neutral and gentle smile are too similar.                                            | Whole neutral, tender-smile and closed-eye joyful heads change mouth, cheek, eyelids and brows together.                      | Every waves expression uses its matching rear hair; no rectangular eye erasure or procedural symbol overlay.                                                                 |
| Joyful face has an unchanged body.                                                   | Coherent joyful face artwork.                                                                                                 | Slight head tilt, raised shoulders and curved hand/arm posture during idle. Expression placement stays constant throughout each gait.                                        |
| Bride looks stationary while the hem sways.                                          | Raised front hem with cream shoes; a hand-free gown backplate.                                                                | Independently posed shoes, contact/down/passing/up weight changes and localized front-hem lift reveal alternating steps. The rest of the gown retains weight near the floor. |
| Limb motion can move borrowed pixels.                                                | Explicit anatomy-based cuts.                                                                                                  | Exclude skin from trouser layers, keep the boutonniere on the torso, and keep static hands/shoes out of the gown. Overlap joints rather than erasing detached limbs.         |

The new images are AI-assisted production assets, made with OpenAI's image-generation tool during development. Four calls produced the bride sheet, the first groom draft, its neck refinement and the hand-free gown backplate. Exact prompts, selected originals, registration and frozen V6 hashes are in [`artwork/harmonized-source/`](../artwork/harmonized-source/). No model runs in the browser. Source sheets are **not** substituted for exported evidence.

## Review actual output

Matched comparisons retain appearance configuration, native frame size, background and frame ID; only the explicit artwork version differs. V7's joyful posture intentionally changes within that matched frame.

- [V6 → V7 at native size](art-harmonized/before-after-1x.png) · [2× integer zoom](art-harmonized/before-after-2x.png)
- [Face, head/neck and shoulder comparison at 4×](art-harmonized/face-neck-4x.png) · [sleeves and hands at 3×](art-harmonized/arms-before-after-3x.png)
- [Both characters × three expressions](art-harmonized/expressions-2x.png)
- [All upper garments](art-harmonized/wardrobe-1x.png) · [deep skin/blonde hair](art-harmonized/recolor-2x.png) · [additional skin/neckline checks](art-harmonized/neckline-skin-1x.png)
- Idle: [right](art-harmonized/idle-right.gif) · [left](art-harmonized/idle-left.gif)
- Walk: [right](art-harmonized/walk-right.gif) · [left](art-harmonized/walk-left.gif) · [named key poses](art-harmonized/walk-keyframes.png)
- [Independent-player recording](art-harmonized/independent-player.webm) · [browser evidence index](art-harmonized/evidence-index.json)
- CharacterPacks: [bride](../public/samples/harmonized/dress-joyful.character.zip) · [groom](../public/samples/harmonized/suit-joyful.character.zip) · [all variants and extracted files](art-harmonized/)
- [Per-file decoding, timeline and SHA256 report](art-harmonized/file-validation.json) · [this session’s verification summary](art-harmonized/verification-results.json)

GIFs use integer scaling, one palette per loop and exact manifest timing. Idle lasts 3000 ms: four unique drawings held in five encoded GIF frames, including the repeated starting pose. Walk has eight frames, 800 ms. PNGs and ZIPs retain the exported RGBA pixels. Review backgrounds are labeled neutral previews, not Gathria production scenes.

## Compatibility

New characters explicitly use `artworkVersion: 7` and `gathria-harmonized-pixels-v7`. V1–V6 configs retain their original generator, presets, geometry, timing and pixels. **Create V7 copy** is explicit; loading, editing and saving do not upgrade old artwork. Older conversion APIs reject downgrading V7.

V7 retains the V5/V6 fields and all customization choices. It keeps 192×256 frames, a 1536×512 sheet, anchor (96,240), four idle drawings and eight walk drawings. The idle reference sequence remains `[0,0,1,1,2,2,2,2,3,3,0,0]` at 4 fps; walk is 10 fps. CharacterPack manifest remains version 1. Left-facing playback mirrors native-right pixels around the declared anchor, including asymmetric accessories. The independent consumer loads saved PNGs and metadata without any rig or generator import.

## Verification in this V7 session

**Passed in this V7 session:** TypeScript check, production build, **210 unit tests in 10 files**, and **12 Chromium E2E tests**. File verification decoded **37 PNGs, 24 ZIPs, four GIFs and the complete independent-player recording**. The older V6 report's 200 unit/11 browser tests are historical; they are not V7 results.

The evidence set contains **24 packs**: two V6 baselines, six V7 expressions, ten upper-garment combinations, two deep-skin/blonde wedding looks and four extra skin/neckline combinations. Browser generation checks configuration round-trips, determinism, ZIP loading and decoded PNG equality. After closing Studio, 24 independent-player cases cover both identities × three expressions × idle/walk × left/right; live canvas pixels are checked against independently cropped/mirrored exported frames, excluding only the bottom anchor-guide strip.

The file verifier fully decodes every PNG, all ZIP members and CRCs, every GIF frame and the entire browser video. It verifies frame bounds, binary alpha, ground anchors, neck bridges, loop durations, public sample copies and source/renderer hashes. Targeted tests additionally protect V6 bytes, head material ownership, skin/hair separation, complete expression states, deterministic regeneration, normalized gait portraits, connected wedding poses and stable sole placement. Browser regressions compare original V1–V6 pixels before explicit V7 migration.

Reproduce with Node 24 and Python dependencies in `artwork/requirements.txt`:

```sh
python3 scripts/prepare-harmonized-assets.py
npm run typecheck
npm test
npm run build
npm run test:e2e
node scripts/generate-harmonized-evidence.mjs
# Run these only AFTER the export command finishes:
python3 scripts/render-harmonized-review.py
python3 scripts/verify-harmonized-evidence.py
```

The export script owns a Vite server on port 5177. In this cloud environment use `CHROMIUM_PATH=/usr/bin/chromium`, `CHROMIUM_ARGS_JSON='["--no-sandbox","--disable-dev-shm-usage"]'` and `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`. System FFmpeg supplies Playwright recording via its existing local cache link; `ffmpeg` and `ffprobe` also validate video. No new dependencies or network generation service are needed at runtime.

## Iteration findings and remaining limits

Actual export review caught problems that source sheets and passing build checks could not establish: overbroad skin masks removed rear-hair pixels; trouser cuts borrowed a static finger; a far forearm cut missed its elbow overlap; and head rows mistakenly retained a garment material. These were corrected at their source masks and covered by regression checks. Rear hair now matches each expression rather than borrowing neutral-state locks. The preparer is deterministic; it does not redraw faces or patch eye regions.

The gown still uses layered 2D deformation, not hand-painted walk frames or cloth simulation. Shoe visibility and weight transfer are clearer, but there is only one mirrored three-quarter view and a limited body shape. Neutral/gentle differ most in mouth and cheeks; their eye changes remain subtle at native size. Small source-hair differences between whole expression drawings remain, very dark skin retains the warm authored mouth colors, and fine lace contrasts with the broader face shading. Old daily clothing and bob/crest portraits remain available, with the latter retaining their original open-eye face and editor notice. No new gestures, running/jumping or photo input were added.

Production Gathria integration, Firefox and Safari remain unverified. The studio bundle retains its large-chunk warning because all historical artwork banks remain bundled. This batch stops for review rather than claiming reference-level completion or user visual acceptance. Staged commits are recorded in [V7_PROGRESS.md](V7_PROGRESS.md).
