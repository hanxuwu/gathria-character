import { describe, expect, it, vi } from "vitest";
import { strToU8, unzipSync, zipSync, zlibSync } from "fflate";
import { crc32 } from "./bounded-archive";
import {
  createBakedCharacterPack,
  loadPortableCharacterFiles,
  loadPortableCharacterPack,
  readPortableCharacterPackArchive,
  validateBakedManifest,
  validateMultipageBakedManifest,
  validatePortableManifest,
} from "./pack";
import type { BakedCharacterRecipe, CharacterPackV3Manifest } from "./types";

function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
function chunk(type: string, bytes: Uint8Array) {
  const output = new Uint8Array(bytes.length + 12),
    view = new DataView(output.buffer);
  view.setUint32(0, bytes.length);
  output.set(strToU8(type), 4);
  output.set(bytes, 8);
  view.setUint32(bytes.length + 8, crc32(output.subarray(4, bytes.length + 8)));
  return output;
}
function png(seed = 1, filter = 0) {
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, 2);
  view.setUint32(4, 1);
  header[8] = 8;
  header[9] = 6;
  return concat(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk(
      "IDAT",
      zlibSync(new Uint8Array([filter, seed, 30, 40, 128, 70, 80, 90, 255])),
    ),
    chunk("IEND", new Uint8Array()),
  );
}
function manifest(): CharacterPackV3Manifest {
  return {
    schemaVersion: 3,
    format: "gathria-character-pack",
    name: "Original jump",
    generator: "native-source",
    spritesheet: {
      file: "spritesheet.png",
      width: 2,
      height: 1,
      frameWidth: 1,
      frameHeight: 1,
      columns: 2,
      rows: 1,
    },
    additionalSheets: [
      {
        file: "spritesheet-1.png",
        width: 2,
        height: 1,
        frameWidth: 1,
        frameHeight: 1,
        columns: 2,
        rows: 1,
      },
    ],
    frames: [0, 1, 2, 3].map((id) => ({
      id,
      page: Math.floor(id / 2),
      x: id % 2,
      y: 0,
      width: 1,
      height: 1,
    })),
    animations: {
      idle: { frames: [0], fps: 24, loop: true },
      walk: { frames: [0, 1], fps: 24, loop: true },
      jump: { frames: [2, 3, 3], fps: 24, loop: false },
      celebrate: { frames: [1, 0], fps: 24, loop: true },
    },
    anchor: { x: 0.5, y: 1, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
}
function recipe(): BakedCharacterRecipe {
  return {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: "Original jump",
    characterId: "native",
    source: {
      kind: "video-extraction",
      name: "original.mp4",
      sha256: "a".repeat(64),
    },
    provenance: "Original video frames; no altered artwork.",
    derivation: {
      method: "native-multipage",
      frames: [0, 1, 2, 3].map((frameId) => ({
        frameId,
        sourceFrame: frameId + 200,
        timeSeconds: (frameId + 200) / 24,
      })),
    },
  };
}
function files() {
  return {
    "spritesheet.png": png(),
    "spritesheet-1.png": png(200),
    "manifest.json": strToU8(JSON.stringify(manifest())),
    "character.json": strToU8(JSON.stringify(recipe())),
    "PROVENANCE.txt": strToU8("Source"),
    "INTEGRATION.md": strToU8("V3"),
  } as Record<string, Uint8Array>;
}

describe("native multipage CharacterPack V3", () => {
  it("round-trips every PNG byte, page assignment, one-shot timing and provenance without changing V2", async () => {
    const input = manifest();
    expect(validatePortableManifest(input)).toEqual(input);
    const blob = await createBakedCharacterPack(
      recipe(),
      input,
      new Blob([png()]),
      [new Blob([png(200)])],
    );
    const bytes = new Uint8Array(await blob.arrayBuffer()),
      packed = unzipSync(bytes);
    expect(Object.keys(packed).sort()).toEqual(Object.keys(files()).sort());
    const reopened = readPortableCharacterPackArchive(bytes);
    expect(reopened.manifest).toEqual(input);
    expect(reopened.config).toEqual(recipe());
    expect(reopened.png).toEqual(png());
    expect(reopened.additionalPngs).toEqual([png(200)]);
    expect(packed["spritesheet-1.png"]).toEqual(png(200));
    expect(() => validateBakedManifest(input)).toThrow("schemaVersion");
  });

  it.each([
    [
      "missing page",
      (m: CharacterPackV3Manifest) => {
        delete (m.frames[2] as { page?: number }).page;
      },
    ],
    [
      "out-of-range page",
      (m: CharacterPackV3Manifest) => {
        m.frames[2].page = 2;
      },
    ],
    [
      "duplicate global ID",
      (m: CharacterPackV3Manifest) => {
        m.frames[2].id = 0;
      },
    ],
    [
      "overlap on one page",
      (m: CharacterPackV3Manifest) => {
        m.frames[3].x = 0;
      },
    ],
    [
      "missing animation frame",
      (m: CharacterPackV3Manifest) => {
        m.animations.jump!.frames = [55];
      },
    ],
    [
      "invalid FPS",
      (m: CharacterPackV3Manifest) => {
        m.animations.jump!.fps = NaN;
      },
    ],
    [
      "non-boolean loop",
      (m: CharacterPackV3Manifest) => {
        (m.animations.jump as unknown as { loop: string }).loop = "false";
      },
    ],
    [
      "unsafe file path",
      (m: CharacterPackV3Manifest) => {
        m.additionalSheets[0].file =
          "../spritesheet-1.png" as "spritesheet-1.png";
      },
    ],
    [
      "different frame dimensions",
      (m: CharacterPackV3Manifest) => {
        m.additionalSheets[0].frameWidth = 2;
      },
    ],
    [
      "unused page",
      (m: CharacterPackV3Manifest) => {
        m.frames = m.frames.filter((f) => f.page === 0);
      },
    ],
    [
      "page dimension limit",
      (m: CharacterPackV3Manifest) => {
        m.additionalSheets[0].width = 8193;
      },
    ],
    [
      "page count",
      (m: CharacterPackV3Manifest) => {
        m.additionalSheets = Array.from(
          { length: 4 },
          () => m.additionalSheets[0],
        );
      },
    ],
  ] as const)("rejects %s", (_name, mutate) => {
    const changed = manifest();
    mutate(changed);
    expect(() => validateMultipageBakedManifest(changed)).toThrow();
  });

  it("bounds decoded pixels across pages before any image allocation", () => {
    const m = manifest();
    const page = {
      width: 8192,
      height: 8192,
      frameWidth: 8192,
      frameHeight: 8192,
      columns: 1,
      rows: 1,
    };
    m.spritesheet = { ...page, file: "spritesheet.png" };
    m.additionalSheets = [1, 2].map((i) => ({
      ...page,
      file: `spritesheet-${i}.png`,
    }));
    m.frames = [0, 1, 2].map((id) => ({
      id,
      page: id,
      x: 0,
      y: 0,
      width: 8192,
      height: 8192,
    }));
    expect(() => validateMultipageBakedManifest(m)).toThrow("aggregate");
    const cells = manifest();
    cells.spritesheet = { ...cells.spritesheet, width: 1024, columns: 1024 };
    cells.additionalSheets[0] = {
      ...cells.additionalSheets[0],
      width: 1024,
      columns: 1024,
    };
    expect(() => validateMultipageBakedManifest(cells)).toThrow(
      "total grid cells",
    );
  });

  it("rejects missing, undeclared, corrupt or mismatched page images and V2 archives with extra pages", () => {
    const missing = files();
    delete missing["spritesheet-1.png"];
    expect(() => readPortableCharacterPackArchive(zipSync(missing))).toThrow(
      "missing spritesheet-1.png",
    );
    const extra = files();
    extra["spritesheet-2.png"] = png();
    expect(() => readPortableCharacterPackArchive(zipSync(extra))).toThrow(
      "Unexpected atlas",
    );
    const corrupt = files();
    corrupt["spritesheet-1.png"][45] ^= 1;
    expect(() => readPortableCharacterPackArchive(zipSync(corrupt))).toThrow(
      "checksum",
    );
    const mismatch = files();
    const m = manifest();
    m.additionalSheets[0].width = 3;
    m.additionalSheets[0].columns = 3;
    mismatch["manifest.json"] = strToU8(JSON.stringify(m));
    expect(() => readPortableCharacterPackArchive(zipSync(mismatch))).toThrow(
      "PNG dimensions",
    );
    const v2 = files();
    const { additionalSheets: _, ...single } = manifest();
    v2["manifest.json"] = strToU8(
      JSON.stringify({
        ...single,
        schemaVersion: 2,
        frames: single.frames.slice(0, 2),
        animations: {
          idle: { frames: [0], fps: 24, loop: true },
          walk: { frames: [1], fps: 24, loop: true },
        },
      }),
    );
    expect(() => readPortableCharacterPackArchive(zipSync(v2))).toThrow(
      "five documented",
    );
  });

  it("validates all compressed page pixels before calling the browser image decoder", async () => {
    const broken = files();
    broken["spritesheet-1.png"] = png(200, 5);
    const Image = vi.fn(() => {
      throw new Error("Image decoder must not run");
    });
    vi.stubGlobal("Image", Image);
    try {
      await expect(
        loadPortableCharacterPack(new Blob([zipSync(broken)])),
      ).rejects.toThrow("compressed PNG image data");
      expect(Image).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects aggregate PNG entry sizes before inflation without borrowing text-file allowance", () => {
    const bytes = zipSync(files());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = bytes.length - 22;
    let offset = view.getUint32(end + 16, true);
    while (offset < end) {
      const nameLength = view.getUint16(offset + 28, true);
      const name = new TextDecoder().decode(
        bytes.subarray(offset + 46, offset + 46 + nameLength),
      );
      if (name.endsWith(".png")) {
        // Each page fits individually; together they exceed 64 MiB while still
        // fitting the old combined PNG+text bound. Keep local/central headers
        // consistent; no inflated buffer should be allocated for these claims.
        const local = view.getUint32(offset + 42, true);
        const declaredSize = 32 * 1024 * 1024 + 128;
        view.setUint32(offset + 24, declaredSize, true);
        view.setUint32(local + 22, declaredSize, true);
      }
      offset +=
        46 +
        nameLength +
        view.getUint16(offset + 30, true) +
        view.getUint16(offset + 32, true);
    }
    expect(() => readPortableCharacterPackArchive(bytes)).toThrow(
      "aggregate 64 MiB uncompressed PNG budget",
    );
  });

  it("requires complete ZIPs for V3 and exact export page counts", async () => {
    await expect(
      loadPortableCharacterFiles(new Blob([png()]), manifest(), recipe()),
    ).rejects.toThrow("complete ZIP");
    await expect(
      createBakedCharacterPack(recipe(), manifest(), new Blob([png()])),
    ).rejects.toThrow("exactly one PNG");
    await expect(
      createBakedCharacterPack(recipe(), manifest(), new Blob([png()]), [
        new Blob([png()]),
        new Blob([png()]),
      ]),
    ).rejects.toThrow("exactly one PNG");
  });
});
