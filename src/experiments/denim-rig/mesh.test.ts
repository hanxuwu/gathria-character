import { describe, expect, it } from "vitest";
import { IllustratedCanvas } from "../../core/illustrated-canvas";
import type { IllustratedLayer } from "../../core/illustrated-types";
import type { Point } from "../../core/pixel-art";
import {
  createLimbMesh,
  deformLimbMesh,
  prepareMeshLimb,
  rasterizeTexturedMesh,
} from "./mesh";

const joints: [Point, Point, Point] = [
  [70, 110],
  [70, 130],
  [70, 150],
];
const bounds = [63.5, 107.5, 76.5, 152.5] as const;
const alphaCount = (pixels: Uint8ClampedArray) =>
  pixels.reduce((n, v, i) => n + Number(i % 4 === 3 && v !== 0), 0);
function texture() {
  const pixels = new Uint8ClampedArray(192 * 256 * 4);
  for (let y = 108; y <= 152; y++)
    for (let x = 64; x <= 76; x++) {
      pixels.set([x, y, 91, 255], (y * 192 + x) * 4);
    }
  // Alpha holes must remain holes; skinning must not fill in a colored disk.
  pixels.fill(0, (118 * 192 + 68) * 4, (118 * 192 + 68) * 4 + 4);
  return pixels;
}

describe("independent weighted limb mesh", () => {
  it("rasterizes the bind pose byte-for-byte, preserving source texture and transparency", () => {
    const mesh = createLimbMesh(bounds, joints),
      pixels = texture();
    const canvas = new IllustratedCanvas();
    rasterizeTexturedMesh(
      canvas,
      pixels,
      mesh.rest,
      deformLimbMesh(mesh, joints),
      mesh.triangles,
    );
    expect(canvas.pixels).toEqual(pixels);
  });

  it("normalizes weights, provides both rigid and shared influences, and translates as a whole", () => {
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
    const vertices = deformLimbMesh(mesh, translated);
    vertices.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(mesh.rest[i][0] + 12, 10);
      expect(p[1]).toBeCloseTo(mesh.rest[i][1] - 9, 10);
    });
  });

  it("does not crack along triangle edges under a rotated and translated rigid pose", () => {
    // Exact 90° rotation maps integer source centres to integer destination centres.
    const turn = ([x, y]: Point): Point => [175 - y, x + 40];
    const mesh = createLimbMesh(bounds, joints);
    const posed = joints.map(turn) as [Point, Point, Point];
    const pixels = texture(),
      canvas = new IllustratedCanvas();
    rasterizeTexturedMesh(
      canvas,
      pixels,
      mesh.rest,
      deformLimbMesh(mesh, posed),
      mesh.triangles,
    );
    const expected = new Uint8ClampedArray(pixels.length);
    for (let y = 108; y <= 152; y++)
      for (let x = 64; x <= 76; x++) {
        const [tx, ty] = turn([x, y]);
        expected.set(
          pixels.subarray((y * 192 + x) * 4, (y * 192 + x) * 4 + 4),
          (ty * 192 + tx) * 4,
        );
      }
    expect(canvas.pixels).toEqual(expected);
  });

  it("keeps an acute fold bounded, deterministic and binary-alpha", () => {
    const mesh = createLimbMesh(bounds, joints);
    const posed: [Point, Point, Point] = [
      [80, 120],
      [95, 133],
      [79, 122],
    ];
    const first = deformLimbMesh(mesh, posed),
      second = deformLimbMesh(mesh, posed);
    expect(first).toEqual(second);
    for (const p of first)
      for (const n of p) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThan(50);
        expect(n).toBeLessThan(160);
      }
    const canvas = new IllustratedCanvas();
    rasterizeTexturedMesh(canvas, texture(), mesh.rest, first, mesh.triangles);
    expect(alphaCount(canvas.pixels)).toBeGreaterThan(100);
    expect(
      [...new Set(canvas.pixels.filter((_, i) => i % 4 === 3))].sort(),
    ).toEqual([0, 255]);
  });

  it("rejects invalid or collapsed bones instead of producing invalid coordinates", () => {
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

  it("assembles only the assigned limb pixels and removes the separately attached shoe", () => {
    const layer = (
      id: string,
      y: number,
      height: number,
    ): IllustratedLayer => ({
      id,
      x: 64,
      y,
      width: 13,
      height,
      data: "",
      palette: {},
    });
    const layers = [
      layer("upper", 108, 23),
      layer("lower", 130, 23),
      layer("shoe", 148, 5),
    ];
    const colored = layers.map((l, index) => {
      const pixels = new Uint8ClampedArray(l.width * l.height * 4);
      for (let i = 0; i < pixels.length; i += 4)
        pixels.set([40 + index, 90, 120, 255], i);
      return pixels;
    });
    const requireLayer = (id: string) => layers.find((l) => l.id === id)!;
    const colors = (id: string) =>
      colored[layers.findIndex((l) => l.id === id)];
    const limb = prepareMeshLimb(
      requireLayer,
      colors,
      ["upper", "lower"],
      joints,
      { excludeId: "shoe" },
    );
    const canvas = new IllustratedCanvas();
    limb.draw(canvas, joints);
    expect(alphaCount(canvas.pixels)).toBe(13 * 40);
    expect(canvas.pixels[(140 * 192 + 70) * 4]).toBe(41);
    expect(canvas.pixels[(148 * 192 + 70) * 4 + 3]).toBe(0);
    const inspection = limb.inspect(joints);
    expect(inspection.weights).toHaveLength(inspection.vertices.length * 2);
    expect(inspection.triangles.length % 3).toBe(0);
  });
});
