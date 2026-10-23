import type { AppearanceBankManifest, AppearanceStyle } from "./contract";

/** Lightweight choices shown before the character's appearance bank is fetched. */
export type AppearanceStyleSummary = Pick<
  AppearanceStyle,
  "id" | "name" | "slot"
>;

/** Optional source-bound banks loaded only when a new style is chosen. The
 * existing embedded bank remains authoritative until that explicit choice. */
export interface AppearanceLibraryBank {
  url: string;
  sha256: string;
  bankId: string;
  styles: AppearanceStyleSummary[];
}

export function validateAppearanceLibraryBanks(
  value: unknown,
): AppearanceLibraryBank[] {
  if (!Array.isArray(value) || value.length > 8)
    throw Error("The appearance library must contain at most eight banks.");
  const ids = new Set<string>();
  return value.map((v) => {
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).some(
        (k) => !["url", "sha256", "bankId", "styles"].includes(k),
      ) ||
      typeof v.url !== "string" ||
      !v.url ||
      typeof v.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(v.sha256) ||
      typeof v.bankId !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(v.bankId) ||
      ids.has(v.bankId)
    )
      throw Error("The appearance library contains an invalid bank.");
    ids.add(v.bankId);
    return {
      url: v.url,
      sha256: v.sha256,
      bankId: v.bankId,
      styles: validateAppearanceStyleSummaries(v.styles),
    };
  });
}

export function isLibraryAppearance(
  hash: string | undefined,
  baseHash: string | undefined,
  banks: readonly AppearanceLibraryBank[] = [],
): boolean {
  return (
    !hash || hash === baseHash || banks.some((bank) => bank.sha256 === hash)
  );
}

export function libraryAppearanceChoices(
  bank: Pick<AppearanceBankManifest, "styles"> | undefined,
  hash: string | undefined,
  baseHash: string | undefined,
  baseStyles?: readonly AppearanceStyleSummary[],
  libraries: readonly AppearanceLibraryBank[] = [],
): readonly AppearanceStyleSummary[] {
  if (!isLibraryAppearance(hash, baseHash, libraries))
    return appearanceStyleChoices(bank, baseStyles);
  const choices = new Map<string, AppearanceStyleSummary>();
  // A separate style bank is not the base catalog. Older catalogs can omit
  // summaries, in which case retain the established original choices too.
  for (const style of baseStyles ??
    appearanceStyleChoices(hash === baseHash ? bank : undefined))
    choices.set(style.id, style);
  for (const library of libraries)
    for (const style of library.styles) choices.set(style.id, style);
  return [...choices.values()];
}

const LEGACY_STYLES: readonly AppearanceStyleSummary[] = [
  { id: "soft-crop", name: "Soft crop", slot: "hair" },
  { id: "soft-bob", name: "Soft bob", slot: "hair" },
  { id: "gentle", name: "Gentle", slot: "face" },
];

export function validateAppearanceStyleSummaries(
  value: unknown,
): AppearanceStyleSummary[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    throw Error("The appearance library must list one to eight styles.");
  const ids = new Set<string>();
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).some((key) => !["id", "name", "slot"].includes(key)) ||
      typeof entry.id !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.name !== "string" ||
      !entry.name.trim() ||
      entry.name.length > 120 ||
      !["hair", "face"].includes(entry.slot)
    )
      throw Error("The appearance library contains an invalid style.");
    ids.add(entry.id);
    return { id: entry.id, name: entry.name, slot: entry.slot };
  });
}

/** Saved/custom banks remain authoritative, even when the library gains styles. */
export function appearanceStyleChoices(
  bank: Pick<AppearanceBankManifest, "styles"> | undefined,
  catalogStyles?: readonly AppearanceStyleSummary[],
): readonly AppearanceStyleSummary[] {
  return bank?.styles ?? catalogStyles ?? LEGACY_STYLES;
}
