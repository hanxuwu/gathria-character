import type { RgbaPng } from "../core/baked-source";
import type { PortableAnimationName } from "../core/types";
import type { Rect } from "./contract";
import type { LookComparison } from "./look-comparison";

export const REVIEW_MAX_PIXELS = 4_194_304;
export const REVIEW_MAX_POSITIONS = 600;
export const REVIEW_DEFAULT_THRESHOLD = 8;

export interface ReviewFrameMetrics {
  changedPixels: number;
  totalPixels: number;
  /** Number of pixels whose alpha increased/decreased by more than threshold. */
  alphaAdded: number;
  alphaRemoved: number;
  /** Mean largest premultiplied RGBA channel delta, normalized to 0..1. */
  meanDelta: number;
  /** Native, unmirrored canvas coordinates, including appearance padding. */
  changedBounds: Rect | null;
}

function validateImage(image: RgbaPng) {
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width * image.height > REVIEW_MAX_PIXELS ||
    !(image.pixels instanceof Uint8Array) ||
    image.pixels.length !== image.width * image.height * 4
  )
    throw Error("Review requires a bounded, complete RGBA frame.");
}

function validateThreshold(threshold: number) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255)
    throw Error("Review threshold must be between 0 and 255.");
}

/** The same integer rectangle is used for both looks. Outside-canvas rectangles
 * become empty; fractional, negative-sized or non-finite rectangles are rejected. */
export function clampReviewRect(
  width: number,
  height: number,
  roi?: Rect,
): Rect {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > REVIEW_MAX_PIXELS
  )
    throw Error("Review canvas dimensions exceed the local limit.");
  if (!roi) return { x: 0, y: 0, width, height };
  if (
    ![roi.x, roi.y, roi.width, roi.height].every(Number.isSafeInteger) ||
    roi.width < 0 ||
    roi.height < 0 ||
    !Number.isSafeInteger(roi.x + roi.width) ||
    !Number.isSafeInteger(roi.y + roi.height)
  )
    throw Error("Review area must be a whole-pixel rectangle.");
  const x = Math.max(0, Math.min(width, roi.x));
  const y = Math.max(0, Math.min(height, roi.y));
  const right = Math.max(x, Math.min(width, roi.x + roi.width));
  const bottom = Math.max(y, Math.min(height, roi.y + roi.height));
  return { x, y, width: right - x, height: bottom - y };
}

function inputs(
  reference: RgbaPng,
  current: RgbaPng,
  threshold: number,
  roi?: Rect,
) {
  validateImage(reference);
  validateImage(current);
  validateThreshold(threshold);
  if (reference.width !== current.width || reference.height !== current.height)
    throw Error("Review frames must first share the same anchored canvas.");
  return clampReviewRect(current.width, current.height, roi);
}

/** RGB is premultiplied before comparison so invisible RGB cannot manufacture
 * an issue. Alpha itself participates, so opaque black does not equal empty. */
function pixelDelta(a: Uint8Array, b: Uint8Array, at: number): number {
  const aa = a[at + 3],
    ba = b[at + 3];
  let delta = Math.abs(ba - aa);
  for (let channel = 0; channel < 3; channel++)
    delta = Math.max(
      delta,
      Math.abs(b[at + channel] * ba - a[at + channel] * aa) / 255,
    );
  return delta;
}

