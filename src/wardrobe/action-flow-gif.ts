import {
  advanceGameplayMotion,
  createGameplayState,
  gameplayFrameId,
  gameplayFramePosition,
  gameplayManifest,
  gameplayMotionMetadata,
  requestGameplayAction,
  type GameplayMotion,
} from "../core/gameplay-motion";
import type { Facing, PortableAnimationName } from "../core/types";
import { exportWardrobeActionGif } from "./action-gif";
import type { WardrobeCompositor } from "./compositor";

export interface WardrobeRunJumpSequence {
  format: "gathria-gameplay-review-sequence";
  version: 1;
  profileId: string;
  sourceSha256: string;
  fps: number;
  /** Trigger after one complete run cycle; wait only for a reviewed seam. */
  jumpRequestTick: number;
  /** A full run cycle after the automatic landing return, from its entry pose. */
  returnRunTicks: number;
  /** Native run frames after that cycle, ending just before the initial phase.
   * Replaying the review then follows the run clip's real last-to-first edge. */
  loopClosureTicks: number;
  durationMs: number;
  frames: Array<{
    action: PortableAnimationName;
    frameId: number;
    durationMs: number;
  }>;
}

/** Exercise exactly the same native-clock controller as interactive playback:
 * one run cycle, one jump request, complete landing and at least one more run
 * cycle, followed through to the phase immediately before the initial pose.
 * No repeated jump requests, pose blending or separate export-only transition. */
export function buildWardrobeRunJumpSequence(
  profile: GameplayMotion,
): WardrobeRunJumpSequence {
  gameplayMotionMetadata(profile); // Reject tampered or unreviewed profiles.
  const fps = profile.actions.run.fps;
  if (profile.actions.jump.fps !== fps)
    throw Error("This review requires equal native run and jump cadence.");
  const durationMs = 1000 / fps;
  const runTicks = profile.actions.run.frames.length;
  const frames: WardrobeRunJumpSequence["frames"] = [];
  let state = createGameplayState("run");
  const sample = () => {
    frames.push({
      action: state.action,
      frameId: gameplayFrameId(profile, state),
      durationMs,
    });
    state = advanceGameplayMotion(profile, state, durationMs);
  };
  for (let i = 0; i < runTicks; i++) sample();
  state = requestGameplayAction(state, "jump", profile);
  state = advanceGameplayMotion(profile, state, 0);
  let jumped = false;
  let returnedRunTicks = 0;
  for (; frames.length < 600; ) {
    if (state.action === "jump") jumped = true;
    else if (jumped) {
      if (state.action !== "run")
        throw Error("The reviewed jump did not return to running.");
      // Landing recovery drawings belong to the transition, not the requested
      // complete run cycle. Its clock starts only at the route's entry pose.
      if (!state.leadIn) {
        // Returning at a nonzero run phase means one complete cycle ends just
        // before that same phase, not before the review's initial phase. Keep
        // exercising the controller until phase zero; never skip/reorder poses
        // or append a duplicate first pose to conceal the replay boundary.
        if (
          returnedRunTicks >= runTicks &&
          gameplayFramePosition(profile, state) === 0
        )
          break;
        returnedRunTicks++;
      }
    }
    sample();
  }
  if (
    !jumped ||
    returnedRunTicks < runTicks ||
    returnedRunTicks >= 2 * runTicks ||
    gameplayFramePosition(profile, state) !== 0 ||
    frames.length >= 600
  )
    throw Error("The reviewed run/jump sequence exceeded its frame budget.");
  return {
    format: "gathria-gameplay-review-sequence",
    version: 1,
    profileId: profile.id,
    sourceSha256: profile.sourceSha256,
    fps,
    jumpRequestTick: runTicks,
    returnRunTicks: runTicks,
    loopClosureTicks: returnedRunTicks - runTicks,
    durationMs: (frames.length * 1000) / fps,
    frames,
  };
}

export async function exportWardrobeRunJumpGif(
  renderer: Pick<WardrobeCompositor, "manifest" | "renderFrame"> &
    Partial<
      Pick<WardrobeCompositor, "renderSourceFrame" | "sourceCharacterId">
    >,
  profile: GameplayMotion,
  facing: Facing,
  options: Omit<
    NonNullable<Parameters<typeof exportWardrobeActionGif>[3]>,
    "gameplayMotion"
  > = {},
): Promise<Uint8Array> {
  const manifest = gameplayManifest(
    renderer.manifest,
    profile,
    renderer.sourceCharacterId
      ? { characterId: renderer.sourceCharacterId }
      : undefined,
  );
  const sequence = buildWardrobeRunJumpSequence(profile);
  return exportWardrobeActionGif(
    {
      manifest: {
        ...manifest,
        animations: {
          ...manifest.animations,
          run: {
            frames: sequence.frames.map((frame) => frame.frameId),
            fps: sequence.fps,
            loop: false,
          },
        },
      },
      renderFrame: (id) => renderer.renderFrame(id),
      ...(renderer.renderSourceFrame
        ? { renderSourceFrame: (id: number) => renderer.renderSourceFrame!(id) }
        : {}),
    },
    "run",
    facing,
    options,
  );
}
