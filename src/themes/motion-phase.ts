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
