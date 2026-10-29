# Side-view input and transition feedback

This iteration keeps the source contract from [the previous motion review](../kling-side-workspace/motion-review.md): the same discrete source frames, declared 24 fps, whole walk/run cycles, and complete 50-frame continuous two-jump clips. The jump endpoint remains source frame 249, a shallow landing crouch. No recovery frames, interpolation, retiming, body deformation, crossfade, or vertical physics are added. The source assets remain frozen at `5d3845d`.

## What changed

`src/side-view/input.ts` resolves held keys in keydown order. The most recently pressed movement key that is still held determines facing. Both arrow keys and A/D work together; releasing an alias restores the correct remaining key. For example, Left → Right → A → release A now resolves right, because Right was pressed after the surviving Left. Either Shift key selects run while movement remains held; Shift or Space alone does not start locomotion. The UI retains facing when the helper returns `null`.

`sideMotionFeedback(state, manifest)` in `src/side-view/motion.ts` exposes playback phase, zero-based source-frame position, frame count, duration, remaining source playback time, pause state, and the pending transition's action/boundary/wait. Its phases are `cycle`, `one-shot`, and `endpoint-hold`. These describe playback only; they do not infer planted feet, takeoff events, or anatomical recovery. The frame index remains separate from the manifest's frame ID.

Transition feedback shares the same boundary calculation as advancement. A queued walk/run/jump change from locomotion reports `cycle-end`; a queued exit from the playing two-jump clip reports `clip-end`. Existing immediate entry/exit rules report `immediate`. A paused state retains its remaining source time until playback resumes. Selecting the current action still cancels the pending request, and repeating jump after completion explicitly replays from frame zero. The original motion engine's request and advancement behavior is preserved.

The last jump frame is not complete when it first appears: it still receives its full source-frame duration. Only afterward does feedback become `endpoint-hold`. A jump with no pending exit holds that existing crouch indefinitely. This endpoint is not idle, and a requested cut to idle still exposes the source pose and identity differences.

## UI integration contract

```ts
sideKeyboardIntent(keys: Iterable<string>): {
  action: "idle" | "walk" | "run";
  facing: "left" | "right" | null;
}

sideMotionFeedback(state, manifest): {
  phase: "cycle" | "one-shot" | "endpoint-hold";
  frameIndex: number;
  frameCount: number;
  durationMs: number;
  remainingMs: number;
  paused: boolean;
  transition: null | {
    action: SideAction;
    boundary: "cycle-end" | "clip-end" | "immediate";
    remainingMs: number;
  };
}
```

The held-key collection must preserve keydown order. The existing `Set` does so when keyup removes a key and accepted keydown adds it; repeated keydown must not remove and reinsert keys. Space is an explicit jump command outside this helper. During a playing jump, redundant Space should be ignored by the keyboard adapter so it cannot cancel a queued walk/run/idle exit through the engine's explicit current-action cancellation rule. A fresh Space after completion may replay the source clip.

Suggested presentation: show the queued action plus “本轮结束后切换” for a cycle boundary or “两次跳跃完整播放后切换” for a jump exit. Remaining time is playback time, with an explicit paused indication. At `endpoint-hold`, explain “原片末帧：浅蹲，尚未回到自然站立” and offer the existing idle/replay controls. A countdown is a timing aid, not a claim that an action cut is visually repaired.

## Source poses still needed

The frozen clips cannot supply the following transition material:

- A continuous shallow-landing-crouch → relaxed neutral-standing recovery after the second landing. Frame 249 is still crouched; holding it does not create recovery.
- Matched neutral-standing → walk/run starts and walk/run → neutral-standing stops. The existing idle cut remains immediate by design.
- Matched walk/run → takeoff entry for each locomotion. The current jump source begins in running/braking, and its source identity/viewpoint can differ from the preceding walk or run.
- Matched idle, walk, run, and jump boundary poses with consistent face viewpoint, head/torso proportions, arms, and shading. Whole-cycle switching avoids arbitrary phase cuts but cannot repair those source differences.
- A source turn if a physically continuous direction reversal is required. Current left/right facing mirrors the source sprite; it does not add a turn animation.

The original walk cadence and support quality, motion blur, hand/foot contours, and female jump neck spill also remain source limitations described in the earlier review. This work does not approve those clips as final animation.

## Verification

`npx vitest run src/side-view/motion.test.ts src/side-view/input.test.ts`: **31 tests passed** (27 motion, 4 input). All previous 19 motion tests remain unchanged and passing. Added checks cover queued cycle boundaries, full last-frame duration before all three jump exits, endpoint holds, pause/replacement/cancellation feedback, zero-wait boundaries, prevention of queued same-action replays, arbitrary manifest timing and sparse frame IDs, alias release ordering, repeat input, both Shift keys, and unrelated keys.

These pure tests establish request/timing feedback and held-key intent. Browser integration and visual/export verification are recorded separately by the workspace review.
