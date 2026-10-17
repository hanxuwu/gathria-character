import type {
  ArtV2CharacterConfig,
  ArtV3CharacterConfig,
  ArtV4CharacterConfig,
  ArtV5CharacterConfig,
  ArtV6CharacterConfig,
  ArtV7CharacterConfig,
  CharacterConfig,
  CompactRunningCharacterConfig,
  CorrectedRunningCharacterConfig,
  FaceVariant,
  LegacyCharacterConfig,
  RunningCharacterConfig,
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

export const ART_V2_DEFAULT_CONFIG: ArtV2CharacterConfig = {
  ...LEGACY_DEFAULT_CONFIG,
  schemaVersion: 2,
  artworkVersion: 2,
  faceVariant: "heart",
};

export const ART_V2_PRESETS: {
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

export const ART_V3_DEFAULT_CONFIG: ArtV3CharacterConfig = {
  ...ART_V2_DEFAULT_CONFIG,
  artworkVersion: 3,
};

export const ART_V3_PRESETS: {
  id: string;
  label: string;
  description: string;
  config: ArtV3CharacterConfig;
}[] = ART_V2_PRESETS.map((preset) => ({
  ...preset,
  config: { ...preset.config, artworkVersion: 3 },
}));

export const DEFAULT_CONFIG: ArtV4CharacterConfig = {
  ...ART_V3_DEFAULT_CONFIG,
  artworkVersion: 4,
  expression: "gentle",
  hairAccessory: "none",
};
export const PRESETS = ART_V3_PRESETS.map((preset) => ({
  ...preset,
  config: {
    ...preset.config,
    artworkVersion: 4,
    expression: "gentle",
    hairAccessory: "none",
  } as ArtV4CharacterConfig,
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
  if (
    "motionVersion" in input &&
    (input.schemaVersion !== 2 ||
      input.artworkVersion !== 6 ||
      (input.motionVersion !== 1 &&
        input.motionVersion !== 2 &&
        input.motionVersion !== 3))
  ) {
    throw new Error(
      "motionVersion must be 1, 2 or 3 and requires artworkVersion 6.",
    );
  }
  if (
    "preview" in input &&
    input.motionVersion !== 1 &&
    input.motionVersion !== 2 &&
    input.motionVersion !== 3
  ) {
    throw new Error("preview requires explicit motionVersion 1, 2 or 3.");
  }
  let preview: RunningCharacterConfig["preview"];
  if ("preview" in input) {
    if (
      !input.preview ||
      typeof input.preview !== "object" ||
      Array.isArray(input.preview)
    )
      throw new Error("preview must contain a valid animation and facing.");
    const candidate = input.preview as Record<string, unknown>;
    if (
      candidate.animation !== "idle" &&
      candidate.animation !== "walk" &&
      candidate.animation !== "run"
    )
      throw new Error("preview.animation must be idle, walk or run.");
    if (candidate.facing !== "left" && candidate.facing !== "right")
      throw new Error("preview.facing must be left or right.");
    preview = { animation: candidate.animation, facing: candidate.facing };
  }
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2)
    throw new Error(
      "Unsupported schemaVersion. Use character configuration version 1 or 2.",
    );
  if (
    input.schemaVersion === 1 &&
    ("artworkVersion" in input || "faceVariant" in input)
  ) {
    throw new Error(
      "Version 1 configurations cannot contain artworkVersion or faceVariant. Create an explicit detailed copy to use these options.",
    );
  }
  if (
    input.schemaVersion === 2 &&
    input.artworkVersion !== 2 &&
    input.artworkVersion !== 3 &&
    input.artworkVersion !== 4 &&
    input.artworkVersion !== 5 &&
    input.artworkVersion !== 6 &&
    input.artworkVersion !== 7
  ) {
    throw new Error(
      "Version 2 configurations require artworkVersion 2, 3, 4, 5, 6 or 7.",
    );
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
  const modernAppearance = {
    ...appearance,
    faceVariant: choice("faceVariant", FACE_VARIANTS),
    upperClothing: choice("upperClothing", V2_UPPER_CLOTHING),
    lowerClothing: choice("lowerClothing", V2_LOWER_CLOTHING),
  };
  if (
    input.artworkVersion === 5 ||
    input.artworkVersion === 6 ||
    input.artworkVersion === 7
  ) {
    const refined = {
      schemaVersion: 2 as const,
      ...modernAppearance,
      expression: choice("expression", [
        "neutral",
        "gentle",
        "joyful",
      ] as const),
      hairAccessory: choice("hairAccessory", ["none", "flowers"] as const),
    };
    return input.artworkVersion === 5
      ? { ...refined, artworkVersion: 5 }
      : input.artworkVersion === 6
        ? {
            ...refined,
            artworkVersion: 6,
            ...(input.motionVersion === 1 ||
            input.motionVersion === 2 ||
            input.motionVersion === 3
              ? { motionVersion: input.motionVersion }
              : {}),
            ...(preview ? { preview } : {}),
          }
        : { ...refined, artworkVersion: 7 };
  }
  if (input.artworkVersion === 4)
    return {
      schemaVersion: 2,
      artworkVersion: 4,
      ...modernAppearance,
      expression: choice("expression", ["gentle", "joyful"] as const),
      hairAccessory: choice("hairAccessory", ["none", "flowers"] as const),
    };
  return input.artworkVersion === 2
    ? { schemaVersion: 2, artworkVersion: 2, ...modernAppearance }
    : { schemaVersion: 2, artworkVersion: 3, ...modernAppearance };
}

/** Explicit opt-in only: loading, editing, and saving never invoke migration. */
export function upgradeToArtV2(
  config: CharacterConfig,
  faceVariant: FaceVariant = "heart",
): ArtV2CharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion === 2) {
    if (parsed.artworkVersion >= 3) {
      throw new Error(
        "Detailed artwork cannot be silently downgraded to Art V2.",
      );
    }
    return parsed as ArtV2CharacterConfig;
  }
  return {
    ...parsed,
    schemaVersion: 2,
    artworkVersion: 2,
    faceVariant,
  };
}

/** Create a detailed copy explicitly; saved V1/V2 artwork never migrates on load. */
export function upgradeToDetailedArt(
  config: CharacterConfig,
  faceVariant: FaceVariant = "heart",
): ArtV3CharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion === 2 && parsed.artworkVersion >= 4)
    throw new Error(
      "Expressive artwork cannot be silently downgraded to Art V3.",
    );
  return {
    ...parsed,
    schemaVersion: 2,
    artworkVersion: 3,
    faceVariant: parsed.schemaVersion === 1 ? faceVariant : parsed.faceVariant,
  };
}

