import { Deflate, Inflate } from "pako/browser";
import { crc32, readBoundedArchive } from "./bounded-archive";
import { sha256 } from "./sha256";
import {
  validateBakedCharacterRecipe,
  validatePortableManifest,
  validateRgbaPngScanlines,
} from "./pack";
import type {
  BakedCharacterRecipe,
  BakedCharacterPackManifest,
  CharacterPackV2Manifest,
} from "./types";

/** External source contract, deliberately distinct from native CharacterPack. */
export const BAKED_SOURCE_ACTIONS = [
  "idle",
  "walk",
  "run",
  "celebrate",
] as const;
export const BAKED_SOURCE_OPTIONAL_ACTIONS = ["jump"] as const;
export type BakedSourceAction =
  | (typeof BAKED_SOURCE_ACTIONS)[number]
  | (typeof BAKED_SOURCE_OPTIONAL_ACTIONS)[number];
const supportedSourceActions = [
  ...BAKED_SOURCE_ACTIONS,
  ...BAKED_SOURCE_OPTIONAL_ACTIONS,
] as const;
function sourceActionKey(action: BakedSourceAction): string {
  return action === "jump" ? "jump_once" : `${action}_loop`;
}
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_EXPANDED = 128 * 1024 * 1024;
const MAX_TEXT = 256 * 1024;
const MAX_PNG = 8 * 1024 * 1024;
const MAX_ATLAS_PIXELS = 64 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 512 * 1024 * 1024;
const MAX_FRAMES = 256;
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function fail(message: string): never {
  throw Error(message);
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`${label} must be finite and between ${min} and ${max}.`);
  return value;
}
function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  const n = number(value, label, min, max);
  if (!Number.isInteger(n)) fail(`${label} must be an integer.`);
  return n;
}
function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(`${label} needs nonempty text of at most ${max} characters.`);
  return value;
}
function parse(bytes: Uint8Array | undefined, label: string): unknown {
  if (!bytes || bytes.length > MAX_TEXT)
    fail(`${label} is missing or exceeds its metadata limit.`);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    return fail(`${label} must be valid UTF-8 JSON.`);
  }
}
function join(arrays: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

interface Directory {
  bytes: Uint8Array;
  offset: number;
  end: number;
  entries: Array<{ name: string; start: number; end: number; size: number }>;
}
/** Read directory without inflating payloads. Folder records are accepted only
 * as empty canonical paths; retained files still pass the shared strict reader. */
function sourceDirectory(bytes: Uint8Array): Directory {
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE)
    fail("Source ZIP must be intact and at most 64 MiB.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (
      v.getUint32(p, true) === 0x06054b50 &&
      p + 22 + v.getUint16(p + 20, true) === bytes.length
    ) {
      end = p;
      break;
    }
  if (end < 0 || v.getUint16(end + 4, true) || v.getUint16(end + 6, true))
    fail("Invalid or multi-volume source ZIP.");
  const count = v.getUint16(end + 10, true),
    directory = v.getUint32(end + 16, true);
  if (
    !count ||
    count > 4096 ||
    count !== v.getUint16(end + 8, true) ||
    directory + v.getUint32(end + 12, true) !== end
  )
    fail("Invalid source ZIP directory limits.");
  let p = directory,
    expanded = 0;
  const names = new Set<string>();
  const entries: Directory["entries"] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || v.getUint32(p, true) !== 0x02014b50)
      fail("Invalid source ZIP entry.");
    const next =
      p +
      46 +
      v.getUint16(p + 28, true) +
      v.getUint16(p + 30, true) +
      v.getUint16(p + 32, true);
    if (next > end) fail("Invalid source ZIP entry bounds.");
    let name: string;
    try {
      name = decoder.decode(
        bytes.subarray(p + 46, p + 46 + v.getUint16(p + 28, true)),
      );
    } catch {
      return fail("Source ZIP filenames must be UTF-8.");
    }
    if (
      !name ||
      name.length > 180 ||
      name.startsWith("/") ||
      name.includes("\\") ||
      name.includes(":") ||
      name.split("/").some((s) => s === "." || s === "..") ||
      /[\x00-\x1f]/.test(name)
    )
      fail("Unsafe source ZIP path.");
    if (names.has(name)) fail(`Duplicate source ZIP path ${name}.`);
    names.add(name);
    const size = v.getUint32(p + 24, true);
    expanded += size;
    if (expanded > MAX_EXPANDED)
      fail("Source ZIP exceeds its expanded size limit.");
    if (name.endsWith("/")) {
      if (size) fail("Source ZIP directory entries must be empty.");
    } else entries.push({ name, start: p, end: next, size });
    p = next;
  }
  if (p !== end) fail("Invalid source ZIP directory size.");
  return { bytes, offset: directory, end, entries };
}
/** Drop only directory records (or inspect just manifest); compressed file data
 * remains untouched. The shared reader validates local headers, CRC and bounds. */
