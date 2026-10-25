import { describe, expect, it } from "vitest";
import type {
  BakedCharacterRecipe,
  PortableCharacterPackManifest,
} from "../core/types";
import {
  createThemeComparisonPlanes,
  THEME_COMPARISON_MAX_PIXELS,
  sourcePixelComparisonScale,
} from "./comparison";

function geometry(
  width: number,
  height: number,
  x: number,
  y: number,
  pixel = false,
) {
  return {
    spritesheet: { frameWidth: width, frameHeight: height },
    anchor: { x, y },
    scale: { pixelArt: pixel, integerOnly: pixel, recommended: 1 },
  } as Pick<PortableCharacterPackManifest, "spritesheet" | "anchor" | "scale">;
}
const original = geometry(704, 1056, 352, 998);
describe("bounded theme comparison geometry", () => {
  it("aligns both source anchors and fits their complete rectangles", () => {
    const current = geometry(200, 300, 10, 250, true);
    const result = createThemeComparisonPlanes(current, original, "right");
    expect(result.unavailable).toBeNull();
    const [a, b] = result.planes!;
    expect(a.anchor).toEqual(b.anchor);
    expect(a.sourceScale).toBe(1);
    expect(b.sourceScale).toBe(300 / 1056);
    expect(a.width * a.height).toBeLessThanOrEqual(THEME_COMPARISON_MAX_PIXELS);
    for (const [plane, source] of [
      [a, current],
      [b, original],
    ] as const) {
      expect(
        plane.anchor.x - source.anchor.x * plane.sourceScale,
      ).toBeGreaterThanOrEqual(0);
      expect(
        plane.anchor.y - source.anchor.y * plane.sourceScale,
      ).toBeGreaterThanOrEqual(0);
      expect(
        plane.anchor.x +
          (source.spritesheet.frameWidth - source.anchor.x) * plane.sourceScale,
      ).toBeLessThanOrEqual(plane.width);
      expect(
        plane.anchor.y +
          (source.spritesheet.frameHeight - source.anchor.y) *
            plane.sourceScale,
      ).toBeLessThanOrEqual(plane.height);
    }
  });
  it("mirrors asymmetric attachment points without changing canvas bounds", () => {
    const current = geometry(200, 300, 10, 250, true);
    const right = createThemeComparisonPlanes(
      current,
      original,
      "right",
    ).planes!;
    const left = createThemeComparisonPlanes(current, original, "left").planes!;
    expect(right[0].width).toBe(left[0].width);
    expect(right[0].anchor.x + left[0].anchor.x).toBe(right[0].width);
    expect(right[0].anchor.y).toBe(left[0].anchor.y);
  });
  it("refuses excessive unions of valid independently bounded native frames", () => {
    const large = geometry(8192, 8192, 0, 0, true);
    const result = createThemeComparisonPlanes(large, original, "right");
    expect(result.planes).toBeNull();
    expect(result.unavailable).toMatch(/Native preview/);
    expect(large.spritesheet.frameWidth).toBe(8192); // no mutation or rescaling of accepted artwork
  });
  it("retains ordinary smooth comparison geometry and rejects nonfinite geometry", () => {
    const same = createThemeComparisonPlanes(
      original,
      original,
      "right",
    ).planes!;
    expect(same[0]).toMatchObject({
      width: 704,
      height: 1056,
      sourceScale: 1,
      integerDisplay: false,
    });
    expect(
      createThemeComparisonPlanes(
        geometry(704, Infinity, 0, 0),
        original,
        "right",
      ).planes,
    ).toBeNull();
  });
  it("never normalizes a pixel reference with fractional sampling", () => {
    const pixel = geometry(200, 200, 100, 190, true);
    expect(
      createThemeComparisonPlanes(geometry(300, 300, 150, 280), pixel, "right")
        .unavailable,
    ).toMatch(/integer pixel/);
    expect(
      createThemeComparisonPlanes(geometry(400, 400, 200, 380), pixel, "right")
        .planes?.[1].sourceScale,
    ).toBe(2);
  });
});

const sourceHash = "a".repeat(64);

function sourcePixelFixture(wedding = false) {
  const source = wedding
    ? geometry(768, 1184, 384, 1126)
    : geometry(704, 1056, 352, 998);
  const padding = wedding
    ? { left: 0, top: 2, right: 0, bottom: 6 }
    : { left: 32, top: 130, right: 32, bottom: 6 };
  const anchor = { x: 96, y: 282, units: "pixels", origin: "top-left" };
  const metadata = {
    version: 1,
    method: "fixed-premultiplied-box4-shared128-v1",
    sourceDivisor: 4,
    sourceSha256: sourceHash,
    sourceSize: [source.spritesheet.frameWidth, source.spritesheet.frameHeight],
    sourceAnchor: { ...source.anchor, units: "pixels", origin: "top-left" },
    sourcePadding: padding,
    paddedSourceSize: [768, 1192],
    nativeFrame: [192, 298],
    anchor,
    bodyTransform: {
      scaleNumerator: 1,
      scaleDenominator: 4,
      translateSourcePixels: [padding.left, padding.top],
    },
  };
  const current = {
    manifest: {
      ...geometry(192, 298, 96, 282, true),
      schemaVersion: 4,
      generator: "gathria-offline-source-pixel-full-v1",
    } as PortableCharacterPackManifest,
    config: {
      format: "gathria-baked-character",
      schemaVersion: 1,
      name: "Source pixel comparison fixture",
      characterId: "source-pixel-comparison-fixture",
      source: {
        kind: "unified-archive",
        name: "original.character.zip",
        sha256: sourceHash,
      },
      provenance: "Fixed quarter-scale processing of the declared source.",
      derivation: {
        method: "fixed-premultiplied-box4-shared128-v1",
        frames: [{ frameId: 0, sourceFrame: 0, timeSeconds: 0 }],
      },
      sourceMetadata: { sourcePixelFull: metadata },
    } as BakedCharacterRecipe,
  };
  const original = { manifest: source as PortableCharacterPackManifest };
  return { current, original, metadata };
}

