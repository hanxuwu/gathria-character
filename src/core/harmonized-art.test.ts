import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzlibSync } from "fflate";
import {
  POLISHED_DEFAULT_CONFIG,
  OUTFIT_PRESETS,
  upgradeToHarmonizedArt,
  parseCharacterConfig,
  upgradeToPolishedArt,
} from "./config";
import { generateCharacter } from "./generator";
import { HARMONIZED_ASSETS } from "./harmonized-assets.generated";
import type { ArtV7CharacterConfig, GeneratedCharacter } from "./types";
const hash = (p: Uint8ClampedArray) =>
  createHash("sha256").update(p).digest("hex");
const cfg = (
  hairstyle: "waves" | "crop",
  expression: ArtV7CharacterConfig["expression"] = "joyful",
): ArtV7CharacterConfig => ({
  ...upgradeToHarmonizedArt(POLISHED_DEFAULT_CONFIG),
  ...OUTFIT_PRESETS[hairstyle === "waves" ? 2 : 1].appearance,
  hairstyle,
  expression,
});
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
function layer(id: string) {
  const l = HARMONIZED_ASSETS.layers.find((l) => l.id === id)!;
  return {
    ...l,
    bytes: unzlibSync(Uint8Array.from(atob(l.data), (c) => c.charCodeAt(0))),
  };
}
const alphaAt = (l: ReturnType<typeof layer>, x: number, y: number) =>
  x < l.x || y < l.y || x >= l.x + l.width || y >= l.y + l.height
    ? 0
    : l.bytes[((y - l.y) * l.width + x - l.x) * 5 + 3];