function readEntries(
  directory: Directory,
  chosen: Directory["entries"],
  limits: Record<string, number>,
  required: string[],
): Record<string, Uint8Array> {
  const central = join(
    chosen.map((e) => directory.bytes.subarray(e.start, e.end)),
  );
  const trailer = directory.bytes.slice(directory.end);
  const v = new DataView(trailer.buffer);
  v.setUint16(8, chosen.length, true);
  v.setUint16(10, chosen.length, true);
  v.setUint32(12, central.length, true);
  const normalized = join([
    directory.bytes.subarray(0, directory.offset),
    central,
    trailer,
  ]);
  return readBoundedArchive(normalized, {
    label: "Unified source ZIP",
    maxArchiveBytes: MAX_ARCHIVE,
    maxExpandedBytes: MAX_EXPANDED,
    minFiles: 1,
    maxFiles: 4096,
    files: limits,
    required,
  });
}

/** Explicit dispatch avoids retrying a corrupt source as an unrelated format. */
export async function inspectBakedArchiveKind(
  file: Blob,
): Promise<"unified-source" | "character-pack"> {
  if (file.size > MAX_ARCHIVE)
    fail("Character archive must be at most 64 MiB.");
  const directory = sourceDirectory(new Uint8Array(await file.arrayBuffer()));
  const entries = directory.entries.filter((e) => e.name === "manifest.json");
  const files = readEntries(directory, entries, { "manifest.json": MAX_TEXT }, [
    "manifest.json",
  ]);
  const manifest = object(
    parse(files["manifest.json"], "manifest.json"),
    "manifest",
  );
  if (manifest.format === "Gathria Unified CharacterPack")
    return "unified-source";
  if (manifest.format === "gathria-character-pack") return "character-pack";
  return fail("Unsupported character archive format.");
}

