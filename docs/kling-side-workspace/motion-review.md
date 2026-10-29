# Side-view motion review

The workspace plays the existing side-view candidates at their declared **24 fps**, using discrete source frames. It does not interpolate poses, add bones, alter anatomy, add vertical motion, or change the existing selection or default characters. Travel is an adjustable horizontal stage demonstration; its speed is not evidence of foot planting or physically correct displacement.

## Source contract and visual review

Source frame intervals are zero-based and exclude the end frame. The workspace uses the continuous two-jump material already reviewed in [the continuous preview](../kling-side-selection/continuous/README.md), not the shorter first-jump spans in the older selection package.

| Action | Male source                  | Female source                | Playback                                                            |
| ------ | ---------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| Idle   | 1885, `[240,261)`, 21 frames | 1927, `[243,259)`, 16 frames | Loop; almost static, no complete blink                              |
| Walk   | 2067, `[47,65)`, 18 frames   | 1721, `[42,60)`, 18 frames   | Full two-step cycle, 750 ms                                         |
| Run    | 1885, `[132,150)`, 18 frames | 1927, `[135,153)`, 18 frames | Full two-step cycle, 750 ms                                         |
| Jump   | 2360, `[200,250)`, 50 frames | 2394, `[200,250)`, 50 frames | One source clip containing two jumps, 2083.333… ms; hold final pose |

Reviewed the existing [male](../kling-side-selection/review/male-walk-boundary.png) and [female](../kling-side-selection/review/female-walk-boundary.png) walk seams; [male](../kling-side-selection/review/male-run-boundary.png) and [female](../kling-side-selection/review/female-run-boundary.png) run seams; both older action-switch sheets; and the [continuous two-jump keyframes](../kling-side-selection/continuous/transition-keyframes.png). Also decoded source frames 200, 208, 216, 224, 233, 238, 244 and 249 directly from both original jump videos to check that the second jump and final crouch are source content.

- Both selected walk and run intervals contain near/far leg alternation and return to the same cycle phase. The runtime uses the full-cycle seam as its conservative switching boundary. It does not infer additional support events from frame count or claim that every selected first frame has a planted foot. The male run selection starts at the previously reviewed support phase; the female run first pose is visibly more extended.
- Walk remains a brisk candidate: both cycles last only 750 ms. The male candidate can look stiff, and the female candidate has light, nearly airborne extended-foot poses. These are not newly approved ordinary walks.
- Idle and run share a source for each character. Walk and jump come from different sources. Face viewpoint, head/torso proportions, arm positions and shading visibly change at action cuts even with constant registration. Completing a cycle removes arbitrary phase cuts; it cannot remove those identity differences.
- The full jump clip starts during running/braking, includes the actual inter-jump recovery, and ends in a shallow landing crouch. The second takeoff is around source frames 233–234 and landing around 244–245. The ending is not relaxed neutral standing. Holding frame 249 is deliberate; a requested cut to idle can still pop.
- The old single-jump boundary sheets end at frame 233 and therefore do not describe this workspace's final pose. The old selection JSON and exports remain historical artifacts; the workspace source catalog binds the separate 50-frame clips.
- Source motion blur, changing hand/foot contours, and the previously reported green spill near the female jump neck remain source/render limitations. No crossfade, repainting or per-frame body correction conceals them.

## Runtime behavior

`src/side-view/motion.ts` is pure: functions return a new state and do not mutate the manifest or previous state. It uses the manifest's frame IDs, frame count and fps rather than assuming that an ID equals an atlas index. Source-specific identity and exact 50-frame validation belong to the workspace catalog.

| Request                                | Result                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Leave idle                             | Enter the requested action immediately at frame 0                        |
| Idle from walk/run                     | Enter idle immediately; stop travel                                      |
| Walk ↔ run, or walk/run → jump        | Queue until the end of the current complete cycle; enter target frame 0  |
| Request at an exact cycle start        | Enter immediately at that existing boundary                              |
| Idle/walk/run during a playing jump    | Queue until all source jump frames have held for their declared duration |
| Repeat jump while it is playing        | Keep the existing jump; never restart or queue another jump              |
| No pending action after jump           | Hold its final frame indefinitely                                        |
| Explicit jump request after completion | Replay once from frame 0, without inherited locomotion                   |
| New request while another is pending   | Replace the pending request; choosing the current action clears it       |

`advanceSideMotion` splits a tick at a queued transition. It advances the outgoing clip and its travel only to that boundary, then applies the remaining elapsed time to the requested clip. Fractional source-frame time survives; source playback is never retimed to fit travel speed. A small numerical epsilon handles repeated `1000 / 24` frame steps without selecting the previous frame by floating-point error.

`jumpFrom` records whether takeoff followed walk or run. In travel mode the active jump keeps that action's configured horizontal speed through the full source clip, then stops at completion. Jump from idle remains stationary. In-place mode suppresses all horizontal travel while keeping source time; it retains the current world position. No synthetic Y trajectory is applied because vertical movement already exists in the source images. A mode or speed change is an explicit stage-control change, not a physics simulation.

Travel uses nonnegative native canvas pixels per second and the state's facing sign. Bounds clamp the stage offset without wrapping or reversing direction. Changing sprite facing does not negate or recenter the existing world position. The UI owns facing input and defers facing changes until a playing jump finishes. Pause freezes source time, travel and pending transition consumption; explicit UI selection/seek controls can separately establish a paused review pose.

Unavailable actions, empty clips, invalid timing/loop flags, missing frame IDs, invalid state, negative/nonfinite time or speeds, and nonfinite/reversed bounds raise explicit errors. The engine never substitutes idle for a missing action.

## Verification

- `vitest run src/side-view/motion.test.ts`: **19 tests passed**. Coverage includes all 50 original jump frame holds, explicit replay, prevention of mid-jump cancellation, sparse frame IDs, exact 24 fps steps, cycle-boundary remainder, action replacement, pause, inherited jump travel, completed-jump stop, idle/in-place movement, left/right bounds, RAF chunk invariance, and malformed inputs.
- `npm run typecheck`: passed after including the three existing JSON imports required by the sparse checkout. No repository source was changed to accommodate the checkout.
- An independent read-only review found no blocking timing or integration issue. These checks establish runtime behavior, not visual approval or physical speed matching.
