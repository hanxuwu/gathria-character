import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
  encodeSourceRgbaPngAsync,
  type RgbaPng,
} from "./baked-source";

/** Actual padded appearance-frame pixels that produced an invalid backwards
 * deflate distance in the previous streaming encoder. */
function paddedAppearance(size = 8): RgbaPng {
  const tile = new Uint8Array(8 * 8 * 4);
  for (let y = 2; y < 8; y++)
    for (let x = 1; x < 7; x++) tile.set([80, 100, 120, 255], (y * 8 + x) * 4);
  tile.set([200, 120, 50, 128], (1 * 8 + 3) * 4);
  tile.set([239, 173, 117, 31], (2 * 8 + 2) * 4);
  tile.set([12, 67, 89, 180], (4 * 8 + 2) * 4);
  tile.set([0, 0, 0, 0], (4 * 8 + 3) * 4);
  tile.set([91, 37, 151, 255], (5 * 8 + 2) * 4);
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const at = ((y % 8) * 8 + (x % 8)) * 4;
      pixels.set(tile.subarray(at, at + 4), (y * size + x) * 4);
    }
  return { width: size, height: size, pixels, colorChunks: [] };
}

function independentlyInflate(png: Uint8Array): Buffer {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Uint8Array[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = view.getUint32(offset);
    if (
      new TextDecoder().decode(png.subarray(offset + 4, offset + 8)) === "IDAT"
    )
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return inflateSync(Buffer.concat(chunks));
}

describe("transparent appearance PNG export", () => {
  it("encodes the actual sparse RGBA regression without invalid deflate distances", () => {
    const image = paddedAppearance();
    const png = encodeSourceRgbaPng(image);
    expect(independentlyInflate(png)).toHaveLength((8 * 4 + 1) * 8);
    expect(decodeSourceRgbaPng(png, image).pixels).toEqual(image.pixels);
  });

  it("streams a larger repeated padded atlas through sync and yielding encoders losslessly", async () => {
    const image = paddedAppearance(512);
    const sync = encodeSourceRgbaPng(image);
    const async = await encodeSourceRgbaPngAsync(image);
    expect(Buffer.from(async).equals(Buffer.from(sync))).toBe(true);
    expect(independentlyInflate(async)).toHaveLength((512 * 4 + 1) * 512);
    expect(
      Buffer.from(decodeSourceRgbaPng(async, image).pixels).equals(
        Buffer.from(image.pixels),
      ),
    ).toBe(true);
  });
});