export function configToJson(config: CharacterConfig): string {
  return `${JSON.stringify(parseCharacterConfig(config), null, 2)}\n`;
}

/** Explicit opt-in: all delivered artwork versions retain their renderer. */
export function upgradeToExpressiveArt(
  config: CharacterConfig,
  faceVariant: FaceVariant = "heart",
): ArtV4CharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion === 2 && parsed.artworkVersion >= 5)
    throw new Error(
      "Cohesive artwork cannot be silently downgraded to Art V4.",
    );
  if (parsed.schemaVersion === 2 && parsed.artworkVersion === 4) return parsed;
  return {
    ...parsed,
    schemaVersion: 2,
    artworkVersion: 4,
    faceVariant: parsed.schemaVersion === 1 ? faceVariant : parsed.faceVariant,
    expression: "gentle",
    hairAccessory: "none",
  };
}

/** V5 is opt-in for saved work. V1–V4 presets and rendering remain frozen. */
export function upgradeToCohesiveArt(
  config: CharacterConfig,
  faceVariant: FaceVariant = "heart",
): ArtV5CharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion === 2 && parsed.artworkVersion >= 6)
    throw new Error("Polished artwork cannot be silently downgraded to V5.");
  return {
    ...parsed,
    schemaVersion: 2,
    artworkVersion: 5,
    faceVariant: parsed.schemaVersion === 1 ? faceVariant : parsed.faceVariant,
    expression: "expression" in parsed ? parsed.expression : "gentle",
    hairAccessory: "hairAccessory" in parsed ? parsed.hairAccessory : "none",
  };
}
export const COHESIVE_DEFAULT_CONFIG = upgradeToCohesiveArt(DEFAULT_CONFIG);
export const COHESIVE_PRESETS = PRESETS.map((p) => ({
  ...p,
  config: upgradeToCohesiveArt(p.config),
}));

