import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzlibSync } from "fflate";
import {
  COHESIVE_DEFAULT_CONFIG,
  OUTFIT_PRESETS,
  upgradeToPolishedArt,
  parseCharacterConfig,
  upgradeToCohesiveArt,
} from "./config";
import { generateCharacter } from "./generator";
import { POLISHED_ASSETS } from "./polished-assets.generated";
import type { ArtV6CharacterConfig, GeneratedCharacter } from "./types";
const hash = (p: Uint8ClampedArray) =>
  createHash("sha256").update(p).digest("hex");
const cfg = (
  hairstyle: "waves" | "crop",
  expression: ArtV6CharacterConfig["expression"] = "joyful",
): ArtV6CharacterConfig => ({
  ...upgradeToPolishedArt(COHESIVE_DEFAULT_CONFIG),
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
  const l = POLISHED_ASSETS.layers.find((l) => l.id === id)!;
  return {
    ...l,
    bytes: unzlibSync(Uint8Array.from(atob(l.data), (c) => c.charCodeAt(0))),
  };
}
const alphaAt = (l: ReturnType<typeof layer>, x: number, y: number) =>
  x < l.x || y < l.y || x >= l.x + l.width || y >= l.y + l.height
    ? 0
    : l.bytes[((y - l.y) * l.width + x - l.x) * 5 + 3];
describe("polished artwork V6", () => {
  it("preserves the delivered V5 renderer, source bank and source art", () => {
    const frozen = JSON.parse(
      readFileSync(
        new URL("../../artwork/polished-source-baseline.json", import.meta.url),
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
    const old = COHESIVE_DEFAULT_CONFIG;
    expect(parseCharacterConfig(old)).toEqual(old);
    expect(upgradeToPolishedArt(old)).toEqual({ ...old, artworkVersion: 6 });
    expect(() => upgradeToCohesiveArt(upgradeToPolishedArt(old))).toThrow(
      "downgraded",
    );
  });
  it("keeps lapel flowers, hair and collar pixels out of the moving upper sleeves", () => {
    const far = layer(POLISHED_ASSETS.upper.suit.farUpperArm),
      torso = layer(POLISHED_ASSETS.upper.suit.torso);
    expect(alphaAt(far, 121, 126)).toBe(0);
    expect(alphaAt(torso, 121, 126)).toBe(255);
    for (const body of Object.values(POLISHED_ASSETS.upper))
      for (const id of [body.nearUpperArm, body.farUpperArm])
        expect(layer(id).y).toBeGreaterThanOrEqual(119);
    for (const body of Object.values(POLISHED_ASSETS.upper)) {
      expect(layer(body.torso).y).toBeGreaterThanOrEqual(114);
      expect(alphaAt(layer(body.torso), 99, 109)).toBe(0);
    }
  });
  it("excludes gown material from both bare forearms without erasing skin", () => {
    for (const id of [
      POLISHED_ASSETS.upper.bodice.nearForearm,
      POLISHED_ASSETS.upper.bodice.farForearm,
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
        const bobs = [0, -1, -2, -1, 0, -1, -2, -1];
        const portraits = bobs.map((bob, i) =>
          hash(
            frame(g, i + 4).slice((6 + bob) * 192 * 4, (100 + bob) * 192 * 4),
          ),
        );
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
