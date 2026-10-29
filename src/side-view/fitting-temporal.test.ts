import { describe, expect, it } from "vitest";
import type { RgbaPng } from "../core/baked-source";
import type { RegisteredFrame, WardrobeAnchor } from "../wardrobe/contract";
import {
  compareFittingTemporal,
  fittingTemporalProfile,
} from "./fitting-temporal";
import { fittingRows, type FittingMetrics } from "./fitting-analysis";
import type { WardrobeProject } from "../wardrobe/contract";

const SIZE = 128;
function blank(): RgbaPng {
  return {
    width: SIZE,
    height: SIZE,
    pixels: new Uint8Array(SIZE * SIZE * 4),
    colorChunks: [],
  };
}
function rect(
  image: RgbaPng,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgba = [100, 130, 170, 255],
) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) image.pixels.set(rgba, (y * SIZE + x) * 4);
}
const anchor = (x: number, y: number): WardrobeAnchor => ({
  x,
  y,
  visibility: "visible",
  confidence: 0.9,
});
function fixture() {
  const source = blank(),
    cloth = blank(),
    mask = blank();
  rect(source, 24, 16, 100, 112);
  rect(cloth, 34, 30, 92, 75);
  rect(mask, 0, 0, SIZE, SIZE, [255, 255, 255, 255]);
  const frame: RegisteredFrame = {
    frameId: 0,
    sourceFrame: 200,
    points: {
      neck: anchor(64, 30),
      waistLeft: anchor(48, 70),
      waistRight: anchor(80, 70),
      nearShoulder: anchor(42, 40),
      farShoulder: anchor(84, 40),
      nearElbow: anchor(35, 58),
      farElbow: anchor(93, 58),
      nearWrist: anchor(38, 75),
      farWrist: anchor(94, 75),
      nearHip: anchor(50, 79),
      farHip: anchor(78, 79),
      nearKnee: anchor(45, 95),
      farKnee: anchor(82, 95),
      nearAnkle: anchor(42, 110),
      farAnkle: anchor(86, 110),
      nearToe: anchor(55, 114),
      farToe: anchor(99, 114),
    },
    protected: [],
  };
  return { source, cloth, mask, frame };
}
const profile = (f: ReturnType<typeof fixture>) =>
  fittingTemporalProfile(f.frame, "top", f.cloth, f.mask, f.source);
function translatedImage(image: RgbaPng, dx: number, dy: number): RgbaPng {
  const result = blank();
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      result.pixels.set(
        image.pixels.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4),
        (ny * SIZE + nx) * 4,
      );
    }
  return result;
}
function rotatedImage(image: RgbaPng): RgbaPng {
  const result = blank();
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      result.pixels.set(
        image.pixels.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4),
        (x * SIZE + SIZE - 1 - y) * 4,
      );
  return result;
}

