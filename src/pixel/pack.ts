import { strToU8, unzipSync, zipSync } from "fflate";
import { encodeSourceRgbaPngAsync, type RgbaPng } from "../core/baked-source";
import {
  createBakedCharacterPack,
  readPortableCharacterPackArchive,
  validateBakedCharacterRecipe,
  validatePortableManifest,
  type PortableCharacterPackArchive,
} from "../core/pack";
import {
  prepareSourceArchive,
  prepareSourcePng,
} from "../core/source-preparation";
import { sha256 } from "../core/sha256";
import { BAKED_MAX_ARCHIVE_BYTES } from "../core/pack-v2";
import type {
  BakedCharacterRecipe,
  CharacterPackV4Manifest,
  JsonValue,
  SpriteFrame,
} from "../core/types";
import {
  buildSharedPixelPalette,
  cleanupPixelClusters,
  CLUSTER_FINISH_VERSION,
  createPixelPaletteMapper,
  downsamplePixelFrame,
  validatePixelSettings,
  type PixelGeometry,
  type PixelRgb,
  type PixelSettings,
} from "./refine";

export const PIXEL_ALGORITHM_VERSION = "gathria-kling-pixel-refinement-v1";
export const STRONG_PIXEL_ALGORITHM_VERSION =
  "gathria-kling-pixel-refinement-v2";
type PixelAlgorithmVersion =
  | typeof PIXEL_ALGORITHM_VERSION
  | typeof STRONG_PIXEL_ALGORITHM_VERSION;
export const PIXEL_MAX_OUTPUT_PIXELS = 12 * 1024 * 1024;
const PAGE_DIMENSION = 4096;
const MAX_SOURCE_FRAME_PIXELS = 4 * 1024 * 1024;
// DOS ZIP timestamps contain local calendar fields rather than a timezone.
// Construct local midnight so a browser west of UTC cannot produce year 1979.
const FIXED_ZIP_DATE = new Date(1980, 0, 1, 0, 0, 0);

export interface PixelMapping extends PixelGeometry {
  sourceWidth: number;
  sourceHeight: number;
  sourceAnchor: { x: number; y: number };
}

export interface PixelBuildProgress {
  stage: "source" | "sampling" | "palette" | "quantizing" | "packing";
  completed: number;
  total: number;
}

export interface PixelBuildOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PixelBuildProgress) => void;
}

export interface PixelBuildReport {
  format: "gathria-pixel-refinement-report";
  version: 1;
  algorithmVersion: PixelAlgorithmVersion;
  settings: PixelSettings;
  sourceSha256: string;
  outputSha256: string;
  sourceFrameCount: number;
  mapping: PixelMapping;
  palette: PixelRgb[];
  paletteSha256: string;
  pages: Array<{ file: string; sha256: string }>;
  /** Present only for the opt-in V2 cluster finish. Legacy reports stay exact. */
  cleanup?: {
    algorithmVersion: typeof CLUSTER_FINISH_VERSION;
    passes: 1;
    changedPixels: number;
  };
  preserved: {
    frameIds: true;
    sourceFrameMapping: true;
    actionTiming: true;
    sourceMotionMetadata: true;
  };
  limitations: string[];
}

export interface PixelCandidate {
  archive: PortableCharacterPackArchive;
  bytes: Uint8Array;
  report: PixelBuildReport;
}

function active(options: PixelBuildOptions): void {
  if (options.signal?.aborted)
    throw new DOMException("Pixel refinement canceled.", "AbortError");
}

async function checkpoint(options: PixelBuildOptions): Promise<void> {
  active(options);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  active(options);
}

function progress(
  options: PixelBuildOptions,
  stage: PixelBuildProgress["stage"],
  completed: number,
  total: number,
): void {
  active(options);
  options.onProgress?.({ stage, completed, total });
  active(options);
}

/** One integer grid for the entire bank. Padding aligns the existing anchor;
 * it does not fit a pose, move a limb, or register a head independently. */
