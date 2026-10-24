import { describe, expect, it } from "vitest";
import { decodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import type { LookComparison } from "./look-comparison";
import { compactGifFrame } from "./action-gif";
import {
  buildReviewContactSheets,
  clampReviewRegion,
  planReviewContactSheets,
  REVIEW_SHEET_GAP,
  REVIEW_SHEET_HEADER,
  REVIEW_SHEET_ROW_LABEL,
} from "./review-sheets";

function fixture(frames = [10, 10, 20, 20, 20, 10], fps = 20) {
  const width = 32,
    height = 24;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels.set(
        [x * 7, y * 8, 120, (x + y) % 2 ? 255 : 128],
        (y * width + x) * 4,
      );
  const image: RgbaPng = { width, height, pixels, colorChunks: [] };
  let count = 0;
  const comparison: LookComparison = {
    manifest: {
      spritesheet: { frameWidth: width, frameHeight: height },
      anchor: { x: 16, y: 23 },
      frames: [{ id: 10 }, { id: 20 }],
      animations: { run: { frames, fps, loop: true } },
    } as LookComparison["manifest"],
    renderFrame: () => {
      count++;
      return image;
    },
    renderSourceFrame: () => {
      count++;
      return image;
    },
  };
  return { comparison, image, count: () => count };
}

describe("review contact sheet planning", () => {
  it("coalesces only neighboring holds and preserves original elapsed time", () => {
    const { comparison } = fixture();
    const plan = planReviewContactSheets(comparison, "run");
    expect(plan.pages.flat()).toEqual([
      { position: 0, endPosition: 1, frameId: 10, startMs: 0, holdMs: 100 },
      { position: 2, endPosition: 4, frameId: 20, startMs: 100, holdMs: 150 },
      { position: 5, endPosition: 5, frameId: 10, startMs: 250, holdMs: 50 },
    ]);
    expect(plan.durationMs).toBe(300);
    expect(plan.loop).toBe(true);
  });
  it("paginates bounded sheets without changing action positions", () => {
    const { comparison } = fixture([10, 20, 10, 20, 10, 20]);
    const plan = planReviewContactSheets(comparison, "run");
    expect(plan.pages.map((p) => p.length)).toEqual([4, 2]);
    expect(plan.pages[1][0].position).toBe(4);
    comparison.manifest.spritesheet.frameWidth = 2048;
    comparison.manifest.spritesheet.frameHeight = 2048;
    expect(
      planReviewContactSheets(comparison, "run").pages.every(
        (p) => p.length === 1,
      ),
    ).toBe(true);
  });
  it("rejects invalid, missing and unbounded animation content before rendering", () => {
    const f = fixture([99]);
    expect(() => planReviewContactSheets(f.comparison, "run")).toThrow(
      "missing source pose",
    );
    expect(() => planReviewContactSheets(f.comparison, "jump")).toThrow(
      "limits",
    );
    f.comparison.manifest.animations.run!.frames = Array.from(
      { length: 129 },
      (_, i) => (i % 2 ? 10 : 20),
    );
    expect(() => planReviewContactSheets(f.comparison, "run")).toThrow(
      "too many pose changes",
    );
    f.comparison.manifest.animations.run!.fps = NaN;
    expect(() => planReviewContactSheets(f.comparison, "run")).toThrow(
      "limits",
    );
    expect(f.count()).toBe(0);
  });
  it("clamps native crop endpoints, retaining common alignment", () => {
    expect(
      clampReviewRegion(100, 80, { x: -5.2, y: 70.5, width: 20, height: 40 }),
    ).toEqual({ x: 0, y: 70, width: 15, height: 10 });
    expect(() =>
      clampReviewRegion(100, 80, { x: 101, y: 1, width: 1, height: 1 }),
    ).toThrow("outside");
    expect(() =>
      clampReviewRegion(100, 80, { x: 1, y: 1, width: Infinity, height: 1 }),
    ).toThrow("valid");
    expect(() => clampReviewRegion(3000, 3000)).toThrow("budget");
  });
  it("rejects an excessive aggregate raster workload before rendering any pose", async () => {
    const f = fixture(Array.from({ length: 32 }, (_, i) => (i % 2 ? 10 : 20)));
    f.comparison.manifest.spritesheet.frameWidth = 2048;
    f.comparison.manifest.spritesheet.frameHeight = 2048;
    await expect(
      buildReviewContactSheets(f.comparison, "run", "right"),
    ).rejects.toThrow("total review-sheet pixel budget");
    expect(f.count()).toBe(0);
  });
});

describe("actual review-sheet PNG export", () => {
  it("decodes and keeps both aligned image panels equal to half-native output", async () => {
    const f = fixture([10]);
    const original = f.image.pixels.slice();
    const sheets = await buildReviewContactSheets(f.comparison, "run", "right");
    expect(sheets).toHaveLength(1);
    const result = decodeSourceRgbaPng(sheets[0].png),
      expected = compactGifFrame(f.image, "right");
    expect(result.width).toBe(expected.width * 2 + REVIEW_SHEET_GAP);
    const top = REVIEW_SHEET_HEADER + REVIEW_SHEET_ROW_LABEL;
    for (const panel of [0, 1])
      for (let y = 0; y < expected.height; y++) {
        const offset =
          ((top + y) * result.width +
            panel * (expected.width + REVIEW_SHEET_GAP)) *
          4;
        expect(
          result.pixels.slice(offset, offset + expected.width * 4),
        ).toEqual(
          expected.pixels.slice(
            y * expected.width * 4,
            (y + 1) * expected.width * 4,
          ),
        );
      }
    expect(f.image.pixels).toEqual(original);
    expect(f.count()).toBe(2);
  });
  it("mirrors only pictures, preserving labels, panel order and timing", async () => {
    const f = fixture([10]);
    const a = decodeSourceRgbaPng(
      (await buildReviewContactSheets(f.comparison, "run", "right"))[0].png,
    );
    const b = decodeSourceRgbaPng(
      (await buildReviewContactSheets(f.comparison, "run", "left"))[0].png,
    );
    const expected = compactGifFrame(f.image, "left");
    const top = REVIEW_SHEET_HEADER + REVIEW_SHEET_ROW_LABEL;
    // The top direction label changes; row pose/time labels do not.
    expect(
      b.pixels.slice(REVIEW_SHEET_HEADER * b.width * 4, top * b.width * 4),
    ).toEqual(
      a.pixels.slice(REVIEW_SHEET_HEADER * a.width * 4, top * a.width * 4),
    );
    for (let y = 0; y < expected.height; y++) {
      const offset = (top + y) * b.width * 4;
      expect(b.pixels.slice(offset, offset + expected.width * 4)).toEqual(
        expected.pixels.slice(
          y * expected.width * 4,
          (y + 1) * expected.width * 4,
        ),
      );
    }
  });
  it("aborts before rendering and between pages without accepting partial output", async () => {
    const f = fixture([10, 20, 10, 20, 10]),
      controller = new AbortController();
    controller.abort();
    await expect(
      buildReviewContactSheets(f.comparison, "run", "right", {
        signal: controller.signal,
      }),
    ).rejects.toThrow("canceled");
    expect(f.count()).toBe(0);
    const second = new AbortController();
    await expect(
      buildReviewContactSheets(f.comparison, "run", "right", {
        signal: second.signal,
        onProgress: (done) => {
          if (done === 1) second.abort();
        },
      }),
    ).rejects.toThrow("canceled");
    expect(f.count()).toBe(8);
  });
  it("rejects source dimensions changed during a long-running export", async () => {
    const f = fixture([10]);
    f.comparison.renderFrame = () => ({ ...f.image, width: 31 });
    await expect(
      buildReviewContactSheets(f.comparison, "run", "right"),
    ).rejects.toThrow("dimensions changed");
  });
});
