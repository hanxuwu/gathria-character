# V6 running review

This batch adds running to the requested **V6 visual baseline**, without replacing its character art with V7. New Studio characters use `artworkVersion: 6` and explicit `motionVersion: 1`. The existing V6 idle and walk atlas rows are copied unchanged; V1–V7 source assets, configurations and prior exported packs remain supported. V7 is retained for comparison and saved-file compatibility, not selected as the visual baseline.

The review objects are actual application exports, shown at native size and integer zoom. Technical verification and visual review are separate; this delivery does not claim user visual acceptance.

## What changed

| Area                | Implementation and reason                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original art        | No new model calls or source illustrations. Existing V6 identity, face states, neck length, proportions and recoloring remain the inputs.                                                                                                     |
| Forward motion      | A shared rigid transform leans the head, neck, collar, torso and attached details together, preserving their relationship.                                                                                                                    |
| Groom run           | Twelve drawings alternate legs through contact, load, push-off, flight, recovery and reach. Two-bone knee placement retains the painted segment proportions; bent arms counter the legs. Planted soles use the existing floor baseline.       |
| Bride trot          | Both hands follow the gown's local grip points. Body rise/fall, forward lean and a restrained trailing/lifting hem communicate a careful run while preserving the full wedding silhouette. Shoes are fully occluded by the floor-length gown. |
| Seams and fragments | Run-only masks remove borrowed material and excessive overlapping cut ends that become exposed under the stronger limb rotations. They do not mutate the original bank or historical actions.                                                 |
| Secondary motion    | Bounded delayed rear-hair and cloth movement; the chest flower remains attached to the torso and the hair accessory follows the head.                                                                                                         |
| Workflow            | Idle/Walk/Run controls, left/right playback, saved action/facing, transparent export and independent file-driven playback. Historical packs explicitly disable unavailable Run.                                                               |

The motion is an in-place clip. Neither the Studio nor the independent player translates the character through a world, and no travel-speed/stride calibration is claimed.

## Actual export evidence

The frozen [baseline directory](running-baseline/) contains freshly exported V6 bride/groom packs. Its [index](running-baseline/baseline-index.json) records exact PNG equality with the previously delivered V6 examples and freezes the renderer/source hashes. The running evidence compares the entire original 1536×512 region, not just selected still frames.

| Review purpose                        | Files                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idle/walk/run, same scale             | [Native size](running/idle-walk-run-1x.png), [2×](running/idle-walk-run-2x.png)                                                                                                      |
| Preserved V6 actions                  | [Matched baseline regression panel](running/baseline-regression-1x.png)                                                                                                              |
| Running poses                         | [Twelve key frames for each character](running/run-keyframes.png)                                                                                                                    |
| Neck, shoulder, sleeve and hand joins | [3× connection crops](running/run-connections-3x.png)                                                                                                                                |
| Three expressions per identity        | [Expression panel](running/run-expressions-2x.png)                                                                                                                                   |
| Clothing and recoloring               | [Five upper garments](running/run-wardrobe-1x.png), [representative skin/hair combinations](running/run-recolor-2x.png), [shorts/skirt bare legs](running/run-lower-garments-2x.png) |
| Bride running                         | [Right GIF](running/dress-run-right.gif), [left GIF](running/dress-run-left.gif)                                                                                                     |
| Groom running                         | [Right GIF](running/suit-run-right.gif), [left GIF](running/suit-run-left.gif)                                                                                                       |
| Both characters                       | [Run right](running/run-right.gif), [run left](running/run-left.gif), [action switching](running/action-switch.gif)                                                                  |
| Existing loops                        | [Idle right](running/idle-right.gif), [idle left](running/idle-left.gif), [walk right](running/walk-right.gif), [walk left](running/walk-left.gif)                                   |
| Portable packages                     | [Bride ZIP](../public/samples/running/dress.character.zip), [groom ZIP](../public/samples/running/suit.character.zip)                                                                |
| Independent playback, Studio closed   | [Recording](running/independent-player.webm), [screenshot](running/independent-player.png), [old-pack Run unavailable](running/legacy-pack-run-unavailable.png)                      |
| Machine-readable evidence             | [Browser/export index](running/evidence-index.json), [decoded-file validation](running/file-validation.json), [GIF durations](running/preview-timelines.json)                        |

Intermediate application exports are preserved under [`running/iterations/`](running/iterations/). They document the actual pose/mask iterations and must not be mistaken for the final packages directly under `running/`. Preview PNGs/GIFs composite exported transparent sprites against a clearly neutral background; they are not generated concept images or Gathria scenes.

| Iteration | Visual finding and change                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01        | The groom already read as running, but stronger rotations exposed trouser/heel fragments. The bride's movement was too close to elevated standing.                        |
| 02        | Material ownership and joint cuts reduced fragments. Stronger bride weight shift helped, but swinging the existing flat hand artwork produced an awkward palm-up gesture. |
| 03        | Both bride hands now follow the gown grips; bounded hem lift retains the full silhouette. Tighter limb masks reduced exposed cut ends.                                    |
| 04        | A small groom forearm-cap correction removed the pointed elbow corner. This wedding pose set was retained for final export.                                               |

Final cosmetic checks also found a run-only mask deleting bare-leg skin in shorts/skirts. Restricting that removal to trousers fixed the variants without changing the reviewed wedding pixels. The baseline was saved in `40c4200`; implementation and iterations in `b0ed59e`; final media and documentation accompany this review.

