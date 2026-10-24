import { expect, it } from "vitest";
import {
  themePreviewBacking,
  themePreviewCanvasAvailable,
} from "./preview-budget";

it("accepts native character previews and exact allocation boundaries", () => {
  expect(themePreviewCanvasAvailable(704, 1056)).toBe(true);
  expect(themePreviewCanvasAvailable(256, 384)).toBe(true);
  expect(themePreviewCanvasAvailable(2048, 2048)).toBe(true);
  expect(themePreviewCanvasAvailable(4096, 1024)).toBe(true);
});
it("rejects oversized valid pack frames and invalid canvas dimensions before allocation", () => {
  for (const [width, height] of [
    [8192, 8192],
    [4096, 1025],
    [4097, 1],
    [1, 4097],
    [0, 100],
    [-1, 100],
    [Infinity, 1],
    [NaN, 1],
    [1.5, 3],
  ])
    expect(themePreviewCanvasAvailable(width, height)).toBe(false);
});

it("draws only normalized smooth references directly at the requested display resolution", () => {
  expect(themePreviewBacking(192, 272, false, 272 / 1056, 2)).toEqual({
    width: 384,
    height: 544,
    scale: 2,
    available: true,
  });
  expect(themePreviewBacking(192, 272, false, 272 / 1056, 3)).toEqual({
    width: 576,
    height: 816,
    scale: 3,
    available: true,
  });
  for (const [pixelArt, referenceScale, displayScale] of [
    [true, 0.5, 2],
    [true, undefined, 2],
    [false, undefined, 2],
    [false, 1, 2],
    [false, 0.5, 1],
    [false, 0.5, 0.75],
  ] as const)
    expect(
      themePreviewBacking(192, 272, pixelArt, referenceScale, displayScale),
    ).toEqual({ width: 192, height: 272, scale: 1, available: true });
});

it("checks the enlarged reference allocation budget before drawing", () => {
  expect(themePreviewBacking(1024, 1024, false, 0.5, 2).available).toBe(true);
  expect(themePreviewBacking(1024, 1025, false, 0.5, 2).available).toBe(false);
  expect(themePreviewBacking(2049, 8, false, 0.5, 2).available).toBe(false);
  // A pixel preview at the same zoom retains its unchanged native canvas.
  expect(themePreviewBacking(2049, 8, true, 0.5, 2)).toEqual({
    width: 2049,
    height: 8,
    scale: 1,
    available: true,
  });
});
