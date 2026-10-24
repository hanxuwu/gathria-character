import { Inflate, zipSync, strToU8 } from "fflate";
import { BAKED_MAX_PAGES, validateMultipageBakedManifest } from "./pack-v3";
import { validateAuthoredPixelManifest } from "./pack-v4";
import {
  BAKED_MAX_ARCHIVE_BYTES,
  validateBakedCharacterRecipe,
  validateBakedManifest,
} from "./pack-v2";
import type {
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
  CharacterPackV3Manifest,
  CharacterPackV4Manifest,
  BakedCharacterPackManifest,
  PortableCharacterPackManifest,
} from "./types";
export { validateBakedCharacterRecipe, validateBakedManifest } from "./pack-v2";
export { validateMultipageBakedManifest } from "./pack-v3";
export { validateAuthoredPixelManifest } from "./pack-v4";

export type LoadedCharacterImage = HTMLImageElement | ImageBitmap;

export interface LoadedCharacterPack<
  Manifest extends
    PortableCharacterPackManifest = PortableCharacterPackManifest,
  Config extends BakedCharacterRecipe = BakedCharacterRecipe,
> {
  manifest: Manifest;
  image: LoadedCharacterImage;
  /** V3/V4 pages, including image as page zero. */
  images?: LoadedCharacterImage[];
  config?: Config;
}

/** Pack previews may share pages; callers must retain every active owner's images. */
export function characterPackImages(
  pack: Pick<LoadedCharacterPack, "image" | "images">,
): LoadedCharacterImage[] {
  return [...new Set([pack.image, ...(pack.images ?? [])])];
}

export function releaseCharacterImages(
  images: Iterable<LoadedCharacterImage>,
): void {
  for (const image of new Set(images)) {
    if ("close" in image) image.close();
  }
}

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

type PngDimensions = { spritesheet: { width: number; height: number } };

