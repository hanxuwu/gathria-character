import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { encodeSourceRgbaPngAsync, type RgbaPng } from "../core/baked-source";
import {
  validatePortableManifest,
  type PortableCharacterPackArchive,
} from "../core/pack";
import {
  prepareSourcePng,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type { Facing, PortableAnimationName } from "../core/types";
import { compactGifFrame, GIF_MATTE, gifDelays } from "../wardrobe/action-gif";

export interface ThemeMediaOptions extends SourcePreparationOptions {
  onProgress?: (done: number, total: number) => void;
}

const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function check(options: SourcePreparationOptions): void {
  if (options.signal?.aborted)
    throw new DOMException("Theme export canceled.", "AbortError");
}
function direction(facing: Facing): void {
  if (facing !== "left" && facing !== "right")
    throw Error("Choose left or right facing.");
}

/** Retains at most one decoded atlas page. All extracted pixels are owned
 * copies, and no canvas/browser color conversion is used for native PNGs. */
function frameReader(
  archive: PortableCharacterPackArchive,
  options: SourcePreparationOptions,
) {
  check(options);
  const manifest = validatePortableManifest(archive.manifest);
  const frames = new Map(manifest.frames.map((frame) => [frame.id, frame]));
  let cached: { index: number; image: RgbaPng } | undefined;
  return {
    manifest,
    async frame(id: number): Promise<RgbaPng> {
      check(options);
      const frame = frames.get(id);
      if (!frame) throw Error(`Theme frame ${id} is unavailable.`);
      const page = manifest.schemaVersion === 2 ? 0 : frame.page!;
      if (cached?.index !== page) {
        // Release the previous page before allocating a new decoded surface.
        cached = undefined;
        const bytes =
          page === 0 ? archive.png : archive.additionalPngs?.[page - 1];
        const sheet =
          page === 0
            ? manifest.spritesheet
            : manifest.schemaVersion !== 2
              ? manifest.additionalSheets[page - 1]
              : undefined;
        if (!bytes || !sheet)
          throw Error(`Theme atlas page ${page} is unavailable.`);
        const image = await prepareSourcePng(bytes, sheet, options);
        check(options);
        cached = { index: page, image };
      }
      const source = cached.image;
      const pixels = new Uint8Array(frame.width * frame.height * 4);
      for (let y = 0; y < frame.height; y++) {
        const offset = ((frame.y + y) * source.width + frame.x) * 4;
        pixels.set(
          source.pixels.subarray(offset, offset + frame.width * 4),
          y * frame.width * 4,
        );
      }
      check(options);
      return {
        width: frame.width,
        height: frame.height,
        pixels,
        colorChunks: source.colorChunks.map((chunk) => new Uint8Array(chunk)),
      };
    },
    release() {
      cached = undefined;
    },
  };
}

function mirrorRgba(image: RgbaPng): RgbaPng {
  const pixels = new Uint8Array(image.pixels.length);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const source = (y * image.width + x) * 4;
      const target = (y * image.width + image.width - 1 - x) * 4;
      pixels.set(image.pixels.subarray(source, source + 4), target);
    }
  return { ...image, pixels };
}

/** Original frame dimensions, exact RGBA (including transparent RGB), and
 * retained source color chunks. Left facing only mirrors pixel positions. */
export async function themeFramePng(
  archive: PortableCharacterPackArchive,
  frameId: number,
  facing: Facing,
  options: SourcePreparationOptions = {},
): Promise<Uint8Array> {
  direction(facing);
  const reader = frameReader(archive, options);
  try {
    const image = await reader.frame(frameId);
    reader.release();
    check(options);
    const bytes = await encodeSourceRgbaPngAsync(
      facing === "left" ? mirrorRgba(image) : image,
    );
    check(options);
    return bytes;
  } finally {
    reader.release();
  }
}

function pixelGifFrame(image: RgbaPng): RgbaPng {
  const pixels = new Uint8Array(image.pixels.length);
  for (let at = 0; at < pixels.length; at += 4) {
    const alpha = image.pixels[at + 3] / 255;
    for (let c = 0; c < 3; c++)
      pixels[at + c] = Math.round(
        image.pixels[at + c] * alpha + GIF_MATTE[c] * (1 - alpha),
      );
    pixels[at + 3] = 255;
  }
  return { ...image, pixels, colorChunks: [] };
}

/** GIF previews use the original pose order, holds, FPS and loop flag. Pixel
 * themes remain native-sized; smooth sources use the established half-native
 * matte preview. GIF is lossy/opaque; PNG and CharacterPack retain RGBA. */
export async function themeActionGif(
  archive: PortableCharacterPackArchive,
  action: PortableAnimationName,
  facing: Facing,
  options: ThemeMediaOptions = {},
): Promise<Uint8Array> {
  direction(facing);
  const reader = frameReader(archive, options);
  const clip = reader.manifest.animations[action];
  if (!clip) throw Error(`The selected theme does not include ${action}.`);
  const delays = gifDelays(clip.frames.length, clip.fps);
  const divisor = reader.manifest.scale.pixelArt ? 1 : 2;
  const width = Math.ceil(reader.manifest.spritesheet.frameWidth / divisor);
  const height = Math.ceil(reader.manifest.spritesheet.frameHeight / divisor);
  if (
    clip.frames.length > 600 ||
    width * height * clip.frames.length > 32_000_000
  )
    throw Error(
      "This action is too large for a local GIF preview. Export CharacterPack instead.",
    );
  const frames: RgbaPng[] = [];
  const total = clip.frames.length * 2;
  options.onProgress?.(0, total);
  try {
    for (let i = 0; i < clip.frames.length; i++) {
      await yieldTask();
      check(options);
      const source = await reader.frame(clip.frames[i]);
      frames.push(
        divisor === 1
          ? pixelGifFrame(source)
          : compactGifFrame(source, "right"),
      );
      options.onProgress?.(i + 1, total);
    }
    reader.release();
    check(options);
    // The same sample/palette is used for either facing. Mirror indices after
    // quantization so left and right cannot drift in palette or alpha handling.
    const stride = Math.max(
      1,
      Math.ceil((width * height * frames.length) / 262144),
    );
    const sample = new Uint8Array(
      Math.ceil((width * height) / stride) * 4 * frames.length,
    );
    let cursor = 0;
    for (const frame of frames)
      for (let p = 0; p < frame.pixels.length / 4; p += stride) {
        sample.set(frame.pixels.subarray(p * 4, p * 4 + 4), cursor);
        cursor += 4;
      }
    await yieldTask();
    check(options);
    const palette = quantize(sample.subarray(0, cursor), 256);
    const gif = GIFEncoder();
    for (let i = 0; i < frames.length; i++) {
      await yieldTask();
      check(options);
      const indices = applyPalette(frames[i].pixels, palette);
      if (facing === "left")
        for (let y = 0; y < height; y++)
          for (let x = 0; x < Math.floor(width / 2); x++) {
            const a = y * width + x,
              b = y * width + width - 1 - x;
            const old = indices[a];
            indices[a] = indices[b];
            indices[b] = old;
          }
      gif.writeFrame(indices, width, height, {
        ...(i === 0 ? { palette } : {}),
        delay: delays[i],
        repeat: clip.loop ? 0 : -1,
        dispose: 1,
      });
      frames[i].pixels = new Uint8Array(0);
      options.onProgress?.(clip.frames.length + i + 1, total);
    }
    check(options);
    gif.finish();
    return gif.bytes();
  } finally {
    reader.release();
    frames.length = 0;
  }
}
