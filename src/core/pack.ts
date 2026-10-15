import { Inflate, zipSync, strToU8 } from "fflate";
import { parseCharacterConfig } from "./config";
import type {
  Animation,
  CharacterConfig,
  CharacterPackManifest,
  GeneratedCharacter,
  SpriteFrame,
} from "./types";

export interface LoadedCharacterPack {
  manifest: CharacterPackManifest;
  image: HTMLImageElement;
  config?: CharacterConfig;
}

const MAX_DIMENSION = 4096;
const MAX_FRAMES = 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;
const REQUIRED_FILES = [
  "spritesheet.png",
  "manifest.json",
  "character.json",
  "PROVENANCE.txt",
  "INTEGRATION.md",
] as const;
const decoder = new TextDecoder("utf-8", { fatal: true });

function fail(message: string): never {
  throw new Error(message);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function integer(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    fail(`${path} must be an integer from ${min} to ${max}.`);
  }
  return value;
}
function number(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    fail(`${path} must be a finite number from ${min} to ${max}.`);
  }
  return value;
}
function text(value: unknown, path: string, maxLength = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    fail(`${path} must be nonempty text of at most ${maxLength} characters.`);
  }
  return value;
}
function exact(value: unknown, expected: unknown, path: string): void {
  if (value !== expected)
    fail(`${path} must be ${JSON.stringify(expected)} for CharacterPack v1.`);
}

/** Validate and copy the portable contract; no generator or editor state is used. */
export function validateManifest(value: unknown): CharacterPackManifest {
  const data = record(value, "Manifest");
  exact(data.schemaVersion, 1, "schemaVersion");
  exact(data.format, "gathria-character-pack", "format");
  const name = text(data.name, "name", 80);
  const generator = text(data.generator, "generator");
  const sheet = record(data.spritesheet, "spritesheet");
  exact(sheet.file, "spritesheet.png", "spritesheet.file");
  const width = integer(sheet.width, "spritesheet.width", 1, MAX_DIMENSION);
  const height = integer(sheet.height, "spritesheet.height", 1, MAX_DIMENSION);
  const frameWidth = integer(
    sheet.frameWidth,
    "spritesheet.frameWidth",
    1,
    width,
  );
  const frameHeight = integer(
    sheet.frameHeight,
    "spritesheet.frameHeight",
    1,
    height,
  );
  const columns = integer(sheet.columns, "spritesheet.columns", 1, MAX_FRAMES);
  const rows = integer(sheet.rows, "spritesheet.rows", 1, MAX_FRAMES);
  if (columns * frameWidth !== width || rows * frameHeight !== height) {
    fail(
      "Spritesheet dimensions must exactly equal its frame dimensions multiplied by columns and rows.",
    );
  }
  if (columns * rows > MAX_FRAMES)
    fail(`A spritesheet may contain at most ${MAX_FRAMES} frames.`);
  if (
    !Array.isArray(data.frames) ||
    data.frames.length < 1 ||
    data.frames.length > columns * rows
  ) {
    fail(
      "frames must contain at least one rectangle and no more rectangles than spritesheet grid cells.",
    );
  }
  const ids = new Set<number>();
  const cells = new Set<string>();
  const frames: SpriteFrame[] = data.frames.map((item, index) => {
    const frame = record(item, `frames[${index}]`);
    const id = integer(frame.id, `frames[${index}].id`, 0, 65535);
    if (ids.has(id))
      fail(`Frame ID ${id} is duplicated. Give every frame a unique ID.`);
    ids.add(id);
    const x = integer(frame.x, `frames[${index}].x`, 0, width - frameWidth);
    const y = integer(frame.y, `frames[${index}].y`, 0, height - frameHeight);
    exact(frame.width, frameWidth, `frames[${index}].width`);
    exact(frame.height, frameHeight, `frames[${index}].height`);
    if (x % frameWidth || y % frameHeight)
      fail(`Frame ${id} must align to the spritesheet grid.`);
    const cell = `${x},${y}`;
    if (cells.has(cell))
      fail(
        `Frame ${id} overlaps another frame. Each grid cell must be unique.`,
      );
    cells.add(cell);
    return { id, x, y, width: frameWidth, height: frameHeight };
  });
  const animationData = record(data.animations, "animations");
  function animation(key: "idle" | "walk"): Animation {
    const item = record(animationData[key], `animations.${key}`);
    if (
      !Array.isArray(item.frames) ||
      item.frames.length < 1 ||
      item.frames.length > MAX_FRAMES
    ) {
      fail(
        `animations.${key}.frames must contain 1–${MAX_FRAMES} frame IDs in playback order.`,
      );
    }
    const refs = item.frames.map((ref, i) => {
      const id = integer(ref, `animations.${key}.frames[${i}]`, 0, 65535);
      if (!ids.has(id))
        fail(`animations.${key} references missing frame ${id}.`);
      return id;
    });
    const fps = number(item.fps, `animations.${key}.fps`, 0.1, 60);
    if (typeof item.loop !== "boolean")
      fail(`animations.${key}.loop must be true or false.`);
    return { frames: refs, fps, loop: item.loop };
  }
  const facing = record(data.facing, "facing");
  exact(facing.native, "right", "facing.native");
  exact(facing.right, "none", "facing.right");
  exact(facing.left, "mirror-x", "facing.left");
  const anchor = record(data.anchor, "anchor");
  exact(anchor.units, "pixels", "anchor.units");
  exact(anchor.origin, "top-left", "anchor.origin");
  // An anchor may lie on a frame boundary (e.g. a baseline at frameHeight).
  const anchorX = number(anchor.x, "anchor.x", 0, frameWidth);
  const anchorY = number(anchor.y, "anchor.y", 0, frameHeight);
  const scale = record(data.scale, "scale");
  exact(scale.pixelArt, true, "scale.pixelArt");
  exact(scale.integerOnly, true, "scale.integerOnly");
  const recommended = integer(scale.recommended, "scale.recommended", 1, 16);
  exact(data.configuration, "character.json", "configuration");
  return {
    schemaVersion: 1,
    format: "gathria-character-pack",
    name,
    generator,
    spritesheet: {
      file: "spritesheet.png",
      width,
      height,
      frameWidth,
      frameHeight,
      columns,
      rows,
    },
    frames,
    animations: { idle: animation("idle"), walk: animation("walk") },
    facing: { native: "right", right: "none", left: "mirror-x" },
    anchor: { x: anchorX, y: anchorY, units: "pixels", origin: "top-left" },
    scale: { pixelArt: true, recommended, integerOnly: true },
    configuration: "character.json",
  };
}

