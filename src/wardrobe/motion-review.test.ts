import { describe, expect, it, vi } from "vitest";
import type { RgbaPng } from "../core/baked-source";
import type { LookComparison } from "./look-comparison";
import {
  analyzeMotionEdge,
  planMotionEdges,
  scanMotionAction,
} from "./motion-review";
import { mirrorMotionFrame } from "./motion-bundle";

const picture = (color = 0, alpha = 255): RgbaPng => ({
  width: 2,
  height: 1,
  pixels: new Uint8Array([color, 0, 0, alpha, 0, color, 0, alpha]),
  colorChunks: [],
});
function fixture(loop = true): LookComparison {
  return {
    manifest: {
      frames: [{ id: 5 }, { id: 9 }],
      spritesheet: { frameWidth: 2, frameHeight: 1 },
      animations: {
        run: { frames: [5, 5, 9], fps: 20, loop },
        jump: { frames: [5, 9, 5], fps: 20, loop: false },
      },
    } as LookComparison["manifest"],
    renderFrame: vi.fn((id) => picture(id * 10)),
    renderSourceFrame: vi.fn((id) => picture(id * 5)),
  };
}
describe("native temporal motion diagnostics", () => {
  it("retains repeated positions and closes only declared loops", () => {
    const c = fixture();
    expect(
      planMotionEdges(c.manifest, "run").map((e) => [
        e.fromPosition,
        e.toPosition,
        e.hold,
        e.loopClosure,
      ]),
    ).toEqual([
      [0, 1, true, false],
      [1, 2, false, false],
      [2, 0, false, true],
    ]);
    expect(
      planMotionEdges(c.manifest, "jump").map((e) => [
        e.fromFrameId,
        e.toFrameId,
        e.loopClosure,
      ]),
    ).toEqual([
      [5, 9, false],
      [9, 5, false],
    ]);
  });
  it("keeps single-position loops but has no transition for single-position one-shots", async () => {
    const c = fixture();
    c.manifest.animations.run!.frames = [5];
    expect((await scanMotionAction(c, "run")).edges).toHaveLength(1);
    c.manifest.animations.run!.loop = false;
    expect((await scanMotionAction(c, "run")).edges).toHaveLength(0);
  });
  it("cancels identical motion and a constant opaque color offset without mutating artwork", () => {
    const a = picture(10),
      b = picture(90),
      before = new Uint8Array(a.pixels);
    expect(analyzeMotionEdge(a, b, a, b).residual).toEqual({
      changedPixels: 0,
      meanDelta: 0,
      maxDelta: 0,
    });
    expect(
      analyzeMotionEdge(a, b, picture(20), picture(100)).residual.meanDelta,
    ).toBeCloseTo(0);
    expect(a.pixels).toEqual(before);
  });
  it("distinguishes reversed motion even when both transition magnitudes match", () => {
    const a = picture(0),
      b = picture(255);
    const m = analyzeMotionEdge(a, b, b, a);
    expect(m.reference.meanDelta).toBe(m.current.meanDelta);
    expect(m.residual).toEqual({ changedPixels: 2, meanDelta: 1, maxDelta: 1 });
  });
  it("ignores invisible RGB but catches alpha and localized introduced motion", () => {
    expect(
      analyzeMotionEdge(
        picture(10, 0),
        picture(250, 0),
        picture(220, 0),
        picture(2, 0),
      ).residual.changedPixels,
    ).toBe(0);
    expect(
      analyzeMotionEdge(
        picture(0, 0),
        picture(0, 0),
        picture(0, 0),
        picture(0, 255),
      ).residual,
    ).toEqual({ changedPixels: 2, meanDelta: 0.5, maxDelta: 0.5 });
  });
  it("keeps metrics invariant under mirroring and never modifies source pixels", () => {
    const inputs = [
      picture(30),
      picture(90),
      picture(70),
      picture(200),
    ] as const;
    const mirrored = inputs.map((i) => mirrorMotionFrame(i, "left"));
    expect(analyzeMotionEdge(...inputs)).toEqual(
      analyzeMotionEdge(mirrored[0], mirrored[1], mirrored[2], mirrored[3]),
    );
    expect(
      mirrorMotionFrame(mirrorMotionFrame(inputs[0], "left"), "left"),
    ).toEqual(inputs[0]);
  });
  it("reuses holds and first frames while retaining source timing and scalar results", async () => {
    const c = fixture();
    const result = await scanMotionAction(c, "run");
    expect(result).toMatchObject({ durationMs: 150, fps: 20, frameCount: 3 });
    expect(result.edges[0].residual.changedPixels).toBe(0);
    expect(result.edges[2].loopClosure).toBe(true);
    expect(c.renderFrame).toHaveBeenCalledTimes(2);
    expect(c.renderSourceFrame).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("pixels");
  });
  it("rejects malformed dimensions, unavailable frames and invalid timing before scans", async () => {
    const c = fixture();
    c.manifest.animations.run!.fps = NaN;
    await expect(scanMotionAction(c, "run")).rejects.toThrow(/timing/);
    c.manifest.animations.run!.fps = 20;
    c.manifest.animations.run!.frames = [99];
    await expect(scanMotionAction(c, "run")).rejects.toThrow(/unavailable/);
    expect(c.renderFrame).not.toHaveBeenCalled();
    expect(() =>
      analyzeMotionEdge(picture(), picture(), picture(), {
        ...picture(),
        pixels: new Uint8Array(0),
      }),
    ).toThrow(/RGBA/);
    await expect(
      scanMotionAction(fixture(), "run", { threshold: Infinity }),
    ).rejects.toThrow(/threshold/);
  });
  it("aborts before rendering or after a partial edge without a success result", async () => {
    const c = fixture(),
      controller = new AbortController();
    controller.abort();
    await expect(
      scanMotionAction(c, "run", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(c.renderFrame).not.toHaveBeenCalled();
    const next = new AbortController();
    await expect(
      scanMotionAction(c, "run", {
        signal: next.signal,
        onProgress: (n) => {
          if (n === 1) next.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects later broken RGBA rather than publishing a partial scan", async () => {
    const c = fixture();
    c.renderFrame = (id) =>
      id === 9 ? { ...picture(), pixels: new Uint8Array(1) } : picture();
    await expect(scanMotionAction(c, "run")).rejects.toThrow(/RGBA/);
  });
});
