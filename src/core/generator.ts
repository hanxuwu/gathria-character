import { parseCharacterConfig } from "./config";
import { generateLegacyCharacter } from "./generator-v1";
import { ART_V2_GENERATOR_ID, generateArtV2 } from "./generator-v2";
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
    : generateArtV2(config);
}
export const pixelGenerator: CharacterGenerator = {
  id: ART_V2_GENERATOR_ID,
  generate: generateCharacter,
};