function validateConfigForManifest(
  value: unknown,
  manifest: CharacterPackManifest,
): CharacterConfig {
  let config: CharacterConfig;
  try {
    config = parseCharacterConfig(value);
  } catch (error) {
    fail(
      `character.json: ${error instanceof Error ? error.message : "Invalid character configuration."}`,
    );
  }
  if (config.name !== manifest.name)
    fail(
      "character.json name must match the name in manifest.json. Export both files from the same character.",
    );
  return config;
}

function parseJson(bytes: Uint8Array, name: string): unknown {
  if (bytes.length > MAX_TEXT_BYTES)
    fail(
      `${name} is too large. JSON and documentation files must be at most 256 KiB.`,
    );
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    fail(`${name} is not valid UTF-8 JSON. Export a fresh file and try again.`);
  }
}

function checkPngHeader(
  bytes: Uint8Array,
  manifest: CharacterPackManifest,
): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((value, i) => bytes[i] === value)) {
    fail("spritesheet.png must be a valid PNG image.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
    fail("spritesheet.png has an invalid PNG header.");
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (
    width !== manifest.spritesheet.width ||
    height !== manifest.spritesheet.height
  ) {
    fail(
      `PNG dimensions (${width}×${height}) do not match manifest dimensions (${manifest.spritesheet.width}×${manifest.spritesheet.height}).`,
    );
  }
}

interface ZipEntry {
  name: string;
  size: number;
  crc: number;
  method: number;
  dataStart: number;
  compressed: number;
}

// Preflight before allocating inflated buffers. No ZIP path is ever written to disk.
function inspectArchive(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES)
    fail("CharacterPack ZIP must be nonempty and at most 32 MiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65557);
    offset--
  ) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0)
    fail("Invalid ZIP directory. Choose an intact CharacterPack .zip file.");
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    fail("Multi-volume ZIP files are not supported.");
  const count = view.getUint16(end + 10, true);
  if (count !== view.getUint16(end + 8, true) || count > REQUIRED_FILES.length)
    fail("A CharacterPack ZIP may contain only the five documented files.");
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (offset + directorySize !== end)
    fail("Invalid ZIP directory bounds; ZIP64 archives are not supported.");
  const names = new Set<string>();
  const ranges: Array<[number, number]> = [];
  const entries: ZipEntry[] = [];
  let totalSize = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      fail("Invalid ZIP entry directory.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || view.getUint16(offset + 34, true))
      fail("Invalid ZIP entry bounds.");
    let name: string;
    try {
      name = decoder.decode(
        bytes.subarray(offset + 46, offset + 46 + nameLength),
      );
    } catch {
      fail("ZIP filenames must be valid UTF-8.");
    }
    if (!(REQUIRED_FILES as readonly string[]).includes(name))
      fail(
        `Unexpected ZIP path ${JSON.stringify(name)}. Use only the five documented files at the archive root.`,
      );
    if (names.has(name)) fail(`ZIP contains duplicate file ${name}.`);
    names.add(name);
    if (flags & ~0x080e || ![0, 8].includes(method))
      fail(
        `${name}: encrypted or unsupported ZIP compression is not supported.`,
      );
    const limit =
      name === "spritesheet.png" ? MAX_ARCHIVE_BYTES : MAX_TEXT_BYTES;
    totalSize += size;
    if (size > limit || totalSize > MAX_ARCHIVE_BYTES + 4 * MAX_TEXT_BYTES)
      fail(`${name} exceeds the CharacterPack uncompressed size limit.`);
    if (
      local + 30 > view.getUint32(end + 16, true) ||
      view.getUint32(local, true) !== 0x04034b50
    )
      fail(`Invalid ZIP local header for ${name}.`);
    if (
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      fail(`Inconsistent ZIP headers for ${name}.`);
    const localNameLength = view.getUint16(local + 26, true);
    const localExtraLength = view.getUint16(local + 28, true);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    if (dataStart + compressed > view.getUint32(end + 16, true))
      fail(`Truncated ZIP data for ${name}.`);
    if (
      localNameLength !== nameLength ||
      !bytes
        .subarray(local + 30, local + 30 + localNameLength)
        .every((value, j) => value === bytes[offset + 46 + j])
    )
      fail(`Inconsistent ZIP filename for ${name}.`);
    if (
      !(flags & 8) &&
      (view.getUint32(local + 14, true) !== crc ||
        view.getUint32(local + 18, true) !== compressed ||
        view.getUint32(local + 22, true) !== size)
    )
      fail(`Inconsistent ZIP sizes or checksum for ${name}.`);
    if (
      ranges.some(
        ([start, finish]) => local < finish && dataStart + compressed > start,
      )
    )
      fail("ZIP entries overlap. Export a fresh CharacterPack.");
    ranges.push([local, dataStart + compressed]);
    entries.push({ name, size, crc, method, dataStart, compressed });
    offset = next;
  }
  if (offset !== end) fail("Invalid ZIP directory length.");
  for (const required of REQUIRED_FILES)
    if (!names.has(required))
      fail(
        `CharacterPack is missing ${required}. Export a complete CharacterPack ZIP.`,
      );
  return entries;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Pure byte validation shared by browser import and tests (image decoding follows in the browser). */
export function readCharacterPackArchive(bytes: Uint8Array): {
  manifest: CharacterPackManifest;
  config: CharacterConfig;
  png: Uint8Array;
} {
  const entries = inspectArchive(bytes);
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    const compressed = bytes.subarray(
      entry.dataStart,
      entry.dataStart + entry.compressed,
    );
    if (entry.method === 0) files[entry.name] = compressed;
    else {
      // Small compressed chunks bound temporary allocations, even when an archive lies about inflated size.
      const output = new Uint8Array(entry.size);
      let written = 0;
      try {
        const inflate = new Inflate((chunk) => {
          if (written + chunk.length > entry.size)
            fail("Inflated ZIP data exceeds its declared size.");
          output.set(chunk, written);
          written += chunk.length;
        });
        if (!compressed.length) fail("Missing compressed data.");
        for (let start = 0; start < compressed.length; start += 1024) {
          const end = Math.min(start + 1024, compressed.length);
          inflate.push(
            compressed.subarray(start, end),
            end === compressed.length,
          );
        }
      } catch {
        fail(
          `Could not decompress ${entry.name} within its declared size. The ZIP may be damaged; export it again.`,
        );
      }
      if (written !== entry.size)
        fail(
          `${entry.name} failed its ZIP size check. Export the package again.`,
        );
      files[entry.name] = output;
    }
    if (
      files[entry.name].length !== entry.size ||
      crc32(files[entry.name]) !== entry.crc
    )
      fail(
        `${entry.name} failed its ZIP checksum or size check. Export the package again.`,
      );
  }
  const manifest = validateManifest(
    parseJson(files["manifest.json"], "manifest.json"),
  );
  const config = validateConfigForManifest(
    parseJson(files["character.json"], "character.json"),
    manifest,
  );
  const png = files["spritesheet.png"];
  checkPngHeader(png, manifest);
  return { manifest, config, png };
}

