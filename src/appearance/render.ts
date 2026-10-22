import type { RgbaPng } from "../core/baked-source";
import { validatePortableManifest } from "../core/pack";
import type { BakedCharacterPackManifest, SpriteFrame } from "../core/types";
import { decodedGarmentPage } from "../wardrobe/garment-pages";
import type { Point, ProtectedRegion, Rect } from "../wardrobe/contract";
import type {
  AppearanceBank,
  AppearanceFrame,
  AppearanceHairColor,
  AppearanceLayerRole,
  AppearancePadding,
  AppearancePose,
  AppearanceSelection,
} from "./contract";

export const NO_APPEARANCE_PADDING: Readonly<AppearancePadding> = Object.freeze(
  { left: 0, top: 0, right: 0, bottom: 0 },
);

/** Integer translation only. Copy even invisible RGB and source color metadata;
 * Canvas drawImage would discard these pixels or premultiply their edge colors. */
export function padAppearanceFrame(
  source: RgbaPng,
  padding: AppearancePadding,
): RgbaPng {
  const width = source.width + padding.left + padding.right;
  const height = source.height + padding.top + padding.bottom;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < source.height; y++)
    pixels.set(
      source.pixels.subarray(y * source.width * 4, (y + 1) * source.width * 4),
      ((y + padding.top) * width + padding.left) * 4,
    );
  return {
    width,
    height,
    pixels,
    colorChunks: source.colorChunks.map((chunk) => new Uint8Array(chunk)),
  };
}

/** Appearance padding changes only the baked envelope. Frame IDs, action order,
 * repeated holds, FPS, loop flags and the character's source pixel scale survive. */
export function appearanceOutputManifest(
  source: BakedCharacterPackManifest,
  padding: AppearancePadding,
): BakedCharacterPackManifest {
  const width = source.spritesheet.frameWidth + padding.left + padding.right;
  const height = source.spritesheet.frameHeight + padding.top + padding.bottom;
  const columns = Math.min(8, source.frames.length, Math.floor(8192 / width));
  const rowsPerPage = Math.min(
    Math.floor(8192 / height),
    Math.floor((32 * 1024 * 1024) / (columns * width * height)),
  );
  if (columns < 1 || rowsPerPage < 1)
    throw Error(
      "Padded appearance frame exceeds the CharacterPack page budget.",
    );
  const capacity = columns * rowsPerPage;
  const pageCount = Math.ceil(source.frames.length / capacity);
  if (pageCount > 4)
    throw Error("Padded appearance needs more than four CharacterPack pages.");
  const sheets = Array.from({ length: pageCount }, (_, page) => {
    const count = Math.min(capacity, source.frames.length - page * capacity);
    const pageColumns = Math.min(columns, count),
      rows = Math.ceil(count / pageColumns);
    return {
      file: page === 0 ? "spritesheet.png" : `spritesheet-${page}.png`,
      width: pageColumns * width,
      height: rows * height,
      frameWidth: width,
      frameHeight: height,
      columns: pageColumns,
      rows,
    };
  });
  const frames: SpriteFrame[] = source.frames.map((frame, index) => {
    const page = Math.floor(index / capacity),
      cell = index % capacity,
      sheet = sheets[page];
    return {
      id: frame.id,
      ...(pageCount > 1 ? { page } : {}),
      x: (cell % sheet.columns) * width,
      y: Math.floor(cell / sheet.columns) * height,
      width,
      height,
    };
  });
  const { additionalSheets: _oldSheets, ...common } =
    source.schemaVersion === 3
      ? source
      : { ...source, additionalSheets: undefined };
  return validatePortableManifest({
    ...structuredClone(common),
    schemaVersion: pageCount > 1 ? 3 : 2,
    spritesheet: sheets[0],
    ...(pageCount > 1 ? { additionalSheets: sheets.slice(1) } : {}),
    frames,
    anchor: {
      ...source.anchor,
      x: source.anchor.x + padding.left,
      y: source.anchor.y + padding.top,
    },
  });
}

