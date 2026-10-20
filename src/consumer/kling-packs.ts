import { loadPortableCharacterPack } from "../core/pack";
import { KLING_CHARACTERS, type KlingCharacterId } from "./kling-catalog";

/** Load the already reviewed pack without re-baking or retaining source frames. */
export async function loadKlingCharacter(
  id: KlingCharacterId,
  signal: AbortSignal,
  onStage?: (stage: string) => void,
) {
  const character = KLING_CHARACTERS.find((candidate) => candidate.id === id);
  if (!character) throw new Error("Unknown Kling character.");
  signal.throwIfAborted();
  onStage?.(`Downloading ${character.name}…`);
  const response = await fetch(character.packUrl, { signal });
  if (!response.ok)
    throw new Error(
      `The original character could not be downloaded (HTTP ${response.status}).`,
    );
  const archive = await response.blob();
  signal.throwIfAborted();
  onStage?.(`Validating ${character.name} and decoding original artwork…`);
  const pack = await loadPortableCharacterPack(archive);
  signal.throwIfAborted();
  return { pack, archive };
}
