import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ART_V2_PRESETS,
  DEFAULT_CONFIG,
  OUTFIT_PRESETS,
  PRESETS,
  SKIN_TONES,
  configToJson,
  parseCharacterConfig,
  upgradeToDetailedArt,
} from "./config";
import { generateCharacter } from "./generator";
import { validateManifest } from "./pack";
import type { ArtV3CharacterConfig, GeneratedCharacter } from "./types";

const WIDTH = 192;
const HEIGHT = 256;

function hash(pixels: Uint8ClampedArray) {
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

function portrait(pixels: Uint8ClampedArray, bob = 0) {
  // The crown, eyes, and upper jaw translate together. The flowing back hair
  // below y=100 intentionally sways and is excluded from this identity region.
  const pixelsPerRow = WIDTH;
  const result = new Uint8ClampedArray(pixelsPerRow * 94 * 4);
  for (let y = 0; y < 94; y++) {
    const offset = (y + 6 + bob) * WIDTH * 4;
    result.set(
      pixels.subarray(offset, offset + pixelsPerRow * 4),
      y * pixelsPerRow * 4,
    );
  }
  return result;
}

function region(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const result = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const offset = ((y + row) * WIDTH + x) * 4;
    result.set(pixels.subarray(offset, offset + width * 4), row * width * 4);
  }
  return result;
}

const GARMENTS = [
  ...OUTFIT_PRESETS,
  {
    label: "mohawk with tee and long dress",
    appearance: {
      hairstyle: "mohawk",
      upperClothing: "tee",
      lowerClothing: "dress",
    },
  },
  {
    label: "bob with bodice and shorts",
    appearance: {
      hairstyle: "bob",
      upperClothing: "bodice",
      lowerClothing: "shorts",
    },
  },
] as const;

