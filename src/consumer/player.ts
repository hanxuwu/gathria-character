import type { LoadedCharacterImage, LoadedCharacterPack } from "../core/pack";
import type {
  PortableAnimationName,
  Animation,
  PortableCharacterPackManifest,
  Facing,
  SpriteFrame,
} from "../core/types";

/** Describe the supplied artwork without changing its portable metadata. */
export function bakedPlaybackLabel(
  manifest: Pick<PortableCharacterPackManifest, "schemaVersion" | "generator">,
  {
    modifiedActions = false,
    motionStudy = false,
    keyframeStudy = false,
  }: {
    modifiedActions?: boolean;
    motionStudy?: boolean;
    keyframeStudy?: boolean;
  } = {},
): string {
  if (manifest.schemaVersion === 4) {
    const sourceDerived =
      manifest.generator === "gathria-offline-source-pixel-study-v1" ||
      manifest.generator === "gathria-offline-source-pixel-full-v1";
    const artwork = sourceDerived
      ? "Source-derived pixel artwork"
      : "Authored pixel artwork";
    return `${artwork} · ${modifiedActions ? "edited action settings" : "baked playback"}`;
  }
  return `Original artwork · ${
    modifiedActions
      ? "edited action settings"
      : motionStudy
        ? "motion & transitions study"
        : keyframeStudy
          ? "keyframe loop study"
          : "baked playback"
  }`;
}

/** Only actions declared by a native source pack are available. */
export function animationFor(
  manifest: PortableCharacterPackManifest,
  name: PortableAnimationName,
): Animation | undefined {
  return manifest.animations[name];
}

/** Select a frame using only the timing and frame ids supplied by a pack. */
export function frameAtTime(
  manifest: PortableCharacterPackManifest,
  animationName: PortableAnimationName,
  elapsedMs: number,
): SpriteFrame {
  const animation = animationFor(manifest, animationName);
  if (!animation) {
    throw new Error(
      `Animation ${animationName} is not available in this pack.`,
    );
  }
  const position = Math.floor((Math.max(0, elapsedMs) * animation.fps) / 1000);
  const index = animation.loop
    ? position % animation.frames.length
    : Math.min(position, animation.frames.length - 1);
  const frame = manifest.frames.find(
    (candidate) => candidate.id === animation.frames[index],
  );
  if (!frame)
    throw new Error(
      `Animation ${animationName} references an unavailable frame.`,
    );
  return frame;
}

/** A one-shot holds its final frame after every declared entry has elapsed. */
export function animationHasEnded(
  manifest: PortableCharacterPackManifest,
  animationName: PortableAnimationName,
  elapsedMs: number,
): boolean {
  const animation = animationFor(manifest, animationName);
  if (!animation)
    throw new Error(
      `Animation ${animationName} is not available in this pack.`,
    );
  return (
    !animation.loop &&
    elapsedMs >= (animation.frames.length * 1000) / animation.fps
  );
}

/** Flipping around the attachment point also mirrors an asymmetric anchor. */
export function drawCharacterFrame(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  manifest: PortableCharacterPackManifest,
  frame: SpriteFrame,
  facing: Facing,
  zoom: number,
  attachment: { x: number; y: number },
): void {
  if (manifest.scale.integerOnly && (!Number.isSafeInteger(zoom) || zoom < 1))
    throw new Error(
      "Pixel CharacterPack display zoom must be a positive integer.",
    );
  context.save();
  context.imageSmoothingEnabled = !manifest.scale.pixelArt;
  context.imageSmoothingQuality = "high";
  context.translate(
    manifest.scale.pixelArt ? Math.round(attachment.x) : attachment.x,
    manifest.scale.pixelArt ? Math.round(attachment.y) : attachment.y,
  );
  context.scale(manifest.facing[facing] === "mirror-x" ? -zoom : zoom, zoom);
  context.drawImage(
    image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    -manifest.anchor.x,
    -manifest.anchor.y,
    frame.width,
    frame.height,
  );
  context.restore();
}

