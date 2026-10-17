import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPACT_RUNNING_DEFAULT_CONFIG,
  COMPACT_RUNNING_PRESETS,
  configToJson,
  enableCompactRunning,
  enableRunning,
  HARMONIZED_DEFAULT_CONFIG,
  parseCharacterConfig,
  POLISHED_DEFAULT_CONFIG,
  RUNNING_DEFAULT_CONFIG,
  upgradeToHarmonizedArt,
} from "./config";
import { generateCharacter } from "./generator";
import { generateMotionV1 } from "./generator-motion-v1";
import {
  generateMotionV2,
  MOTION_V2_GENERATOR_ID,
} from "./generator-motion-v2";
import { validateManifest } from "./pack";
import type { ArtV6CharacterConfig } from "./types";

const hash = (bytes: Uint8ClampedArray | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const originalEvidence = JSON.parse(
  readFileSync(
    new URL("../../docs/running/evidence-index.json", import.meta.url),
    "utf8",
  ),
) as { revisionFiles: Record<string, string> };
// RGBA hashes decoded from the delivered e09251e wedding PNGs in docs/running/.
const originalPixels = {
  dress: "ecb6fa63efae326762084ed1e92eb1412d61637b2a9f4a458957d3b4873785ae",
  suit: "d86707c26629ee0b982337ec0aa7d441f8cb8bb57d98b9fa830f99146ef3a7fc",
};

function savedRunning(who: "dress" | "suit"): ArtV6CharacterConfig {
  const config = parseCharacterConfig(
    JSON.parse(
      readFileSync(
        new URL(
          `../../docs/running/${who}-joyful/character.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  if (
    config.schemaVersion !== 2 ||
    config.artworkVersion !== 6 ||
    config.motionVersion !== 1
  )
    throw new Error("Original running fixture must remain motion version 1.");
  return config;
}

describe("explicit compact running version", () => {
  it("preserves the originally delivered motion and V6 source modules", () => {
    for (const [file, expected] of Object.entries(
      originalEvidence.revisionFiles,
    ))
      expect(
        hash(readFileSync(new URL("../../" + file, import.meta.url))),
        file,
      ).toBe(expected);
  });

  it("uses a new default while leaving existing opt-in APIs and saved motion untouched", () => {
    expect(COMPACT_RUNNING_DEFAULT_CONFIG).toEqual({
      ...POLISHED_DEFAULT_CONFIG,
      motionVersion: 2,
    });
    expect(
      COMPACT_RUNNING_PRESETS.every(({ config }) => config.motionVersion === 2),
    ).toBe(true);
    expect(RUNNING_DEFAULT_CONFIG.motionVersion).toBe(1);
    expect(enableRunning(POLISHED_DEFAULT_CONFIG).motionVersion).toBe(1);
    const original = Object.freeze(savedRunning("suit"));
    const copy = enableCompactRunning(original);
    expect(copy).toEqual({ ...original, motionVersion: 2 });
    expect(copy).not.toBe(original);
    expect(JSON.parse(configToJson(original))).toEqual(original);
    expect(JSON.parse(configToJson(copy))).toEqual(copy);
    expect(original.motionVersion).toBe(1);
  });

  it("round-trips preview choices for both motion versions and validates the new discriminator", () => {
    for (const motionVersion of [1, 2] as const) {
      const config = {
        ...POLISHED_DEFAULT_CONFIG,
        motionVersion,
        preview: { animation: "run" as const, facing: "left" as const },
      };
      expect(parseCharacterConfig(JSON.parse(configToJson(config)))).toEqual(
        config,
      );
    }
    for (const input of [
      { ...COMPACT_RUNNING_DEFAULT_CONFIG, motionVersion: 4 },
      { ...COMPACT_RUNNING_DEFAULT_CONFIG, motionVersion: "2" },
      { ...HARMONIZED_DEFAULT_CONFIG, motionVersion: 2 },
      {
        ...COMPACT_RUNNING_DEFAULT_CONFIG,
        preview: { animation: "jump", facing: "left" },
      },
    ])
      expect(() => parseCharacterConfig(input)).toThrow(
        /motionVersion|preview/,
      );
  });

  it("requires explicit refinement and does not leak or silently downgrade movement versions", () => {
    const compact = enableCompactRunning(savedRunning("dress"));
    expect(() => enableRunning(compact)).toThrow(
      "cannot be silently downgraded",
    );
    const appearance: ArtV6CharacterConfig = { ...compact };
    delete appearance.motionVersion;
    delete appearance.preview;
    const artCopy = upgradeToHarmonizedArt(compact);
    expect(artCopy).toEqual(upgradeToHarmonizedArt(appearance));
    expect(artCopy).not.toHaveProperty("motionVersion");
    expect(artCopy).not.toHaveProperty("preview");
    expect(() =>
      enableCompactRunning(
        HARMONIZED_DEFAULT_CONFIG as unknown as ArtV6CharacterConfig,
      ),
    ).toThrow("explicit V6");
  });

  it.each(["dress", "suit"] as const)(
    "keeps %s motion1 pixels exact and changes only the explicit motion2 run rows",
    (who) => {
      const saved = savedRunning(who);
      const legacy = generateCharacter(saved);
      expect(hash(legacy.pixels), "delivered motion1 pixels").toBe(
        originalPixels[who],
      );
      const config = enableCompactRunning(saved);
      const compact = generateCharacter(config);
      const reopened = generateCharacter(
        parseCharacterConfig(JSON.parse(configToJson(config))),
      );
      const alternatePreview = generateCharacter({
        ...config,
        preview: { animation: "walk", facing: "left" },
      });
      expect(hash(compact.pixels)).toBe(hash(reopened.pixels));
      expect(hash(compact.pixels)).toBe(hash(alternatePreview.pixels));
      expect(compact.manifest).toEqual(reopened.manifest);
      expect([compact.width, compact.height]).toEqual([1536, 1024]);
      const preservedLength = 1536 * 512 * 4;
      expect(hash(compact.pixels.subarray(0, preservedLength))).toBe(
        hash(legacy.pixels.subarray(0, preservedLength)),
      );
      expect(hash(compact.pixels.subarray(preservedLength))).not.toBe(
        hash(legacy.pixels.subarray(preservedLength)),
      );
      expect(compact.manifest).toEqual({
        ...legacy.manifest,
        generator: MOTION_V2_GENERATOR_ID,
      });
      expect(validateManifest(compact.manifest)).toEqual(compact.manifest);
      expect(compact.manifest.animations.run).toEqual({
        frames: Array.from({ length: 12 }, (_, i) => 12 + i),
        fps: 18,
        loop: true,
      });
    },
  );

  it("does not dispatch one explicit motion version through another renderer", () => {
    expect(() => generateMotionV2(RUNNING_DEFAULT_CONFIG)).toThrow(
      "explicit motionVersion 2",
    );
    expect(() => generateMotionV2(POLISHED_DEFAULT_CONFIG)).toThrow(
      "explicit motionVersion 2",
    );
    expect(() => generateMotionV1(COMPACT_RUNNING_DEFAULT_CONFIG)).toThrow(
      "explicit motionVersion 1",
    );
  });
});
