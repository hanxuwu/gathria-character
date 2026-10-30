import specifications from "./gameplay-motion-profiles.json";
import legacySpecifications from "./gameplay-motion-legacy-profiles.json";
import type {
  Animation,
  BakedCharacterRecipe,
  JsonValue,
  PortableAnimationName,
  PortableCharacterPackManifest,
} from "./types";

export type GameplayMode = "source" | "single-jump";
export type GameplayLocomotion = "idle" | "walk" | "run";
export interface GameplayRoute {
  from: PortableAnimationName;
  to: PortableAnimationName;
  /** Boundary after a complete source pose, measured in playback ticks. */
  exit: number;
  /** First tick of the chosen target pose. Run/walk↔jump seams are reviewed;
   * other side-view pairs conservatively retain cycle-boundary fallbacks. */
  entry: number;
}
export interface GameplayMotion {
  format: "gathria-gameplay-motion";
  version: 1;
  id: string;
  sourceSha256: string;
  characterId: "male" | "female";
  view: "original" | "side";
  actions: Record<GameplayLocomotion | "jump", Animation> & {
    celebrate?: Animation;
  };
  routes: GameplayRoute[];
  jumpReturn: "previous-locomotion";
}
export interface GameplayState {
  action: PortableAnimationName;
  elapsedMs: number;
  pending: PortableAnimationName | null;
  returnAction: GameplayLocomotion;
  /** Travel velocity inherited at takeoff; source frames supply all height. */
  jumpFrom: "walk" | "run" | null;
}
export interface GameplaySegment {
  action: PortableAnimationName;
  durationMs: number;
  jumpFrom: "walk" | "run" | null;
}

interface Specification {
  sourceActions: GameplayMotion["actions"];
  profile: GameplayMotion;
}
// New sessions use the current routes. Previously exported reviewed profiles
// retain their original takeoff and landing timing.
const reviewed = [
  ...specifications,
  ...legacySpecifications,
] as Specification[];
const EPSILON = 1e-7;
const locomotion = (
  action: PortableAnimationName,
): action is GameplayLocomotion =>
  action === "idle" || action === "walk" || action === "run";

function clockTime(elapsed: number, duration: number, loop: boolean): number {
  if (!loop) return elapsed >= duration - EPSILON ? duration : elapsed;
  const remainder = elapsed % duration;
  // RAF deltas and 24 FPS ticks do not share a binary representation. A value
  // infinitesimally before a full cycle is its start, not a repeated last pose.
  return remainder <= EPSILON || duration - remainder <= EPSILON
    ? 0
    : remainder;
}
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Order-independent metadata comparison. Unknown/changed fields are rejected. */
function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length && left.every((v, i) => equal(v, right[i]))
    );
  if (!object(left) || !object(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => Object.hasOwn(right, key) && equal(left[key], right[key]),
    )
  );
}

function specification(profile: GameplayMotion): Specification | undefined {
  return reviewed.find((item) => equal(item.profile, profile));
}

function framesExist(
  manifest: PortableCharacterPackManifest,
  actions: GameplayMotion["actions"],
): boolean {
  const frames = new Set(manifest.frames.map((frame) => frame.id));
  return Object.values(actions).every((clip) =>
    clip.frames.every((frame) => frames.has(frame)),
  );
}

/** Resolve only the four immutable, reviewed source archives. Garments retain
 * their original source SHA; neither source pages nor registration are changed.
 * An already-derived manifest is accepted for callers rendering an exported pack. */
export function resolveGameplayMotion(
  manifest: PortableCharacterPackManifest,
  sourceSha256: string,
): GameplayMotion | null {
  const item = reviewed.find(
    (row) => row.profile.sourceSha256 === sourceSha256,
  );
  if (
    !item ||
    (!equal(manifest.animations, item.sourceActions) &&
      !equal(manifest.animations, item.profile.actions)) ||
    !framesExist(manifest, item.profile.actions)
  )
    return null;
  return structuredClone(item.profile);
}

/** Derive clip selection only. Atlas cells, anchors, appearance padding, authored
 * frame movement and source FPS remain untouched. Full source clips stay in the
 * editable project and are available through its explicit source mode. */
