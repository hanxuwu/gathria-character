import { unzlibSync } from "fflate";
import { colorLayer } from "./illustrated-canvas";
import type {
  IllustratedLayer,
  IllustratedPortrait,
} from "./illustrated-types";
import type { ArtV4CharacterConfig } from "./types";

/** V4 alone compresses bright hair highlights so dark hair retains its pigment. */
export function expressiveColors(
  layer: IllustratedLayer,
  config: ArtV4CharacterConfig,
) {
  const pixels = colorLayer(layer, { ...config, artworkVersion: 3 });
  if (!layer.palette.hair) return pixels;
  const packed = unzlibSync(
    Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)),
  );
  const target = [1, 3, 5].map((i) =>
    parseInt(config.hairColor.slice(i, i + 2), 16),
  );
  const light = target[0] * 0.2126 + target[1] * 0.7152 + target[2] * 0.0722;
  const strength = 0.35 + (0.65 * light) / 255;
  for (let p = 0; p < layer.width * layer.height; p++) {
    if (packed[p * 5 + 4] !== 2) continue;
    for (let c = 0; c < 3; c++) {
      const value = pixels[p * 4 + c];
      if (value > target[c])
        pixels[p * 4 + c] = target[c] + (value - target[c]) * strength;
    }
  }
  return pixels;
}

/** Eye changes live in the head layer, before its pose/face-shape transform.
 * Skin is sampled from the cheek immediately beneath each eye; the source
 * eyelash silhouette is retained for half blinks. No frame mutates cached art. */
export function expressionPixels(
  layer: IllustratedLayer,
  source: Uint8ClampedArray,
  portrait: IllustratedPortrait,
  expression: ArtV4CharacterConfig["expression"],
  blink: number,
) {
  if (expression === "gentle" && blink === 0) return source;
  const pixels = source.slice();
  const packed = unzlibSync(
    Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)),
  );
  const offset = (x: number, y: number) =>
    ((y - layer.y) * layer.width + x - layer.x) * 4;
  const put = (x: number, y: number, color: readonly number[]) => {
    const i = offset(x, y);
    if (
      x >= layer.x &&
      x < layer.x + layer.width &&
      y >= layer.y &&
      y < layer.y + layer.height &&
      source[i + 3]
    )
      pixels.set(color, i);
  };
  for (const [x, y, w, h] of portrait.eyes) {
    // Reconstruct skin from a ring around the eye, excluding hair and the eye
    // itself. Distance weighting avoids rectangular patches and cheek streaks.
    const samples: { x: number; y: number; color: number[] }[] = [];
    for (let py = y - 5; py < y + h + 6; py++)
      for (let px = x - 5; px < x + w + 6; px++) {
        if (px >= x && px < x + w && py >= y && py < y + h) continue;
        const i = offset(px, py),
          raw = (i / 4) * 5;
        if (packed[raw + 4] === 1 && packed[raw] > 170 && packed[raw + 1] > 110)
          samples.push({
            x: px,
            y: py,
            color: Array.from(source.subarray(i, i + 3)),
          });
      }
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const px = x + dx,
          py = y + dy,
          i = offset(px, py);
        if (packed[(i / 4) * 5 + 4] === 2) continue; // Preserve bangs and eyebrows.
        const sum = [0, 0, 0];
        let total = 0;
        for (const sample of samples) {
          const weight =
            1 / ((sample.x - px) ** 2 + (sample.y - py) ** 2 + 4) ** 2;
          total += weight;
          for (let c = 0; c < 3; c++) sum[c] += sample.color[c] * weight;
        }
        if (total) put(px, py, [...sum.map((v) => Math.round(v / total)), 255]);
      }
    if (expression === "gentle" && blink < 1) {
      const height = Math.round(h * (1 - blink));
      const top = y + Math.round((h - height) * 0.55);
      for (let dy = 0; dy < height; dy++)
        for (let dx = 0; dx < w; dx++) {
          const i = offset(
            x + dx,
            y + Math.min(h - 1, Math.floor((dy * h) / height)),
          );
          if (packed[(i / 4) * 5 + 4] !== 2)
            put(x + dx, top + dy, Array.from(source.subarray(i, i + 4)));
        }
    } else {
      const left = x + 2,
        right = x + w - 3,
        center = (left + right) / 2;
      const base = y + Math.round(h * 0.53);
      const dark = [63, 37, 29, 255],
        soft = [111, 64, 44, 255];
      for (let px = left; px <= right; px++) {
        const t = (px - center) / ((right - left) / 2);
        const py =
          base + Math.round((expression === "joyful" ? 1 : -1) * 3 * t * t);
        put(px, py, dark);
        put(px, py + 1, dark);
        put(px, py + 2, soft);
      }
    }
  }
  return pixels;
}
