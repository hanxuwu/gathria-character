import { describe, expect, it } from "vitest";
import { encodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import type {
  RegisteredFrame,
  WardrobeGarment,
  WardrobeProject,
} from "../wardrobe/contract";
import { auditFitting, fittingMetrics, fittingRows } from "./fitting-analysis";

const image = (width = 8, height = 8): RgbaPng => ({
  width,
  height,
  pixels: new Uint8Array(width * height * 4),
  colorChunks: [],
});
const put = (target: RgbaPng, x: number, y: number, a = 255) =>
  target.pixels.set([80, 110, 140, a], (y * target.width + x) * 4);
const registered: RegisteredFrame = {
  frameId: 0,
  sourceFrame: 200,
  points: {} as RegisteredFrame["points"],
  protected: [
    {
      label: "head",
      polygon: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 8, y: 2 },
        { x: 0, y: 2 },
      ],
    },
  ],
};
function fixture() {
  const patch = image(24, 8),
    mask = image(24, 8),
    source = image();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put(source, x, y);
  for (let frame = 0; frame < 3; frame++)
    for (let y = 3; y < 7; y++)
      for (let x = 2; x < 6; x++) {
        put(patch, frame * 8 + x, y);
        put(mask, frame * 8 + x, y);
      }
  const item: WardrobeGarment = {
    bytes: new Uint8Array(),
    sha256: "1".repeat(64),
    pages: [
      {
        patch: encodeSourceRgbaPng(patch),
        ownership: encodeSourceRgbaPng(mask),
      },
    ],
    manifest: {
      format: "gathria-sprite-garment",
      version: 1,
      id: "fit-test",
      name: "Cloth",
      slot: "top",
      sourceSha256: "a".repeat(64),
      registrationSha256: "b".repeat(64),
      characterId: "fixture",
      frameWidth: 8,
      frameHeight: 8,
      provenance: "Test",
      pages: [
        {
          file: "patches-0.png",
          maskFile: "ownership-0.png",
          width: 24,
          height: 8,
        },
      ],
      frames: [0, 1, 2].map((frameId) => ({
        frameId,
        page: 0,
        offset: { x: 0, y: 0 },
        rect: { x: frameId * 8, y: 0, width: 8, height: 8 },
      })),
    },
  };
  const project = {
    items: [item],
    document: {
      sourceSha256: "a".repeat(64),
      registrationSha256: "b".repeat(64),
    },
    archive: {
      manifest: {
        animations: {
          idle: { frames: [0], fps: 24, loop: true },
          walk: { frames: [0, 1, 2], fps: 24, loop: true },
          run: { frames: [0, 1, 2], fps: 24, loop: true },
          jump: { frames: [0, 1, 2], fps: 24, loop: false },
        },
      },
    },
    registration: {
      frames: [0, 1, 2].map((frameId) => ({
        ...registered,
        frameId,
        sourceFrame: 200 + frameId,
      })),
    },
  } as unknown as WardrobeProject;
  return { item, project, source };
}

describe("side fitting diagnostics", () => {
  it("reports separate islands and ownership violations without mutating art", () => {
    const { item, source } = fixture(),
      cloth = image(),
      ownership = image();
    for (let y = 3; y < 7; y++)
      for (let x = 2; x < 6; x++) {
        put(cloth, x, y);
        put(ownership, x, y);
      }
    put(cloth, 0, 0);
    put(ownership, 0, 0);
    put(cloth, 7, 7);
    for (let i = 0; i < ownership.pixels.length; i += 4)
      ownership.pixels[i] = ownership.pixels[i + 3] ? 255 : 0;
    const before = new Uint8Array(cloth.pixels);
    const metrics = fittingMetrics(item, registered, cloth, ownership, source);
    expect(metrics).toMatchObject({
      paintedPixels: 17,
      ownedPixels: 17,
      protectedOwnedPixels: 1,
      unownedPaintPixels: 1,
      smallIslands: 1,
      bounds: { x: 0, y: 0, width: 6, height: 7 },
    });
    expect(cloth.pixels).toEqual(before);
  });
  it("uses original alpha when reporting protected-region overlap", () => {
    const { item, source } = fixture(),
      cloth = image(),
      ownership = image();
    put(cloth, 0, 0);
    ownership.pixels.set([255, 255, 255, 255], 0);
    source.pixels[3] = 0;
    expect(
      fittingMetrics(item, registered, cloth, ownership, source)
        .protectedOwnedPixels,
    ).toBe(0);
    source.pixels[3] = 128;
    expect(
      fittingMetrics(item, registered, cloth, ownership, source)
        .protectedOwnedPixels,
    ).toBe(1);
  });
  it("includes loop seam but never invents jump end-to-start adjacency", async () => {
    const { project, source } = fixture();
    const report = await auditFitting(project, "fit-test", () => source);
    expect(report.rows).toHaveLength(10);
    expect(
      report.rows.find((r) => r.action === "walk" && r.position === 2)
        ?.nextFrameId,
    ).toBe(0);
    expect(
      report.rows.find((r) => r.action === "jump" && r.position === 2),
    ).toMatchObject({ nextFrameId: null, nextAreaChange: null });
    expect(report.garment.sha256).toBe("1".repeat(64));
    expect(
      report.rows.every(
        (r) => r.protectedOwnedPixels === 0 && r.unownedPaintPixels === 0,
      ),
    ).toBe(true);
  });
  it("compares real adjacent area and labels review prompts without pass/fail art claims", async () => {
    const { project, source } = fixture();
    const report = await auditFitting(project, "fit-test", () => source);
    const metrics = new Map(
      report.rows.map((row) => [
        row.frameId,
        { ...row, paintedPixels: row.frameId === 1 ? 32 : 16 },
      ]),
    );
    const rows = fittingRows(project, metrics);
    expect(
      rows.find((r) => r.action === "walk" && r.position === 0),
    ).toMatchObject({
      nextAreaChange: 0.5,
      prompts: ["检查相邻帧衣料面积变化"],
    });
    expect(
      rows.find((r) => r.action === "walk" && r.position === 2)?.nextAreaChange,
    ).toBe(0);
    metrics.delete(1);
    expect(() => fittingRows(project, metrics)).toThrow(/相邻姿势/);
  });
  it("cancels between frames without publishing a partial report", async () => {
    const { project, source } = fixture(),
      controller = new AbortController();
    const counts: number[] = [];
    await expect(
      auditFitting(project, "fit-test", () => source, {
        signal: controller.signal,
        onProgress: (done) => {
          counts.push(done);
          controller.abort();
        },
      }),
    ).rejects.toThrow(/cancelled/);
    expect(counts).toEqual([1]);
  });
  it("rejects absent garments and mismatched canvas dimensions", async () => {
    const { project, item, source } = fixture();
    await expect(
      auditFitting(project, "missing", () => source),
    ).rejects.toThrow(/选择/);
    expect(() =>
      fittingMetrics(item, registered, image(), image(4, 4), source),
    ).toThrow(/尺寸/);
  });
});