export function gameplayManifest<T extends PortableCharacterPackManifest>(
  manifest: T,
  profile: GameplayMotion,
): T {
  const item = specification(profile);
  if (!item || !resolveGameplayMotion(manifest, item.profile.sourceSha256))
    throw Error("Gameplay profile does not match this source's action frames.");
  return { ...manifest, animations: structuredClone(profile.actions) };
}

export function gameplayMotionMetadata(profile: GameplayMotion): JsonValue {
  if (!specification(profile))
    throw Error("Unreviewed gameplay motion profile.");
  return structuredClone(profile) as unknown as JsonValue;
}

/** Standalone CharacterPack playback requires both the reviewed metadata and
 * its exact effective clips. Stale, edited and unrelated exports fall back to
 * ordinary source playback instead of guessing frame transitions. */
export function readGameplayMotion(
  manifest: PortableCharacterPackManifest,
  config?: Pick<BakedCharacterRecipe, "sourceMetadata">,
): GameplayMotion | null {
  const value = config?.sourceMetadata?.gameplayMotion;
  const item = reviewed.find((row) => equal(row.profile, value));
  if (
    !item ||
    !equal(manifest.animations, item.profile.actions) ||
    !framesExist(manifest, item.profile.actions)
  )
    return null;
  return structuredClone(item.profile);
}

export function createGameplayState(
  action: PortableAnimationName = "idle",
): GameplayState {
  return {
    action,
    elapsedMs: 0,
    pending: null,
    returnAction: locomotion(action) ? action : "idle",
    jumpFrom: null,
  };
}

function clipFor(
  profile: GameplayMotion,
  action: PortableAnimationName,
): Animation {
  const clip = profile.actions[action];
  if (
    !clip ||
    clip.frames.length === 0 ||
    !Number.isFinite(clip.fps) ||
    clip.fps <= 0
  )
    throw Error("Gameplay action is unavailable.");
  return clip;
}

function checkState(profile: GameplayMotion, state: GameplayState): void {
  clipFor(profile, state.action);
  if (state.pending !== null) clipFor(profile, state.pending);
  if (
    !Number.isFinite(state.elapsedMs) ||
    state.elapsedMs < 0 ||
    !locomotion(state.returnAction) ||
    (state.jumpFrom !== null &&
      state.jumpFrom !== "walk" &&
      state.jumpFrom !== "run")
  )
    throw Error("Gameplay state is invalid.");
}

function enter(
  state: GameplayState,
  target: PortableAnimationName,
  entry: number,
  profile: GameplayMotion,
): GameplayState {
  return {
    action: target,
    elapsedMs: (entry * 1000) / clipFor(profile, target).fps,
    pending: null,
    returnAction: locomotion(target) ? target : state.returnAction,
    jumpFrom:
      target === "jump" && (state.action === "walk" || state.action === "run")
        ? state.action
        : null,
  };
}

/** A press triggers one jump. Key-repeat/click-repeat cannot restart takeoff,
 * queue a second jump, or cancel a pending landing exit. Locomotion changes
 * during a queued jump update its return intent without swallowing the jump. */
export function requestGameplayAction(
  state: GameplayState,
  target: PortableAnimationName,
  profile: GameplayMotion,
): GameplayState {
  checkState(profile, state);
  clipFor(profile, target);
  if (target === "jump") {
    if (state.action === "jump" || state.pending === "jump")
      return { ...state };
    const next = {
      ...state,
      pending: target,
      returnAction: locomotion(state.action) ? state.action : ("idle" as const),
    };
    return state.action === "idle" ? enter(next, target, 0, profile) : next;
  }
  if (state.pending === "jump" && state.action !== "jump" && locomotion(target))
    return { ...state, returnAction: target };
  if (state.action === "jump")
    return {
      ...state,
      pending: target,
      returnAction: locomotion(target) ? target : state.returnAction,
    };
  if (target === state.action) return { ...state, pending: null };
  const next = { ...state, pending: target };
  if (state.action !== "idle") return next;
  // An idle character is already grounded. Use the reviewed entry pose without
  // waiting for a breathing/blink hold before responding to the user's input.
  const route = profile.routes.find(
    (row) => row.from === "idle" && row.to === target,
  );
  if (!route) throw Error("Gameplay transition is unavailable.");
  return enter(next, target, route.entry, profile);
}

