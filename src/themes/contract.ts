import type { PortableCharacterPackArchive } from "../core/pack";
import type { Facing, PortableAnimationName } from "../core/types";

export const THEME_MAX_LOOKS = 8;
export const THEME_MAX_BYTES = 128 * 1024 * 1024;
export const THEME_METADATA_MAX_BYTES = 64 * 1024;
export const THEME_SESSION_MAX_THEMES = 8;
export const THEME_SESSION_MAX_BYTES = 256 * 1024 * 1024;
export const THEME_ACTIONS: readonly PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];

export interface ThemeLookReference {
  logicalId: string;
  name: string;
  file: `look-${number}.character.zip`;
  sha256: string;
}
/** A theme has full baked look variants, not interchangeable garment layers. */
export interface ThemeManifest {
  format: "gathria-character-theme";
  version: 1;
  id: string;
  revision: number;
  name: string;
  character: "male" | "female";
  characterId: string;
  rendering: "smooth" | "pixel";
  reference: { sourceSha256: string; description: string };
  provenance: string;
  looks: ThemeLookReference[];
}
export interface ThemeLook {
  logicalId: string;
  name: string;
  bytes: Uint8Array;
  sha256: string;
  archive: PortableCharacterPackArchive;
}
export interface ThemeBundle {
  bytes: Uint8Array;
  sha256: string;
  key: string;
  manifest: ThemeManifest;
  looks: ThemeLook[];
}
export interface ThemeSelection {
  themeKey: string;
  /** A deliberately retained request: switching themes may make it unavailable. */
  lookId: string;
  action: PortableAnimationName;
  facing: Facing;
}
export interface ThemeSession {
  themes: ThemeBundle[];
  selection: ThemeSelection;
}

export function themeObject(
  value: unknown,
  label: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw Error(`${label} must be a plain object.`);
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key))
  )
    throw Error(`${label} contains missing or unexpected fields.`);
  return row;
}
export function themeText(
  value: unknown,
  label: string,
  maximum = 120,
): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw Error(`${label} must contain 1–${maximum} characters.`);
  return value;
}
export function themeId(value: unknown, label: string): string {
  const text = themeText(value, label, 64);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(text))
    throw Error(
      `${label} must contain letters, numbers, dots, underscores or hyphens.`,
    );
  return text;
}
export function themeHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw Error(`${label} must be a SHA-256 fingerprint.`);
  return value;
}
export const themeKey = (
  manifest: Pick<ThemeManifest, "character" | "id" | "revision">,
) => `${manifest.character}:${manifest.id}@${manifest.revision}`;

export function validateThemeManifest(value: unknown): ThemeManifest {
  const row = themeObject(value, "Theme manifest", [
    "format",
    "version",
    "id",
    "revision",
    "name",
    "character",
    "characterId",
    "rendering",
    "reference",
    "provenance",
    "looks",
  ]);
  if (row.format !== "gathria-character-theme" || row.version !== 1)
    throw Error("Choose a supported Gathria character theme V1 bundle.");
  if (
    !Number.isSafeInteger(row.revision) ||
    (row.revision as number) < 1 ||
    (row.revision as number) > 1_000_000
  )
    throw Error("Theme revision must be an integer from 1 to 1000000.");
  if (row.character !== "male" && row.character !== "female")
    throw Error("Theme character must be male or female.");
  if (row.rendering !== "smooth" && row.rendering !== "pixel")
    throw Error("Theme rendering must be smooth or pixel.");
  const reference = themeObject(row.reference, "Theme reference", [
    "sourceSha256",
    "description",
  ]);
  if (
    !Array.isArray(row.looks) ||
    row.looks.length < 1 ||
    row.looks.length > THEME_MAX_LOOKS
  )
    throw Error(`A theme needs 1–${THEME_MAX_LOOKS} complete look variants.`);
  const seen = new Set<string>();
  const looks = row.looks.map((value, index): ThemeLookReference => {
    const look = themeObject(value, "Theme look", [
      "logicalId",
      "name",
      "file",
      "sha256",
    ]);
    const logicalId = themeId(look.logicalId, "Look logical ID");
    if (seen.has(logicalId))
      throw Error("Theme look logical IDs must be unique.");
    seen.add(logicalId);
    if (look.file !== `look-${index}.character.zip`)
      throw Error(
        "Theme looks must use consecutive look-N.character.zip root files.",
      );
    return {
      logicalId,
      name: themeText(look.name, "Look name"),
      file: `look-${index}.character.zip`,
      sha256: themeHash(look.sha256, "Look hash"),
    };
  });
  return {
    format: "gathria-character-theme",
    version: 1,
    id: themeId(row.id, "Theme ID"),
    revision: row.revision as number,
    name: themeText(row.name, "Theme name"),
    character: row.character,
    characterId: themeText(row.characterId, "Theme character identity"),
    rendering: row.rendering,
    reference: {
      sourceSha256: themeHash(reference.sourceSha256, "Reference source hash"),
      description: themeText(
        reference.description,
        "Reference description",
        2000,
      ),
    },
    provenance: themeText(row.provenance, "Theme provenance", 12000),
    looks,
  };
}

export function validateThemeSelection(
  value: unknown,
  themes: readonly Pick<ThemeBundle, "key">[],
): ThemeSelection {
  const row = themeObject(value, "Theme selection", [
    "themeKey",
    "lookId",
    "action",
    "facing",
  ]);
  const key = themeText(row.themeKey, "Selected theme key", 100);
  if (!themes.some((theme) => theme.key === key))
    throw Error("The selected theme revision is not embedded in this session.");
  if (!THEME_ACTIONS.includes(row.action as PortableAnimationName))
    throw Error("Unsupported theme action.");
  if (row.facing !== "left" && row.facing !== "right")
    throw Error("Theme facing must be left or right.");
  // Missing look/action requests remain explicit. They are never resolved to an unrelated look.
  return {
    themeKey: key,
    lookId: themeId(row.lookId, "Selected look ID"),
    action: row.action as PortableAnimationName,
    facing: row.facing,
  };
}
