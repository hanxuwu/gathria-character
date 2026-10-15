import { describe, expect, it } from "vitest";
import {
  configToJson,
  DEFAULT_CONFIG,
  parseCharacterConfig,
  PRESETS,
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
    ["schemaVersion", 2, "version 1"],
    ["schemaVersion", "1", "version 1"],
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
});