export function pixelMapping(
  width: number,
  height: number,
  anchor: { x: number; y: number },
  factor: PixelSettings["factor"],
): PixelMapping {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_SOURCE_FRAME_PIXELS ||
    !Number.isSafeInteger(anchor.x) ||
    !Number.isSafeInteger(anchor.y) ||
    anchor.x < 0 ||
    anchor.y < 0 ||
    anchor.x > width ||
    anchor.y > height ||
    ![4, 6, 8].includes(factor)
  )
    throw Error(
      "Pixel refinement needs a bounded source frame and integer source anchor; fractional anchors are not rounded.",
    );
  const left = (factor - (anchor.x % factor)) % factor;
  const top = (factor - (anchor.y % factor)) % factor;
  const right = (factor - ((width + left) % factor)) % factor;
  const bottom = (factor - ((height + top) % factor)) % factor;
  return {
    factor,
    sourceWidth: width,
    sourceHeight: height,
    sourceAnchor: { x: anchor.x, y: anchor.y },
    padding: { left, top, right, bottom },
    width: (width + left + right) / factor,
    height: (height + top + bottom) / factor,
    anchor: { x: (anchor.x + left) / factor, y: (anchor.y + top) / factor },
  };
}

function sameChunks(a: Uint8Array[], b: Uint8Array[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (chunk, index) =>
        chunk.length === b[index].length &&
        chunk.every((byte, at) => byte === b[index][at]),
    )
  );
}

function extract(image: RgbaPng, frame: SpriteFrame): RgbaPng {
  const pixels = new Uint8Array(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++) {
    const start = ((frame.y + y) * image.width + frame.x) * 4;
    pixels.set(
      image.pixels.subarray(start, start + frame.width * 4),
      y * frame.width * 4,
    );
  }
  return {
    width: frame.width,
    height: frame.height,
    pixels,
    colorChunks: image.colorChunks,
  };
}

function targetManifest(
  source: PortableCharacterPackArchive,
  mapping: PixelMapping,
  algorithmVersion: PixelAlgorithmVersion,
): CharacterPackV4Manifest {
  const count = source.manifest.frames.length;
  const columns = Math.min(
    16,
    count,
    Math.floor(PAGE_DIMENSION / mapping.width),
  );
  const rowsPerPage = Math.floor(PAGE_DIMENSION / mapping.height);
  if (columns < 1 || rowsPerPage < 1)
    throw Error("Pixel candidate exceeds the local atlas dimensions.");
  const capacity = columns * rowsPerPage;
  const pageCount = Math.ceil(count / capacity);
  if (pageCount > 4)
    throw Error("Pixel candidate requires more than four atlas pages.");
  const sheets = Array.from({ length: pageCount }, (_, page) => {
    const frames = Math.min(capacity, count - page * capacity);
    const usedColumns = Math.min(columns, frames);
    const rows = Math.ceil(frames / usedColumns);
    return {
      file: page === 0 ? "spritesheet.png" : `spritesheet-${page}.png`,
      width: usedColumns * mapping.width,
      height: rows * mapping.height,
      frameWidth: mapping.width,
      frameHeight: mapping.height,
      columns: usedColumns,
      rows,
    };
  });
  if (
    sheets.reduce((n, sheet) => n + sheet.width * sheet.height, 0) >
    PIXEL_MAX_OUTPUT_PIXELS
  )
    throw Error("Pixel candidate atlas exceeds the 12-Mi-pixel local budget.");
  return validatePortableManifest({
    ...structuredClone(source.manifest),
    schemaVersion: 4,
    name: `${source.manifest.name.slice(0, 60)} · pixel candidate`,
    generator: algorithmVersion,
    spritesheet: sheets[0],
    additionalSheets: sheets.slice(1),
    frames: source.manifest.frames.map((frame, index) => {
      const page = Math.floor(index / capacity);
      const position = index % capacity;
      return {
        id: frame.id,
        page,
        x: (position % sheets[page].columns) * mapping.width,
        y: Math.floor(position / sheets[page].columns) * mapping.height,
        width: mapping.width,
        height: mapping.height,
      };
    }),
    anchor: { ...source.manifest.anchor, ...mapping.anchor },
    scale: { pixelArt: true, integerOnly: true, recommended: 2 },
  }) as CharacterPackV4Manifest;
}

const LIMITATIONS = [
  "Algorithmic color/grid conversion of the composed source; not newly drawn pixel art.",
  "Source motion blur, garment joins and anatomy variations remain in the input.",
  "No temporal interpolation, per-frame registration, dithering or generated poses.",
  "Binary alpha and finite palette deliberately change edge pixels and colors; judge native PNG and complete motion visually.",
];

/** Convert a complete, already composed smooth pack. The original archive is
 * immutable; the result is an independent V4 candidate with exact source clocks. */
