import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ART_V3_PRESETS,
  DEFAULT_CONFIG,
  LEGACY_DEFAULT_CONFIG,
  OUTFIT_PRESETS,
  PRESETS,
  SKIN_TONES,
  configToJson,
  parseCharacterConfig,
  upgradeToDetailedArt,
  upgradeToExpressiveArt,
} from "./config";
import { generateCharacter } from "./generator";
import { validateManifest } from "./pack";
import type { GeneratedCharacter } from "./types";
const hash = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");
function frame(g: GeneratedCharacter, id: number) {
  const f = g.manifest.frames[id],
    p = new Uint8ClampedArray(192 * 256 * 4);
  for (let y = 0; y < 256; y++)
    p.set(
      g.pixels.subarray(
        ((f.y + y) * g.width + f.x) * 4,
        ((f.y + y) * g.width + f.x + 192) * 4,
      ),
      y * 192 * 4,
    );
  return p;
}
// Decoded RGBA hashes from the published bc69f9d V3 PNGs, not the new renderer.
const V3_HASHES = [
  "90af0437798d3c276bd863bd1e0bfc5f88ffe2e949f82e7bd659ec4fd8baccdf",
  "63e283dc85529bdc71b57d7741762691308b94588cf503e3aa4fa0532e8e2514",
  "eabef91ed53e20b1bce297d34acd6ff8fa3efe262caee3f5ffdf0e1134031787",
];
describe("expressive artwork V4", () => {
  it.each(ART_V3_PRESETS.map((p, i) => ({ ...p, expected: V3_HASHES[i] })))(
    "preserves published V3 $label pixels",
    ({ config, expected }) => {
      expect(hash(generateCharacter(config).pixels)).toBe(expected);
      expect(parseCharacterConfig(JSON.parse(configToJson(config)))).toEqual(
        config,
      );
      expect(upgradeToExpressiveArt(config)).toEqual({
        ...config,
        artworkVersion: 4,
        expression: "gentle",
        hairAccessory: "none",
      });
    },
  );
  it.each(PRESETS)(
    "round-trips $label without a runtime service",
    ({ config }) => {
      const g = generateCharacter(Object.freeze(config));
      expect(
        hash(
          generateCharacter(
            parseCharacterConfig(JSON.parse(configToJson(config))),
          ).pixels,
        ),
      ).toBe(hash(g.pixels));
      expect(validateManifest(g.manifest)).toEqual(g.manifest);
      expect(g.manifest.anchor).toEqual({
        x: 96,
        y: 240,
        units: "pixels",
        origin: "top-left",
      });
      expect(
        g.manifest.animations.idle.frames.length /
          g.manifest.animations.idle.fps,
      ).toBe(3);
      expect(new Set(g.manifest.animations.idle.frames)).toEqual(
        new Set([0, 1, 2, 3]),
      );
    },
  );
  it("requires explicit expression/accessory choices and explicit migration", () => {
    for (const [key, value] of [
      ["expression", undefined],
      ["expression", "angry"],
      ["hairAccessory", undefined],
      ["hairAccessory", "hat"],
    ])
      expect(() =>
        parseCharacterConfig({ ...DEFAULT_CONFIG, [key as string]: value }),
      ).toThrow(key as string);
    expect(upgradeToExpressiveArt(LEGACY_DEFAULT_CONFIG, "oval")).toMatchObject(
      {
        artworkVersion: 4,
        faceVariant: "oval",
        expression: "gentle",
        hairAccessory: "none",
      },
    );
    expect(() => upgradeToDetailedArt(DEFAULT_CONFIG)).toThrow("downgraded");
    expect(() =>
      parseCharacterConfig({ ...DEFAULT_CONFIG, artworkVersion: 8 }),
    ).toThrow("artworkVersion");
  });
  it.each(["waves", "crop", "bob", "mohawk"] as const)(
    "blinks without changing %s hair, body, alpha or face placement",
    (hairstyle) => {
      const g = generateCharacter({ ...DEFAULT_CONFIG, hairstyle });
      const open = frame(g, 0),
        closed = frame(g, 3),
        half = frame(g, 2);
      expect(hash(open)).not.toBe(hash(closed));
      expect(hash(half)).not.toBe(hash(closed));
      for (let i = 0; i < open.length; i += 4) {
        expect(closed[i + 3]).toBe(open[i + 3]);
        if (open.slice(i, i + 4).some((v, c) => v !== closed[i + c])) {
          const x = (i / 4) % 192,
            y = Math.floor(i / 4 / 192);
          expect(x).toBeGreaterThanOrEqual(85);
          expect(x).toBeLessThanOrEqual(137);
          expect(y).toBeGreaterThanOrEqual(66);
          expect(y).toBeLessThanOrEqual(101);
        }
      }
      const happy = generateCharacter({
        ...DEFAULT_CONFIG,
        hairstyle,
        expression: "joyful",
      });
      expect(hash(frame(happy, 0))).not.toBe(hash(open));
    },
  );
  it("keeps expressions recolorable across skin tones and ornaments independent of palettes", () => {
    const happy = SKIN_TONES.map((skinTone) =>
      frame(
        generateCharacter({
          ...DEFAULT_CONFIG,
          expression: "joyful",
          skinTone,
        }),
        0,
      ),
    );
    expect(new Set(happy.map(hash)).size).toBe(SKIN_TONES.length);
    const plain = frame(generateCharacter(DEFAULT_CONFIG), 0),
      flowers = frame(
        generateCharacter({ ...DEFAULT_CONFIG, hairAccessory: "flowers" }),
        0,
      );
    expect(hash(plain)).not.toBe(hash(flowers));
    // Ornament changes only the head; existing garments remain identical.
    expect(hash(plain.slice(110 * 192 * 4))).toBe(
      hash(flowers.slice(110 * 192 * 4)),
    );
  });
  it.each(OUTFIT_PRESETS)(
    "$label stays connected, transparent, unclipped and grounded through every pose",
    ({ appearance }) => {
      const g = generateCharacter({
        ...DEFAULT_CONFIG,
        ...appearance,
        hairAccessory: "flowers",
      });
      for (const { id } of g.manifest.frames) {
        const p = frame(g, id),
          a = p.filter((_, i) => i % 4 === 3),
          occupied = [...a.keys()].filter((i) => a[i]);
        expect([...new Set(a)].sort()).toEqual([0, 255]);
        expect(Math.min(...occupied.map((i) => i % 192))).toBeGreaterThan(1);
        expect(Math.max(...occupied.map((i) => i % 192))).toBeLessThan(190);
        expect(
          Math.min(...occupied.map((i) => Math.floor(i / 192))),
        ).toBeGreaterThan(1);
        expect(Math.max(...occupied.map((i) => Math.floor(i / 192)))).toBe(239);
        const seen = new Set([occupied[0]]),
          queue = [occupied[0]];
        while (queue.length) {
          const i = queue.pop()!,
            x = i % 192,
            y = Math.floor(i / 192);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx,
                ny = y + dy,
                n = ny * 192 + nx;
              if (
                nx >= 0 &&
                nx < 192 &&
                ny >= 0 &&
                ny < 256 &&
                a[n] &&
                !seen.has(n)
              ) {
                seen.add(n);
                queue.push(n);
              }
            }
        }
        expect(seen.size, `frame ${id} detached component`).toBe(
          occupied.length,
        );
      }
    },
  );
  it("keeps three distinct face shapes with the same hair and wardrobe", () => {
    const faces = (["heart", "oval", "round"] as const).map((faceVariant) =>
      frame(
        generateCharacter({
          ...DEFAULT_CONFIG,
          hairstyle: "crop",
          faceVariant,
        }),
        0,
      ).slice(0, 192 * 112 * 4),
    );
    expect(new Set(faces.map(hash)).size).toBe(3);
  });
  it("keeps eyes, hair crown and accessories stable throughout the walking loop", () => {
    for (const hairstyle of ["waves", "crop", "bob", "mohawk"] as const) {
      const g = generateCharacter({
        ...DEFAULT_CONFIG,
        hairstyle,
        hairAccessory: "flowers",
      });
      const bobs = [0, -1, -3, -1, 0, -1, -3, -1];
      const portraits = bobs.map((bob, i) =>
        frame(g, i + 4).slice((6 + bob) * 192 * 4, (100 + bob) * 192 * 4),
      );
      expect(new Set(portraits.map(hash)).size).toBe(1);
      expect(
        new Set(
          g.manifest.animations.walk.frames.map((id) => hash(frame(g, id))),
        ).size,
      ).toBe(8);
    }
  });
  it("moves hair tips and the dress hem separately from the same body-bob phase", () => {
    const g = generateCharacter({
      ...DEFAULT_CONFIG,
      ...OUTFIT_PRESETS[2].appearance,
    });
    const a = frame(g, 6),
      b = frame(g, 10);
    for (const [x, y, w, h] of [
      [146, 115, 24, 45],
      [20, 218, 40, 22],
    ]) {
      let changed = 0,
        opaque = 0;
      for (let py = y; py < y + h; py++)
        for (let px = x; px < x + w; px++) {
          const i = (py * 192 + px) * 4 + 3;
          changed += Number(a[i] !== b[i]);
          opaque += Number(a[i] === 255);
        }
      expect(changed).toBeGreaterThan(0);
      expect(opaque).toBeGreaterThan(0);
    }
  });
});
