import { describe, expect, it } from "vitest";
import { themeComparisonPosition, transferThemeMotion } from "./motion-phase";
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

describe("continuous theme comparison sampling", () => {
  it("retains every smooth reference drawing between pixel key poses", () => {
    const current = { ...clip(8), fps: 12 };
    const reference = { ...clip(16), fps: 24 };
    const positions = Array.from({ length: 32 }, (_, index) => index / 4);
    const shown = positions.map((position) =>
      themeComparisonPosition(current, reference, position, true),
    );
    expect([...new Set(shown)]).toEqual(
      Array.from({ length: 16 }, (_, index) => index),
    );
    // The selected artwork still consists of exactly eight key poses; the
    // intermediate reference samples do not invent extra pixel drawings.
    expect([...new Set(positions.map(Math.floor))]).toEqual(
      Array.from({ length: 8 }, (_, index) => index),
    );
    expect(themeComparisonPosition(current, reference, 3.5, true)).toBe(7);
    expect(themeComparisonPosition(current, reference, 3.5, false)).toBe(6);
    expect(themeComparisonPosition(current, reference, 8, true)).toBe(0);
    expect(current.frames).toHaveLength(8);
    expect([current.fps, reference.fps]).toEqual([12, 24]);
  });

  it("lets a one-shot reference finish its last interval, then holds the end", () => {
    const current = clip(5, false);
    const reference = clip(16, false);
    expect(themeComparisonPosition(current, reference, 4, true)).toBe(12);
    expect(themeComparisonPosition(current, reference, 4.5, true)).toBe(14);
    expect(themeComparisonPosition(current, reference, 5, true)).toBe(15);
    expect(themeComparisonPosition(current, reference, 6, true)).toBe(15);
    // A paused final source drawing is an endpoint, as with the existing
    // scrubber and completed one-shot theme-switch contract.
    expect(themeComparisonPosition(current, reference, 4, false)).toBe(15);
  });

  it("has a safe first position when either clip is unavailable", () => {
    expect(themeComparisonPosition(undefined, clip(16), 3.5, true)).toBe(0);
    expect(themeComparisonPosition(clip(8), undefined, 3.5, true)).toBe(0);
    expect(themeComparisonPosition(clip(8), clip(16), -1, true)).toBe(0);
    expect(themeComparisonPosition(clip(8), clip(16), NaN, false)).toBe(0);
  });
});
