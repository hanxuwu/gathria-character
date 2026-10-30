import {
  checkPageHeader,
  decodeGarmentPage,
  type DecodedGarmentPage,
} from "./garment-page-codec";
import { prepareGarmentPage } from "./garment-page-preparation";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
export { checkPageHeader, type DecodedGarmentPage } from "./garment-page-codec";

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

/** Internal synchronous preview accessor. A preview decode is NOT a strict
 * import validation; that distinction remains attached to the cached entry. */
export function decodedGarmentPage(
  key: string,
  patch: Uint8Array,
  ownership: Uint8Array,
  dimensions: { width: number; height: number },
): DecodedGarmentPage {
  const entry = pages.get(key) ?? {
    image: decodeGarmentPage(patch, ownership, dimensions),
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
  options: SourcePreparationOptions = {},
): Promise<void> {
  assertSourcePreparationActive(options);
  checkPageHeader(patch, dimensions.width, dimensions.height);
  checkPageHeader(ownership, dimensions.width, dimensions.height);
  const cached = verifiedKey ? pages.get(verifiedKey) : undefined;
  if (cached?.strict) {
    remember(verifiedKey!, cached);
    return;
  }
  // Never promote a shallow preview to an import/persistence success without
  // static-PNG and complete compression-stream validation.
  const image = await prepareGarmentPage(patch, ownership, dimensions, options);
  assertSourcePreparationActive(options);
  if (verifiedKey) remember(verifiedKey, { image, strict: true });
}
