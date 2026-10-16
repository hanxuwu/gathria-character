import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { DEFAULT_CONFIG, RUNNING_DEFAULT_CONFIG } from "./config";
import {
  createCharacterPack,
  loadCharacterPack,
  pixelsToPng,
  readCharacterPackArchive,
  safeFilename,
  validateManifest,
} from "./pack";
import type { CharacterPackManifest, GeneratedCharacter } from "./types";

function manifest(): CharacterPackManifest {
  return {
    schemaVersion: 1,
    format: "gathria-character-pack",
    name: "Mira",
    generator: "test-fixture-v1",
    spritesheet: {
      file: "spritesheet.png",
      width: 32,
      height: 48,
      frameWidth: 16,
      frameHeight: 24,
      columns: 2,
      rows: 2,
    },
    frames: [0, 1, 2, 3].map((id) => ({
      id,
      x: (id % 2) * 16,
      y: Math.floor(id / 2) * 24,
      width: 16,
      height: 24,
    })),
    animations: {
      idle: { frames: [0, 1], fps: 4, loop: true },
      walk: { frames: [2, 3], fps: 10, loop: true },
    },
    facing: { native: "right", right: "none", left: "mirror-x" },
    anchor: { x: 8, y: 24, units: "pixels", origin: "top-left" },
    scale: { pixelArt: true, recommended: 4, integerOnly: true },
    configuration: "character.json",
  };
}

const onePixelPng = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==",
    "base64",
  ),
);
function archiveFiles(): Record<string, Uint8Array> {
  const data = manifest();
  data.spritesheet = {
    file: "spritesheet.png",
    width: 1,
    height: 1,
    frameWidth: 1,
    frameHeight: 1,
    columns: 1,
    rows: 1,
  };
  data.frames = [{ id: 7, x: 0, y: 0, width: 1, height: 1 }];
  data.animations.idle.frames = [7];
  data.animations.walk.frames = [7];
  data.anchor = { ...data.anchor, x: 0.5, y: 1 };
  return {
    "spritesheet.png": onePixelPng.slice(),
    "manifest.json": strToU8(JSON.stringify(data)),
    "character.json": strToU8(JSON.stringify(DEFAULT_CONFIG)),
    "PROVENANCE.txt": strToU8("Original test fixture."),
    "INTEGRATION.md": strToU8("See CharacterPack v1."),
  };
}

