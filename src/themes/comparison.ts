import type { Facing, PortableCharacterPackManifest } from "../core/types";
import type { LoadedCharacterPack } from "../core/pack";

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

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function pair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(integer);
}

/** Use the declared source scale only when its provenance and complete geometry
 * match this actual reference archive. Other themes retain height normalization. */
export function sourcePixelComparisonScale(
  current: Pick<LoadedCharacterPack, "manifest" | "config">,
  original: Pick<LoadedCharacterPack, "manifest">,
  originalArchiveSha256: string,
): number | undefined {
  const manifest = current.manifest;
  const metadata = object(current.config?.sourceMetadata?.sourcePixelFull);
  if (
    manifest.schemaVersion !== 4 ||
    manifest.generator !== "gathria-offline-source-pixel-full-v1" ||
    !manifest.scale.pixelArt ||
    !manifest.scale.integerOnly ||
    original.manifest.scale.pixelArt ||
    original.manifest.scale.integerOnly ||
    !/^[a-f0-9]{64}$/.test(originalArchiveSha256) ||
    current.config?.source.sha256 !== originalArchiveSha256 ||
    !metadata ||
    metadata.version !== 1 ||
    metadata.method !== "fixed-premultiplied-box4-shared128-v1" ||
    metadata.sourceDivisor !== 4 ||
    metadata.sourceSha256 !== originalArchiveSha256
  )
    return undefined;
  const source = original.manifest;
  const sourceSize = metadata.sourceSize;
  const nativeFrame = metadata.nativeFrame;
  const paddedSize = metadata.paddedSourceSize;
  const sourceAnchor = object(metadata.sourceAnchor);
  const anchor = object(metadata.anchor);
  const padding = object(metadata.sourcePadding);
  const transform = object(metadata.bodyTransform);
  if (
    !pair(sourceSize) ||
    !pair(nativeFrame) ||
    !pair(paddedSize) ||
    sourceSize.some((value) => value === 0) ||
    nativeFrame.some((value) => value === 0) ||
    !sourceAnchor ||
    !anchor ||
    !padding ||
    !transform ||
    !integer(padding.left) ||
    !integer(padding.top) ||
    !integer(padding.right) ||
    !integer(padding.bottom) ||
    !integer(sourceAnchor.x) ||
    !integer(sourceAnchor.y) ||
    !integer(anchor.x) ||
    !integer(anchor.y) ||
    sourceAnchor.units !== "pixels" ||
    sourceAnchor.origin !== "top-left" ||
    anchor.units !== "pixels" ||
    anchor.origin !== "top-left" ||
    sourceAnchor.x > sourceSize[0] ||
    sourceAnchor.y > sourceSize[1] ||
    anchor.x > nativeFrame[0] ||
    anchor.y > nativeFrame[1] ||
    sourceSize[0] !== source.spritesheet.frameWidth ||
    sourceSize[1] !== source.spritesheet.frameHeight ||
    sourceAnchor.x !== source.anchor.x ||
    sourceAnchor.y !== source.anchor.y ||
    nativeFrame[0] !== manifest.spritesheet.frameWidth ||
    nativeFrame[1] !== manifest.spritesheet.frameHeight ||
    anchor.x !== manifest.anchor.x ||
    anchor.y !== manifest.anchor.y ||
    paddedSize[0] !== sourceSize[0] + padding.left + padding.right ||
    paddedSize[1] !== sourceSize[1] + padding.top + padding.bottom ||
    nativeFrame[0] * 4 !== paddedSize[0] ||
    nativeFrame[1] * 4 !== paddedSize[1] ||
    anchor.x * 4 !== sourceAnchor.x + padding.left ||
    anchor.y * 4 !== sourceAnchor.y + padding.top ||
    transform.scaleNumerator !== 1 ||
    transform.scaleDenominator !== 4 ||
    !pair(transform.translateSourcePixels) ||
    transform.translateSourcePixels[0] !== padding.left ||
    transform.translateSourcePixels[1] !== padding.top
  )
    return undefined;
  return 1 / 4;
}

/** Only a bounded presentation view is normalized. Neither accepted archive nor
 * native frame export is resized. Valid independent packs can have an excessive
 * union when their anchors differ; report that instead of allocating it. */
export function createThemeComparisonPlanes(
  current: Geometry,
  original: Geometry,
  facing: Facing,
  referenceScale?: number,
): ThemeComparisonPlanes {
  const ratio =
    referenceScale ??
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
