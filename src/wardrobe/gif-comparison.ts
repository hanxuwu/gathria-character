import type { RgbaPng } from "../core/baked-source";

export const GIF_COMPARISON_GAP = 8;
export const GIF_COMPARISON_LABEL = 16;
// Small fixed labels avoid browser fonts or platform-specific text rasterization
// entering a deterministic GIF. They never touch the character pixels.
const GLYPHS: Record<string, string[]> = {
  O: ["111", "101", "101", "101", "111"],
  R: ["110", "101", "110", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  G: ["111", "100", "101", "101", "111"],
  N: ["101", "111", "111", "111", "101"],
  A: ["010", "101", "111", "101", "101"],
  L: ["100", "100", "100", "100", "111"],
  C: ["111", "100", "100", "100", "111"],
  U: ["101", "101", "101", "101", "111"],
  E: ["111", "100", "110", "100", "111"],
  T: ["111", "010", "010", "010", "010"],
};

/** Inputs already share a padded frame and are compacted exactly once. */
export function joinGifComparison(
  original: RgbaPng,
  current: RgbaPng,
): RgbaPng {
  if (original.width !== current.width || original.height !== current.height)
    throw Error(
      "Comparison frames must have identical dimensions and anchors.",
    );
  const width = original.width * 2 + GIF_COMPARISON_GAP,
    height = original.height + GIF_COMPARISON_LABEL;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4)
    pixels.set([238, 233, 223, 255], i);
  for (const [index, image] of [original, current].entries()) {
    const left = index * (original.width + GIF_COMPARISON_GAP);
    for (let y = 0; y < image.height; y++)
      pixels.set(
        image.pixels.subarray(y * image.width * 4, (y + 1) * image.width * 4),
        ((y + GIF_COMPARISON_LABEL) * width + left) * 4,
      );
    const label = index === 0 ? "ORIGINAL" : "CURRENT";
    for (let c = 0; c < label.length; c++)
      GLYPHS[label[c]].forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const px = 4 + c * 4 + x;
          if (row[x] === "1" && px < image.width)
            pixels.set([52, 75, 63, 255], ((y + 5) * width + left + px) * 4);
        }
      });
  }
  return { width, height, pixels, colorChunks: [] };
}
