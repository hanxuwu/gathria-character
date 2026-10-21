import {
  characterPackImages,
  loadPortableCharacterPack,
  releaseCharacterImages,
} from "../core/pack";
import {
  klingCharacters,
  type KlingCharacterId,
  type KlingVariant,
} from "./kling-catalog";

/** Load an explicitly selected prepared pack without re-baking source frames. */
export async function loadKlingCharacter(
  id: KlingCharacterId,
  signal: AbortSignal,
  onStage?: (stage: string) => void,
  variant: KlingVariant = "original",
) {
  const character = klingCharacters(variant).find(
    (candidate) => candidate.id === id,
  );
  if (!character) throw new Error("Unknown Kling character.");
  signal.throwIfAborted();
  onStage?.(`Downloading ${character.name}…`);
  const response = await fetch(character.packUrl, { signal });
  if (!response.ok)
    throw new Error(
      `The ${variant === "motion" ? "motion candidate" : variant === "keyframes" ? "keyframe candidate" : "original character"} could not be downloaded (HTTP ${response.status}).`,
    );
  const archive = await response.blob();
  signal.throwIfAborted();
  onStage?.(`Validating ${character.name} and decoding source artwork…`);
  const pack = await loadPortableCharacterPack(archive);
  if (signal.aborted) releaseCharacterImages(characterPackImages(pack));
  signal.throwIfAborted();
  return { pack, archive };
}
