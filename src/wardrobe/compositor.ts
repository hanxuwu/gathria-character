import { strToU8, zipSync } from "fflate";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
  encodeSourceRgbaPngAsync,
  type RgbaPng,
} from "../core/baked-source";
import {
  readPortableCharacterPackArchive,
  validateBakedCharacterRecipe,
  validatePortableManifest,
} from "../core/pack";
import {
  appearanceIsActive,
  type AppearancePadding,
} from "../appearance/contract";
import {
  AppearanceRenderer,
  appearanceOutputManifest,
  NO_APPEARANCE_PADDING,
  padAppearanceFrame,
} from "../appearance/render";
import { BAKED_MAX_ARCHIVE_BYTES } from "../core/pack-v2";
import {
  assertSourcePreparationActive,
  prepareSourcePng,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type {
  BakedCharacterPackManifest,
  BakedCharacterRecipe,
  JsonValue,
  SpriteFrame,
} from "../core/types";
import {
  WARDROBE_COMPOSITION_ORDER,
  type RegisteredFrame,
  type WardrobeGarment,
  type WardrobeGarmentFrame,
  type WardrobeProject,
} from "./contract";
import { validateWardrobeProject } from "./project";
import {
  prepareProtection,
  protectedAt,
  reviewedRegions,
  type ProtectionRows,
} from "./protection";
import { decodedGarmentPage, type DecodedGarmentPage } from "./garment-pages";

const MAX_TEXT_BYTES = 256 * 1024;
type SelectedGarment = {
  reviewedProtection: Map<number, ProtectionRows>;
  item: WardrobeGarment;
  frames: Map<number, WardrobeGarmentFrame>;
};

// Both Kling pages stay warm across loops and clothing selections. These
// buffers are never exposed to a caller; all rendered results are fresh copies.
// A bounded shared cache avoids keeping old and new full source atlases during
// atomic selection replacement. Very large third-party packs still stay bounded.
const sourcePages = new Map<string, RgbaPng>();
const SOURCE_CACHE_PIXELS = 96 * 1024 * 1024;
function cacheSourcePage(key: string, image: RgbaPng): void {
  sourcePages.set(key, image);
  let pixels = [...sourcePages.values()].reduce(
    (sum, page) => sum + page.width * page.height,
    0,
  );
  while (sourcePages.size > 2 || pixels > SOURCE_CACHE_PIXELS) {
    const oldest = sourcePages.keys().next().value!;
    const old = sourcePages.get(oldest)!;
    sourcePages.delete(oldest);
    pixels -= old.width * old.height;
  }
}
const validAppearances = new Set<string>();

function extractFrame(page: RgbaPng, frame: SpriteFrame): RgbaPng {
  const pixels = new Uint8Array(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++) {
    const offset = ((frame.y + y) * page.width + frame.x) * 4;
    pixels.set(
      page.pixels.subarray(offset, offset + frame.width * 4),
      y * frame.width * 4,
    );
  }
  return {
    width: frame.width,
    height: frame.height,
    pixels,
    colorChunks: page.colorChunks.map((chunk) => new Uint8Array(chunk)),
  };
}

function sameColorProfile(a: Uint8Array[], b: Uint8Array[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (chunk, i) =>
        chunk.length === b[i].length &&
        chunk.every((byte, j) => byte === b[i][j]),
    )
  );
}

/** A compositor shares bounded source and garment page caches.
 * It does not retain every animation frame or mutate the source/project arrays.
 * Cache rendered frame canvases in the view if needed, rather than invoking this
 * once per display refresh when the animation's frame ID has not changed. */
class RegisteredWardrobeCompositor {
  private readonly project: WardrobeProject;
  readonly manifest: BakedCharacterPackManifest;
  readonly sourceManifest: BakedCharacterPackManifest;
  readonly padding: Readonly<AppearancePadding>;
  private readonly headAppearance?: AppearanceRenderer;
  private readonly frames: Map<number, SpriteFrame>;
  private readonly registered: Map<number, RegisteredFrame>;
  private readonly protection: Map<number, ProtectionRows>;
  private readonly selected: SelectedGarment[];
  private readonly appearanceKey: string;
  private disposed = false;

