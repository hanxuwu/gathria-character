# Implementation status

**Standalone MVP complete.** Feature branch: `feat/character-mvp`. Baseline: `9a8c7a6` (README only). Implementation commit: `0df401d`; browser-server isolation fix: `e67043d`. Subsequent delivery commits update documentation only.

## Milestone checkpoints

| Milestone                | State                                                           | Evidence                                                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 foundation/generation | Complete                                                        | React/TypeScript/Vite, original deterministic generator, 3 presets; 39 config/generator tests                                                                               |
| M2 editor/animation      | Complete                                                        | Appearance controls, live idle/walk, both directions, play/pause, speed, integer zoom, ground line, frame strip, reset; Chromium workflow verified                          |
| M3 portable output       | Complete                                                        | Config save/reopen, transparent PNG, versioned ZIP and bounded validation; 60 pack tests                                                                                    |
| M4 independent consumer  | Complete                                                        | Separate entrypoint loads actual ZIP or PNG+manifest; 4 player/adapter tests and exported-file Chromium playback                                                            |
| M5 verification/delivery | Implementation and verification complete; PR blocked externally | Clean install, typecheck, 103 unit tests, production build, 4 browser tests, visual inspection, and production smoke test pass; branch pushed, draft-PR API request blocked |

## Decisions and assumptions

- React + TypeScript + Vite; generation and file processing stay in the browser. No backend, paid API, secrets, or runtime external image/font requests.
- Original MIT-licensed artwork: one body silhouette, four hairstyles, three tops, three bottoms; independent skin/hair/clothing/shoe colors. The MIT notice accompanies generated packs.
- Provisional defaults: transparent 48×64 frames, four idle frames at 4 fps, eight walking frames at 10 fps, 8-column/2-row 384×128 sheet, anchor (24, 60). Consumers read these values from metadata.
- CharacterPack v1 has explicit frame IDs/rectangles, FPS, loop flags, top-left pixel coordinates, placement anchor, and left-facing mirroring around that anchor. PNG source faces right.
- Generation is separated behind `CharacterGenerator`. AI/photo input, additional body shapes, and general animation editing are outside this MVP.
- Configuration is downloaded, not autosaved. Reopen a saved JSON to continue editing. Independent playback only needs the exported PNG and manifest.
- Gathria runtime compatibility is **UNVERIFIED**. Read-only access to `hanxuwu/gathria` returned HTTP 403. No runtime commit or source paths could be inspected. No other repository was modified.
- This checkout is already isolated. Do not create a Git worktree unless explicitly requested.

## Verification evidence

Executed on 2026-10-15 with Node 24.19.0, npm 11.9.0, and system Chromium. No tests are skipped or expected to fail.

| Command/check                                                                | Result                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --cache /workspace/.npm-cache --no-audit --no-fund`                  | Pass; dependency lockfile unchanged                                                                                             |
| `npm run typecheck`                                                          | Pass, including final browser-server configuration                                                                              |
| `npm test`                                                                   | 103 passed across 4 files: config 20, generator 19, pack 60, player/adapter 4                                                   |
| `npm run build`                                                              | Pass; both `index.html` and `player.html` built                                                                                 |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`                           | 4 passed with a fresh isolated test server                                                                                      |
| Production browser smoke using `npm run preview -- --port 4173 --strictPort` | Customized Jun, downloaded ZIP, loaded it in production player, verified left-facing walk animation; no page errors             |
| Visual inspection                                                            | Enlarged sprite frames, eight-step gait, desktop studio/player and 390px mobile layout inspected; screenshots in `docs/images/` |
| `git diff --check`                                                           | Pass                                                                                                                            |

Browser coverage: customize Aria → save JSON → switch preset → reopen exact config/pixels → export ZIP → inspect real entries/PNG dimensions → load in a fresh consumer page → idle/walk, both directions, pause/play → open extracted PNG+manifest. Generator/editor module requests were blocked in the consumer test, with none attempted. Other cases cover invalid JSON/ZIP, unfinished names, mobile overflow, bundled export loading, transparent/opaque alpha without smoothing, 8× margins, and real PNG decode failure while preserving the last valid pack.

During verification, high-zoom player clipping and ambiguous select labels were corrected. A clean install exposed an orphaned development server's stale Vite dependency cache (HTTP 504). That process was stopped; Playwright now owns a fresh server on port 5175 and refuses to reuse a development server. The final browser run passes. Stop a development server before refreshing its dependencies, then restart it.

Current implementation code and test behavior were verified before the documentation-only delivery update. Firefox, Safari, remote CI, and actual Gathria integration are **not verified**. A GitHub Actions workflow is provided; no CI result is claimed.

## Outputs and delivery

- Examples: `public/samples/{mira,rowan,jun}.character.zip` and extracted files in matching directories. All were generated through the actual browser PNG/ZIP exporter.
- Screenshots: `docs/images/studio.png` and `docs/images/player.png`.
- Prepared PR description: `docs/DRAFT_PR.md`.
- Branch push succeeded through the existing Git HTTPS proxy. No push to `main` and no merge occurred.
- `gh pr create --repo hanxuwu/gathria-character --head feat/character-mvp --base main --draft --title "Build standalone animated character studio and CharacterPack v1" --body-file docs/DRAFT_PR.md` failed with `Post "https://api.github.com/graphql": Forbidden`.
- A read-only request diagnosed a network-policy rejection: `CONNECT tunnel failed, response 403` for `api.github.com`. Working Git authentication was reused; no new token was requested. No draft PR exists yet.

## Resume / next action

1. Read this handoff, inspect `git status` and the branch, and preserve the completed implementation.
2. Run `npm ci` if dependencies need refreshing, then `npm run dev`. Use the existing checkout. The player is `/player.html`.
3. To finish PR delivery, permit `api.github.com` in the environment's network settings, then retry the documented `gh pr create` command. Verify the remote feature branch includes the latest documentation commit first. Do not merge or push to `main`.
4. After user review, the recommended next milestone is a **verified Gathria adapter**: obtain read access to the actual runtime, record its commit/loader paths, reconcile frame/timing/anchor/flip/scale requirements, and load one of these real exported packs there. Do not redesign the standalone MVP or add speculative AI infrastructure.