describe("CharacterPack manifest contract", () => {
  it("copies valid metadata without retaining mutable input arrays", () => {
    const input = manifest();
    const parsed = validateManifest(input);
    expect(parsed).toEqual(input);
    input.frames[0].x = 99;
    input.animations.walk.frames.push(999);
    expect(parsed.frames[0].x).toBe(0);
    expect(parsed.animations.walk.frames).toEqual([2, 3]);
  });

  it("supports unused grid cells and resolves frames by their explicit IDs", () => {
    const input = manifest();
    input.frames = [input.frames[3], input.frames[0]];
    input.frames[0].id = 42;
    input.animations.idle.frames = [0];
    input.animations.walk.frames = [42, 0, 42];
    expect(validateManifest(input).animations.walk.frames).toEqual([42, 0, 42]);
  });

  it.each([undefined, null, [], 1, "manifest"])(
    "rejects a non-object manifest: %s",
    (value) => {
      expect(() => validateManifest(value)).toThrow(
        "Manifest must be an object",
      );
    },
  );

  it.each([
    ["schemaVersion", 2, "schemaVersion"],
    ["format", "another-format", "format"],
    ["name", "", "name"],
    ["generator", "", "generator"],
    ["frames", [], "frames"],
    ["animations", {}, "animations.idle"],
    ["configuration", "other.json", "configuration"],
  ])("rejects invalid %s", (key, value, message) => {
    expect(() => validateManifest({ ...manifest(), [key]: value })).toThrow(
      String(message),
    );
  });

  it.each([0, -1, NaN, Infinity, 1.5, 4097])(
    "rejects invalid sheet width %s",
    (width) => {
      const input = manifest();
      input.spritesheet.width = width;
      expect(() => validateManifest(input)).toThrow("spritesheet.width");
    },
  );

  it("rejects dimensions inconsistent with grid layout", () => {
    const input = manifest();
    input.spritesheet.columns = 3;
    expect(() => validateManifest(input)).toThrow("exactly equal");
  });

  it("rejects missing frame dimensions", () => {
    const input = manifest();
    delete (input.frames[0] as Partial<(typeof input.frames)[0]>).width;
    expect(() => validateManifest(input)).toThrow("frames[0].width");
  });

  it.each([
    [
      "duplicate IDs",
      (input: CharacterPackManifest) => {
        input.frames[1].id = 0;
      },
      "duplicated",
    ],
    [
      "overlapping frames",
      (input: CharacterPackManifest) => {
        input.frames[1].x = 0;
      },
      "overlaps",
    ],
    [
      "out-of-bounds frame",
      (input: CharacterPackManifest) => {
        input.frames[1].x = 32;
      },
      "frames[1].x",
    ],
    [
      "fractional frame coordinates",
      (input: CharacterPackManifest) => {
        input.frames[1].x = 1.5;
      },
      "frames[1].x",
    ],
    [
      "non-grid frame",
      (input: CharacterPackManifest) => {
        input.frames[0].x = 1;
      },
      "align",
    ],
    [
      "wrong-sized frame",
      (input: CharacterPackManifest) => {
        input.frames[1].height = 23;
      },
      "frames[1].height",
    ],
    [
      "missing reference",
      (input: CharacterPackManifest) => {
        input.animations.walk.frames = [19];
      },
      "missing frame",
    ],
    [
      "empty animation",
      (input: CharacterPackManifest) => {
        input.animations.idle.frames = [];
      },
      "playback order",
    ],
    [
      "nonfinite fps",
      (input: CharacterPackManifest) => {
        input.animations.walk.fps = Infinity;
      },
      "fps",
    ],
    [
      "zero fps",
      (input: CharacterPackManifest) => {
        input.animations.walk.fps = 0;
      },
      "fps",
    ],
    [
      "anchor outside frame",
      (input: CharacterPackManifest) => {
        input.anchor.y = 25;
      },
      "anchor.y",
    ],
    [
      "nonfinite anchor",
      (input: CharacterPackManifest) => {
        input.anchor.x = NaN;
      },
      "anchor.x",
    ],
    [
      "fractional scale",
      (input: CharacterPackManifest) => {
        input.scale.recommended = 2.5;
      },
      "scale.recommended",
    ],
  ] as const)("rejects %s", (_label, mutate, message) => {
    const input = manifest();
    mutate(input);
    expect(() => validateManifest(input)).toThrow(message);
  });

  it("requires explicit facing, anchor units, pixel scale, and boolean looping", () => {
    const input = manifest();
    expect(() =>
      validateManifest({
        ...input,
        facing: { native: "left", left: "none", right: "mirror-x" },
      }),
    ).toThrow("facing.native");
    expect(() =>
      validateManifest({
        ...input,
        anchor: { ...input.anchor, units: "normalized" },
      }),
    ).toThrow("anchor.units");
    expect(() =>
      validateManifest({
        ...input,
        scale: { ...input.scale, pixelArt: false },
      }),
    ).toThrow("scale.pixelArt");
    expect(() =>
      validateManifest({
        ...input,
        animations: {
          ...input.animations,
          walk: { ...input.animations.walk, loop: "true" },
        },
      }),
    ).toThrow("loop");
  });
});

