import catalog from "../../artwork/kling-themes/catalog-index.json";
import sourcePixelCatalog from "../../artwork/kling-source-pixel-full/catalog-index.json";
import type { SourcePreparationOptions } from "../core/source-preparation";
import { assertSourcePreparationActive } from "../core/source-preparation";
import { BAKED_MAX_ARCHIVE_BYTES } from "../core/pack-v2";
import { createWardrobeDownloads } from "../wardrobe/download-cache";
import {
  assertCompleteTheme,
  readThemeBundle,
  readThemeLook,
  type ThemeBundle,
  type ThemeLook,
  type ThemeManifest,
} from "./bundle";
import {
  THEME_ACTIONS,
  THEME_MAX_BYTES,
  themeKey,
  validateThemeManifest,
} from "./contract";

export interface ThemeCatalogEntry {
  key: string;
  name: string;
  description: string;
  character: "male" | "female";
  previewUrl?: string;
  isOriginal?: boolean;
  current?: boolean;
  readonly sha256: string;
  readonly bytes?: number;
  readonly manifest?: ThemeManifest;
  loadLook?(
    logicalId: string,
    options: SourcePreparationOptions,
  ): Promise<ThemeLook | null>;
  load(options: SourcePreparationOptions): Promise<ThemeBundle>;
}

interface PublishedCatalogRecord {
  key: string;
  name: string;
  description: string;
  character: "male" | "female";
  isOriginal: boolean;
  current?: boolean;
  file: string;
  preview: string;
  sha256: string;
  bytes: number;
  manifest?: ThemeManifest;
  lookAssets?: Array<{
    logicalId: string;
    file: string;
    sha256: string;
    bytes: number;
  }>;
}

const bundled = import.meta.glob<string>(
  [
    "../../docs/kling-themes/bundles/*.theme.zip",
    "../../docs/kling-themes/bundles/*.character.zip",
    "../../docs/kling-source-pixel-full/bundles/*.theme.zip",
    "../../docs/kling-source-pixel-full/bundles/*.character.zip",
    "../../docs/kling-motion/exports/*.character.zip",
    "../../docs/kling-paint-roundtrip/evidence/*-wedding-before.character.zip",
    "../../artwork/kling-themes/prepared/**/preview.png",
    "../../artwork/kling-source-pixel-full/prepared/**/preview.png",
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
export const THEME_CATALOG: ThemeCatalogEntry[] = (
  [...catalog, ...sourcePixelCatalog] as PublishedCatalogRecord[]
).map((entry) => {
  const manifest = entry.manifest
    ? validateThemeManifest(entry.manifest)
    : undefined;
  if (
    manifest &&
    (themeKey(manifest) !== entry.key || manifest.character !== entry.character)
  )
    throw Error(
      "Published theme metadata does not match its catalog identity.",
    );
  return {
    key: entry.key,
    name: entry.name,
    description: entry.description,
    character: entry.character as "male" | "female",
    isOriginal: entry.isOriginal,
    current: entry.current,
    sha256: entry.sha256,
    bytes: entry.bytes,
    manifest,
    previewUrl: asset(entry.preview),
    ...(manifest && entry.lookAssets
      ? {
          async loadLook(
            logicalId: string,
            options: SourcePreparationOptions = {},
          ) {
            assertSourcePreparationActive(options);
            const ref = manifest.looks.find(
              (look) => look.logicalId === logicalId,
            );
            if (!ref) return null;
            const selected = entry.lookAssets!.find(
              (look) => look.logicalId === logicalId,
            );
            if (!selected || selected.sha256 !== ref.sha256)
              throw Error("Published look does not match its theme manifest.");
            const bytes = await downloads.load(
              asset(selected.file),
              BAKED_MAX_ARCHIVE_BYTES,
              {
                signal: options.signal,
                sha256: ref.sha256,
              },
            );
            if (bytes.length !== selected.bytes)
              throw Error("Published look has an unexpected length.");
            const look = await readThemeLook(bytes, manifest, ref, options);
            for (const action of THEME_ACTIONS)
              if (!look.archive.manifest.animations[action])
                throw Error(`Published look is missing ${action}.`);
            return look;
          },
        }
      : {}),
    async load(options = {}) {
      const bytes = await downloads.load(asset(entry.file), THEME_MAX_BYTES, {
        signal: options.signal,
        sha256: entry.sha256,
      });
      const theme = await readThemeBundle(bytes, options);
      if (
        theme.key !== entry.key ||
        theme.manifest.character !== entry.character
      )
        throw Error("Theme artwork does not match its catalog identity.");
      if (
        manifest &&
        JSON.stringify(theme.manifest) !== JSON.stringify(manifest)
      )
        throw Error(
          "Published theme metadata differs from its portable archive.",
        );
      assertCompleteTheme(theme);
      return theme;
    },
  };
});