export async function buildPixelCandidate(
  sourceBytes: Uint8Array,
  requestedSettings: PixelSettings,
  options: PixelBuildOptions = {},
): Promise<PixelCandidate> {
  active(options);
  const settings = validatePixelSettings(requestedSettings);
  const algorithmVersion =
    settings.finish === "cluster"
      ? STRONG_PIXEL_ALGORITHM_VERSION
      : PIXEL_ALGORITHM_VERSION;
  if (
    !(sourceBytes instanceof Uint8Array) ||
    sourceBytes.length > BAKED_MAX_ARCHIVE_BYTES
  )
    throw Error("Choose a complete CharacterPack of at most 64 MiB.");
  const snapshot = new Uint8Array(sourceBytes);
  progress(options, "source", 0, 1);
  const source = await prepareSourceArchive(snapshot, options);
  active(options);
  if (source.manifest.schemaVersion === 4)
    throw Error(
      "Choose an original smooth CharacterPack; an existing pixel pack cannot be refined a second time.",
    );
  const mapping = pixelMapping(
    source.manifest.spritesheet.frameWidth,
    source.manifest.spritesheet.frameHeight,
    source.manifest.anchor,
    settings.factor,
  );
  if (
    mapping.width * mapping.height * source.manifest.frames.length >
    PIXEL_MAX_OUTPUT_PIXELS
  )
    throw Error("Pixel candidate frames exceed the 12-Mi-pixel local budget.");
  const manifest = targetManifest(source, mapping, algorithmVersion);
  const sourceSha256 = await sha256(snapshot);
  progress(options, "source", 1, 1);
  const images = new Map<number, RgbaPng>();
  let colorChunks: Uint8Array[] | undefined;
  const sourceSheets = [
    source.manifest.spritesheet,
    ...(source.manifest.schemaVersion === 3
      ? source.manifest.additionalSheets
      : []),
  ];
  const total = source.manifest.frames.length;
  let completed = 0;
  progress(options, "sampling", 0, total);
  for (const [page, sheet] of sourceSheets.entries()) {
    await checkpoint(options);
    const png = page === 0 ? source.png : source.additionalPngs![page - 1];
    // A page goes out of scope before the next decode. The bank retains only
    // small sampled frames, never all full-resolution decoded source pages.
    const decoded = await prepareSourcePng(png, sheet, options);
    if (colorChunks && !sameChunks(colorChunks, decoded.colorChunks))
      throw Error(
        "Source pages use different color interpretation chunks; pixel refinement requires a consistent source bank.",
      );
    colorChunks ??= decoded.colorChunks.map((chunk) => new Uint8Array(chunk));
    for (const frame of source.manifest.frames) {
      if ((frame.page ?? 0) !== page) continue;
      await checkpoint(options);
      images.set(
        frame.id,
        downsamplePixelFrame(
          extract(decoded, frame),
          mapping,
          settings.sampling,
        ),
      );
      progress(options, "sampling", ++completed, total);
    }
  }
  await checkpoint(options);
  progress(options, "palette", 0, 1);
  const palette = buildSharedPixelPalette(
    [...images.values()],
    settings.colors,
  );
  const paletteSha256 = await sha256(strToU8(JSON.stringify(palette)));
  progress(options, "palette", 1, 1);
  const mapPalette = createPixelPaletteMapper(palette);
  const cleanup: PixelBuildReport["cleanup"] =
    settings.finish === "cluster"
      ? {
          algorithmVersion: CLUSTER_FINISH_VERSION,
          passes: 1,
          changedPixels: 0,
        }
      : undefined;
  progress(options, "quantizing", 0, total);
  for (const [index, frame] of source.manifest.frames.entries()) {
    await checkpoint(options);
    const quantized = mapPalette(images.get(frame.id)!);
    if (cleanup) {
      const finished = cleanupPixelClusters(quantized, palette);
      for (let at = 0; at < quantized.pixels.length; at += 4) {
        if (
          quantized.pixels[at] !== finished.pixels[at] ||
          quantized.pixels[at + 1] !== finished.pixels[at + 1] ||
          quantized.pixels[at + 2] !== finished.pixels[at + 2]
        )
          cleanup.changedPixels++;
      }
      images.set(frame.id, finished);
    } else images.set(frame.id, quantized);
    progress(options, "quantizing", index + 1, total);
  }
  const metadata = {
    format: "gathria-pixel-refinement",
    version: 1,
    algorithmVersion,
    settings,
    sourcePackSha256: sourceSha256,
    sourceReference: structuredClone(source.config.source),
    sourceGenerator: source.manifest.generator,
    mapping,
    palette,
    paletteSha256,
    actionTimingUnchanged: true,
    sourceFrameMappingUnchanged: true,
    noGeneratedPoses: true,
    ...(cleanup ? { cleanup } : {}),
  };
  const note = `Algorithmic pixel candidate (${algorithmVersion}). The fully composed source CharacterPack ${sourceSha256} is sampled on one fixed ${settings.factor}:1 grid with explicit transparent padding and a shared ${palette.length}-color palette. No image-generation service, pose redrawing, per-frame scaling/centering or interpolation is used. The source frame IDs, derivation, action frame order, holds, FPS, loop flags and motion-flow metadata are retained. This is a lossy pixel derivative, not the untouched source video or editable wardrobe layers. Settings and exact grid mapping are in sourceMetadata.pixelRefinement.${cleanup ? ` Cluster finish (${cleanup.algorithmVersion}) performs one simultaneous palette-constrained pass over small low-contrast interior color islands; it changes ${cleanup.changedPixels} pixels while retaining alpha and the fixed grid. It does not stabilize anatomy or blend animation frames.` : ""}`;
  const config: BakedCharacterRecipe = validateBakedCharacterRecipe(
    {
      ...structuredClone(source.config),
      name: manifest.name,
      source: {
        kind: "unified-archive",
        name: "composed-source.character.zip",
        sha256: sourceSha256,
      },
      provenance: `${source.config.provenance}\n\n${note}`,
      derivation: {
        ...structuredClone(source.config.derivation),
        method: `${source.config.derivation.method}\n\n${note}`,
      },
      sourceMetadata: {
        ...structuredClone(source.config.sourceMetadata ?? {}),
        pixelRefinement: JSON.parse(JSON.stringify(metadata)) as JsonValue,
      },
    },
    manifest,
  );
  const sheets = [manifest.spritesheet, ...manifest.additionalSheets];
  const pngs: Uint8Array[] = [];
  const pages: PixelBuildReport["pages"] = [];
  progress(options, "packing", 0, sheets.length + 1);
  for (const [page, sheet] of sheets.entries()) {
    await checkpoint(options);
    const pixels = new Uint8Array(sheet.width * sheet.height * 4);
    for (const frame of manifest.frames) {
      if (frame.page !== page) continue;
      const image = images.get(frame.id)!;
      for (let y = 0; y < frame.height; y++) {
        pixels.set(
          image.pixels.subarray(y * frame.width * 4, (y + 1) * frame.width * 4),
          ((frame.y + y) * sheet.width + frame.x) * 4,
        );
      }
      images.delete(frame.id);
    }
    const png = await encodeSourceRgbaPngAsync({
      width: sheet.width,
      height: sheet.height,
      pixels,
      colorChunks: colorChunks ?? [],
    });
    pngs.push(png);
    pages.push({ file: sheet.file, sha256: await sha256(png) });
    progress(options, "packing", page + 1, sheets.length + 1);
  }
  await checkpoint(options);
  const packed = new Uint8Array(
    await (
      await createBakedCharacterPack(
        config,
        manifest,
        new Blob([pngs[0]]),
        pngs.slice(1).map((png) => new Blob([png])),
      )
    ).arrayBuffer(),
  );
  active(options);
  // ZIP timestamps are normally the current wall clock. A fixed date makes the
  // candidate reproducible byte-for-byte from identical input bytes/settings.
  const files = unzipSync(packed);
  const entries = Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [
      name,
      [
        bytes,
        { level: name.endsWith(".png") ? 0 : 6, mtime: FIXED_ZIP_DATE },
      ] as [Uint8Array, { level: 0 | 6; mtime: Date }],
    ]),
  );
  const bytes = zipSync(entries, { mtime: FIXED_ZIP_DATE });
  const outputSha256 = await sha256(bytes);
  const archive = readPortableCharacterPackArchive(bytes);
  progress(options, "packing", sheets.length + 1, sheets.length + 1);
  return {
    archive,
    bytes,
    report: {
      format: "gathria-pixel-refinement-report",
      version: 1,
      algorithmVersion,
      settings,
      sourceSha256,
      outputSha256,
      sourceFrameCount: total,
      mapping,
      palette: palette.map((color) => [...color] as PixelRgb),
      paletteSha256,
      pages,
      ...(cleanup ? { cleanup } : {}),
      preserved: {
        frameIds: true,
        sourceFrameMapping: true,
        actionTiming: true,
        sourceMotionMetadata: true,
      },
      limitations: [
        ...LIMITATIONS,
        ...(cleanup
          ? [
              "Cluster cleanup is spatial and conservative; it preserves alpha and existing palette colors but does not repair source anatomy or guarantee temporal stability.",
            ]
          : []),
      ],
    },
  };
}
