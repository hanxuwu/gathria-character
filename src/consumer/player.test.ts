import { describe, expect, it, vi } from "vitest";
import type { CharacterPackV2Manifest } from "../core/types";
import {
  animationHasEnded,
  drawCharacterFrame,
  frameAtTime,
  imageForFrame,
  initialCharacterZoom,
  characterZoomChoices,
} from "./player";

const manifest: CharacterPackV2Manifest = {
  schemaVersion: 2,
  format: "gathria-character-pack",
  name: "External fixture",
  generator: "independent-test-author",
  spritesheet: {
    file: "spritesheet.png",
    width: 24,
    height: 16,
    frameWidth: 8,
    frameHeight: 16,
    columns: 3,
    rows: 1,
  },
  frames: [
    { id: 30, x: 0, y: 0, width: 8, height: 16 },
    { id: 10, x: 8, y: 0, width: 8, height: 16 },
    { id: 90, x: 16, y: 0, width: 8, height: 16 },
  ],
  animations: {
    idle: { frames: [90, 30], fps: 2, loop: true },
    walk: { frames: [10, 90, 30], fps: 4, loop: false },
  },
  facing: { native: "right", right: "none", left: "mirror-x" },
  anchor: { x: 2, y: 15, units: "pixels", origin: "top-left" },
  scale: { pixelArt: false, recommended: 0.5, integerOnly: false },
  capabilities: { renderMode: "baked", editableAppearance: false },
  configuration: "character.json",
};

describe("independent metadata playback", () => {
  it("uses declared frame order and FPS, including IDs unrelated to array positions", () => {
    expect(frameAtTime(manifest, "idle", 0).id).toBe(90);
    expect(frameAtTime(manifest, "idle", 499).id).toBe(90);
    expect(frameAtTime(manifest, "idle", 500).id).toBe(30);
    expect(frameAtTime(manifest, "idle", 1000).id).toBe(90);
    expect(frameAtTime(manifest, "walk", 250).id).toBe(90);
  });

  it("holds the final frame for non-looping clips", () => {
    expect(frameAtTime(manifest, "walk", 100_000).id).toBe(30);
    expect(frameAtTime(manifest, "idle", -20).id).toBe(90);
  });

  it("reports a missing run clip rather than substituting walk", () => {
    expect(() => frameAtTime(manifest, "run", 0)).toThrow(
      "Animation run is not available in this pack.",
    );
  });

  it("does not invent jump playback for a pack without it", () => {
    expect(() => frameAtTime(manifest, "jump", 0)).toThrow(
      "Animation jump is not available in this pack.",
    );
    expect(() => animationHasEnded(manifest, "jump", 0)).toThrow(
      "Animation jump is not available in this pack.",
    );
  });

  it("plays jump in declared order, includes repeated holds, then rests on its final frame", () => {
    const jumping: CharacterPackV2Manifest = {
      ...manifest,
      animations: {
        ...manifest.animations,
        jump: { frames: [30, 90, 90, 10], fps: 4, loop: false },
      },
    };
    expect(frameAtTime(jumping, "jump", -1).id).toBe(30);
    expect(frameAtTime(jumping, "jump", 249).id).toBe(30);
    expect(frameAtTime(jumping, "jump", 250).id).toBe(90);
    expect(frameAtTime(jumping, "jump", 749).id).toBe(90);
    expect(frameAtTime(jumping, "jump", 750).id).toBe(10);
    expect(animationHasEnded(jumping, "jump", 999)).toBe(false);
    expect(animationHasEnded(jumping, "jump", 1000)).toBe(true);
    expect(frameAtTime(jumping, "jump", 100_000).id).toBe(10);
    expect(animationHasEnded(jumping, "idle", 100_000)).toBe(false);
    expect(frameAtTime(jumping, "jump", 0).id).toBe(30);
  });

  it("plays optional run clips using their declared order and timing", () => {
    const running: CharacterPackV2Manifest = {
      ...manifest,
      animations: {
        ...manifest.animations,
        run: { frames: [30, 90, 10], fps: 18, loop: true },
      },
    };
    expect(frameAtTime(running, "run", 0).id).toBe(30);
    expect(frameAtTime(running, "run", 55).id).toBe(30);
    expect(frameAtTime(running, "run", 56).id).toBe(90);
    expect(frameAtTime(running, "run", 112).id).toBe(10);
    expect(frameAtTime(running, "run", 167).id).toBe(30);
    expect(frameAtTime(running, "walk", 250).id).toBe(90);
  });

  it("samples the loaded source rectangle and mirrors around an asymmetric anchor", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
    };
    const image = {} as CanvasImageSource;
    drawCharacterFrame(
      context as unknown as CanvasRenderingContext2D,
      image,
      manifest,
      manifest.frames[1],
      "left",
      3,
      { x: 100, y: 200 },
    );
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.translate).toHaveBeenCalledWith(100, 200);
    expect(context.scale).toHaveBeenCalledWith(-3, 3);
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      8,
      0,
      8,
      16,
      -2,
      -15,
      8,
      16,
    );
    expect(context.restore).toHaveBeenCalledOnce();
  });
});

