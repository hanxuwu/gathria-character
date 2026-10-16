import { parseCharacterConfig } from "./config";
import { generateArtV6 } from "./generator-v6";
import { polishedBank } from "./polished-rig";
import { prepareRunningRig, RUN_FRAME_COUNT, RUN_FPS } from "./running-rig";
import type { ArtV6CharacterConfig, GeneratedCharacter } from "./types";

export const MOTION_V1_GENERATOR_ID = "gathria-polished-pixels-v6-motion-v1";
const W = 192,
  H = 256,
  COLUMNS = 8;

/** Append run poses to the original V6 atlas without touching either legacy row. */
export function generateMotionV1(
  value: ArtV6CharacterConfig,
): GeneratedCharacter {
  const config = parseCharacterConfig(value);
  if (
    config.schemaVersion !== 2 ||
    config.artworkVersion !== 6 ||
    config.motionVersion !== 1
  )
    throw new Error(
      "Running requires artworkVersion 6 and explicit motionVersion 1.",
    );
  const legacy = generateArtV6(config);
  const width = W * COLUMNS;
  const rows = 2 + Math.ceil(RUN_FRAME_COUNT / COLUMNS);
  const height = H * rows;
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.set(legacy.pixels);
  const frames = legacy.manifest.frames.map((frame) => ({ ...frame }));
  const drawFrame = prepareRunningRig(polishedBank(config), config);
  const runIds: number[] = [];
  for (let index = 0; index < RUN_FRAME_COUNT; index++) {
    const x = (index % COLUMNS) * W;
    const y = (2 + Math.floor(index / COLUMNS)) * H;
    const rgba = drawFrame(index);
    if (rgba.length !== W * H * 4)
      throw new Error("Running rig returned an invalid frame size.");
    for (let row = 0; row < H; row++)
      pixels.set(
        rgba.subarray(row * W * 4, (row + 1) * W * 4),
        ((y + row) * width + x) * 4,
      );
    const id = 12 + index;
    runIds.push(id);
    frames.push({ id, x, y, width: W, height: H });
  }
  return {
    width,
    height,
    pixels,
    manifest: {
      ...legacy.manifest,
      generator: MOTION_V1_GENERATOR_ID,
      spritesheet: { ...legacy.manifest.spritesheet, height, rows },
      frames,
      animations: {
        ...legacy.manifest.animations,
        run: { frames: runIds, fps: RUN_FPS, loop: true },
      },
    },
  };
}
