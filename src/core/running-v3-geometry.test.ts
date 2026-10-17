import { describe, expect, it } from "vitest";
import { enableCorrectedRunning } from "./config";
import { EVERYDAY_EXAMPLES } from "./everyday-presets";
import { generateCharacter } from "./generator";
import { IllustratedCanvas, identity } from "./illustrated-canvas";
import type { IllustratedLayer, IllustratedLegs } from "./illustrated-types";
import { prepareRunningLegParts } from "./running-leg-parts";
import type { GeneratedCharacter } from "./types";

const W = 192,
  H = 256;
function framePixels(character: GeneratedCharacter, id: number) {
  const frame = character.manifest.frames.find((value) => value.id === id)!;
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const offset = ((frame.y + y) * character.width + frame.x) * 4;
    rgba.set(character.pixels.subarray(offset, offset + W * 4), y * W * 4);
  }
  return rgba;
}
function bounds(pixels: Uint8ClampedArray) {
  const alpha = new Set<number>();
  let minX = W,
    maxX = -1,
    minY = H,
    maxY = -1;
  for (let p = 0; p < W * H; p++) {
    alpha.add(pixels[p * 4 + 3]);
    if (!pixels[p * 4 + 3]) continue;
    minX = Math.min(minX, p % W);
    maxX = Math.max(maxX, p % W);
    minY = Math.min(minY, Math.floor(p / W));
    maxY = Math.max(maxY, Math.floor(p / W));
  }
  return { minX, maxX, minY, maxY, alpha };
}
function rgbChanges(a: Uint8ClampedArray, b: Uint8ClampedArray, fromY: number) {
  let changes = 0;
  for (let p = fromY * W; p < W * H; p++) {
    const index = p * 4;
    if (
      a[index + 3] &&
      b[index + 3] &&
      (a[index] !== b[index] ||
        a[index + 1] !== b[index + 1] ||
        a[index + 2] !== b[index + 2])
    )
      changes++;
  }
  return changes;
}

describe("corrected run preserves pose registration and material controls", () => {
  it.each(EVERYDAY_EXAMPLES)(
    "keeps $id head/neck, cadence and grounded frame boundaries stable",
    ({ id, config }) => {
      const original = generateCharacter(config);
      const corrected = generateCharacter(enableCorrectedRunning(config));
      expect(corrected.manifest.animations).toEqual(
        original.manifest.animations,
      );
      expect(corrected.manifest.anchor).toEqual(original.manifest.anchor);
      for (const frameId of corrected.manifest.animations.run!.frames) {
        const before = framePixels(original, frameId);
        const after = framePixels(corrected, frameId);
        // The corrected regions begin below the complete head/neck portrait.
        // A single changed pixel here catches a pose, scaling or identity regression.
        expect(
          Buffer.from(after.subarray(0, 120 * W * 4)).equals(
            Buffer.from(before.subarray(0, 120 * W * 4)),
          ),
          `${id} frame ${frameId}: portrait`,
        ).toBe(true);
        const geometry = bounds(after);
        expect(
          geometry.alpha,
          `${id} frame ${frameId}: binary transparency`,
        ).toEqual(new Set([0, 255]));
        expect(geometry.minX).toBeGreaterThan(0);
        expect(geometry.maxX).toBeLessThan(W - 1);
        expect(geometry.minY).toBeGreaterThan(0);
        expect(
          geometry.maxY,
          `${id} frame ${frameId}: no floor penetration`,
        ).toBeLessThanOrEqual(corrected.manifest.anchor.y);
        // Run poses/sole placement stay unchanged; fixing a joint must not add a
        // downward spike or erase a planted foot from the unchanged motion2 pose.
        expect(geometry.maxY, `${id} frame ${frameId}: same lowest sole`).toBe(
          bounds(before).maxY,
        );
      }
    },
  );

  it.each(EVERYDAY_EXAMPLES)(
    "keeps $id lower-cloth and shoe recoloring effective without changing geometry",
    ({ id, config }) => {
      const corrected = enableCorrectedRunning(config);
      const base = generateCharacter(corrected);
      for (const [field, color, fromY] of [
        ["lowerColor", "#B03D8F", 165],
        ["shoeColor", "#2C9F97", 190],
      ] as const) {
        const recolored = generateCharacter({ ...corrected, [field]: color });
        for (const frameId of base.manifest.animations.run!.frames) {
          const a = framePixels(base, frameId);
          const b = framePixels(recolored, frameId);
          expect(
            Buffer.from(a.filter((_, index) => index % 4 === 3)).equals(
              Buffer.from(b.filter((_, index) => index % 4 === 3)),
            ),
            `${id}/${field}/${frameId}: unchanged alpha`,
          ).toBe(true);
          expect(
            rgbChanges(a, b, fromY),
            `${id}/${field}/${frameId}: material remains editable`,
          ).toBeGreaterThan(0);
          expect(
            Buffer.from(b.subarray(0, 120 * W * 4)).equals(
              Buffer.from(a.subarray(0, 120 * W * 4)),
            ),
          ).toBe(true);
        }
      }
    },
  );

  it.each(
    EVERYDAY_EXAMPLES.filter(
      ({ config }) => config.lowerClothing !== "trousers",
    ),
  )(
    "keeps $id bare-leg skin responsive through bent recovery poses",
    ({ config }) => {
      const corrected = enableCorrectedRunning(config);
      const light = generateCharacter({ ...corrected, skinTone: "#F5D3AE" });
      const dark = generateCharacter({ ...corrected, skinTone: "#553B32" });
      for (const id of light.manifest.animations.run!.frames)
        expect(
          rgbChanges(framePixels(light, id), framePixels(dark, id), 190),
          `frame ${id}: skin on the lower leg survives`,
        ).toBeGreaterThan(0);
    },
  );
});

