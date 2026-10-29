import type { Animation, BakedCharacterPackManifest } from "../core/types";

export type SideAction = "idle" | "walk" | "run" | "jump";
export type SideStageMode = "in-place" | "travel";

export interface SideMotionState {
  action: SideAction;
  /** Time within the source clip, including the fractional frame remainder. */
  elapsedMs: number;
  /** Stage offset in native canvas pixels, independent of sprite mirroring. */
  worldX: number;
  facing: "left" | "right";
  pending: SideAction | null;
  paused: boolean;
  /** Horizontal travel inherited at takeoff; this does not add vertical physics. */
  jumpFrom: "walk" | "run" | null;
}

export interface SideMotionOptions {
  mode: SideStageMode;
  walkSpeed: number;
  runSpeed: number;
  bounds: { min: number; max: number };
}

// Only absorbs floating-point error from repeated 1000 / 24 frame steps.
const TIME_EPSILON = 1e-7;
const FRAME_EPSILON = 1e-9;
const actions: SideAction[] = ["idle", "walk", "run", "jump"];

export function createSideMotionState(): SideMotionState {
  return {
    action: "idle",
    elapsedMs: 0,
    worldX: 0,
    facing: "right",
    pending: null,
    paused: false,
    jumpFrom: null,
  };
}

function assertState(state: SideMotionState): void {
  if (
    !actions.includes(state.action) ||
    (state.pending !== null && !actions.includes(state.pending)) ||
    !Number.isFinite(state.elapsedMs) ||
    state.elapsedMs < 0 ||
    !Number.isFinite(state.worldX) ||
    !["left", "right"].includes(state.facing) ||
    typeof state.paused !== "boolean" ||
    ![null, "walk", "run"].includes(state.jumpFrom)
  ) {
    throw new Error("Invalid side-view motion state.");
  }
}

function clipFor(
  manifest: BakedCharacterPackManifest,
  action: SideAction,
): Animation {
  if (!actions.includes(action)) {
    throw new Error(`Unsupported side-view action: ${action}.`);
  }
  const clip = manifest.animations[action];
  if (!clip) throw new Error(`Side-view action ${action} is unavailable.`);
  if (
    !Array.isArray(clip.frames) ||
    clip.frames.length === 0 ||
    !Number.isFinite(clip.fps) ||
    clip.fps <= 0 ||
    !Number.isFinite(durationMs(clip)) ||
    durationMs(clip) <= 0 ||
    clip.loop !== (action !== "jump")
  ) {
    throw new Error(`Invalid side-view ${action} clip timing or loop flag.`);
  }
  const frameIds = new Set(manifest.frames.map((frame) => frame.id));
  if (
    clip.frames.some(
      (id) => !Number.isInteger(id) || id < 0 || !frameIds.has(id),
    )
  ) {
    throw new Error(`Side-view ${action} references an unavailable frame.`);
  }
  return clip;
}

function durationMs(clip: Animation): number {
  return (clip.frames.length * 1000) / clip.fps;
}

function elapsedInClip(state: SideMotionState, clip: Animation): number {
  const duration = durationMs(clip);
  return clip.loop
    ? state.elapsedMs % duration
    : Math.min(state.elapsedMs, duration);
}

function enterAction(
  state: SideMotionState,
  action: SideAction,
): SideMotionState {
  return {
    ...state,
    action,
    elapsedMs: 0,
    pending: null,
    jumpFrom:
      action === "jump" && (state.action === "walk" || state.action === "run")
        ? state.action
        : null,
  };
}

/** Latest request wins. A playing jump cannot be interrupted or replayed. */
export function requestSideAction(
  state: SideMotionState,
  action: SideAction,
  manifest: BakedCharacterPackManifest,
): SideMotionState {
  assertState(state);
  const current = clipFor(manifest, state.action);
  clipFor(manifest, action);
  const ended =
    !current.loop && state.elapsedMs + TIME_EPSILON >= durationMs(current);
  if (action === state.action) {
    return action === "jump" && ended
      ? enterAction(state, action)
      : { ...state, pending: null };
  }
  if (state.action === "jump" && !ended) {
    return { ...state, pending: action };
  }
  // Idle is responsive. Locomotion changes use the reviewed whole-cycle seam,
  // including a request made exactly at the beginning of that cycle.
  if (
    state.action === "idle" ||
    action === "idle" ||
    ended ||
    elapsedInClip(state, current) < TIME_EPSILON
  ) {
    return enterAction(state, action);
  }
  return { ...state, pending: action };
}

