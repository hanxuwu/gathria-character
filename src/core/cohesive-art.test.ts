import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  DEFAULT_CONFIG,
  OUTFIT_PRESETS,
  parseCharacterConfig,
  upgradeToCohesiveArt,
} from "./config";
import { generateCharacter } from "./generator";
import type { GeneratedCharacter, ArtV5CharacterConfig } from "./types";

const hash = (p: Uint8ClampedArray) =>
  createHash("sha256").update(p).digest("hex");
function pixels(g: GeneratedCharacter, id = 0) {
  const f = g.manifest.frames[id],
    out = new Uint8ClampedArray(192 * 256 * 4);
  for (let y = 0; y < 256; y++)
    out.set(
      g.pixels.subarray(
        ((f.y + y) * g.width + f.x) * 4,
        ((f.y + y) * g.width + f.x + 192) * 4,
      ),
      y * 192 * 4,
    );
  return out;
}
const config = (
  hairstyle: "waves" | "crop",
  expression: ArtV5CharacterConfig["expression"] = "gentle",
): ArtV5CharacterConfig => ({
  ...upgradeToCohesiveArt(DEFAULT_CONFIG),
  ...OUTFIT_PRESETS[hairstyle === "waves" ? 2 : 1].appearance,
  hairstyle,
  expression,
});

describe("cohesive artwork V5", () => {
  it("preserves V4 source modules and packed illustration bank byte-for-byte", () => {
    const base = JSON.parse(
      readFileSync(
        new URL(
          "../../artwork/cohesive-source/legacy-hashes.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const [name, expected] of Object.entries(base)) {
      const bytes = readFileSync(new URL(`../../${name}`, import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(
        expected,
      );
    }
  });
  it.each(["waves", "crop"] as const)(
    "%s has three distinct whole-face states, deterministic after save/reopen",
    (style) => {
      const states = (["neutral", "gentle", "joyful"] as const).map(
        (expression) => {
          const input = config(style, expression),
            first = generateCharacter(input);
          expect(
            hash(
              generateCharacter(
                parseCharacterConfig(JSON.parse(JSON.stringify(input))),
              ).pixels,
            ),
          ).toBe(hash(first.pixels));
          return hash(pixels(first).slice(40 * 192 * 4, 115 * 192 * 4));
        },
      );
      expect(new Set(states).size).toBe(3);
    },
  );
  it.each(["waves", "crop"] as const)(
    "%s hair recoloring does not recolor the authored eyes",
    (style) => {
      const a = pixels(
        generateCharacter({ ...config(style), hairColor: "#43312E" }),
      );
      const b = pixels(
        generateCharacter({ ...config(style), hairColor: "#E9CF8D" }),
      );
      for (let y = 77; y < 90; y++)
        for (let x = 89; x < 105; x++) {
          const i = (y * 192 + x) * 4;
          expect([...a.slice(i, i + 4)]).toEqual([...b.slice(i, i + 4)]);
        }
      expect(hash(a)).not.toBe(hash(b));
    },
  );
  it.each(["waves", "crop"] as const)(
    "%s stays inside the frame and grounded through all outfits and poses",
    (style) => {
      for (const upperClothing of [
        "tee",
        "hoodie",
        "jacket",
        "suit",
        "bodice",
      ] as const) {
        const g = generateCharacter({
          ...config(style, "joyful"),
          upperClothing,
        });
        for (const f of g.manifest.frames) {
          const p = pixels(g, f.id);
          let minX = 192,
            maxX = 0,
            minY = 256,
            maxY = 0,
            partialAlpha = false;
          for (let y = 0; y < 256; y++)
            for (let x = 0; x < 192; x++) {
              const alpha = p[(y * 192 + x) * 4 + 3];
              if (alpha) {
                if (alpha !== 255) partialAlpha = true;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
              }
            }
          expect(partialAlpha).toBe(false);
          expect(
            minX,
            `${upperClothing}/${f.id} left clipping`,
          ).toBeGreaterThan(0);
          expect(maxX, `${upperClothing}/${f.id} right clipping`).toBeLessThan(
            191,
          );
          expect(minY).toBeGreaterThan(0);
          expect(maxY, `${upperClothing}/${f.id} floor`).toBe(239);
          // A head/neck bridge must exist through every collar, in every frame.
          for (let y = 106; y <= 119; y++) {
            expect(
              Array.from(
                { length: 24 },
                (_, x) => p[(y * 192 + x + 84) * 4 + 3],
              ).some(Boolean),
              `${upperClothing}/${f.id} neck row ${y}`,
            ).toBe(true);
          }
        }
      }
    },
  );
});
