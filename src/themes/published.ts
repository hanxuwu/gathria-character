import { themeHash, type ThemeBundle } from "./contract";

export interface PublishedThemeIdentity {
  key: string;
  sha256: string;
  character: "male" | "female";
}

/** A published revision name is reserved even before its artwork is loaded.
 * Local imports cannot impersonate the approved original or another catalog
 * revision. Unknown keys remain available for independent authored themes. */
export function assertPublishedThemeIdentity(
  theme: Pick<ThemeBundle, "key" | "sha256" | "manifest">,
  published: readonly PublishedThemeIdentity[],
): void {
  const entry = published.find((candidate) => candidate.key === theme.key);
  if (!entry) return;
  const expected = themeHash(entry.sha256, "Published theme checksum");
  if (theme.sha256 !== expected || theme.manifest.character !== entry.character)
    throw Error(
      `Published theme revision ${theme.key} has different artwork. Import it with a new theme ID or revision; the approved catalog version cannot be replaced.`,
    );
}
