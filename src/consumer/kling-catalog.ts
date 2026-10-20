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

export function isKlingCharacterId(id: unknown): id is KlingCharacterId {
  return id === "male" || id === "female";
}
