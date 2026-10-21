import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  createBakedCharacterPack,
  loadPortableCharacterPack,
  readPortableCharacterPackArchive,
  validateBakedCharacterRecipe,
  validateBakedManifest,
  validatePortableManifest,
  safeFilename,
} from "./pack";
import type { BakedCharacterRecipe, CharacterPackV2Manifest } from "./types";

// Two native RGBA pixels, including partial alpha. No browser/canvas encoder involved.
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGMQ4WKo/8/A8B8ACGUCnA2HidgAAAAASUVORK5CYII=",
    "base64",
  ),
);
function manifest(): CharacterPackV2Manifest {
  return {
    format: "gathria-character-pack",
    schemaVersion: 2,
    name: "Kling source",
    generator: "source-import-test",
    spritesheet: {
      file: "spritesheet.png",
      width: 2,
      height: 1,
      frameWidth: 1,
      frameHeight: 1,
      columns: 2,
      rows: 1,
    },
    frames: [0, 1].map((id) => ({ id, x: id, y: 0, width: 1, height: 1 })),
    animations: {
      idle: { frames: [0, 0, 1], fps: 12, loop: true },
      walk: { frames: [0, 1], fps: 24, loop: true },
      run: { frames: [1, 0], fps: 24, loop: true },
      celebrate: { frames: [1, 0, 1], fps: 12, loop: false },
    },
    anchor: { x: 0.5, y: 1, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: false, integerOnly: false, recommended: 0.5 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
}
function recipe(): BakedCharacterRecipe {
  return {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: "Kling source",
    characterId: "source-male",
    source: {
      kind: "unified-archive",
      name: "source.zip",
      sha256: "a".repeat(64),
    },
    provenance:
      "User-supplied video, manually selected source frames. No repainting.",
    derivation: {
      method: "Preserve source atlas cells and repeated timing references.",
      frames: [
        { frameId: 0, sourceFrame: 300, timeSeconds: 12.5 },
        { frameId: 1, sourceFrame: 301, timeSeconds: 301 / 24 },
      ],
    },
    sourceMetadata: {
      original: { fps: 24, selections: [300, 301], label: "原视频" },
    },
  };
}
function archiveFiles(
  data = manifest(),
  config: unknown = recipe(),
): Record<string, Uint8Array> {
  return {
    "spritesheet.png": png.slice(),
    "manifest.json": strToU8(JSON.stringify(data)),
    "character.json": strToU8(JSON.stringify(config)),
    "PROVENANCE.txt": strToU8("Fixture source"),
    "INTEGRATION.md": strToU8("Source playback"),
  };
}

describe("native baked CharacterPack V2", () => {
  it("retains smooth rendering, distinct celebrate timing, repeated source references and missing jump", () => {
    const input = manifest();
    const actual = validatePortableManifest(input);
    expect(actual).toEqual(input);
    expect(actual.animations).not.toHaveProperty("jump");
    input.animations.celebrate!.frames.push(0);
    expect(actual.animations).toHaveProperty("celebrate.frames", [1, 0, 1]);
    expect(validateBakedCharacterRecipe(recipe(), manifest())).toEqual(
      recipe(),
    );
    const withJump = manifest();
    withJump.animations.jump = { frames: [0, 1], fps: 10, loop: false };
    expect(validateBakedManifest(withJump).animations.jump).toEqual(
      withJump.animations.jump,
    );
  });

  it("allows native 768×1024 cells within explicit atlas limits", () => {
    const data = manifest();
    data.spritesheet = {
      file: "spritesheet.png",
      width: 4608,
      height: 7168,
      frameWidth: 768,
      frameHeight: 1024,
      columns: 6,
      rows: 7,
    };
    data.frames = [0, 1].map((id) => ({
      id,
      x: id * 768,
      y: 0,
      width: 768,
      height: 1024,
    }));
    data.anchor = { ...data.anchor, x: 384, y: 960 };
    expect(validateBakedManifest(data)).toEqual(data);
    data.spritesheet.width = 8448;
    expect(() => validateBakedManifest(data)).toThrow("8192");
  });

  it.each([
    (m: CharacterPackV2Manifest) => {
      (m.scale as unknown as { pixelArt: boolean }).pixelArt = true;
    },
    (m: CharacterPackV2Manifest) => {
      (m.scale as unknown as { integerOnly: boolean }).integerOnly = true;
    },
    (m: CharacterPackV2Manifest) => {
      m.scale.recommended = 0;
    },
    (m: CharacterPackV2Manifest) => {
      (
        m.capabilities as unknown as { editableAppearance: boolean }
      ).editableAppearance = true;
    },
    (m: CharacterPackV2Manifest) => {
      m.animations.celebrate!.frames = [99];
    },
    (m: CharacterPackV2Manifest) => {
      m.animations.walk.fps = Infinity;
    },
    (m: CharacterPackV2Manifest) => {
      m.frames[1].x = 0;
    },
    (m: CharacterPackV2Manifest) => {
      m.frames[1].id = 0;
    },
    (m: CharacterPackV2Manifest) => {
      (m.animations as unknown as Record<string, unknown>).dance =
        m.animations.walk;
    },
  ])(
    "rejects incompatible profiles and corrupt frame/animation metadata",
    (mutate) => {
      const data = manifest();
      mutate(data);
      expect(() => validateBakedManifest(data)).toThrow();
    },
  );

  it("requires truthful versioned source recipes and complete unique frame derivations", () => {
    expect(() =>
      validateBakedCharacterRecipe(
        { schemaVersion: 1, name: "Legacy appearance" },
        manifest(),
      ),
    ).toThrow("gathria-baked-character");
    for (const changed of [
      { ...recipe(), name: "Other source" },
      { ...recipe(), source: { ...recipe().source, sha256: "not-a-hash" } },
      {
        ...recipe(),
        derivation: {
          ...recipe().derivation,
          frames: recipe().derivation.frames.slice(1),
        },
      },
      {
        ...recipe(),
        derivation: {
          ...recipe().derivation,
          frames: [
            recipe().derivation.frames[0],
            recipe().derivation.frames[0],
          ],
        },
      },
      { ...recipe(), sourceMetadata: { tooLarge: "x".repeat(64 * 1024) } },
      { ...recipe(), sourceMetadata: { invalid: NaN } },
    ])
      expect(() => validateBakedCharacterRecipe(changed, manifest())).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() =>
      validateBakedCharacterRecipe({ ...recipe(), sourceMetadata: cyclic }),
    ).toThrow("acyclic");
  });

  it("round-trips the five-file ZIP with byte-identical PNG, original metadata and source times", async () => {
    const exported = await createBakedCharacterPack(
      recipe(),
      manifest(),
      new Blob([png], { type: "image/png" }),
    );
    const bytes = new Uint8Array(await exported.arrayBuffer());
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual([
      "INTEGRATION.md",
      "PROVENANCE.txt",
      "character.json",
      "manifest.json",
      "spritesheet.png",
    ]);
    expect(files["spritesheet.png"]).toEqual(png);
    expect(readPortableCharacterPackArchive(bytes)).toEqual({
      manifest: manifest(),
      config: recipe(),
      png,
    });
    expect(new TextDecoder().decode(files["PROVENANCE.txt"])).toContain(
      recipe().source.sha256,
    );
  });

  it("rejects removed legacy CharacterPack V1 explicitly", () => {
    const files = archiveFiles();
    const unsupported = { ...manifest(), schemaVersion: 1 };
    files["manifest.json"] = strToU8(JSON.stringify(unsupported));
    expect(() => readPortableCharacterPackArchive(zipSync(files))).toThrow(
      "Legacy CharacterPack V1 is not supported",
    );
    expect(() => validatePortableManifest(unsupported)).toThrow(
      "Legacy CharacterPack V1 is not supported",
    );
    expect(() => validatePortableManifest({ schemaVersion: 4 })).toThrow(
      "schemaVersion",
    );
  });

  it("rejects corrupt PNGs, recipe mismatches and undocumented archive paths", async () => {
    const broken = png.slice();
    broken[45] ^= 1;
    await expect(
      createBakedCharacterPack(recipe(), manifest(), new Blob([broken])),
    ).rejects.toThrow("checksum");
    await expect(
      createBakedCharacterPack(
        recipe(),
        manifest(),
        new Blob([png.slice(0, -12)]),
      ),
    ).rejects.toThrow("end marker");
    const files = archiveFiles();
    files["character.json"] = strToU8(
      JSON.stringify({ ...recipe(), name: "Wrong source" }),
    );
    expect(() => readPortableCharacterPackArchive(zipSync(files))).toThrow(
      "name must match",
    );
    const invalidPaths = archiveFiles();
    invalidPaths["../manifest.json"] = invalidPaths["manifest.json"];
    delete invalidPaths["manifest.json"];
    expect(() =>
      readPortableCharacterPackArchive(zipSync(invalidPaths)),
    ).toThrow("Unexpected ZIP path");
  });
  it("rejects oversized V2 input before reading bytes or allocating a declared image", async () => {
    const oversized = {
      size: 65 * 1024 * 1024,
      arrayBuffer: () => {
        throw new Error("Must not read");
      },
    } as unknown as Blob;
    await expect(loadPortableCharacterPack(oversized)).rejects.toThrow(
      "64 MiB",
    );
    await expect(
      createBakedCharacterPack(recipe(), manifest(), oversized),
    ).rejects.toThrow("64 MiB");
    const bytes = zipSync(archiveFiles());
    const view = new DataView(bytes.buffer);
    const directory = view.getUint32(bytes.length - 6, true);
    view.setUint32(directory + 24, 65 * 1024 * 1024, true);
    expect(() => readPortableCharacterPackArchive(bytes)).toThrow(
      "uncompressed size limit",
    );
  });
  it.each([
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAAUlEQVQAKDh96AAAAABJRU5ErkJggg==",
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGMV4WKo/8/A8B8ACJICoWHHzvEAAAAASUVORK5CYII=",
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGMQ4WKo/8/A8J8BAAsBApzm+QbmAAAAAElFTkSuQmCC",
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGMQ4WKo/8/A8B8ACGUCAPQ+VrcAAAAASUVORK5CYII=",
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR4AQEJAPf/ABQKAH//AAD/CGUCnCrX4BwAAAAASUVORK5CYII=",
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAGklEQVR4nGMQ4WKo/8/A8B8ACGUCnGV4dHJhCGUCnCd0etQAAAAASUVORK5CYII=",
  ])(
    "rejects CRC-valid PNGs with bad deflate, filters, decoded size or Adler checksum",
    async (encoded) => {
      const invalid = new Uint8Array(Buffer.from(encoded, "base64"));
      await expect(
        createBakedCharacterPack(recipe(), manifest(), new Blob([invalid])),
      ).rejects.toThrow("compressed PNG image data");
      const files = archiveFiles();
      files["spritesheet.png"] = invalid;
      await expect(
        loadPortableCharacterPack(new Blob([zipSync(files)])),
      ).rejects.toThrow("compressed PNG image data");
    },
  );
  it("rejects animated PNG payloads inside a static spritesheet contract", async () => {
    const apng = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAACGFjVEwAAAACAAAAAPONk3AAAAARSURBVHicYxDhYqj/z8DwHwAIZQKcDYeJ2AAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    await expect(
      createBakedCharacterPack(recipe(), manifest(), new Blob([apng])),
    ).rejects.toThrow("APNG");
  });
});

describe("native ZIP safety", () => {
  it.each([
    new Uint8Array(),
    new Uint8Array(40),
    zipSync(archiveFiles()).slice(0, -3),
  ])("rejects malformed or truncated archives", (bytes) => {
    expect(() => readPortableCharacterPackArchive(bytes)).toThrow();
  });

  it("rejects extra files, traversal paths, and duplicate filenames", () => {
    const files = archiveFiles();
    expect(() =>
      readPortableCharacterPackArchive(
        zipSync({ ...files, "extra.txt": strToU8("extra") }),
      ),
    ).toThrow("Unexpected ZIP path");
    files["../outside.txt"] = files["PROVENANCE.txt"];
    delete files["PROVENANCE.txt"];
    expect(() => readPortableCharacterPackArchive(zipSync(files))).toThrow(
      "Unexpected ZIP path",
    );

    const duplicate = zipSync(archiveFiles());
    const oldName = strToU8("INTEGRATION.md");
    const newName = strToU8("PROVENANCE.txt");
    for (let i = 0; i <= duplicate.length - oldName.length; i++) {
      if (oldName.every((value, j) => duplicate[i + j] === value))
        duplicate.set(newName, i);
    }
    expect(() => readPortableCharacterPackArchive(duplicate)).toThrow(
      "duplicate file",
    );
  });

  it("checks CRC32 integrity before accepting asset contents", () => {
    const bytes = zipSync(archiveFiles(), { level: 0 });
    const view = new DataView(bytes.buffer);
    const imageStart = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    bytes[imageStart + 40] ^= 1;
    expect(() => readPortableCharacterPackArchive(bytes)).toThrow(
      "spritesheet.png failed its ZIP checksum",
    );
  });

  it("bounds actual inflated output even if the ZIP lies about the declared size", () => {
    const bytes = zipSync(archiveFiles(), { level: 6 });
    const view = new DataView(bytes.buffer);
    const directory = view.getUint32(bytes.length - 6, true);
    view.setUint32(directory + 24, 1, true);
    view.setUint32(22, 1, true);
    expect(() => readPortableCharacterPackArchive(bytes)).toThrow(
      "within its declared size",
    );
  });
});
describe("download filenames", () => {
  it("normalizes names and removes paths, punctuation, and unsupported characters", () => {
    expect(safeFilename("Kling / Example")).toBe("kling-example");
    expect(safeFilename("../../")).toBe("character");
    expect(safeFilename("こんにちは")).toBe("character");
    expect(safeFilename("x".repeat(100))).toHaveLength(64);
  });
});