describe("anatomy-aligned temporal clothing diagnostics", () => {
  it("reports unchanged art as stable and does not mutate pixels or anchors", () => {
    const f = fixture(),
      bytes = new Uint8Array(f.cloth.pixels),
      guides = structuredClone(f.frame);
    const result = compareFittingTemporal(profile(f), profile(f));
    expect(result).toHaveLength(6);
    expect(
      result.every(
        (r) =>
          r.garmentChange === 0 &&
          r.sourceChange === 0 &&
          r.status === "stable",
      ),
    ).toBe(true);
    expect(f.cloth.pixels).toEqual(bytes);
    expect(f.frame).toEqual(guides);
  });
  it("follows whole-body translation instead of flagging motion as cloth drift", () => {
    const a = fixture(),
      b = fixture();
    b.source = translatedImage(a.source, 9, -3);
    b.cloth = translatedImage(a.cloth, 9, -3);
    b.mask = translatedImage(a.mask, 9, -3);
    for (const p of Object.values(b.frame.points)) {
      p.x += 9;
      p.y -= 3;
    }
    const result = compareFittingTemporal(profile(a), profile(b));
    expect(
      result.every((r) => r.garmentChange === 0 && r.sourceChange === 0),
    ).toBe(true);
    expect(result[0].nextBounds.x - result[0].currentBounds.x).toBe(9);
    expect(result[0].nextBounds.y - result[0].currentBounds.y).toBe(-3);
  });
  it("follows a rigid 90-degree pose rotation without changing the original", () => {
    const a = fixture(),
      b = fixture();
    b.source = rotatedImage(a.source);
    b.cloth = rotatedImage(a.cloth);
    b.mask = rotatedImage(a.mask);
    for (const p of Object.values(b.frame.points)) {
      const x = p.x;
      p.x = SIZE - p.y;
      p.y = x;
    }
    const result = compareFittingTemporal(profile(a), profile(b));
    // Subcell samples can land on an exact pixel boundary after rotation;
    // a bounded one-pixel sampling difference must not create a review prompt.
    expect(
      result.every(
        (r) =>
          r.garmentChange < 0.015 &&
          r.sourceChange < 0.015 &&
          r.status !== "review",
      ),
    ).toBe(true);
  });
  it("prioritizes a lost collar edge when the original source stays unchanged", () => {
    const a = fixture(),
      b = fixture();
    rect(b.cloth, 47, 25, 64, 44, [0, 0, 0, 0]);
    const result = compareFittingTemporal(profile(a), profile(b)).find(
      (r) => r.region === "collar",
    )!;
    expect(result.status).toBe("review");
    expect(result.garmentChange).toBeGreaterThan(0.3);
    expect(result.sourceChange).toBe(0);
    expect(result.currentBounds).toEqual(result.nextBounds);
  });
  it("detects a local edge swap even when total painted area is unchanged", () => {
    const a = fixture(),
      b = fixture();
    a.cloth = blank();
    b.cloth = blank();
    rect(a.cloth, 47, 30, 64, 44);
    rect(b.cloth, 64, 30, 81, 44);
    expect(a.cloth.pixels.reduce((n, v) => n + v, 0)).toBe(
      b.cloth.pixels.reduce((n, v) => n + v, 0),
    );
    const result = compareFittingTemporal(profile(a), profile(b)).find(
      (r) => r.region === "collar",
    )!;
    expect(result.status).toBe("review");
    expect(result.sourceChange).toBe(0);
  });
  it("checks the actual loop seam while leaving a one-shot ending unpaired", () => {
    const a = fixture(),
      b = fixture();
    rect(b.cloth, 47, 25, 64, 44, [0, 0, 0, 0]);
    const metrics = new Map<number, FittingMetrics>(
      [7, 8].map((frameId) => [
        frameId,
        {
          frameId,
          sourceFrame: frameId + 200,
          ownedPixels: 100,
          paintedPixels: 100,
          smallIslands: 0,
          protectedOwnedPixels: 0,
          unownedPaintPixels: 0,
          bounds: null,
        },
      ]),
    );
    const project = {
      archive: {
        manifest: {
          animations: {
            walk: { frames: [7, 8], loop: true, fps: 24 },
            jump: { frames: [7, 8], loop: false, fps: 24 },
          },
        },
      },
    } as unknown as WardrobeProject;
    const rows = fittingRows(
      project,
      metrics,
      new Map([
        [7, profile(a)],
        [8, profile(b)],
      ]),
    );
    const seam = rows.find((r) => r.action === "walk" && r.frameId === 8)!;
    expect(seam).toMatchObject({
      isLoopSeam: true,
      nextFrameId: 7,
      nextAreaChange: 0,
    });
    expect(seam.prompts).toContain("领口邻帧轮廓变化，请复核");
    expect(
      rows.find((r) => r.action === "jump" && r.frameId === 8),
    ).toMatchObject({
      isLoopSeam: false,
      nextFrameId: null,
      temporalChanges: [],
      prompts: [],
    });
  });
  it("retains raw observations but lowers priority when the source changes with cloth", () => {
    const a = fixture(),
      b = fixture();
    rect(b.cloth, 47, 25, 64, 44, [0, 0, 0, 0]);
    rect(b.source, 47, 25, 64, 44, [0, 0, 0, 0]);
    const result = compareFittingTemporal(profile(a), profile(b)).find(
      (r) => r.region === "collar",
    )!;
    expect(result.status).toBe("source-motion");
    expect(result.garmentChange).toBeGreaterThan(0.3);
    expect(result.sourceChange).toBeGreaterThan(0.3);
    expect(result.excessChange).toBe(0);
  });
  it("does not treat unused or heavily clipped windows as passing visual checks", () => {
    const a = fixture();
    a.cloth = blank();
    expect(
      compareFittingTemporal(profile(a), profile(a)).every(
        (r) => r.status === "insufficient",
      ),
    ).toBe(true);
    const b = fixture();
    b.frame.points.neck.x = 0;
    b.frame.points.waistLeft.x = -16;
    b.frame.points.waistRight.x = 16;
    expect(
      compareFittingTemporal(profile(b), profile(b)).find(
        (r) => r.region === "collar",
      )?.status,
    ).toBe("insufficient");
  });
  it("uses only painted ownership and ignores invisible RGB noise", () => {
    const a = fixture(),
      b = fixture();
    rect(a.mask, 47, 25, 64, 44, [0, 0, 0, 0]);
    rect(b.mask, 47, 25, 64, 44, [0, 0, 0, 0]);
    rect(b.cloth, 47, 25, 64, 44, [0, 0, 0, 0]);
    rect(a.source, 47, 25, 64, 44, [0, 0, 0, 0]);
    rect(b.source, 47, 25, 64, 44, [255, 50, 250, 0]);
    const result = compareFittingTemporal(profile(a), profile(b));
    expect(
      result.every((r) => r.garmentChange === 0 && r.sourceChange === 0),
    ).toBe(true);
  });
  it("records estimated guides and avoids fabricating missing or degenerate ones", () => {
    const a = fixture();
    a.frame.points.nearShoulder.visibility = "occluded";
    expect(
      compareFittingTemporal(profile(a), profile(a)).find(
        (r) => r.region === "nearSleeve",
      )?.estimatedAnchors,
    ).toBe(true);
    a.frame.points = {} as RegisteredFrame["points"];
    expect(profile(a)).toEqual([]);
    const b = fixture();
    b.frame.points.waistLeft = b.frame.points.waistRight = b.frame.points.neck;
    expect(profile(b)).toEqual([]);
  });
  it("only profiles relevant slots and rejects incompatible raster dimensions", () => {
    const a = fixture();
    expect(
      fittingTemporalProfile(a.frame, "bottom", a.cloth, a.mask, a.source).map(
        (r) => r.region,
      ),
    ).toEqual(["hem"]);
    expect(
      fittingTemporalProfile(a.frame, "shoes", a.cloth, a.mask, a.source),
    ).toEqual([]);
    expect(() =>
      fittingTemporalProfile(
        a.frame,
        "top",
        a.cloth,
        { ...a.mask, width: 127 },
        a.source,
      ),
    ).toThrow(/尺寸/);
  });
});
