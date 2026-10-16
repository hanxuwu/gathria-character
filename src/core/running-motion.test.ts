import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  configToJson,
  enableCompactRunning,
  enableRunning,
  parseCharacterConfig,
} from "./config";
import { generateCharacter } from "./generator";
import type { ArtV6CharacterConfig, GeneratedCharacter } from "./types";

const W = 192,
  H = 256;
const baseline = JSON.parse(
  readFileSync(
    new URL("../../docs/running-baseline/baseline-index.json", import.meta.url),
    "utf8",
  ),
) as {
  frozenFiles: Record<string, string>;
  exports: Array<{ id: string; config: unknown; rgbaSha256: string }>;
};
const hash = (bytes: Uint8ClampedArray | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

function savedWedding(id: string): ArtV6CharacterConfig {
  const input = baseline.exports.find((entry) => entry.id === id);
  if (!input) throw new Error(`Missing saved wedding baseline ${id}.`);
  const config = parseCharacterConfig(input.config);
  if (config.schemaVersion !== 2 || config.artworkVersion !== 6)
    throw new Error("Running baseline must retain its original V6 artwork.");
  return config;
}

function framePixels(generated: GeneratedCharacter, id: number) {
  const frame = generated.manifest.frames.find((entry) => entry.id === id);
  if (!frame) throw new Error(`Missing run frame ${id}.`);
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    pixels.set(
      generated.pixels.subarray(
        ((frame.y + y) * generated.width + frame.x) * 4,
        ((frame.y + y) * generated.width + frame.x + W) * 4,
      ),
      y * W * 4,
    );
  return pixels;
}

/** A single 8-connected silhouette catches detached hands, sleeves and shoe scraps. */
function geometry(pixels: Uint8ClampedArray, label: string) {
  const alpha = new Uint8Array(W * H);
  const alphas = new Set<number>();
  let count = 0,
    seed = -1,
    minX = W,
    maxX = -1,
    minY = H,
    maxY = -1;
  for (let p = 0; p < alpha.length; p++) {
    const a = pixels[p * 4 + 3];
    alphas.add(a);
    if (!a) continue;
    alpha[p] = 1;
    count++;
    seed = p;
    minX = Math.min(minX, p % W);
    maxX = Math.max(maxX, p % W);
    minY = Math.min(minY, Math.floor(p / W));
    maxY = Math.max(maxY, Math.floor(p / W));
  }
  expect(alphas, `${label}: crisp transparency`).toEqual(new Set([0, 255]));
  expect(count, `${label}: nonempty pose`).toBeGreaterThan(0);
  expect(minX, `${label}: left margin`).toBeGreaterThan(0);
  expect(maxX, `${label}: right margin`).toBeLessThan(W - 1);
  expect(minY, `${label}: top margin`).toBeGreaterThan(0);
  expect(maxY, `${label}: does not sink below the floor`).toBeLessThanOrEqual(
    239,
  );
  const pending = [seed];
  alpha[seed] = 0;
  let connected = 0;
  while (pending.length) {
    const p = pending.pop()!,
      x = p % W,
      y = Math.floor(p / W);
    connected++;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const n = ny * W + nx;
        if (alpha[n]) {
          alpha[n] = 0;
          pending.push(n);
        }
      }
  }
  expect(connected, `${label}: no detached parts`).toBe(count);
  return { maxY };
}

