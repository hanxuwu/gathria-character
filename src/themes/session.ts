import { strToU8, zipSync } from "fflate";
import { readBoundedArchive } from "../core/bounded-archive";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import {
  getThemeLook,
  parseThemeJson,
  readThemeBundle,
  themeZipTime,
} from "./bundle";
import {
  THEME_MAX_BYTES,
  THEME_METADATA_MAX_BYTES,
  THEME_SESSION_MAX_BYTES,
  THEME_SESSION_MAX_THEMES,
  themeHash,
  themeObject,
  themeText,
  validateThemeSelection,
  type ThemeBundle,
  type ThemeSelection,
  type ThemeSession,
} from "./contract";
export type { ThemeSession, ThemeSelection } from "./contract";

function checkThemes(themes: readonly ThemeBundle[]): void {
  if (themes.length < 1 || themes.length > THEME_SESSION_MAX_THEMES)
    throw Error(
      `A theme session supports 1–${THEME_SESSION_MAX_THEMES} theme revisions.`,
    );
  if (new Set(themes.map((theme) => theme.key)).size !== themes.length)
    throw Error("Theme revision keys must be unique in a session.");
  if (
    themes.reduce(
      (sum, theme) => sum + theme.bytes.length,
      THEME_METADATA_MAX_BYTES,
    ) > THEME_SESSION_MAX_BYTES
  )
    throw Error("Theme session exceeds its 256 MiB artwork budget.");
}
export function createThemeSession(
  themes: ThemeBundle[],
  selection?: ThemeSelection,
): ThemeSession {
  checkThemes(themes);
  const initial = selection ?? {
    themeKey: themes[0].key,
    lookId: themes[0].looks[0].logicalId,
    action: "idle",
    facing: "right",
  };
  return {
    themes: [...themes],
    selection: validateThemeSelection(initial, themes),
  };
}
export function addTheme(
  session: ThemeSession,
  theme: ThemeBundle,
): ThemeSession {
  const old = session.themes.find((candidate) => candidate.key === theme.key);
  if (old) {
    if (old.sha256 !== theme.sha256)
      throw Error(
        "This theme ID and revision already contain different artwork. Give changed artwork a new revision.",
      );
    return session;
  }
  return createThemeSession([...session.themes, theme], session.selection);
}
export function selectTheme(session: ThemeSession, key: string): ThemeSession {
  return createThemeSession(session.themes, {
    ...session.selection,
    themeKey: key,
  });
}
export function selectThemeLook(
  session: ThemeSession,
  lookId: string,
): ThemeSession {
  const theme = session.themes.find(
    (theme) => theme.key === session.selection.themeKey,
  )!;
  if (!getThemeLook(theme, lookId))
    throw Error("This look is unavailable in the selected theme.");
  return createThemeSession(session.themes, { ...session.selection, lookId });
}
export function selectThemePlayback(
  session: ThemeSession,
  playback: Pick<ThemeSelection, "action" | "facing">,
): ThemeSession {
  return createThemeSession(session.themes, {
    ...session.selection,
    ...playback,
  });
}
export function getSelectedTheme(session: ThemeSession): ThemeBundle {
  const theme = session.themes.find(
    (theme) => theme.key === session.selection.themeKey,
  );
  if (!theme) throw Error("The selected theme is not available.");
  return theme;
}
export function getSelectedThemeLook(session: ThemeSession) {
  return getThemeLook(getSelectedTheme(session), session.selection.lookId);
}

