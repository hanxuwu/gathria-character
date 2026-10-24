import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type { ThemeCatalogEntry } from "./catalog";
import { readThemeLook } from "./bundle";
import {
  THEME_METADATA_MAX_BYTES,
  THEME_SESSION_MAX_BYTES,
  THEME_SESSION_MAX_THEMES,
  validateThemeSelection,
  type ThemeBundle,
  type ThemeLook,
  type ThemeManifest,
  type ThemeSelection,
  type ThemeSession,
} from "./contract";
import { assertPublishedThemeIdentity } from "./published";
import {
  createThemeSession as createPortableSession,
  exportSelectedThemePack,
} from "./session";

/** Explicitly incomplete published preview. It is never a portable ThemeBundle:
 * only loaded looks are accepted, and the original complete archive is fetched
 * and checked before saving a theme or session. Imported themes remain complete. */
export interface PublishedThemePreview {
  publishedPreview: true;
  key: string;
  sha256: string;
  bundleBytes: number;
  manifest: ThemeManifest;
  looks: ThemeLook[];
}
export type WorkspaceTheme = ThemeBundle | PublishedThemePreview;
export interface WorkspaceThemeSession {
  themes: WorkspaceTheme[];
  selection: ThemeSelection;
}
export const isPublishedPreview = (
  theme: WorkspaceTheme,
): theme is PublishedThemePreview =>
  "publishedPreview" in theme && theme.publishedPreview === true;

export function createWorkspaceSession(
  themes: WorkspaceTheme[],
  selection?: ThemeSelection,
): WorkspaceThemeSession {
  if (!themes.length || themes.length > THEME_SESSION_MAX_THEMES)
    throw Error(
      `A theme session supports 1–${THEME_SESSION_MAX_THEMES} theme revisions.`,
    );
  if (new Set(themes.map((theme) => theme.key)).size !== themes.length)
    throw Error("Theme revision keys must be unique in a session.");
  if (
    themes.reduce(
      (sum, theme) =>
        sum +
        (isPublishedPreview(theme) ? theme.bundleBytes : theme.bytes.length),
      THEME_METADATA_MAX_BYTES,
    ) > THEME_SESSION_MAX_BYTES
  )
    throw Error("Theme session exceeds its 256 MiB artwork budget.");
  const first = themes[0];
  return {
    themes: [...themes],
    selection: validateThemeSelection(
      selection ?? {
        themeKey: first.key,
        lookId: first.manifest.looks[0].logicalId,
        action: "idle",
        facing: "right",
      },
      themes,
    ),
  };
}
export function addWorkspaceTheme(
  session: WorkspaceThemeSession,
  theme: WorkspaceTheme,
): WorkspaceThemeSession {
  const old = session.themes.find((candidate) => candidate.key === theme.key);
  if (old && old.sha256 !== theme.sha256)
    throw Error(
      "This theme ID and revision already contain different artwork. Give changed artwork a new revision.",
    );
  // A complete import upgrades a preview. Two selected-look preparations merge
  // without changing accepted archive identity or dropping already loaded looks.
  let accepted = theme;
  if (old && !isPublishedPreview(old)) accepted = old;
  else if (old && isPublishedPreview(theme)) {
    const looks = new Map(old.looks.map((look) => [look.logicalId, look]));
    for (const look of theme.looks) looks.set(look.logicalId, look);
    accepted = { ...theme, looks: [...looks.values()] };
  }
  return createWorkspaceSession(
    old
      ? session.themes.map((candidate) =>
          candidate.key === theme.key ? accepted : candidate,
        )
      : [...session.themes, accepted],
    session.selection,
  );
}
export function getWorkspaceTheme(
  session: WorkspaceThemeSession,
): WorkspaceTheme {
  const theme = session.themes.find(
    (candidate) => candidate.key === session.selection.themeKey,
  );
  if (!theme) throw Error("The selected theme is not available.");
  return theme;
}
export const getWorkspaceLook = (session: WorkspaceThemeSession) =>
  getWorkspaceTheme(session).looks.find(
    (look) => look.logicalId === session.selection.lookId,
  ) ?? null;
