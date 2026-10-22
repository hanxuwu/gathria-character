import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import type { BakedCharacterPackManifest } from "../core/types";
import type { ProtectedRegion } from "../wardrobe/contract";
import type {
  AppearanceBank,
  AppearanceLayerRole,
  AppearancePose,
} from "./contract";
import {
  AppearanceRenderer,
  appearanceOutputManifest,
  padAppearanceFrame,
} from "./render";

const image = (width: number, height: number, color: number[]): RgbaPng => ({
  width,
  height,
  colorChunks: [],
  pixels: new Uint8Array(
    Array.from({ length: width * height }, () => color).flat(),
  ),
});
const pixel = (im: RgbaPng, x: number, y: number) =>
  Array.from(
    im.pixels.subarray((y * im.width + x) * 4, (y * im.width + x + 1) * 4),
  );
const box = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];
const pose: AppearancePose = {
  frameId: 7,
  sourceFrame: 100,
  anchors: Object.fromEntries(
    ["headCenter", "crown", "chin", "nearEye", "farEye", "mouth"].map((key) => [
      key,
      { x: 1, y: 1 },
    ]),
  ) as AppearancePose["anchors"],
  headBounds: { x: 0, y: 0, width: 4, height: 2 },
  facePolygon: box(0, 0, 3, 2),
  hairBounds: { x: -1, y: -1, width: 6, height: 6 },
  foreground: [box(3, 1, 1, 1)],
};
function bank(
  role: AppearanceLayerRole,
  offset: { x: number; y: number },
  color = [200, 100, 50, 128],
  width = 1,
  height = 1,
): AppearanceBank {
  const patch = encodeSourceRgbaPng(image(width, height, color)),
    ownership = encodeSourceRgbaPng(image(width, height, [0, 0, 0, 255]));
  return {
    bytes: new Uint8Array(),
    sha256: createHash("sha256")
      .update(patch)
      .update(JSON.stringify({ role, offset }))
      .digest("hex"),
    pages: [{ patch, ownership }],
    manifest: {
      format: "gathria-sprite-appearance-bank",
      version: 1,
      id: "fixture",
      name: "Fixture",
      sourceSha256: "a".repeat(64),
      registrationSha256: "b".repeat(64),
      characterId: "test",
      frameWidth: 4,
      frameHeight: 4,
      padding: { left: 1, top: 1, right: 1, bottom: 0 },
      poses: [structuredClone(pose)],
      pages: [
        { file: "patches-0.png", maskFile: "ownership-0.png", width, height },
      ],
      provenance: "Authored fixture",
      styles: [
        {
          id: "test",
          name: "Test",
          slot: role === "face" ? "face" : "hair",
          layers: [
            {
              role,
              frames: [
                {
                  frameId: 7,
                  mode: "paint",
                  page: 0,
                  rect: { x: 0, y: 0, width, height },
                  offset,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}
function renderer(
  data: AppearanceBank,
  protectedRegions: ProtectedRegion[] = [],
  hairColor: "chestnut" | "espresso" | "copper" = "chestnut",
) {
  return new AppearanceRenderer(
    data,
    {
      hairId: data.manifest.styles[0].slot === "hair" ? "test" : null,
      faceId: data.manifest.styles[0].slot === "face" ? "test" : null,
      hairColor,
    },
    new Map([[7, protectedRegions]]),
  );
}

describe("registered head appearance rendering", () => {
  it("translates original bytes including invisible RGB, soft alpha, and profiles without rescaling", () => {
    const source = image(4, 4, [100, 120, 140, 255]);
    source.pixels.set([91, 76, 53, 0], 12);
    source.pixels.set([211, 127, 75, 31], 4);
    source.colorChunks = [new Uint8Array([1, 2, 3])];
    const padded = padAppearanceFrame(source, {
      left: 2,
      top: 3,
      right: 1,
      bottom: 0,
    });
    expect([padded.width, padded.height]).toEqual([7, 7]);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++)
        expect(pixel(padded, x + 2, y + 3)).toEqual(pixel(source, x, y));
    expect(padded.colorChunks).toEqual(source.colorChunks);
    padded.colorChunks[0][0] = 9;
    expect(source.colorChunks[0][0]).toBe(1);
  });

  it("blends front locks, places back hair behind source, and does not flatten antialiased alpha", () => {
    const source = image(4, 4, [100, 120, 140, 255]);
    const front = renderer(bank("hair-front", { x: 1, y: 1 })).render(
      7,
      source,
      source,
    );
    expect(pixel(front, 2, 2)).toEqual([150, 110, 95, 255]);
    const back = renderer(bank("hair-back", { x: 1, y: 1 })).render(
      7,
      source,
      source,
    );
    expect(pixel(back, 2, 2)).toEqual([100, 120, 140, 255]);
    const extension = renderer(bank("hair-front", { x: 1, y: -1 })).render(
      7,
      source,
      source,
    );
    expect(pixel(extension, 2, 0)).toEqual([200, 100, 50, 128]);
    source.pixels.set([100, 120, 140, 64], (1 * 4 + 1) * 4);
    const translucentBack = renderer(bank("hair-back", { x: 1, y: 1 })).render(
      7,
      source,
      source,
    );
    expect(pixel(translucentBack, 2, 2)[3]).toBe(160);
  });

  it("keeps original hands and dressed body in front without deleting hair by color", () => {
    const source = image(4, 4, [100, 120, 140, 255]);
    const dressed = image(4, 4, [40, 80, 110, 255]);
    const hands: ProtectedRegion[] = [
      { label: "nearHand", polygon: box(1, 1, 1, 1) },
    ];
    const result = renderer(
      bank("hair-front", { x: 0, y: 0 }, [230, 180, 90, 255], 4, 4),
      hands,
    ).render(7, source, dressed);
    expect(pixel(result, 1, 1)).toEqual([230, 180, 90, 255]);
    expect(pixel(result, 2, 2)).toEqual([40, 80, 110, 255]); // protected hand
    expect(pixel(result, 4, 2)).toEqual([40, 80, 110, 255]); // foreground arm
    for (let y = 2; y < 4; y++)
      for (let x = 0; x < 4; x++)
        expect(pixel(result, x + 1, y + 1)).toEqual(pixel(dressed, x, y));
  });

  it("restricts face replacement to inner face and original alpha; explicit source frames retain blinks", () => {
    const source = image(4, 4, [100, 120, 140, 255]);
    expect(
      pixel(
        renderer(bank("face", { x: 1, y: 1 }, [201, 151, 101, 255])).render(
          7,
          source,
          source,
        ),
        2,
        2,
      ),
    ).toEqual([201, 151, 101, 255]);
    expect(() =>
      renderer(bank("face", { x: 1, y: 2 }, [201, 151, 101, 255])).render(
        7,
        source,
        source,
      ),
    ).toThrow(/protected source/);
    expect(() =>
      renderer(bank("face", { x: 1, y: 1 })).render(7, source, source),
    ).toThrow(/retain original source alpha/);
    const original = bank("face", { x: 1, y: 1 });
    original.manifest.styles[0].layers[0].frames[0] = {
      frameId: 7,
      mode: "source",
      reason: "Original blink retained",
    };
    expect(renderer(original).render(7, source, source)).toEqual(
      padAppearanceFrame(source, original.manifest.padding),
    );
  });

  it("tints only registered hair and rejects profile mismatch or out-of-padding artwork", () => {
    const source = image(4, 4, [100, 120, 140, 255]);
    const colored = renderer(
      bank("hair-front", { x: 1, y: 1 }),
      [],
      "copper",
    ).render(7, source, source);
    expect(pixel(colored, 2, 2)).not.toEqual([150, 110, 95, 255]);
    expect(pixel(colored, 2, 4)).toEqual([100, 120, 140, 255]);
    source.colorChunks = [new Uint8Array([1])];
    expect(() =>
      renderer(bank("hair-front", { x: 1, y: 1 })).render(7, source, source),
    ).toThrow(/color profile/);
    source.colorChunks = [];
    expect(() =>
      renderer(bank("hair-front", { x: 1, y: -2 })).render(7, source, source),
    ).toThrow(/clips output padding/);
  });
});

describe("appearance baked output geometry", () => {
  it("packs 96 padded source poses into normal V3 pages while preserving identity, anchor and animation timing", () => {
    const manifest: BakedCharacterPackManifest = {
      format: "gathria-character-pack",
      schemaVersion: 3,
      name: "Kling",
      generator: "fixture",
      spritesheet: {
        file: "spritesheet.png",
        width: 704 * 8,
        height: 1056 * 6,
        frameWidth: 704,
        frameHeight: 1056,
        columns: 8,
        rows: 6,
      },
      additionalSheets: [
        {
          file: "spritesheet-1.png",
          width: 704 * 8,
          height: 1056 * 6,
          frameWidth: 704,
          frameHeight: 1056,
          columns: 8,
          rows: 6,
        },
      ],
      frames: Array.from({ length: 96 }, (_, id) => ({
        id,
        page: Math.floor(id / 48),
        x: (id % 8) * 704,
        y: Math.floor((id % 48) / 8) * 1056,
        width: 704,
        height: 1056,
      })),
      animations: {
        idle: { frames: [0, 0, 1], fps: 24, loop: true },
        walk: { frames: [4, 5], fps: 24, loop: true },
        jump: { frames: [80, 84, 84, 95], fps: 24, loop: false },
      },
      anchor: { x: 352, y: 998, units: "pixels", origin: "top-left" },
      facing: { native: "right", right: "none", left: "mirror-x" },
      scale: { pixelArt: false, recommended: 1, integerOnly: false },
      capabilities: { renderMode: "baked", editableAppearance: false },
      configuration: "character.json",
    };
    const output = appearanceOutputManifest(manifest, {
      left: 32,
      top: 64,
      right: 32,
      bottom: 0,
    });
    expect(output.schemaVersion).toBe(3);
    if (output.schemaVersion !== 3) throw Error("Expected V3");
    expect(output.additionalSheets).toHaveLength(2);
    expect(output.spritesheet).toMatchObject({
      frameWidth: 768,
      frameHeight: 1120,
      columns: 8,
      rows: 4,
    });
    expect(output.anchor).toEqual({ ...manifest.anchor, x: 384, y: 1062 });
    expect(output.frames.map((frame) => frame.id)).toEqual(
      manifest.frames.map((frame) => frame.id),
    );
    expect(output.frames[32]).toMatchObject({ id: 32, page: 1, x: 0, y: 0 });
    expect(output.animations).toEqual(manifest.animations);
    expect(manifest.anchor).toMatchObject({ x: 352, y: 998 });
  });
});
