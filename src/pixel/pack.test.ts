import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { decodeSourceRgbaPng, encodeSourceRgbaPng } from "../core/baked-source";
import {
  createBakedCharacterPack,
  readPortableCharacterPackArchive,
} from "../core/pack";
import { sha256 } from "../core/sha256";
import type {
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
  CharacterPackV3Manifest,
  JsonValue,
  PortableAnimationName,
} from "../core/types";
import { readMotionFlow } from "../consumer/motion-flow";
import {
  buildPixelCandidate,
  pixelMapping,
  type PixelBuildProgress,
} from "./pack";
import { DEFAULT_PIXEL_SETTINGS } from "./refine";

const COLORS = [
  [224, 160, 104],
  [40, 95, 108],
  [38, 41, 57],
] as const;
const actions: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];

function fixture(multi = true) {
  const width = 11,
    height = 13;
  const sheet = {
    width: width * (multi ? 2 : 3),
    height,
    frameWidth: width,
    frameHeight: height,
    columns: multi ? 2 : 3,
    rows: 1,
  };
  const common = {
    format: "gathria-character-pack" as const,
    name: "Pixel source fixture",
    generator: "source-test",
    spritesheet: { ...sheet, file: "spritesheet.png" as const },
    animations: {
      idle: { frames: [3, 3, 11], fps: 24, loop: true },
      walk: { frames: [11, 42, 3], fps: 24, loop: true },
      run: { frames: [42, 11, 3, 3], fps: 24, loop: true },
      jump: { frames: [3, 11, 42, 42], fps: 24, loop: false },
      celebrate: { frames: [11, 11, 42], fps: 12, loop: true },
    },
    anchor: {
      x: 5,
      y: 12,
      units: "pixels" as const,
      origin: "top-left" as const,
    },
    facing: {
      native: "right" as const,
      right: "none" as const,
      left: "mirror-x" as const,
    },
    scale: {
      pixelArt: false as const,
      integerOnly: false as const,
      recommended: 1,
    },
    capabilities: {
      renderMode: "baked" as const,
      editableAppearance: false as const,
    },
    configuration: "character.json" as const,
  };
  const ids = [3, 11, 42];
  const frames = ids.map((id, i) => ({
    id,
    x: (multi && i === 2 ? 0 : i) * width,
    y: 0,
    width,
    height,
    ...(multi ? { page: i === 2 ? 1 : 0 } : {}),
  }));
  // The manifest deliberately does not sort by ID/page: conversion must retain IDs,
  // animation references and derivation, rather than replacing them by positions.
  const manifest: CharacterPackV2Manifest | CharacterPackV3Manifest = multi
    ? {
        ...common,
        schemaVersion: 3,
        frames: [
          frames[2],
          frames[0],
          frames[1],
        ] as CharacterPackV3Manifest["frames"],
        additionalSheets: [
          { ...sheet, file: "spritesheet-1.png", width, columns: 1 },
        ],
      }
    : {
        ...common,
        schemaVersion: 2,
        frames: [frames[2], frames[0], frames[1]],
      };
  const config: BakedCharacterRecipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: common.name,
    characterId: "male",
    source: {
      kind: "video-extraction",
      name: "approved.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Approved source and clothes; no reconstruction.",
    derivation: {
      method: "Exact source selection",
      frames: [42, 3, 11].map((frameId) => ({
        frameId,
        sourceFrame: frameId + 100,
        timeSeconds: (frameId + 100) / 24,
      })),
    },
    sourceMetadata: {
      wardrobe: { selection: { top: "teal", bottom: "shorts" } },
      appearance: { selection: { hair: "original", expression: "gentle" } },
      motionFlow: JSON.parse(
        JSON.stringify({
          format: "gathria-motion-flow",
          version: 1,
          characterId: "male",
          actions: common.animations,
          routes: actions.flatMap((from) =>
            actions
              .filter((to) => to !== from)
              .map((to) => ({
                from,
                to,
                exit: common.animations[from].frames.length,
                entry: 0,
              })),
          ),
          returnToIdle: ["jump"],
        }),
      ) as JsonValue,
    },
  };
  const pages = multi ? [COLORS.slice(0, 2), COLORS.slice(2)] : [COLORS];
  const pngs = pages.map((colors) => {
    const pageWidth = colors.length * width;
    const pixels = new Uint8Array(pageWidth * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < pageWidth; x++)
        pixels.set(
          [...colors[Math.floor(x / width)], 255],
          (y * pageWidth + x) * 4,
        );
    return encodeSourceRgbaPng({
      width: pageWidth,
      height,
      pixels,
      colorChunks: [],
    });
  });
  const files = {
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "character.json": strToU8(JSON.stringify(config)),
    "PROVENANCE.txt": strToU8(config.provenance),
    "INTEGRATION.md": strToU8("Native source"),
    "spritesheet.png": pngs[0],
    ...(multi ? { "spritesheet-1.png": pngs[1] } : {}),
  };
  return { manifest, config, files, bytes: zipSync(files) };
}

