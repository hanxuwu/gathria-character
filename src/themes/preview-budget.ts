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