export function selectWorkspaceTheme(
  session: WorkspaceThemeSession,
  key: string,
): WorkspaceThemeSession {
  return createWorkspaceSession(session.themes, {
    ...session.selection,
    themeKey: key,
  });
}
export function selectWorkspacePlayback(
  session: WorkspaceThemeSession,
  playback: Pick<ThemeSelection, "action" | "facing">,
): WorkspaceThemeSession {
  return createWorkspaceSession(session.themes, {
    ...session.selection,
    ...playback,
  });
}
export async function openPublishedTheme(
  entry: ThemeCatalogEntry,
  lookId: string | undefined,
  options: SourcePreparationOptions,
): Promise<WorkspaceTheme> {
  if (!entry.loadLook || !entry.manifest || !entry.bytes)
    return entry.load(options);
  const id = lookId ?? entry.manifest.looks[0].logicalId;
  const look = await entry.loadLook(id, options);
  assertSourcePreparationActive(options);
  return {
    publishedPreview: true,
    key: entry.key,
    sha256: entry.sha256,
    bundleBytes: entry.bytes,
    manifest: structuredClone(entry.manifest),
    looks: look ? [look] : [],
  };
}
export async function prepareWorkspaceLook(
  session: WorkspaceThemeSession,
  lookId: string,
  catalog: readonly ThemeCatalogEntry[],
  options: SourcePreparationOptions,
): Promise<WorkspaceThemeSession> {
  assertSourcePreparationActive(options);
  const theme = getWorkspaceTheme(session);
  const ref = theme.manifest.looks.find((look) => look.logicalId === lookId);
  if (!ref)
    return createWorkspaceSession(session.themes, {
      ...session.selection,
      lookId,
    });
  let next = session;
  if (
    isPublishedPreview(theme) &&
    !theme.looks.some((look) => look.logicalId === lookId)
  ) {
    const entry = catalog.find((entry) => entry.key === theme.key);
    if (!entry?.loadLook || entry.sha256 !== theme.sha256)
      throw Error(
        "This published theme revision is no longer available. Reopen its saved theme bundle.",
      );
    const look = await entry.loadLook(lookId, options);
    if (!look || look.sha256 !== ref.sha256)
      throw Error("Published look does not match its accepted theme.");
    assertSourcePreparationActive(options);
    next = addWorkspaceTheme(session, {
      ...theme,
      looks: [...theme.looks, look],
    });
  }
  return createWorkspaceSession(next.themes, { ...next.selection, lookId });
}
export async function materializeWorkspaceTheme(
  theme: WorkspaceTheme,
  catalog: readonly ThemeCatalogEntry[],
  options: SourcePreparationOptions,
): Promise<ThemeBundle> {
  assertSourcePreparationActive(options);
  if (!isPublishedPreview(theme)) return theme;
  const entry = catalog.find((candidate) => candidate.key === theme.key);
  if (!entry || entry.sha256 !== theme.sha256)
    throw Error(
      "The exact published theme revision is unavailable for portable export.",
    );
  const complete = await entry.load(options);
  assertPublishedThemeIdentity(complete, catalog);
  if (
    complete.key !== theme.key ||
    complete.sha256 !== theme.sha256 ||
    JSON.stringify(complete.manifest) !== JSON.stringify(theme.manifest)
  )
    throw Error(
      "Published theme changed since preview. Reopen the original revision.",
    );
  assertSourcePreparationActive(options);
  return complete;
}
export async function materializeWorkspaceSession(
  session: WorkspaceThemeSession,
  catalog: readonly ThemeCatalogEntry[],
  options: SourcePreparationOptions,
): Promise<ThemeSession> {
  const themes: ThemeBundle[] = [];
  for (const theme of session.themes)
    themes.push(await materializeWorkspaceTheme(theme, catalog, options));
  return createPortableSession(themes, session.selection);
}
/** Exporting one look does not need unrelated artwork; recheck the exact bytes
 * and all native PNG data against the accepted published manifest first. */
export async function exportWorkspacePack(
  session: WorkspaceThemeSession,
  catalog: readonly ThemeCatalogEntry[],
  options: SourcePreparationOptions,
): Promise<Uint8Array> {
  const theme = getWorkspaceTheme(session);
  if (!isPublishedPreview(theme))
    return exportSelectedThemePack(
      createPortableSession([theme], session.selection),
      options,
    );
  assertPublishedThemeIdentity(theme, catalog);
  const selected = getWorkspaceLook(session);
  const ref = theme.manifest.looks.find(
    (candidate) => candidate.logicalId === session.selection.lookId,
  );
  const entry = catalog.find((candidate) => candidate.key === theme.key);
  if (!selected || !ref) throw Error("Select an available look before export.");
  if (
    !entry?.manifest ||
    JSON.stringify(theme.manifest) !== JSON.stringify(entry.manifest)
  )
    throw Error("Published theme metadata changed since acceptance.");
  const checked = await readThemeLook(
    selected.bytes,
    theme.manifest,
    ref,
    options,
  );
  return new Uint8Array(checked.bytes);
}
