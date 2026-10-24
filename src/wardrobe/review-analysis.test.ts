import { describe, expect, it, vi } from "vitest";
import type { RgbaPng } from "../core/baked-source";
import type { LookComparison } from "./look-comparison";
import {
  analyzeReviewFrame,
  clampReviewRect,
  reviewDifferenceImage,
  scanReviewAction,
} from "./review-analysis";

function image(width = 4, height = 3): RgbaPng {
  return {
    width,
    height,
    pixels: new Uint8Array(width * height * 4),
    colorChunks: [],
  };
}
function put(a: RgbaPng, x: number, y: number, rgba: number[]) {
  a.pixels.set(rgba, (y * a.width + x) * 4);
  return a;
}
function mirror(a: RgbaPng) {
  const b = image(a.width, a.height);
  for (let y = 0; y < a.height; y++)
    for (let x = 0; x < a.width; x++) {
      const at = (y * a.width + x) * 4;
      put(b, a.width - x - 1, y, Array.from(a.pixels.slice(at, at + 4)));
    }
  return b;
}
function comparison(loop = true) {
  const baseline = image();
  const first = put(image(), 1, 1, [40, 50, 60, 255]);
  const second = put(image(), 2, 1, [40, 50, 60, 255]);
  const clip = { frames: [4, 4, 8, 8, 4], fps: 20, loop };
  return {
    manifest: {
      spritesheet: { frameWidth: 4, frameHeight: 3 },
      frames: [{ id: 4 }, { id: 8 }],
      animations: { run: clip, jump: { ...clip, loop: false } },
    } as LookComparison["manifest"],
    renderFrame: vi.fn((id: number) => (id === 4 ? first : second)),
    renderSourceFrame: vi.fn(() => baseline),
  };
}

describe("native anchored pixel diagnostics", () => {
  it("ignores invisible RGB and treats alpha-only black silhouette changes as real", () => {
    const a = put(image(), 0, 0, [250, 50, 30, 0]);
    const b = put(image(), 0, 0, [10, 240, 200, 0]);
    expect(analyzeReviewFrame(a, b)).toEqual({
      changedPixels: 0,
      totalPixels: 12,
      alphaAdded: 0,
      alphaRemoved: 0,
      meanDelta: 0,
      changedBounds: null,
    });
    put(b, 3, 2, [0, 0, 0, 255]);
    expect(analyzeReviewFrame(a, b)).toMatchObject({
      changedPixels: 1,
      alphaAdded: 1,
      meanDelta: 1 / 12,
      changedBounds: { x: 3, y: 2, width: 1, height: 1 },
    });
  });

  it("compares premultiplied color with a strict threshold and does not mutate images", () => {
    const a = put(image(1, 1), 0, 0, [0, 30, 40, 128]);
    const b = put(image(1, 1), 0, 0, [16, 30, 40, 128]);
    const before = new Uint8Array(b.pixels);
    expect(analyzeReviewFrame(a, b, 9).changedPixels).toBe(0);
    expect(analyzeReviewFrame(a, b, 8).changedPixels).toBe(1);
    expect(analyzeReviewFrame(a, b, 255).changedPixels).toBe(0);
    expect(analyzeReviewFrame(a, b).meanDelta).toBeCloseTo(
      (16 * 128) / 255 ** 2,
    );
    expect(b.pixels).toEqual(before);
  });

  it("clamps one ROI for both frames, preserving native coordinates and empty-area behavior", () => {
    const a = image();
    const b = put(put(image(), 0, 0, [255, 0, 0, 255]), 3, 2, [0, 0, 0, 255]);
    expect(
      analyzeReviewFrame(a, b, 8, { x: 2, y: 1, width: 9, height: 9 }),
    ).toMatchObject({
      totalPixels: 4,
      changedPixels: 1,
      changedBounds: { x: 3, y: 2, width: 1, height: 1 },
    });
    expect(
      analyzeReviewFrame(a, b, 8, { x: -10, y: -10, width: 2, height: 2 }),
    ).toMatchObject({ totalPixels: 0, meanDelta: 0, changedBounds: null });
    expect(
      clampReviewRect(4, 3, { x: -1, y: -1, width: 3, height: 3 }),
    ).toEqual({ x: 0, y: 0, width: 2, height: 2 });
  });

  it("mirroring changes bounds only, not metrics or native input pixels", () => {
    const a = image();
    const b = put(image(), 0, 1, [20, 50, 80, 255]);
    const native = analyzeReviewFrame(a, b);
    const left = analyzeReviewFrame(mirror(a), mirror(b));
    expect(left).toEqual({
      ...native,
      changedBounds: { x: 3, y: 1, width: 1, height: 1 },
    });
    expect(analyzeReviewFrame(a, b)).toEqual(native);
  });

  it("heatmaps distinguish gained alpha, lost alpha and color while excluding the ROI exterior", () => {
    const a = image(),
      b = image();
    put(b, 0, 0, [0, 0, 0, 255]);
    put(a, 1, 0, [0, 0, 0, 255]);
    put(a, 2, 0, [255, 0, 0, 255]);
    put(b, 2, 0, [0, 255, 0, 255]);
    put(b, 3, 2, [0, 0, 0, 255]);
    const heat = reviewDifferenceImage(a, b, 8, {
      x: 0,
      y: 0,
      width: 3,
      height: 1,
    });
    expect(Array.from(heat.pixels.slice(0, 12))).toEqual([
      0, 190, 215, 255, 230, 40, 140, 255, 245, 158, 11, 255,
    ]);
    expect(heat.pixels.slice(12).every((v) => v === 0)).toBe(true);
    expect(analyzeReviewFrame(a, b).alphaRemoved).toBe(1);
  });

  it("rejects mismatched, truncated, excessive or invalid inputs before allocating output", () => {
    const a = image();
    expect(() => analyzeReviewFrame(a, image(3, 3))).toThrow("anchored");
    expect(() =>
      reviewDifferenceImage(a, { ...a, pixels: new Uint8Array(1) }),
    ).toThrow("RGBA");
    expect(() => analyzeReviewFrame(a, a, NaN)).toThrow("threshold");
    expect(() => analyzeReviewFrame(a, a, -1)).toThrow("threshold");
    expect(() =>
      analyzeReviewFrame(a, a, 8, { x: 0.2, y: 0, width: 1, height: 1 }),
    ).toThrow("whole-pixel");
    expect(() => clampReviewRect(10_000, 10_000)).toThrow("limit");
  });
});