export function analyzeReviewFrame(
  reference: RgbaPng,
  current: RgbaPng,
  threshold = REVIEW_DEFAULT_THRESHOLD,
  roi?: Rect,
): ReviewFrameMetrics {
  const area = inputs(reference, current, threshold, roi);
  let changedPixels = 0,
    alphaAdded = 0,
    alphaRemoved = 0,
    totalDelta = 0,
    left = current.width,
    right = -1,
    top = current.height,
    bottom = -1;
  for (let y = area.y; y < area.y + area.height; y++)
    for (let x = area.x; x < area.x + area.width; x++) {
      const at = (y * current.width + x) * 4;
      const delta = pixelDelta(reference.pixels, current.pixels, at);
      totalDelta += delta;
      if (delta > threshold) {
        changedPixels++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      const alphaDelta = current.pixels[at + 3] - reference.pixels[at + 3];
      if (alphaDelta > threshold) alphaAdded++;
      if (-alphaDelta > threshold) alphaRemoved++;
    }
  const totalPixels = area.width * area.height;
  return {
    changedPixels,
    totalPixels,
    alphaAdded,
    alphaRemoved,
    meanDelta: totalPixels ? totalDelta / (totalPixels * 255) : 0,
    changedBounds: changedPixels
      ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
      : null,
  };
}

/** Diagnostic pixels, not artwork. Cyan: gained alpha; magenta: lost alpha;
 * amber: color change. Unchanged pixels and pixels outside the ROI are empty. */
export function reviewDifferenceImage(
  reference: RgbaPng,
  current: RgbaPng,
  threshold = REVIEW_DEFAULT_THRESHOLD,
  roi?: Rect,
): RgbaPng {
  const area = inputs(reference, current, threshold, roi);
  const pixels = new Uint8Array(current.width * current.height * 4);
  for (let y = area.y; y < area.y + area.height; y++)
    for (let x = area.x; x < area.x + area.width; x++) {
      const at = (y * current.width + x) * 4;
      const delta = pixelDelta(reference.pixels, current.pixels, at);
      if (delta <= threshold) continue;
      const alphaDelta = current.pixels[at + 3] - reference.pixels[at + 3];
      const color =
        alphaDelta > threshold
          ? [0, 190, 215]
          : -alphaDelta > threshold
            ? [230, 40, 140]
            : [245, 158, 11];
      pixels.set([...color, Math.max(96, Math.round(delta))], at);
    }
  return {
    width: current.width,
    height: current.height,
    pixels,
    colorChunks: [],
  };
}

export interface ReviewScanRow {
  position: number;
  frameId: number;
  startMs: number;
  durationMs: number;
  holdStartPosition: number;
  holdFrames: number;
  holdDurationMs: number;
  metrics: ReviewFrameMetrics;
  /** Consecutive current-pose difference; not a score of animation quality. */
  temporalDelta: number | null;
}

export interface ReviewActionScan {
  action: PortableAnimationName;
  fps: number;
  loop: boolean;
  durationMs: number;
  frameCount: number;
  uniqueFrameCount: number;
  rows: ReviewScanRow[];
  seam: {
    fromFrameId: number;
    toFrameId: number;
    meanDelta: number;
    changedPixels: number;
  } | null;
  heuristic: string;
}

/** A sequential diagnostic scan: at most current/previous/first RGBA frames
 * remain live, plus scalar metrics per unique source pose. Repeated holds reuse
 * pixels and metrics; a recurring non-adjacent pose may be rendered again for
 * its temporal edge, without retaining a full action's image buffers. */
export async function scanReviewAction(
  comparison: LookComparison,
  action: PortableAnimationName,
  options: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    threshold?: number;
    roi?: Rect;
  } = {},
): Promise<ReviewActionScan> {
  const threshold = options.threshold ?? REVIEW_DEFAULT_THRESHOLD;
  validateThreshold(threshold);
  const clip = comparison.manifest.animations[action];
  if (
    !clip ||
    !Array.isArray(clip.frames) ||
    clip.frames.length < 1 ||
    clip.frames.length > REVIEW_MAX_POSITIONS ||
    !Number.isFinite(clip.fps) ||
    clip.fps <= 0 ||
    clip.fps > 120 ||
    typeof clip.loop !== "boolean"
  )
    throw Error("Review action is missing or exceeds the local scan limit.");
  const known = new Set(comparison.manifest.frames.map((frame) => frame.id));
  if (clip.frames.some((id) => !Number.isSafeInteger(id) || !known.has(id)))
    throw Error("Review action references an unavailable source pose.");
  const sheet = comparison.manifest.spritesheet;
  clampReviewRect(sheet.frameWidth, sheet.frameHeight, options.roi);
  const check = () => {
    if (options.signal?.aborted)
      throw new DOMException("Review scan canceled.", "AbortError");
  };
  const render = (id: number, original = false) => {
    const image = original
      ? comparison.renderSourceFrame(id)
      : comparison.renderFrame(id);
    validateImage(image);
    if (image.width !== sheet.frameWidth || image.height !== sheet.frameHeight)
      throw Error("Review frame dimensions changed during scan.");
    return image;
  };
  const metrics = new Map<number, ReviewFrameMetrics>();
  const rows: ReviewScanRow[] = [];
  let previous: RgbaPng | undefined,
    first: RgbaPng | undefined,
    previousId: number | undefined,
    holdStart = 0,
    holdFrames = 0;
  const durationMs = 1000 / clip.fps;
  check();
  options.onProgress?.(0, clip.frames.length);
  for (let position = 0; position < clip.frames.length; position++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    check();
    const frameId = clip.frames[position];
    const current = previousId === frameId ? previous! : render(frameId);
    if (!metrics.has(frameId))
      metrics.set(
        frameId,
        analyzeReviewFrame(
          render(frameId, true),
          current,
          threshold,
          options.roi,
        ),
      );
    if (!first && clip.loop) first = current;
    if (position === 0 || frameId !== previousId) {
      holdStart = position;
      holdFrames = 1;
      while (clip.frames[position + holdFrames] === frameId) holdFrames++;
    }
    rows.push({
      position,
      frameId,
      startMs: position * durationMs,
      durationMs,
      holdStartPosition: holdStart,
      holdFrames,
      holdDurationMs: holdFrames * durationMs,
      metrics: metrics.get(frameId)!,
      temporalDelta: previous
        ? previousId === frameId
          ? 0
          : analyzeReviewFrame(previous, current, threshold, options.roi)
              .meanDelta
        : null,
    });
    previous = current;
    previousId = frameId;
    options.onProgress?.(position + 1, clip.frames.length);
    check();
  }
  let seam: ReviewActionScan["seam"] = null;
  if (clip.loop && first && previous) {
    const delta = analyzeReviewFrame(previous, first, threshold, options.roi);
    seam = {
      fromFrameId: clip.frames[clip.frames.length - 1],
      toFrameId: clip.frames[0],
      meanDelta: delta.meanDelta,
      changedPixels: delta.changedPixels,
    };
  }
  check();
  return {
    action,
    fps: clip.fps,
    loop: clip.loop,
    durationMs: durationMs * clip.frames.length,
    frameCount: clip.frames.length,
    uniqueFrameCount: metrics.size,
    rows,
    seam,
    heuristic:
      "Pixel differences locate changes, not defects. Clothing changes and intended motion can produce large values. Inspect the actual poses before judging quality. Non-looping actions have no loop seam.",
  };
}
