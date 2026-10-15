import type { CharacterConfig } from "./types";

export const SKIN_TONES = [
  "#F5D3AE",
  "#E5AE87",
  "#CB8E67",
  "#A96F50",
  "#805039",
  "#553B32",
];
export const HAIR_COLORS = [
  "#43312E",
  "#8A4935",
  "#C78B48",
  "#E9CF8D",
  "#B6BDC7",
  "#303140",
  "#755879",
  "#527E78",
];
export const CLOTHING_COLORS = [
  "#447F79",
  "#6F9791",
  "#D3A353",
  "#B76866",
  "#63769B",
  "#484F68",
  "#9B7DAD",
  "#E9DFCC",
  "#785542",
  "#343F4B",
];

export const DEFAULT_CONFIG: CharacterConfig = {
  schemaVersion: 1,
  name: "Mira",
  skinTone: "#E5AE87",
  hairstyle: "waves",
  hairColor: "#8A4935",
  upperClothing: "hoodie",
  upperColor: "#447F79",
  lowerClothing: "trousers",
  lowerColor: "#484F68",
  shoeColor: "#E9DFCC",
};

export const PRESETS: {
  id: string;
  label: string;
  description: string;
  config: CharacterConfig;
}[] = [
  {
    id: "mira",
    label: "Mira",
    description: "A curious soul in forest green.",
    config: { ...DEFAULT_CONFIG },
  },
  {
    id: "rowan",
    label: "Rowan",
    description: "Silver hair. A little golden hour.",
    config: {
      ...DEFAULT_CONFIG,
      name: "Rowan",
      skinTone: "#805039",
      hairstyle: "crop",
      hairColor: "#B6BDC7",
      upperClothing: "jacket",
      upperColor: "#D3A353",
      lowerColor: "#343F4B",
      shoeColor: "#785542",
    },
  },
  {
    id: "jun",
    label: "Jun",
    description: "A rose tee and a midnight bob.",
    config: {
      ...DEFAULT_CONFIG,
      name: "Jun",
      skinTone: "#F5D3AE",
      hairstyle: "bob",
      hairColor: "#303140",
      upperClothing: "tee",
      upperColor: "#B76866",
      lowerClothing: "skirt",
      lowerColor: "#63769B",
      shoeColor: "#343F4B",
    },
  },
];

const HAIRSTYLES = ["crop", "bob", "waves", "mohawk"] as const;
const UPPER_CLOTHING = ["tee", "hoodie", "jacket"] as const;
const LOWER_CLOTHING = ["trousers", "shorts", "skirt"] as const;

/** Parse untrusted JSON into the complete, versioned generator input. */
export function parseCharacterConfig(value: unknown): CharacterConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Character configuration must be a JSON object.");
  }
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1)
    throw new Error(
      "Unsupported schemaVersion. Use character configuration version 1.",
    );
  if (
    typeof input.name !== "string" ||
    input.name.trim().length === 0 ||
    input.name.length > 60
  ) {
    throw new Error(
      "name must be a nonempty string of 60 characters or fewer.",
    );
  }
  const color = (field: string): string => {
    const result = input[field];
    if (typeof result !== "string" || !/^#[0-9a-fA-F]{6}$/.test(result)) {
      throw new Error(
        `${field} must be a six-digit hexadecimal color, such as #447F79.`,
      );
    }
    return result.toUpperCase();
  };
  const choice = <T extends string>(
    field: string,
    options: readonly T[],
  ): T => {
    const result = input[field];
    if (typeof result !== "string" || !options.includes(result as T)) {
      throw new Error(`${field} must be one of: ${options.join(", ")}.`);
    }
    return result as T;
  };
  return {
    schemaVersion: 1,
    name: input.name.trim(),
    skinTone: color("skinTone"),
    hairstyle: choice("hairstyle", HAIRSTYLES),
    hairColor: color("hairColor"),
    upperClothing: choice("upperClothing", UPPER_CLOTHING),
    upperColor: color("upperColor"),
    lowerClothing: choice("lowerClothing", LOWER_CLOTHING),
    lowerColor: color("lowerColor"),
    shoeColor: color("shoeColor"),
  };
}

export function configToJson(config: CharacterConfig): string {
  return `${JSON.stringify(parseCharacterConfig(config), null, 2)}\n`;
}
