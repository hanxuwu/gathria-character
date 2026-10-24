import { encodeSourceRgbaPngAsync, type RgbaPng } from "../core/baked-source";
import type { Facing, PortableAnimationName } from "../core/types";
import { compactGifFrame } from "./action-gif";
import type { Rect } from "./contract";
import type { LookComparison } from "./look-comparison";

export interface ReviewSheetRow {
  position: number;
  endPosition: number;
  frameId: number;
  startMs: number;
  holdMs: number;
}
export interface ReviewContactSheet {
  png: Uint8Array;
  page: number;
  width: number;
  height: number;
  scale: 0.5;
  rows: ReviewSheetRow[];
}
export const REVIEW_SHEET_MAX_PIXELS = 4_194_304;
export const REVIEW_SHEETS_MAX_TOTAL_PIXELS = 32_000_000;
export const REVIEW_SHEETS_MAX_BYTES = 64 * 1024 * 1024;
export const REVIEW_SHEET_GAP = 12;
export const REVIEW_SHEET_HEADER = 42;
export const REVIEW_SHEET_ROW_LABEL = 32;

/** All views crop the same aligned native rectangle, before mirroring. */
export function clampReviewRegion(
  width: number,
  height: number,
  region?: Rect,
): Rect {
  if (
    ![width, height].every((n) => Number.isSafeInteger(n) && n > 0) ||
    width * height > REVIEW_SHEET_MAX_PIXELS
  )
    throw Error("Review image exceeds the local pixel budget.");
  if (!region) return { x: 0, y: 0, width, height };
  if (
    ![region.x, region.y, region.width, region.height].every(Number.isFinite) ||
    region.width <= 0 ||
    region.height <= 0
  )
    throw Error("Choose a valid review region.");
  const x = Math.max(0, Math.floor(region.x)),
    y = Math.max(0, Math.floor(region.y));
  const right = Math.min(width, Math.ceil(region.x + region.width)),
    bottom = Math.min(height, Math.ceil(region.y + region.height));
  if (right <= x || bottom <= y)
    throw Error("The review region is outside this character frame.");
  return { x, y, width: right - x, height: bottom - y };
}

export function planReviewContactSheets(
  comparison: Pick<LookComparison, "manifest">,
  action: PortableAnimationName,
) {
  const clip = comparison.manifest.animations[action];
  if (
    !clip ||
    clip.frames.length < 1 ||
    clip.frames.length > 600 ||
    !Number.isFinite(clip.fps) ||
    clip.fps <= 0 ||
    clip.fps > 120
  )
    throw Error("This action exceeds the local review-sheet limits.");
  const { frameWidth, frameHeight } = comparison.manifest.spritesheet;
  clampReviewRegion(frameWidth, frameHeight);
  const panelWidth = Math.ceil(frameWidth / 2),
    panelHeight = Math.ceil(frameHeight / 2);
  const width = panelWidth * 2 + REVIEW_SHEET_GAP;
  const rowsPerPage = Math.min(
    4,
    Math.floor(
      (REVIEW_SHEET_MAX_PIXELS / width - REVIEW_SHEET_HEADER) /
        (panelHeight + REVIEW_SHEET_ROW_LABEL),
    ),
  );
  if (rowsPerPage < 1)
    throw Error("This character is too large for a review sheet.");
  const known = new Set(comparison.manifest.frames.map((f) => f.id));
  const rows: ReviewSheetRow[] = [];
  for (const [position, frameId] of clip.frames.entries()) {
    if (!known.has(frameId))
      throw Error("Action refers to a missing source pose.");
    const last = rows.at(-1);
    if (last?.frameId === frameId) {
      last.endPosition = position;
      last.holdMs = ((position - last.position + 1) * 1000) / clip.fps;
    } else
      rows.push({
        position,
        endPosition: position,
        frameId,
        startMs: (position * 1000) / clip.fps,
        holdMs: 1000 / clip.fps,
      });
  }
  if (rows.length > 128)
    throw Error(
      "This action has too many pose changes for a review sheet; use the animation export.",
    );
  const pages = Array.from(
    { length: Math.ceil(rows.length / rowsPerPage) },
    (_, i) => rows.slice(i * rowsPerPage, (i + 1) * rowsPerPage),
  );
  const totalPixels = pages.reduce(
    (sum, page) =>
      sum +
      width *
        (REVIEW_SHEET_HEADER +
          page.length * (panelHeight + REVIEW_SHEET_ROW_LABEL)),
    0,
  );
  if (totalPixels > REVIEW_SHEETS_MAX_TOTAL_PIXELS)
    throw Error(
      "This action exceeds the total review-sheet pixel budget; use the animation export.",
    );
  return {
    panelWidth,
    panelHeight,
    width,
    pages,
    loop: clip.loop,
    fps: clip.fps,
    durationMs: (clip.frames.length * 1000) / clip.fps,
    totalPixels,
  };
}