describe("authored pixel playback", () => {
  const pixel: import("../core/types").CharacterPackV4Manifest = {
    ...manifest,
    schemaVersion: 4,
    additionalSheets: [],
    frames: manifest.frames.map((f) => ({ ...f, page: 0 })),
    scale: { pixelArt: true, integerOnly: true, recommended: 3 },
  };
  it("retains crisp sampling, integer attachment placement and mirrored source rectangles", () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
    };
    const image = {} as CanvasImageSource;
    drawCharacterFrame(
      ctx as unknown as CanvasRenderingContext2D,
      image,
      pixel,
      pixel.frames[1],
      "left",
      2,
      { x: 100.4, y: 200.5 },
    );
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(ctx.translate).toHaveBeenCalledWith(100, 201);
    expect(ctx.scale).toHaveBeenCalledWith(-2, 2);
    expect(ctx.drawImage).toHaveBeenCalledWith(
      image,
      8,
      0,
      8,
      16,
      -2,
      -15,
      8,
      16,
    );
    expect(ctx.restore).toHaveBeenCalledOnce();
    ctx.save.mockClear();
    expect(() =>
      drawCharacterFrame(
        ctx as unknown as CanvasRenderingContext2D,
        image,
        pixel,
        pixel.frames[0],
        "right",
        0.5,
        { x: 0, y: 0 },
      ),
    ).toThrow("positive integer");
    expect(ctx.save).not.toHaveBeenCalled();
  });
  it("selects native integer zoom without silently shrinking on narrow displays", () => {
    expect(initialCharacterZoom(pixel, 100, 100)).toBe(3);
    expect(initialCharacterZoom(pixel, 12, 100)).toBe(1);
    expect(initialCharacterZoom(pixel, 2, 4)).toBe(1);
    expect(characterZoomChoices(pixel, 0.5)).toEqual([1, 2, 3, 4]);
    expect(initialCharacterZoom(manifest, 100, 100)).toBe(0.5);
    expect(characterZoomChoices(manifest, 0.75)).toEqual([
      0.25, 0.5, 0.75, 1, 1.5, 2,
    ]);
  });
  it("uses explicit V4 pages and preserves nonuniform authored frame order and one-shots", () => {
    const multi = {
      ...pixel,
      additionalSheets: [
        { ...pixel.spritesheet, file: "spritesheet-1.png" as const },
      ],
      frames: pixel.frames.map((f, i) => ({ ...f, page: i ? 1 : 0 })),
      animations: {
        ...pixel.animations,
        jump: { frames: [90, 30, 30], fps: 6, loop: false },
      },
    };
    const first = {} as HTMLImageElement,
      second = {} as HTMLImageElement;
    const pack = { manifest: multi, image: first, images: [first, second] };
    expect(imageForFrame(pack, frameAtTime(multi, "jump", 0))).toBe(second);
    expect(imageForFrame(pack, frameAtTime(multi, "jump", 200))).toBe(first);
    expect(frameAtTime(multi, "jump", 50_000).id).toBe(30);
    expect(animationHasEnded(multi, "jump", 499)).toBe(false);
    expect(animationHasEnded(multi, "jump", 500)).toBe(true);
    expect(() =>
      imageForFrame({ ...pack, images: [first] }, multi.frames[1]),
    ).toThrow("unavailable");
  });
});

