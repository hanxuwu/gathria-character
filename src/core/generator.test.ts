import { describe, expect, it } from "vitest";
import {
  LEGACY_DEFAULT_CONFIG as DEFAULT_CONFIG,
  LEGACY_PRESETS as PRESETS,
} from "./config";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  generateCharacter,
  pixelGenerator,
} from "./generator";
import type { CharacterConfig, GeneratedCharacter } from "./types";

function framePixels(pack: GeneratedCharacter, id: number): Uint8ClampedArray {
  const frame = pack.manifest.frames.find((candidate) => candidate.id === id)!;
  const data = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let row = 0; row < frame.height; row++) {
    const offset = ((frame.y + row) * pack.width + frame.x) * 4;
    data.set(
      pack.pixels.subarray(offset, offset + frame.width * 4),
      row * frame.width * 4,
    );
  }
  return data;
}

function hash(data: Uint8ClampedArray): number {
  let value = 2166136261;
  for (const byte of data) value = Math.imul(value ^ byte, 16777619);
  return value >>> 0;
}

function hasColor(data: Uint8ClampedArray, hex: string): boolean {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let offset = 0; offset < data.length; offset += 4) {
    if (
      data[offset + 3] === 255 &&
      rgb.every((value, i) => value === data[offset + i])
    )
      return true;
  }
  return false;
}

