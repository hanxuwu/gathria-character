import type {
  ArtV2CharacterConfig,
  CharacterConfig,
  FaceVariant,
  LegacyCharacterConfig,
} from "./types";

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

export const LEGACY_DEFAULT_CONFIG: LegacyCharacterConfig = {
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

export const LEGACY_PRESETS: {
  id: string;
  label: string;
  description: string;
  config: LegacyCharacterConfig;
}[] = [
  {
    id: "mira",
    label: "Mira",
    description: "A curious soul in forest green.",
    config: { ...LEGACY_DEFAULT_CONFIG },
  },
  {
    id: "rowan",
    label: "Rowan",
    description: "Silver hair. A little golden hour.",
    config: {
      ...LEGACY_DEFAULT_CONFIG,
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
      ...LEGACY_DEFAULT_CONFIG,
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

export const DEFAULT_CONFIG: ArtV2CharacterConfig = {
  ...LEGACY_DEFAULT_CONFIG,
  schemaVersion: 2,
  artworkVersion: 2,
  faceVariant: "heart",
};

export const PRESETS: {
  id: string;
  label: string;
  description: string;
  config: ArtV2CharacterConfig;
}[] = LEGACY_PRESETS.map((preset, index) => ({
  ...preset,
  config: {
    ...preset.config,
    schemaVersion: 2,
    artworkVersion: 2,
    faceVariant: (["heart", "oval", "round"] as const)[index],
  },
}));

type OutfitAppearance = Pick<
  ArtV2CharacterConfig,
  "upperClothing" | "upperColor" | "lowerClothing" | "lowerColor" | "shoeColor"
>;

/** Outfit starting points; each garment and color remains freely editable. */
export const OUTFIT_PRESETS: {
  id: string;
  label: string;
  appearance: OutfitAppearance;
}[] = [
  {
    id: "casual",
    label: "Polished casual",
    appearance: {
      upperClothing: "jacket",
      upperColor: "#6F9791",
      lowerClothing: "trousers",
      lowerColor: "#484F68",
      shoeColor: "#E9DFCC",
    },
  },
  {
    id: "wedding-suit",
    label: "Wedding suit",
    appearance: {
      upperClothing: "suit",
      upperColor: "#343F4B",
      lowerClothing: "trousers",
      lowerColor: "#343F4B",
      shoeColor: "#292D35",
    },
  },
  {
    id: "wedding-dress",
    label: "Wedding dress",
    appearance: {
      upperClothing: "bodice",
      upperColor: "#F2E9D8",
      lowerClothing: "dress",
      lowerColor: "#F2E9D8",
      shoeColor: "#E9DFCC",
    },
  },
];

const HAIRSTYLES = ["crop", "bob", "waves", "mohawk"] as const;
const UPPER_CLOTHING = ["tee", "hoodie", "jacket"] as const;
const LOWER_CLOTHING = ["trousers", "shorts", "skirt"] as const;
const V2_UPPER_CLOTHING = [...UPPER_CLOTHING, "suit", "bodice"] as const;
const V2_LOWER_CLOTHING = [...LOWER_CLOTHING, "dress"] as const;
const FACE_VARIANTS = ["heart", "oval", "round"] as const;

/** Parse untrusted JSON into the complete, versioned generator input. */
export function parseCharacterConfig(value: unknown): CharacterConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Character configuration must be a JSON object.");
  }
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2)
    throw new Error(
      "Unsupported schemaVersion. Use character configuration version 1 or 2.",
    );
  if (
    input.schemaVersion === 1 &&
    ("artworkVersion" in input || "faceVariant" in input)
  ) {
    throw new Error(
      "Version 1 configurations cannot contain artworkVersion or faceVariant. Create an explicit Art V2 copy to use these options.",
    );
  }
  if (input.schemaVersion === 2 && input.artworkVersion !== 2) {
    throw new Error("Version 2 configurations require artworkVersion 2.");
  }
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
  const appearance = {
    name: input.name.trim(),
    skinTone: color("skinTone"),
    hairstyle: choice("hairstyle", HAIRSTYLES),
    hairColor: color("hairColor"),
    upperColor: color("upperColor"),
    lowerColor: color("lowerColor"),
    shoeColor: color("shoeColor"),
  };
  if (input.schemaVersion === 1) {
    return {
      schemaVersion: 1,
      ...appearance,
      upperClothing: choice("upperClothing", UPPER_CLOTHING),
      lowerClothing: choice("lowerClothing", LOWER_CLOTHING),
    };
  }
  return {
    schemaVersion: 2,
    artworkVersion: 2,
    ...appearance,
    faceVariant: choice("faceVariant", FACE_VARIANTS),
    upperClothing: choice("upperClothing", V2_UPPER_CLOTHING),
    lowerClothing: choice("lowerClothing", V2_LOWER_CLOTHING),
  };
}

/** Explicit opt-in only: loading, editing, and saving never invoke migration. */
export function upgradeToArtV2(
  config: CharacterConfig,
  faceVariant: FaceVariant = "heart",
): ArtV2CharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion === 2) return parsed;
  return {
    ...parsed,
    schemaVersion: 2,
    artworkVersion: 2,
    faceVariant,
  };
}

export function configToJson(config: CharacterConfig): string {
  return `${JSON.stringify(parseCharacterConfig(config), null, 2)}\n`;
}
