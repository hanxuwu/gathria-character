import type { Animation, CharacterPackManifest } from "../core/types";

/** This descriptor is a proposed bridge, not a verified Gathria API. */
export const GATHRIA_COMPATIBILITY = {
  status: "UNVERIFIED",
  reason:
    "The Gathria runtime could not be inspected with the repository access available during development.",
} as const;

export interface ProposedGathriaCharacter {
  texture: string;
  frameSize: { width: number; height: number };
  atlas: { id: number; x: number; y: number; width: number; height: number }[];
  clips: Record<"idle" | "walk", ProposedClip> & { run?: ProposedClip };
  origin: { x: number; y: number };
  facing: { native: "right"; flipXForLeft: boolean };
  pixelArt: true;
}
interface ProposedClip {
  frameIds: number[];
  framesPerSecond: number;
  repeat: boolean;
}

/** Isolates the proposed field mapping until the actual Gathria loader is known. */
export function toProposedGathriaCharacter(
  manifest: CharacterPackManifest,
  texture: string = manifest.spritesheet.file,
): ProposedGathriaCharacter {
  const clip = (animation: Animation) => ({
    frameIds: [...animation.frames],
    framesPerSecond: animation.fps,
    repeat: animation.loop,
  });
  return {
    texture,
    frameSize: {
      width: manifest.spritesheet.frameWidth,
      height: manifest.spritesheet.frameHeight,
    },
    atlas: manifest.frames.map((frame) => ({ ...frame })),
    clips: {
      idle: clip(manifest.animations.idle),
      walk: clip(manifest.animations.walk),
      ...(manifest.animations.run
        ? { run: clip(manifest.animations.run) }
        : {}),
    },
    origin: {
      x: manifest.anchor.x / manifest.spritesheet.frameWidth,
      y: manifest.anchor.y / manifest.spritesheet.frameHeight,
    },
    facing: {
      native: manifest.facing.native,
      flipXForLeft: manifest.facing.left === "mirror-x",
    },
    pixelArt: manifest.scale.pixelArt,
  };
}
