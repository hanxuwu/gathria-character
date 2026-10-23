import { KLING_MOTION_CHARACTERS } from "../consumer/kling-catalog";

/** Static references publish library files without fetching them on startup. */
export const wardrobeCatalogUrl = new URL(
  "../../docs/kling-wardrobe/catalog.json",
  import.meta.url,
).href;

const bundled = import.meta.glob<string>(
  [
    "../../docs/kling-wardrobe/{garments,registration,templates}/**/*.{zip,json}",
    "../../docs/kling-appearance/banks/**/*.zip",
  ],
  { query: "?url&no-inline", import: "default", eager: true },
);
const bundledPaths = new Map(
  Object.entries(bundled).map(([path, url]) => [
    path.replace(/^\.\.\/\.\.\//, "/"),
    url,
  ]),
);
for (const character of KLING_MOTION_CHARACTERS)
  bundledPaths.set(
    `/docs/kling-motion/exports/${character.id}.character.zip`,
    character.packUrl,
  );

/** Keep development URLs stable for authoring and browser-fixture interception. */
export function wardrobeAssetUrl(path: string): string {
  if (import.meta.env.DEV) return path;
  return bundledPaths.get(path) ?? path;
}
