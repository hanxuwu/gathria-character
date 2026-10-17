import type { MotionClip } from "./types";

/** Sequence position, not source-pose index. One-shot clips hold their final
 * pose; looping clips retain the existing wrapping behavior. */
export function playbackFrame(clip: MotionClip, frame: number): number {
  const index = Number.isFinite(frame) ? Math.trunc(frame) : 0;
  return clip.loop
    ? ((index % clip.sequence.length) + clip.sequence.length) %
        clip.sequence.length
    : Math.max(0, Math.min(clip.sequence.length - 1, index));
}

/** A one-shot finishes only after the final entry has received its full
 * duration. Rendering that entry must not stop its clock early. */
export function playbackTick(
  clip: MotionClip,
  first: number,
  elapsedMs: number,
): { frame: number; finished: boolean } {
  const absolute =
    playbackFrame(clip, first) +
    Math.floor((Math.max(0, elapsedMs) * clip.fps) / 1000);
  return {
    frame: playbackFrame(clip, absolute),
    finished: !clip.loop && absolute >= clip.sequence.length,
  };
}