describe("harmonized artwork V7", () => {
  it("preserves the delivered V6 renderer, source bank and source art", () => {
    const frozen = JSON.parse(
      readFileSync(
        new URL(
          "../../artwork/harmonized-source/legacy-hashes.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const [name, expected] of Object.entries(frozen))
      expect(
        createHash("sha256")
          .update(readFileSync(new URL("../../" + name, import.meta.url)))
          .digest("hex"),
        name,
      ).toBe(expected);
    const old = POLISHED_DEFAULT_CONFIG;
    expect(parseCharacterConfig(old)).toEqual(old);
    expect(upgradeToHarmonizedArt(old)).toEqual({ ...old, artworkVersion: 7 });
    expect(() => upgradeToPolishedArt(upgradeToHarmonizedArt(old))).toThrow(
      "downgraded",
    );
  });
  it("keeps lapel flowers, hair and collar pixels out of the moving upper sleeves", () => {
    const far = layer(HARMONIZED_ASSETS.upper.suit.farUpperArm),
      torso = layer(HARMONIZED_ASSETS.upper.suit.torso);
    expect(alphaAt(far, 115, 126)).toBe(0);
    expect(alphaAt(torso, 115, 126)).toBe(255);
    for (const body of Object.values(HARMONIZED_ASSETS.upper))
      for (const id of [body.nearUpperArm, body.farUpperArm])
        expect(layer(id).y).toBeGreaterThanOrEqual(116);
    for (const body of Object.values(HARMONIZED_ASSETS.upper)) {
      expect(layer(body.torso).y).toBeGreaterThanOrEqual(108);
      expect(alphaAt(layer(body.torso), 99, 102)).toBe(0);
    }
  });
  it("excludes gown material from both bare forearms without erasing skin", () => {
    for (const id of [
      HARMONIZED_ASSETS.upper.bodice.nearForearm,
      HARMONIZED_ASSETS.upper.bodice.farForearm,
    ]) {
      const l = layer(id);
      let count = 0;
      for (let i = 0; i < l.bytes.length; i += 5)
        if (l.bytes[i + 3]) {
          count++;
          expect(l.bytes[i + 4]).toBe(1);
        }
      expect(count).toBeGreaterThan(150);
    }
  });
  it("keeps garment material out of whole heads and matches rear hair to each expression", () => {
    for (const style of ["waves", "crop"] as const)
      for (const expression of ["neutral", "gentle", "joyful"] as const) {
        const portrait = HARMONIZED_ASSETS.portraits[style],
          l = layer(portrait.states[expression]);
        for (let i = 0; i < l.bytes.length; i += 5)
          if (l.bytes[i + 3]) expect(l.bytes[i + 4]).toBeLessThanOrEqual(2);
      }
    expect(
      new Set(Object.values(HARMONIZED_ASSETS.portraits.waves.backs)).size,
    ).toBe(3);
  });
  it.each(["waves", "crop"] as const)(
    "%s keeps ear and cheek skin independent of blonde recoloring",
    (style) => {
      const config = cfg(style, "neutral"),
        a = frame(
          generateCharacter({
            ...config,
            hairColor: "#43312E",
            skinTone: "#553B32",
          }),
          0,
        ),
        b = frame(
          generateCharacter({
            ...config,
            hairColor: "#E9CF8D",
            skinTone: "#553B32",
          }),
          0,
        );
      for (const [x, y] of [
        [64, 82],
        [110, 88],
      ]) {
        const i = (y * 192 + x) * 4;
        expect([...a.slice(i, i + 4)]).toEqual([...b.slice(i, i + 4)]);
        expect(a[i + 3]).toBe(255);
      }
      expect(hash(a)).not.toBe(hash(b));
    },
  );
  it.each(["waves", "crop"] as const)(
    "%s preserves identity through three complete expressions and deterministic save/reopen",
    (style) => {
      const heads = [];
      for (const expression of ["neutral", "gentle", "joyful"] as const) {
        const input = cfg(style, expression),
          g = generateCharacter(input);
        expect(
          hash(
            generateCharacter(
              parseCharacterConfig(JSON.parse(JSON.stringify(input))),
            ).pixels,
          ),
        ).toBe(hash(g.pixels));
        heads.push(hash(frame(g, 0).slice(0, 192 * 120 * 4)));
        const idle = g.manifest.animations.idle;
        expect(idle.frames.length / idle.fps).toBe(3);
        expect(new Set(idle.frames).size).toBe(4);
        const bobs = [0, 2, 0, -2, 0, 2, 0, -2],
          shifts = [0, 1, 2, 1, 0, -1, -2, -1];
        const portraits = bobs.map((bob, i) => {
          const full = frame(g, i + 4),
            region = new Uint8ClampedArray(120 * 90 * 4);
          for (let y = 0; y < 90; y++)
            region.set(
              full.subarray(
                ((y + 6 + bob) * 192 + 32 + shifts[i]) * 4,
                ((y + 6 + bob) * 192 + 152 + shifts[i]) * 4,
              ),
              y * 120 * 4,
            );
          return hash(region);
        });
        expect(new Set(portraits).size).toBe(1);
      }
      expect(new Set(heads).size).toBe(3);
    },
  );
  it.each(["waves", "crop"] as const)(
    "%s keeps all wedding poses connected, within bounds and on the floor",
    (style) => {
      const g = generateCharacter(cfg(style));
      for (const f of g.manifest.frames) {
        const p = frame(g, f.id),
          a = p.filter((_, i) => i % 4 === 3),
          occupied = [...a.keys()].filter((i) => a[i]);
        expect(new Set(a)).toEqual(new Set([0, 255]));
        expect(Math.max(...occupied.map((i) => Math.floor(i / 192)))).toBe(239);
        expect(Math.min(...occupied.map((i) => i % 192))).toBeGreaterThan(0);
        expect(Math.max(...occupied.map((i) => i % 192))).toBeLessThan(191);
        const seen = new Set([occupied[0]]),
          pending = [occupied[0]];
        while (pending.length) {
          const i = pending.pop()!,
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
                pending.push(n);
              }
            }
        }
        expect(seen.size, `frame ${f.id} detached part`).toBe(occupied.length);
        for (let y = 111; y < 120; y++)
          expect(
            Array.from({ length: 14 }, (_, x) => a[y * 192 + 88 + x]).filter(
              Boolean,
            ).length,
          ).toBeGreaterThanOrEqual(6);
      }
    },
  );
});