async function decodePng(
  bytes: Uint8Array,
  manifest: CharacterPackManifest,
): Promise<HTMLImageElement> {
  checkPngHeader(bytes, manifest);
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "spritesheet.png could not be decoded. Choose an intact PNG exported by the editor.",
          ),
        );
      image.src = url;
    });
    if (
      image.naturalWidth !== manifest.spritesheet.width ||
      image.naturalHeight !== manifest.spritesheet.height
    )
      fail("Decoded PNG dimensions do not match manifest.json.");
    return image;
  } finally {
    // The fully decoded image retains its pixels; the temporary Blob URL is no longer needed.
    URL.revokeObjectURL(url);
  }
}

export async function loadCharacterPack(
  file: Blob,
): Promise<LoadedCharacterPack> {
  if (file.size > MAX_ARCHIVE_BYTES)
    fail("CharacterPack ZIP must be at most 32 MiB.");
  const { manifest, config, png } = readCharacterPackArchive(
    new Uint8Array(await file.arrayBuffer()),
  );
  return { manifest, config, image: await decodePng(png, manifest) };
}

export async function loadCharacterFiles(
  png: Blob,
  metadata: unknown,
  config?: unknown,
): Promise<LoadedCharacterPack> {
  const manifest = validateManifest(metadata);
  const parsedConfig =
    config === undefined
      ? undefined
      : validateConfigForManifest(config, manifest);
  if (png.size > MAX_ARCHIVE_BYTES)
    fail("spritesheet.png must be at most 32 MiB.");
  const image = await decodePng(
    new Uint8Array(await png.arrayBuffer()),
    manifest,
  );
  return { manifest, image, config: parsedConfig };
}