function checkPngHeader(bytes: Uint8Array, manifest: PngDimensions): void {
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
function inspectArchive(
  bytes: Uint8Array,
  maxBytes = BAKED_MAX_ARCHIVE_BYTES,
  allowMultipage = false,
): ZipEntry[] {
  if (bytes.length < 22 || bytes.length > maxBytes)
    fail(
      `CharacterPack ZIP must be nonempty and at most ${maxBytes / (1024 * 1024)} MiB.`,
    );
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
  if (
    count !== view.getUint16(end + 8, true) ||
    count > REQUIRED_FILES.length + (allowMultipage ? BAKED_MAX_PAGES - 1 : 0)
  )
    fail(
      allowMultipage
        ? "A multipage CharacterPack ZIP may contain at most eight documented files."
        : "A CharacterPack ZIP may contain only the five documented files.",
    );
  const directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (offset + directorySize !== end)
    fail("Invalid ZIP directory bounds; ZIP64 archives are not supported.");
  const names = new Set<string>();
  const ranges: Array<[number, number]> = [];
  const entries: ZipEntry[] = [];
  let totalSize = 0;
  let totalPngSize = 0;
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
    if (
      !(REQUIRED_FILES as readonly string[]).includes(name) &&
      !(allowMultipage && /^spritesheet-[1-3]\.png$/.test(name))
    )
      fail(
        `Unexpected ZIP path ${JSON.stringify(name)}. Use only the five documented files at the archive root.`,
      );
    if (names.has(name)) fail(`ZIP contains duplicate file ${name}.`);
    names.add(name);
    if (flags & ~0x080e || ![0, 8].includes(method))
      fail(
        `${name}: encrypted or unsupported ZIP compression is not supported.`,
      );
    const isPng =
      name === "spritesheet.png" ||
      (allowMultipage && /^spritesheet-[1-3]\.png$/.test(name));
    const limit = isPng ? maxBytes : MAX_TEXT_BYTES;
    totalSize += size;
    if (size > limit || totalSize > maxBytes + 4 * MAX_TEXT_BYTES)
      fail(`${name} exceeds the CharacterPack uncompressed size limit.`);
    if (isPng) totalPngSize += size;
    if (allowMultipage && totalPngSize > maxBytes)
      fail(
        "Atlas PNG pages exceed the aggregate 64 MiB uncompressed PNG budget.",
      );
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

async function decodePng(
  bytes: Uint8Array,
  manifest: PngDimensions,
): Promise<LoadedCharacterImage> {
  checkPngHeader(bytes, manifest);
  const blob = new Blob([bytes], { type: "image/png" });
  if (typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap | undefined;
    try {
      // Own one decoded surface per page. Large HTML images may be evicted from
      // the browser's decoded-image cache between actions, delaying a page switch.
      bitmap = await createImageBitmap(blob);
    } catch {
      // Older browsers may expose the API but reject PNG decoding.
    }
    if (bitmap) {
      if (
        bitmap.width !== manifest.spritesheet.width ||
        bitmap.height !== manifest.spritesheet.height
      ) {
        bitmap.close();
        fail("Decoded PNG dimensions do not match manifest.json.");
      }
      return bitmap;
    }
  }
  const url = URL.createObjectURL(blob);
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
    // onload confirms the file, while decode prepares the decoded raster before
    // playback can reach an additional atlas page.
    if (typeof image.decode === "function") await image.decode();
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

/** Native baked contracts only; unrelated legacy generator packs are unsupported. */
export function validatePortableManifest(
  value: unknown,
): PortableCharacterPackManifest {
  const data = record(value, "Manifest");
  if (data.schemaVersion === 1)
    fail(
      "Legacy CharacterPack V1 is not supported in the Kling workspace. Open a Kling CharacterPack V2/V3 or unified source ZIP.",
    );
  if (data.schemaVersion === 2) return validateBakedManifest(value);
  if (data.schemaVersion === 3) return validateMultipageBakedManifest(value);
  if (data.schemaVersion === 4) return validateAuthoredPixelManifest(value);
  fail("Unsupported CharacterPack schemaVersion. Expected 2, 3 or 4.");
}

function readPortableZipEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const compressed = bytes.subarray(
    entry.dataStart,
    entry.dataStart + entry.compressed,
  );
  let output = compressed;
  if (entry.method !== 0) {
    output = new Uint8Array(entry.size);
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
      fail(`${entry.name} failed its ZIP size check.`);
  }
  if (output.length !== entry.size || crc32(output) !== entry.crc)
    fail(`${entry.name} failed its ZIP checksum or size check.`);
  return output;
}

/** Validate filtered RGBA rows without allocating or changing the decoded image. */
async function checkBakedScanlines(
  chunks: Uint8Array[],
  width: number,
  height: number,
  interlaced: boolean,
): Promise<void> {
  const rows: number[] = [];
  // Adam7 pass extents, or one ordinary RGBA pass.
  const passes = interlaced
    ? [
        [0, 0, 8, 8],
        [4, 0, 8, 8],
        [0, 4, 4, 8],
        [2, 0, 4, 4],
        [0, 2, 2, 4],
        [1, 0, 2, 2],
        [0, 1, 1, 2],
      ]
    : [[0, 0, 1, 1]];
  for (const [x, y, dx, dy] of passes) {
    const columns = Math.max(0, Math.ceil((width - x) / dx));
    const lines = Math.max(0, Math.ceil((height - y) / dy));
    if (columns) for (let i = 0; i < lines; i++) rows.push(1 + columns * 4);
  }
  let row = 0,
    rowOffset = 0;
  // Native strict zlib validates block lengths, Adler-32 and exact stream end.
  // Read incrementally: no full decoded-image buffer, canvas or re-encoding.
  const reader = new Blob(chunks)
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      let offset = 0;
      while (offset < chunk.length) {
        if (row >= rows.length)
          fail("PNG image data exceeds its declared pixel dimensions.");
        if (rowOffset === 0 && chunk[offset] > 4)
          fail("PNG scanline filter is invalid.");
        const count = Math.min(rows[row] - rowOffset, chunk.length - offset);
        rowOffset += count;
        offset += count;
        if (rowOffset === rows[row]) {
          row++;
          rowOffset = 0;
        }
      }
    }
    if (row !== rows.length || rowOffset !== 0)
      fail("PNG image data is incomplete.");
  } catch {
    await reader.cancel().catch(() => undefined);
    fail(
      "Baked spritesheet.png has invalid or oversized compressed PNG image data.",
    );
  }
}

