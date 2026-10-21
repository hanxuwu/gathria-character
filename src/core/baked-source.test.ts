import { describe, expect, it, vi } from "vitest";
import { strToU8, unzipSync, zipSync, zlibSync } from "fflate";
import { crc32 } from "./bounded-archive";
import {
  BAKED_SOURCE_ACTIONS,
  convertSourceCharacter,
  decodeSourceRgbaPng,
  decodeSourceRgbaPngAsync,
  encodeSourceRgbaPng,
  importBakedSourceArchive,
  inspectBakedArchiveKind,
  planSourceAtlasPages,
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
function sourceFiles(includeJump = false) {
  const actionsToInclude = [
    ...BAKED_SOURCE_ACTIONS,
    ...(includeJump ? (["jump"] as const) : []),
  ];
  const files: Record<string, Uint8Array> = {};
  const definitions: Record<string, unknown> = {};
  for (const [a, action] of actionsToInclude.entries()) {
    const loop = action !== "jump";
    const key = loop ? `${action}_loop` : "jump_once";
    const fps = a % 2 ? 24 : 12;
    definitions[key] = {
      fps,
      frames: 3,
      repeat: loop ? -1 : 0,
      loop,
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
    for (const [a, action] of actionsToInclude.entries()) {
      const loop = action !== "jump";
      const key = loop ? `${action}_loop` : "jump_once";
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
        repeat: loop ? -1 : 0,
        loop,
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
      expect(output.manifest.schemaVersion).toBe(2);
      expect(output.additionalPngs).toEqual([]);
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

  it("adds a forward one-shot jump without changing required legacy actions or losing source provenance", async () => {
    const bundle = await importBakedSourceArchive(archive(sourceFiles(true)));
    const original = await importBakedSourceArchive(archive());
    for (const [c, id] of ids.entries()) {
      const character = bundle.characters[c];
      for (const action of BAKED_SOURCE_ACTIONS) {
        expect(character.actions[action]).toEqual(
          original.characters[c].actions[action],
        );
      }
      expect(character.actions.jump?.loop).toBe(false);
      const output = await convertSourceCharacter(bundle, id);
      const jump = output.manifest.animations.jump!;
      expect(jump.loop).toBe(false);
      expect(jump.fps).toBe(12);
      expect(jump.frames).toHaveLength(3);
      // A source hold remains a sequence position even though atlas cells deduplicate.
      expect(jump.frames[2]).toBe(jump.frames[0]);
      const atlas = decodeSourceRgbaPng(
        new Uint8Array(await output.png.arrayBuffer()),
      );
      for (const [i, id] of jump.frames.entries()) {
        const frame = output.manifest.frames.find((f) => f.id === id)!;
        const actual = new Uint8Array(width * height * 4);
        for (let row = 0; row < height; row++) {
          const start = ((frame.y + row) * atlas.width + frame.x) * 4;
          actual.set(
            atlas.pixels.subarray(start, start + width * 4),
            row * width * 4,
          );
        }
        expect(actual).toEqual(pixels(c * 30 + 8 + (i % 2)));
      }
      expect(output.recipe.sourceMetadata?.actions).toMatchObject({
        jump: {
          loop: false,
          fps: 12,
          frames: [
            { sourceFrame: 140, sourceIndex: 0, timeSeconds: 140 / 24 },
            { sourceFrame: 141, sourceIndex: 1, timeSeconds: 141 / 24 },
            { sourceFrame: 140, sourceIndex: 0, timeSeconds: 140 / 24 },
          ],
        },
      });
      const packed = await createBakedCharacterPack(
        output.recipe,
        output.manifest,
        output.png,
      );
      const reopened = await readPortableCharacterPackArchive(
        new Uint8Array(await packed.arrayBuffer()),
      );
      expect(reopened.manifest.animations.jump).toEqual(jump);
    }
  });

  it.each([
    ["manifest loop", "manifest.json", "loop", true],
    ["manifest repeat", "manifest.json", "repeat", -1],
    ["clip loop", "characters/amber/actions/jump_once.json", "loop", true],
    ["clip repeat", "characters/amber/actions/jump_once.json", "repeat", -1],
  ] as const)(
    "rejects contradictory one-shot %s metadata",
    async (_label, path, field, value) => {
      const files = sourceFiles(true);
      const data = read(files, path);
      const clip = path === "manifest.json" ? data.actions.jump_once : data;
      clip[field] = value;
      files[path] = json(data);
      await expect(importBakedSourceArchive(archive(files))).rejects.toThrow(
        "timing or count metadata",
      );
    },
  );

  it("rejects undeclared jump metadata and incomplete jump frames without dropping the action", async () => {
    const files = sourceFiles(true);
    const manifest = read(files, "manifest.json");
    delete manifest.actions.jump_once;
    files["manifest.json"] = json(manifest);
    await expect(importBakedSourceArchive(archive(files))).rejects.toThrow(
      "not declared",
    );
    const incomplete = sourceFiles(true);
    delete incomplete[
      "characters/amber/layers/body_composite/jump_once/001.png"
    ];
    await expect(importBakedSourceArchive(archive(incomplete))).rejects.toThrow(
      "Missing source frame",
    );
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

describe("asynchronous exact RGBA PNG decode", () => {
  it.each([0, 1, 2, 3, 4])(
    "matches synchronous filter %i, including hidden RGB and partial alpha",
    async (filter) => {
      const png = independentPng(filter);
      const decoded = await decodeSourceRgbaPngAsync(png, { width, height });
      expect(decoded).toEqual(decodeSourceRgbaPng(png, { width, height }));
      expect(decoded.pixels).toEqual(pixels(9));
    },
  );

  it("retains exact color chunks and split Adler bytes across empty IDATs", async () => {
    const png = independentPng(4),
      length = new DataView(png.buffer).getUint32(33),
      compressed = png.subarray(41, 41 + length);
    const profiles = [
      pngChunk("sRGB", new Uint8Array([0])),
      pngChunk("gAMA", new Uint8Array([0, 0, 177, 143])),
    ];
    const split = concat(
      png.subarray(0, 33),
      ...profiles,
      pngChunk("IDAT", compressed.subarray(0, compressed.length - 4)),
      ...Array.from(compressed.subarray(-4)).flatMap((byte) => [
        pngChunk("IDAT", new Uint8Array()),
        pngChunk("IDAT", new Uint8Array([byte])),
      ]),
      pngChunk("IDAT", new Uint8Array()),
      pngChunk("IEND", new Uint8Array()),
    );
    const output = await decodeSourceRgbaPngAsync(split);
    expect(output).toEqual(decodeSourceRgbaPng(split));
    expect(output.colorChunks).toEqual(profiles);
    expect(output.pixels).toEqual(pixels(9));
  });

  it("owns input bytes while asynchronous inflation is pending", async () => {
    const input = independentPng(2);
    const expected = decodeSourceRgbaPng(input);
    const pending = decodeSourceRgbaPngAsync(input);
    input.fill(0);
    expect(await pending).toEqual(expected);
  });

  it("rejects bad PNG CRC, Adler, filters, dimensions and truncated data", async () => {
    const corrupt = independentPng(0);
    corrupt[50] ^= 1;
    await expect(decodeSourceRgbaPngAsync(corrupt)).rejects.toThrow("checksum");
    const badZlib = independentPng(0),
      view = new DataView(badZlib.buffer),
      length = view.getUint32(33);
    badZlib[41 + length - 1] ^= 1;
    view.setUint32(41 + length, crc32(badZlib.subarray(37, 41 + length)));
    await expect(decodeSourceRgbaPngAsync(badZlib)).rejects.toThrow(
      "compressed image data",
    );
    await expect(
      decodeSourceRgbaPngAsync(independentPng(0, 2)),
    ).rejects.toThrow("8-bit RGBA");
    await expect(
      decodeSourceRgbaPngAsync(independentPng(0, 6, 1)),
    ).rejects.toThrow("declared dimensions");
    await expect(decodeSourceRgbaPngAsync(independentPng(5))).rejects.toThrow(
      "row filter",
    );
    await expect(
      decodeSourceRgbaPngAsync(independentPng(0), { width: width + 1, height }),
    ).rejects.toThrow("canvas");
    await expect(
      decodeSourceRgbaPngAsync(independentPng(0).subarray(0, -1)),
    ).rejects.toThrow("Truncated");
    const valid = independentPng(0),
      validLength = new DataView(valid.buffer).getUint32(33),
      truncatedStream = concat(
        valid.subarray(0, 33),
        pngChunk("IDAT", valid.subarray(41, 41 + validLength - 2)),
        pngChunk("IEND", new Uint8Array()),
      );
    await expect(decodeSourceRgbaPngAsync(truncatedStream)).rejects.toThrow(
      "compressed image data",
    );
  });

  it("rejects invalid stored DEFLATE and trailing streams with valid PNG checksums", async () => {
    const stored = independentPng(0, 6, 0, true),
      view = new DataView(stored.buffer),
      length = view.getUint32(33);
    stored[46] ^= 1;
    view.setUint32(41 + length, crc32(stored.subarray(37, 41 + length)));
    const valid = independentPng(0),
      validLength = new DataView(valid.buffer).getUint32(33);
    for (const extra of [new Uint8Array([0]), zlibSync(new Uint8Array([0]))]) {
      const trailing = concat(
        valid.subarray(0, 33),
        pngChunk("IDAT", concat(valid.subarray(41, 41 + validLength), extra)),
        pngChunk("IEND", new Uint8Array()),
      );
      await expect(decodeSourceRgbaPngAsync(trailing)).rejects.toThrow(
        "compressed image data",
      );
    }
    await expect(decodeSourceRgbaPngAsync(stored)).rejects.toThrow(
      "compressed image data",
    );
  });

  it("rejects abort before work and during pending inflation without returning pixels", async () => {
    const before = new AbortController();
    before.abort();
    await expect(
      decodeSourceRgbaPngAsync(independentPng(0), undefined, {
        signal: before.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    const during = new AbortController();
    const pending = decodeSourceRgbaPngAsync(independentPng(0), undefined, {
      signal: during.signal,
    });
    during.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    // An aborted stream must not poison another decode in the same runtime.
    expect((await decodeSourceRgbaPngAsync(independentPng(0))).pixels).toEqual(
      pixels(9),
    );
  });
});

describe("bounded source page planning", () => {
  it("keeps the historical native atlas and adds a second page when jump pixels overflow it", () => {
    const old = planSourceAtlasPages(704, 1024, 83);
    expect(old).toEqual([
      { start: 0, count: 83, columns: 11, rows: 8, width: 7744, height: 8192 },
    ]);
    const expanded = planSourceAtlasPages(704, 1024, 117, 83);
    expect(expanded[0]).toEqual(old[0]);
    expect(expanded[1].start).toBe(83);
    expect(expanded[1].count).toBe(34);
  });

  it("fits padded native frames across pages without discarding or overlapping sequence positions", () => {
    const pages = planSourceAtlasPages(704, 1056, 117, 83);
    expect(pages).toHaveLength(2);
    expect(
      pages.flatMap((p) =>
        Array.from({ length: p.count }, (_, i) => p.start + i),
      ),
    ).toEqual(Array.from({ length: 117 }, (_, i) => i));
    for (const page of pages) {
      expect(page.width).toBeLessThanOrEqual(8192);
      expect(page.height).toBeLessThanOrEqual(8192);
      expect(page.width * page.height).toBeLessThanOrEqual(64 * 1024 * 1024);
      expect(page.columns * page.rows).toBeGreaterThanOrEqual(page.count);
    }
    expect(
      pages.reduce((n, p) => n + p.width * p.height, 0),
    ).toBeLessThanOrEqual(128 * 1024 * 1024);
  });

  it("rejects oversized decoded budgets before allocating any atlases", () => {
    expect(() => planSourceAtlasPages(2048, 2048, 33)).toThrow(
      "decoded budget",
    );
    expect(() => planSourceAtlasPages(2048, 2048, 65)).toThrow("four-page");
    expect(() => planSourceAtlasPages(704, 1056, 0)).toThrow("frameCount");
  });
});
