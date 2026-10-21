/** Prepared originals: URLs do not fetch or decode a character until selected. */
export const KLING_CHARACTERS = [
  {
    id: "male",
    name: "Kling male",
    packUrl: new URL(
      "../../docs/kling-jump/exports/male.character.zip",
      import.meta.url,
    ).href,
    previewUrl: new URL(
      "../../artwork/kling-jump/prepared/male-library-preview.png",
      import.meta.url,
    ).href,
  },
  {
    id: "female",
    name: "Kling female",
    packUrl: new URL(
      "../../docs/kling-jump/exports/female.character.zip",
      import.meta.url,
    ).href,
    previewUrl: new URL(
      "../../artwork/kling-jump/prepared/female-library-preview.png",
      import.meta.url,
    ).href,
  },
] as const;

export type KlingCharacterId = (typeof KLING_CHARACTERS)[number]["id"];
export type KlingVariant = "original" | "keyframes";

/** Explicit review candidates; original entries and default URLs stay unchanged. */
export const KLING_KEYFRAME_CHARACTERS = [
  {
    id: "male",
    name: "Kling male · keyframe loop study",
    packUrl: new URL(
      "../../docs/kling-keyframes/exports/male.character.zip",
      import.meta.url,
    ).href,
  },
  {
    id: "female",
    name: "Kling female · keyframe loop study",
    packUrl: new URL(
      "../../docs/kling-keyframes/exports/female.character.zip",
      import.meta.url,
    ).href,
  },
] as const;

export function klingCharacters(variant: KlingVariant) {
  return variant === "keyframes" ? KLING_KEYFRAME_CHARACTERS : KLING_CHARACTERS;
}

export function isKlingCharacterId(id: unknown): id is KlingCharacterId {
  return id === "male" || id === "female";
}
