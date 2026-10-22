import { strToU8, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../core/baked-source";
import type { WardrobeRegistration } from "../wardrobe/contract";
import {
  APPEARANCE_ANCHORS,
  type AppearanceBankManifest,
  type AppearancePose,
} from "./contract";

export function appearanceFixture(
  registration: WardrobeRegistration,
  registrationSha256: string,
) {
  const rect = { x: 0, y: 0, width: 2, height: 2 };
  const box = (x: number, y: number, width: number, height: number) => [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  const manifest: AppearanceBankManifest = {
    format: "gathria-sprite-appearance-bank",
    version: 1,
    id: "head-fixture",
    name: "Head fixture",
    sourceSha256: registration.sourceSha256,
    registrationSha256,
    characterId: registration.characterId,
    frameWidth: registration.frameWidth,
    frameHeight: registration.frameHeight,
    padding: { left: 2, top: 2, right: 2, bottom: 0 },
    poses: registration.frames.map((frame) => ({
      frameId: frame.frameId,
      sourceFrame: frame.sourceFrame,
      anchors: Object.fromEntries(
        APPEARANCE_ANCHORS.map((key) => [key, { x: 3, y: 1 }]),
      ) as AppearancePose["anchors"],
      headBounds: { x: 1, y: 0, width: 5, height: 3 },
      facePolygon: box(2, 0, 3, 2),
      hairBounds: { x: 0, y: -2, width: 7, height: 5 },
      foreground: [box(6, 1, 1, 1)],
    })),
    pages: [
      {
        file: "patches-0.png",
        maskFile: "ownership-0.png",
        width: 2,
        height: 2,
      },
    ],
    styles: [
      {
        id: "soft-crop",
        name: "Soft crop",
        slot: "hair",
        layers: [
          {
            role: "hair-front",
            frames: registration.frames.map((frame) => ({
              frameId: frame.frameId,
              mode: "paint",
              page: 0,
              rect: { ...rect },
              offset: { x: 2, y: -1 },
            })),
          },
        ],
      },
      {
        id: "gentle",
        name: "Gentle",
        slot: "face",
        layers: [
          {
            role: "face",
            frames: registration.frames.map((frame, i) =>
              i === 0
                ? {
                    frameId: frame.frameId,
                    mode: "paint",
                    page: 0,
                    rect: { ...rect },
                    offset: { x: 2, y: 0 },
                  }
                : {
                    frameId: frame.frameId,
                    mode: "source",
                    reason: "Original blink or laugh retained",
                  },
            ),
          },
        ],
      },
    ],
    provenance: "Authored test fixture, not generated user character artwork.",
  };
  const pixels = new Uint8Array(
    Array.from({ length: 4 }, () => [120, 80, 50, 255]).flat(),
  );
  const ownership = new Uint8Array(
    Array.from({ length: 4 }, () => [0, 0, 0, 255]).flat(),
  );
  const png = (pixels: Uint8Array) =>
    encodeSourceRgbaPng({ width: 2, height: 2, pixels, colorChunks: [] });
  const files = {
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "patches-0.png": png(pixels),
    "ownership-0.png": png(ownership),
  };
  return { manifest, pixels, ownership, png, files, bytes: zipSync(files) };
}
