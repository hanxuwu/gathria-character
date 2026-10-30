import {
  advanceGameplayMotion,
  createGameplayState,
  requestGameplayAction,
  type GameplayMotion,
  type GameplayState,
} from "../core/gameplay-motion";
import type { BakedCharacterPackManifest } from "../core/types";
import {
  advanceSideMotion,
  createSideMotionState,
  requestSideAction,
  type SideAction,
  type SideMotionOptions,
  type SideMotionState,
} from "./motion";

/** Stage position and facing remain outside the authored animation controller. */
export interface SideGameplayState extends SideMotionState {
  returnAction: GameplayState["returnAction"];
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
  };
}

function mergeState(
  stage: SideGameplayState,
  motion: GameplayState,
): SideGameplayState {
  if (motion.action === "celebrate" || motion.pending === "celebrate")
    throw Error("The side-view stage does not include celebration.");
  return {
    ...stage,
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
