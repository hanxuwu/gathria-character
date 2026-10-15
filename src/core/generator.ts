import { parseCharacterConfig } from "./config";
import { generateLegacyCharacter } from "./generator-v1";
import { generateArtV2 } from "./generator-v2";
import { generateArtV3 } from "./generator-v3";
import { ART_V4_GENERATOR_ID, generateArtV4 } from "./generator-v4";
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
      : config.artworkVersion === 3
        ? generateArtV3(config)
        : generateArtV4(config);
}
export const pixelGenerator: CharacterGenerator = {
  id: ART_V4_GENERATOR_ID,
  generate: generateCharacter,
};
