# Implementation status

**Character Art V2, detailed revision implemented; awaiting user visual review.** Branch `feat/character-art-v2` remains based on the unmerged MVP branch `feat/character-mvp` (latest MVP commit `4785afa`). [Draft PR #1](https://github.com/hanxuwu/gathria-character/pull/1) targets that branch and must remain unmerged. Inspect the current Git state before continuing work; the initial published V2 commit is `c9505f0`.

The new default uses detailed Japanese chibi illustrations and explicit **artworkVersion 3**. Published V1 and V2 configurations remain pixel-exact. The saved-character/editor/export workflow is retained. See [ART_V2_REVIEW.md](ART_V2_REVIEW.md) for actual comparisons, animations, sample packs and limitations.

## Implementation

| Area          | Result                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artwork       | Rounded faces, large expressive eyes, overlapping curls, material shading, detailed casual/wedding clothing                                              |
| Identity      | Mira waves/heart, Rowan silver crop/oval, Jun dark bob/round; face and hair independently selectable                                                     |
| Customization | Four hair silhouettes, three face variants, five upper and four lower garments; five independent editable material colors                                |
| Animation     | Fixed articulated rig, four idle drawings/12 timing steps at 4 fps, eight walk poses at 10 fps, secondary hair/skirt deformation, mirrored left playback |
| Saved work    | Frozen V1/V2 renderers and presets; explicit detailed-copy conversion; no silent migration                                                               |
| Export        | Transparent PNG and CharacterPack v1, configuration save/reopen, bounded validation, independent file-driven playback                                    |
| Source art    | AI-assisted source banks committed with reproducible offline extraction/masks; runtime is local and deterministic                                        |

## Architecture and compatibility

- `src/core/generator.ts` dispatches validated schema-1 input to `generator-v1.ts`, and schema-2 input by `artworkVersion` to `generator-v2.ts` or `generator-v3.ts`. V1/V2 rendering is frozen; their defaults are exported separately from the new detailed defaults.
- V1 configuration remains schema 1 without modern fields. V2 remains schema 2/artwork 2. Detailed V3 retains schema 2's field shape and explicitly sets artwork 3. **Create detailed copy** is an opt-in action; loading, editing, preset selection, resetting or saving older work preserves its version.
- V1/V2 frames remain 48×64, sheet 384×128, anchor (24, 60). V3 frames are 192×256, sheet 1536×512, anchor (96, 240), recommended zoom 1. CharacterPack manifest schema stays 1 because consumers already read dimensions, anchor and timing from metadata.
- `artwork/illustrated-source/` contains the two detailed production banks. `scripts/prepare-illustrated-assets.mjs` invokes the Python/Pillow/NumPy extraction scripts and writes `src/core/illustrated-assets.generated.ts`. Source alpha is normalized to 0/255; material IDs protect eyes and decorative details during recoloring. The browser needs no Python or image model.
- `illustrated-canvas.ts` decodes prepared layers, applies shading-preserving recoloring and nearest-neighbor transforms. `illustrated-rig.ts` places articulated limbs, clothing and portraits. Generation is synchronous and deterministic for configuration + artwork version.
- The independent consumer imports the actual PNG/manifest and does not import generator, prepared source banks, rig or editor modules. Configuration is optional for playback. File-size/decompression/manifest validation limits are unchanged.
- `PROVENANCE.txt` distinguishes original procedural V1/V2 from AI-assisted V3 source artwork. The source and generated artwork are distributed under MIT terms; runtime AI/photo input is not implemented.

## Verification

Final corrected asset bank verified on 2026-10-15:

| Check                                              | Result                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                         | **168 passed**, 6 files, no skips; includes fixed V1/V2 decoded hashes and focused detailed/mask regressions                                      |
| `npm run typecheck`                                | Pass                                                                                                                                              |
| `npm run build`                                    | Pass; both studio and independent player                                                                                                          |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | **8 passed**, using the final detailed sample packs                                                                                               |
| Isolated source preparation                        | Byte-identical generated bank from committed inputs; Pillow 12.3.0 / NumPy 2.3.5                                                                  |
| Actual export/playback evidence                    | 18 PNGs validated against generator RGBA; 6 public packs plus 2 wedding examples; all 32 animation/facing phases observed every declared frame ID |
| Visual review                                      | Native/enlarged actual exports; every walk pose; six skin tones; neckline and hand/clothing isolation; mobile/desktop editor and player           |

Tests retain original V1/V2 output checks and cover detailed geometry, transparency, fixed foot anchors, deterministic generation, distinct faces, stable portraits, secondary hair/skirt motion, connected clothing, editable materials, explicit copy/save/reopen, actual ZIP provenance/export and generator-blocked independent playback. The final palette bug fixes were followed by a fresh full unit/typecheck/build/browser run; no outstanding regression failures remain.

## Evidence and reproduction

- Detailed outputs: `docs/art-detailed/` and `public/samples/detailed/`; [review and direct links](ART_V2_REVIEW.md).
- Previous published outputs remain unchanged in `docs/art-v2/`, `public/samples/v2/`, and the original `public/samples/` directories.
- `npm run samples` regenerates only V1. The old V2 evidence script explicitly selects V2. With Vite running, `CHROMIUM_PATH=/usr/bin/chromium node scripts/generate-detailed-evidence.mjs` generates actual V3 exports, validation metadata, UI captures and live consumer recording; `python3 scripts/render-detailed-review.py` assembles comparison PNGs/GIFs.
- Source banks are production inputs, not implementation evidence. PNG comparisons preserve exported pixels; GIFs may quantize colors and browser video is compressed. Backgrounds are added only to review compositions.
- The temporary rejected 96×128 procedural candidate was never published as a supported artwork version. Its historical PNGs, when included, are labeled previous-draft comparison evidence; the unused renderer was removed.
- Dependencies use the existing lockfile. Node 24.19.0, npm 11.9.0, system Chromium and Python/Pillow/NumPy are available in this cloud environment. The saved environment setup already supports the Node/Vite/browser workflow.

## Remaining work / next action

1. **Stop for user visual review.** Keep the feature branch and draft PR unmerged. The detailed artwork is ready for review, not a claim of final Gathria art approval.
2. Preserve all delivered artwork versions and their saved files during further work. After this delivery, treat V3 as published too; a new visual design needs a new explicit artwork version rather than silently reusing 3. Regenerate detailed evidence from the real renderer rather than substituting source illustrations or conceptual mockups.
3. Gathria integration remains **UNVERIFIED**: read-only access to `hanxuwu/gathria` returned HTTP 403, so runtime code/assets could not be inspected. No other repository was modified. A neutral preview scene is not an integration test.
4. A later integration milestone needs the actual runtime revision and loader/scene contract, with explicit checks for 192×256 source art, display scale, anchors, timing, facing and transparency. Runtime AI/photo input, other views, body shapes, selectable expressions, cloth physics and a general animation editor remain separate work.

Remote CI, Firefox, Safari and a fresh cloud-task bootstrap are not claimed as verified. The original MVP handoff and its historical delivery notes remain in Git history.
