import { describe, expect, it } from "vitest";
import {
  samplePlaybackClock,
  type PlaybackClockInputs,
  type PlaybackClockSample,
} from "./playback-clock";

const inputs: PlaybackClockInputs = {
  source: {},
  comparison: null,
  motion: {},
  revision: 0,
  running: true,
  speed: 1,
};

describe("independent player clock", () => {
  it("keeps the transition RAF-to-React-commit interval instead of holding the first run pose", () => {
    let clock: PlaybackClockSample | null = null;
    let elapsed = 0;
    // Landing changes the action label at t=1000. React replaces the canvas
    // effect 6 ms later and immediately paints, before the next display tick.
    for (const now of [1000, 1006, 1000 + 1000 / 60, 1000 + 1000 / 30]) {
      const next = samplePlaybackClock(clock, now, inputs);
      clock = next.sample;
      elapsed += next.deltaMs;
    }
    expect(elapsed).toBeCloseTo(1000 / 30, 9);
    // The previous effect-local timestamp discarded exactly those first 6 ms.
    const effectLocalElapsed = 1000 + 1000 / 30 - 1006;
    expect(elapsed - effectLocalElapsed).toBeCloseTo(6, 9);
  });

  it("does not turn paused or background time into a landing skip", () => {
    const playing = samplePlaybackClock(null, 1000, inputs);
    const paused = samplePlaybackClock(playing.sample, 1010, {
      ...inputs,
      running: false,
    });
    const resumed = samplePlaybackClock(paused.sample, 90_000, inputs);
    expect(paused.deltaMs).toBe(0);
    expect(resumed.deltaMs).toBe(0);
    expect(samplePlaybackClock(resumed.sample, 90_016, inputs).deltaMs).toBe(
      16,
    );
    // The visibility event clears the sample even if RAF was suspended before
    // it could observe the hidden state.
    expect(samplePlaybackClock(null, 180_000, inputs).deltaMs).toBe(0);
  });

  it.each([
    ["new source", { source: {} }],
    ["comparison change", { comparison: {} }],
    ["controller change", { motion: {} }],
    ["scrub or replay", { revision: 1 }],
    ["speed change", { speed: 0.5 }],
  ] satisfies Array<[string, Partial<PlaybackClockInputs>]>)(
    "resets the time baseline for %s",
    (_label, change) => {
      const prior = samplePlaybackClock(null, 10, inputs);
      const changed = { ...inputs, ...change };
      const next = samplePlaybackClock(prior.sample, 8000, changed);
      expect(next.deltaMs).toBe(0);
      expect(samplePlaybackClock(next.sample, 8020, changed).deltaMs).toBe(
        20 * changed.speed,
      );
    },
  );

  it("uses continuous source time through redraws and applies the selected rate once", () => {
    const fast = { ...inputs, speed: 2 };
    const prior = samplePlaybackClock(null, 0, fast);
    expect(samplePlaybackClock(prior.sample, 25, { ...fast }).deltaMs).toBe(50);
    const olderRaf = samplePlaybackClock(prior.sample, -1, fast);
    expect(olderRaf.deltaMs).toBe(0);
    expect(olderRaf.sample.at).toBe(0);
    expect(samplePlaybackClock(olderRaf.sample, 25, fast).deltaMs).toBe(50);
  });
});
