import { parseCharacterConfig } from "./config";
import { generateLegacyCharacter } from "./generator-v1";
import { generateArtV2 } from "./generator-v2";
import { ART_V3_GENERATOR_ID, generateArtV3 } from "./generator-v3";
import type {
  CharacterConfig,
  CharacterGenerator,
  GeneratedCharacter,
} from "./types";
export { FRAME_WIDTH, FRAME_HEIGHT } from "./generator-v1";
/** The saved config chooses its renderer; loading legacy work never upgrades its art. */
export function generateCharacter(value: CharacterConfig): GeneratedCharacter {
  const config = parseCharacterConfig(value);
  return config.schemaVersion === 1
    ? generateLegacyCharacter(config)
    : config.artworkVersion === 2
      ? generateArtV2(config)
      : generateArtV3(config);
}
export const pixelGenerator: CharacterGenerator = {
  id: ART_V3_GENERATOR_ID,
  generate: generateCharacter,
};