describe("pixel candidate archive bridge", () => {
  it.each([false, true])(
    "preserves every source ID, hold, action clock and motion-flow while producing a loadable V4 (multi=%s)",
    async (multi) => {
      const source = fixture(multi),
        before = new Uint8Array(source.bytes);
      expect(readMotionFlow(source.manifest, source.config)).not.toBeNull();
      const result = await buildPixelCandidate(
        source.bytes,
        DEFAULT_PIXEL_SETTINGS,
      );
      const loaded = readPortableCharacterPackArchive(result.bytes);
      expect(loaded.manifest.schemaVersion).toBe(4);
      expect(loaded.manifest.animations).toEqual(source.manifest.animations);
      expect(loaded.manifest.frames.map((f) => f.id)).toEqual([42, 3, 11]);
      expect(loaded.config.derivation.frames).toEqual(
        source.config.derivation.frames,
      );
      expect(readMotionFlow(loaded.manifest, loaded.config)).toEqual(
        readMotionFlow(source.manifest, source.config),
      );
      expect(loaded.config.sourceMetadata?.wardrobe).toEqual(
        source.config.sourceMetadata?.wardrobe,
      );
      expect(loaded.config.sourceMetadata?.appearance).toEqual(
        source.config.sourceMetadata?.appearance,
      );
      expect(loaded.config.source).toEqual({
        kind: "unified-archive",
        name: "composed-source.character.zip",
        sha256: await sha256(source.bytes),
      });
      expect(loaded.config.provenance).toContain("lossy pixel derivative");
      expect(loaded.manifest.scale).toEqual({
        pixelArt: true,
        integerOnly: true,
        recommended: 2,
      });
      expect(result.report.outputSha256).toBe(await sha256(result.bytes));
      expect(result.report.palette).toHaveLength(3);
      expect(source.bytes).toEqual(before);

      const image = decodeSourceRgbaPng(loaded.png);
      for (const frame of loaded.manifest.frames) {
        const at = ((frame.y + 1) * image.width + frame.x + 1) * 4;
        expect([...image.pixels.subarray(at, at + 4)]).toEqual([
          ...COLORS[[3, 11, 42].indexOf(frame.id)],
          255,
        ]);
        // Three source pixels of left padding occupy most of the first cell.
        expect(
          image.pixels[((frame.y + 1) * image.width + frame.x) * 4 + 3],
        ).toBe(0);
      }
      expect(
        [...image.pixels]
          .filter((_, index) => index % 4 === 3)
          .every((alpha) => alpha === 0 || alpha === 255),
      ).toBe(true);
      const resaved = await createBakedCharacterPack(
        loaded.config,
        loaded.manifest,
        new Blob([loaded.png]),
        loaded.additionalPngs?.map((png) => new Blob([png])),
      );
      expect(
        readPortableCharacterPackArchive(
          new Uint8Array(await resaved.arrayBuffer()),
        ).manifest,
      ).toEqual(loaded.manifest);
    },
  );

  it("pads one whole-bank grid so anchor coordinates and source-relative distances map without rounding", async () => {
    const result = await buildPixelCandidate(
      fixture().bytes,
      DEFAULT_PIXEL_SETTINGS,
    );
    expect(result.report.mapping).toEqual({
      factor: 4,
      sourceWidth: 11,
      sourceHeight: 13,
      sourceAnchor: { x: 5, y: 12 },
      width: 4,
      height: 4,
      padding: { left: 3, top: 0, right: 2, bottom: 3 },
      anchor: { x: 2, y: 3 },
    });
    const m = result.report.mapping;
    for (const [x, y] of [
      [0, 0],
      [5, 12],
      [10, 13],
    ]) {
      expect((x + m.padding.left) / m.factor - m.anchor.x).toBe(
        (x - m.sourceAnchor.x) / m.factor,
      );
      expect((y + m.padding.top) / m.factor - m.anchor.y).toBe(
        (y - m.sourceAnchor.y) / m.factor,
      );
    }
    expect(() => pixelMapping(11, 13, { x: 5.5, y: 12 }, 4)).toThrow(
      "fractional anchors",
    );
  });

  it("repeats identical source/settings byte for byte, including stable ZIP timestamps and report", async () => {
    const source = fixture().bytes;
    const first = await buildPixelCandidate(source, DEFAULT_PIXEL_SETTINGS);
    const second = await buildPixelCandidate(source, DEFAULT_PIXEL_SETTINGS);
    expect(second.bytes).toEqual(first.bytes);
    expect(second.report).toEqual(first.report);
  });

  it("retains a frozen input snapshot even if the caller changes its buffer during asynchronous preparation", async () => {
    const input = fixture().bytes,
      expectedSha = await sha256(input);
    const candidate = buildPixelCandidate(input, DEFAULT_PIXEL_SETTINGS);
    input.fill(0);
    expect((await candidate).report.sourceSha256).toBe(expectedSha);
  });

  it("rejects malformed archives, damaged PNGs, unknown settings and reprocessing an existing pixel pack", async () => {
    await expect(
      buildPixelCandidate(new Uint8Array([1, 2, 3]), DEFAULT_PIXEL_SETTINGS),
    ).rejects.toThrow();
    const source = fixture();
    const files = unzipSync(source.bytes);
    files["spritesheet-1.png"][45] ^= 1;
    await expect(
      buildPixelCandidate(zipSync(files), DEFAULT_PIXEL_SETTINGS),
    ).rejects.toThrow();
    await expect(
      buildPixelCandidate(source.bytes, {
        ...DEFAULT_PIXEL_SETTINGS,
        factor: 5,
      } as never),
    ).rejects.toThrow("pixel size");
    const candidate = await buildPixelCandidate(
      source.bytes,
      DEFAULT_PIXEL_SETTINGS,
    );
    await expect(
      buildPixelCandidate(candidate.bytes, DEFAULT_PIXEL_SETTINGS),
    ).rejects.toThrow("second time");
  });

  it("cancels before starting and between real frame samples without publishing a partial candidate", async () => {
    const source = fixture().bytes;
    const before = new AbortController();
    before.abort();
    await expect(
      buildPixelCandidate(source, DEFAULT_PIXEL_SETTINGS, {
        signal: before.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    const controller = new AbortController(),
      progress: PixelBuildProgress[] = [];
    await expect(
      buildPixelCandidate(source, DEFAULT_PIXEL_SETTINGS, {
        signal: controller.signal,
        onProgress: (value) => {
          progress.push(value);
          if (value.stage === "sampling" && value.completed === 1)
            controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(progress.at(-1)).toEqual({
      stage: "sampling",
      completed: 1,
      total: 3,
    });
    expect(progress.some((value) => value.stage === "packing")).toBe(false);
  });
});