  /** Construct with the normalized result from createWardrobeCompositor. */
  constructor(project: WardrobeProject) {
    this.project = project;
    this.sourceManifest = project.archive.manifest;
    const headSelection =
      project.document.version === 2 ? project.document.appearance : undefined;
    if (appearanceIsActive(headSelection)) {
      if (!project.appearanceBank || !headSelection)
        throw Error("The selected appearance bank is unavailable.");
      this.headAppearance = new AppearanceRenderer(
        project.appearanceBank,
        headSelection,
        new Map(
          project.registration.frames.map((frame) => [
            frame.frameId,
            frame.protected,
          ]),
        ),
      );
    }
    this.padding = Object.freeze({
      ...(this.headAppearance?.padding ?? NO_APPEARANCE_PADDING),
    });
    this.manifest = this.headAppearance
      ? appearanceOutputManifest(this.sourceManifest, this.padding)
      : this.sourceManifest;
    this.frames = new Map(
      this.sourceManifest.frames.map((frame) => [frame.id, frame]),
    );
    this.registered = new Map(
      project.registration.frames.map((frame) => [frame.frameId, frame]),
    );
    this.protection = new Map(
      project.registration.frames.map((frame) => [
        frame.frameId,
        prepareProtection(frame.protected),
      ]),
    );
    const byId = new Map(project.items.map((item) => [item.manifest.id, item]));
    this.selected = WARDROBE_COMPOSITION_ORDER.flatMap((slot) => {
      const id = project.document.selection[slot];
      if (!id) return [];
      const item = byId.get(id);
      if (!item || item.manifest.slot !== slot)
        throw Error(`Selected ${slot} garment is unavailable.`);
      return [
        {
          item,
          reviewedProtection: new Map(
            [
              ...new Set(
                item.manifest.handProtectionReviews?.map((r) => r.frameId) ??
                  [],
              ),
            ].map((frameId) => [
              frameId,
              prepareProtection(
                reviewedRegions(this.registered.get(frameId)!, item.manifest),
              ),
            ]),
          ),
          frames: new Map(
            item.manifest.frames.map((frame) => [frame.frameId, frame]),
          ),
        },
      ];
    });
    this.appearanceKey = JSON.stringify([
      "wardrobe-composition-v1",
      project.document.sourceSha256,
      project.document.registrationSha256,
      this.selected.map(({ item }) => [
        item.manifest.slot,
        item.manifest.id,
        item.sha256,
      ]),
      ...(this.headAppearance ? [headSelection] : []),
    ]);
  }

  private assertOpen(): void {
    if (this.disposed) throw Error("Wardrobe compositor has been disposed.");
  }

  private source(page: number): RgbaPng {
    this.assertOpen();
    const key = `${this.project.document.sourceSha256}:${page}`;
    const cached = sourcePages.get(key);
    if (cached) {
      sourcePages.delete(key);
      sourcePages.set(key, cached);
      return cached;
    }
    const archive = this.project.archive;
    const sheet =
      page === 0
        ? this.sourceManifest.spritesheet
        : this.sourceManifest.schemaVersion === 3
          ? this.sourceManifest.additionalSheets[page - 1]
          : undefined;
    const png = page === 0 ? archive.png : archive.additionalPngs?.[page - 1];
    if (!sheet || !png)
      throw Error(`Source atlas page ${page} is unavailable.`);
    const image = decodeSourceRgbaPng(png, sheet);
    cacheSourcePage(key, image);
    return image;
  }

  private async ensureSourcePage(
    page: number,
    options: SourcePreparationOptions,
  ): Promise<void> {
    assertSourcePreparationActive(options);
    this.assertOpen();
    const key = `${this.project.document.sourceSha256}:${page}`;
    if (sourcePages.has(key)) {
      this.source(page);
      return;
    }
    const archive = this.project.archive;
    const sheet =
      page === 0
        ? this.sourceManifest.spritesheet
        : this.sourceManifest.schemaVersion === 3
          ? this.sourceManifest.additionalSheets[page - 1]
          : undefined;
    const png = page === 0 ? archive.png : archive.additionalPngs?.[page - 1];
    if (!sheet || !png)
      throw Error(`Source atlas page ${page} is unavailable.`);
    const image = await prepareSourcePng(png, sheet, options);
    assertSourcePreparationActive(options);
    this.assertOpen();
    cacheSourcePage(key, image);
  }

