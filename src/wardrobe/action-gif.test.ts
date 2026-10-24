import { expect, it } from "vitest";
import { parseGIF, decompressFrames } from "gifuct-js";
import {
  exportWardrobeActionGif,
  compactGifFrame,
  gifDelays,
  GIF_MATTE,
} from "./action-gif";
import type { WardrobeCompositor } from "./compositor";
import { GIF_COMPARISON_GAP, GIF_COMPARISON_LABEL } from "./gif-comparison";
const source = (loop = true) =>
  ({
    manifest: {
      spritesheet: { frameWidth: 4, frameHeight: 2 },
      animations: { run: { frames: [7, 19, 7], fps: 24, loop } },
    },
    renderFrame: (id: number) => ({
      width: 4,
      height: 2,
      colorChunks: [],
      pixels: new Uint8Array(
        Array.from({ length: 8 }, (_, i) =>
          i % 4 < 2 ? [id === 7 ? 240 : 30, 50, 30, 255] : [30, 50, 240, 128],
        ).flat(),
      ),
    }),
  }) as unknown as Pick<WardrobeCompositor, "manifest" | "renderFrame">;
const read = (bytes: Uint8Array) => parseGIF(new Uint8Array(bytes).buffer);
it("exports decodable exact action order with cumulative centisecond timing and direction", async () => {
  const model = source(),
    calls: number[] = [];
  const render = model.renderFrame;
  model.renderFrame = (id) => {
    calls.push(id);
    return render(id);
  };
  const bytes = await exportWardrobeActionGif(model, "run", "right");
  expect(calls).toEqual([7, 19, 7]);
  const parsed = read(bytes),
    frames = decompressFrames(parsed, true);
  expect(frames).toHaveLength(3);
  expect(frames.map((f) => f.delay)).toEqual([40, 40, 50]);
  expect(frames[0].dims).toMatchObject({ width: 2, height: 1 });
  expect(frames[0].patch).toEqual(frames[2].patch);
  expect(frames[0].patch).not.toEqual(frames[1].patch);
  expect(new TextDecoder().decode(bytes)).toContain("NETSCAPE2.0");
  const left = decompressFrames(
    read(await exportWardrobeActionGif(model, "run", "left")),
    true,
  );
  for (let i = 0; i < 3; i++) {
    expect(Array.from(left[i].patch.slice(0, 4))).toEqual(
      Array.from(frames[i].patch.slice(4, 8)),
    );
    expect(Array.from(left[i].patch.slice(4, 8))).toEqual(
      Array.from(frames[i].patch.slice(0, 4)),
    );
  }
  expect(await exportWardrobeActionGif(model, "run", "right")).toEqual(bytes);
  expect(
    new TextDecoder().decode(
      await exportWardrobeActionGif(source(false), "run", "right"),
    ),
  ).not.toContain("NETSCAPE2.0");
});
it("composites fractional alpha on the declared matte and cancels before rendering", async () => {
  const transparent = {
    width: 1,
    height: 1,
    pixels: new Uint8Array([255, 0, 0, 0]),
    colorChunks: [],
  };
  expect(Array.from(compactGifFrame(transparent, "right").pixels)).toEqual([
    ...GIF_MATTE,
    255,
  ]);
  const controller = new AbortController();
  controller.abort();
  await expect(
    exportWardrobeActionGif(source(), "run", "right", {
      signal: controller.signal,
    }),
  ).rejects.toThrow(/canceled/);
  const during = new AbortController();
  await expect(
    exportWardrobeActionGif(source(), "run", "right", {
      signal: during.signal,
      onProgress: (done) => {
        if (done === 1) during.abort();
      },
    }),
  ).rejects.toThrow(/canceled/);
  expect(gifDelays(24, 24).reduce((a, b) => a + b)).toBe(1000);
  expect(() => gifDelays(10, 60)).toThrow(/50 FPS/);
});

it("pairs source and dressed frames in fixed panels while mirroring only their bodies", async () => {
  const calls: number[] = [];
  const renderer = {
    ...source(false),
    renderSourceFrame: (id: number) => {
      calls.push(id);
      const f = source().renderFrame(id);
      // An unrelated source color makes swapped or duplicated panels observable.
      for (let i = 0; i < f.pixels.length; i += 4) f.pixels[i + 1] = 210;
      return f;
    },
  };
  const rightBytes = await exportWardrobeActionGif(renderer, "run", "right", {
    comparison: true,
  });
  expect(calls).toEqual([7, 19, 7]);
  expect(new TextDecoder().decode(rightBytes)).not.toContain("NETSCAPE2.0");
  const right = decompressFrames(read(rightBytes), true);
  const left = decompressFrames(
    read(
      await exportWardrobeActionGif(renderer, "run", "left", {
        comparison: true,
      }),
    ),
    true,
  );
  const w = 4 + GIF_COMPARISON_GAP;
  expect(right.map((f) => f.delay)).toEqual([40, 40, 50]);
  expect(right[0].dims).toMatchObject({
    width: w,
    height: 1 + GIF_COMPARISON_LABEL,
  });
  for (let i = 0; i < 3; i++) {
    expect(left[i].patch.slice(0, w * GIF_COMPARISON_LABEL * 4)).toEqual(
      right[i].patch.slice(0, w * GIF_COMPARISON_LABEL * 4),
    );
    for (const offset of [0, 2 + GIF_COMPARISON_GAP]) {
      const at = (GIF_COMPARISON_LABEL * w + offset) * 4;
      expect(left[i].patch.slice(at, at + 4)).toEqual(
        right[i].patch.slice(at + 4, at + 8),
      );
      expect(left[i].patch.slice(at + 4, at + 8)).toEqual(
        right[i].patch.slice(at, at + 4),
      );
    }
  }
  const at = GIF_COMPARISON_LABEL * w * 4;
  expect(right[0].patch.slice(at, at + 8)).not.toEqual(
    right[0].patch.slice(
      at + (2 + GIF_COMPARISON_GAP) * 4,
      at + (4 + GIF_COMPARISON_GAP) * 4,
    ),
  );
  expect(right[0].patch).toEqual(right[2].patch);
});

it("rejects missing or misregistered comparison sources and includes both panels in its memory bound", async () => {
  await expect(
    exportWardrobeActionGif(source(), "run", "right", { comparison: true }),
  ).rejects.toThrow(/unavailable/);
  const model = {
    ...source(),
    renderSourceFrame: () => ({
      width: 1,
      height: 1,
      pixels: new Uint8Array(4),
      colorChunks: [],
    }),
  };
  await expect(
    exportWardrobeActionGif(model, "run", "right", { comparison: true }),
  ).rejects.toThrow(/identical dimensions/);
  const large = {
    ...source(),
    renderSourceFrame: () => {
      throw Error("must not render");
    },
  };
  large.manifest.spritesheet.frameWidth = 8000;
  large.manifest.spritesheet.frameHeight = 4000;
  await expect(
    exportWardrobeActionGif(large, "run", "right", { comparison: true }),
  ).rejects.toThrow(/too large/);
});
