# Implementation status

**Character Art V2 implemented; awaiting visual review.** Working branch: `feat/character-art-v2`, based on the latest MVP commit `4785afa` on `feat/character-mvp`. Remote inspection confirmed that MVP was still unmerged; the draft PR therefore targets `feat/character-mvp`, not `main`. Do not merge either branch as part of this milestone.

The standalone MVP remains intact. V2 concentrates on the exported artwork, adds explicit artwork/configuration versioning, and preserves V1 saved work. See [ART_V2_REVIEW.md](ART_V2_REVIEW.md) for visual comparisons, animation evidence, compatibility decisions, and limitations.

## Completed scope

| Area             | Result                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visual direction | Warm life-simulation pixels: rounded three-quarter faces, paired eyes, interior nose, small smile, restrained shadows, softened hair/body contours  |
| Identity         | Mira: heart face/waves; Rowan: oval face/crop; Jun: round face/bob. Three independently selectable face silhouettes and four redrawn hairstyles     |
| Clothing         | Polished casual, wedding suit, and wedding dress presets; individual upper/lower garments and colors remain freely combinable                       |
| Animation        | Four idle drawings held over 12 timing steps at 4 fps; eight walk poses at 10 fps, opposing limbs, layered dress hem, mirrored left playback        |
| Saved work       | Frozen V1 renderer, original presets/exports, explicit V2-copy action, no silent migration; original decoded pixels remain exact                    |
| Workflow         | Customize, animate, save/reopen, transparent PNG/ZIP export, validation, independent player; both V1 and V2 example packs available                 |
| Review evidence  | Real matched before/after, native/5× lineups, face/hair/outfit studies, all poses, GIFs, live consumer recording, neutral composition, six V2 packs |

## Architecture and compatibility

- `src/core/generator.ts` dispatches by validated configuration version. `generator-v1.ts` preserves the old raster code; `generator-v2.ts` contains the new artwork and poses. `pixel-art.ts` provides integer drawing primitives and rejects frame clipping.
- V1 JSON keeps `schemaVersion: 1` and the original fields. V2 explicitly requires `schemaVersion: 2`, `artworkVersion: 2`, and `faceVariant`. Loading/editing/resetting/saving V1 remains V1 until **Create Art V2 copy** is chosen.
- CharacterPack manifest schema remains **1**. Both renderers keep 48×64 frames, a 384×128 sheet, anchor (24, 60), right-native artwork, and left mirroring. V1 timing stays unchanged. V2 represents longer idle holds with repeated frame IDs, supported by the existing contract.
- The independent consumer reads actual PNG and manifest files. Configuration is optional for playback; generator/editor modules are not used. Export/validation limits are retained.
- Original MIT artwork, browser-local processing, no runtime service/API keys, no autosave. AI/photo generation and production Gathria integration remain separate milestones.

## Verification

Executed on 2026-10-15 using Node 24.19.0, npm 11.9.0, and system Chromium. No skipped or expected-failure tests.

| Check                                              | Result                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                         | **137 passed**: configuration 37, legacy generator 19, pack 60, player/adapter 4, Art V2 17                                                                              |
| `npm run typecheck`                                | Pass                                                                                                                                                                     |
| `npm run build`                                    | Pass; studio and independent player built                                                                                                                                |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | **7 passed** on Playwright's isolated Vite server at port 5175                                                                                                           |
| Export/evidence script                             | 16 browser-generated exports validated; decoded PNG bytes equal generated RGBA; six public V2 ZIPs loaded/animated independently with generator/editor routes blocked    |
| Legacy sample regeneration                         | Three configurations/manifests/decoded PNGs regenerated into a temporary directory; match original V1 files and fixed SHA-256 baselines; original sample files unchanged |
| Visual inspection                                  | Native and integer-zoom characters, all outfit poses, six skin tones, mirrored playback samples, GIF timing, desktop/mobile editor and player                            |
| Read-only code review                              | No concrete compatibility, dispatch, layering, or playback regression found                                                                                              |

Tests cover frozen V1 hashes, configuration round trips, explicit migration, deterministic rendering, transparent margins/anchors, unique face silhouettes, stable portraits across all walking poses, connected outfits, fourth-hairstyle and mixed formal/casual combinations, real ZIP download/reopen, corrupt files, and independent playback. Existing V1 checks were retained rather than replacing expected old pixels with new pixels.

Browser suites and the production build passed against the final application changes; the subsequent test-only strengthening also passed the full unit suite/typecheck. Remote CI, Firefox, Safari, and a fresh cloud-task bootstrap are not claimed as verified.

## Evidence and reproduction

- [Art review and links](ART_V2_REVIEW.md); outputs under `docs/art-v2/`.
- [V2 ZIPs and extracted files](../public/samples/v2/); original V1 examples remain under `public/samples/`.
- `npm run samples` regenerates only V1. With `npm run dev` running, `CHROMIUM_PATH=/usr/bin/chromium node scripts/generate-art-v2-evidence.mjs` regenerates V2 exports, screenshots, validation metadata, and live consumer recording. `python3 scripts/render-art-v2-review.py` assembles exact-color comparison images/GIFs from exported assets; Pillow is required.
- Browser recording uses Chromium's built-in MediaRecorder. Its video compression is separate from the exact-color PNG/GIF evidence.
- Dependencies were installed with the existing lockfile during MVP setup. The cloud environment's saved installation/startup instructions already support this Node/Vite/Chromium workflow. The existing checkout is isolated; do not create another worktree unless explicitly requested.

## Remaining work / next action

1. **Stop for user visual review of Art V2.** Keep its draft PR unmerged. Inspect current Git state and this handoff before making further changes.
2. If revising art, regenerate the actual evidence and packs, preserve V1 hashes, and rerun affected checks. Do not substitute concept mockups for generated output.
3. Gathria compatibility remains **UNVERIFIED**: read-only access to `hanxuwu/gathria` returned HTTP 403, so runtime code/assets could not be inspected. No other repository was modified. The included neutral scene is explicitly not a Gathria scene.
4. A later integration milestone needs the real runtime revision, loader/scene contract, and a real pack loaded there. AI/photo input, body shapes, additional views, secondary cloth/hair motion, and broader animation editing are outside this milestone.

Historical note: MVP delivery previously could push Git but could not reach the PR API. The API is reachable in this task; that old blocker is no longer assumed to apply. The original MVP implementation and its `docs/DRAFT_PR.md` are preserved in the branch history.
