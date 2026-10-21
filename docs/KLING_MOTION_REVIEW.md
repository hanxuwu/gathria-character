# Kling motion cadence and action transitions

The earlier 52-drawing candidates reduced asset count but held several visibly
moving poses. Their crouched-hop jump also could not return naturally to upright
idle. This separate motion candidate restores the necessary source drawings and
adds reviewed action-switch timing. Original playback, the 52-drawing studies,
both skeletons and all previous saved files remain available.

## Cadence and source fidelity

| Action                | Male before → after | Female before → after | Duration / behavior           |
| --------------------- | ------------------- | --------------------- | ----------------------------- |
| Idle                  | 4 → 4               | 4 → 4                 | 24 ticks / loop               |
| Walk                  | 12 → 16             | 14 → 25               | 27 ticks / loop               |
| Run                   | 11 → 16             | 12 → 16               | 16 ticks / loop               |
| Jump                  | 16 → 39             | 14 → 39               | full original 39 ticks / once |
| Celebrate             | 9 → 13              | 8 → 12                | 16 ticks / loop               |
| **Distinct drawings** | **52 → 88**         | **52 → 96**           | all at 24 FPS                 |

Jump's count comparison reflects a deliberate behavior change: the full landing
and upright recovery are restored. The earlier repeated-hop mode remains in
the original keyframe candidate. No default URL or saved pack changes behavior.

All 184 selected native RGBA frames are checked against original crops. No new
source extraction, redraw, interpolation, recentering or body deformation is
used. Atlas bytes/rectangles change during packing, while selected pixels,
source mapping, frame size and anchor remain exact. The new counts require
existing V3 multipage support; each pack uses two bounded pages.

This prioritizes motion quality over minimizing future wardrobe drawings.
Clothing and expressions are still baked into full-character images. The larger
packs use more decoded memory than the 52-drawing studies; they are not claimed
to be the minimum possible authoring or memory footprint.

## Action flow

Open **Review motion & transitions** in the Sprite actions workspace, or use
`/player.html?kling=male&variant=motion` (also `female`). **Wait for a matching
pose** defaults on only for a validated motion pack in independent playback.

- A request waits until the next reviewed source exit, then enters the target
  at its corresponding phase. It does not always reset to frame0/flight.
- A newer click replaces the queued request. Clicking the current action
  cancels it. The visible `Next:` message explains the pending action.
- Jump completes its full landing and upright recovery before the requested
  action; without one it returns to idle. Celebration remains a loop and can
  exit at its lowered-hand boundary.
- Pause and a hidden workspace freeze time and the queue. Scrubbing, reset,
  import and changed action settings clear it. Paused action selections are
  immediate for inspection. Playback speed scales the same source timeline.
- Turn the checkbox off to compare immediate cuts. Authoring and two-character
  comparison disable phase scheduling explicitly; precise frame inspection and
  the existing shared-clock comparison remain available.

`motion-flow.ts` validates exact clip snapshots and all action-pair routes before
enabling the scheduler. It consumes elapsed-time overshoot at a transition rather
than losing time between actions. If a saved action project changes FPS, range
or looping, its old phase routes become invalid and ordinary playback is used.
No hardcoded frame substitutions or guessed routes are applied to other packs.

The existing V2/V3 manifest and sprite-project format are unchanged. Motion
metadata travels with the ZIP and is used by the independent player after the
editor closes. Older consumers can play the manifest clips; they hold the final
jump pose unless they implement the optional automatic return. The preference
checkbox is a local preview control, not an edit to the exported manifest.

## Visual assessment and limits

Restoring fast run and arm-motion frames removes the freezes introduced by the
earlier decimation. Male walk's asymmetric three-tick stalls are removed; female
walk preserves more original weight-transfer poses. Loop periods and original
loop boundaries remain unchanged. Thus source loop/torso variation is preserved,
not falsely claimed repaired by adding interior frames.

Grounded switching avoids stopping in midair and avoids entering run on its
flight pose. Jump121→idle0 is closely matched. Other transitions remain visible
cuts: jump83 already begins crouched, celebration has no fully relaxed lead-in
or outro, and running posture/arm position differs from walking. Scheduling
cannot supply drawings absent from the retained material. No perfectly seamless
cross-action motion or user visual acceptance is claimed.

## Verification and implementation

This batch: **132 unit tests and 28 Chromium tests passed**, with TypeScript and
production build passing. Both regenerated ZIPs are byte-identical; all 184
selected source crops and 578 protected baseline files match exactly.

[Current verification records](kling-motion/verification-results.json) distinguish
this batch's checks from historical results. The evidence includes decoded
actual exports, normal-speed before/after GIFs, actual UI save/reopen and closed-
editor independent playback. Single-jump and action-switch GIFs play once;
they are not mislabeled seamless loops.

- `artwork/kling-motion/selection.json`: reviewed frames, holds and routes.
- `scripts/compile-kling-motion.py`: source checksums, exact RGBA copies,
  deterministic V3 packing and portable phase metadata.
- `src/consumer/motion-flow.ts`: validation and deterministic request scheduling.
- `PackPlayer.tsx`, catalog/loader and `Workbench.tsx`: explicit candidate entry,
  pending requests, comparison/authoring behavior and independent use.
- Unit and Chromium motion-flow tests: boundaries, full jump, overshoot, latest
  request, pause/hiding, reset, stale profiles, export and independent import.
- `scripts/render-kling-motion.py`, `verify-kling-motion.mjs`: actual-pack media
  and browser evidence, with source hashes, decoding and timing checks.

The first full local browser run in this batch passed 27/28 tests. The female
saved-project test clicked Run while the asynchronous import was resetting the
selection to Idle, so it asserted Idle’s 24 FPS against the saved Run’s 12 FPS.
The trace showed saved edits restored successfully. The test now waits for the
settled restored-project status and enabled editor before selecting Run; its
FPS, range, pixel-preservation and independent-export assertions are unchanged.
The initial failure log is retained beside the final verification results.

The previous main run `39539397324` failed its E2E step after PR #24 merged.
GitHub's signed log/artifact downloads returned Forbidden, so the exact failed
test and cause could not be established. This batch adds Playwright's GitHub
reporter alongside list output on CI to expose future assertion details in
check annotations; it does not add retries or relax assertions. Current-batch
results are recorded separately and do not retroactively relabel that failure.

Based on main `fd914ef`; delivered on `feat/kling-motion-flow` as a new draft PR.
No merge or deployment is part of this batch.