  private garmentPage(
    selected: SelectedGarment,
    page: number,
  ): DecodedGarmentPage {
    const key = `${selected.item.sha256}:${page}`;
    const spec = selected.item.manifest.pages[page],
      files = selected.item.pages[page];
    if (!spec || !files)
      throw Error(
        `Garment ${selected.item.manifest.id} is missing page ${page}.`,
      );
    return decodedGarmentPage(key, files.patch, files.ownership, spec);
  }

  private frame(frameId: number): SpriteFrame {
    this.assertOpen();
    const frame = this.frames.get(frameId);
    if (!frame || !this.registered.has(frameId))
      throw Error(`Source frame ${frameId} has no registered wardrobe pose.`);
    return frame;
  }

  /** A fresh lossless RGBA frame, never a shared mutable source buffer. */
  renderSourceFrame(frameId: number): RgbaPng {
    const frame = this.frame(frameId);
    const source = extractFrame(this.source(frame.page ?? 0), frame);
    return this.headAppearance
      ? padAppearanceFrame(source, this.padding)
      : source;
  }

  private apply(
    frame: SpriteFrame,
    source: RgbaPng,
    output: Uint8Array,
    outputWidth: number,
    outputX: number,
    outputY: number,
    sourceX: number,
    sourceY: number,
  ): void {
    for (const selected of this.selected) {
      const protectedRegions =
        selected.reviewedProtection.get(frame.id) ??
        this.protection.get(frame.id)!;
      const crop = selected.frames.get(frame.id);
      if (!crop)
        throw Error(
          `Garment ${selected.item.manifest.id} is missing frame ${frame.id}.`,
        );
      const { patch, ownership } = this.garmentPage(selected, crop.page);
      if (!sameColorProfile(source.colorChunks, patch.colorChunks))
        throw Error(
          `Garment ${selected.item.manifest.id} uses a different PNG color profile; normalize its authored patches to the source profile before import.`,
        );
      for (let y = 0; y < crop.rect.height; y++) {
        const fy = crop.offset.y + y;
        const rowProtection = protectedRegions.get(fy);
        let index = ((crop.rect.y + y) * patch.width + crop.rect.x) * 4;
        let outputIndex =
          ((outputY + fy) * outputWidth + outputX + crop.offset.x) * 4;
        let sourceIndex =
          ((sourceY + fy) * source.width + sourceX + crop.offset.x) * 4;
        for (
          let x = 0;
          x < crop.rect.width;
          x++, index += 4, outputIndex += 4, sourceIndex += 4
        ) {
          if (ownership[index / 4] !== 255) continue;
          const fx = crop.offset.x + x;
          if (source.pixels[sourceIndex + 3] !== 0) {
            const label = protectedAt(fx, rowProtection);
            if (label)
              throw Error(
                `Garment ${selected.item.manifest.id} overlaps protected ${label} pixels in frame ${frame.id} at ${fx},${fy}.`,
              );
          }
          // Replacement, deliberately not source-over: transparent owned pixels
          // erase the old cloth while pixels outside ownership remain byte exact.
          output[outputIndex] = patch.pixels[index];
          output[outputIndex + 1] = patch.pixels[index + 1];
          output[outputIndex + 2] = patch.pixels[index + 2];
          output[outputIndex + 3] = patch.pixels[index + 3];
        }
      }
    }
  }

  renderFrame(frameId: number): RgbaPng {
    const frame = this.frame(frameId);
    const page = this.source(frame.page ?? 0);
    const output = extractFrame(page, frame);
    this.apply(
      frame,
      page,
      output.pixels,
      output.width,
      0,
      0,
      frame.x,
      frame.y,
    );
    return this.headAppearance
      ? this.headAppearance.render(frameId, extractFrame(page, frame), output)
      : output;
  }

