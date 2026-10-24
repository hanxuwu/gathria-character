import { strToU8, zipSync } from "fflate";
import { readBoundedArchive } from "../core/bounded-archive";
import { BAKED_MAX_ARCHIVE_BYTES } from "../core/pack-v2";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  prepareSourceArchive,
  prepareSourcePng,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import {
  THEME_ACTIONS,
  THEME_MAX_BYTES,
  THEME_MAX_LOOKS,
  THEME_METADATA_MAX_BYTES,
  themeKey,
  validateThemeManifest,
  type ThemeBundle,
  type ThemeLook,
  type ThemeLookReference,
  type ThemeManifest,
} from "./contract";
export type { ThemeBundle, ThemeLook, ThemeManifest } from "./contract";

const decoder = new TextDecoder("utf-8", { fatal: true });
export const themeZipTime = () => new Date(2020, 0, 1, 0, 0, 0);
export function parseThemeJson(bytes: Uint8Array, label: string): unknown {
  if (!bytes || bytes.length > THEME_METADATA_MAX_BYTES)
    throw Error(`${label} exceeds its metadata limit.`);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw Error(`${label} must be valid UTF-8 JSON.`);
  }
}

/** A selected published look receives the same identity, archive and complete
 * PNG validation as an embedded imported look. No partial PNG is accepted. */
export async function readThemeLook(
  input: Uint8Array,
  manifest: ThemeManifest,
  ref: ThemeLookReference,
  options: SourcePreparationOptions = {},
): Promise<ThemeLook> {
  assertSourcePreparationActive(options);
  if (input.length > BAKED_MAX_ARCHIVE_BYTES)
    throw Error("CharacterPack ZIP must be at most 64 MiB.");
  const data = new Uint8Array(input);
  if ((await sha256(data)) !== ref.sha256)
    throw Error(`Theme look ${ref.logicalId} checksum mismatch.`);
  const archive = await prepareSourceArchive(data, options);
  if (archive.config.characterId !== manifest.characterId)
    throw Error(
      `Theme look ${ref.logicalId} belongs to a different character identity.`,
    );
  if (archive.manifest.scale.pixelArt !== (manifest.rendering === "pixel"))
    throw Error(
      `Theme look ${ref.logicalId} does not match its declared rendering mode.`,
    );
  const pages = [archive.png, ...(archive.additionalPngs ?? [])];
  const sheets = [
    archive.manifest.spritesheet,
    ...("additionalSheets" in archive.manifest
      ? archive.manifest.additionalSheets
      : []),
  ];
  if (pages.length !== sheets.length)
    throw Error("Theme atlas page count mismatch.");
  for (let i = 0; i < pages.length; i++) {
    assertSourcePreparationActive(options);
    await prepareSourcePng(pages[i], sheets[i], options);
  }
  assertSourcePreparationActive(options);
  return {
    logicalId: ref.logicalId,
    name: ref.name,
    bytes: data,
    sha256: ref.sha256,
    archive,
  };
}

/** Serial, fully decoded validation. No accepted session is mutated on a late failure. */
export async function readThemeBundle(
  input: Uint8Array,
  options: SourcePreparationOptions = {},
): Promise<ThemeBundle> {
  assertSourcePreparationActive(options);
  if (input.length > THEME_MAX_BYTES)
    throw Error("Theme bundle exceeds 128 MiB.");
  const bytes = new Uint8Array(input);
  const allowed: Record<string, number> = {
    "theme.json": THEME_METADATA_MAX_BYTES,
  };
  for (let i = 0; i < THEME_MAX_LOOKS; i++)
    allowed[`look-${i}.character.zip`] = BAKED_MAX_ARCHIVE_BYTES;
  const files = readBoundedArchive(bytes, {
    label: "Character theme",
    maxArchiveBytes: THEME_MAX_BYTES,
    maxExpandedBytes: THEME_MAX_BYTES,
    minFiles: 2,
    maxFiles: 1 + THEME_MAX_LOOKS,
    files: allowed,
    required: ["theme.json", "look-0.character.zip"],
  });
  const manifest = validateThemeManifest(
    parseThemeJson(files["theme.json"], "Theme manifest"),
  );
  if (Object.keys(files).length !== manifest.looks.length + 1)
    throw Error("Theme contains undeclared look files.");
  const looks: ThemeLook[] = [];
  for (const ref of manifest.looks) {
    assertSourcePreparationActive(options);
    const data = files[ref.file];
    if (!data) throw Error(`Theme look ${ref.logicalId} checksum mismatch.`);
    looks.push(await readThemeLook(data, manifest, ref, options));
  }
  const hash = await sha256(bytes);
  assertSourcePreparationActive(options);
  return { bytes, sha256: hash, key: themeKey(manifest), manifest, looks };
}

export function getThemeLook(
  theme: ThemeBundle,
  logicalId: string,
): ThemeLook | null {
  return theme.looks.find((look) => look.logicalId === logicalId) ?? null;
}

/** Publishing is stricter than generic import; partial imports remain honest/disabled in the UI. */
export function assertCompleteTheme(theme: ThemeBundle): void {
  for (const look of theme.looks)
    for (const action of THEME_ACTIONS)
      if (!look.archive.manifest.animations[action])
        throw Error(
          `Published theme ${theme.key}, look ${look.logicalId}, is missing ${action}.`,
        );
}

export type ThemeBundleInput = Omit<
  ThemeManifest,
  "format" | "version" | "looks"
> & {
  looks: Array<{ logicalId: string; name: string; bytes: Uint8Array }>;
};
/** Authoring convenience. Existing CharacterPack ZIP bytes are stored without rewriting them. */
export async function createThemeBundle(
  input: ThemeBundleInput,
  options: SourcePreparationOptions = {},
): Promise<ThemeBundle> {
  assertSourcePreparationActive(options);
  if (!input.looks.length || input.looks.length > THEME_MAX_LOOKS)
    throw Error(`A theme needs 1–${THEME_MAX_LOOKS} look variants.`);
  let total = THEME_METADATA_MAX_BYTES;
  const references = [];
  const files: Parameters<typeof zipSync>[0] = {};
  for (const [index, look] of input.looks.entries()) {
    assertSourcePreparationActive(options);
    if (
      look.bytes.length > BAKED_MAX_ARCHIVE_BYTES ||
      (total += look.bytes.length) > THEME_MAX_BYTES
    )
      throw Error("Theme artwork exceeds its archive budget.");
    const file = `look-${index}.character.zip` as const;
    const bytes = new Uint8Array(look.bytes);
    references.push({
      logicalId: look.logicalId,
      name: look.name,
      file,
      sha256: await sha256(bytes),
    });
    files[file] = [bytes, { level: 0 }];
  }
  const manifest = validateThemeManifest({
    ...input,
    format: "gathria-character-theme",
    version: 1,
    looks: references,
  });
  const metadata = strToU8(JSON.stringify(manifest, null, 2));
  if (metadata.length > THEME_METADATA_MAX_BYTES)
    throw Error("Theme metadata exceeds its budget.");
  files["theme.json"] = metadata;
  assertSourcePreparationActive(options);
  return readThemeBundle(
    zipSync(files, { level: 6, mtime: themeZipTime() }),
    options,
  );
}
