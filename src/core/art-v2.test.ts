import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ART_V2_DEFAULT_CONFIG as DEFAULT_CONFIG,
  OUTFIT_PRESETS,
  ART_V2_PRESETS as PRESETS,
  configToJson,
  parseCharacterConfig,
  upgradeToArtV2,
} from "./config";
import { generateCharacter } from "./generator";
import { readCharacterPackArchive, validateManifest } from "./pack";
import type { ArtV2CharacterConfig, GeneratedCharacter } from "./types";

function hash(pixels: Uint8Array | Uint8ClampedArray) {
  return createHash("sha256").update(pixels).digest("hex");
}

function framePixels(pack: GeneratedCharacter, id: number) {
  const frame = pack.manifest.frames.find((candidate) => candidate.id === id)!;
  const pixels = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++) {
    const offset = ((frame.y + y) * pack.width + frame.x) * 4;
    pixels.set(
      pack.pixels.subarray(offset, offset + frame.width * 4),
      y * frame.width * 4,
    );
  }
  return pixels;
}

function silhouette(pixels: Uint8ClampedArray) {
  return pixels.filter((_, index) => index % 4 === 3);
}

// These SHA-256 values were independently captured by decoding the checked-in
// MVP PNGs to RGBA before implementing V2 (reviewed MVP commit 4785afa).
// They are deliberately not recomputed from the current generator at test time.
const LEGACY_RGBA_HASHES = {
  mira: "4c28c6d8616a2b6cae78269b3ddbbcac7792d3c48c45b37a855216d0d3021d4d",
  rowan: "3166b1ed411b4ac32a350a93ac32371ccd05c2d624f2c845cd44509fc213db91",
  jun: "c3363502177ee31ef0cdde9918e5c6ae5e3ac9c9ce309796b100a84effcad865",
};

// Captured from the published c9505f0 PNGs before introducing detailed artwork.
// Keep original V2 exports and these fixed hashes as independent compatibility evidence.
const ART_V2_RGBA_HASHES = {
  mira: "a63d2c95ddd29510c780b783788364ba017bcfa400be28e993693e04eef2c08d",
  rowan: "b596baf2039f23604123c8970b8aec3007301e6783e8a8150b8ca19920a46cce",
  jun: "aacb574197597cd6fdb636406e1d3b4734febae4a40244e6247ba5ba9f7bb60a",
  "mira-casual":
    "31b04b3a1c4ff64f3030edc5de2c21fb84d11c850062b15c4a8f3fa457d13603",
  "mira-wedding-suit":
    "b41fd9eabf4508f38576c8f360d8cb7146931f22a21fbaef99ca087d7b7dcbbd",
  "mira-wedding-dress":
    "379a9b9004cbed007e46980da0ac281fe167b4618cd64b7c95175ee7138d3af9",
};

// Focus on garment boundaries that differ from the coordinated outfit presets:
// a short sleeve over the long hem, bare arms with shorts, and a suit over a skirt.
const OUTFIT_CASES = [
  ...OUTFIT_PRESETS,
  {
    label: "mohawk, tee, and long dress",
    appearance: {
      hairstyle: "mohawk" as const,
      upperClothing: "tee" as const,
      lowerClothing: "dress" as const,
    },
  },
  {
    label: "bob, bodice, and shorts",
    appearance: {
      hairstyle: "bob" as const,
      upperClothing: "bodice" as const,
      lowerClothing: "shorts" as const,
    },
  },
  {
    label: "crop, suit, and skirt",
    appearance: {
      hairstyle: "crop" as const,
      upperClothing: "suit" as const,
      lowerClothing: "skirt" as const,
    },
  },
];

describe("artwork version compatibility", () => {
  it.each(Object.entries(ART_V2_RGBA_HASHES))(
    "reopens %s's published V2 configuration with pixel-exact output",
    (id, expectedHash) => {
      const json = readFileSync(
        new URL(
          `../../public/samples/v2/${id}/character.json`,
          import.meta.url,
        ),
        "utf8",
      );
      const config = parseCharacterConfig(JSON.parse(json));
      const generated = generateCharacter(config);
      expect(config).toMatchObject({ schemaVersion: 2, artworkVersion: 2 });
      expect(JSON.parse(configToJson(config))).toEqual(JSON.parse(json));
      expect(generated.manifest.generator).toBe("gathria-warm-pixels-v2");
      expect(hash(generated.pixels)).toBe(expectedHash);
      const original = readCharacterPackArchive(
        new Uint8Array(
          readFileSync(
            new URL(
              `../../public/samples/v2/${id}.character.zip`,
              import.meta.url,
            ),
          ),
        ),
      );
      expect(original.config).toEqual(config);
      expect(original.manifest).toEqual(generated.manifest);
    },
  );

  it.each(Object.entries(LEGACY_RGBA_HASHES))(
    "reopens %s's original configuration with pixel-exact V1 output",
    (id, expectedHash) => {
      const json = readFileSync(
        new URL(`../../public/samples/${id}/character.json`, import.meta.url),
        "utf8",
      );
      const config = parseCharacterConfig(JSON.parse(json));
      const generated = generateCharacter(config);
      expect(config.schemaVersion).toBe(1);
      expect(JSON.parse(configToJson(config))).toEqual(JSON.parse(json));
      expect(generated.manifest.generator).toBe("gathria-original-pixels-v1");
      expect(hash(generated.pixels)).toBe(expectedHash);
      const original = readCharacterPackArchive(
        new Uint8Array(
          readFileSync(
            new URL(
              `../../public/samples/${id}.character.zip`,
              import.meta.url,
            ),
          ),
        ),
      );
      expect(original.config).toEqual(config);
      expect(original.manifest).toEqual(generated.manifest);
      const upgraded = upgradeToArtV2(config);
      expect(upgraded).toMatchObject({
        schemaVersion: 2,
        artworkVersion: 2,
        name: config.name,
      });
      expect(hash(generateCharacter(upgraded).pixels)).not.toBe(expectedHash);
      // Making a V2 copy never modifies the caller's original saved design.
      expect(config).toEqual(JSON.parse(json));
    },
  );
});

