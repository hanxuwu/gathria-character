import { decodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import { validateRgbaPngScanlines } from "../core/pack";

const signature = [137, 80, 78, 71, 13, 10, 26, 10];
export type DecodedGarmentPage = {
  patch: RgbaPng;
  /** Alpha only: RGB channels have no ownership semantics. */
  ownership: Uint8Array;
};
type CachedPage = { image: DecodedGarmentPage; strict: boolean };
const pages = new Map<string, CachedPage>();
// The current largest shipped frame (tucked bun + Gentle + dress + shoes)
// needs 222.3 MiB across its RGBA/ownership pages. A 192 MiB LRU repeatedly
// evicts a page needed by that same frame, making preflight and playback decode
// every frame again. Keep a bounded working set with modest headroom; archive,
// project and decoded-artwork validation limits remain unchanged.
export const GARMENT_CACHE_MAX_BYTES = 256 * 1024 * 1024;
export const GARMENT_CACHE_MAX_PAGES = 8;
function imageBytes(image: DecodedGarmentPage): number {
  return (
    image.patch.pixels.byteLength +
    image.ownership.byteLength +
    image.patch.colorChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  );
}

// Internal buffers shared by import validation and composition, never returned
// through a public project or render result. Keys come only from the hash of a
// copied, revalidated garment ZIP, not a caller's mutable item.sha256 field.
function remember(key: string, entry: CachedPage): void {
  pages.delete(key);
  pages.set(key, entry);
  let bytes = [...pages.values()].reduce(
    (sum, { image }) => sum + imageBytes(image),
    0,
  );
  while (
    pages.size > GARMENT_CACHE_MAX_PAGES ||
    bytes > GARMENT_CACHE_MAX_BYTES
  ) {
    const oldest = pages.keys().next().value!;
    const old = pages.get(oldest)!.image;
    pages.delete(oldest);
    bytes -= imageBytes(old);
  }
}

export function checkPageHeader(
  bytes: Uint8Array,
  width: number,
  height: number,
) {
  if (bytes.length < 45 || !signature.every((n, i) => bytes[i] === n))
    throw Error("Garment page must be an intact RGBA PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(8) !== 13 ||
    view.getUint32(12) !== 0x49484452 ||
    view.getUint32(16) !== width ||
    view.getUint32(20) !== height
  )
    throw Error("Garment PNG dimensions do not match the declared atlas.");
  if (bytes[24] !== 8 || bytes[25] !== 6 || bytes[26] || bytes[27] || bytes[28])
    throw Error("Garment PNG must be non-interlaced 8-bit RGBA.");
}
async function strictPngCompression(
  bytes: Uint8Array,
  width: number,
  height: number,
) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    chunks: Uint8Array[] = [];
  for (let offset = 8; offset < bytes.length; ) {
    if (offset + 12 > bytes.length) throw Error("Truncated garment PNG chunk.");
    const size = view.getUint32(offset),
      end = offset + size + 12;
    if (end > bytes.length) throw Error("Invalid garment PNG chunk bounds.");
    const type = view.getUint32(offset + 4);
    if ([0x6163544c, 0x6663544c, 0x66644154].includes(type))
      throw Error("Garment PNG must be static, not APNG.");
    if (type === 0x49444154 && size)
      chunks.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
  }
  await validateRgbaPngScanlines(chunks, width, height, false);
}

function decodePage(
  patch: Uint8Array,
  ownership: Uint8Array,
  dimensions: { width: number; height: number },
): DecodedGarmentPage {
  const p = decodeSourceRgbaPng(patch, dimensions),
    mask = decodeSourceRgbaPng(ownership, dimensions);
  const alpha = new Uint8Array(dimensions.width * dimensions.height);
  for (let i = 3; i < mask.pixels.length; i += 4) {
    if (mask.pixels[i] !== 0 && mask.pixels[i] !== 255)
      throw Error("Garment ownership alpha must be binary 0 or 255.");
    if (!mask.pixels[i] && p.pixels[i])
      throw Error("Garment artwork extends outside its declared ownership.");
    alpha[(i - 3) / 4] = mask.pixels[i];
  }
  return { patch: p, ownership: alpha };
}

/** Internal synchronous preview accessor. A preview decode is NOT a strict
 * import validation; that distinction remains attached to the cached entry. */
export function decodedGarmentPage(
  key: string,
  patch: Uint8Array,
  ownership: Uint8Array,
  dimensions: { width: number; height: number },
): DecodedGarmentPage {
  const entry = pages.get(key) ?? {
    image: decodePage(patch, ownership, dimensions),
    strict: false,
  };
  remember(key, entry);
  return entry.image;
}

/** Own pixels are replacement RGBA, including transparent removal pixels.
 * Passing a verified ZIP/page key lets the compositor reuse this exact decode.
 * Standalone callers validate bytes without sharing a cache identity. */
export async function validateGarmentPage(
  patch: Uint8Array,
  ownership: Uint8Array,
  dimensions: { width: number; height: number },
  verifiedKey?: string,
): Promise<void> {
  checkPageHeader(patch, dimensions.width, dimensions.height);
  checkPageHeader(ownership, dimensions.width, dimensions.height);
  const cached = verifiedKey ? pages.get(verifiedKey) : undefined;
  if (cached?.strict) {
    remember(verifiedKey!, cached);
    return;
  }
  // Never promote a shallow preview to an import/persistence success without
  // static-PNG and complete compression-stream validation.
  await strictPngCompression(patch, dimensions.width, dimensions.height);
  await strictPngCompression(ownership, dimensions.width, dimensions.height);
  const image = cached?.image ?? decodePage(patch, ownership, dimensions);
  if (verifiedKey) remember(verifiedKey, { image, strict: true });
}
