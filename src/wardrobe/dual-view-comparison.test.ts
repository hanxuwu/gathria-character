import { describe, expect, it } from "vitest";
import {
  advanceNativeClock,
  calibrateSourceBody,
  comparisonLayout,
} from "./dual-view-comparison";

function frame(left: number, top: number, right: number, bottom: number) {
  const width = 16,
    height = 20;
  const pixels = new Uint8Array(width * height * 4);
  // Stray sub-threshold alpha must not affect body height or the baseline.
  pixels[3] = 127;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) pixels[(y * width + x) * 4 + 3] = 255;
  return { width, height, pixels, colorChunks: [] };
}

describe("paired wardrobe comparison presentation", () => {
  it("calibrates source idle holds and excludes added transparent padding", () => {
    const images = [frame(4, 4, 10, 15), frame(5, 5, 11, 16)];
    const unpadded = calibrateSourceBody([0, 0, 1], (id) => images[id], {
      left: 0,
      top: 0,
    });
    const padded = calibrateSourceBody([0, 0, 1], (id) => images[id], {
      left: 2,
      top: 3,
    });
    expect(unpadded).toEqual({ height: 11, centerX: 7, baselineY: 15 });
    expect(padded).toEqual({ height: 11, centerX: 5, baselineY: 12 });
    expect(() =>
      calibrateSourceBody([], () => images[0], { left: 0, top: 0 }),
    ).toThrow();
    expect(() =>
      calibrateSourceBody([0], () => frame(0, 0, 0, 0), { left: 0, top: 0 }),
    ).toThrow();
  });

  it("uses one equal-height viewport that contains native margins and jump room", () => {
    const sources = [
      {
        body: { height: 820, centerX: 352, baselineY: 996 },
        width: 768,
        height: 1184,
        padding: { left: 32, right: 32, top: 128, bottom: 0 },
      },
      {
        body: { height: 480, centerX: 237, baselineY: 710 },
        width: 512,
        height: 768,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
      },
    ];
    const before = structuredClone(sources);
    const layout = comparisonLayout(sources);
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index],
        transform = layout.transforms[index];
      expect(source.body.height * transform.scale).toBeCloseTo(460);
      expect(
        transform.x +
          (source.body.centerX + source.padding.left) * transform.scale,
      ).toBeCloseTo(layout.width / 2);
      expect(
        transform.y +
          (source.body.baselineY + source.padding.top) * transform.scale,
      ).toBeCloseTo(layout.baselineY);
      expect(transform.x).toBeGreaterThanOrEqual(12);
      expect(transform.y).toBeGreaterThanOrEqual(12);
      expect(transform.x + source.width * transform.scale).toBeLessThanOrEqual(
        layout.width - 12,
      );
      expect(transform.y + source.height * transform.scale).toBeLessThanOrEqual(
        layout.height - 12,
      );
    }
    expect(sources).toEqual(before);
  });

  it("keeps native run periods distinct and stops each one-shot at its own end", () => {
    const original = {
      frames: Array.from({ length: 16 }, (_, i) => i),
      fps: 24,
      loop: true,
    };
    const side = {
      frames: Array.from({ length: 18 }, (_, i) => i + 40),
      fps: 24,
      loop: true,
    };
    expect(advanceNativeClock(0, 1000, original).position).toBe(8);
    expect(advanceNativeClock(0, 1000, side).position).toBe(6);
    const firstJump = advanceNativeClock(0, 1000, { ...original, loop: false });
    const longerJump = advanceNativeClock(0, 1000, {
      frames: Array(50).fill(1),
      fps: 24,
      loop: false,
    });
    expect(firstJump).toEqual({
      elapsed: (16 * 1000) / 24,
      position: 15,
      finished: true,
    });
    expect(longerJump).toEqual({
      elapsed: 1000,
      position: 24,
      finished: false,
    });
    expect(
      advanceNativeClock(firstJump.elapsed, 5000, { ...original, loop: false }),
    ).toEqual(firstJump);
  });
});
