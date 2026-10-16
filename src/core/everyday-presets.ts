import { COMPACT_RUNNING_DEFAULT_CONFIG } from "./config";
import type {
  CharacterConfig,
  CompactRunningCharacterConfig,
  LegacyLowerClothing,
  LegacyUpperClothing,
} from "./types";

interface EverydayAppearance {
  upperClothing: LegacyUpperClothing;
  upperColor: string;
  lowerClothing: LegacyLowerClothing;
  lowerColor: string;
  shoeColor: string;
}

/** New outfit combinations; historical identity and artwork presets stay frozen. */
export const EVERYDAY_PRESETS = [
  {
    id: "denim-daytrip",
    label: "Denim daytrip",
    description: "Blue jacket · tan trousers",
    appearance: {
      upperClothing: "jacket",
      upperColor: "#527D9A",
      lowerClothing: "trousers",
      lowerColor: "#A37B56",
      shoeColor: "#594435",
    },
  },
  {
    id: "coral-afternoon",
    label: "Coral afternoon",
    description: "Soft coral top · cocoa skirt",
    appearance: {
      upperClothing: "tee",
      upperColor: "#C77973",
      lowerClothing: "skirt",
      lowerColor: "#705049",
      shoeColor: "#6D4B39",
    },
  },
  {
    id: "sage-weekend",
    label: "Sage weekend",
    description: "Sage hoodie · slate shorts",
    appearance: {
      upperClothing: "hoodie",
      upperColor: "#83997B",
      lowerClothing: "shorts",
      lowerColor: "#596679",
      shoeColor: "#E9DFCC",
    },
  },
  {
    id: "ochre-traveler",
    label: "Ochre traveler",
    description: "Ochre jacket · navy trousers",
    appearance: {
      upperClothing: "jacket",
      upperColor: "#C79A55",
      lowerClothing: "trousers",
      lowerColor: "#3F4C65",
      shoeColor: "#694C38",
    },
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  appearance: EverydayAppearance;
}[];

export type EverydayPresetId = (typeof EVERYDAY_PRESETS)[number]["id"];

/** Apply the outfit and clear a supported hairpiece; keep identity, versions and preview. */
export function applyEverydayPreset(
  config: CharacterConfig,
  id: EverydayPresetId,
): CharacterConfig {
  const preset = EVERYDAY_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown everyday outfit: ${id}.`);
  return {
    ...config,
    ...preset.appearance,
    ...("hairAccessory" in config ? { hairAccessory: "none" as const } : {}),
  };
}

const EXAMPLE_IDENTITIES: Record<
  EverydayPresetId,
  Pick<
    CompactRunningCharacterConfig,
    "hairstyle" | "faceVariant" | "expression" | "skinTone" | "hairColor"
  >
> = {
  "denim-daytrip": {
    hairstyle: "crop",
    faceVariant: "oval",
    expression: "gentle",
    skinTone: "#E5AE87",
    hairColor: "#43312E",
  },
  "coral-afternoon": {
    hairstyle: "waves",
    faceVariant: "heart",
    expression: "gentle",
    skinTone: "#F5D3AE",
    hairColor: "#8A4935",
  },
  "sage-weekend": {
    hairstyle: "crop",
    faceVariant: "round",
    expression: "joyful",
    skinTone: "#A96F50",
    hairColor: "#43312E",
  },
  "ochre-traveler": {
    hairstyle: "waves",
    faceVariant: "oval",
    expression: "neutral",
    skinTone: "#E5AE87",
    hairColor: "#43312E",
  },
};

/** Complete examples for actual exports; applying a look in Studio does not use these identities. */
export const EVERYDAY_EXAMPLES = EVERYDAY_PRESETS.map((preset) => ({
  id: preset.id,
  label: preset.label,
  config: {
    ...COMPACT_RUNNING_DEFAULT_CONFIG,
    ...EXAMPLE_IDENTITIES[preset.id],
    ...preset.appearance,
    name: preset.label,
    hairAccessory: "none",
    preview: { animation: "idle", facing: "right" },
  } satisfies CompactRunningCharacterConfig,
}));