/** New art is an explicit copy; already delivered V5 work also stays unchanged. */
export function upgradeToPolishedArt(
  config: CharacterConfig,
  faceVariant: FaceVariant = "heart",
): ArtV6CharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion === 2 && parsed.artworkVersion >= 7)
    throw new Error("V7 artwork cannot be silently downgraded to V6.");
  return {
    ...parsed,
    schemaVersion: 2,
    artworkVersion: 6,
    faceVariant: parsed.schemaVersion === 1 ? faceVariant : parsed.faceVariant,
    expression: "expression" in parsed ? parsed.expression : "gentle",
    hairAccessory: "hairAccessory" in parsed ? parsed.hairAccessory : "none",
  };
}
export const POLISHED_DEFAULT_CONFIG = upgradeToPolishedArt(
  COHESIVE_DEFAULT_CONFIG,
);
export const POLISHED_PRESETS = COHESIVE_PRESETS.map((p) => ({
  ...p,
  config: upgradeToPolishedArt(p.config),
}));

/** Running changes animation layout, never artwork; saved V6 files opt in explicitly. */
export function enableRunning(
  config: ArtV6CharacterConfig,
): RunningCharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion !== 2 || parsed.artworkVersion !== 6)
    throw new Error("Running requires an explicit V6 character copy.");
  if (parsed.motionVersion === 2 || parsed.motionVersion === 3)
    throw new Error(
      "Compact running cannot be silently downgraded to motion version 1.",
    );
  return { ...parsed, motionVersion: 1 };
}
export const RUNNING_DEFAULT_CONFIG = enableRunning(POLISHED_DEFAULT_CONFIG);
export const RUNNING_PRESETS = POLISHED_PRESETS.map((p) => ({
  ...p,
  config: enableRunning(p.config),
}));

/** Explicit movement copy; existing motion v1 configurations retain their poses. */
export function enableCompactRunning(
  config: ArtV6CharacterConfig,
): CompactRunningCharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion !== 2 || parsed.artworkVersion !== 6)
    throw new Error("Compact running requires an explicit V6 character copy.");
  if (parsed.motionVersion === 3)
    throw new Error(
      "Corrected running cannot be silently downgraded to motion version 2.",
    );
  return { ...parsed, motionVersion: 2 };
}
export const COMPACT_RUNNING_DEFAULT_CONFIG = enableCompactRunning(
  POLISHED_DEFAULT_CONFIG,
);
export const COMPACT_RUNNING_PRESETS = POLISHED_PRESETS.map((p) => ({
  ...p,
  config: enableCompactRunning(p.config),
}));

/** Run-only correction is an explicit copy; previous motion renderers stay frozen. */
export function enableCorrectedRunning(
  config: ArtV6CharacterConfig,
): CorrectedRunningCharacterConfig {
  const parsed = parseCharacterConfig(config);
  if (parsed.schemaVersion !== 2 || parsed.artworkVersion !== 6)
    throw new Error(
      "Corrected running requires an explicit V6 character copy.",
    );
  return { ...parsed, motionVersion: 3 };
}
export const CORRECTED_RUNNING_DEFAULT_CONFIG = enableCorrectedRunning(
  POLISHED_DEFAULT_CONFIG,
);
export const CORRECTED_RUNNING_PRESETS = POLISHED_PRESETS.map((p) => ({
  ...p,
  config: enableCorrectedRunning(p.config),
}));

/** Explicit V7 copy; no opening or editing path invokes this conversion. */
export function upgradeToHarmonizedArt(
  config: CharacterConfig,
  faceVariant: FaceVariant = "heart",
): ArtV7CharacterConfig {
  const parsed = parseCharacterConfig(config);
  const appearance = { ...parsed };
  if (appearance.schemaVersion === 2 && appearance.artworkVersion === 6) {
    delete appearance.motionVersion;
    delete appearance.preview;
  }
  return {
    ...appearance,
    schemaVersion: 2,
    artworkVersion: 7,
    faceVariant: parsed.schemaVersion === 1 ? faceVariant : parsed.faceVariant,
    expression: "expression" in parsed ? parsed.expression : "gentle",
    hairAccessory: "hairAccessory" in parsed ? parsed.hairAccessory : "none",
  };
}
export const HARMONIZED_DEFAULT_CONFIG = upgradeToHarmonizedArt(
  POLISHED_DEFAULT_CONFIG,
);
export const HARMONIZED_PRESETS = POLISHED_PRESETS.map((p) => ({
  ...p,
  config: upgradeToHarmonizedArt(p.config),
}));
