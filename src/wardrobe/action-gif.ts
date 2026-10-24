import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { Facing, PortableAnimationName } from "../core/types";
import type { RgbaPng } from "../core/baked-source";
import type { WardrobeCompositor } from "./compositor";
import {
  joinGifComparison,
  GIF_COMPARISON_GAP,
  GIF_COMPARISON_LABEL,
} from "./gif-comparison";

export const GIF_MATTE = [238, 233, 223] as const;
/** GIF cannot encode fractional alpha. Composite first, then box-average to
 * half native size. This keeps soft source edges instead of thresholding them.
 * PNG/CharacterPack exports retain full resolution and alpha. */
export function compactGifFrame(image: RgbaPng, facing: Facing): RgbaPng {
  const width = Math.ceil(image.width / 2),
    height = Math.ceil(image.height / 2);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const rgb = [0, 0, 0];
      let count = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx,
            sy = y * 2 + dy;
          if (sx >= image.width || sy >= image.height) continue;
          const at = (sy * image.width + sx) * 4,
            alpha = image.pixels[at + 3] / 255;
          for (let c = 0; c < 3; c++)
            rgb[c] += image.pixels[at + c] * alpha + GIF_MATTE[c] * (1 - alpha);
          count++;
        }
      const at = (y * width + (facing === "left" ? width - 1 - x : x)) * 4;
      for (let c = 0; c < 3; c++) pixels[at + c] = Math.round(rgb[c] / count);
      pixels[at + 3] = 255;
    }
  return { width, height, pixels, colorChunks: [] };
}
export function gifDelays(frameCount: number, fps: number): number[] {
  if (
    !Number.isInteger(frameCount) ||
    frameCount < 1 ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    fps > 50
  )
    throw Error(
      "GIF preview supports actions up to 50 FPS. Use CharacterPack for the original timing.",
    );
  return Array.from(
    { length: frameCount },
    (_, i) =>
      (Math.round(((i + 1) * 100) / fps) - Math.round((i * 100) / fps)) * 10,
  );
}
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export async function exportWardrobeActionGif(
  renderer: Pick<WardrobeCompositor, "manifest" | "renderFrame"> &
    Partial<Pick<WardrobeCompositor, "renderSourceFrame">>,
  action: PortableAnimationName,
  facing: Facing,
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    comparison?: boolean;
    referenceLabel?: "ORIGINAL" | "PINNED";
  } = {},
): Promise<Uint8Array> {
  const clip = renderer.manifest.animations[action];
  if (!clip) throw Error("This character has no requested action.");
  const delays = gifDelays(clip.frames.length, clip.fps);
  const comparison = options.comparison === true;
  if (comparison && !renderer.renderSourceFrame)
    throw Error("Original source frames are unavailable for comparison.");
  const panelWidth = Math.ceil(renderer.manifest.spritesheet.frameWidth / 2),
    panelHeight = Math.ceil(renderer.manifest.spritesheet.frameHeight / 2),
    width = comparison ? panelWidth * 2 + GIF_COMPARISON_GAP : panelWidth,
    height = comparison ? panelHeight + GIF_COMPARISON_LABEL : panelHeight;
  if (
    width * height * clip.frames.length > 32_000_000 ||
    clip.frames.length > 600
  )
    throw Error(
      "This action is too large for a local GIF preview. Export CharacterPack instead.",
    );
  const check = () => {
    if (options.signal?.aborted)
      throw new DOMException("GIF export canceled.", "AbortError");
  };
  const frames: RgbaPng[] = [];
  const total = clip.frames.length * 2;
  check();
  options.onProgress?.(0, total);
  for (let i = 0; i < clip.frames.length; i++) {
    await yieldTask();
    check();
    const dressed = compactGifFrame(
      renderer.renderFrame(clip.frames[i]),
      "right",
    );
    const image = comparison
      ? joinGifComparison(
          compactGifFrame(renderer.renderSourceFrame!(clip.frames[i]), "right"),
          dressed,
          options.referenceLabel,
        )
      : dressed;
    if (image.width !== width || image.height !== height)
      throw Error("GIF source dimensions changed during export.");
    frames.push(image);
    options.onProgress?.(i + 1, total);
  }
  // A bounded sample from every frame produces one shared palette. Separate
  // palettes would cause otherwise unchanged skin/clothing colors to flicker.
  const stride = Math.max(
    1,
    Math.ceil((width * height * frames.length) / 262144),
  );
  const sample = new Uint8Array(
    Math.ceil((width * height) / stride) * 4 * frames.length,
  );
  let cursor = 0;
  for (const f of frames)
    for (let p = 0; p < f.pixels.length / 4; p += stride) {
      sample.set(f.pixels.subarray(p * 4, p * 4 + 4), cursor);
      cursor += 4;
    }
  await yieldTask();
  check();
  const palette = quantize(sample.subarray(0, cursor), 256),
    gif = GIFEncoder();
  for (let i = 0; i < frames.length; i++) {
    await yieldTask();
    check();
    const indices = applyPalette(frames[i].pixels, palette);
    // Quantize native pixels in both directions, then mirror indices. Sampling
    // mirrored pixels could otherwise pick a different left-facing palette.
    if (facing === "left")
      // Mirror each body inside its own panel. Keep labels readable and
      // original/current order fixed, with identical palette in both directions.
      for (let panel = 0; panel < (comparison ? 2 : 1); panel++)
        for (let y = comparison ? GIF_COMPARISON_LABEL : 0; y < height; y++)
          for (let x = 0; x < Math.floor(panelWidth / 2); x++) {
            const left = panel * (panelWidth + GIF_COMPARISON_GAP),
              a = y * width + left + x,
              b = y * width + left + panelWidth - 1 - x,
              value = indices[a];
            indices[a] = indices[b];
            indices[b] = value;
          }
    gif.writeFrame(indices, width, height, {
      ...(i === 0 ? { palette } : {}),
      delay: delays[i],
      repeat: clip.loop ? 0 : -1,
      dispose: 1,
    });
    // Release compact RGBA after encoding; no second atlas is retained.
    frames[i].pixels = new Uint8Array(0);
    options.onProgress?.(clip.frames.length + i + 1, total);
  }
  check();
  gif.finish();
  return gif.bytes();
}
