import { expect, it } from "vitest";
import { themePreviewCanvasAvailable } from "./preview-budget";

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
