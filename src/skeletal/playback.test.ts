import { describe, expect, it } from "vitest";
import { createMotionLibrary } from "./definition";
import { playbackFrame, playbackTick } from "./playback";

describe("looping and one-shot authoring playback", () => {
  it("keeps looping actions wrapping through their playback entries", () => {
    const clip = createMotionLibrary().clips.walk;
    expect(playbackFrame(clip, -1)).toBe(7);
    expect(playbackFrame(clip, 8)).toBe(0);
    expect(playbackTick(clip, 7, 100)).toEqual({ frame: 0, finished: false });
    expect(playbackTick(clip, 0, 8000)).toEqual({ frame: 0, finished: false });
  });

  it("holds landing without wrapping and gives the last pose a full duration", () => {
    const clip = createMotionLibrary().clips.jump!;
    const last = clip.sequence.length - 1;
    const frameMs = 1000 / clip.fps;
    expect(playbackFrame(clip, -1)).toBe(0);
    expect(playbackFrame(clip, 999)).toBe(last);
    expect(playbackTick(clip, 0, frameMs * last + 1)).toEqual({
      frame: last,
      finished: false,
    });
    expect(playbackTick(clip, 0, frameMs * (last + 1) + 1)).toEqual({
      frame: last,
      finished: true,
    });
    expect(playbackTick(clip, last, frameMs - 1)).toEqual({
      frame: last,
      finished: false,
    });
    expect(playbackTick(clip, last, frameMs + 1)).toEqual({
      frame: last,
      finished: true,
    });
  });
});
