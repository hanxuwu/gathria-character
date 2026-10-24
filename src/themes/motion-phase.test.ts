import { describe, expect, it } from "vitest";
import { transferThemeMotion } from "./motion-phase";
import type { Animation } from "../core/types";

const clip = (length: number, loop = true): Animation => ({
  // Repeated IDs prove mapping uses time positions, not the rendered ID.
  frames: Array.from({ length }, (_, index) => Math.floor(index / 2) + 40),
  fps: 24,
  loop,
});

describe("theme motion phase transfer", () => {
  it("maps shorter and longer loop timelines, including repeated holds", () => {
    expect(transferThemeMotion(clip(16), clip(8), 6, false, true)).toEqual({
      position: 3,
      playing: false,
      preserved: true,
    });
    expect(transferThemeMotion(clip(8), clip(16), 3, true, true)).toEqual({
      position: 6,
      playing: true,
      preserved: true,
    });
    expect(transferThemeMotion(clip(16), clip(8), 15, true, true)).toEqual({
      position: 7,
      playing: true,
      preserved: true,
    });
  });
  it("keeps a completed one-shot at its final drawing, never restarts it", () => {
    expect(
      transferThemeMotion(clip(5, false), clip(16, false), 4, false, true),
    ).toEqual({ position: 15, playing: false, preserved: true });
    expect(
      transferThemeMotion(clip(5, false), clip(3, false), 4, true, true),
    ).toEqual({ position: 2, playing: true, preserved: true });
    expect(
      transferThemeMotion(clip(5, false), clip(8), 4, false, true),
    ).toEqual({ position: 7, playing: false, preserved: true });
    expect(transferThemeMotion(clip(5, false), clip(8), 4, true, true)).toEqual(
      { position: 7, playing: false, preserved: true },
    );
  });
  it("resets when disabled or either action is missing without substituting frames", () => {
    const reset = { position: 0, playing: false, preserved: false };
    expect(transferThemeMotion(clip(16), clip(8), 10, true, false)).toEqual(
      reset,
    );
    expect(transferThemeMotion(undefined, clip(8), 10, true, true)).toEqual(
      reset,
    );
    expect(transferThemeMotion(clip(16), undefined, 10, true, true)).toEqual(
      reset,
    );
  });
});
