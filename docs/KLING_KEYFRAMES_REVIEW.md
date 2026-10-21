# Kling loop keyframes: review candidate

The original packs contain 122 drawings per character. This batch selects 52
per character for a smaller future authoring baseline, while preserving the
selected images exactly. The original male/female playback remains the default;
the candidate is an explicit **Review keyframe loops** entry in Sprite actions.

## What changed

Selection follows motion phases, rather than keeping every second frame.
Foot contacts, passing, flight, apex and recovery are retained; similar images
are replaced with deliberate holds. Non-jump cycle lengths remain unchanged at
24 ticks/second. The candidate jump is a repeated crouch-to-crouch hop; the
original 39-frame standing-recovery jump remains one-shot and unchanged.

| Action                | Original drawings | Male candidate | Female candidate | Candidate period             |
| --------------------- | ----------------: | -------------: | ---------------: | ---------------------------- |
| Idle                  |                24 |              4 |                4 | 1.000 s                      |
| Walk                  |                27 |             12 |               14 | 1.125 s                      |
| Run                   |                16 |             11 |               12 | 0.667 s                      |
| Jump                  |                39 |             16 |               14 | male 0.917 s; female 0.875 s |
| Celebrate             |                16 |              9 |                8 | 0.667 s                      |
| **Distinct drawings** |           **122** |         **52** |           **52** | holds reuse drawings         |

That is 57.4% fewer distinct drawings. Each compact atlas decodes to 153.14 MiB
instead of 346 MiB for the original pages. This does not yet provide wardrobe
layers, and final clothing work may need more pose-specific images. The native
frame remains 704×1056 with anchor (352,998).

## Visual decisions and limits

The original standing-to-crouch jump wrap is rejected. Selecting landing crouch
and takeoff preparation makes the repeated hop more coherent. Retaining genuine
apex poses preserves the flight arc; omitting every clipped apex image was
rejected because it lost the highest tucked pose. See the
[selection record](../artwork/kling-keyframes/README.md).

Source images and continuous-browser wrap filmstrips were inspected alongside
the keyframe boards and native jump comparisons. The repeated hop still has a
small forearm/torso difference at its seam, especially on the female. Source
motion blur, torso-angle changes in walking, and a small scalp clipping at the
jump apex remain. Holds produce more stepped movement than the full originals;
reducing drawings is a tradeoff, not an increase in source detail or smoothness.
The two hop periods differ, so pair comparison is not phase-synchronized.

Frame-difference diagnostics support comparison but are not an art acceptance
test. Technical repeatability is verified; seamless natural motion and user
visual approval are not claimed. No original was redrawn or replaced to hide
these limitations.

## Compatibility and implementation

- `artwork/kling-keyframes/selection.json`: explicit source IDs, phases and holds.
- `scripts/compile-kling-keyframes.py`: deterministic lossless packing, source
  checksums, decoded-frame fidelity, metadata/atlas bounds and provenance.
- `src/consumer/kling-catalog.ts`, `kling-packs.ts`, `PackPlayer.tsx`: separate
  candidate catalog, variant-aware loading, identity and visible jump notice.
- `src/workspace/Workbench.tsx`: explicit review link; original editor remains
  the default. Candidate source projects can use the existing save/reopen flow.
- `scripts/render-kling-keyframes.py`, `verify-kling-keyframes.mjs`: actual pack
  comparisons, decoded media checks and browser export/playback evidence.

The candidate uses existing CharacterPack V2 frame lists and repeated IDs.
No schema, player clock, skeleton or sprite-project format change is required.
Independent imports retain candidate provenance and the repeated-hop notice.
Original pack exports remain byte-identical; candidate UI exports match the
compiled candidate bytes. No runtime drawing API or upload is introduced.

## Verification executed for this batch

- 120 unit tests across nine files passed; TypeScript and production build passed.
- All 25 Chromium E2E tests passed, including three new candidate cases.
- 104 selected native RGBA frames exactly match their source crops. Both ZIPs
  pass CRC, JSON/PNG decode, alpha/boundary and manifest checks.
- 20 comparison GIFs and 12 review PNGs decode. GIF frame order, delays and
  infinite-loop flags are checked; GIF centisecond timing is an approximation
  of the authoritative 24 FPS pack timeline.
- Actual UI: ten downloaded ZIPs decoded and checked; candidate export,
  action-project save/reopen and independent re-export retain exact bytes.
- The authoring context was closed before independent playback. All 20
  character/action/facing cases completed two observed wraps, with every tick
  seen at 0.5× inspection speed. Maximum measured cycle error was 12.4 ms.
  All 24 browser PNGs decode, with no page errors or external requests.
- 506 protected source/artwork/core/skeletal files match baseline `0702235`.

Full records, reproducibility and retained logs are in
[verification-results.json](kling-keyframes/verification-results.json).
These are current-batch checks; older review folders retain historical results.

This branch is based on `0702235`, the still-unmerged sprite action work in
PR #23, and its draft PR targets `feat/kling-sprite-actions`. No merge or
deployment is part of this delivery.

[Open comparisons, candidate ZIPs and browser evidence](kling-keyframes/README.md).
