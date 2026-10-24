import type { Facing, PortableCharacterPackManifest } from "../core/types";

export interface ComparisonPlane {
  width: number;
  height: number;
  anchor: { x: number; y: number };
  sourceScale: number;
  integerDisplay: boolean;
}
type Geometry = Pick<
  PortableCharacterPackManifest,
  "spritesheet" | "anchor" | "scale"
>;
export const THEME_COMPARISON_MAX_PIXELS = 4_194_304;
export const THEME_COMPARISON_MAX_DIMENSION = 8192;
export type ThemeComparisonPlanes =
  | { planes: [ComparisonPlane, ComparisonPlane]; unavailable: null }
  | { planes: null; unavailable: string };

/** Only a bounded presentation view is normalized. Neither accepted archive nor
 * native frame export is resized. Valid independent packs can have an excessive
 * union when their anchors differ; report that instead of allocating it. */
export function createThemeComparisonPlanes(
  current: Geometry,
  original: Geometry,
  facing: Facing,
): ThemeComparisonPlanes {
  const ratio =
    current.spritesheet.frameHeight / original.spritesheet.frameHeight;
  const left = Math.ceil(Math.max(current.anchor.x, original.anchor.x * ratio));
  const right = Math.ceil(
    Math.max(
      current.spritesheet.frameWidth - current.anchor.x,
      (original.spritesheet.frameWidth - original.anchor.x) * ratio,
    ),
  );
  const top = Math.ceil(Math.max(current.anchor.y, original.anchor.y * ratio));
  const bottom = Math.ceil(
    Math.max(
      current.spritesheet.frameHeight - current.anchor.y,
      (original.spritesheet.frameHeight - original.anchor.y) * ratio,
    ),
  );
  const width = left + right,
    height = top + bottom;
  if (
    !Number.isFinite(ratio) ||
    ratio <= 0 ||
    ![left, right, top, bottom, width, height].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    width < 1 ||
    height < 1 ||
    width > THEME_COMPARISON_MAX_DIMENSION ||
    height > THEME_COMPARISON_MAX_DIMENSION ||
    width * height > THEME_COMPARISON_MAX_PIXELS
  )
    return {
      planes: null,
      unavailable:
        "These frame sizes and anchors exceed the local comparison canvas limit. Native preview, playback and downloads remain available.",
    };
  if (original.scale.integerOnly && (!Number.isSafeInteger(ratio) || ratio < 1))
    return {
      planes: null,
      unavailable:
        "This reference requires integer pixel sampling and cannot be normalized to the selected theme's height. Native preview and downloads remain available.",
    };
  const shared = {
    width,
    height,
    anchor: { x: facing === "right" ? left : right, y: top },
    integerDisplay: current.scale.integerOnly,
  };
  return {
    planes: [
      { ...shared, sourceScale: 1 },
      { ...shared, sourceScale: ratio },
    ],
    unavailable: null,
  };
}