describe("baked source playback", () => {
  const source: import("../core/types").CharacterPackV2Manifest = {
    ...manifest,
    schemaVersion: 2,
    capabilities: { renderMode: "baked", editableAppearance: false },
    scale: { pixelArt: false, integerOnly: false, recommended: 0.5 },
    animations: {
      ...manifest.animations,
      celebrate: { frames: [10, 10, 90, 30], fps: 12, loop: true },
    },
  };
  it("preserves source timing, repeated holds and independent animation namespace", () => {
    expect(frameAtTime(source, "celebrate", 0).id).toBe(10);
    expect(frameAtTime(source, "celebrate", 100).id).toBe(10);
    expect(frameAtTime(source, "celebrate", 200).id).toBe(90);
    expect(frameAtTime(source, "celebrate", 340).id).toBe(10);
    expect(() => frameAtTime(manifest, "celebrate", 0)).toThrow(
      "not available",
    );
    // A comparison uses elapsed time, never forces a different source's frame index.
    const slower = {
      ...source,
      animations: {
        ...source.animations,
        celebrate: { ...source.animations.celebrate!, fps: 6 },
      },
    };
    expect(frameAtTime(slower, "celebrate", 200).id).toBe(10);
  });
  it("draws the unscaled source rectangle with smooth fractional display and the declared anchor", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
    };
    const image = {} as CanvasImageSource;
    drawCharacterFrame(
      context as unknown as CanvasRenderingContext2D,
      image,
      source,
      source.frames[0],
      "left",
      0.5,
      { x: 100, y: 200 },
    );
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.scale).toHaveBeenCalledWith(-0.5, 0.5);
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      0,
      0,
      8,
      16,
      -2,
      -15,
      8,
      16,
    );
  });
});

describe("multipage baked jump playback", () => {
  const source: import("../core/types").CharacterPackV3Manifest = {
    ...manifest,
    schemaVersion: 3,
    capabilities: { renderMode: "baked", editableAppearance: false },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    additionalSheets: [{ ...manifest.spritesheet, file: "spritesheet-1.png" }],
    frames: manifest.frames.map((frame, i) => ({ ...frame, page: i ? 1 : 0 })),
    animations: {
      ...manifest.animations,
      jump: { frames: [30, 90, 10], fps: 4, loop: false },
      celebrate: { frames: [90, 10], fps: 8, loop: true },
    },
  };
  it("selects the exact page across one-shot boundaries without changing order, timing or final hold", () => {
    const first = {} as HTMLImageElement;
    const second = {} as HTMLImageElement;
    const pack = { manifest: source, image: first, images: [first, second] };
    expect(imageForFrame(pack, frameAtTime(source, "jump", 0))).toBe(first);
    expect(imageForFrame(pack, frameAtTime(source, "jump", 250))).toBe(second);
    expect(frameAtTime(source, "jump", 50_000).id).toBe(10);
    expect(animationHasEnded(source, "jump", 749)).toBe(false);
    expect(animationHasEnded(source, "jump", 750)).toBe(true);
    expect(frameAtTime(source, "celebrate", 250).id).toBe(90);
    expect(() =>
      imageForFrame({ ...pack, images: [first] }, source.frames[1]),
    ).toThrow("unavailable");
    expect(imageForFrame({ manifest, image: first }, manifest.frames[1])).toBe(
      first,
    );
  });
  it("keeps fractional display smoothing and the original anchor for additional pages", () => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
    };
    const image = {} as CanvasImageSource;
    drawCharacterFrame(
      context as unknown as CanvasRenderingContext2D,
      image,
      source,
      source.frames[1],
      "left",
      0.5,
      { x: 100, y: 200 },
    );
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.scale).toHaveBeenCalledWith(-0.5, 0.5);
    expect(context.drawImage).toHaveBeenCalledWith(
      image,
      8,
      0,
      8,
      16,
      -2,
      -15,
      8,
      16,
    );
  });
});
