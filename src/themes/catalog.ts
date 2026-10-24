import catalog from "../../artwork/kling-themes/catalog-index.json";
import type { SourcePreparationOptions } from "../core/source-preparation";
import { createWardrobeDownloads } from "../wardrobe/download-cache";
import {
  assertCompleteTheme,
  readThemeBundle,
  type ThemeBundle,
} from "./bundle";
import { THEME_MAX_BYTES } from "./contract";

export interface ThemeCatalogEntry {
  key: string;
  name: string;
  description: string;
  character: "male" | "female";
  previewUrl?: string;
  isOriginal?: boolean;
  readonly sha256: string;
  load(options: SourcePreparationOptions): Promise<ThemeBundle>;
}

const bundled = import.meta.glob<string>(
  [
    "../../docs/kling-themes/bundles/*.theme.zip",
    "../../artwork/kling-themes/prepared/**/preview.png",
    "../../artwork/kling-jump/prepared/*-library-preview.png",
  ],
  { query: "?url&no-inline", import: "default", eager: true },
);
const urls = new Map(
  Object.entries(bundled).map(([path, url]) => [path.slice(6), url]),
);
const downloads = createWardrobeDownloads(96 * 1024 * 1024);

function asset(path: string): string {
  if (import.meta.env.DEV) return `/${path}`;
  const url = urls.get(path);
  if (!url) throw Error(`Published theme asset is unavailable: ${path}`);
  return url;
}

/** Catalog bytes are hash-bound; no theme silently follows a mutable latest URL. */
export const THEME_CATALOG: ThemeCatalogEntry[] = catalog.map((entry) => ({
  key: entry.key,
  name: entry.name,
  description: entry.description,
  character: entry.character as "male" | "female",
  isOriginal: entry.isOriginal,
  sha256: entry.sha256,
  previewUrl: asset(entry.preview),
  async load(options = {}) {
    const bytes = await downloads.load(asset(entry.file), THEME_MAX_BYTES, {
      signal: options.signal,
      sha256: entry.sha256,
    });
    const theme = await readThemeBundle(bytes, options);
    if (theme.key !== entry.key || theme.manifest.character !== entry.character)
      throw Error("Theme artwork does not match its catalog identity.");
    assertCompleteTheme(theme);
    return theme;
  },
}));
