import { unzlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { EVERYDAY_EXAMPLES } from "./everyday-presets";
import { polishedBank } from "./polished-rig";
import { repairRunningArmParts } from "./running-arm-parts";
import { expressiveColors } from "./expressive-face";
import type { IllustratedAssetBank } from "./illustrated-types";

function pixels(bank: IllustratedAssetBank, id: string) {
  const layer = bank.layers.find((candidate) => candidate.id === id)!;
  const raw = unzlibSync(
    Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)),
  );
  return (x: number, y: number) => {
    if (
      x < layer.x ||
      x >= layer.x + layer.width ||
      y < layer.y ||
      y >= layer.y + layer.height
    )
      return [0, 0, 0, 0, 0];
    const p = ((y - layer.y) * layer.width + x - layer.x) * 5;
    return [...raw.subarray(p, p + 5)];
  };
}

describe("running arm source ownership", () => {
  const config = EVERYDAY_EXAMPLES.find(
    (item) => item.id === "coral-afternoon",
  )!.config;

  it("removes skirt fragments attached to hands without rejecting a selected color", () => {
    const bank = polishedBank(config);
    const repaired = repairRunningArmParts(bank, config);
    for (const [id, x, y] of [
      [bank.upper.tee.nearForearm, 70, 179],
      [bank.upper.tee.nearForearm, 67, 189],
      [bank.upper.tee.farForearm, 124, 176],
      [bank.upper.tee.farForearm, 130, 192],
    ] as const) {
      expect(pixels(bank, id)(x, y)[3]).toBe(255);
      // These were fixed material; a lower-material-only filter misses them.
      expect(pixels(bank, id)(x, y)[4]).toBe(0);
      expect(pixels(repaired, `motion3:${id}`)(x, y)[3]).toBe(0);
    }
    const blueTop = repairRunningArmParts(bank, {
      ...config,
      skinTone: "#3D2924",
      upperColor: "#637C9A",
      lowerColor: "#C77973",
    });
    expect(blueTop.layers).toEqual(repaired.layers);
  });

  it("returns trapped anatomical pixels to forearms and removes their stationary copies", () => {
    const bank = polishedBank(config);
    const repaired = repairRunningArmParts(bank, config);
    for (const [armId, x, y] of [
      [bank.upper.tee.nearForearm, 77, 164],
      [bank.upper.tee.farForearm, 118, 165],
    ] as const) {
      const source = pixels(bank, bank.upper.tee.torso)(x, y);
      expect(source[3]).toBe(255);
      expect(pixels(bank, armId)(x, y)[3]).toBe(0);
      expect(pixels(repaired, `motion3:${armId}`)(x, y)).toEqual([
        ...source.slice(0, 4),
        1,
      ]);
      expect(pixels(repaired, repaired.upper.tee.torso)(x, y)[3]).toBe(0);
    }
    for (const id of [bank.lower.skirt.hips, bank.lower.skirt.garment!]) {
      expect(pixels(bank, id)(122, 168)[3]).toBe(255);
      expect(pixels(repaired, `motion3:${id}`)(122, 168)[3]).toBe(0);
    }
  });

  it("preserves the authored blue skirt, all unaffected pixels, palettes and attachment coordinates", () => {
    const bank = polishedBank(config);
    const snapshot = JSON.stringify(bank);
    const repaired = repairRunningArmParts(bank, config);
    expect(JSON.stringify(bank)).toBe(snapshot);
    expect(repaired.upper.tee.shoulderNear).toBe(bank.upper.tee.shoulderNear);
    expect(repaired.upper.tee.elbowNear).toBe(bank.upper.tee.elbowNear);
    expect(repaired.upper.tee.wristNear).toBe(bank.upper.tee.wristNear);
    expect(repaired.lower.skirt.hipNear).toBe(bank.lower.skirt.hipNear);
    expect(repaired.portraits).toBe(bank.portraits);
    const skirt = bank.lower.skirt.garment!;
    for (let y = 190; y <= 199; y++) {
      for (let x = 60; x <= 136; x++)
        expect(pixels(repaired, repaired.lower.skirt.garment!)(x, y)).toEqual(
          pixels(bank, skirt)(x, y),
        );
    }
    for (const [x, y] of [
      [100, 173],
      [110, 180],
      [90, 185],
      [133, 192],
    ])
      expect(pixels(repaired, repaired.lower.skirt.garment!)(x, y)).toEqual(
        pixels(bank, skirt)(x, y),
      );
    const changed = new Set([
      bank.upper.tee.nearForearm,
      bank.upper.tee.farForearm,
      bank.upper.tee.torso,
      bank.lower.skirt.hips,
      bank.lower.skirt.garment,
    ]);
    for (const layer of bank.layers) {
      const actual = repaired.layers.find(
        (candidate) => candidate.id === layer.id,
      )!;
      expect(actual).toBe(layer);
      if (changed.has(layer.id))
        expect(
          repaired.layers.find(
            (candidate) => candidate.id === `motion3:${layer.id}`,
          ),
        ).toBeDefined();
      expect(actual.palette).toBe(layer.palette);
    }
  });

  it("leaves clean jacket and hoodie ownership intact", () => {
    for (const example of EVERYDAY_EXAMPLES.filter(
      (item) => item.id !== "coral-afternoon",
    )) {
      const bank = polishedBank(example.config);
      expect(repairRunningArmParts(bank, example.config)).toBe(bank);
    }
  });

  it("keeps source decoding independent when old and repaired layers render in either order", () => {
    const bank = polishedBank(config);
    const repaired = repairRunningArmParts(bank, config);
    const appearance: Parameters<typeof expressiveColors>[1] = {
      ...config,
      artworkVersion: 4,
      expression: config.expression === "neutral" ? "gentle" : config.expression,
    };
    for (const part of ["nearForearm", "farForearm", "torso"] as const) {
      const original = bank.layers.find(
        (layer) => layer.id === bank.upper.tee[part],
      )!;
      const corrected = repaired.layers.find(
        (layer) => layer.id === repaired.upper.tee[part],
      )!;
      const expectedOld = expressiveColors(
        { ...original, id: `test:old:${part}` },
        appearance,
      );
      const expectedNew = expressiveColors(
        { ...corrected, id: `test:new:${part}` },
        appearance,
      );
      for (const layer of [original, corrected, corrected, original]) {
        const result = expressiveColors(layer, appearance);
        expect(result.length).toBe(layer.width * layer.height * 4);
        expect(result).toEqual(layer === original ? expectedOld : expectedNew);
      }
    }
  });
});