  /** Legacy exports keep blank cells and profiles unchanged. An explicit head
   * appearance repacks padded frames without rescaling their source pixels. */
  renderPage(page: number): RgbaPng {
    this.assertOpen();
    if (this.headAppearance) {
      const sheet =
        page === 0
          ? this.manifest.spritesheet
          : this.manifest.schemaVersion === 3
            ? this.manifest.additionalSheets[page - 1]
            : undefined;
      if (!sheet) throw Error(`Output atlas page ${page} is unavailable.`);
      const frames = this.manifest.frames.filter(
        (frame) => (frame.page ?? 0) === page,
      );
      const pixels = new Uint8Array(sheet.width * sheet.height * 4);
      let colorChunks: Uint8Array[] | undefined;
      for (const frame of frames) {
        const rendered = this.renderFrame(frame.id);
        if (colorChunks && !sameColorProfile(colorChunks, rendered.colorChunks))
          throw Error(
            "Repacked appearance frames must have one consistent PNG color profile.",
          );
        colorChunks ??= rendered.colorChunks.map(
          (chunk) => new Uint8Array(chunk),
        );
        for (let y = 0; y < frame.height; y++)
          pixels.set(
            rendered.pixels.subarray(
              y * frame.width * 4,
              (y + 1) * frame.width * 4,
            ),
            ((frame.y + y) * sheet.width + frame.x) * 4,
          );
      }
      return {
        width: sheet.width,
        height: sheet.height,
        pixels,
        colorChunks: colorChunks ?? [],
      };
    }
    const source = this.source(page);
    const output: RgbaPng = {
      ...source,
      pixels: new Uint8Array(source.pixels),
      colorChunks: source.colorChunks.map((chunk) => new Uint8Array(chunk)),
    };
    for (const frame of this.manifest.frames)
      if ((frame.page ?? 0) === page)
        this.apply(
          frame,
          source,
          output.pixels,
          output.width,
          frame.x,
          frame.y,
          frame.x,
          frame.y,
        );
    return output;
  }

