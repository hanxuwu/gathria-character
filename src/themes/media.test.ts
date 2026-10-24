import { describe, expect, it } from "vitest";
import { decompressFrames, parseGIF } from "gifuct-js";
import { decodeSourceRgbaPng, encodeSourceRgbaPng } from "../core/baked-source";
import { crc32 } from "../core/bounded-archive";
import type { PortableCharacterPackArchive } from "../core/pack";
import type {
  BakedCharacterRecipe,
  CharacterPackV3Manifest,
  CharacterPackV4Manifest,
} from "../core/types";
import { themeActionGif, themeFramePng } from "./media";

function fixture(pixel = true): PortableCharacterPackArchive {
  const sheet = {
    file: "spritesheet.png" as const,
    width: 4,
    height: 2,
    frameWidth: 4,
    frameHeight: 2,
    columns: 1,
    rows: 1,
  };
  const common = {
    format: "gathria-character-pack" as const,
    name: "Theme media fixture",
    generator: "test-only",
    spritesheet: sheet,
    additionalSheets: [{ ...sheet, file: "spritesheet-1.png" as const }],
    frames: [7, 19].map((id, page) => ({
      id,
      page,
      x: 0,
      y: 0,
      width: 4,
      height: 2,
    })),
    animations: {
      idle: { frames: [7], fps: 1, loop: true },
      walk: { frames: [7, 19], fps: 12, loop: true },
      run: { frames: [7, 19, 19, 7], fps: 24, loop: true },
      jump: { frames: [19, 7], fps: 24, loop: false },
    },
    facing: {
      native: "right" as const,
      right: "none" as const,
      left: "mirror-x" as const,
    },
    anchor: {
      x: 2,
      y: 2,
      units: "pixels" as const,
      origin: "top-left" as const,
    },
    capabilities: {
      renderMode: "baked" as const,
      editableAppearance: false as const,
    },
    configuration: "character.json" as const,
  };
  const manifest: CharacterPackV3Manifest | CharacterPackV4Manifest = pixel
    ? {
        ...common,
        schemaVersion: 4,
        scale: { pixelArt: true, integerOnly: true, recommended: 2 },
      }
    : {
        ...common,
        schemaVersion: 3,
        scale: { pixelArt: false, integerOnly: false, recommended: 0.5 },
      };
  const config: BakedCharacterRecipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: manifest.name,
    characterId: "theme-media-fixture",
    source: {
      kind: "unified-archive",
      name: "fixture.zip",
      sha256: "a".repeat(64),
    },
    provenance: "Test-only fixture",
    derivation: {
      method: "Test-only authored pixels",
      frames: manifest.frames.map((f, i) => ({
        frameId: f.id,
        sourceFrame: i,
        timeSeconds: i / 24,
      })),
    },
  };
  const srgb = new Uint8Array([0, 0, 0, 1, 115, 82, 71, 66, 0, 0, 0, 0, 0]);
  new DataView(srgb.buffer).setUint32(9, crc32(srgb.subarray(4, 9)));
  const pages = [0, 1].map((page) =>
    encodeSourceRgbaPng({
      width: 4,
      height: 2,
      colorChunks: [srgb],
      pixels: new Uint8Array(
        Array.from({ length: 8 }, (_, i) => [
          page === 0 ? 200 : 20,
          i * 24 + 10,
          80 + page * 20,
          i % 4 === 0 ? 0 : i % 4 === 1 ? 128 : 255,
        ]).flat(),
      ),
    }),
  );
  return { manifest, config, png: pages[0], additionalPngs: [pages[1]] };
}
const decodeGif = (bytes: Uint8Array) =>
  decompressFrames(parseGIF(new Uint8Array(bytes).buffer), true);

describe("theme native PNG and action GIF exports", () => {
  it("extracts the declared page with unchanged RGBA and color metadata, including transparent RGB", async () => {
    const archive = fixture(),
      original = new Uint8Array(archive.additionalPngs![0]);
    const expected = decodeSourceRgbaPng(original);
    const right = decodeSourceRgbaPng(
      await themeFramePng(archive, 19, "right"),
    );
    expect(right).toEqual(expected);
    const left = decodeSourceRgbaPng(await themeFramePng(archive, 19, "left"));
    expect(left.colorChunks).toEqual(expected.colorChunks);
    expect([left.width, left.height]).toEqual([4, 2]);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 4; x++)
        expect(left.pixels.slice((y * 4 + x) * 4, (y * 4 + x + 1) * 4)).toEqual(
          expected.pixels.slice((y * 4 + 3 - x) * 4, (y * 4 + 4 - x) * 4),
        );
    expect(archive.additionalPngs![0]).toEqual(original);
  });

  it("keeps native pixel dimensions, repeated holds, frame order and cumulative 24 FPS timing", async () => {
    const archive = fixture();
    const bytes = await themeActionGif(archive, "run", "right");
    const frames = decodeGif(bytes);
    expect(frames).toHaveLength(4);
    expect(frames[0].dims).toMatchObject({ width: 4, height: 2 });
    expect(frames.map((f) => f.delay)).toEqual([40, 40, 50, 40]);
    expect(frames[0].patch).toEqual(frames[3].patch);
    expect(frames[1].patch).toEqual(frames[2].patch);
    expect(frames[0].patch).not.toEqual(frames[1].patch);
    expect(new TextDecoder().decode(bytes)).toContain("NETSCAPE2.0");
    expect(await themeActionGif(archive, "run", "right")).toEqual(bytes);
    const left = decodeGif(await themeActionGif(archive, "run", "left"));
    for (let i = 0; i < frames.length; i++)
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 4; x++)
          expect(
            left[i].patch.slice((y * 4 + x) * 4, (y * 4 + x + 1) * 4),
          ).toEqual(
            frames[i].patch.slice((y * 4 + 3 - x) * 4, (y * 4 + 4 - x) * 4),
          );
  });

  it("retains one-shot GIF metadata and uses half-native smooth previews only for smooth packs", async () => {
    const bytes = await themeActionGif(fixture(false), "jump", "right");
    const frames = decodeGif(bytes);
    expect(frames).toHaveLength(2);
    expect(frames[0].dims).toMatchObject({ width: 2, height: 1 });
    expect(frames.map((f) => f.delay)).toEqual([40, 40]);
    expect(new TextDecoder().decode(bytes)).not.toContain("NETSCAPE2.0");
    const native = decodeSourceRgbaPng(
      await themeFramePng(fixture(false), 7, "right"),
    );
    expect([native.width, native.height]).toEqual([4, 2]);
  });

  it("rejects unavailable actions and frames rather than substituting unrelated artwork", async () => {
    const archive = fixture();
    await expect(themeActionGif(archive, "celebrate", "right")).rejects.toThrow(
      /does not include celebrate/,
    );
    await expect(themeFramePng(archive, 100, "right")).rejects.toThrow(
      /unavailable/,
    );
    archive.additionalPngs = [];
    await expect(themeFramePng(archive, 19, "right")).rejects.toThrow(
      /page 1 is unavailable/,
    );
  });

  it("honors cancellation before decode, between frames, and during encoding progress", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      themeFramePng(fixture(), 7, "right", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    for (const stopAt of [1, 5]) {
      const during = new AbortController();
      const progress: number[] = [];
      await expect(
        themeActionGif(fixture(), "run", "right", {
          signal: during.signal,
          onProgress(done) {
            progress.push(done);
            if (done === stopAt) during.abort();
          },
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(progress.at(-1)).toBe(stopAt);
    }
  });
});