function assertOptions(options: SideMotionOptions): void {
  if (
    !["in-place", "travel"].includes(options.mode) ||
    !Number.isFinite(options.walkSpeed) ||
    options.walkSpeed < 0 ||
    !Number.isFinite(options.runSpeed) ||
    options.runSpeed < 0 ||
    !Number.isFinite(options.bounds.min) ||
    !Number.isFinite(options.bounds.max) ||
    options.bounds.min > options.bounds.max
  ) {
    throw new Error(
      "Side-view travel needs finite nonnegative speeds and ordered bounds.",
    );
  }
}

function advanceSegment(
  state: SideMotionState,
  deltaMs: number,
  clip: Animation,
  options: SideMotionOptions,
): SideMotionState {
  const duration = durationMs(clip);
  const elapsed = elapsedInClip(state, clip);
  const activeMs = clip.loop ? deltaMs : Math.min(deltaMs, duration - elapsed);
  const locomotion = state.action === "jump" ? state.jumpFrom : state.action;
  const speed =
    locomotion === "walk"
      ? options.walkSpeed
      : locomotion === "run"
        ? options.runSpeed
        : 0;
  let worldX = state.worldX;
  if (options.mode === "travel" && activeMs > 0 && speed > 0) {
    const direction = state.facing === "right" ? 1 : -1;
    worldX = Math.min(
      options.bounds.max,
      Math.max(
        options.bounds.min,
        worldX + direction * speed * (activeMs / 1000),
      ),
    );
  }
  const nextElapsed = clip.loop
    ? (elapsed + (deltaMs % duration)) % duration
    : Math.min(duration, elapsed + deltaMs);
  return { ...state, worldX, elapsedMs: nextElapsed };
}

/** Advance source time unchanged; render only discrete source frames. */
export function advanceSideMotion(
  state: SideMotionState,
  deltaMs: number,
  manifest: BakedCharacterPackManifest,
  options: SideMotionOptions,
): SideMotionState {
  assertState(state);
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    throw new Error("Side-view motion time must be finite and nonnegative.");
  }
  assertOptions(options);
  const clip = clipFor(manifest, state.action);
  if (state.pending !== null) clipFor(manifest, state.pending);
  if (state.paused) return { ...state };

  // Same-action requests never create a queued jump replay, including a state
  // supplied by a caller rather than requestSideAction.
  const pending = state.pending === state.action ? null : state.pending;
  const current = { ...state, pending };
  if (pending === null) return advanceSegment(current, deltaMs, clip, options);

  const elapsed = elapsedInClip(current, clip);
  const wait =
    current.action === "idle" ||
    (pending === "idle" && current.action !== "jump") ||
    (clip.loop && elapsed < TIME_EPSILON)
      ? 0
      : Math.max(0, durationMs(clip) - elapsed);
  if (deltaMs + TIME_EPSILON < wait) {
    return advanceSegment(current, deltaMs, clip, options);
  }
  const atBoundary = advanceSegment(
    current,
    Math.min(wait, deltaMs),
    clip,
    options,
  );
  const entered = enterAction(atBoundary, pending);
  return advanceSegment(
    entered,
    Math.max(0, deltaMs - wait),
    clipFor(manifest, pending),
    options,
  );
}

export function sideFrameId(
  state: SideMotionState,
  manifest: BakedCharacterPackManifest,
): number {
  assertState(state);
  const clip = clipFor(manifest, state.action);
  const tick = Math.floor(
    (elapsedInClip(state, clip) * clip.fps) / 1000 + FRAME_EPSILON,
  );
  const index = clip.loop
    ? tick % clip.frames.length
    : Math.min(tick, clip.frames.length - 1);
  return clip.frames[index];
}

export function sideActionEnded(
  state: SideMotionState,
  manifest: BakedCharacterPackManifest,
): boolean {
  assertState(state);
  const clip = clipFor(manifest, state.action);
  return !clip.loop && state.elapsedMs + TIME_EPSILON >= durationMs(clip);
}