describe("source-derived pixel comparison geometry", () => {
  it.each([false, true])(
    "aligns source points exactly for wedding=%s without scaling transparent padding",
    (wedding) => {
      const { current, original, metadata } = sourcePixelFixture(wedding);
      const scale = sourcePixelComparisonScale(current, original, sourceHash);
      expect(scale).toBe(1 / 4);
      for (const facing of ["right", "left"] as const) {
        const planes = createThemeComparisonPlanes(
          current.manifest,
          original.manifest,
          facing,
          scale,
        ).planes!;
        expect(planes[0]).toMatchObject({
          width: 192,
          height: 298,
          anchor: { x: 96, y: 282 },
        });
        expect(planes[1].sourceScale).toBe(1 / 4);
        const sign = facing === "right" ? 1 : -1;
        const point = { x: 300, y: 400 };
        const mapped = {
          x: (point.x + metadata.sourcePadding.left) / 4,
          y: (point.y + metadata.sourcePadding.top) / 4,
        };
        expect(
          planes[0].anchor.x + sign * (mapped.x - current.manifest.anchor.x),
        ).toBe(
          planes[1].anchor.x +
            (sign * (point.x - original.manifest.anchor.x)) / 4,
        );
        expect(planes[0].anchor.y + mapped.y - current.manifest.anchor.y).toBe(
          planes[1].anchor.y + (point.y - original.manifest.anchor.y) / 4,
        );
      }
    },
  );

  it.each([
    [
      "unrelated archive",
      (f) => {
        f.current.config.source.sha256 = "b".repeat(64);
      },
    ],
    [
      "unrelated metadata",
      (f) => {
        f.metadata.sourceSha256 = "b".repeat(64);
      },
    ],
    [
      "unknown generator",
      (f) => {
        f.current.manifest.generator = "unknown-pixel-generator";
      },
    ],
    [
      "unknown metadata version",
      (f) => {
        f.metadata.version = 2;
      },
    ],
    [
      "wrong source divisor",
      (f) => {
        f.metadata.sourceDivisor = 8;
      },
    ],
    [
      "wrong source dimensions",
      (f) => {
        f.metadata.sourceSize[0]++;
      },
    ],
    [
      "wrong source anchor",
      (f) => {
        f.metadata.sourceAnchor.y++;
      },
    ],
    [
      "nonfinite padding",
      (f) => {
        f.metadata.sourcePadding.top = Infinity;
      },
    ],
    [
      "negative padding",
      (f) => {
        f.metadata.sourcePadding.left = -1;
      },
    ],
    [
      "fractional padding",
      (f) => {
        f.metadata.sourcePadding.bottom = 6.5;
      },
    ],
    [
      "wrong padded size",
      (f) => {
        f.metadata.paddedSourceSize[1]++;
      },
    ],
    [
      "wrong output size",
      (f) => {
        f.metadata.nativeFrame[1]++;
      },
    ],
    [
      "wrong output anchor",
      (f) => {
        f.metadata.anchor.y++;
      },
    ],
    [
      "wrong transform",
      (f) => {
        f.metadata.bodyTransform.translateSourcePixels[1]++;
      },
    ],
    [
      "missing metadata",
      (f) => {
        f.current.config.sourceMetadata = undefined;
      },
    ],
    [
      "pixel reference",
      (f) => {
        f.original.manifest.scale.pixelArt = true;
      },
    ],
  ] satisfies Array<
    [string, (fixture: ReturnType<typeof sourcePixelFixture>) => void]
  >)("retains legacy normalization for %s", (_, change) => {
    const fixture = sourcePixelFixture();
    change(fixture);
    const scale = sourcePixelComparisonScale(
      fixture.current,
      fixture.original,
      sourceHash,
    );
    expect(scale).toBeUndefined();
    expect(
      createThemeComparisonPlanes(
        fixture.current.manifest,
        fixture.original.manifest,
        "right",
        scale,
      ).planes?.[1].sourceScale,
    ).toBe(298 / 1056);
  });

  it("leaves authored R2 comparison behavior unchanged", () => {
    const fixture = sourcePixelFixture();
    fixture.current.manifest = {
      ...geometry(192, 272, 96, 251, true),
      schemaVersion: 4,
      generator: "gathria-authored-theme-v1",
    } as PortableCharacterPackManifest;
    const scale = sourcePixelComparisonScale(
      fixture.current,
      fixture.original,
      sourceHash,
    );
    expect(scale).toBeUndefined();
    const before = createThemeComparisonPlanes(
      fixture.current.manifest,
      fixture.original.manifest,
      "right",
    );
    expect(
      createThemeComparisonPlanes(
        fixture.current.manifest,
        fixture.original.manifest,
        "right",
        scale,
      ),
    ).toEqual(before);
    expect(before.planes?.[1].sourceScale).toBe(272 / 1056);
  });

  it("rejects malformed reference hashes and unsafe explicit scales", () => {
    const fixture = sourcePixelFixture();
    expect(
      sourcePixelComparisonScale(fixture.current, fixture.original, "unknown"),
    ).toBeUndefined();
    for (const scale of [0, -1, Infinity, NaN, 1_000_000])
      expect(
        createThemeComparisonPlanes(
          fixture.current.manifest,
          fixture.original.manifest,
          "right",
          scale,
        ).planes,
      ).toBeNull();
  });
});