/** Shared strict source-PNG preflight; does not modify or re-encode RGBA pixels. */
export { checkBakedScanlines as validateRgbaPngScanlines };

/** Pure structure/CRC preflight; async export/load additionally validate decoded rows. */
function checkBakedPng(
  bytes: Uint8Array,
  manifest: PngDimensions,
): Uint8Array[] {
  checkPngHeader(bytes, manifest);
  if (
    bytes[24] !== 8 ||
    bytes[25] !== 6 ||
    bytes[26] !== 0 ||
    bytes[27] !== 0 ||
    bytes[28] > 1
  )
    fail("Baked spritesheet.png must use native 8-bit RGBA PNG pixels.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let imageData = false;
  let dataEnded = false;
  let palette = false;
  const chunks: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    const end = offset + 12 + size;
    if (end > bytes.length)
      fail("Baked spritesheet.png contains a truncated PNG chunk.");
    const type = view.getUint32(offset + 4);
    if ([0x6163544c, 0x6663544c, 0x66644154].includes(type))
      fail(
        "Baked spritesheet.png must be a static PNG atlas; APNG is unsupported.",
      );
    if (view.getUint32(end - 4) !== crc32(bytes.subarray(offset + 4, end - 4)))
      fail("Baked spritesheet.png failed its PNG chunk checksum.");
    if (offset !== 8 && type === 0x49484452)
      fail("Baked spritesheet.png has duplicate PNG headers.");
    if (
      !(bytes[offset + 4] & 32) &&
      ![0x49484452, 0x504c5445, 0x49444154, 0x49454e44].includes(type)
    )
      fail("Baked spritesheet.png contains an unsupported critical PNG chunk.");
    if (type === 0x504c5445) {
      if (palette || imageData || !size || size > 768 || size % 3)
        fail("Baked spritesheet.png has an invalid optional PNG palette.");
      palette = true;
    }
    if (type === 0x74524e53)
      fail(
        "RGBA spritesheets must encode transparency in their alpha channel.",
      );
    if (type === 0x49444154) {
      if (dataEnded)
        fail("Baked spritesheet.png has nonconsecutive PNG image data.");
      if (size) {
        imageData = true;
        chunks.push(bytes.subarray(offset + 8, end - 4));
      }
    } else if (imageData) dataEnded = true;
    if (type === 0x49454e44) {
      if (size !== 0 || end !== bytes.length || !imageData)
        fail(
          "Baked spritesheet.png has invalid PNG image data or trailing bytes.",
        );
      return chunks;
    }
    offset = end;
  }
  fail("Baked spritesheet.png is missing its PNG end marker.");
}

async function validateBakedPngPixels(
  bytes: Uint8Array,
  manifest: PngDimensions,
): Promise<void> {
  const chunks = checkBakedPng(bytes, manifest);
  await checkBakedScanlines(
    chunks,
    manifest.spritesheet.width,
    manifest.spritesheet.height,
    bytes[28] === 1,
  );
}

export type PortableCharacterPackArchive =
  | {
      manifest: CharacterPackV2Manifest;
      config: BakedCharacterRecipe;
      png: Uint8Array;
      additionalPngs?: never;
    }
  | {
      manifest: CharacterPackV3Manifest | CharacterPackV4Manifest;
      config: BakedCharacterRecipe;
      png: Uint8Array;
      additionalPngs: Uint8Array[];
    };