describe("detailed pixel artwork", () => {
  it.each(PRESETS)(
    "round-trips $label deterministically with the explicit new dimensions and original pack contract",
    ({ config }) => {
      const frozen = Object.freeze({ ...config });
      const first = generateCharacter(frozen);
      const reopened = generateCharacter(
        parseCharacterConfig(JSON.parse(configToJson(config))),
      );
      expect(hash(first.pixels)).toBe(hash(reopened.pixels));
      expect(first.manifest).toEqual(reopened.manifest);
      expect(frozen).toEqual(config);
      expect(config).toMatchObject({ schemaVersion: 2, artworkVersion: 3 });
      expect([first.width, first.height]).toEqual([1536, 512]);
      expect(first.pixels.length).toBe(1536 * 512 * 4);
      expect(validateManifest(first.manifest)).toEqual(first.manifest);
      expect(first.manifest).toMatchObject({
        schemaVersion: 1,
        generator: "gathria-detailed-pixels-v3",
        spritesheet: {
          frameWidth: WIDTH,
          frameHeight: HEIGHT,
          columns: 8,
          rows: 2,
        },
        anchor: { x: 96, y: 240, units: "pixels", origin: "top-left" },
        facing: { native: "right", right: "none", left: "mirror-x" },
        scale: { pixelArt: true, recommended: 1, integerOnly: true },
      });
      expect(first.manifest.frames).toHaveLength(12);
      for (let id = 0; id < 12; id++) {
        expect(first.manifest.frames[id]).toEqual({
          id,
          x: (id < 4 ? id : id - 4) * WIDTH,
          y: id < 4 ? 0 : HEIGHT,
          width: WIDTH,
          height: HEIGHT,
        });
      }
      expect(first.manifest.animations.idle.frames).toHaveLength(12);
      expect(new Set(first.manifest.animations.idle.frames).size).toBe(4);
      expect(first.manifest.animations.walk.frames).toEqual([
        4, 5, 6, 7, 8, 9, 10, 11,
      ]);
      for (let y = 0; y < HEIGHT; y++) {
        expect(
          first.pixels
            .subarray(
              (y * first.width + WIDTH * 4) * 4,
              (y * first.width + first.width) * 4,
            )
            .every((byte) => byte === 0),
        ).toBe(true);
      }
    },
  );

  it("creates detailed copies of V2 presets without changing their saved appearance fields or original version", () => {
    for (const { config } of ART_V2_PRESETS) {
      const original = Object.freeze({ ...config });
      const detailed = upgradeToDetailedArt(original);
      expect(detailed).toEqual({ ...config, artworkVersion: 3 });
      expect(original.artworkVersion).toBe(2);
      expect(generateCharacter(original).manifest.generator).toBe(
        "gathria-warm-pixels-v2",
      );
      expect(generateCharacter(detailed).manifest.generator).toBe(
        "gathria-detailed-pixels-v3",
      );
    }
  });

  it("renders all three face options differently with identical hair, clothing, and colors", () => {
    const faces = (["heart", "oval", "round"] as const).map((faceVariant) =>
      framePixels(
        generateCharacter({
          ...DEFAULT_CONFIG,
          hairstyle: "crop",
          faceVariant,
        }),
        0,
      ),
    );
    expect(
      new Set(faces.map((pixels) => hash(pixels.slice(0, WIDTH * 128 * 4))))
        .size,
    ).toBe(3);
  });

  it("applies every editable material color to exported pixels without changing the character silhouette", () => {
    const initial = generateCharacter(DEFAULT_CONFIG);
    const alpha = initial.pixels.filter((_, index) => index % 4 === 3);
    for (const field of [
      "skinTone",
      "hairColor",
      "upperColor",
      "lowerColor",
      "shoeColor",
    ] as const) {
      const color = "#7969B3";
      const changed = generateCharacter({ ...DEFAULT_CONFIG, [field]: color });
      expect(hash(changed.pixels), field).not.toBe(hash(initial.pixels));
      expect(
        hash(changed.pixels.filter((_, index) => index % 4 === 3)),
        field,
      ).toBe(hash(alpha));
      // Illustration recoloring preserves the source luminance instead of
      // painting flat target RGB. Verify a real shaded material changed.
      const changedShades = new Set<string>();
      for (let offset = 0; offset < changed.pixels.length; offset += 4) {
        if (
          changed.pixels[offset + 3] === 255 &&
          (changed.pixels[offset] !== initial.pixels[offset] ||
            changed.pixels[offset + 1] !== initial.pixels[offset + 1] ||
            changed.pixels[offset + 2] !== initial.pixels[offset + 2])
        ) {
          changedShades.add(
            `${changed.pixels[offset]},${changed.pixels[offset + 1]},${changed.pixels[offset + 2]}`,
          );
        }
      }
      expect(
        changedShades.size,
        `${field} must recolor real shaded pixels`,
      ).toBeGreaterThan(1);
    }
  });

  it("recolors the exposed tee neckline for every skin tone instead of retaining pale source skin", () => {
    const jun = PRESETS.find(({ id }) => id === "jun")!.config;
    const necklines = SKIN_TONES.map((skinTone) => {
      const frame = framePixels(generateCharacter({ ...jun, skinTone }), 0);
      // Central exposed chest, clear of the blouse seam and portrait overlap.
      return region(frame, 96, 115, 12, 7);
    });
    expect(new Set(necklines.map(hash)).size).toBe(SKIN_TONES.length);
    let previousBrightness = Infinity;
    for (const neckline of necklines) {
      expect(
        neckline
          .filter((_, index) => index % 4 === 3)
          .every((alpha) => alpha === 255),
      ).toBe(true);
      const brightness = neckline.reduce(
        (sum, value, index) => sum + (index % 4 === 3 ? 0 : value),
        0,
      );
      // The ordered light-to-dark skin swatches must darken this exposed skin,
      // while the source illustration's shading stays intact.
      expect(brightness).toBeLessThan(previousBrightness);
      previousBrightness = brightness;
    }
  });

  it.each([
    {
      label: "Jun tee",
      upperClothing: "tee" as const,
      lowerClothing: "skirt" as const,
      bounds: [54, 181, 12, 11] as const,
    },
    {
      label: "bare bodice hands",
      upperClothing: "bodice" as const,
      lowerClothing: "shorts" as const,
      bounds: [55, 178, 12, 11] as const,
    },
  ])(
    "keeps $label finger shadows tied to skin instead of lower clothing",
    ({ upperClothing, lowerClothing, bounds }) => {
      const jun = PRESETS.find(({ id }) => id === "jun")!.config;
      const config = {
        ...jun,
        upperClothing,
        lowerClothing,
        skinTone: "#E5AE87",
      };
      const original = framePixels(generateCharacter(config), 0);
      const green = framePixels(
        generateCharacter({ ...config, lowerColor: "#00FF00" }),
        0,
      );
      const blue = framePixels(
        generateCharacter({ ...config, lowerColor: "#0000FF" }),
        0,
      );
      const darkSkin = framePixels(
        generateCharacter({ ...config, skinTone: "#553B32" }),
        0,
      );
      // Both hands and the five skin-shadow pixels on the inner far forearm.
      // These exposed regions avoid legitimate skirt/shorts and sleeve pixels.
      for (const [name, area] of [
        ["near hand", bounds],
        ["far hand", [130, 177, 10, 11]],
        ["inner far forearm", [121, 168, 2, 4]],
      ] as const) {
        const [x, y, width, height] = area;
        const crop = (pixels: Uint8ClampedArray) =>
          region(pixels, x, y, width, height);
        const baseline = crop(original);
        expect(
          baseline
            .filter((_, index) => index % 4 === 3)
            .some((alpha) => alpha === 255),
          name,
        ).toBe(true);
        expect(hash(crop(green)), name).toBe(hash(baseline));
        expect(hash(crop(blue)), name).toBe(hash(baseline));
        expect(hash(crop(darkSkin)), name).not.toBe(hash(baseline));
      }
    },
  );

  it("moves the flowing hair and dress independently of body bob", () => {
    const dress = OUTFIT_PRESETS.find(({ id }) => id === "wedding-dress")!;
    const examples = [
      {
        label: "right hair tips",
        config: DEFAULT_CONFIG,
        bounds: [146, 115, 24, 45] as const,
      },
      {
        label: "outer dress hem",
        config: { ...DEFAULT_CONFIG, ...dress.appearance },
        bounds: [20, 218, 40, 22] as const,
      },
    ];
    for (const { label, config, bounds } of examples) {
      const generated = generateCharacter(config);
      const [x, y, width, height] = bounds;
      // Walk phases 2 and 6 have the same body bob and opposite secondary sway.
      // These regions contain hair/cloth only, outside the moving limbs.
      const first = region(framePixels(generated, 6), x, y, width, height);
      const second = region(framePixels(generated, 10), x, y, width, height);
      const firstAlpha = first.filter((_, index) => index % 4 === 3);
      const secondAlpha = second.filter((_, index) => index % 4 === 3);
      expect(
        firstAlpha.some((alpha) => alpha === 255),
        label,
      ).toBe(true);
      expect(hash(secondAlpha), `${label} must change its silhouette`).not.toBe(
        hash(firstAlpha),
      );
    }
  });

  it.each([
    ...PRESETS,
    {
      label: "mohawk",
      config: { ...DEFAULT_CONFIG, hairstyle: "mohawk" as const },
    },
  ])(
    "keeps $label's face stable throughout the gait and produces all distinct drawings",
    ({ config }) => {
      const generated = generateCharacter(config);
      const reference = hash(portrait(framePixels(generated, 4)));
      const bobs = [0, -1, -2, -1, 0, -1, -2, -1];
      for (let index = 0; index < 8; index++) {
        expect(
          hash(portrait(framePixels(generated, index + 4), bobs[index])),
          `walk frame ${index + 4}`,
        ).toBe(reference);
      }
      for (const [animation, sequence] of Object.entries(
        generated.manifest.animations,
      )) {
        const ids = [...new Set(sequence.frames)];
        expect
          .soft(
            new Set(ids.map((id) => hash(framePixels(generated, id)))).size,
            `${animation} must have one distinct drawing per declared frame ID`,
          )
          .toBe(ids.length);
      }
    },
  );

  it.each(GARMENTS)(
    "keeps $label opaque, connected, inside its frame, and on the anchor line",
    ({ appearance }) => {
      const generated = generateCharacter({
        ...DEFAULT_CONFIG,
        ...appearance,
      } as ArtV3CharacterConfig);
      for (const { id } of generated.manifest.frames) {
        const pixels = framePixels(generated, id);
        const mask = pixels.filter((_, index) => index % 4 === 3);
        const occupied = [...mask.keys()].filter((index) => mask[index] !== 0);
        expect([...new Set(mask)].sort()).toEqual([0, 255]);
        expect(
          Math.min(...occupied.map((index) => index % WIDTH)),
        ).toBeGreaterThan(1);
        expect(
          Math.max(...occupied.map((index) => index % WIDTH)),
        ).toBeLessThan(WIDTH - 2);
        expect(
          Math.min(...occupied.map((index) => Math.floor(index / WIDTH))),
        ).toBeGreaterThan(1);
        expect(
          Math.max(...occupied.map((index) => Math.floor(index / WIDTH))),
        ).toBe(239);
        const seen = new Set<number>([occupied[0]]);
        const pending = [occupied[0]];
        while (pending.length) {
          const point = pending.pop()!;
          const x = point % WIDTH;
          const y = Math.floor(point / WIDTH);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx,
                ny = y + dy;
              if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
              const next = ny * WIDTH + nx;
              if (mask[next] && !seen.has(next)) {
                seen.add(next);
                pending.push(next);
              }
            }
          }
        }
        expect(seen.size, `frame ${id} has a detached opaque component`).toBe(
          occupied.length,
        );
      }
    },
  );
});
