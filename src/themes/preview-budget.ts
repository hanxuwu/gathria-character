export const THEME_PREVIEW_MAX_PIXELS = 4 * 1024 * 1024;
export const THEME_PREVIEW_MAX_DIMENSION = 4096;

/** Presentation-only allocation budget. Oversized valid native files remain
 * available to export; preview never silently downsamples their artwork. */
export function themePreviewCanvasAvailable(
  width: number,
  height: number,
): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= THEME_PREVIEW_MAX_DIMENSION &&
    height <= THEME_PREVIEW_MAX_DIMENSION &&
    width * height <= THEME_PREVIEW_MAX_PIXELS
  );
}

/** A normalized smooth reference is drawn straight from its source at the
 * requested display resolution. Pixel art and native previews keep their
 * original backing pixels; display zoom never changes exported artwork. */
export function themePreviewBacking(
  width: number,
  height: number,
  pixelArt: boolean,
  referenceScale: number | undefined,
  displayScale: number,
): { width: number; height: number; scale: number; available: boolean } {
  const scale =
    !pixelArt &&
    referenceScale !== undefined &&
    referenceScale !== 1 &&
    displayScale > 1
      ? displayScale
      : 1;
  const backingWidth = width * scale,
    backingHeight = height * scale;
  return {
    width: backingWidth,
    height: backingHeight,
    scale,
    available: themePreviewCanvasAvailable(backingWidth, backingHeight),
  };
}
