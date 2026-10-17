import { parseCharacterConfig } from "./config";
import { cohesiveBank } from "./cohesive-rig";
import { prepareCohesiveRig } from "./cohesive-rig";
import type {
  ArtV5CharacterConfig,
  GeneratedCharacter,
  CharacterPackManifest,
} from "./types";
export const ART_V5_GENERATOR_ID = "gathria-cohesive-pixels-v5";
const W = 192,
  H = 256;

/** Offline illustrated production assets, explicit material masks and a fixed rig.
 * Generation is synchronous and deterministic; no image/AI service runs here. */
export function generateArtV5(value: ArtV5CharacterConfig): GeneratedCharacter {
  const config = parseCharacterConfig(value);
  if (config.schemaVersion !== 2 || config.artworkVersion !== 5)
    throw new Error("Cohesive artwork requires explicit artworkVersion 5.");
  const width = W * 8,
    height = H * 2;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const frames: CharacterPackManifest["frames"] = [];
  const drawFrame = prepareCohesiveRig(cohesiveBank(config), config);
  for (const animation of ["idle", "walk"] as const) {
    const count = animation === "idle" ? 4 : 8,
      row = animation === "idle" ? 0 : 1;
    for (let frame = 0; frame < count; frame++) {
      const framePixels = drawFrame(animation, frame);
      for (let y = 0; y < H; y++)
        pixels.set(
          framePixels.subarray(y * W * 4, (y + 1) * W * 4),
          ((row * H + y) * width + frame * W) * 4,
        );
      frames.push({
        id: row === 0 ? frame : frame + 4,
        x: frame * W,
        y: row * H,
        width: W,
        height: H,
      });
    }
  }
  return {
    width,
    height,
    pixels,
    manifest: {
      schemaVersion: 1,
      format: "gathria-character-pack",
      name: config.name,
      generator: ART_V5_GENERATOR_ID,
      spritesheet: {
        file: "spritesheet.png",
        width,
        height,
        frameWidth: W,
        frameHeight: H,
        columns: 8,
        rows: 2,
      },
      frames,
      animations: {
        idle: {
          frames: [
            0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 2, 3, 2, 0, 0,
            0,
          ],
          fps: 8,
          loop: true,
        },
        walk: { frames: [4, 5, 6, 7, 8, 9, 10, 11], fps: 10, loop: true },
      },
      facing: { native: "right", right: "none", left: "mirror-x" },
      anchor: { x: 96, y: 240, units: "pixels", origin: "top-left" },
      scale: { pixelArt: true, recommended: 1, integerOnly: true },
      configuration: "character.json",
    },
  };
}