/** A pixel pack never falls back to sub-native smooth rendering to fit a narrow
 * viewport. The player uses a scrollable stage for that case. */
export const PIXEL_STAGE_MAX_PIXELS = 4 * 1024 * 1024;
export const PIXEL_STAGE_MAX_DIMENSION = 4096;

/** Pixel stages use one backing pixel per CSS pixel, independent of device
 * density. Reject an over-budget native frame rather than allocating an enormous
 * canvas or silently reducing its artwork below native scale. */
export function pixelCharacterStage(
  manifest: PortableCharacterPackManifest,
  zoom: number,
  availableWidth = 640,
  comparison?: PortableCharacterPackManifest,
): { width: number; height: number; blocked: boolean; backingRatio: 1 } {
  const viewportWidth = Number.isFinite(availableWidth)
    ? Math.max(240, Math.min(2048, Math.round(availableWidth)))
    : 640;
  const height = Math.max(
    420,
    Math.max(
      manifest.spritesheet.frameHeight,
      comparison?.spritesheet.frameHeight ?? 0,
    ) *
      zoom +
      100,
  );
  const width = Math.max(
    viewportWidth,
    2 *
      Math.max(
        manifest.anchor.x,
        manifest.spritesheet.frameWidth - manifest.anchor.x,
        comparison?.anchor.x ?? 0,
        comparison
          ? comparison.spritesheet.frameWidth - comparison.anchor.x
          : 0,
      ) *
      zoom *
      (comparison ? 2 : 1) +
      48,
  );
  const blocked =
    !Number.isSafeInteger(zoom) ||
    zoom < 1 ||
    zoom > 16 ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width > PIXEL_STAGE_MAX_DIMENSION ||
    height > PIXEL_STAGE_MAX_DIMENSION ||
    width * height > PIXEL_STAGE_MAX_PIXELS;
  return blocked
    ? {
        width: Math.min(viewportWidth, 960),
        height: 420,
        blocked: true,
        backingRatio: 1,
      }
    : { width, height, blocked: false, backingRatio: 1 };
}

export function initialCharacterZoom(
  manifest: PortableCharacterPackManifest,
  availableWidth: number,
  availableHeight = 512,
): number {
  const candidates = manifest.scale.integerOnly
    ? Array.from({ length: 16 }, (_, i) => i + 1)
    : [0.25, 0.5, 0.75, 1];
  return (
    candidates
      .filter(
        (value) =>
          value <= manifest.scale.recommended &&
          value * manifest.spritesheet.frameHeight <= availableHeight &&
          value * manifest.spritesheet.frameWidth <= availableWidth &&
          (!manifest.scale.integerOnly ||
            !pixelCharacterStage(manifest, value, availableWidth).blocked),
      )
      .at(-1) ?? (manifest.scale.integerOnly ? 1 : 0.25)
  );
}

export function characterZoomChoices(
  manifest: PortableCharacterPackManifest | undefined,
  zoom: number,
  availableWidth = 640,
  comparison?: PortableCharacterPackManifest,
): number[] {
  const candidates = manifest?.scale.integerOnly
    ? [1, 2, 3, 4, manifest.scale.recommended, zoom]
    : [0.25, 0.5, 0.75, 1, 1.5, 2, zoom];
  return [...new Set(candidates)]
    .filter(
      (value) =>
        !manifest?.scale.integerOnly ||
        (Number.isSafeInteger(value) &&
          value >= 1 &&
          value <= 16 &&
          !pixelCharacterStage(manifest, value, availableWidth, comparison)
            .blocked),
    )
    .sort((a, b) => a - b);
}

/** Select the declared page; a missing page must never fall back to unrelated art. */
export function imageForFrame(
  pack: Pick<LoadedCharacterPack, "manifest" | "image" | "images">,
  frame: SpriteFrame,
): LoadedCharacterImage {
  if (pack.manifest.schemaVersion === 2) return pack.image;
  const image =
    frame.page === undefined ? undefined : pack.images?.[frame.page];
  if (!image)
    throw new Error(
      `Image page ${frame.page} is unavailable for frame ${frame.id}.`,
    );
  return image;
}