describe("V6 running silhouette and ground contact", () => {
  it("preserves the V6 renderer and production bank recorded before adding running", () => {
    for (const [file, expected] of Object.entries(baseline.frozenFiles))
      expect(
        hash(readFileSync(new URL("../../" + file, import.meta.url))),
        file,
      ).toBe(expected);
  });

  it.each(["dress", "suit"])(
    "keeps every %s run pose deterministic, connected and correctly grounded",
    (id) => {
      const config = enableRunning(savedWedding(id));
      const generated = generateCharacter(config);
      const reopened = generateCharacter(
        parseCharacterConfig(JSON.parse(configToJson(config))),
      );
      expect(hash(generated.pixels)).toBe(hash(reopened.pixels));
      expect(generated.manifest).toEqual(reopened.manifest);
      expect(generated.manifest.anchor).toEqual({
        x: 96,
        y: 240,
        units: "pixels",
        origin: "top-left",
      });
      const saved = baseline.exports.find((entry) => entry.id === id)!;
      expect(
        hash(generated.pixels.subarray(0, 1536 * 512 * 4)),
        "saved V6 idle/walk pixels",
      ).toBe(saved.rgbaSha256);
      const run = generated.manifest.animations.run!;
      expect(run.frames).toHaveLength(12);
      for (const [index, frameId] of run.frames.entries()) {
        const bounds = geometry(
          framePixels(generated, frameId),
          `${id} run ${index}`,
        );
        if ([0, 1, 6, 7].includes(index))
          expect(
            bounds.maxY,
            `${id} phase ${index}: planted contact/load`,
          ).toBe(239);
        if ([3, 4, 5, 9, 10, 11].includes(index))
          expect(
            bounds.maxY,
            `${id} phase ${index}: lifted flight/recovery`,
          ).toBeLessThan(239);
      }
    },
  );

  it.each(["dress", "suit"])(
    "keeps %s recoloring and a different expression connected across the whole run",
    (id) => {
      const original = savedWedding(id);
      const config = enableRunning({
        ...original,
        expression: "gentle",
        skinTone: "#553B32",
        hairColor: "#E9CF8D",
      });
      const generated = generateCharacter(config);
      for (const [
        index,
        frameId,
      ] of generated.manifest.animations.run!.frames.entries())
        geometry(
          framePixels(generated, frameId),
          `${id} gentle/deep skin/blonde ${index}`,
        );
    },
  );

  it.each(["shorts", "skirt"] as const)(
    "retains visible recolorable bare legs in %s through every run pose",
    (lowerClothing) => {
      const config = enableRunning({
        ...savedWedding("suit"),
        hairstyle: lowerClothing === "shorts" ? "crop" : "waves",
        upperClothing: "tee",
        upperColor: "#63769B",
        lowerClothing,
        lowerColor: "#343F4B",
        expression: "gentle",
        skinTone: "#F5D3AE",
      });
      const light = generateCharacter(config);
      const dark = generateCharacter({ ...config, skinTone: "#553B32" });
      for (const [
        index,
        frameId,
      ] of light.manifest.animations.run!.frames.entries()) {
        const lightPixels = framePixels(light, frameId);
        const darkPixels = framePixels(dark, frameId);
        geometry(lightPixels, `${lowerClothing} light skin ${index}`);
        geometry(darkPixels, `${lowerClothing} deep skin ${index}`);
        // Below the hands/torso, only exposed leg skin should react to skinTone.
        // This catches a mask accidentally treating all leg skin as foreign art.
        let visibleSkin = 0;
        for (let p = 190 * W; p < W * H; p++) {
          const offset = p * 4;
          if (
            lightPixels[offset + 3] &&
            darkPixels[offset + 3] &&
            (lightPixels[offset] !== darkPixels[offset] ||
              lightPixels[offset + 1] !== darkPixels[offset + 1] ||
              lightPixels[offset + 2] !== darkPixels[offset + 2])
          )
            visibleSkin++;
        }
        expect(
          visibleSkin,
          `${lowerClothing} frame ${index}: exposed leg skin remains visible`,
        ).toBeGreaterThan(0);
      }
    },
  );

  it.each(["dress", "suit"])(
    "keeps compact %s contact and flight poses connected without clipping or sinking",
    (id) => {
      const generated = generateCharacter(
        enableCompactRunning(savedWedding(id)),
      );
      for (const [
        index,
        frameId,
      ] of generated.manifest.animations.run!.frames.entries()) {
        const bounds = geometry(
          framePixels(generated, frameId),
          `compact ${id} run ${index}`,
        );
        if ([0, 1, 6, 7].includes(index))
          expect(
            bounds.maxY,
            `compact ${id} ${index}: planted contact/load`,
          ).toBe(239);
        if ([3, 4, 5, 9, 10, 11].includes(index))
          expect(
            bounds.maxY,
            `compact ${id} ${index}: airborne recovery`,
          ).toBeLessThan(239);
      }
    },
  );

  it("reduces the groom's maximum airborne leg spread relative to the delivered wide stride", () => {
    const config = savedWedding("suit");
    const original = generateCharacter(enableRunning(config));
    const compact = generateCharacter(enableCompactRunning(config));
    const maxAirborneSpan = (generated: GeneratedCharacter) =>
      Math.max(
        ...[3, 4, 5, 9, 10, 11].map((index) => {
          const pixels = framePixels(
            generated,
            generated.manifest.animations.run!.frames[index],
          );
          let left = W,
            right = -1;
          // Measure below the waist so unchanged hair and shoulder width cannot
          // hide a regression to the original widely splayed airborne legs.
          for (let p = 170 * W; p < W * H; p++)
            if (pixels[p * 4 + 3]) {
              left = Math.min(left, p % W);
              right = Math.max(right, p % W);
            }
          expect(right).toBeGreaterThan(left);
          return right - left + 1;
        }),
      );
    expect(maxAirborneSpan(compact)).toBeLessThan(maxAirborneSpan(original));
  });
});
