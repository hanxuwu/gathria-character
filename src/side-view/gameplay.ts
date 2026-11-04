import {
  advanceGameplayMotion,
  createGameplayState,
  gameplayFrameId,
  gameplayMotionMetadata,
  gameplayTransitionWait,
  requestGameplayAction,
  type GameplayMotion,
  type GameplayState,
} from "../core/gameplay-motion";
import type { BakedCharacterPackManifest } from "../core/types";
import {
  advanceSideMotion,
  createSideMotionState,
  requestSideAction,
  sideFrameId,
  type SideAction,
  type SideMotionOptions,
  type SideMotionState,
} from "./motion";

/** Stage position and facing remain outside the authored animation controller. */
export interface SideGameplayState extends SideMotionState {
  returnAction: GameplayState["returnAction"];
  leadIn?: GameplayState["leadIn"];
}

/** Exact authored-clock checkpoint, bound to one immutable motion declaration. */
export interface SidePlaybackCheckpoint {
  format: "gathria-side-playback-checkpoint";
  version: 1;
  profileId: string;
  sourceSha256: string;
  state: SideGameplayState;
}

function hasExactKeys(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

/** Invalid, edited, or cross-source checkpoints never guess a replacement pose. */
export function restoreSidePlaybackCheckpoint(
  value: unknown,
  profile: GameplayMotion,
): SideGameplayState | null {
  try {
    gameplayMotionMetadata(profile);
    if (
      profile.view !== "side" ||
      !hasExactKeys(value, [
        "format",
        "version",
        "profileId",
        "sourceSha256",
        "state",
      ]) ||
      value.format !== "gathria-side-playback-checkpoint" ||
      value.version !== 1 ||
      value.profileId !== profile.id ||
      value.sourceSha256 !== profile.sourceSha256
    )
      return null;
    const raw = value.state;
    const hasLeadIn =
      typeof raw === "object" && raw !== null && Object.hasOwn(raw, "leadIn");
    if (
      !hasExactKeys(raw, [
        "action",
        "elapsedMs",
        "worldX",
        "facing",
        "pending",
        "paused",
        "jumpFrom",
        "returnAction",
        ...(hasLeadIn ? ["leadIn"] : []),
      ])
    )
      return null;
    const actions = ["idle", "walk", "run", "jump"];
    if (
      !actions.includes(raw.action as string) ||
      (raw.pending !== null && !actions.includes(raw.pending as string)) ||
      raw.pending === raw.action ||
      !Number.isFinite(raw.worldX) ||
      !["left", "right"].includes(raw.facing as string) ||
      typeof raw.paused !== "boolean" ||
      (raw.action !== "jump" && raw.jumpFrom !== null) ||
      (hasLeadIn && (typeof raw.leadIn !== "object" || raw.leadIn === null))
    )
      return null;
    const state = raw as unknown as SideGameplayState;
    const clip = profile.actions[state.action];
    const duration = (clip.frames.length * 1000) / clip.fps;
    if (
      state.elapsedMs > duration ||
      (clip.loop && state.elapsedMs === duration)
    )
      return null;
    // These validate finite clocks, exact route/entry/lead-in fields, and the
    // pending transition without advancing even a fractional frame.
    gameplayFrameId(profile, sideGameplayState(state));
    gameplayTransitionWait(profile, sideGameplayState(state));
    return structuredClone(state);
  } catch {
    return null;
  }
}

export function createSidePlaybackCheckpoint(
  state: SideGameplayState,
  profile: GameplayMotion,
): SidePlaybackCheckpoint {
  const checkpoint: SidePlaybackCheckpoint = {
    format: "gathria-side-playback-checkpoint",
    version: 1,
    profileId: profile.id,
    sourceSha256: profile.sourceSha256,
    state,
  };
  const restored = restoreSidePlaybackCheckpoint(checkpoint, profile);
  if (!restored) throw Error("Invalid side-view playback checkpoint.");
  return { ...checkpoint, state: restored };
}

export function createSideGameplayState(): SideGameplayState {
  return { ...createSideMotionState(), returnAction: "idle" };
}

export function sideGameplayState(state: SideGameplayState): GameplayState {
  return {
    ...createGameplayState(state.action),
    action: state.action,
    elapsedMs: state.elapsedMs,
    pending: state.pending,
    returnAction: state.returnAction,
    jumpFrom: state.jumpFrom,
    ...(state.leadIn ? { leadIn: { ...state.leadIn } } : {}),
  };
}

function mergeState(
  stage: SideGameplayState,
  motion: GameplayState,
): SideGameplayState {
  if (motion.action === "celebrate" || motion.pending === "celebrate")
    throw Error("The side-view stage does not include celebration.");
  const { leadIn: _leadIn, ...position } = stage;
  return {
    ...position,
    ...motion,
    action: motion.action,
    pending: motion.pending,
  };
}

export function requestSidePlayback(
  state: SideGameplayState,
  action: SideAction,
  manifest: BakedCharacterPackManifest,
  profile: GameplayMotion | null,
): SideGameplayState {
  return profile
    ? mergeState(
        state,
        requestGameplayAction(sideGameplayState(state), action, profile),
      )
    : { ...state, ...requestSideAction(state, action, manifest) };
}

export function advanceSidePlayback(
  state: SideGameplayState,
  deltaMs: number,
  manifest: BakedCharacterPackManifest,
  options: SideMotionOptions,
  profile: GameplayMotion | null,
): SideGameplayState {
  if (!profile)
    return {
      ...state,
      ...advanceSideMotion(state, deltaMs, manifest, options),
    };
  if (state.paused) return { ...state };
  let worldX = state.worldX;
  const motion = advanceGameplayMotion(
    profile,
    sideGameplayState(state),
    deltaMs,
    (segment) => {
      const action =
        segment.action === "jump" ? segment.jumpFrom : segment.action;
      const speed =
        action === "run"
          ? options.runSpeed
          : action === "walk"
            ? options.walkSpeed
            : 0;
      if (options.mode === "travel")
        worldX = Math.max(
          options.bounds.min,
          Math.min(
            options.bounds.max,
            worldX +
              ((state.facing === "left" ? -1 : 1) *
                speed *
                segment.durationMs) /
                1000,
          ),
        );
    },
  );
  return { ...mergeState(state, motion), worldX };
}

/** Resolve the actual approach drawing; its pose is outside the base Jump clip. */
export function sidePlaybackFrameId(
  state: SideGameplayState,
  manifest: BakedCharacterPackManifest,
  profile: GameplayMotion | null,
): number {
  return profile
    ? gameplayFrameId(profile, sideGameplayState(state))
    : sideFrameId(state, manifest);
}