// Fixed 3×5 raster labels keep saved sheets independent of system fonts.
const glyphs: Record<string, string> = {
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "111001111100111",
  "3": "111001111001111",
  "4": "101101111001001",
  "5": "111100111001111",
  "6": "111100111101111",
  "7": "111001001001001",
  "8": "111101111101111",
  "9": "111101111001111",
  A: "010101111101101",
  B: "110101110101110",
  C: "111100100100111",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "111100101101111",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101111",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "101111111111101",
  O: "111101101101111",
  P: "110101110100100",
  Q: "111101101111001",
  R: "110101110101101",
  S: "111100111001111",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  ":": "000010000010000",
  "-": "000000111000000",
  "/": "001001010100100",
  ".": "000000000000010",
  " ": "000000000000000",
};
function text(image: RgbaPng, value: string, x: number, y: number) {
  for (const [i, c] of [...value.toUpperCase()].entries()) {
    const glyph = glyphs[c] ?? glyphs[" "];
    for (let py = 0; py < 5; py++)
      for (let px = 0; px < 3; px++)
        if (glyph[py * 3 + px] === "1") {
          const dx = x + i * 8 + px * 2,
            dy = y + py * 2;
          for (let sy = 0; sy < 2; sy++)
            for (let sx = 0; sx < 2; sx++)
              if (dx + sx < image.width && dy + sy < image.height)
                image.pixels.set(
                  [52, 75, 63, 255],
                  ((dy + sy) * image.width + dx + sx) * 4,
                );
        }
  }
}
function paste(target: RgbaPng, input: RgbaPng, x: number, y: number) {
  for (let row = 0; row < input.height; row++)
    target.pixels.set(
      input.pixels.subarray(row * input.width * 4, (row + 1) * input.width * 4),
      ((row + y) * target.width + x) * 4,
    );
}

/** Scalar plan + one live page at a time; unchanged source artwork is never retained or edited. */
export async function buildReviewContactSheets(
  comparison: LookComparison,
  action: PortableAnimationName,
  facing: Facing,
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    referenceLabel?: "ORIGINAL" | "PINNED";
  } = {},
): Promise<ReviewContactSheet[]> {
  if (facing !== "left" && facing !== "right")
    throw Error("Choose a valid facing for review sheets.");
  const check = () => {
    if (options.signal?.aborted)
      throw new DOMException("Review sheets canceled.", "AbortError");
  };
  check();
  const plan = planReviewContactSheets(comparison, action),
    result: ReviewContactSheet[] = [];
  let bytes = 0;
  options.onProgress?.(0, plan.pages.length);
  for (const [index, rows] of plan.pages.entries()) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    check();
    const height =
      REVIEW_SHEET_HEADER +
      rows.length * (plan.panelHeight + REVIEW_SHEET_ROW_LABEL);
    const pixels = new Uint8Array(plan.width * height * 4);
    for (let i = 0; i < pixels.length; i += 4)
      pixels.set([238, 233, 223, 255], i);
    const image: RgbaPng = {
      width: plan.width,
      height,
      pixels,
      colorChunks: [],
    };
    text(image, `${action} ${facing} / PAGE ${index + 1} / HALF SIZE`, 6, 5);
    text(image, options.referenceLabel ?? "ORIGINAL", 6, 23);
    text(image, "CURRENT", plan.panelWidth + REVIEW_SHEET_GAP + 6, 23);
    for (const [row, data] of rows.entries()) {
      check();
      const y =
        REVIEW_SHEET_HEADER + row * (plan.panelHeight + REVIEW_SHEET_ROW_LABEL);
      text(
        image,
        `POSE ${data.frameId} / POS ${data.position}-${data.endPosition}`,
        6,
        y + 2,
      );
      text(
        image,
        `AT ${Math.round(data.startMs)}MS / HOLD ${Math.round(data.holdMs)}MS`,
        6,
        y + 17,
      );
      for (const [i, frame] of [
        comparison.renderSourceFrame(data.frameId),
        comparison.renderFrame(data.frameId),
      ].entries()) {
        if (
          frame.width !== comparison.manifest.spritesheet.frameWidth ||
          frame.height !== comparison.manifest.spritesheet.frameHeight ||
          frame.pixels.length !== frame.width * frame.height * 4
        )
          throw Error("Review frame dimensions changed during export.");
        const panel = compactGifFrame(frame, facing);
        paste(
          image,
          panel,
          i * (plan.panelWidth + REVIEW_SHEET_GAP),
          y + REVIEW_SHEET_ROW_LABEL,
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      check();
    }
    const png = await encodeSourceRgbaPngAsync(image);
    check();
    bytes += png.byteLength;
    if (bytes > REVIEW_SHEETS_MAX_BYTES)
      throw Error("Review sheets exceed the 64 MiB export budget.");
    result.push({
      png,
      page: index + 1,
      width: image.width,
      height,
      scale: 0.5,
      rows,
    });
    options.onProgress?.(index + 1, plan.pages.length);
  }
  return result;
}
