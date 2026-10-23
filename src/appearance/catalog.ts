import type { AppearanceBankManifest, AppearanceStyle } from "./contract";

/** Lightweight choices shown before the character's appearance bank is fetched. */
export type AppearanceStyleSummary = Pick<
  AppearanceStyle,
  "id" | "name" | "slot"
>;

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
