import type { Animation } from "../core/types";

export interface ThemeMotionPosition {
  position: number;
  playing: boolean;
  preserved: boolean;
}

/** Match declared timeline positions, including repeated frame-ID holds. This
 * does not infer body pose correspondence or create intermediate drawings. */
export function transferThemeMotion(
  previous: Animation | undefined,
  next: Animation | undefined,
  position: number,
  playing: boolean,
  preserve: boolean,
): ThemeMotionPosition {
  if (!preserve || !previous?.frames.length || !next?.frames.length)
    return { position: 0, playing: false, preserved: false };
  const from = Math.max(
    0,
    Math.min(previous.frames.length - 1, Math.floor(position)),
  );
  // A held final drawing is an end state, not a fraction to rewind into a
  // longer timeline. The same applies when the user pauses/scrubs to the end.
  if (!previous.loop && from === previous.frames.length - 1 && !playing)
    return {
      position: next.frames.length - 1,
      playing: false,
      preserved: true,
    };
  const target =
    !previous.loop && from === previous.frames.length - 1
      ? next.frames.length - 1
      : Math.min(
          next.frames.length - 1,
          Math.floor((from / previous.frames.length) * next.frames.length),
        );
  // A loop/one-shot mismatch has different stopping semantics. Keep the visual
  // position but pause rather than unexpectedly repeat a completed jump.
  return {
    position: target,
    playing: playing && previous.loop === next.loop,
    preserved: true,
  };
}

/** Sample the reference at the continuous phase of the selected clip. Playback
 * must pass its fractional timeline position, not the selected drawing's integer
 * index: an 8-frame pixel clip can then show all 16 reference drawings without
 * altering the pixel clip's cadence. Paused/scrubbed poses retain the explicit
 * endpoint behavior used for theme switching. No artwork is interpolated. */
export function themeComparisonPosition(
  current: Animation | undefined,
  reference: Animation | undefined,
  timelinePosition: number,
  playing: boolean,
): number {
  if (!current?.frames.length || !reference?.frames.length) return 0;
  const progress = Number.isFinite(timelinePosition)
    ? Math.max(0, timelinePosition)
    : 0;
  if (!playing)
    return transferThemeMotion(current, reference, progress, false, true)
      .position;
  const phase = current.loop
    ? (progress % current.frames.length) / current.frames.length
    : Math.min(1, progress / current.frames.length);
  return Math.min(
    reference.frames.length - 1,
    Math.floor(phase * reference.frames.length),
  );
}
