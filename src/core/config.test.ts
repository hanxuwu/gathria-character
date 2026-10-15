import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  configToJson,
  DEFAULT_CONFIG,
  LEGACY_DEFAULT_CONFIG,
  LEGACY_PRESETS,
  OUTFIT_PRESETS,
  parseCharacterConfig,
  PRESETS,
  upgradeToArtV2,
} from "./config";

describe("versioned character configuration", () => {
  it("round-trips every preset into a fresh, complete configuration", () => {
    for (const { config } of PRESETS) {
      const result = parseCharacterConfig(JSON.parse(configToJson(config)));
      expect(result).toEqual(config);
      expect(result).not.toBe(config);
    }
  });

  it("normalizes hexadecimal case and surrounding name whitespace", () => {
    expect(
      parseCharacterConfig({
        ...DEFAULT_CONFIG,
        name: "  Mira  ",
        hairColor: "#abcdef",
      }),
    ).toEqual({ ...DEFAULT_CONFIG, hairColor: "#ABCDEF" });
  });

  it.each([null, [], "Mira", 1])("rejects a non-object input: %j", (input) => {
    expect(() => parseCharacterConfig(input)).toThrow("JSON object");
  });

  it.each([
    ["schemaVersion", 3, "version 1 or 2"],
    ["schemaVersion", "1", "version 1 or 2"],
    ["artworkVersion", undefined, "require artworkVersion 2"],
    ["artworkVersion", 1, "require artworkVersion 2"],
    ["artworkVersion", "2", "require artworkVersion 2"],
    ["faceVariant", undefined, "faceVariant must be one of"],
    ["faceVariant", "square", "faceVariant must be one of"],
    ["name", "", "nonempty"],
    ["name", "   ", "nonempty"],
    ["name", "a".repeat(61), "60 characters"],
    ["hairstyle", "ponytail", "hairstyle must be one of"],
    ["upperClothing", "cape", "upperClothing must be one of"],
    ["lowerClothing", "jeans", "lowerClothing must be one of"],
    ["skinTone", "#fff", "skinTone must be a six-digit"],
    ["hairColor", "red", "hairColor must be a six-digit"],
    ["upperColor", "#GG1234", "upperColor must be a six-digit"],
    ["lowerColor", "#12345678", "lowerColor must be a six-digit"],
    ["shoeColor", undefined, "shoeColor must be a six-digit"],
  ])(
    "rejects invalid %s with an actionable field error",
    (key, value, message) => {
      expect(() =>
        parseCharacterConfig({ ...DEFAULT_CONFIG, [key]: value }),
      ).toThrow(message as string);
    },
  );

  it("does not carry untrusted extra properties into the export", () => {
    const value = JSON.parse(
      `{"__proto__":{"isAdmin":true},"extra":"ignored"}`,
    );
    expect(parseCharacterConfig({ ...DEFAULT_CONFIG, ...value })).toEqual(
      DEFAULT_CONFIG,
    );
    expect(configToJson({ ...DEFAULT_CONFIG, ...value })).not.toContain(
      "isAdmin",
    );
  });

  it("keeps every shipped V1 sample editable without changing its design or version", () => {
    for (const { id, config } of LEGACY_PRESETS) {
      const shipped = JSON.parse(
        readFileSync(
          new URL(`../../public/samples/${id}/character.json`, import.meta.url),
          "utf8",
        ),
      );
      expect(config).toEqual(shipped);
      const reopened = parseCharacterConfig(shipped);
      expect(reopened).toEqual(shipped);
      expect(JSON.parse(configToJson(reopened))).toEqual(shipped);
      const edited = parseCharacterConfig({
        ...reopened,
        hairColor: "#755879",
      });
      expect(edited.schemaVersion).toBe(1);
      expect(edited).not.toHaveProperty("artworkVersion");
      expect(edited).not.toHaveProperty("faceVariant");
    }
    expect(LEGACY_DEFAULT_CONFIG).toEqual(LEGACY_PRESETS[0].config);
  });

  it.each([
    ["artworkVersion", 2, "cannot contain artworkVersion or faceVariant"],
    ["faceVariant", "heart", "cannot contain artworkVersion or faceVariant"],
    ["upperClothing", "suit", "upperClothing must be one of"],
    ["upperClothing", "bodice", "upperClothing must be one of"],
    ["lowerClothing", "dress", "lowerClothing must be one of"],
  ])("rejects the V1/V2 hybrid field %s = %j", (key, value, message) => {
    expect(() =>
      parseCharacterConfig({ ...LEGACY_DEFAULT_CONFIG, [key]: value }),
    ).toThrow(message);
  });

  it("creates an explicit Art V2 copy without mutating the original saved appearance", () => {
    const original = Object.freeze({ ...LEGACY_DEFAULT_CONFIG });
    const upgraded = upgradeToArtV2(original, "oval");
    expect(upgraded).toEqual({
      ...original,
      schemaVersion: 2,
      artworkVersion: 2,
      faceVariant: "oval",
    });
    expect(upgradeToArtV2(original).faceVariant).toBe("heart");
    expect(original).toEqual(LEGACY_DEFAULT_CONFIG);
    expect(JSON.parse(configToJson(upgraded))).toEqual(upgraded);
  });

  it("leaves an existing V2 face choice intact when creating a fresh copy", () => {
    const original = { ...DEFAULT_CONFIG, faceVariant: "round" as const };
    const copy = upgradeToArtV2(original, "oval");
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
  });

  it.each(["heart", "oval", "round"])(
    "accepts the %s face with each focused outfit starting point",
    (faceVariant) => {
      for (const { appearance } of OUTFIT_PRESETS) {
        const input = { ...DEFAULT_CONFIG, faceVariant, ...appearance };
        expect(parseCharacterConfig(input)).toEqual(input);
      }
    },
  );

  it("allows formal garments to be combined freely instead of tying them to a preset", () => {
    const combinations = [
      { upperClothing: "suit", lowerClothing: "dress" },
      { upperClothing: "bodice", lowerClothing: "shorts" },
      { upperClothing: "hoodie", lowerClothing: "dress" },
    ];
    for (const clothing of combinations) {
      const input = { ...DEFAULT_CONFIG, ...clothing };
      expect(parseCharacterConfig(input)).toEqual(input);
    }
  });
});
