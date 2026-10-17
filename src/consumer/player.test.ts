import { describe, expect, it, vi } from "vitest";
import type { CharacterPackManifest } from "../core/types";
import { animationHasEnded, drawCharacterFrame, frameAtTime } from "./player";
import {
  GATHRIA_COMPATIBILITY,
  toProposedGathriaCharacter,
} from "../compat/gathria";

const manifest: CharacterPackManifest = {
  schemaVersion: 1,
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
  scale: { pixelArt: true, recommended: 3, integerOnly: true },
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

  it("does not invent jump playback for a legacy pack", () => {
    expect(() => frameAtTime(manifest, "jump", 0)).toThrow(
      "Animation jump is not available in this pack.",
    );
    expect(() => animationHasEnded(manifest, "jump", 0)).toThrow(
      "Animation jump is not available in this pack.",
    );
  });

  it("plays jump in declared order, includes repeated holds, then rests on its final frame", () => {
    const jumping: CharacterPackManifest = {
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
    const running: CharacterPackManifest = {
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
    expect(context.imageSmoothingEnabled).toBe(false);
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

  it("keeps proposed compatibility mapping independent of editor dimensions", () => {
    const mapped = toProposedGathriaCharacter(manifest, "/custom.png");
    expect(mapped.texture).toBe("/custom.png");
    expect(mapped.origin).toEqual({ x: 0.25, y: 0.9375 });
    expect(mapped.clips.walk).toEqual({
      frameIds: [10, 90, 30],
      framesPerSecond: 4,
      repeat: false,
    });
    expect(mapped.atlas).toEqual(manifest.frames);
    expect(mapped.atlas).not.toBe(manifest.frames);
  });

  it("preserves optional jump metadata in the unverified scene adapter", () => {
    expect(toProposedGathriaCharacter(manifest).clips).not.toHaveProperty(
      "jump",
    );
    const jumping: CharacterPackManifest = {
      ...manifest,
      animations: {
        ...manifest.animations,
        jump: { frames: [30, 90, 10], fps: 12, loop: false },
      },
    };
    const mapped = toProposedGathriaCharacter(jumping);
    expect(mapped.clips.jump).toEqual({
      frameIds: [30, 90, 10],
      framesPerSecond: 12,
      repeat: false,
    });
    jumping.animations.jump!.frames[0] = 10;
    expect(mapped.clips.jump?.frameIds).toEqual([30, 90, 10]);
    expect(GATHRIA_COMPATIBILITY.status).toBe("UNVERIFIED");
  });
});
