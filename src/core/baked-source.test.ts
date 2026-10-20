import { describe, expect, it, vi } from "vitest";
import { strToU8, unzipSync, zipSync, zlibSync } from "fflate";
import { crc32 } from "../skeletal/bounded-archive";
import {
  BAKED_SOURCE_ACTIONS,
  convertSourceCharacter,
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
  importBakedSourceArchive,
  inspectBakedArchiveKind,
} from "./baked-source";
import {
  createBakedCharacterPack,
  readPortableCharacterPackArchive,
} from "./pack";

const width = 4;
const height = 3;
const ids = ["amber", "river"];
const json = (value: unknown) => strToU8(JSON.stringify(value));
const read = (files: Record<string, Uint8Array>, path: string) =>
  JSON.parse(new TextDecoder().decode(files[path]));
function pixels(seed: number) {
  return new Uint8Array(
    Array.from({ length: width * height }, (_, i) => [
      (i * 37 + seed) % 256,
      (i * 19 + seed * 3) % 256,
      (i * 13 + seed * 7) % 256,
      [0, 1, 64, 128, 254, 255][i % 6],
    ]).flat(),
  );
}
function sourceFiles() {
  const files: Record<string, Uint8Array> = {};
  const definitions: Record<string, unknown> = {};
  for (const [a, action] of BAKED_SOURCE_ACTIONS.entries()) {
    const key = `${action}_loop`;
    const fps = a % 2 ? 24 : 12;
    definitions[key] = {
      fps,
      frames: 3,
      repeat: -1,
      loop: true,
      duration_ms: 3000 / fps,
      selection_strategy: "recorded-order",
      frame_template: `characters/{character}/layers/body_composite/${key}/{frame:03d}.png`,
    };
  }
  files["manifest.json"] = json({
    format: "Gathria Unified CharacterPack",
    version: "1.0.0",
    contract: "characterpack-v1",
    render_mode: "baked_composite",
    name: "Source evidence",
    derivation: {
      videoSha256: "c".repeat(64),
      crop: [586, 12, 704, 1024],
      matte: { method: "source-chroma-key", soften: 0.2 },
      notes: "Fixed crop; no resampling or regeneration.",
    },
    canvas: {
      width,
      height,
      coordinate_origin: "top-left",
      ground_y: 3,
      orientation: "right_3q",
    },
    characters: ids,
    actions: definitions,
  });
  for (const [c, id] of ids.entries()) {
    const actions: Record<string, unknown> = {};
    files[`characters/${id}/`] = new Uint8Array();
    for (const [a, action] of BAKED_SOURCE_ACTIONS.entries()) {
      const key = `${action}_loop`;
      const fps = a % 2 ? 24 : 12;
      actions[key] = {
        config: `actions/${key}.json`,
        frames_dir: `layers/body_composite/${key}`,
        count: 3,
      };
      const frames = [0, 1, 0].map((source, i) => {
        const image = `layers/body_composite/${key}/${String(i).padStart(3, "0")}.png`;
        files[`characters/${id}/${image}`] = encodeSourceRgbaPng({
          width,
          height,
          pixels: pixels(c * 30 + a * 2 + source),
          colorChunks: [],
        });
        return {
          i,
          image,
          source_action: action,
          source_index: source,
          source_video_frame: 100 + a * 10 + source,
          source_time_s: (100 + a * 10 + source) / 24,
          anchors: {
            ground: { x: c ? 2.5 : 2, y: c ? 2.75 : 3 },
            head: { x: 2, y: null, quality: "not_calibrated" },
          },
        };
      });
      files[`characters/${id}/actions/${key}.json`] = json({
        name: key,
        fps,
        frames,
        repeat: -1,
        loop: true,
      });
    }
    files[`characters/${id}/meta.json`] = json({
      id,
      name: id,
      schema_version: "1.0.0",
      visual_mode: "baked_composite",
      actions,
      equipment: { hair: null, clothes: null },
      status: "source_candidate",
    });
  }
  files["equipment/slots.json"] = json({ template_only: true, hair: [] });
  return files;
}
function archive(files = sourceFiles()) {
  return new Blob([new Uint8Array(zipSync(files))], {
    type: "application/zip",
  });
}
const firstPng = "characters/amber/layers/body_composite/idle_loop/000.png";
const firstClip = "characters/amber/actions/idle_loop.json";
function pngChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(strToU8(type), 4);
  out.set(data, 8);
  view.setUint32(data.length + 8, crc32(out.subarray(4, data.length + 8)));
  return out;
}
function concat(...arrays: Uint8Array[]) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
function independentPng(
  filter: number,
  colorType = 6,
  excess = 0,
  stored = false,
) {
  const raw = pixels(9);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = colorType;
  const stride = width * 4;
  const scan = new Uint8Array((stride + 1) * height + excess);
  for (let y = 0; y < height; y++) {
    scan[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x < 4 ? 0 : raw[i - 4];
      const above = y ? raw[i - stride] : 0;
      const corner = y && x >= 4 ? raw[i - stride - 4] : 0;
      const estimate = left + above - corner;
      const distances = [left, above, corner].map((v) =>
        Math.abs(estimate - v),
      );
      const paeth = [left, above, corner][
        distances.indexOf(Math.min(...distances))
      ];
      const prediction = [
        0,
        left,
        above,
        Math.floor((left + above) / 2),
        paeth,
      ][filter];
      scan[y * (stride + 1) + x + 1] = (raw[i] - prediction) & 255;
    }
  }
  return concat(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlibSync(scan, { level: stored ? 0 : 6 })),
    pngChunk("IDAT", new Uint8Array()),
    pngChunk("IEND", new Uint8Array()),
  );
}