it("does not extrude endpoint rows into a long spike beyond the hip or ankle", () => {
  const layers = new Map<string, IllustratedLayer>();
  const pixels = new Map<string, Uint8ClampedArray>();
  function source(id: string, y: number, height: number, color: number[]) {
    const layer: IllustratedLayer = {
      id,
      x: 76,
      y,
      width: 9,
      height,
      palette: {},
      data: "",
    };
    const rgba = new Uint8ClampedArray(9 * height * 4);
    for (let p = 0; p < 9 * height; p++) rgba.set(color, p * 4);
    layers.set(id, layer);
    pixels.set(id, rgba);
  }
  source("thigh", 140, 41, [110, 80, 60, 255]);
  source("shin", 180, 35, [190, 145, 100, 255]);
  source("shoe", 210, 1, [0, 0, 0, 0]);
  const legs: IllustratedLegs = {
    hips: "thigh",
    nearThigh: "thigh",
    farThigh: "thigh",
    nearShin: "shin",
    farShin: "shin",
    nearShoe: "shoe",
    farShoe: "shoe",
    hipNear: [80, 150],
    kneeNear: [80, 180],
    ankleNear: [80, 210],
    hipFar: [80, 150],
    kneeFar: [80, 180],
    ankleFar: [80, 210],
  };
  const draw = prepareRunningLegParts(
    (id) => layers.get(id)!,
    (id) => pixels.get(id)!,
    legs,
  );
  const canvas = new IllustratedCanvas();
  draw(canvas, true, [80, 150], [80, 180], [80, 210], identity);
  expect(bounds(canvas.pixels)).toEqual({
    minX: 76,
    maxX: 84,
    minY: 140,
    maxY: 214,
    alpha: new Set([0, 255]),
  });
  // Both endpoint rows are actually opaque: the check cannot pass merely by
  // deleting the last source row that used to extrude under nearest sampling.
  expect(canvas.pixels[(140 * W + 80) * 4 + 3]).toBe(255);
  expect(canvas.pixels[(214 * W + 80) * 4 + 3]).toBe(255);
});