export interface SourceFrame {
  index: number;
  path: string;
  sourceFrame: number;
  sourceIndex: number;
  timeSeconds: number;
  ground: { x: number; y: number };
  head: { x: number; y: number | null; quality?: string };
  png: Uint8Array;
  pixelHash: string;
  partialAlphaPixels: number;
}
export interface SourceClip {
  fps: number;
  loop: boolean;
  selectionStrategy: string;
  frames: SourceFrame[];
}
export interface SourceCharacter {
  id: string;
  name: string;
  anchor: { x: number; y: number };
  actions: Record<(typeof BAKED_SOURCE_ACTIONS)[number], SourceClip> &
    Partial<Record<(typeof BAKED_SOURCE_OPTIONAL_ACTIONS)[number], SourceClip>>;
  metadata: Record<string, unknown>;
}
export interface BakedSourceBundle {
  name: string;
  sourceSha256: string;
  width: number;
  height: number;
  manifest: Record<string, unknown>;
  characters: SourceCharacter[];
  sourceFiles: string[];
}
export interface RgbaPng {
  width: number;
  height: number;
  pixels: Uint8Array;
  /** Identical color interpretation across frames; retained in the atlas. */
  colorChunks: Uint8Array[];
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c,
    pa = Math.abs(p - a),
    pb = Math.abs(p - b),
    pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function adler32(bytes: Uint8Array): number {
  let a = 1,
    b = 0;
  for (let start = 0; start < bytes.length; start += 5552) {
    const end = Math.min(start + 5552, bytes.length);
    for (let i = start; i < end; i++) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}
/** Strict platform inflation rejects invalid block lengths and trailing streams
 * before fflate can see untrusted compressed data. No full RGBA allocation. */
async function validateSourceCompression(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<void> {
  if (bytes.length < 45 || !pngSignature.every((b, i) => bytes[i] === b))
    fail("Source image must be an intact PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(16) !== width || view.getUint32(20) !== height)
    fail("Source PNG dimensions do not match its canvas.");
  const chunks: Uint8Array[] = [];
  for (let offset = 8; offset < bytes.length; ) {
    if (offset + 12 > bytes.length) fail("Truncated source PNG chunk.");
    const size = view.getUint32(offset),
      end = offset + size + 12;
    if (end > bytes.length) fail("Invalid source PNG chunk bounds.");
    const type = view.getUint32(offset + 4);
    if ([0x6163544c, 0x6663544c, 0x66644154].includes(type))
      fail("Source frames must be static PNG images, not APNG.");
    if (type === 0x49444154 && size)
      chunks.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
  }
  await validateRgbaPngScanlines(chunks, width, height, false);
}
interface SourcePngData {
  width: number;
  height: number;
  idats: Uint8Array[];
  colorChunks: Uint8Array[];
}

/** Shared structure/CRC checks. The synchronous API deliberately retains its
 * existing acceptance rules; importing a static atlas performs its own preflight. */
function parseSourceRgbaPng(
  bytes: Uint8Array,
  expected?: { width: number; height: number },
): SourcePngData {
  if (
    bytes.length < 45 ||
    bytes.length > MAX_ARCHIVE ||
    !pngSignature.every((b, i) => bytes[i] === b)
  )
    fail("Source image must be an intact PNG.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8,
    width = 0,
    height = 0,
    ended = false,
    hadIdat = false,
    idatEnded = false;
  const idats: Uint8Array[] = [];
  const colorChunks: Uint8Array[] = [];
  while (p < bytes.length) {
    if (p + 12 > bytes.length) fail("Truncated source PNG chunk.");
    const size = v.getUint32(p),
      end = p + size + 12;
    if (end > bytes.length) fail("Invalid source PNG chunk bounds.");
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    if (
      crc32(bytes.subarray(p + 4, p + 8 + size)) !== v.getUint32(p + 8 + size)
    )
      fail(`Source PNG ${type} checksum mismatch.`);
    if (p === 8 && type !== "IHDR") fail("Source PNG must begin with IHDR.");
    if (type === "IHDR") {
      if (width || size !== 13) fail("Invalid PNG IHDR.");
      width = integer(v.getUint32(p + 8), "PNG width", 1, 8192);
      height = integer(v.getUint32(p + 12), "PNG height", 1, 8192);
      if (width * height > MAX_ATLAS_PIXELS)
        fail("PNG exceeds the decoded pixel budget.");
      if (
        bytes[p + 16] !== 8 ||
        bytes[p + 17] !== 6 ||
        bytes[p + 18] ||
        bytes[p + 19] ||
        bytes[p + 20]
      )
        fail(
          "Source PNG must be 8-bit RGBA, non-interlaced; no implicit color conversion is performed.",
        );
      if (expected && (width !== expected.width || height !== expected.height))
        fail("Source PNG dimensions do not match its canvas.");
    } else if (type === "IDAT") {
      if (idatEnded) fail("Non-contiguous PNG IDAT chunks.");
      hadIdat = true;
      idats.push(bytes.subarray(p + 8, p + 8 + size));
    } else if (type === "IEND") {
      if (size || !hadIdat || end !== bytes.length) fail("Invalid PNG IEND.");
      ended = true;
    } else {
      if (hadIdat) idatEnded = true;
      if (["sRGB", "gAMA", "cHRM", "iCCP"].includes(type)) {
        if (hadIdat || size > MAX_TEXT) fail("Invalid PNG color profile.");
        colorChunks.push(bytes.slice(p, end));
      } else if (type[0] === type[0].toUpperCase())
        fail(`Unsupported critical PNG chunk ${type}.`);
    }
    p = end;
  }
  if (!ended || !width || !height) fail("Incomplete source PNG.");
  return { width, height, idats, colorChunks };
}

function checkSourceAdler(scan: Uint8Array, idats: Uint8Array[]): void {
  // Explicit parity check for both codecs. The four trailer bytes may span
  // IDAT chunks (including empty chunks).
  const tail: number[] = [];
  for (let k = idats.length - 1; k >= 0 && tail.length < 4; k--)
    for (let i = idats[k].length - 1; i >= 0 && tail.length < 4; i--)
      tail.unshift(idats[k][i]);
  if (
    tail.length !== 4 ||
    adler32(scan) !== new DataView(new Uint8Array(tail).buffer).getUint32(0)
  )
    fail("Source PNG zlib checksum mismatch.");
}

function unfilterSourceRgba(scan: Uint8Array, source: SourcePngData): RgbaPng {
  const { width, height, colorChunks } = source;
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = scan[y * (stride + 1)];
    if (filter > 4) fail("Unsupported PNG row filter.");
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x,
        a = x >= 4 ? pixels[i - 4] : 0,
        b = y ? pixels[i - stride] : 0,
        c = y && x >= 4 ? pixels[i - stride - 4] : 0;
      const prediction =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? Math.floor((a + b) / 2)
                : paeth(a, b, c);
      pixels[i] = (scan[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, pixels, colorChunks };
}

/** Lossless RGBA8 PNG decode. No Canvas premultiplication, threshold or recolor.
 * Bounded before allocating and streaming inflation cannot exceed declared rows. */
export function decodeSourceRgbaPng(
  bytes: Uint8Array,
  expected?: { width: number; height: number },
): RgbaPng {
  const source = parseSourceRgbaPng(bytes, expected);
  const { width, height, idats } = source;
  const scan = new Uint8Array((width * 4 + 1) * height);
  let written = 0;
  try {
    // Fixed-size output blocks avoid repeatedly growing/copying fflate's
    // streaming buffers on large sparse ownership atlases. Output is still
    // bounded before every write, including compressed data exceeding IHDR.
    const inflater = new Inflate({ chunkSize: 64 * 1024, windowBits: 15 });
    let stream: Parameters<Inflate["onStart"]>[0] | undefined;
    inflater.onStart = (state) => {
      stream = state;
    };
    inflater.onData = (chunk) => {
      if (written + chunk.length > scan.length)
        fail("PNG inflation exceeds declared size.");
      scan.set(chunk, written);
      written += chunk.length;
    };
    for (const idat of idats) {
      if (!idat.length) continue;
      if (inflater.ended || !inflater.push(idat, false) || stream?.avail_in)
        fail("PNG contains invalid or trailing compressed data.");
    }
    // A legal zero-length final IDAT must still finalize/validate the stream.
    if (!inflater.ended) inflater.push(new Uint8Array(), true);
    if (!inflater.ended || inflater.err) fail("Incomplete PNG zlib stream.");
  } catch {
    return fail(
      "Source PNG cannot be decoded within its declared dimensions; invalid zlib checksum or compressed image data.",
    );
  }
  if (written !== scan.length)
    fail("PNG decoded row count does not match dimensions.");
  checkSourceAdler(scan, idats);
  return unfilterSourceRgba(scan, source);
}

/** Native, strict zlib inflation with the same raw RGBA reconstruction as the
 * synchronous codec. Input is snapshotted before yielding; no browser image
 * decoder, premultiplication or implicit color conversion is involved. */
export async function decodeSourceRgbaPngAsync(
  bytes: Uint8Array,
  expected?: { width: number; height: number },
  options: { signal?: AbortSignal } = {},
): Promise<RgbaPng> {
  const { signal } = options;
  const cancelled = () =>
    new DOMException("PNG decoding cancelled.", "AbortError");
  const abort = () => {
    if (signal?.aborted) throw cancelled();
  };
  abort();
  // Reject oversized input before copying it. All remaining header/CRC/budget
  // checks stay shared with the synchronous codec, before scan allocation.
  if (bytes.length > MAX_ARCHIVE) fail("Source image must be an intact PNG.");
  const source = parseSourceRgbaPng(new Uint8Array(bytes), expected);
  const { width, height, idats } = source;
  const scan = new Uint8Array((width * 4 + 1) * height);
  let written = 0;
  const reader = new Blob(idats)
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  const onAbort = () => {
    void reader.cancel(cancelled()).catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      abort();
      const { done, value } = await reader.read();
      abort();
      if (done) break;
      if (written + value.length > scan.length)
        fail("PNG inflation exceeds declared size.");
      scan.set(value, written);
      written += value.length;
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    abort();
    return fail(
      "Source PNG cannot be decoded within its declared dimensions; invalid compressed image data.",
    );
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  if (written !== scan.length)
    fail("PNG decoded row count does not match dimensions.");
  // DecompressionStream also checks Adler-32 and exact stream end. Keeping the
  // explicit trailer check preserves parity for IDAT splits and empty chunks.
  checkSourceAdler(scan, idats);
  abort();
  return unfilterSourceRgba(scan, source);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(data.length + 12),
    v = new DataView(bytes.buffer);
  v.setUint32(0, data.length);
  bytes.set(encoder.encode(type), 4);
  bytes.set(data, 8);
  v.setUint32(data.length + 8, crc32(bytes.subarray(4, data.length + 8)));
  return bytes;
}
/** Streaming row compression avoids a second full unfiltered atlas allocation. */
function* encodeRgbaRows(image: RgbaPng): Generator<void, Uint8Array> {
  const { width, height, pixels, colorChunks } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > MAX_ATLAS_PIXELS ||
    pixels.length !== width * height * 4
  )
    fail("Invalid RGBA atlas dimensions.");
  const header = new Uint8Array(13),
    v = new DataView(header.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const compressed: Uint8Array[] = [];
  // fflate's streaming compressor can emit invalid backwards distances for
  // sparse, padded RGBA rows. Keep bounded row streaming with zlib's Deflate
  // implementation; decoded pixels and color chunks remain unchanged.
  const zlib = new Deflate({ level: 6, chunkSize: 64 * 1024 });
  zlib.onData = (chunk) => compressed.push(chunk);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(stride + 1);
    row[0] = 2;
    for (let x = 0; x < stride; x++)
      row[x + 1] =
        (pixels[y * stride + x] - (y ? pixels[(y - 1) * stride + x] : 0)) & 255;
    if (!zlib.push(row, y === height - 1))
      fail(`PNG compression failed: ${zlib.msg || zlib.err}.`);
    if (y % 128 === 127) yield;
  }
  return join([
    pngSignature,
    pngChunk("IHDR", header),
    ...colorChunks,
    pngChunk("IDAT", join(compressed)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}
export function encodeSourceRgbaPng(image: RgbaPng): Uint8Array {
  const rows = encodeRgbaRows(image);
  let next = rows.next();
  while (!next.done) next = rows.next();
  return next.value;
}
async function encodeAtlasPng(image: RgbaPng): Promise<Uint8Array> {
  const rows = encodeRgbaRows(image);
  let next = rows.next();
  while (!next.done) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    next = rows.next();
  }
  return next.value;
}

/** Lossless page encoding with periodic browser yields for large authored packs. */
export { encodeAtlasPng as encodeSourceRgbaPngAsync };

function sourceFileLimit(path: string): number {
  if (path === "manifest.json" || path === "README.md") return MAX_TEXT;
  if (
    /^characters\/[a-z0-9][a-z0-9_-]{0,31}\/(meta\.json|actions\/((idle|walk|run|celebrate)_loop|jump_once)\.json)$/.test(
      path,
    )
  )
    return MAX_TEXT;
  if (
    /^characters\/[a-z0-9][a-z0-9_-]{0,31}\/layers\/body_composite\/((idle|walk|run|celebrate)_loop|jump_once)\/\d{3}\.png$/.test(
      path,
    )
  )
    return MAX_PNG;
  if (
    /^(docs|schema|equipment|tools)\/[a-zA-Z0-9_.-]+\.(json|md|py)$/.test(path)
  )
    return MAX_TEXT;
  if (/^previews\/[a-zA-Z0-9_.-]+\.(png|webp|gif|html)$/.test(path))
    return /\.html$/.test(path) ? MAX_TEXT : MAX_PNG;
  return fail(`Unexpected Unified source path ${JSON.stringify(path)}.`);
}

/** Parse the external source contract; equipment templates are never promoted
 * to editable clothing. Every selected RGBA image is decoded before acceptance. */
export async function importBakedSourceArchive(
  file: Blob,
): Promise<BakedSourceBundle> {
  if (file.size > MAX_ARCHIVE)
    fail("Unified source ZIP must be at most 64 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    directory = sourceDirectory(bytes);
  const limits = Object.fromEntries(
    directory.entries.map((e) => [e.name, sourceFileLimit(e.name)]),
  );
  const files = readEntries(directory, directory.entries, limits, [
    "manifest.json",
  ]);
  const manifest = object(
    parse(files["manifest.json"], "manifest.json"),
    "manifest",
  );
  if (
    manifest.format !== "Gathria Unified CharacterPack" ||
    manifest.version !== "1.0.0" ||
    manifest.contract !== "characterpack-v1" ||
    manifest.render_mode !== "baked_composite"
  )
    fail(
      "Expected Unified CharacterPack 1.0.0 baked_composite source contract.",
    );
  const canvas = object(manifest.canvas, "canvas"),
    width = integer(canvas.width, "canvas.width", 1, 2048),
    height = integer(canvas.height, "canvas.height", 1, 2048);
  if (
    canvas.coordinate_origin !== "top-left" ||
    canvas.orientation !== "right_3q"
  )
    fail(
      "Source canvas must use top-left coordinates and right_3q orientation.",
    );
  // The canvas ground is a declared default; each character's stable source
  // anchor remains authoritative. Different characters are never re-aligned.
  number(canvas.ground_y, "canvas.ground_y", 0, height);
  const ids = manifest.characters;
  if (!Array.isArray(ids) || !ids.length || ids.length > 8)
    fail("Source needs 1–8 character IDs.");
  if (
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) => typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id),
    )
  )
    fail("Invalid or duplicate source character IDs.");
  const actionDefinitions = object(manifest.actions, "actions");
  if (
    Object.keys(actionDefinitions).some(
      (k) => !supportedSourceActions.some((a) => sourceActionKey(a) === k),
    )
  )
    fail(
      "Unsupported source action; expected idle/walk/run/celebrate loops and optional jump_once.",
    );
  const availableActions: readonly BakedSourceAction[] = [
    ...BAKED_SOURCE_ACTIONS,
    ...BAKED_SOURCE_OPTIONAL_ACTIONS.filter(
      (action) => sourceActionKey(action) in actionDefinitions,
    ),
  ];
  let totalPixels = 0;
  const usedImages = new Set<string>();
  const characters: SourceCharacter[] = [];
  let profileSignature: string | undefined;
  for (const id of ids as string[]) {
    const metadata = object(
      parse(files[`characters/${id}/meta.json`], `${id}/meta.json`),
      `${id} metadata`,
    );
    if (
      metadata.id !== id ||
      metadata.visual_mode !== "baked_composite" ||
      metadata.schema_version !== "1.0.0"
    )
      fail(`Character ${id} metadata must describe the baked source identity.`);
    const actionsMeta = object(metadata.actions, `${id}.actions`);
    if (Object.keys(actionsMeta).some((key) => !(key in actionDefinitions)))
      fail(
        `Unsupported ${id} action metadata not declared in the source manifest.`,
      );
    const actions = {} as SourceCharacter["actions"];
    let anchor: SourceCharacter["anchor"] | undefined;
    let count = 0;
    for (const action of availableActions) {
      const loop = action !== "jump";
      const repeat = loop ? -1 : 0;
      const key = sourceActionKey(action),
        definition = object(actionDefinitions[key], `actions.${key}`),
        detail = object(actionsMeta[key], `${id}.actions.${key}`);
      const configPath = `characters/${id}/actions/${key}.json`;
      if (
        detail.config !== `actions/${key}.json` ||
        detail.frames_dir !== `layers/body_composite/${key}`
      )
        fail(`Unexpected ${id}/${key} metadata paths.`);
      const clip = object(parse(files[configPath], configPath), configPath),
        fps = number(definition.fps, `${key}.fps`, 0.1, 60);
      const expected = integer(definition.frames, `${key}.frames`, 1, 128);
      if (
        clip.name !== key ||
        clip.fps !== fps ||
        definition.loop !== loop ||
        clip.loop !== loop ||
        definition.repeat !== repeat ||
        clip.repeat !== repeat ||
        detail.count !== expected
      )
        fail(`Inconsistent ${id}/${key} timing or count metadata.`);
      if (
        definition.duration_ms !== undefined &&
        Math.abs(
          number(definition.duration_ms, `${key}.duration_ms`, 1, 1280000) -
            (1000 * expected) / fps,
        ) > 1
      )
        fail(
          `Inconsistent ${key} duration; FPS and sequence length are authoritative.`,
        );
      if (
        definition.frame_template !==
        `characters/{character}/layers/body_composite/${key}/{frame:03d}.png`
      )
        fail(`Unsupported ${key} frame template.`);
      if (
        !Array.isArray(clip.frames) ||
        clip.frames.length !== expected ||
        (count += expected) > MAX_FRAMES
      )
        fail(`Source ${id} has missing frames or exceeds its frame budget.`);
      const frames: SourceFrame[] = [];
      for (let index = 0; index < clip.frames.length; index++) {
        const frame = object(clip.frames[index], `${id}/${key}[${index}]`),
          relative = `layers/body_composite/${key}/${String(index).padStart(3, "0")}.png`;
        if (
          frame.i !== index ||
          frame.image !== relative ||
          frame.source_action !== action
        )
          fail(
            `Source ${id}/${key} frame order, source action or path is invalid.`,
          );
        const anchors = object(frame.anchors, "anchors"),
          ground = object(anchors.ground, "ground"),
          head = object(anchors.head, "head");
        const position = {
          x: number(ground.x, "ground.x", 0, width),
          y: number(ground.y, "ground.y", 0, height),
        };
        if (!anchor) anchor = position;
        if (position.x !== anchor.x || position.y !== anchor.y)
          fail(
            `Source ${id} anchor must stay fixed across actions; no silent repositioning is performed.`,
          );
        const headAnchor: SourceFrame["head"] = {
          x: number(head.x, "head.x", 0, width),
          y: head.y === null ? null : number(head.y, "head.y", 0, height),
          ...(head.quality === undefined
            ? {}
            : { quality: text(head.quality, "head.quality") }),
        };
        const path = `characters/${id}/${relative}`,
          png = files[path];
        if (!png) fail(`Missing source frame ${path}.`);
        if ((totalPixels += width * height) > MAX_SOURCE_PIXELS)
          fail("Source exceeds the total decoded pixel budget.");
        await validateSourceCompression(png, width, height);
        const decoded = decodeSourceRgbaPng(png, { width, height });
        let transparent = 0,
          visible = 0,
          partial = 0;
        for (let p = 3; p < decoded.pixels.length; p += 4) {
          const alpha = decoded.pixels[p];
          if (!alpha) transparent++;
          else visible++;
          if (alpha > 0 && alpha < 255) partial++;
        }
        if (!visible || !transparent)
          fail(
            `Source frame ${path} must contain both visible artwork and transparent background.`,
          );
        const signature = await sha256(join(decoded.colorChunks));
        if (profileSignature === undefined) profileSignature = signature;
        else if (signature !== profileSignature)
          fail("Source frames use incompatible PNG color profiles.");
        frames.push({
          index,
          path,
          sourceFrame: integer(
            frame.source_video_frame,
            "source_video_frame",
            0,
            1e9,
          ),
          sourceIndex: integer(frame.source_index, "source_index", 0, 1e9),
          timeSeconds: number(frame.source_time_s, "source_time_s", 0, 1e8),
          ground: position,
          head: headAnchor,
          png,
          pixelHash: await sha256(decoded.pixels),
          partialAlphaPixels: partial,
        });
        usedImages.add(path);
      }
      actions[action] = {
        fps,
        loop,
        selectionStrategy: text(
          definition.selection_strategy,
          `${key}.selection_strategy`,
          120,
        ),
        frames,
      };
    }
    characters.push({
      id,
      name:
        typeof metadata.name === "string"
          ? text(metadata.name, "character.name", 80)
          : id,
      anchor: anchor!,
      actions,
      metadata,
    });
  }
  for (const path of Object.keys(files))
    if (
      /^characters\/.*\/layers\/body_composite\/.*\.png$/.test(path) &&
      !usedImages.has(path)
    )
      fail(`Unreferenced source frame ${path}.`);
  return {
    name:
      typeof manifest.name === "string"
        ? text(manifest.name, "source name", 80)
        : "Kling source characters",
    sourceSha256: await sha256(bytes),
    width,
    height,
    manifest,
    characters,
    sourceFiles: Object.keys(files).sort(),
  };
}

export interface ConvertedSourceCharacter {
  manifest: BakedCharacterPackManifest;
  png: Blob;
  additionalPngs: Blob[];
  recipe: BakedCharacterRecipe;
  stats: {
    sequenceFrames: number;
    uniqueFrames: number;
    width: number;
    height: number;
    sourcePixelFidelity: "exact-rgba";
    partialAlphaPixels: number;
  };
}
interface SourceAtlasPage {
  start: number;
  count: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
}
/** Plan native pages and enforce all decoded budgets before allocating pixels. */
export function planSourceAtlasPages(
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  legacyUniqueFrames = 0,
): SourceAtlasPage[] {
  integer(frameWidth, "frameWidth", 1, 2048);
  integer(frameHeight, "frameHeight", 1, 2048);
  integer(frameCount, "frameCount", 1, MAX_FRAMES);
  integer(legacyUniqueFrames, "legacyUniqueFrames", 0, frameCount);
  function layout(count: number) {
    let best: { columns: number; rows: number; score: number } | undefined;
    for (
      let columns = 1;
      columns <= Math.min(count, Math.floor(8192 / frameWidth));
      columns++
    ) {
      const rows = Math.ceil(count / columns),
        w = columns * frameWidth,
        h = rows * frameHeight;
      if (h > 8192 || w * h > MAX_ATLAS_PIXELS) continue;
      const score = columns * rows + Math.abs(Math.log(w / h)) * 0.1;
      if (!best || score < best.score) best = { columns, rows, score };
    }
    return best;
  }
  const pages: SourceAtlasPage[] = [];
  let start = 0;
  while (start < frameCount) {
    let count = frameCount - start;
    let best = layout(count);
    // Keep the old four-action atlas byte-for-byte when a new jump exceeds its
    // page capacity. Extra source pixels get a page, never resampling or dropping.
    if (
      !best &&
      start === 0 &&
      legacyUniqueFrames &&
      layout(legacyUniqueFrames)
    ) {
      count = legacyUniqueFrames;
      best = layout(count);
    }
    while (!best && count > 1) best = layout(--count);
    if (!best) fail("Source frame cannot fit a bounded native atlas page.");
    pages.push({
      start,
      count,
      columns: best.columns,
      rows: best.rows,
      width: best.columns * frameWidth,
      height: best.rows * frameHeight,
    });
    start += count;
  }
  if (
    pages.length > 4 ||
    pages.reduce((n, page) => n + page.width * page.height, 0) >
      128 * 1024 * 1024
  )
    fail(
      "Source character exceeds the four-page, 128-megapixel decoded budget; split the source rather than silently degrading artwork.",
    );
  return pages;
}

/** Bounded native pages, one temporary frame. No character-specific rendering,
 * resizing, alpha thresholding, invented expressions or skeletal conversion. */
export async function convertSourceCharacter(
  bundle: BakedSourceBundle,
  id: string,
): Promise<ConvertedSourceCharacter> {
  const character = bundle.characters.find((c) => c.id === id);
  if (!character)
    fail(`Character ${JSON.stringify(id)} is unavailable in this source.`);
  const unique: SourceFrame[] = [],
    ids = new Map<string, number>();
  const clips = {} as CharacterPackV2Manifest["animations"];
  let sequenceFrames = 0;
  let legacyUniqueFrames = 0;
  const availableActions = supportedSourceActions.filter(
    (action) => character.actions[action] !== undefined,
  );
  for (const action of availableActions) {
    if (action === "jump") legacyUniqueFrames = unique.length;
    const clip = character.actions[action]!;
    const refs: number[] = [];
    for (const frame of clip.frames) {
      let ref = ids.get(frame.pixelHash);
      if (ref === undefined) {
        ref = unique.length;
        ids.set(frame.pixelHash, ref);
        unique.push(frame);
      }
      refs.push(ref);
      sequenceFrames++;
    }
    clips[action] = { frames: refs, fps: clip.fps, loop: clip.loop };
  }
  const pages = planSourceAtlasPages(
    bundle.width,
    bundle.height,
    unique.length,
    legacyUniqueFrames,
  );
  const multipage = pages.length > 1;
  const { width, height } = pages[0];
  let partialAlphaPixels = 0;
  const derivation: BakedCharacterRecipe["derivation"]["frames"] = [];
  const frameRects: Array<{
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    page?: number;
  }> = [];
  const pngs: Blob[] = [];
  for (const [pageIndex, page] of pages.entries()) {
    const pixels = new Uint8Array(page.width * page.height * 4);
    let colorChunks: Uint8Array[] = [];
    for (let cell = 0; cell < page.count; cell++) {
      const index = page.start + cell;
      const frame = unique[index],
        image = decodeSourceRgbaPng(frame.png, {
          width: bundle.width,
          height: bundle.height,
        }),
        x = (cell % page.columns) * bundle.width,
        y = Math.floor(cell / page.columns) * bundle.height;
      for (let row = 0; row < bundle.height; row++)
        pixels.set(
          image.pixels.subarray(
            row * bundle.width * 4,
            (row + 1) * bundle.width * 4,
          ),
          ((y + row) * page.width + x) * 4,
        );
      colorChunks = image.colorChunks;
      partialAlphaPixels += frame.partialAlphaPixels;
      derivation.push({
        frameId: index,
        sourceFrame: frame.sourceFrame,
        timeSeconds: frame.timeSeconds,
      });
      frameRects.push({
        id: index,
        x,
        y,
        width: bundle.width,
        height: bundle.height,
        ...(multipage ? { page: pageIndex } : {}),
      });
      // Yield between complete frames so import progress does not monopolize UI.
      if (cell % 8 === 7)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    pngs.push(
      new Blob(
        [
          new Uint8Array(
            await encodeAtlasPng({
              width: page.width,
              height: page.height,
              pixels,
              colorChunks,
            }),
          ),
        ],
        { type: "image/png" },
      ),
    );
  }
  function sheet(page: (typeof pages)[number], index: number) {
    return {
      file: index === 0 ? "spritesheet.png" : `spritesheet-${index}.png`,
      width: page.width,
      height: page.height,
      frameWidth: bundle.width,
      frameHeight: bundle.height,
      columns: page.columns,
      rows: page.rows,
    };
  }
  const name = character.name;
  const manifest = validatePortableManifest({
    schemaVersion: multipage ? 3 : 2,
    format: "gathria-character-pack",
    name,
    generator: "gathria-unified-source-adapter-v1",
    capabilities: { renderMode: "baked", editableAppearance: false },
    spritesheet: sheet(pages[0], 0),
    ...(multipage
      ? {
          additionalSheets: pages.slice(1).map((page, i) => sheet(page, i + 1)),
        }
      : {}),
    frames: frameRects,
    animations: clips,
    facing: { native: "right", right: "none", left: "mirror-x" },
    anchor: { ...character.anchor, units: "pixels", origin: "top-left" },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    configuration: "character.json",
  }) as BakedCharacterPackManifest;
  const sourceMetadata = {
    externalFormat: bundle.manifest.format,
    externalVersion: bundle.manifest.version,
    canvas: bundle.manifest.canvas,
    ...(bundle.manifest.derivation === undefined
      ? {}
      : { sourceDerivation: bundle.manifest.derivation }),
    character: character.metadata,
    actions: Object.fromEntries(
      availableActions.map((action) => [
        action,
        {
          fps: character.actions[action]!.fps,
          ...(action === "jump" ? { loop: false } : {}),
          selectionStrategy: character.actions[action]!.selectionStrategy,
          frames: character.actions[action]!.frames.map((f) => ({
            sourceIndex: f.sourceIndex,
            sourceFrame: f.sourceFrame,
            timeSeconds: f.timeSeconds,
            image: f.path,
            atlasFrame: ids.get(f.pixelHash),
            anchors: { ground: f.ground, head: f.head },
          })),
        },
      ]),
    ),
  };
  const recipe = validateBakedCharacterRecipe(
    {
      format: "gathria-baked-character",
      schemaVersion: 1,
      name,
      characterId: character.id,
      source: {
        kind: "unified-archive",
        name: bundle.name,
        sha256: bundle.sourceSha256,
      },
      provenance:
        "User-supplied Kling source artwork. Imported through the external Gathria Unified CharacterPack 1.0.0 contract. Each native-resolution RGBA frame is packed without resampling, thresholding, recoloring or regeneration; duplicate pixels share atlas cells while frame order and FPS remain intact. Clothing, body and shoes are baked together. This is not an editable skeletal or wardrobe identity. Source action selection is a loop candidate, not final artistic acceptance." +
        (character.actions.jump
          ? " The optional jump is a forward one-shot source sequence, not a looping or synthesized pose."
          : ""),
      derivation: { method: "exact-rgba-atlas-v1", frames: derivation },
      sourceMetadata,
    },
    manifest,
  );
  return {
    manifest,
    png: pngs[0],
    additionalPngs: pngs.slice(1),
    recipe,
    stats: {
      sequenceFrames,
      uniqueFrames: unique.length,
      width,
      height,
      sourcePixelFidelity: "exact-rgba",
      partialAlphaPixels,
    },
  };
}