type Rows = Map<number, Array<[number, number]>>;
function polygonRows(polygons: Point[][]): Rows {
  const rows: Rows = new Map();
  for (const polygon of polygons) {
    const min = Math.ceil(Math.min(...polygon.map((p) => p.y)) - 0.5),
      max = Math.floor(Math.max(...polygon.map((p) => p.y)) - 0.5);
    for (let y = min; y <= max; y++) {
      const cy = y + 0.5,
        crossings: number[] = [],
        spans = rows.get(y) ?? [];
      const add = (a: number, b: number) => {
        const left = Math.ceil(Math.min(a, b) - 0.5 - 1e-9),
          right = Math.floor(Math.max(a, b) - 0.5 + 1e-9);
        if (left <= right) spans.push([left, right]);
      };
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j],
          b = polygon[i];
        if (a.y > cy !== b.y > cy)
          crossings.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
        if (Math.abs(a.y - cy) < 1e-9 && Math.abs(b.y - cy) < 1e-9)
          add(a.x, b.x);
        else if (Math.abs(a.y - cy) < 1e-9) add(a.x, a.x);
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        add(crossings[i], crossings[i + 1]);
      if (spans.length) rows.set(y, spans);
    }
  }
  return rows;
}
function contains(rows: Rows, x: number, y: number): boolean {
  return (rows.get(y) ?? []).some(([left, right]) => x >= left && x <= right);
}
function inRect(rect: Rect, x: number, y: number): boolean {
  return (
    x + 0.5 >= rect.x &&
    y + 0.5 >= rect.y &&
    x + 0.5 <= rect.x + rect.width &&
    y + 0.5 <= rect.y + rect.height
  );
}
function sameProfile(a: Uint8Array[], b: Uint8Array[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (chunk, i) =>
        chunk.length === b[i].length &&
        chunk.every((byte, j) => byte === b[i][j]),
    )
  );
}

const HAIR_FACTORS: Record<AppearanceHairColor, readonly number[]> = {
  chestnut: [1, 1, 1],
  espresso: [0.63, 0.65, 0.69],
  copper: [1.2, 1.05, 0.83],
};

/** Straight-alpha source-over (or destination-over for back hair). No opaque
 * replacement rectangles: an antialiased lock retains the face underneath it. */
function blend(
  target: Uint8Array,
  out: number,
  patch: Uint8Array,
  at: number,
  back: boolean,
  tint: AppearanceHairColor,
): void {
  const sa = patch[at + 3] / 255,
    da = target[out + 3] / 255;
  if (!sa || (back && da === 1)) return;
  const sourceWeight = back ? sa * (1 - da) : sa;
  const destWeight = back ? da : da * (1 - sa);
  const alpha = sourceWeight + destWeight;
  // A shade-preserving channel transform changes only the authored hair. The
  // chestnut default is byte exact; deep outlines stay dark in both variants.
  const factors = HAIR_FACTORS[tint];
  for (let c = 0; c < 3; c++) {
    const color = Math.min(255, Math.round(patch[at + c] * factors[c]));
    target[out + c] = Math.round(
      (color * sourceWeight + target[out + c] * destWeight) / alpha,
    );
  }
  target[out + 3] = Math.round(alpha * 255);
}

/** A validated bank and explicit pose registration, not guessed skin colors,
 * determine which head pixels may change. Existing clothing protection remains
 * independent and still rejects any garment that tries to repaint a head/hand. */
export class AppearanceRenderer {
  readonly padding: AppearancePadding;
  private readonly poses: Map<number, AppearancePose>;
  private readonly foreground: Map<number, Rows>;
  private readonly face: Map<number, Rows>;
  private readonly layers: Array<{
    role: AppearanceLayerRole;
    frames: Map<number, AppearanceFrame>;
  }>;
  constructor(
    private readonly bank: AppearanceBank,
    private readonly selection: AppearanceSelection,
    protectedRegions: Map<number, ProtectedRegion[]>,
  ) {
    this.padding = { ...bank.manifest.padding };
    this.poses = new Map(
      bank.manifest.poses.map((pose) => [pose.frameId, pose]),
    );
    this.foreground = new Map(
      bank.manifest.poses.map((pose) => [
        pose.frameId,
        polygonRows([
          ...pose.foreground,
          ...(protectedRegions.get(pose.frameId) ?? [])
            .filter((region) => region.label !== "head")
            .map((region) => region.polygon),
        ]),
      ]),
    );
    this.face = new Map(
      bank.manifest.poses.map((pose) => [
        pose.frameId,
        polygonRows([pose.facePolygon]),
      ]),
    );
    const selected = bank.manifest.styles.filter(
      (style) => style.id === selection.hairId || style.id === selection.faceId,
    );
    this.layers = selected
      .flatMap((style) =>
        style.layers.map((layer) => ({
          role: layer.role,
          frames: new Map(layer.frames.map((frame) => [frame.frameId, frame])),
        })),
      )
      .sort(
        (a, b) =>
          ["hair-back", "face", "hair-front"].indexOf(a.role) -
          ["hair-back", "face", "hair-front"].indexOf(b.role),
      );
  }

