import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  configToJson,
  enableRunning,
  HARMONIZED_DEFAULT_CONFIG,
  LEGACY_DEFAULT_CONFIG,
  OUTFIT_PRESETS,
  parseCharacterConfig,
  POLISHED_DEFAULT_CONFIG,
  POLISHED_PRESETS,
  RUNNING_DEFAULT_CONFIG,
  RUNNING_PRESETS,
  upgradeToArtV2,
  upgradeToCohesiveArt,
  upgradeToDetailedArt,
  upgradeToExpressiveArt,
  upgradeToHarmonizedArt,
  upgradeToPolishedArt,
} from "./config";
import { generateCharacter } from "./generator";
import { generateArtV6 } from "./generator-v6";
import {
  generateMotionV1,
  MOTION_V1_GENERATOR_ID,
} from "./generator-motion-v1";
import { validateManifest } from "./pack";
import { toProposedGathriaCharacter } from "../compat/gathria";
import type { ArtV6CharacterConfig, CharacterPackManifest } from "./types";

const digest = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");

describe("explicit V6 running configuration", () => {
  it("keeps historical V6 presets and saved files unchanged until explicitly enabled", () => {
    for (const { config } of POLISHED_PRESETS) {
      expect(parseCharacterConfig(JSON.parse(configToJson(config)))).toEqual(
        config,
      );
      expect(config).not.toHaveProperty("motionVersion");
      expect(config).not.toHaveProperty("preview");
      const original = Object.freeze({ ...config });
      expect(enableRunning(original)).toEqual({ ...config, motionVersion: 1 });
      expect(original).toEqual(config);
    }
    expect(RUNNING_DEFAULT_CONFIG).toEqual({
      ...POLISHED_DEFAULT_CONFIG,
      motionVersion: 1,
    });
    expect(
      RUNNING_PRESETS.every((preset) => preset.config.motionVersion === 1),
    ).toBe(true);
  });

  it("round-trips saved run/facing choices while dropping unrelated input fields", () => {
    const input = {
      ...RUNNING_DEFAULT_CONFIG,
      preview: { animation: "run" as const, facing: "left" as const },
    };
    expect(JSON.parse(configToJson(input))).toEqual(input);
    const copy = parseCharacterConfig({
      ...input,
      preview: { ...input.preview, unsafe: true },
    });
    expect(copy).toEqual(input);
    expect(copy).not.toBe(input);
    if (copy.schemaVersion === 2 && copy.artworkVersion === 6)
      expect(copy.preview).not.toBe(input.preview);
  });

  it.each([
    { ...POLISHED_DEFAULT_CONFIG, motionVersion: 3 },
    { ...POLISHED_DEFAULT_CONFIG, motionVersion: "1" },
    { ...POLISHED_DEFAULT_CONFIG, motionVersion: undefined },
    { ...LEGACY_DEFAULT_CONFIG, motionVersion: 1 },
    { ...HARMONIZED_DEFAULT_CONFIG, motionVersion: 1 },
    {
      ...POLISHED_DEFAULT_CONFIG,
      preview: { animation: "run", facing: "right" },
    },
    { ...RUNNING_DEFAULT_CONFIG, preview: null },
    { ...RUNNING_DEFAULT_CONFIG, preview: [] },
    {
      ...RUNNING_DEFAULT_CONFIG,
      preview: { animation: "jump", facing: "right" },
    },
    { ...RUNNING_DEFAULT_CONFIG, preview: { animation: "run", facing: "up" } },
    { ...RUNNING_DEFAULT_CONFIG, preview: { animation: "run" } },
  ])("rejects malformed or unsupported motion settings %#", (input) => {
    expect(() => parseCharacterConfig(input)).toThrow(/motionVersion|preview/);
  });

  it("does not leak running metadata into copies using another artwork version", () => {
    const input = {
      ...RUNNING_DEFAULT_CONFIG,
      preview: { animation: "run" as const, facing: "left" as const },
    };
    const v7 = upgradeToHarmonizedArt(input);
    expect(v7).toEqual(upgradeToHarmonizedArt(POLISHED_DEFAULT_CONFIG));
    expect(v7).not.toHaveProperty("motionVersion");
    expect(v7).not.toHaveProperty("preview");
    expect(parseCharacterConfig(v7)).toEqual(v7);
    expect(upgradeToPolishedArt(input)).toEqual(input);
    for (const convert of [
      upgradeToArtV2,
      upgradeToDetailedArt,
      upgradeToExpressiveArt,
      upgradeToCohesiveArt,
    ])
      expect(() => convert(input)).toThrow(/downgraded/);
    expect(() =>
      enableRunning(
        HARMONIZED_DEFAULT_CONFIG as unknown as ArtV6CharacterConfig,
      ),
    ).toThrow("explicit V6");
  });
});