## Compatibility and timing

- New configurations: schema 2, artwork 6, `motionVersion: 1`. Appearance options and three authored waves/crop expressions remain editable. Optional `preview: { animation, facing }` saves the Studio's current action and facing direction without changing generated pixels.
- Existing V6 configurations: unchanged until the user explicitly selects **Add running**. Save under a new filename to retain the original file. The extension preserves original idle/walk pixels, rectangles and timing.
- V1–V5 configurations: stay in their own artwork version. **Create polished copy**, followed by **Add running**, is the explicit conversion path. V7 remains V7 and does not automatically receive running.
- CharacterPack stays schema 1. Required idle/walk metadata is preserved; `animations.run` is optional. Invalid run metadata is rejected; a running-enabled configuration paired with a manifest missing run is rejected.
- New atlas: 1536×1024 RGBA, 8 columns × 4 rows, 192×256 frames, unchanged anchor `(96, 240)`. Frame IDs 0–11 are the twelve original drawings; IDs 12–23 are twelve running timeline frames. The bride has eleven distinct visible drawings: frames 14 and 20 coincide on opposite hidden-leg phases. The groom has twelve distinct drawings. Eight unused grid cells remain transparent.
- Running: twelve frames at 18 fps, exactly 2/3 second per cycle (approximately 666.67 ms). Idle remains 3 seconds; walk remains 0.8 seconds. Facing left mirrors the same exported right-facing pixels around the anchor.
- Review GIFs: all twelve run timeline frames are retained. GIF's centisecond precision requires cumulative rounding to a 670 ms loop; the PNG/manifest pack and browser player use the exact 18 fps timing.
- Old packages: load and play their saved pixels. Run is disabled with an explanation when absent. There is no invented run clip or accelerated-walk fallback. PNG/manifest-only loading remains supported.

See [CharacterPack v1](CHARACTER_PACK_V1.md) for the complete contract and [provenance](ASSET_PROVENANCE.md#running-extension-for-artwork-v6) for source ownership and processing.

## Verification for this batch

This batch passed TypeScript checking, the production build, **247 unit tests across 12 files**, and **18 Chromium E2E tests**. The local E2E run preceded the final shorts/skirt mask correction; all 247 unit tests and the final exports/playback were run after it. The complete [GitHub verification workflow](https://github.com/hanxuwu/gathria-character/actions/runs/38970034178) also passed for final implementation commit `b0ed59e`, after that correction.

Final evidence checks passed for **22 actual application exports / 528 declared frames**, **20 independent playback cases**, **46 decoded PNGs**, **22 final and 8 retained iteration ZIPs**, **15 decoded GIFs** (11 final previews and 4 iterations), and the complete **56.2-second player recording**. The original V6 atlas pixels and frozen source hashes are unchanged. Every ZIP member was checked against its extracted counterpart; final public example ZIPs match the reviewed packs. [Verification record](running/verification-results.json).

Visual inspection retained iteration 04: the groom's stride is distinct from walking; the bride preserves the full gown and stable grips while using a restrained trot. Native-size panels, integer enlargement, joint crops and the loop boundary were reviewed. This is an internal visual review, not user acceptance. Earlier V6/V7 test counts in historical documents are not results from this batch.

The current checks cover unchanged V6 rows and frozen-source hashes; deterministic running pixels; valid frame bounds, transparent alpha and anchors; action/direction configuration round trips; old-pack Run availability; actual downloaded ZIPs; representative expressions, five upper garments and skin/hair combinations; decoded frame order and duration; and independent playback with editor/generator imports blocked. After closing the Studio, browser evidence compares the live consumer canvas against separately decoded exported PNG frames in both directions. This live comparison covers the top 192×230 pixels of each frame, excluding the bottom attachment-guide overlay; full 192×256 frame pixels, alpha and boundaries are checked separately in the export/file validation.

Run the following export steps **sequentially** after code changes:

```sh
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
CHROMIUM_PATH=/usr/bin/chromium PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright node scripts/generate-running-evidence.mjs
python3 scripts/render-running-review.py
python3 scripts/verify-running-evidence.py
```

The generator starts its own evidence server. The renderer must wait for export completion; rendering while packs are still being written can mix revisions. The final verifier decodes PNGs, GIFs, each ZIP member and the complete player recording, checks frame metadata and durations, compares public sample bytes with their reviewed packages, and verifies evidence hashes against the current implementation.

## Remaining visual limits

- The bride uses a restrained gown-holding trot. A stronger sprint with larger silhouette changes needs dedicated running key-pose artwork; repeatedly stretching the existing standing gown would compromise the V6 silhouette.
- Animation uses deterministic articulated layers with nearest-neighbor sampling, rather than individually painted frames. Extreme bends can still show source-painting perspective and pixel-step changes, particularly in cuffs and trouser joints.
- Rear hair and cloth have bounded procedural delay, not a physical simulation. The gown hides the feet intentionally, so its motion is read through upper-body attitude, grip, weight shift and hem movement.
- Focused visual work targets waves/crop wedding characters. Other clothing remains combinable, but was not repainted into bespoke running poses. Bob/mohawk retain the earlier expression limitation.
- Playback is in place. World movement, pathfinding, collision, production Gathria scene integration and integration-specific animation timing remain separate work.
- V7's rejected visual decisions are not incorporated into this V6 running baseline. User visual review is still required before accepting the new run/trot design.
