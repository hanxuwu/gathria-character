import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  createBakedCharacterPack,
  loadPortableCharacterFiles,
  loadPortableCharacterPack,
  readPortableCharacterPackArchive,
  validatePortableManifest,
} from "./pack";
import type { BakedCharacterRecipe, CharacterPackV4Manifest } from "./types";

const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGMQ4WKo/8/A8B8ACGUCnA2HidgAAAAASUVORK5CYII=",
    "base64",
  ),
);
function manifest(multi = false): CharacterPackV4Manifest {
  const sheet = {
    width: 2,
    height: 1,
    frameWidth: 1,
    frameHeight: 1,
    columns: 2,
    rows: 1,
  };
  return {
    format: "gathria-character-pack",
    schemaVersion: 4,
    name: "Authored pixel",
    generator: "theme-fixture",
    spritesheet: { ...sheet, file: "spritesheet.png" },
    additionalSheets: multi ? [{ ...sheet, file: "spritesheet-1.png" }] : [],
    frames: [0, 1].map((id) => ({
      id,
      page: multi ? id : 0,
      x: id,
      y: 0,
      width: 1,
      height: 1,
    })),
    animations: {
      idle: { frames: [0, 0, 1], fps: 4, loop: true },
      walk: { frames: [1, 0], fps: 8, loop: true },
      jump: { frames: [0, 1, 1], fps: 6, loop: false },
    },
    anchor: { x: 0, y: 1, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: true, integerOnly: true, recommended: 2 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
}
function recipe(): BakedCharacterRecipe {
  return {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: "Authored pixel",
    characterId: "male",
    source: {
      kind: "unified-archive",
      name: "drawn-theme.zip",
      sha256: "a".repeat(64),
    },
    provenance:
      "Authored pixel drawings, referenced to Kling; not extracted video frames.",
    derivation: {
      method: "New drawings in a registered atlas",
      frames: [0, 1].map((frameId) => ({
        frameId,
        sourceFrame: frameId,
        timeSeconds: frameId / 6,
      })),
    },
    sourceMetadata: { theme: { id: "pixel", revision: "v1" } },
  };
}
async function packed(multi = false) {
  return new Uint8Array(
    await (
      await createBakedCharacterPack(
        recipe(),
        manifest(multi),
        new Blob([png]),
        multi ? [new Blob([png])] : [],
      )
    ).arrayBuffer(),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe("authored pixel CharacterPack V4", () => {
  it.each([false, true])(
    "round-trips unchanged RGBA bytes, alpha, source metadata and timing (multi=%s)",
    async (multi) => {
      const zip = await packed(multi),
        files = unzipSync(zip),
        archive = readPortableCharacterPackArchive(zip);
      expect(archive.manifest).toEqual(manifest(multi));
      expect(archive.config).toEqual(recipe());
      expect(archive.png).toEqual(png);
      expect(archive.additionalPngs).toEqual(multi ? [png] : []);
      expect(new TextDecoder().decode(files["INTEGRATION.md"])).toContain(
        "nearest-neighbor",
      );
      expect(new TextDecoder().decode(files["PROVENANCE.txt"])).toContain(
        "not extracted video frames",
      );
      const saved = new Uint8Array(
        await (
          await createBakedCharacterPack(
            archive.config,
            archive.manifest,
            new Blob([archive.png]),
            archive.additionalPngs?.map((p) => new Blob([p])),
          )
        ).arrayBuffer(),
      );
      expect(unzipSync(saved)["spritesheet.png"]).toEqual(png);
      expect(readPortableCharacterPackArchive(saved).manifest).toEqual(
        manifest(multi),
      );
    },
  );
  it("does not reinterpret V2/V3 sampling or accept fractional pixel placement", () => {
    for (const version of [2, 3])
      expect(() =>
        validatePortableManifest({ ...manifest(true), schemaVersion: version }),
      ).toThrow("pixelArt");
    for (const scale of [
      { pixelArt: false, integerOnly: true, recommended: 1 },
      { pixelArt: true, integerOnly: false, recommended: 1 },
      { pixelArt: true, integerOnly: true, recommended: 0.5 },
      { pixelArt: true, integerOnly: true, recommended: 1.5 },
      { pixelArt: true, integerOnly: true, recommended: Infinity },
    ])
      expect(() => validatePortableManifest({ ...manifest(), scale })).toThrow(
        "scale",
      );
    expect(() =>
      validatePortableManifest({
        ...manifest(),
        anchor: { ...manifest().anchor, x: 0.5 },
      }),
    ).toThrow("integer pixel");
  });
  it("rejects missing pages, invalid frame pages, overlap and absent action references", () => {
    expect(() =>
      validatePortableManifest({ ...manifest(), additionalSheets: undefined }),
    ).toThrow("additionalSheets");
    expect(() =>
      validatePortableManifest({
        ...manifest(),
        frames: [{ ...manifest().frames[0], page: undefined }],
      }),
    ).toThrow("page 0");
    const overlap = manifest();
    overlap.frames[1].x = 0;
    expect(() => validatePortableManifest(overlap)).toThrow("overlaps");
    const missing = manifest(true);
    missing.frames[1].page = 2;
    expect(() => validatePortableManifest(missing)).toThrow("page");
    const badClip = manifest();
    badClip.animations.jump!.frames.push(99);
    expect(() => validatePortableManifest(badClip)).toThrow("missing frame");
  });
  it("requires honest authored provenance and a complete ZIP, even for one page", async () => {
    const dishonest = {
      ...recipe(),
      source: { ...recipe().source, kind: "video-extraction" as const },
    };
    await expect(
      createBakedCharacterPack(dishonest, manifest(), new Blob([png])),
    ).rejects.toThrow("not original video");
    const files = unzipSync(await packed());
    files["character.json"] = strToU8(JSON.stringify(dishonest));
    expect(() => readPortableCharacterPackArchive(zipSync(files))).toThrow(
      "not original video",
    );
    await expect(
      loadPortableCharacterFiles(new Blob([png]), manifest(), recipe()),
    ).rejects.toThrow("complete ZIP");
  });
  it("validates and loads every declared page before exposing independent playback", async () => {
    const bitmap = vi
      .fn()
      .mockImplementation(async () => ({
        width: 2,
        height: 1,
        close: vi.fn(),
      }));
    vi.stubGlobal("createImageBitmap", bitmap);
    const loaded = await loadPortableCharacterPack(
      new Blob([await packed(true)]),
    );
    expect(loaded.manifest.schemaVersion).toBe(4);
    expect(loaded.images).toHaveLength(2);
    expect(loaded.image).toBe(loaded.images![0]);
    expect(bitmap).toHaveBeenCalledTimes(2);
    const files = unzipSync(await packed(true));
    delete files["spritesheet-1.png"];
    expect(() => readPortableCharacterPackArchive(zipSync(files))).toThrow(
      "missing spritesheet-1.png",
    );
    await expect(
      createBakedCharacterPack(recipe(), manifest(true), new Blob([png])),
    ).rejects.toThrow("exactly one PNG");
  });
});