export function readPortableCharacterPackArchive(
  bytes: Uint8Array,
): PortableCharacterPackArchive {
  // Inspect at most eight bounded root entries before reading the version. V2
  // is then rechecked with its strict five-file envelope.
  const entries = inspectArchive(bytes, BAKED_MAX_ARCHIVE_BYTES, true);
  const manifestEntry = entries.find(
    (entry) => entry.name === "manifest.json",
  )!;
  const manifest = validatePortableManifest(
    parseJson(readPortableZipEntry(bytes, manifestEntry), "manifest.json"),
  );
  if (manifest.schemaVersion === 2)
    inspectArchive(bytes, BAKED_MAX_ARCHIVE_BYTES);
  const allowed = new Set<string>(REQUIRED_FILES);
  if (manifest.schemaVersion !== 2)
    for (const sheet of manifest.additionalSheets) allowed.add(sheet.file);
  for (const entry of entries)
    if (!allowed.has(entry.name))
      fail(
        `Unexpected atlas file ${entry.name}; every page must be declared in manifest.json.`,
      );
  for (const name of allowed)
    if (!entries.some((entry) => entry.name === name))
      fail(`CharacterPack is missing ${name}.`);
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries)
    files[entry.name] = readPortableZipEntry(bytes, entry);
  const config = validateBakedCharacterRecipe(
    parseJson(files["character.json"], "character.json"),
    manifest,
  );
  if (manifest.schemaVersion === 4 && config.source.kind !== "unified-archive")
    fail(
      "V4 authored pixel artwork must declare a unified-archive recipe; it is not original video extraction.",
    );
  const png = files["spritesheet.png"];
  checkBakedPng(png, manifest);
  if (manifest.schemaVersion !== 2) {
    const additionalPngs = manifest.additionalSheets.map((sheet) => {
      const bytes = files[sheet.file];
      checkBakedPng(bytes, { spritesheet: sheet });
      return bytes;
    });
    return { manifest, config, png, additionalPngs };
  }
  return { manifest, config, png };
}

export async function loadPortableCharacterPack(
  file: Blob,
): Promise<LoadedCharacterPack> {
  if (file.size > BAKED_MAX_ARCHIVE_BYTES)
    fail("CharacterPack ZIP must be at most 64 MiB.");
  const archive = readPortableCharacterPackArchive(
    new Uint8Array(await file.arrayBuffer()),
  );
  const { manifest, config, png } = archive;
  if (manifest.schemaVersion !== 2) {
    const sheets = [manifest.spritesheet, ...manifest.additionalSheets];
    const pages = [png, ...archive.additionalPngs!];
    // Validate every page before the browser allocates decoded image surfaces.
    for (const [i, bytes] of pages.entries())
      await validateBakedPngPixels(bytes, { spritesheet: sheets[i] });
    const images: LoadedCharacterImage[] = [];
    try {
      for (const [i, bytes] of pages.entries())
        images.push(await decodePng(bytes, { spritesheet: sheets[i] }));
    } catch (cause) {
      releaseCharacterImages(images);
      throw cause;
    }
    return { manifest, config, image: images[0], images };
  }
  if (manifest.schemaVersion === 2) await validateBakedPngPixels(png, manifest);
  return { manifest, config, image: await decodePng(png, manifest) };
}

