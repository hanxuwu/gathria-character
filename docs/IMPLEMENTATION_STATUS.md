# Implementation status

**Character Art V2 milestone, expressive refinement implemented; awaiting visual review.** Branch `feat/character-art-v2` remains based on unmerged `feat/character-mvp` (MVP `4785afa`). [Draft PR #1](https://github.com/hanxuwu/gathria-character/pull/1) targets that branch and must remain unmerged. Inspect current Git state before further editing. Published milestones include V2 `c9505f0` and detailed V3 `bc69f9d`.

The current default is **artworkVersion 4**: warm Japanese chibi illustration layers with gentler dark-hair highlights, blinking, optional happy eyes and a rose hairpiece, wider stepping, stronger arm articulation and hair/hem motion. V1–V3 files keep their exact renderer. The [current review](ART_V2_REVIEW.md) links actual comparisons, animations, packs, verification and limitations; [V3 review](ART_V3_REVIEW.md) records the previous delivery.

## Implementation and compatibility

- `generator.ts` dispatches schema 1 to V1 and schema 2 by explicit artwork version to V2, V3 or V4. Preserved defaults/presets are separately named. Opening, editing, resetting, preset selection and saving do not migrate old artwork.
- V4 requires `expression: gentle | joyful` and `hairAccessory: none | flowers`. **Create expressive copy** explicitly converts older input with a gentle expression and no accessory, preserving its appearance fields/face. The old V3 copy API remains supported and rejects V4 downgrade.
- V1/V2 geometry stays 48×64, sheet 384×128, anchor (24,60). V3/V4 geometry is 192×256, sheet 1536×512, anchor (96,240), recommended zoom 1. CharacterPack manifest stays version 1.
- V4 uses four idle drawings across 24 entries at 8 fps, including a half/closed/half blink; walk uses eight drawings at 10 fps. Happy eyes remain closed throughout the selected expression. Both directions play via manifest mirroring. The existing editor workflow remains intact with two additional neutral selectors.
- `illustrated-assets.generated.ts`, `illustrated-canvas.ts`, `illustrated-rig.ts` and `generator-v3.ts` remain frozen. `expressive-face.ts` handles V4-specific shading and eye regions; `expressive-rig.ts` poses limbs and secondary hair/cloth movement. Colors remain independently editable.
- New `artwork/expressive-source/flower-clip.png` is an AI-assisted production input. `prepare-expressive-accessory.py` performs reproducible alpha extraction and sizing into a fixed-color prepared layer. The runtime needs no API, model, Python or remote artwork service. [Provenance](ASSET_PROVENANCE.md) distinguishes sources from outputs.
- The independent player loads actual PNGs/manifests and optional configuration; it imports no editor, rig or generator. It offers all four example versions. Validation bounds and CharacterPack file structure are preserved.

## Verification

Final revision checked on 2026-10-15:

| Check                                              | Result                                                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                         | **186 passed**, 7 files, no skips; all previous 168 checks retained                                                                                                                |
| `npm run typecheck`                                | Pass                                                                                                                                                                               |
| `npm run build`                                    | Pass, studio and independent consumer                                                                                                                                              |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | **9 passed**                                                                                                                                                                       |
| Saved-work preservation                            | V1/V2 existing regressions, new fixed hashes from published V3 PNGs, browser V1/V2/V3 pixel equality and save/reopen/export                                                        |
| V4 visual regressions                              | Determinism, required fields, face variation, blink confined to eyes, stable gait portraits, hair/hem motion, colors, binary alpha, margins, connected clothing and grounded soles |
| Actual evidence                                    | **20 exports** decoded equal to generator RGBA; eight public packs and two reference looks independently play all **40 motion/facing combinations**, observing every frame ID      |
| Visual inspection                                  | Actual native/2× outputs, all idle/walk poses, expressions/hair options, recorded independent playback samples and neutral scene                                                   |

## Evidence and reproduction

Current outputs live in `docs/art-expressive/` and `public/samples/expressive/`. Old `docs/art-v2/`, `docs/art-detailed/`, original `public/samples/`, `public/samples/v2/` and `public/samples/detailed/` outputs are preserved. The old detailed evidence script explicitly imports V3 presets.

With Vite running, run `CHROMIUM_PATH=/usr/bin/chromium node scripts/generate-expressive-evidence.mjs`, then `python3 scripts/render-expressive-review.py`. The first script uses the real browser generator/exporter, validates output bytes, captures studio/player screenshots and records independent playback. The second composes only real exports into integer-scaled comparisons and GIFs. GIFs use shared quantized palettes and centisecond timing; PNG packs retain lossless RGBA.

The optional source-preparation command is `python3 scripts/prepare-expressive-accessory.py`. Pinned Pillow/NumPy dependencies are in `artwork/requirements.txt`. V3 bank extraction is unchanged. Node 24.19.0, npm 11.9.0, system Chromium and Python/Pillow/NumPy are available; no dependency or environment setup changes were required.

## Next action and remaining work

1. **Stop for user visual review.** Keep the feature branch and draft PR unmerged. Preserve V4 as delivered in later work as well as V1–V3.
2. Reference-sheet running, jumping, heart/bouquet gestures and open-mouth expressions remain outside this refinement. The rig still uses transformed illustration layers, limited body shapes and one mirrored view; it is not individually painted full-action animation or cloth physics.
3. Production Gathria integration remains **UNVERIFIED**. Prior read-only access to `hanxuwu/gathria` returned HTTP 403. No actual scene assets were available, and no other repository was modified. The labeled neutral scene is not an integration test.
4. A later integration milestone needs the actual runtime revision and scene/loader contract, including 192×256 source art, display scale, anchors, timing, facing and transparency. AI/photo input remains separate later work.

Remote CI, Firefox, Safari and a fresh cloud-task bootstrap are not claimed as verified. Earlier handoffs remain in Git history.