export async function pixelsToPng(
  generated: GeneratedCharacter,
): Promise<Blob> {
  const manifest = validateManifest(generated.manifest);
  if (
    generated.width !== manifest.spritesheet.width ||
    generated.height !== manifest.spritesheet.height ||
    generated.pixels.length !== generated.width * generated.height * 4
  ) {
    fail(
      "Generated pixel buffer dimensions do not match its manifest. Generate the character again.",
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = generated.width;
  canvas.height = generated.height;
  const context = canvas.getContext("2d");
  if (!context) fail("This browser cannot create a 2D canvas for PNG export.");
  context.putImageData(
    new ImageData(
      new Uint8ClampedArray(generated.pixels),
      generated.width,
      generated.height,
    ),
    0,
    0,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("PNG export failed. Try exporting again.")),
      "image/png",
    );
  });
}

const PROVENANCE = `Gathria Character — CharacterPack v1\n\nThe bundled deterministic pixel artwork is drawn from original procedural shapes and poses authored for this project. No external image assets, photos, paid APIs, or AI generation are used.\n\nGenerated sprites may be used, modified, and redistributed, including commercially, under the MIT License below. Retain its copyright and permission notice when redistributing. No visible in-game credit is required. This permission covers this project's original artwork; it grants no rights to third-party trademarks or identities.\n\nPrototype format: integration with the Gathria runtime is unverified.\n\nMIT License

Copyright (c) 2026 Gathria Character contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
const INTEGRATION = `# CharacterPack v1\n\nRead manifest.json and decode spritesheet.png as an RGBA image. Validate schemaVersion = 1 and format = "gathria-character-pack", then validate PNG dimensions against spritesheet.width/height.\n\nframes contains grid-aligned source rectangles, each with a unique numeric id. Resolve animation frame references by id (not by array index). Play animations.idle or animations.walk at their declared fps; loop only when loop is true.\n\nDraw the source rectangle at a positive integer scale with image smoothing disabled. Coordinates are pixels from the top-left. anchor.x/y are frame-local placement coordinates: draw the frame with its anchor at your world position. For left-facing output mirror the frame horizontally around its anchor; for right-facing output draw it unchanged. Keep the same world anchor when flipping. Do not flip the entire spritesheet.\n\ncharacter.json is editable source configuration, not required for playback. This pack contains all assets needed by a consumer; do not regenerate them. See the repository docs/CHARACTER_PACK_V1.md for the complete contract and the standalone player at player.html for an implementation.\n\nFrame dimensions and timing are prototype choices, not verified Gathria requirements. Gathria integration remains unverified pending inspection of its actual runtime.\n`;

