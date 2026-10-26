import { describe, expect, it } from "vitest";
import type { RgbaPng } from "../core/baked-source";
import {
  applyPixelPalette,
  buildSharedPixelPalette,
  createPixelPaletteMapper,
  DEFAULT_PIXEL_SETTINGS,
  downsamplePixelFrame,
  type PixelGeometry,
  type PixelRgb,
  validatePixelSettings,
} from "./refine";

function image(
  width: number,
  height: number,
  fn: (x: number, y: number) => number[],
): RgbaPng {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) pixels.set(fn(x, y), (y * width + x) * 4);
  return { width, height, pixels, colorChunks: [] };
}
const grid = (width = 1, height = 1): PixelGeometry => ({
  factor: 4,
  width,
  height,
  padding: { left: 0, top: 0, right: 0, bottom: 0 },
  anchor: { x: 0, y: 0 },
});
const rgbSet = (im: RgbaPng) => {
  const colors = new Set<string>();
  for (let i = 0; i < im.pixels.length; i += 4)
    if (im.pixels[i + 3]) colors.add([...im.pixels.slice(i, i + 3)].join(","));
  return colors;
};

describe("fixed-grid pixel refinement", () => {
  it("uses declared transparent padding without fitting or moving the silhouette", () => {
    const source = image(5, 6, (x, y) =>
      x === 1 && y === 1 ? [12, 34, 56, 255] : [0, 0, 0, 0],
    );
    const geometry: PixelGeometry = {
      factor: 4,
      width: 2,
      height: 2,
      padding: { left: 1, top: 1, right: 2, bottom: 1 },
      anchor: { x: 1, y: 1 },
    };
    const output = downsamplePixelFrame(source, geometry, "nearest");
    expect([...output.pixels.slice(0, 4)]).toEqual([12, 34, 56, 255]);
    expect([...output.pixels.slice(4)]).toEqual(new Array(12).fill(0));
    expect(geometry.anchor).toEqual({ x: 1, y: 1 });
  });

  it("retains a coherent one-pixel dark stroke that nearest sampling skips", () => {
    const source = image(4, 4, (_x, y) =>
      y === 0 ? [25, 20, 18, 255] : [245, 214, 180, 255],
    );
    expect([...downsamplePixelFrame(source, grid(), "nearest").pixels]).toEqual(
      [245, 214, 180, 255],
    );
    expect([...downsamplePixelFrame(source, grid(), "detail").pixels]).toEqual([
      25, 20, 18, 255,
    ]);
  });

  it("does not promote an isolated dark speck into a full dark cell", () => {
    const source = image(4, 4, (x, y) =>
      x === 0 && y === 0 ? [25, 20, 18, 255] : [245, 214, 180, 255],
    );
    expect([...downsamplePixelFrame(source, grid()).pixels]).toEqual([
      245, 214, 180, 255,
    ]);
  });

  it("does not mix hidden green RGB into a retained skin edge", () => {
    const source = image(4, 4, (x) =>
      x < 2 ? [223, 171, 140, 255] : [0, 255, 0, 0],
    );
    expect([...downsamplePixelFrame(source, grid()).pixels]).toEqual([
      223, 171, 140, 255,
    ]);
    const fringe = image(4, 4, () => [0, 255, 0, 20]);
    expect([...downsamplePixelFrame(fringe, grid()).pixels]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("preserves flat material colors and returns independent pixel/chunk buffers", () => {
    const source = image(8, 4, (x) =>
      x < 4 ? [12, 78, 66, 255] : [201, 170, 139, 255],
    );
    source.colorChunks = [new Uint8Array([1, 2, 3])];
    const before = new Uint8Array(source.pixels);
    const output = downsamplePixelFrame(source, grid(2, 1));
    expect([...output.pixels]).toEqual([12, 78, 66, 255, 201, 170, 139, 255]);
    output.pixels[0] = 99;
    output.colorChunks[0][0] = 99;
    expect(source.pixels).toEqual(before);
    expect([...source.colorChunks[0]]).toEqual([1, 2, 3]);
  });

  it("rejects inconsistent dimensions, padding and unsupported settings", () => {
    const source = image(4, 4, () => [0, 0, 0, 255]);
    expect(() => downsamplePixelFrame(source, { ...grid(), width: 2 })).toThrow(
      /fixed/,
    );
    expect(() =>
      downsamplePixelFrame(source, {
        ...grid(),
        padding: { left: 4, top: 0, right: 0, bottom: 0 },
      }),
    ).toThrow(/fixed/);
    expect(() =>
      downsamplePixelFrame(
        { ...source, pixels: source.pixels.slice(4) },
        grid(),
      ),
    ).toThrow(/complete/);
    expect(validatePixelSettings(DEFAULT_PIXEL_SETTINGS)).toEqual(
      DEFAULT_PIXEL_SETTINGS,
    );
    expect(() =>
      validatePixelSettings({ ...DEFAULT_PIXEL_SETTINGS, factor: 3 }),
    ).toThrow();
    expect(() =>
      validatePixelSettings({ ...DEFAULT_PIXEL_SETTINGS, frameFit: true }),
    ).toThrow();
    expect(() =>
      validatePixelSettings({ ...DEFAULT_PIXEL_SETTINGS, colors: NaN }),
    ).toThrow();
  });
});

describe("shared perceptual pixel palette", () => {
  const bank = () => [
    image(80, 60, (x, y) => [
      (x * 3 + y) % 256,
      (y * 4 + x) % 256,
      (x * 7 + y * 3) % 256,
      255,
    ]),
    image(80, 60, (x, y) => [
      (x * 5 + y * 2) % 256,
      (x * 2 + y * 5) % 256,
      (x * 3 + y * 7) % 256,
      (x + y) % 7 === 0 ? 0 : 255,
    ]),
  ];

  it("fits the same bounded source-color palette regardless of frame order", () => {
    const frames = bank(),
      before = frames.map((f) => new Uint8Array(f.pixels));
    const forward = buildSharedPixelPalette(frames, 64);
    const reverse = buildSharedPixelPalette([...frames].reverse(), 64);
    expect(forward).toEqual(reverse);
    expect(forward.length).toBeLessThanOrEqual(64);
    expect(forward.length).toBeGreaterThan(48);
    const sourceColors = new Set(frames.flatMap((f) => [...rgbSet(f)]));
    expect(forward.every((c) => sourceColors.has(c.join(",")))).toBe(true);
    frames.forEach((f, i) => expect(f.pixels).toEqual(before[i]));
  });

  it("retains an already limited palette exactly and excludes invisible RGB", () => {
    const source = image(4, 1, (x) =>
      x === 3
        ? [0, 255, 0, 0]
        : [
            [11, 22, 33, 255],
            [244, 221, 195, 255],
            [82, 39, 24, 255],
          ][x],
    );
    const palette = buildSharedPixelPalette([source], 96);
    expect(palette).toEqual([
      [11, 22, 33],
      [82, 39, 24],
      [244, 221, 195],
    ]);
    const output = applyPixelPalette(source, palette);
    expect([...output.pixels.slice(0, 12)]).toEqual([
      ...source.pixels.slice(0, 12),
    ]);
    expect([...output.pixels.slice(12)]).toEqual([0, 0, 0, 0]);
  });

  it("maps identical RGB consistently across frames and palette input order", () => {
    const palette: PixelRgb[] = [
      [20, 18, 16],
      [230, 190, 160],
      [120, 72, 40],
    ];
    const a = image(2, 1, (x) =>
      x ? [119, 70, 41, 255] : [231, 188, 160, 255],
    );
    const b = image(2, 1, (x) =>
      x ? [231, 188, 160, 255] : [119, 70, 41, 255],
    );
    const map = createPixelPaletteMapper(palette);
    const first = map(a),
      second = map(b);
    expect(first.pixels.slice(0, 4)).toEqual(second.pixels.slice(4, 8));
    expect(first.pixels).toEqual(
      applyPixelPalette(a, [...palette].reverse()).pixels,
    );
    palette[0][0] = 255;
    expect(map(a).pixels).toEqual(first.pixels);
  });

  it("keeps held frames exact with a fitted full-bank palette", () => {
    const frames = bank(),
      palette = buildSharedPixelPalette(frames, 96),
      map = createPixelPaletteMapper(palette);
    const first = map(frames[0]);
    map(frames[1]);
    expect(map(frames[0]).pixels).toEqual(first.pixels);
    expect(rgbSet(first).size).toBeLessThanOrEqual(96);
  });

  it("handles transparent banks and rejects malformed palette/alpha", () => {
    const empty = image(4, 1, () => [20, 30, 40, 0]);
    expect(buildSharedPixelPalette([empty], 64)).toEqual([]);
    expect([...applyPixelPalette(empty, []).pixels]).toEqual(
      new Array(16).fill(0),
    );
    expect(() => buildSharedPixelPalette([], 64)).toThrow();
    expect(() => createPixelPaletteMapper([[1, 2, 256]])).toThrow();
    expect(() =>
      applyPixelPalette(
        image(1, 1, () => [12, 34, 56, 255]),
        [],
      ),
    ).toThrow(/nonempty/);
    expect(() =>
      applyPixelPalette(
        image(1, 1, () => [12, 34, 56, 128]),
        [[12, 34, 56]],
      ),
    ).toThrow(/binary/);
  });
});