describe("running atlas and portable contract", () => {
  it.each(["bride", "groom"] as const)(
    "appends %s running while preserving both V6 atlas rows exactly",
    (identity) => {
      const config: ArtV6CharacterConfig = {
        ...POLISHED_DEFAULT_CONFIG,
        ...OUTFIT_PRESETS[identity === "bride" ? 2 : 1].appearance,
        hairstyle: identity === "bride" ? "waves" : "crop",
      };
      const original = generateArtV6(config);
      const running = generateCharacter(enableRunning(config));
      expect([original.width, original.height]).toEqual([1536, 512]);
      expect([running.width, running.height]).toEqual([1536, 1024]);
      expect(digest(running.pixels.subarray(0, original.pixels.length))).toBe(
        digest(original.pixels),
      );
      expect(running.manifest.frames.slice(0, 12)).toEqual(
        original.manifest.frames,
      );
      expect(running.manifest.animations.idle).toEqual(
        original.manifest.animations.idle,
      );
      expect(running.manifest.animations.walk).toEqual(
        original.manifest.animations.walk,
      );
      expect(running.manifest.anchor).toEqual(original.manifest.anchor);
      expect(running.manifest.generator).toBe(MOTION_V1_GENERATOR_ID);
      expect(running.manifest.animations.run).toEqual({
        frames: Array.from({ length: 12 }, (_, i) => 12 + i),
        fps: 18,
        loop: true,
      });
      expect(running.manifest.frames.slice(12)).toEqual(
        Array.from({ length: 12 }, (_, i) => ({
          id: i + 12,
          x: (i % 8) * 192,
          y: (2 + Math.floor(i / 8)) * 256,
          width: 192,
          height: 256,
        })),
      );
      expect(validateManifest(running.manifest)).toEqual(running.manifest);
      const alternatePreview = generateCharacter({
        ...enableRunning(config),
        preview: { animation: "run", facing: "left" },
      });
      expect(digest(alternatePreview.pixels)).toBe(digest(running.pixels));
      expect(alternatePreview.manifest).toEqual(running.manifest);
      expect(generateCharacter(config).manifest).toEqual(original.manifest);
    },
  );

  it("rejects calling the motion renderer without explicit opt-in", () => {
    expect(() => generateMotionV1(POLISHED_DEFAULT_CONFIG)).toThrow(
      "explicit motionVersion 1",
    );
  });

  const fixture = (): CharacterPackManifest => ({
    schemaVersion: 1,
    format: "gathria-character-pack",
    name: "Fixture",
    generator: "fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: 3,
      height: 1,
      frameWidth: 1,
      frameHeight: 1,
      columns: 3,
      rows: 1,
    },
    frames: [7, 9, 42].map((id, x) => ({ id, x, y: 0, width: 1, height: 1 })),
    animations: {
      idle: { frames: [7], fps: 4, loop: true },
      walk: { frames: [9], fps: 10, loop: true },
    },
    facing: { native: "right", right: "none", left: "mirror-x" },
    anchor: { x: 0.5, y: 1, units: "pixels", origin: "top-left" },
    scale: { pixelArt: true, recommended: 1, integerOnly: true },
    configuration: "character.json",
  });

  it("keeps old manifests run-free and copies optional run metadata by explicit frame IDs", () => {
    const old = fixture();
    expect(validateManifest(old)).toEqual(old);
    expect(toProposedGathriaCharacter(old).clips).not.toHaveProperty("run");
    const input = fixture();
    input.animations.run = { frames: [42, 9, 42], fps: 18, loop: true };
    const parsed = validateManifest(input);
    expect(parsed).toEqual(input);
    const proposed = toProposedGathriaCharacter(parsed);
    expect(proposed.clips.run).toEqual({
      frameIds: [42, 9, 42],
      framesPerSecond: 18,
      repeat: true,
    });
    input.animations.run.frames.push(7);
    expect(parsed.animations.run?.frames).toEqual([42, 9, 42]);
  });

  it.each([
    undefined,
    null,
    [],
    { frames: [], fps: 18, loop: true },
    { frames: [999], fps: 18, loop: true },
    { frames: [42], fps: 0, loop: true },
    { frames: [42], fps: Infinity, loop: true },
    { frames: [42], fps: 18, loop: "true" },
  ])(
    "rejects malformed optional run metadata %# instead of silently dropping it",
    (run) => {
      const input = fixture();
      expect(() =>
        validateManifest({
          ...input,
          animations: { ...input.animations, run },
        }),
      ).toThrow("animations.run");
    },
  );
});
