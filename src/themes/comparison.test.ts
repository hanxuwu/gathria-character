import { describe, expect, it } from "vitest";
import type { PortableCharacterPackManifest } from "../core/types";
import {
  createThemeComparisonPlanes,
  THEME_COMPARISON_MAX_PIXELS,
} from "./comparison";

function geometry(
  width: number,
  height: number,
  x: number,
  y: number,
  pixel = false,
) {
  return {
    spritesheet: { frameWidth: width, frameHeight: height },
    anchor: { x, y },
    scale: { pixelArt: pixel, integerOnly: pixel, recommended: 1 },
  } as Pick<PortableCharacterPackManifest, "spritesheet" | "anchor" | "scale">;
}
const original = geometry(704, 1056, 352, 998);
describe("bounded theme comparison geometry", () => {
  it("aligns both source anchors and fits their complete rectangles", () => {
    const current = geometry(200, 300, 10, 250, true);
    const result = createThemeComparisonPlanes(current, original, "right");
    expect(result.unavailable).toBeNull();
    const [a, b] = result.planes!;
    expect(a.anchor).toEqual(b.anchor);
    expect(a.sourceScale).toBe(1);
    expect(b.sourceScale).toBe(300 / 1056);
    expect(a.width * a.height).toBeLessThanOrEqual(THEME_COMPARISON_MAX_PIXELS);
    for (const [plane, source] of [
      [a, current],
      [b, original],
    ] as const) {
      expect(
        plane.anchor.x - source.anchor.x * plane.sourceScale,
      ).toBeGreaterThanOrEqual(0);
      expect(
        plane.anchor.y - source.anchor.y * plane.sourceScale,
      ).toBeGreaterThanOrEqual(0);
      expect(
        plane.anchor.x +
          (source.spritesheet.frameWidth - source.anchor.x) * plane.sourceScale,
      ).toBeLessThanOrEqual(plane.width);
      expect(
        plane.anchor.y +
          (source.spritesheet.frameHeight - source.anchor.y) *
            plane.sourceScale,
      ).toBeLessThanOrEqual(plane.height);
    }
  });
  it("mirrors asymmetric attachment points without changing canvas bounds", () => {
    const current = geometry(200, 300, 10, 250, true);
    const right = createThemeComparisonPlanes(
      current,
      original,
      "right",
    ).planes!;
    const left = createThemeComparisonPlanes(current, original, "left").planes!;
    expect(right[0].width).toBe(left[0].width);
    expect(right[0].anchor.x + left[0].anchor.x).toBe(right[0].width);
    expect(right[0].anchor.y).toBe(left[0].anchor.y);
  });
  it("refuses excessive unions of valid independently bounded native frames", () => {
    const large = geometry(8192, 8192, 0, 0, true);
    const result = createThemeComparisonPlanes(large, original, "right");
    expect(result.planes).toBeNull();
    expect(result.unavailable).toMatch(/Native preview/);
    expect(large.spritesheet.frameWidth).toBe(8192); // no mutation or rescaling of accepted artwork
  });
  it("retains ordinary smooth comparison geometry and rejects nonfinite geometry", () => {
    const same = createThemeComparisonPlanes(
      original,
      original,
      "right",
    ).planes!;
    expect(same[0]).toMatchObject({
      width: 704,
      height: 1056,
      sourceScale: 1,
      integerDisplay: false,
    });
    expect(
      createThemeComparisonPlanes(
        geometry(704, Infinity, 0, 0),
        original,
        "right",
      ).planes,
    ).toBeNull();
  });
  it("never normalizes a pixel reference with fractional sampling", () => {
    const pixel = geometry(200, 200, 100, 190, true);
    expect(
      createThemeComparisonPlanes(geometry(300, 300, 150, 280), pixel, "right")
        .unavailable,
    ).toMatch(/integer pixel/);
    expect(
      createThemeComparisonPlanes(geometry(400, 400, 200, 380), pixel, "right")
        .planes?.[1].sourceScale,
    ).toBe(2);
  });
});