describe("Unified source archive adapter", () => {
  it("preserves source hashes, atlas pixels and export metadata without Web Crypto", async () => {
    const input = archive();
    const native = await importBakedSourceArchive(input);
    const expected = await convertSourceCharacter(native, ids[0]);
    vi.stubGlobal("crypto", {});
    try {
      const fallback = await importBakedSourceArchive(input);
      const actual = await convertSourceCharacter(fallback, ids[0]);
      expect(fallback.sourceSha256).toBe(native.sourceSha256);
      expect(actual.manifest).toEqual(expected.manifest);
      expect(actual.recipe).toEqual(expected.recipe);
      expect(new Uint8Array(await actual.png.arrayBuffer())).toEqual(
        new Uint8Array(await expected.png.arrayBuffer()),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("explicitly distinguishes source and native contracts without treating an unknown format as native", async () => {
    expect(await inspectBakedArchiveKind(archive())).toBe("unified-source");
    const native = new Blob([
      new Uint8Array(
        zipSync({
          "manifest.json": json({ format: "gathria-character-pack" }),
        }),
      ),
    ]);
    expect(await inspectBakedArchiveKind(native)).toBe("character-pack");
    const files = sourceFiles();
    files["manifest.json"] = json({ format: "unknown" });
    await expect(inspectBakedArchiveKind(archive(files))).rejects.toThrow(
      "Unsupported character archive",
    );
  });

  it("preserves both identities, uncalibrated head metadata and per-character stable ground anchors", async () => {
    const bundle = await importBakedSourceArchive(archive());
    expect(bundle.characters.map((c) => c.id)).toEqual(ids);
    expect(bundle.characters.map((c) => c.anchor)).toEqual([
      { x: 2, y: 3 },
      { x: 2.5, y: 2.75 },
    ]);
    expect(bundle.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.characters[0].actions.idle.frames[0].head).toEqual({
      x: 2,
      y: null,
      quality: "not_calibrated",
    });
    expect(bundle.characters[0].actions.idle.frames[0].partialAlphaPixels).toBe(
      8,
    );
    expect(bundle.width).toBe(4);
    expect(bundle.height).toBe(3);
  });

  it("packs exact RGBA including fractional alpha and hidden RGB, deduplicating cells without altering timing or order", async () => {
    const bundle = await importBakedSourceArchive(archive());
    for (const [c, id] of ids.entries()) {
      const output = await convertSourceCharacter(bundle, id);
      const atlas = decodeSourceRgbaPng(
        new Uint8Array(await output.png.arrayBuffer()),
      );
      expect(output.stats).toMatchObject({
        sequenceFrames: 12,
        uniqueFrames: 8,
        sourcePixelFidelity: "exact-rgba",
      });
      expect(output.manifest.capabilities).toEqual({
        renderMode: "baked",
        editableAppearance: false,
      });
      expect(output.manifest.animations).not.toHaveProperty("jump");
      for (const [a, action] of BAKED_SOURCE_ACTIONS.entries()) {
        const clip = output.manifest.animations[action]!;
        expect(clip.fps).toBe(a % 2 ? 24 : 12);
        expect(clip.frames[2]).toBe(clip.frames[0]);
        for (const [index, frameId] of clip.frames.entries()) {
          const frame = output.manifest.frames.find((f) => f.id === frameId)!;
          const actual = new Uint8Array(width * height * 4);
          for (let row = 0; row < height; row++) {
            const start = ((frame.y + row) * atlas.width + frame.x) * 4;
            actual.set(
              atlas.pixels.subarray(start, start + width * 4),
              row * width * 4,
            );
          }
          expect(actual).toEqual(pixels(c * 30 + a * 2 + (index % 2)));
        }
      }
      const pack = await createBakedCharacterPack(
        output.recipe,
        output.manifest,
        output.png,
      );
      const loaded = await readPortableCharacterPackArchive(
        new Uint8Array(await pack.arrayBuffer()),
      );
      expect(loaded.manifest).toEqual(output.manifest);
      const entries = unzipSync(new Uint8Array(await pack.arrayBuffer()));
      expect(entries["spritesheet.png"]).toEqual(
        new Uint8Array(await output.png.arrayBuffer()),
      );
      expect(output.recipe.sourceMetadata?.character).toMatchObject({
        equipment: { hair: null, clothes: null },
      });
      expect(
        loaded.config && "sourceMetadata" in loaded.config
          ? loaded.config.sourceMetadata?.sourceDerivation
          : undefined,
      ).toEqual(bundle.manifest.derivation);
    }
  });

  it.each([
    [
      "FPS",
      (f: Record<string, Uint8Array>) => {
        const c = read(f, firstClip);
        c.fps = 7;
        f[firstClip] = json(c);
      },
      "timing or count",
    ],
    [
      "count",
      (f: Record<string, Uint8Array>) => {
        const c = read(f, firstClip);
        c.frames.pop();
        f[firstClip] = json(c);
      },
      "missing frames",
    ],
    [
      "order",
      (f: Record<string, Uint8Array>) => {
        const c = read(f, firstClip);
        c.frames[0].i = 2;
        f[firstClip] = json(c);
      },
      "order",
    ],
    [
      "relative image path",
      (f: Record<string, Uint8Array>) => {
        const c = read(f, firstClip);
        c.frames[0].image = "../other.png";
        f[firstClip] = json(c);
      },
      "path is invalid",
    ],
    [
      "drifting anchor",
      (f: Record<string, Uint8Array>) => {
        const c = read(f, firstClip);
        c.frames[1].anchors.ground.x += 1;
        f[firstClip] = json(c);
      },
      "anchor must stay fixed",
    ],
    [
      "missing PNG",
      (f: Record<string, Uint8Array>) => {
        delete f[firstPng];
      },
      "Missing source frame",
    ],
    [
      "extra PNG",
      (f: Record<string, Uint8Array>) => {
        f[firstPng.replace("000.png", "099.png")] = f[firstPng];
      },
      "Unreferenced source frame",
    ],
    [
      "wrong dimensions",
      (f: Record<string, Uint8Array>) => {
        f[firstPng] = encodeSourceRgbaPng({
          width: 2,
          height: 6,
          pixels: pixels(0),
          colorChunks: [],
        });
      },
      "dimensions do not match",
    ],
    [
      "opaque frame",
      (f: Record<string, Uint8Array>) => {
        const p = pixels(0);
        for (let i = 3; i < p.length; i += 4) p[i] = 255;
        f[firstPng] = encodeSourceRgbaPng({
          width,
          height,
          pixels: p,
          colorChunks: [],
        });
      },
      "transparent background",
    ],
    [
      "empty frame",
      (f: Record<string, Uint8Array>) => {
        f[firstPng] = encodeSourceRgbaPng({
          width,
          height,
          pixels: new Uint8Array(width * height * 4),
          colorChunks: [],
        });
      },
      "visible artwork",
    ],
  ] as const)(
    "rejects inconsistent %s rather than repairing artwork silently",
    async (_name, mutate, message) => {
      const files = sourceFiles();
      mutate(files);
      await expect(importBakedSourceArchive(archive(files))).rejects.toThrow(
        message,
      );
    },
  );

  it("rejects malformed stored DEFLATE and trailing compressed data before pixel decoding", async () => {
    const stored = independentPng(0, 6, 0, true);
    const view = new DataView(stored.buffer);
    const length = view.getUint32(33);
    stored[46] ^= 1; // Stored-block NLEN complement, while preserving PNG CRC.
    view.setUint32(41 + length, crc32(stored.subarray(37, 41 + length)));
    const valid = independentPng(0);
    const validLength = new DataView(valid.buffer).getUint32(33);
    const trailing = concat(
      valid.subarray(0, 33),
      pngChunk(
        "IDAT",
        concat(valid.subarray(41, 41 + validLength), new Uint8Array(8192)),
      ),
      pngChunk("IEND", new Uint8Array()),
    );
    for (const png of [stored, trailing]) {
      const files = sourceFiles();
      files[firstPng] = png;
      await expect(importBakedSourceArchive(archive(files))).rejects.toThrow(
        "compressed PNG image data",
      );
    }
  });

  it("rejects unsafe ZIP paths and excess declared decoded pixels before allocation", async () => {
    const files = sourceFiles();
    files["../outside.json"] = json({});
    await expect(importBakedSourceArchive(archive(files))).rejects.toThrow(
      "Unsafe source ZIP path",
    );
    const valid = sourceFiles();
    const m = read(valid, "manifest.json");
    m.canvas.width = 100000;
    valid["manifest.json"] = json(m);
    await expect(importBakedSourceArchive(archive(valid))).rejects.toThrow(
      "canvas.width",
    );
  });
});

describe("bounded exact RGBA PNG codec", () => {
  it.each([0, 1, 2, 3, 4])(
    "decodes independent PNG filter %i without alpha rounding",
    (filter) => {
      expect(decodeSourceRgbaPng(independentPng(filter)).pixels).toEqual(
        pixels(9),
      );
    },
  );
  it("rejects non-RGBA data, inflation overflow, corrupt checksums and truncated files", () => {
    expect(() => decodeSourceRgbaPng(independentPng(0, 2))).toThrow(
      "8-bit RGBA",
    );
    expect(() => decodeSourceRgbaPng(independentPng(0, 6, 1))).toThrow(
      "declared dimensions",
    );
    const corrupt = independentPng(0);
    corrupt[50] ^= 1;
    expect(() => decodeSourceRgbaPng(corrupt)).toThrow("checksum");
    const badZlib = independentPng(0);
    const view = new DataView(badZlib.buffer);
    const idatLength = view.getUint32(33);
    badZlib[41 + idatLength - 1] ^= 1;
    view.setUint32(
      41 + idatLength,
      crc32(badZlib.subarray(37, 41 + idatLength)),
    );
    expect(() => decodeSourceRgbaPng(badZlib)).toThrow("zlib checksum");
    expect(() => decodeSourceRgbaPng(independentPng(0).slice(0, -1))).toThrow(
      "Truncated",
    );
  });
});