export async function loadPortableCharacterFiles(
  png: Blob,
  metadata: unknown,
  config?: unknown,
): Promise<LoadedCharacterPack> {
  const manifest = validatePortableManifest(metadata);
  if (manifest.schemaVersion === 3)
    fail(
      "Multipage CharacterPack V3 requires the complete ZIP; a single PNG cannot supply every atlas page.",
    );
  if (manifest.schemaVersion === 4)
    fail(
      "Authored pixel CharacterPack V4 requires the complete ZIP, including its provenance and all declared pages.",
    );
  if (png.size > BAKED_MAX_ARCHIVE_BYTES)
    fail("Baked spritesheet.png must be at most 64 MiB.");
  const parsedConfig =
    config === undefined
      ? undefined
      : validateBakedCharacterRecipe(config, manifest);
  const bytes = new Uint8Array(await png.arrayBuffer());
  await validateBakedPngPixels(bytes, manifest);
  return {
    manifest,
    config: parsedConfig,
    image: await decodePng(bytes, manifest),
  };
}

/** Package the existing PNG bytes without resizing, quantizing, repainting or re-encoding. */
export async function createBakedCharacterPack(
  recipe: BakedCharacterRecipe,
  metadata: BakedCharacterPackManifest,
  png: Blob,
  additionalPngs: Blob[] = [],
): Promise<Blob> {
  if (metadata.schemaVersion === 4)
    return createAuthoredPixelCharacterPack(
      recipe,
      metadata,
      png,
      additionalPngs,
    );
  if (metadata.schemaVersion === 3)
    return createMultipageBakedCharacterPack(
      recipe,
      metadata,
      png,
      additionalPngs,
    );
  if (additionalPngs.length)
    fail("V2 CharacterPack must contain only its primary PNG.");
  const manifest = validateBakedManifest(metadata);
  const validatedRecipe = validateBakedCharacterRecipe(recipe, manifest);
  if (png.size > BAKED_MAX_ARCHIVE_BYTES)
    fail("Baked spritesheet.png must be at most 64 MiB.");
  const pixels = new Uint8Array(await png.arrayBuffer());
  await validateBakedPngPixels(pixels, manifest);
  const provenance = `Baked source character: ${validatedRecipe.name}\n\n${validatedRecipe.provenance}\n\nSource kind: ${validatedRecipe.source.kind}\nSource file: ${validatedRecipe.source.name}\nSHA256: ${validatedRecipe.source.sha256}\n\nDerivation: ${validatedRecipe.derivation.method}\n\ncharacter.json records source frame indices and times. This export retains the supplied RGBA spritesheet PNG bytes. It does not promise skeletal layers, editable clothing, generated poses, or runtime AI.\n`;
  const integration = `# CharacterPack V2: baked source playback\n\nLoad manifest.json and spritesheet.png; read character.json as a gathria-baked-character recipe, not a legacy character appearance configuration.\n\nRender each referenced frame rectangle at its native aspect ratio. The PNG is 8-bit RGBA with smooth alpha. Honor scale.pixelArt=false and scale.integerOnly=false; use smooth image sampling for a fractional display scale. The recommended scale is only a viewing preference, never a change to exported source pixels.\n\nUse each animation's frame IDs in their listed order at its declared FPS. Repeated IDs are deliberate holds. Honor loop; a non-looping action stops on its final frame. celebrate and jump are distinct actions. Disable unavailable actions rather than inventing substitutes.\n\nThe native view is right; left is a horizontal mirror. Apply the declared frame-relative anchor consistently. These source clips contain their authored in-frame motion; do not normalize individual poses or add world displacement unless your scene explicitly requests it.\n\nThis pack supports baked playback only (editableAppearance=false). It does not contain a reusable skeleton, wardrobe layers, or a claim that missing/occluded source detail was reconstructed. Source provenance and selection are in character.json and PROVENANCE.txt. Runtime playback requires neither the editor nor a model API.\n\nLimits: 8192 pixels per sheet dimension, 64 Mi pixels decoded, at most 1024 unique frames, 64 MiB ZIP/PNG and 256 KiB per text file.\n`;
  const files = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "character.json": strToU8(JSON.stringify(validatedRecipe, null, 2)),
    "PROVENANCE.txt": strToU8(provenance),
    "INTEGRATION.md": strToU8(integration),
  };
  for (const [name, bytes] of Object.entries(files))
    if (bytes.length > MAX_TEXT_BYTES)
      fail(`${name} exceeds the 256 KiB text limit.`);
  const bytes = zipSync(
    { "spritesheet.png": [pixels, { level: 0 }], ...files },
    { level: 6 },
  );
  if (bytes.length > BAKED_MAX_ARCHIVE_BYTES)
    fail("Generated baked CharacterPack exceeds the 64 MiB archive limit.");
  return new Blob([bytes], { type: "application/zip" });
}