describe("CharacterPack ZIP byte validation", () => {
  it.each([0, 6, 9] as const)(
    "round-trips a complete archive at compression level %i",
    (level) => {
      const files = archiveFiles();
      const result = readCharacterPackArchive(zipSync(files, { level }));
      expect(result.config).toEqual(DEFAULT_CONFIG);
      expect(result.manifest.frames[0].id).toBe(7);
      expect(result.png).toEqual(onePixelPng);
    },
  );

  it.each([
    "spritesheet.png",
    "manifest.json",
    "character.json",
    "PROVENANCE.txt",
    "INTEGRATION.md",
  ])("rejects missing %s", (name) => {
    const files = archiveFiles();
    delete files[name];
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      `missing ${name}`,
    );
  });

  it("reports malformed JSON and unsupported schema versions", () => {
    const files = archiveFiles();
    files["manifest.json"] = strToU8("{bad json");
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      "manifest.json is not valid UTF-8 JSON",
    );
    files["manifest.json"] = strToU8(JSON.stringify({ schemaVersion: 2 }));
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      "schemaVersion",
    );
  });

  it("rejects invalid UTF-8 JSON", () => {
    const files = archiveFiles();
    files["character.json"] = new Uint8Array([0xc0, 0xc1]);
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      "character.json is not valid UTF-8 JSON",
    );
  });

  it("validates editable configuration, including consistency with metadata", () => {
    const files = archiveFiles();
    files["character.json"] = strToU8(
      JSON.stringify({ ...DEFAULT_CONFIG, skinTone: "red" }),
    );
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      "character.json: skinTone",
    );
    files["character.json"] = strToU8(
      JSON.stringify({ ...DEFAULT_CONFIG, name: "Someone else" }),
    );
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      "name must match",
    );
  });

  it("requires a running-enabled source configuration to include a portable run clip", () => {
    const files = archiveFiles();
    files["character.json"] = strToU8(JSON.stringify(RUNNING_DEFAULT_CONFIG));
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      "has no run animation",
    );
    const data = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    data.animations.run = { frames: [7], fps: 18, loop: true };
    files["manifest.json"] = strToU8(JSON.stringify(data));
    const parsed = readCharacterPackArchive(zipSync(files));
    expect(parsed.config).toEqual(RUNNING_DEFAULT_CONFIG);
    expect(parsed.manifest.animations.run).toEqual(data.animations.run);
  });

  it("rejects non-PNG data and image dimensions that disagree with metadata", () => {
    const files = archiveFiles();
    files["spritesheet.png"] = strToU8("not an image");
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow("valid PNG");
    files["spritesheet.png"] = onePixelPng.slice();
    new DataView(files["spritesheet.png"].buffer).setUint32(16, 2);
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      "PNG dimensions (2×1) do not match",
    );
  });

  it.each([
    new Uint8Array(),
    new Uint8Array(40),
    zipSync(archiveFiles()).slice(0, -3),
  ])("rejects malformed or truncated archives", (bytes) => {
    expect(() => readCharacterPackArchive(bytes)).toThrow();
  });

  it("rejects extra files, traversal paths, and duplicate filenames", () => {
    const files = archiveFiles();
    expect(() =>
      readCharacterPackArchive(
        zipSync({ ...files, "extra.txt": strToU8("extra") }),
      ),
    ).toThrow("five documented files");
    files["../outside.txt"] = files["PROVENANCE.txt"];
    delete files["PROVENANCE.txt"];
    expect(() => readCharacterPackArchive(zipSync(files))).toThrow(
      "Unexpected ZIP path",
    );

    const duplicate = zipSync(archiveFiles());
    const oldName = strToU8("INTEGRATION.md");
    const newName = strToU8("PROVENANCE.txt");
    for (let i = 0; i <= duplicate.length - oldName.length; i++) {
      if (oldName.every((value, j) => duplicate[i + j] === value))
        duplicate.set(newName, i);
    }
    expect(() => readCharacterPackArchive(duplicate)).toThrow("duplicate file");
  });

  it("checks CRC32 integrity before accepting asset contents", () => {
    const bytes = zipSync(archiveFiles(), { level: 0 });
    const view = new DataView(bytes.buffer);
    const imageStart = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    bytes[imageStart + 40] ^= 1;
    expect(() => readCharacterPackArchive(bytes)).toThrow(
      "spritesheet.png failed its ZIP checksum",
    );
  });

  it("rejects oversized declared output before decompressing it", () => {
    const bytes = zipSync(archiveFiles());
    const view = new DataView(bytes.buffer);
    const directory = view.getUint32(bytes.length - 6, true);
    view.setUint32(directory + 24, 33 * 1024 * 1024, true);
    expect(() => readCharacterPackArchive(bytes)).toThrow(
      "uncompressed size limit",
    );
  });

  it("bounds actual inflated output even if the ZIP lies about the declared size", () => {
    const bytes = zipSync(archiveFiles(), { level: 6 });
    const view = new DataView(bytes.buffer);
    const directory = view.getUint32(bytes.length - 6, true);
    view.setUint32(directory + 24, 1, true);
    view.setUint32(22, 1, true);
    expect(() => readCharacterPackArchive(bytes)).toThrow(
      "within its declared size",
    );
  });

  it("rejects an oversized Blob before reading or decoding it", async () => {
    const blob = {
      size: 33 * 1024 * 1024,
      arrayBuffer: () => {
        throw new Error("Must not read");
      },
    } as unknown as Blob;
    await expect(loadCharacterPack(blob)).rejects.toThrow("at most 32 MiB");
  });
});

describe("download filenames", () => {
  it("normalizes names and removes paths, punctuation, and unsupported characters", () => {
    expect(safeFilename("Míra / Example")).toBe("mira-example");
    expect(safeFilename("../../")).toBe("character");
    expect(safeFilename("こんにちは")).toBe("character");
    expect(safeFilename("x".repeat(100))).toHaveLength(64);
  });
});

describe("export input validation", () => {
  function generated(): GeneratedCharacter {
    return {
      width: 32,
      height: 48,
      pixels: new Uint8ClampedArray(32 * 48 * 4),
      manifest: manifest(),
    };
  }

  it("rejects an empty name without starting PNG work", async () => {
    await expect(
      createCharacterPack({ ...DEFAULT_CONFIG, name: "" }, generated()),
    ).rejects.toThrow("name must be a nonempty");
  });

  it("rejects configuration from a different named character", async () => {
    await expect(
      createCharacterPack({ ...DEFAULT_CONFIG, name: "Rowan" }, generated()),
    ).rejects.toThrow("name must match");
  });

  it("rejects a running-enabled export missing run metadata before PNG work", async () => {
    await expect(
      createCharacterPack(RUNNING_DEFAULT_CONFIG, generated()),
    ).rejects.toThrow("has no run animation");
  });

  it("rejects an inconsistent generated pixel buffer before touching the DOM", async () => {
    await expect(
      pixelsToPng({ ...generated(), pixels: new Uint8ClampedArray(4) }),
    ).rejects.toThrow("pixel buffer dimensions");
    await expect(pixelsToPng({ ...generated(), width: 16 })).rejects.toThrow(
      "pixel buffer dimensions",
    );
  });
});