export function gameplayFramePosition(
  profile: GameplayMotion,
  state: GameplayState,
): number {
  checkState(profile, state);
  const clip = clipFor(profile, state.action);
  const duration = (clip.frames.length * 1000) / clip.fps;
  const elapsed = clockTime(state.elapsedMs, duration, clip.loop);
  return Math.min(
    clip.frames.length - 1,
    Math.floor(((elapsed + EPSILON) * clip.fps) / 1000),
  );
}

export function gameplayFrameId(
  profile: GameplayMotion,
  state: GameplayState,
): number {
  return clipFor(profile, state.action).frames[
    gameplayFramePosition(profile, state)
  ];
}

function nextTransition(profile: GameplayMotion, state: GameplayState) {
  const clip = clipFor(profile, state.action);
  const duration = (clip.frames.length * 1000) / clip.fps;
  const elapsed = clockTime(state.elapsedMs, duration, clip.loop);
  const target =
    state.pending ?? (state.action === "jump" ? state.returnAction : null);
  if (!target) return null;
  if (target === state.action)
    throw Error("A gameplay action cannot queue itself.");
  const next = profile.routes
    .filter((route) => route.from === state.action && route.to === target)
    // A late request must use a later reviewed pose, not rewind to a landing
    // seam that the character has already passed. One-shots retain a final
    // recovery route for these late requests; loops can wait for the next lap.
    .filter(
      (route) =>
        clip.loop || (route.exit * 1000) / clip.fps >= elapsed - EPSILON,
    )
    .map((route) => {
      let boundary = (route.exit * 1000) / clip.fps;
      if (clip.loop && boundary < elapsed - EPSILON) boundary += duration;
      return { route, wait: Math.max(0, boundary - elapsed) };
    })
    .sort((a, b) => a.wait - b.wait)[0];
  if (!next) throw Error("Gameplay transition is unavailable.");
  return { ...next, target };
}

/** Milliseconds to the requested reviewed seam, including a jump's automatic
 * landing return. No pending transition returns null. */
export function gameplayTransitionWait(
  profile: GameplayMotion,
  state: GameplayState,
): number | null {
  checkState(profile, state);
  return nextTransition(profile, state)?.wait ?? null;
}

/** Advance an already speed-scaled source clock. Discrete authored frames are
 * never blended, stretched or re-centered. A caller may consume each elapsed
 * segment to integrate horizontal travel continuously across action changes. */
export function advanceGameplayMotion(
  profile: GameplayMotion,
  initial: GameplayState,
  deltaMs: number,
  onAdvance?: (segment: GameplaySegment) => void,
): GameplayState {
  checkState(profile, initial);
  if (!Number.isFinite(deltaMs) || deltaMs < 0)
    throw Error("Gameplay time must be finite and nonnegative.");
  let state = { ...initial };
  let remaining = deltaMs;
  // Only an explicit requested transition and one automatic landing return can
  // occur per tick. Looping locomotion never invents another jump request.
  for (let transitions = 0; transitions < 3; transitions++) {
    const clip = clipFor(profile, state.action);
    const duration = (clip.frames.length * 1000) / clip.fps;
    const elapsed = clockTime(state.elapsedMs, duration, clip.loop);
    const next = nextTransition(profile, state);
    if (!next) {
      const consumed = clip.loop
        ? remaining
        : Math.min(remaining, duration - elapsed);
      if (consumed > 0)
        onAdvance?.({
          action: state.action,
          durationMs: consumed,
          jumpFrom: state.jumpFrom,
        });
      return {
        ...state,
        elapsedMs: clockTime(elapsed + consumed, duration, clip.loop),
      };
    }
    const consumed = Math.min(remaining, next.wait);
    if (consumed > 0)
      onAdvance?.({
        action: state.action,
        durationMs: consumed,
        jumpFrom: state.jumpFrom,
      });
    if (remaining + EPSILON < next.wait)
      return {
        ...state,
        elapsedMs: clockTime(elapsed + remaining, duration, clip.loop),
      };
    remaining = Math.max(0, remaining - next.wait);
    state = enter(state, next.target, next.route.entry, profile);
  }
  throw Error("Unexpected cyclic gameplay transition.");
}