async function createMultipageBakedCharacterPack(
  recipe: BakedCharacterRecipe,
  metadata: CharacterPackV3Manifest,
  png: Blob,
  additionalPngs: Blob[],
): Promise<Blob> {
  const manifest = validateMultipageBakedManifest(metadata);
  const validatedRecipe = validateBakedCharacterRecipe(recipe, manifest);
  if (additionalPngs.length !== manifest.additionalSheets.length)
    fail("V3 export requires exactly one PNG per declared atlas page.");
  const sheets = [manifest.spritesheet, ...manifest.additionalSheets];
  const blobs = [png, ...additionalPngs];
  if (blobs.reduce((sum, blob) => sum + blob.size, 0) > BAKED_MAX_ARCHIVE_BYTES)
    fail("V3 PNG pages exceed the aggregate 64 MiB archive budget.");
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  for (const [i, blob] of blobs.entries()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await validateBakedPngPixels(bytes, { spritesheet: sheets[i] });
    files[sheets[i].file] = [bytes, { level: 0 }];
  }
  const text = {
    "manifest.json": JSON.stringify(manifest, null, 2),
    "character.json": JSON.stringify(validatedRecipe, null, 2),
    "PROVENANCE.txt": `Baked source character: ${validatedRecipe.name}\n\n${validatedRecipe.provenance}\n\nSource kind: ${validatedRecipe.source.kind}\nSource file: ${validatedRecipe.source.name}\nSHA256: ${validatedRecipe.source.sha256}\nDerivation: ${validatedRecipe.derivation.method}\nAll PNG bytes are retained unchanged. No runtime AI, skeletal reconstruction or generated frames.\n`,
    "INTEGRATION.md": `# CharacterPack V3: multipage original artwork\n\nLoad manifest.json, character.json and every declared PNG. Page 0 is spritesheet; pages 1 onward are additionalSheets in order. Each frame has an explicit page index and an unscaled rectangle within that page. All pages share native frame dimensions and the frame-relative anchor. Do not combine pages into an oversized image or resize artwork.\n\nPlay each animation's frame IDs in order at its declared FPS. Respect loop: a one-shot jump holds its last frame and can be explicitly replayed. Jump and celebrate remain distinct. Missing actions are unavailable. Render right natively and left with mirror-x around the anchor. Fractional display zoom uses smooth sampling; exported pixels stay native.\n\nThis baked recipe is not editable wardrobe or skeletal data. Provenance and source frame/timing maps are in character.json. The complete ZIP supports independent playback. A single PNG with metadata cannot represent V3. Consumers that only support V2 must reject schemaVersion 3 explicitly.\n\nLimits: 2–4 PNG pages, each at most 8192 pixels per dimension and 64 Mi pixels decoded; at most 128 Mi decoded pixels across all pages, 1024 total grid cells/unique frames, 64 MiB ZIP/aggregate PNG bytes, 256 KiB per text file. The V2 limits and file envelope remain unchanged.\n`,
  };
  for (const [name, content] of Object.entries(text)) {
    const bytes = strToU8(content);
    if (bytes.length > MAX_TEXT_BYTES)
      fail(`${name} exceeds the 256 KiB text limit.`);
    files[name] = bytes;
  }
  const archive = zipSync(files, { level: 6 });
  if (archive.length > BAKED_MAX_ARCHIVE_BYTES)
    fail("Generated baked CharacterPack exceeds the 64 MiB archive limit.");
  return new Blob([archive], { type: "application/zip" });
}

