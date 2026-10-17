import type {
  PlaybackAnimationName,
  CharacterPackManifest,
  Facing,
  SpriteFrame,
} from "../core/types";

/** Select a frame using only the timing and frame ids supplied by a pack. */
export function frameAtTime(
  manifest: CharacterPackManifest,
  animationName: PlaybackAnimationName,
  elapsedMs: number,
): SpriteFrame {
  const animation = manifest.animations[animationName];
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
  manifest: CharacterPackManifest,
  animationName: PlaybackAnimationName,
  elapsedMs: number,
): boolean {
  const animation = manifest.animations[animationName];
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
  manifest: CharacterPackManifest,
  frame: SpriteFrame,
  facing: Facing,
  zoom: number,
  attachment: { x: number; y: number },
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  context.translate(attachment.x, attachment.y);
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