  warmPages(): void {
    for (const page of new Set(
      this.layers.flatMap((layer) =>
        [...layer.frames.values()].flatMap((frame) =>
          frame.mode === "paint" ? [frame.page] : [],
        ),
      ),
    ))
      this.page(page);
  }
  private page(page: number) {
    const files = this.bank.pages[page],
      spec = this.bank.manifest.pages[page];
    if (!files || !spec)
      throw Error(`Appearance atlas page ${page} is unavailable.`);
    return decodedGarmentPage(
      `appearance:${this.bank.sha256}:${page}`,
      files.patch,
      files.ownership,
      spec,
    );
  }

  render(frameId: number, source: RgbaPng, dressed: RgbaPng): RgbaPng {
    const pose = this.poses.get(frameId);
    if (!pose)
      throw Error(`Appearance has no registration for frame ${frameId}.`);
    const output = padAppearanceFrame(dressed, this.padding);
    for (const layer of this.layers) {
      const crop = layer.frames.get(frameId);
      if (!crop)
        throw Error(
          `Appearance layer ${layer.role} is missing frame ${frameId}.`,
        );
      if (crop.mode === "source") continue;
      const { patch, ownership } = this.page(crop.page);
      if (!sameProfile(source.colorChunks, patch.colorChunks))
        throw Error(
          "Appearance patch uses a different PNG color profile; normalize it to the source profile before import.",
        );
      for (let y = 0; y < crop.rect.height; y++)
        for (let x = 0; x < crop.rect.width; x++) {
          const at = ((crop.rect.y + y) * patch.width + crop.rect.x + x) * 4;
          if (ownership[at / 4] !== 255) continue;
          const fx = crop.offset.x + x,
            fy = crop.offset.y + y;
          const ox = fx + this.padding.left,
            oy = fy + this.padding.top;
          if (ox < 0 || oy < 0 || ox >= output.width || oy >= output.height)
            throw Error(`Appearance clips output padding in frame ${frameId}.`);
          const native =
            fx >= 0 && fy >= 0 && fx < source.width && fy < source.height;
          const original = (fy * source.width + fx) * 4;
          const sourceAlpha = native ? source.pixels[original + 3] : 0;
          const foreground =
            sourceAlpha !== 0 &&
            contains(this.foreground.get(frameId)!, fx, fy);
          const out = (oy * output.width + ox) * 4;
          if (layer.role === "face") {
            if (
              !inRect(pose.headBounds, fx, fy) ||
              !contains(this.face.get(frameId)!, fx, fy) ||
              !sourceAlpha ||
              foreground
            )
              throw Error(
                `Appearance face overlaps protected source pixels in frame ${frameId} at ${fx},${fy}.`,
              );
            if (patch.pixels[at + 3] !== sourceAlpha)
              throw Error(
                `Appearance face must retain original source alpha in frame ${frameId}.`,
              );
            output.pixels.set(patch.pixels.subarray(at, at + 4), out);
          } else {
            if (!inRect(pose.hairBounds, fx, fy))
              throw Error(
                `Hair exceeds registered bounds in frame ${frameId}.`,
              );
            // Source body and dressed clothing outside the head stay in front.
            // A raised hand cannot be painted over by a new fringe or bob.
            if (
              layer.role === "hair-front" &&
              (foreground ||
                (!inRect(pose.headBounds, fx, fy) &&
                  native &&
                  (sourceAlpha !== 0 || dressed.pixels[original + 3] !== 0)))
            )
              continue;
            blend(
              output.pixels,
              out,
              patch.pixels,
              at,
              layer.role === "hair-back",
              this.selection.hairColor,
            );
          }
        }
    }
    return output;
  }
}