  async validateAppearance(
    options: WardrobeAppearanceOptions = {},
  ): Promise<{ frames: number; cacheHit: boolean }> {
    this.assertOpen();
    const frames = this.sourceManifest.frames;
    const abort = () => {
      if (options.signal?.aborted)
        throw new DOMException("Wardrobe validation cancelled.", "AbortError");
      this.assertOpen();
    };
    abort();
    const sourcePageCount = new Set(frames.map((frame) => frame.page ?? 0))
      .size;
    const preparedPages = new Set<number>();
    options.onSourceProgress?.(0, sourcePageCount);
    const preparePage = async (page: number) => {
      await this.ensureSourcePage(page, options);
      abort();
      if (!preparedPages.has(page)) {
        preparedPages.add(page);
        options.onSourceProgress?.(preparedPages.size, sourcePageCount);
      }
    };
    if (validAppearances.has(this.appearanceKey)) {
      options.onProgress?.(0, frames.length);
      // A previously validated look may have been evicted while another
      // character was open. Warm its required pages before acceptance, not in
      // the middle of the next running or jumping loop. No pixels are changed.
      for (const page of new Set(frames.map((frame) => frame.page ?? 0))) {
        abort();
        await preparePage(page);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      for (const selected of this.selected)
        for (const page of new Set(
          [...selected.frames.values()].map((frame) => frame.page),
        )) {
          abort();
          this.garmentPage(selected, page);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      this.headAppearance?.warmPages();
      abort();
      validAppearances.delete(this.appearanceKey);
      validAppearances.add(this.appearanceKey);
      options.onProgress?.(frames.length, frames.length);
      return { frames: frames.length, cacheHit: true };
    }
    options.onProgress?.(0, frames.length);
    for (let i = 0; i < frames.length; i++) {
      abort();
      await preparePage(frames[i].page ?? 0);
      this.renderFrame(frames[i].id);
      options.onProgress?.(i + 1, frames.length);
      // Give progress, cancellation and the current preview a chance to paint.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    abort();
    validAppearances.add(this.appearanceKey);
    while (validAppearances.size > 32)
      validAppearances.delete(validAppearances.values().next().value!);
    return { frames: frames.length, cacheHit: false };
  }

  dispose(): void {
    this.disposed = true;
  }
}

export type WardrobeCompositor = RegisteredWardrobeCompositor;

export interface WardrobeAppearanceOptions {
  onProgress?: (completedFrames: number, totalFrames: number) => void;
  onSourceProgress?: (completedPages: number, totalPages: number) => void;
  signal?: AbortSignal;
}

/** Call before committing an imported project or a new clothing selection.
 * Success is cached by reverified immutable content identities, never by object
 * identity or action/facing. A later-frame failure cannot replace the live look. */
export async function validateWardrobeAppearance(
  compositor: WardrobeCompositor,
  options: WardrobeAppearanceOptions = {},
): Promise<{ frames: number; cacheHit: boolean }> {
  return compositor.validateAppearance(options);
}

export async function createWardrobeCompositor(
  project: WardrobeProject,
  options: SourcePreparationOptions = {},
): Promise<WardrobeCompositor> {
  // Import has validated every garment. At preview boundaries recheck immutable
  // byte bindings, but defer each selected page's pixel validation until use.
  const verified = await validateWardrobeProject(project, {
    ...options,
    decodeGarments: false,
  });
  assertSourcePreparationActive(options);
  return new RegisteredWardrobeCompositor(verified);
}

export async function exportWardrobeFramePng(
  project: WardrobeProject,
  frameId: number,
): Promise<Uint8Array> {
  const compositor = await createWardrobeCompositor(project);
  try {
    return encodeSourceRgbaPng(compositor.renderFrame(frameId));
  } finally {
    compositor.dispose();
  }
}

export interface WardrobeExportOptions {
  name?: string;
  onProgress?: (progress: {
    completedPages: number;
    totalPages: number;
  }) => void;
}

function exportMetadata(
  project: WardrobeProject,
  name?: string,
  outputManifest: BakedCharacterPackManifest = project.archive.manifest,
): {
  manifest: BakedCharacterPackManifest;
  config: BakedCharacterRecipe;
  selected: WardrobeGarment[];
} {
  const selected = WARDROBE_COMPOSITION_ORDER.flatMap((slot) => {
    const id = project.document.selection[slot];
    return id ? [project.items.find((item) => item.manifest.id === id)!] : [];
  });
  const exportName =
    name ?? `${project.archive.manifest.name} · wardrobe`.slice(0, 80);
  const headSelection =
    project.document.version === 2 ? project.document.appearance : undefined;
  const hasAppearance = appearanceIsActive(headSelection);
  const manifest = validatePortableManifest({
    ...structuredClone(outputManifest),
    name: exportName,
    generator: hasAppearance
      ? "gathria-kling-wardrobe-appearance-v1"
      : "gathria-kling-wardrobe-v1",
  });
  const note = hasAppearance
    ? "Wardrobe and appearance: registered garment patches replace only clothing ownership. Per-pose hair uses transparent source-over/front and destination-over/back layers; face replacement is restricted to the authored inner-face ownership and retains source alpha. Source hands remain protected according to the selected garment’s explicit hand-boundary review, when present; appearance cannot change the dressed body. Declared transparent padding translates every source pixel and the anchor by the same integer offset without scaling; atlas rectangles are repacked. Frame IDs, action order, FPS, loop flags and source-frame/time mapping are unchanged. This is baked playback, with editable assets retained separately in the wardrobe project."
    : "Wardrobe: registered per-frame garment RGBA patches replace only their declared ownership pixels. Body pixels outside garment ownership are retained exactly from the source CharacterPack. Garment silhouettes are authored derivatives, not clothing extracted from the Kling source video. Head/hand protection is checked in every composed frame; an item-scoped V2 hand-boundary review is recorded when used. Original frame rectangles, action frame order, FPS, loop flags, source-frame/time mapping and anchor are unchanged. The output is baked playback; editable wardrobe data belongs in the separate self-contained wardrobe project.";
  const wardrobeMetadata: { [key: string]: JsonValue } = {
    format: "gathria-baked-wardrobe",
    version: 1,
    sourcePackSha256: project.document.sourceSha256,
    registrationSha256: project.document.registrationSha256,
    selection: { ...project.document.selection },
    items: selected.map((item) => ({
      id: item.manifest.id,
      sha256: item.sha256,
      slot: item.manifest.slot,
      name: item.manifest.name,
      provenance: item.manifest.provenance,
      garmentVersion: item.manifest.version,
      handProtectionReviews: JSON.parse(
        JSON.stringify(item.manifest.handProtectionReviews ?? []),
      ),
    })),
    preservedOutsideOwnership: true,
    frameGeometryAndTimingUnchanged: !hasAppearance,
  };
  const appearanceMetadata: { [key: string]: JsonValue } | undefined =
    hasAppearance && project.appearanceBank
      ? {
          format: "gathria-baked-appearance",
          version: 1,
          bankSha256: project.appearanceBank.sha256,
          sourcePackSha256: project.document.sourceSha256,
          registrationSha256: project.document.registrationSha256,
          selection: { ...headSelection! },
          padding: { ...project.appearanceBank.manifest.padding },
          sourceFrameWidth: project.archive.manifest.spritesheet.frameWidth,
          sourceFrameHeight: project.archive.manifest.spritesheet.frameHeight,
          sourceAnchor: { ...project.archive.manifest.anchor },
          sourcePixelsRescaled: false,
          actionTimingUnchanged: true,
          provenance: project.appearanceBank.manifest.provenance,
        }
      : undefined;
  const config = validateBakedCharacterRecipe(
    {
      ...structuredClone(project.archive.config),
      name: exportName,
      provenance: `${project.archive.config.provenance}\n\n${note}\n\n${selected.map((item) => `${item.manifest.name}: ${item.manifest.provenance}`).join("\n\n")}${appearanceMetadata ? `\n\nAppearance: ${project.appearanceBank!.manifest.provenance}` : ""}`,
      derivation: {
        ...structuredClone(project.archive.config.derivation),
        method: `${project.archive.config.derivation.method}\n\n${note}`,
      },
      sourceMetadata: {
        ...structuredClone(project.archive.config.sourceMetadata ?? {}),
        wardrobe: wardrobeMetadata,
        ...(appearanceMetadata ? { appearance: appearanceMetadata } : {}),
      },
    },
    manifest,
  );
  return { manifest, config, selected };
}

/** Normal CharacterPack V2/V3 envelope; no wardrobe renderer is needed to play it.
 * Every exported frame is checked, including frames not currently previewed. */
export async function exportWardrobeCharacterPack(
  project: WardrobeProject,
  options: WardrobeExportOptions = {},
): Promise<Uint8Array> {
  const verified = await validateWardrobeProject(project);
  const selected = Object.values(verified.document.selection).some(
    (id) => id !== null,
  );
  const headSelection =
    verified.document.version === 2 ? verified.document.appearance : undefined;
  const hasAppearance = appearanceIsActive(headSelection);
  if (!selected && !hasAppearance && options.name === undefined)
    return new Uint8Array(verified.source);
  const compositor = new RegisteredWardrobeCompositor(verified);
  const { manifest, config } = exportMetadata(
    verified,
    options.name,
    compositor.manifest,
  );
  const sheets = [
    manifest.spritesheet,
    ...(manifest.schemaVersion === 3 ? manifest.additionalSheets : []),
  ];
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  let pngBytes = 0;
  try {
    options.onProgress?.({ completedPages: 0, totalPages: sheets.length });
    for (const [page, sheet] of sheets.entries()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const png = await encodeSourceRgbaPngAsync(compositor.renderPage(page));
      pngBytes += png.length;
      if (pngBytes > BAKED_MAX_ARCHIVE_BYTES)
        throw Error(
          "Wardrobe PNG pages exceed the 64 MiB CharacterPack budget.",
        );
      files[sheet.file] = [png, { level: 0 }];
      options.onProgress?.({
        completedPages: page + 1,
        totalPages: sheets.length,
      });
    }
  } finally {
    compositor.dispose();
  }
  const text = {
    "manifest.json": JSON.stringify(manifest, null, 2),
    "character.json": JSON.stringify(config, null, 2),
    "PROVENANCE.txt": `Baked wardrobe character: ${config.name}\n\n${config.provenance}\n\nSource video: ${config.source.name}\nSource video SHA-256: ${config.source.sha256}\nSource CharacterPack SHA-256: ${verified.document.sourceSha256}\nRegistration SHA-256: ${verified.document.registrationSha256}\n\n${config.derivation.method}\n\nThese atlas pages contain deterministic garment composites; they are not unchanged source-video PNG files. Original body pixels outside declared garment ownership are preserved. No runtime image generation or skeleton is required. The separate wardrobe project retains the original CharacterPack and editable item selection.\n`,
    "INTEGRATION.md": `# CharacterPack V${manifest.schemaVersion}: baked wardrobe playback\n\nLoad manifest.json, character.json and every declared spritesheet PNG. Page 0 is spritesheet; additionalSheets, when present, follow in order. Each frame uses its explicit page and native rectangle. Preserve the frame-relative anchor and aspect ratio. Exported frames are RGBA with smooth transparency; scale.pixelArt=false.\n\nPlay action frame IDs in their listed order at the declared FPS. Repeated IDs are intentional holds. Respect loop=false for one-shot actions, and disable missing actions. Native view is right; left mirrors the complete character around the anchor. The original authored in-frame movement and optional motionFlow metadata are retained. Do not independently recenter clothing or normalize jumping frames.\n\nClothing is already composited into these PNGs. capabilities.editableAppearance=false is intentional: this ZIP is standalone playback, while a gathria-wardrobe-project ZIP contains the original source, registration and editable garments. This pack does not depend on that project, the editor, a skeletal renderer or a model API. Provenance in character.json distinguishes original video artwork from authored garment patches.\n\nLimits: up to 4 sheets, 8192 pixels per dimension, 128 Mi decoded pixels total, 1024 frame cells, 64 MiB CharacterPack ZIP and 256 KiB per text file.\n`,
  };
  if (hasAppearance) {
    text["PROVENANCE.txt"] = text["PROVENANCE.txt"]
      .replace(
        "deterministic garment composites",
        "deterministic garment and head-appearance composites",
      )
      .replace(
        "Original body pixels outside declared garment ownership are preserved.",
        "Original pixels outside declared garment and appearance ownership are preserved, translated by the explicit frame padding.",
      );
    text["PROVENANCE.txt"] +=
      `\nAppearance bank SHA-256: ${verified.appearanceBank!.sha256}\nAppearance padding: ${JSON.stringify(verified.appearanceBank!.manifest.padding)}\nOriginal artwork remains exact outside declared appearance/garment ownership, translated into the padded frame. Hair and face patches are authored derivatives.\n`;
    text["INTEGRATION.md"] +=
      "\nThis pack also contains baked head appearance. Render the exported padded dimensions and translated anchor; do not use the source frame geometry. Source body scale, action timing and source-frame mappings are preserved. The original CharacterPack is retained in the editable project.\n";
  }
  for (const [name, content] of Object.entries(text)) {
    const bytes = strToU8(content);
    if (bytes.length > MAX_TEXT_BYTES)
      throw Error(`${name} exceeds the 256 KiB CharacterPack text limit.`);
    files[name] = bytes;
  }
  // ZIP stores local calendar fields. Construct fixed wall time at export, so
  // UTC and other browser time zones produce the same archive bytes.
  const archive = zipSync(files, {
    level: 6,
    mtime: new Date(2020, 0, 1, 0, 0, 0),
  });
  if (archive.length > BAKED_MAX_ARCHIVE_BYTES)
    throw Error("Wardrobe CharacterPack exceeds the 64 MiB archive limit.");
  readPortableCharacterPackArchive(archive);
  return archive;
}
