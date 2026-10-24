import type { RgbaPng } from "../core/baked-source";
import type { PortableAnimationName } from "../core/types";
import type { LookComparison } from "./look-comparison";
import {
  analyzeReviewFrame,
  clampReviewRect,
  REVIEW_MAX_POSITIONS,
  type ReviewFrameMetrics,
} from "./review-analysis";

export interface MotionEdge {
  index: number;
  fromPosition: number;
  toPosition: number;
  fromFrameId: number;
  toFrameId: number;
  loopClosure: boolean;
  hold: boolean;
  durationMs: number;
}
export interface MotionMetrics {
  reference: ReviewFrameMetrics;
  current: ReviewFrameMetrics;
  /** Magnitude of (currentTo-currentFrom)-(referenceTo-referenceFrom).
   * Signed premultiplied channels cancel identical motion, not just magnitudes. */
  residual: { changedPixels: number; meanDelta: number; maxDelta: number };
}
export interface MotionScan {
  format: "gathria-motion-review";
  version: 1;
  action: PortableAnimationName;
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  threshold: number;
  edges: Array<MotionEdge & MotionMetrics>;
  interpretation: string;
}

export function planMotionEdges(
  manifest: LookComparison["manifest"],
  action: PortableAnimationName,
): MotionEdge[] {
  const clip = manifest.animations[action];
  if (
    !clip ||
    !Array.isArray(clip.frames) ||
    !clip.frames.length ||
    clip.frames.length > REVIEW_MAX_POSITIONS ||
    !Number.isFinite(clip.fps) ||
    clip.fps <= 0 ||
    clip.fps > 120 ||
    typeof clip.loop !== "boolean"
  )
    throw Error("Motion review needs a bounded action with valid timing.");
  const known = new Set(manifest.frames.map((f) => f.id));
  if (clip.frames.some((id) => !Number.isSafeInteger(id) || !known.has(id)))
    throw Error("Motion review references an unavailable pose.");
  clampReviewRect(
    manifest.spritesheet.frameWidth,
    manifest.spritesheet.frameHeight,
  );
  return Array.from(
    { length: clip.loop ? clip.frames.length : clip.frames.length - 1 },
    (_, i) => {
      const next = (i + 1) % clip.frames.length;
      return {
        index: i,
        fromPosition: i,
        toPosition: next,
        fromFrameId: clip.frames[i],
        toFrameId: clip.frames[next],
        hold: clip.frames[i] === clip.frames[next],
        loopClosure: next === 0,
        durationMs: 1000 / clip.fps,
      };
    },
  );
}

export function analyzeMotionEdge(
  referenceFrom: RgbaPng,
  referenceTo: RgbaPng,
  currentFrom: RgbaPng,
  currentTo: RgbaPng,
  threshold = 8,
): MotionMetrics {
  const reference = analyzeReviewFrame(referenceFrom, referenceTo, threshold);
  const current = analyzeReviewFrame(currentFrom, currentTo, threshold);
  if (
    referenceFrom.width !== currentFrom.width ||
    referenceFrom.height !== currentFrom.height
  )
    throw Error(
      "Motion review requires the same anchored canvas for both looks.",
    );
  let sum = 0,
    count = 0,
    max = 0;
  const samples = [
    referenceFrom.pixels,
    referenceTo.pixels,
    currentFrom.pixels,
    currentTo.pixels,
  ];
  for (let at = 0; at < samples[0].length; at += 4) {
    let delta = 0;
    for (let c = 0; c < 4; c++) {
      const p = (i: number) =>
        c === 3
          ? samples[i][at + 3]
          : (samples[i][at + c] * samples[i][at + 3]) / 255;
      delta = Math.max(delta, Math.abs(p(3) - p(2) - (p(1) - p(0))));
    }
    sum += delta;
    max = Math.max(max, delta);
    if (delta > threshold) count++;
  }
  // Opposite signed transitions can differ by 510 channel levels.
  return {
    reference,
    current,
    residual: {
      changedPixels: count,
      meanDelta: sum / (reference.totalPixels * 510),
      maxDelta: max / 510,
    },
  };
}

/** Six native frames at most (first, previous, next for two looks), scalar
 * results only. Source order, holds and real loop boundaries stay untouched. */
export async function scanMotionAction(
  comparison: LookComparison,
  action: PortableAnimationName,
  options: {
    signal?: AbortSignal;
    threshold?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<MotionScan> {
  const plan = planMotionEdges(comparison.manifest, action),
    clip = comparison.manifest.animations[action]!;
  const threshold = options.threshold ?? 8;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255)
    throw Error("Choose a motion threshold between 0 and 255.");
  const check = () => {
    if (options.signal?.aborted)
      throw new DOMException("Motion review canceled.", "AbortError");
  };
  const render = (id: number) => {
    const pair = {
      reference: comparison.renderSourceFrame(id),
      current: comparison.renderFrame(id),
    };
    for (const image of [pair.reference, pair.current]) {
      if (
        image.width !== comparison.manifest.spritesheet.frameWidth ||
        image.height !== comparison.manifest.spritesheet.frameHeight
      )
        throw Error("Motion frame dimensions changed during review.");
      // Full RGBA validation, including the single-pose case.
      analyzeReviewFrame(image, image, threshold);
    }
    return pair;
  };
  check();
  options.onProgress?.(0, plan.length);
  check();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  check();
  let previous = render(clip.frames[0]);
  const first = clip.loop ? previous : undefined;
  const edges: MotionScan["edges"] = [];
  for (const edge of plan) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    check();
    const next = edge.hold
      ? previous
      : edge.loopClosure
        ? first!
        : render(edge.toFrameId);
    const metrics = analyzeMotionEdge(
      previous.reference,
      next.reference,
      previous.current,
      next.current,
      threshold,
    );
    edges.push({ ...edge, ...metrics });
    previous = next;
    options.onProgress?.(edges.length, plan.length);
    check();
  }
  check();
  return {
    format: "gathria-motion-review",
    version: 1,
    action,
    fps: clip.fps,
    loop: clip.loop,
    frameCount: clip.frames.length,
    durationMs: (clip.frames.length * 1000) / clip.fps,
    threshold,
    edges,
    interpretation:
      "Residual is a change in signed premultiplied pixel motion compared with the original/pinned look (0..1, divided by 510). Clothing and hair legitimately change this value. It is not a seam detector, smoothness score or visual approval. One-shot actions never acquire a closing edge.",
  };
}
