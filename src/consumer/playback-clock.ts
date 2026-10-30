/** Action labels and canvas layout may rerender while the source clock keeps
 * running. These inputs identify actual playback/control changes instead. */
export interface PlaybackClockInputs {
  source: unknown;
  comparison: unknown;
  motion: unknown;
  revision: number;
  running: boolean;
  speed: number;
}

export interface PlaybackClockSample {
  at: number;
  inputs: PlaybackClockInputs;
}

/** Preserve all elapsed time across React effect replacement. Pause, source
 * replacement, scrub/replay, controller and speed changes establish a fresh
 * baseline; their inactive time never gets added to the next action. */
export function samplePlaybackClock(
  previous: PlaybackClockSample | null,
  now: number,
  inputs: PlaybackClockInputs,
): { sample: PlaybackClockSample; deltaMs: number } {
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(inputs.speed) ||
    inputs.speed <= 0
  )
    throw Error(
      "Playback clock requires a finite timestamp and positive speed.",
    );
  const prior = previous?.inputs;
  const continuous =
    previous !== null &&
    prior?.running === true &&
    inputs.running &&
    prior.source === inputs.source &&
    prior.comparison === inputs.comparison &&
    prior.motion === inputs.motion &&
    prior.revision === inputs.revision &&
    prior.speed === inputs.speed;
  // Immediate redraws use performance.now(), whereas RAF supplies a frame
  // timestamp. A slightly older sample must neither rewind nor double-count.
  const at = continuous ? Math.max(now, previous.at) : now;
  return {
    sample: { at, inputs },
    deltaMs: continuous ? (at - previous.at) * inputs.speed : 0,
  };
}
