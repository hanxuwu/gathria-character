import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPACT_RUNNING_DEFAULT_CONFIG,
  CORRECTED_RUNNING_DEFAULT_CONFIG,
  CORRECTED_RUNNING_PRESETS,
  HARMONIZED_DEFAULT_CONFIG,
  POLISHED_DEFAULT_CONFIG,
  RUNNING_DEFAULT_CONFIG,
  configToJson,
  enableCompactRunning,
  enableCorrectedRunning,
  enableRunning,
  parseCharacterConfig,
  upgradeToHarmonizedArt,
} from "./config";
import {
  CORRECTED_EVERYDAY_EXAMPLES,
  EVERYDAY_EXAMPLES,
} from "./everyday-presets";
import { generateCharacter } from "./generator";
import { generateMotionV1 } from "./generator-motion-v1";
import { generateMotionV2 } from "./generator-motion-v2";
import {
  generateMotionV3,
  MOTION_V3_GENERATOR_ID,
} from "./generator-motion-v3";
import { validateManifest } from "./pack";
import type { ArtV6CharacterConfig } from "./types";

const hash = (data: Uint8ClampedArray | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const preservedSource = JSON.parse(
  readFileSync(
    new URL("../../docs/running-v2/evidence-index.json", import.meta.url),
    "utf8",
  ),
) as { revisionFiles: Record<string, string> };
// Decoded RGBA from the delivered 87c8d4a everyday PNGs, not newly rendered expected values.
const deliveredPixels = {
  "denim-daytrip":
    "65521c38d2c7ce4bb9ca8972f72b0fbfb4bc937f0e2976e5dee1e08084431296",
  "coral-afternoon":
    "3dc2f1d7d9d332d31cd36cd236cf829920c168150a764409c8954abbb3469c99",
  "sage-weekend":
    "fa0b5b23955155df6641df740055d6198f7958502c1f06ebdefaa7ae32a24d49",
  "ochre-traveler":
    "28175de3b414ba51d9cd0a7cd8087ee4c49ecc563822875479a1d5fbd2aa1ee2",
};

describe("explicit run-only limb correction", () => {
  it("preserves original V6 and motion 1/2 source bytes", () => {
    for (const [file, expected] of Object.entries(
      preservedSource.revisionFiles,
    ))
      expect(
        hash(readFileSync(new URL("../../" + file, import.meta.url))),
        file,
      ).toBe(expected);
  });

  it("creates independent motion3 copies while existing defaults and saved settings remain unchanged", () => {
    expect(CORRECTED_RUNNING_DEFAULT_CONFIG).toEqual({
      ...POLISHED_DEFAULT_CONFIG,
      motionVersion: 3,
    });
    expect(
      CORRECTED_RUNNING_PRESETS.every(
        ({ config }) => config.motionVersion === 3,
      ),
    ).toBe(true);
    expect(RUNNING_DEFAULT_CONFIG.motionVersion).toBe(1);
    expect(COMPACT_RUNNING_DEFAULT_CONFIG.motionVersion).toBe(2);
    for (const motionVersion of [1, 2] as const) {
      const source = Object.freeze({
        ...COMPACT_RUNNING_DEFAULT_CONFIG,
        motionVersion,
        preview: { animation: "run" as const, facing: "left" as const },
      });
      const copy = enableCorrectedRunning(source);
      expect(copy).toEqual({ ...source, motionVersion: 3 });
      expect(copy).not.toBe(source);
      expect(parseCharacterConfig(JSON.parse(configToJson(source)))).toEqual(
        source,
      );
      expect(parseCharacterConfig(JSON.parse(configToJson(copy)))).toEqual(
        copy,
      );
    }
    for (const [index, original] of EVERYDAY_EXAMPLES.entries()) {
      expect(original.config.motionVersion).toBe(2);
      expect(CORRECTED_EVERYDAY_EXAMPLES[index]).toEqual({
        ...original,
        config: { ...original.config, motionVersion: 3 },
      });
    }
  });

  it("rejects implicit downgrade, invalid version scope, and mismatched renderer dispatch", () => {
    const corrected = enableCorrectedRunning(COMPACT_RUNNING_DEFAULT_CONFIG);
    expect(() => enableRunning(corrected)).toThrow(
      "cannot be silently downgraded",
    );
    expect(() => enableCompactRunning(corrected)).toThrow(
      "cannot be silently downgraded",
    );
    expect(() =>
      enableCorrectedRunning(
        HARMONIZED_DEFAULT_CONFIG as unknown as ArtV6CharacterConfig,
      ),
    ).toThrow("explicit V6");
    for (const motionVersion of [0, 4, "3", undefined])
      expect(() =>
        parseCharacterConfig({ ...corrected, motionVersion }),
      ).toThrow("motionVersion");
    expect(() => generateMotionV3(COMPACT_RUNNING_DEFAULT_CONFIG)).toThrow(
      "explicit motionVersion 3",
    );
    expect(() => generateMotionV3(POLISHED_DEFAULT_CONFIG)).toThrow(
      "explicit motionVersion 3",
    );
    expect(() => generateMotionV1(corrected)).toThrow(
      "explicit motionVersion 1",
    );
    expect(() => generateMotionV2(corrected)).toThrow(
      "explicit motionVersion 2",
    );
    const art = upgradeToHarmonizedArt(corrected);
    expect(art).not.toHaveProperty("motionVersion");
    expect(art).not.toHaveProperty("preview");
  });

  it.each(EVERYDAY_EXAMPLES)(
    "keeps delivered $id pixels intact and changes only explicit new run rows",
    ({ id, config }) => {
      const original = generateCharacter(config);
      expect(hash(original.pixels), "saved motion2 pixels").toBe(
        deliveredPixels[id],
      );
      const corrected = enableCorrectedRunning(config);
      const result = generateCharacter(corrected);
      const repeated = generateCharacter(
        parseCharacterConfig(
          JSON.parse(
            configToJson({
              ...corrected,
              preview: { animation: "run", facing: "left" },
            }),
          ),
        ),
      );
      expect(hash(result.pixels)).toBe(hash(repeated.pixels));
      const oldRows = 1536 * 512 * 4;
      expect(
        hash(result.pixels.subarray(0, oldRows)),
        "original idle/walk rows",
      ).toBe(hash(original.pixels.subarray(0, oldRows)));
      expect(
        hash(result.pixels.subarray(oldRows)),
        "corrected run differs",
      ).not.toBe(hash(original.pixels.subarray(oldRows)));
      expect(result.manifest).toEqual({
        ...original.manifest,
        generator: MOTION_V3_GENERATOR_ID,
      });
      expect(validateManifest(result.manifest)).toEqual(result.manifest);
      expect(result.manifest.animations.run).toEqual({
        frames: Array.from({ length: 12 }, (_, i) => 12 + i),
        fps: 18,
        loop: true,
      });
    },
  );
});
