import type { SideAction, SideMotionState } from "./motion";

export interface SideKeyboardIntent {
  action: Exclude<SideAction, "jump">;
  /** Null retains the current facing when no movement key is held. */
  facing: SideMotionState["facing"] | null;
}

/**
 * Keys must be in keydown order, as in a Set updated on keydown/keyup.
 * The most recently pressed movement key that is still held wins. Repeated
 * keydown events must not remove/reinsert a key or change that ordering.
 */
export function sideKeyboardIntent(keys: Iterable<string>): SideKeyboardIntent {
  let facing: SideKeyboardIntent["facing"] = null;
  let running = false;
  for (const key of keys) {
    if (key === "ArrowLeft" || key === "KeyA") facing = "left";
    if (key === "ArrowRight" || key === "KeyD") facing = "right";
    if (key === "ShiftLeft" || key === "ShiftRight") running = true;
  }
  return {
    action: facing === null ? "idle" : running ? "run" : "walk",
    facing,
  };
}