async function checkedSession(
  session: ThemeSession,
  options: SourcePreparationOptions,
): Promise<ThemeSession> {
  checkThemes(session.themes);
  const themes: ThemeBundle[] = [];
  for (const theme of session.themes) {
    assertSourcePreparationActive(options);
    const checked = await readThemeBundle(theme.bytes, options);
    if (checked.key !== theme.key || checked.sha256 !== theme.sha256)
      throw Error(
        "Theme artwork changed since it was accepted. Reopen the original theme bundle.",
      );
    themes.push(checked);
  }
  return createThemeSession(themes, session.selection);
}
export async function exportThemeSession(
  session: ThemeSession,
  options: SourcePreparationOptions = {},
): Promise<Uint8Array> {
  assertSourcePreparationActive(options);
  const checked = await checkedSession(session, options);
  const files: Parameters<typeof zipSync>[0] = {};
  const themes = checked.themes.map((theme, index) => {
    const file = `theme-${index}.zip`;
    files[file] = [theme.bytes, { level: 0 }];
    return { key: theme.key, file, sha256: theme.sha256 };
  });
  files["session.json"] = strToU8(
    JSON.stringify(
      {
        format: "gathria-theme-session",
        version: 1,
        themes,
        selection: checked.selection,
      },
      null,
      2,
    ),
  );
  assertSourcePreparationActive(options);
  const bytes = zipSync(files, { level: 6, mtime: themeZipTime() });
  if (bytes.length > THEME_SESSION_MAX_BYTES)
    throw Error("Theme session exceeds 256 MiB.");
  assertSourcePreparationActive(options);
  return bytes;
}
export async function readThemeSession(
  input: Uint8Array,
  options: SourcePreparationOptions = {},
): Promise<ThemeSession> {
  assertSourcePreparationActive(options);
  if (input.length > THEME_SESSION_MAX_BYTES)
    throw Error("Theme session exceeds 256 MiB.");
  const allowed: Record<string, number> = {
    "session.json": THEME_METADATA_MAX_BYTES,
  };
  for (let i = 0; i < THEME_SESSION_MAX_THEMES; i++)
    allowed[`theme-${i}.zip`] = THEME_MAX_BYTES;
  const files = readBoundedArchive(new Uint8Array(input), {
    label: "Theme session",
    maxArchiveBytes: THEME_SESSION_MAX_BYTES,
    maxExpandedBytes: THEME_SESSION_MAX_BYTES,
    minFiles: 2,
    maxFiles: THEME_SESSION_MAX_THEMES + 1,
    files: allowed,
    required: ["session.json", "theme-0.zip"],
  });
  const raw = themeObject(
    parseThemeJson(files["session.json"], "Theme session"),
    "Theme session",
    ["format", "version", "themes", "selection"],
  );
  if (raw.format !== "gathria-theme-session" || raw.version !== 1)
    throw Error("Choose a supported Gathria theme session V1.");
  if (
    !Array.isArray(raw.themes) ||
    raw.themes.length < 1 ||
    raw.themes.length > THEME_SESSION_MAX_THEMES ||
    Object.keys(files).length !== raw.themes.length + 1
  )
    throw Error("Theme session references do not match its embedded themes.");
  const themes: ThemeBundle[] = [];
  for (const [index, value] of raw.themes.entries()) {
    assertSourcePreparationActive(options);
    const ref = themeObject(value, "Session theme", ["key", "file", "sha256"]);
    const key = themeText(ref.key, "Session theme key", 100);
    const hash = themeHash(ref.sha256, "Session theme hash");
    if (ref.file !== `theme-${index}.zip`)
      throw Error(
        "Theme session files must be consecutive theme-N.zip root files.",
      );
    const bytes = files[`theme-${index}.zip`];
    if (!bytes || (await sha256(bytes)) !== hash)
      throw Error("Theme session artwork checksum mismatch.");
    const theme = await readThemeBundle(bytes, options);
    if (theme.key !== key)
      throw Error("Theme session key does not match its embedded revision.");
    themes.push(theme);
  }
  assertSourcePreparationActive(options);
  return createThemeSession(
    themes,
    validateThemeSelection(raw.selection, themes),
  );
}
/** Returns the accepted variant bytes without re-encoding any PNG or metadata. */
export async function exportSelectedThemePack(
  session: ThemeSession,
  options: SourcePreparationOptions = {},
): Promise<Uint8Array> {
  const checked = await checkedSession(session, options);
  const look = getSelectedThemeLook(checked);
  if (!look)
    throw Error(
      "The requested outfit is unavailable in this theme; select an available look before export.",
    );
  return new Uint8Array(look.bytes);
}