describe("original pixel generator", () => {
  it("produces the same pixels and metadata for the same config without mutating it", () => {
    const config = Object.freeze({ ...DEFAULT_CONFIG });
    const first = pixelGenerator.generate(config);
    const second = generateCharacter(JSON.parse(JSON.stringify(config)));
    expect(first.pixels).toEqual(second.pixels);
    expect(first.manifest).toEqual(second.manifest);
    expect(first.manifest.generator).toBe("gathria-original-pixels-v1");
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("describes every occupied cell with explicit, unique frame IDs and a shared anchor", () => {
    const result = generateCharacter(DEFAULT_CONFIG);
    expect([result.width, result.height]).toEqual([384, 128]);
    expect(result.pixels.length).toBe(384 * 128 * 4);
    expect(result.manifest.frames).toHaveLength(12);
    for (let id = 0; id < 12; id++) {
      expect(result.manifest.frames[id]).toEqual({
        id,
        x: (id < 4 ? id : id - 4) * FRAME_WIDTH,
        y: id < 4 ? 0 : FRAME_HEIGHT,
        width: 48,
        height: 64,
      });
    }
    expect(result.manifest.animations.idle.frames).toEqual([0, 1, 2, 3]);
    expect(result.manifest.animations.walk.frames).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(result.manifest.anchor).toEqual({
      x: 24,
      y: 60,
      units: "pixels",
      origin: "top-left",
    });
    expect(result.manifest.facing).toEqual({
      native: "right",
      right: "none",
      left: "mirror-x",
    });
    for (let y = 0; y < 64; y++) {
      expect(
        result.pixels
          .slice((y * 384 + 192) * 4, (y * 384 + 384) * 4)
          .some((byte) => byte !== 0),
      ).toBe(false);
    }
  });

  it("preserves a transparent margin, opaque pixel edges, and the planted ground line for every outfit", () => {
    for (const hairstyle of ["crop", "bob", "waves", "mohawk"] as const) {
      for (const upperClothing of ["tee", "hoodie", "jacket"] as const) {
        for (const lowerClothing of ["trousers", "shorts", "skirt"] as const) {
          const result = generateCharacter({
            ...DEFAULT_CONFIG,
            hairstyle,
            upperClothing,
            lowerClothing,
          });
          for (const { id } of result.manifest.frames) {
            const pixels = framePixels(result, id);
            let minX = 48,
              minY = 64,
              maxX = 0,
              maxY = 0,
              opaque = 0;
            let invalidAlpha = false;
            for (let y = 0; y < 64; y++) {
              for (let x = 0; x < 48; x++) {
                const alpha = pixels[(y * 48 + x) * 4 + 3];
                if (alpha !== 0 && alpha !== 255) invalidAlpha = true;
                if (alpha) {
                  minX = Math.min(minX, x);
                  maxX = Math.max(maxX, x);
                  minY = Math.min(minY, y);
                  maxY = Math.max(maxY, y);
                  opaque++;
                }
              }
            }
            expect(invalidAlpha).toBe(false);
            expect(opaque).toBeGreaterThan(450);
            expect(minX).toBeGreaterThan(1);
            expect(maxX).toBeLessThan(46);
            expect(minY).toBeGreaterThan(1);
            expect(maxY).toBe(59);
          }
        }
      }
    }
  });

  it("animates four distinct idle drawings and eight distinct, coherent walk drawings", () => {
    const result = generateCharacter(DEFAULT_CONFIG);
    expect(
      new Set([0, 1, 2, 3].map((id) => hash(framePixels(result, id)))).size,
    ).toBe(4);
    expect(
      new Set(
        [4, 5, 6, 7, 8, 9, 10, 11].map((id) => hash(framePixels(result, id))),
      ).size,
    ).toBe(8);
    // Across every pose, all five chosen colors survive: animation never changes identity.
    for (const { id } of result.manifest.frames) {
      const pixels = framePixels(result, id);
      for (const color of [
        DEFAULT_CONFIG.skinTone,
        DEFAULT_CONFIG.hairColor,
        DEFAULT_CONFIG.upperColor,
        DEFAULT_CONFIG.lowerColor,
        DEFAULT_CONFIG.shoeColor,
      ]) {
        expect(hasColor(pixels, color)).toBe(true);
      }
    }
  });

  it("keeps the portrait identical through the gait after accounting for its one-pixel bob", () => {
    const result = generateCharacter(DEFAULT_CONFIG);
    const reference = framePixels(result, 4);
    const bobs = [0, -1, -1, 0, 0, -1, -1, 0];
    for (let index = 0; index < 8; index++) {
      const candidate = framePixels(result, index + 4);
      // Compare the entire hair / face area, including its transparent silhouette.
      const referenceHead = reference.slice(3 * 48 * 4, 28 * 48 * 4);
      const candidateHead = candidate.slice(
        (3 + bobs[index]) * 48 * 4,
        (28 + bobs[index]) * 48 * 4,
      );
      expect(hash(candidateHead)).toBe(hash(referenceHead));
    }
  });

  it.each([
    ["skinTone", "#553B32"],
    ["hairColor", "#E9CF8D"],
    ["upperColor", "#B76866"],
    ["lowerColor", "#D3A353"],
    ["shoeColor", "#343F4B"],
    ["hairstyle", "bob"],
    ["hairstyle", "crop"],
    ["hairstyle", "mohawk"],
    ["upperClothing", "tee"],
    ["upperClothing", "jacket"],
    ["lowerClothing", "skirt"],
    ["lowerClothing", "shorts"],
  ])(
    "renders customization %s=%s into the actual sprite pixels",
    (key, value) => {
      const initial = generateCharacter(DEFAULT_CONFIG);
      const changed = generateCharacter({
        ...DEFAULT_CONFIG,
        [key]: value,
      } as CharacterConfig);
      expect(hash(changed.pixels)).not.toBe(hash(initial.pixels));
      if (value.startsWith("#")) {
        expect(hasColor(changed.pixels, value)).toBe(true);
        // Recoloring must not alter the silhouette or transparency of any frame.
        expect(changed.pixels.filter((_, i) => i % 4 === 3)).toEqual(
          initial.pixels.filter((_, i) => i % 4 === 3),
        );
      }
    },
  );

  it("changes metadata but preserves artwork when the character is renamed", () => {
    const initial = generateCharacter(DEFAULT_CONFIG);
    const renamed = generateCharacter({
      ...DEFAULT_CONFIG,
      name: "Another name",
    });
    expect(renamed.manifest.name).toBe("Another name");
    expect(renamed.pixels).toEqual(initial.pixels);
  });

  it("includes visibly different original presets", () => {
    expect(
      new Set(
        PRESETS.map(({ config }) => hash(generateCharacter(config).pixels)),
      ).size,
    ).toBe(PRESETS.length);
  });
});