const ILLUSTRATED_PROVENANCE = PROVENANCE.replace(
  "The bundled deterministic pixel artwork is drawn from original procedural shapes and poses authored for this project. No external image assets, photos, paid APIs, or AI generation are used.",
  "Artwork version 3 uses AI-assisted illustration assets created for this project with OpenAI's image generation tool, then extracted into masked layers and composed by a deterministic local renderer. Source banks and preparation scripts are included in the repository. User-supplied images guided the visual style; those reference images are not bundled in this pack. No photos, remote services, or model calls are used during character customization, generation, export, or playback.",
);

export async function createCharacterPack(
  config: CharacterConfig,
  generated: GeneratedCharacter,
): Promise<Blob> {
  const manifest = validateManifest(generated.manifest);
  const validatedConfig = validateConfigForManifest(config, manifest);
  const png = await pixelsToPng(generated);
  if (png.size > MAX_ARCHIVE_BYTES)
    fail(
      "Generated PNG exceeds the 32 MiB CharacterPack limit. Reduce the sheet dimensions or frame count.",
    );
  const bytes = zipSync(
    {
      "spritesheet.png": [
        new Uint8Array(await png.arrayBuffer()),
        { level: 0 },
      ],
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2) + "\n"),
      "character.json": strToU8(
        JSON.stringify(validatedConfig, null, 2) + "\n",
      ),
      "PROVENANCE.txt": strToU8(
        validatedConfig.schemaVersion === 2 &&
          validatedConfig.artworkVersion >= 3
          ? validatedConfig.artworkVersion === 5
            ? ILLUSTRATED_PROVENANCE.replace(
                "Artwork version 3",
                "Artwork version 5",
              ).replace(
                "Prototype format:",
                "Version 5 uses complete authored heads and wedding layers produced offline with OpenAI image generation. Repository sources: artwork/cohesive-source/character-expression-bank.png and garment-backplate.png. scripts/prepare-cohesive-assets.py registers neck/waist/sole landmarks, thresholds alpha, extracts overlapping layers and assigns recolor masks; the garment backplate removes embedded standing hands. Waves/crop use three authored expressions; bob/crest retain their illustrated open-eye face. Runtime composition and playback remain local and deterministic. See artwork/cohesive-source/README.md for production history.\n\nPrototype format:",
              )
            : validatedConfig.artworkVersion === 4
              ? ILLUSTRATED_PROVENANCE.replace(
                  "Artwork version 3",
                  "Artwork version 4",
                ).replace(
                  "Prototype format:",
                  "Version 4 adds deterministic expressions, motion and an AI-assisted rose hairpiece.\n\nPrototype format:",
                )
              : ILLUSTRATED_PROVENANCE
          : PROVENANCE,
      ),
      "INTEGRATION.md": strToU8(INTEGRATION),
    },
    { level: 6 },
  );
  if (bytes.length > MAX_ARCHIVE_BYTES)
    fail(
      "Generated ZIP exceeds the 32 MiB CharacterPack limit. Reduce the sheet dimensions or frame count.",
    );
  return new Blob([bytes], { type: "application/zip" });
}

export function safeFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "character"
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Delayed revocation permits browsers to finish starting the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
