import { describe, expect, it } from "vitest";
import { createLimbMesh, deformLimbMesh, type Point } from "./geometry";

const joints: [Point, Point, Point] = [
  [70, 110],
  [70, 130],
  [70, 150],
];
const bounds = [63.5, 107.5, 76.5, 152.5] as const;

describe("native weighted limb geometry", () => {
  it("normalizes influences and preserves translation of the complete limb", () => {
    const mesh = createLimbMesh(bounds, joints);
    expect(mesh.weights.some((w) => w > 0 && w < 1)).toBe(true);
    expect(mesh.weights).toContain(0);
    expect(mesh.weights).toContain(1);
    for (let i = 0; i < mesh.weights.length; i += 2)
      expect(mesh.weights[i] + mesh.weights[i + 1]).toBeCloseTo(1, 12);
    const translated = joints.map(([x, y]) => [x + 12, y - 9] as Point) as [
      Point,
      Point,
      Point,
    ];
    deformLimbMesh(mesh, translated).forEach((p, i) => {
      expect(p[0]).toBeCloseTo(mesh.rest[i][0] + 12, 10);
      expect(p[1]).toBeCloseTo(mesh.rest[i][1] - 9, 10);
    });
  });

  it("keeps an acute fold bounded and deterministic", () => {
    const mesh = createLimbMesh(bounds, joints);
    const posed: [Point, Point, Point] = [
      [80, 120],
      [95, 133],
      [79, 122],
    ];
    const first = deformLimbMesh(mesh, posed);
    expect(first).toEqual(deformLimbMesh(mesh, posed));
    for (const p of first)
      for (const n of p) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThan(50);
        expect(n).toBeLessThan(160);
      }
  });

  it("rejects collapsed joints and invalid deformation options", () => {
    expect(() =>
      createLimbMesh(bounds, [
        [0, 0],
        [0, 0],
        [0, 20],
      ]),
    ).toThrow("nonzero");
    const mesh = createLimbMesh(bounds, joints);
    expect(() =>
      deformLimbMesh(mesh, [
        [0, 0],
        [0, 10],
        [0, 10],
      ]),
    ).toThrow("nonzero");
    expect(() => createLimbMesh(bounds, joints, { blendRadius: 0 })).toThrow(
      "positive",
    );
    expect(() =>
      createLimbMesh(bounds, joints, { volume: Number.NaN }),
    ).toThrow("volume");
  });
});