describe("warm pixel artwork V2", () => {
  it.each(PRESETS)(
    "deterministically generates $label with the existing pack geometry",
    ({ config }) => {
      const frozen = Object.freeze({ ...config });
      const generated = generateCharacter(frozen);
      const reopened = generateCharacter(
        parseCharacterConfig(JSON.parse(configToJson(config))),
      );
      expect(generated.pixels).toEqual(reopened.pixels);
      expect(generated.manifest).toEqual(reopened.manifest);
      expect(generated.manifest.generator).toBe("gathria-warm-pixels-v2");
      expect(validateManifest(generated.manifest)).toEqual(generated.manifest);
      expect([generated.width, generated.height]).toEqual([384, 128]);
      expect(generated.manifest.spritesheet).toMatchObject({
        frameWidth: 48,
        frameHeight: 64,
      });
      expect(generated.manifest.anchor).toEqual({
        x: 24,
        y: 60,
        units: "pixels",
        origin: "top-left",
      });
      expect(generated.manifest.facing).toEqual({
        native: "right",
        right: "none",
        left: "mirror-x",
      });
      expect(new Set(generated.manifest.animations.idle.frames).size).toBe(4);
      expect(generated.manifest.animations.walk.frames).toHaveLength(8);
      expect(frozen).toEqual(config);
      // The unused second half of the idle row must remain transparent.
      for (let y = 0; y < 64; y++) {
        expect(
          generated.pixels
            .subarray((y * 384 + 192) * 4, (y * 384 + 384) * 4)
            .every((byte) => byte === 0),
        ).toBe(true);
      }
    },
  );

  it("has three distinct face silhouettes with identical hair, colors, and clothing", () => {
    const faces = (["heart", "oval", "round"] as const).map((faceVariant) => {
      const generated = generateCharacter({
        ...DEFAULT_CONFIG,
        hairstyle: "crop",
        faceVariant,
      });
      return framePixels(generated, 0).slice(8 * 48 * 4, 32 * 48 * 4);
    });
    expect(new Set(faces.map(hash)).size).toBe(3);
    expect(new Set(faces.map((face) => hash(silhouette(face)))).size).toBe(3);
  });

  it.each([
    ...PRESETS,
    {
      label: "mohawk",
      config: { ...DEFAULT_CONFIG, hairstyle: "mohawk" as const },
    },
  ])(
    "preserves $label's face and hairstyle through every walk frame",
    ({ config }) => {
      const generated = generateCharacter(config);
      const reference = framePixels(generated, 4).slice(
        3 * 48 * 4,
        32 * 48 * 4,
      );
      const bobs = [0, -1, -1, 0, 0, -1, -1, 0];
      for (let index = 0; index < 8; index++) {
        const frame = framePixels(generated, index + 4);
        expect(
          hash(
            frame.slice(
              (3 + bobs[index]) * 48 * 4,
              (32 + bobs[index]) * 48 * 4,
            ),
          ),
          `walk frame ${index + 4} must keep the same portrait`,
        ).toBe(hash(reference));
      }
      for (const sequence of Object.values(generated.manifest.animations)) {
        const drawingIds = [...new Set(sequence.frames)];
        expect(
          new Set(drawingIds.map((id) => hash(framePixels(generated, id))))
            .size,
        ).toBe(drawingIds.length);
      }
    },
  );

  it.each(OUTFIT_CASES)(
    "keeps $label clothing connected, inside the frame, and grounded across idle and walk",
    ({ appearance }) => {
      const generated = generateCharacter({
        ...DEFAULT_CONFIG,
        ...appearance,
      } as ArtV2CharacterConfig);
      for (const { id } of generated.manifest.frames) {
        const pixels = framePixels(generated, id);
        const mask = silhouette(pixels);
        const occupied = [...mask.keys()].filter((index) => mask[index] !== 0);
        expect([...new Set(mask)].sort()).toEqual([0, 255]);
        expect(
          Math.min(...occupied.map((index) => index % 48)),
        ).toBeGreaterThan(1);
        expect(Math.max(...occupied.map((index) => index % 48))).toBeLessThan(
          46,
        );
        expect(
          Math.min(...occupied.map((index) => Math.floor(index / 48))),
        ).toBeGreaterThan(1);
        expect(
          Math.max(...occupied.map((index) => Math.floor(index / 48))),
        ).toBe(59);

        // A detached hand, shoe, or garment is a separate opaque component. Use
        // eight-neighbor pixel connectivity so intentional diagonal edges count.
        const seen = new Set<number>([occupied[0]]);
        const pending = [occupied[0]];
        while (pending.length) {
          const point = pending.pop()!;
          const x = point % 48;
          const y = Math.floor(point / 48);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= 48 || ny < 0 || ny >= 64) continue;
              const neighbor = ny * 48 + nx;
              if (mask[neighbor] && !seen.has(neighbor)) {
                seen.add(neighbor);
                pending.push(neighbor);
              }
            }
          }
        }
        expect(seen.size, `frame ${id} has a detached opaque component`).toBe(
          occupied.length,
        );

        // Every body row connects from the neckline through the garment to the
        // legs; a full-width tear in a walking dress cannot pass this check.
        for (let y = 28; y <= 57; y++) {
          expect(
            mask.subarray(y * 48 + 12, y * 48 + 37).some(Boolean),
            `frame ${id}, body row ${y}`,
          ).toBe(true);
        }
      }
    },
  );
});