describe("sequential action diagnostics", () => {
  it("retains source order and explicit holds while deduplicating metrics and adjacent renders", async () => {
    const c = comparison();
    const onProgress = vi.fn();
    const result = await scanReviewAction(c, "run", { onProgress });
    expect(result).toMatchObject({
      action: "run",
      fps: 20,
      loop: true,
      durationMs: 250,
      frameCount: 5,
      uniqueFrameCount: 2,
    });
    expect(result.rows.map((r) => r.frameId)).toEqual([4, 4, 8, 8, 4]);
    expect(
      result.rows.map((r) => [
        r.holdStartPosition,
        r.holdFrames,
        r.holdDurationMs,
      ]),
    ).toEqual([
      [0, 2, 100],
      [0, 2, 100],
      [2, 2, 100],
      [2, 2, 100],
      [4, 1, 50],
    ]);
    expect(result.rows.map((r) => r.startMs)).toEqual([0, 50, 100, 150, 200]);
    expect(c.renderSourceFrame).toHaveBeenCalledTimes(2);
    expect(c.renderFrame).toHaveBeenCalledTimes(3);
    expect(result.rows[0].metrics).toBe(result.rows[1].metrics);
    expect(result.rows.map((r) => r.temporalDelta)).toEqual([
      null,
      0,
      2 / 12,
      0,
      2 / 12,
    ]);
    expect(result.seam).toEqual({
      fromFrameId: 4,
      toFrameId: 4,
      meanDelta: 0,
      changedPixels: 0,
    });
    expect(onProgress.mock.calls).toEqual([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
    ]);
    expect(result.heuristic).toContain("not defects");
  });

  it("reports last-to-first motion only for looping actions, never fabricating a jump loop", async () => {
    const c = comparison();
    c.manifest.animations.run!.frames = [4, 8];
    c.manifest.animations.jump!.frames = [4, 8];
    expect((await scanReviewAction(c, "run")).seam).toMatchObject({
      fromFrameId: 8,
      toFrameId: 4,
      changedPixels: 2,
    });
    const jump = await scanReviewAction(c, "jump");
    expect(jump.seam).toBeNull();
    expect(jump.loop).toBe(false);
  });

  it("aborts before rendering and after progress without returning partial success", async () => {
    const c = comparison();
    const before = new AbortController();
    before.abort();
    await expect(
      scanReviewAction(c, "run", { signal: before.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(c.renderFrame).not.toHaveBeenCalled();
    const during = new AbortController();
    await expect(
      scanReviewAction(c, "run", {
        signal: during.signal,
        onProgress: (done) => {
          if (done === 1) during.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(c.renderFrame).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown source poses, oversized schedules and changing canvas size", async () => {
    const c = comparison();
    await expect(scanReviewAction(c, "walk")).rejects.toThrow("missing");
    c.manifest.animations.run!.frames = [999];
    await expect(scanReviewAction(c, "run")).rejects.toThrow("unavailable");
    c.manifest.animations.run!.frames = Array(601).fill(4);
    await expect(scanReviewAction(c, "run")).rejects.toThrow("limit");
    c.manifest.animations.run!.frames = [4];
    c.renderFrame.mockImplementation(() => image(2, 2));
    await expect(scanReviewAction(c, "run")).rejects.toThrow(
      "dimensions changed",
    );
  });
});