async function createAuthoredPixelCharacterPack(
  recipe: BakedCharacterRecipe,
  metadata: CharacterPackV4Manifest,
  png: Blob,
  additionalPngs: Blob[],
): Promise<Blob> {
  const manifest = validateAuthoredPixelManifest(metadata);
  const validatedRecipe = validateBakedCharacterRecipe(recipe, manifest);
  if (validatedRecipe.source.kind !== "unified-archive")
    fail(
      "V4 authored pixel artwork must declare a unified-archive recipe; it is not original video extraction.",
    );
  if (additionalPngs.length !== manifest.additionalSheets.length)
    fail("V4 export requires exactly one PNG per declared atlas page.");
  const sheets = [manifest.spritesheet, ...manifest.additionalSheets];
  const blobs = [png, ...additionalPngs];
  if (blobs.reduce((sum, blob) => sum + blob.size, 0) > BAKED_MAX_ARCHIVE_BYTES)
    fail("V4 PNG pages exceed the aggregate 64 MiB archive budget.");
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  for (const [i, blob] of blobs.entries()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await validateBakedPngPixels(bytes, { spritesheet: sheets[i] });
    files[sheets[i].file] = [bytes, { level: 0 }];
  }
  const text = {
    "manifest.json": JSON.stringify(manifest, null, 2),
    "character.json": JSON.stringify(validatedRecipe, null, 2),
    "PROVENANCE.txt": `Authored pixel character: ${validatedRecipe.name}\n\n${validatedRecipe.provenance}\n\nSource kind: ${validatedRecipe.source.kind}\nSource file: ${validatedRecipe.source.name}\nSHA256: ${validatedRecipe.source.sha256}\nDerivation: ${validatedRecipe.derivation.method}\nAll supplied PNG bytes are retained unchanged. This export does not generate, interpolate or repaint frames at runtime.\n`,
    "INTEGRATION.md": `# CharacterPack V4: authored pixel artwork\n\nLoad manifest.json, character.json and every declared PNG. Page 0 is spritesheet; pages 1 onward are additionalSheets in order. additionalSheets may be empty. Every frame explicitly declares its page. Preserve the native rectangles, integer frame-relative anchor and aspect ratio.\n\nHonor scale.pixelArt=true and scale.integerOnly=true: use nearest-neighbor sampling at positive integer display zoom. Do not smooth, quantize, normalize individual poses or resize exported artwork. A narrow viewport may scroll rather than shrinking below native size. Legacy V2/V3 consumers must explicitly reject V4.\n\nPlay frame IDs in their listed order at their declared FPS. Holds, missing actions and one-shot boundaries are intentional. A non-looping action holds its last frame unless the caller explicitly changes action. Native view is right; mirror left around the declared anchor.\n\nThis is a baked playback pack, not editable wardrobe layers or a skeleton. Artwork generation and source references must be honestly described in character.json and PROVENANCE.txt. No editor, model API or theme library is required to play this ZIP independently.\n\nLimits: 1–4 atlas pages, 8192 pixels per dimension, 64 Mi decoded pixels per page, 128 Mi decoded pixels total, 1024 total grid cells, 64 MiB ZIP/aggregate PNG bytes and 256 KiB per text file.\n`,
  };
  for (const [name, content] of Object.entries(text)) {
    const bytes = strToU8(content);
    if (bytes.length > MAX_TEXT_BYTES)
      fail(`${name} exceeds the 256 KiB text limit.`);
    files[name] = bytes;
  }
  const archive = zipSync(files, { level: 6 });
  if (archive.length > BAKED_MAX_ARCHIVE_BYTES)
    fail(
      "Generated authored pixel CharacterPack exceeds the 64 MiB archive limit.",
    );
  return new Blob([archive], { type: "application/zip" });
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
