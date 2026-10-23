import { sha256 } from "../core/sha256";
import type { AppearanceLibraryBank } from "./catalog";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type { WardrobeProject } from "../wardrobe/contract";
import {
  addWardrobeAppearanceBank,
  getWardrobeAppearanceSelection,
  selectWardrobeAppearance,
} from "../wardrobe/project";

/** A catalog release, pinned to exact bytes rather than an editable manifest id.
 * Unknown/custom/future banks are never inferred to be older from their name. */
export interface AppearanceCatalogRevision {
  characterId: string;
  sourceSha256: string;
  registrationSha256: string;
  bankId: string;
  bankSha256: string;
  previousBankSha256s: string[];
}
export interface AppearanceUpgradeAvailability {
  status: "available" | "current" | "unavailable";
  reason: string;
}

/** Resolve a release by exact current/previous bank bytes. A new library
 * revision never silently upgrades a saved bank or guesses from its name. */
export function appearanceReleaseFor(
  revision: AppearanceCatalogRevision | undefined,
  url: string | undefined,
  libraries: readonly AppearanceLibraryBank[] = [],
  savedHash?: string,
): { revision: AppearanceCatalogRevision; url: string } | undefined {
  if (!revision || !url) return undefined;
  const bank = libraries.find(
    (bank) =>
      bank.sha256 === savedHash ||
      (savedHash !== undefined &&
        bank.previousBankSha256s?.includes(savedHash)),
  );
  if (!bank) return { revision, url };
  return {
    url: bank.url,
    revision: {
      ...revision,
      bankId: bank.bankId,
      bankSha256: bank.sha256,
      previousBankSha256s: bank.previousBankSha256s ?? [],
    },
  };
}

export function validateAppearanceCatalogRevision(
  value: unknown,
): AppearanceCatalogRevision {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Appearance release must be an object.");
  const data = value as Record<string, unknown>;
  const fields = [
    "characterId",
    "sourceSha256",
    "registrationSha256",
    "bankId",
    "bankSha256",
    "previousBankSha256s",
  ];
  if (Object.keys(data).some((field) => !fields.includes(field)))
    throw Error("Appearance release has an unsupported field.");
  const id = (field: string): string => {
    const result = data[field];
    if (
      typeof result !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(result)
    )
      throw Error(`Appearance release ${field} is invalid.`);
    return result;
  };
  const hash = (value: unknown): string => {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
      throw Error("Appearance release needs exact SHA-256 checksums.");
    return value;
  };
  if (
    !Array.isArray(data.previousBankSha256s) ||
    data.previousBankSha256s.length > 16
  )
    throw Error("Appearance release has too many previous banks.");
  const bankSha256 = hash(data.bankSha256);
  const previousBankSha256s = data.previousBankSha256s.map(hash);
  if (
    new Set(previousBankSha256s).size !== previousBankSha256s.length ||
    previousBankSha256s.includes(bankSha256)
  )
    throw Error("Appearance release previous banks must be unique and older.");
  return {
    characterId: id("characterId"),
    sourceSha256: hash(data.sourceSha256),
    registrationSha256: hash(data.registrationSha256),
    bankId: id("bankId"),
    bankSha256,
    previousBankSha256s,
  };
}

/** Cheap, non-mutating UI eligibility. Preparation additionally hashes actual
 * bytes, validates the downloaded bank and checks the retained selections. */
export function getAppearanceUpgradeAvailability(
  project: WardrobeProject,
  revision?: AppearanceCatalogRevision,
  libraryBanks: readonly AppearanceLibraryBank[] = [],
): AppearanceUpgradeAvailability {
  if (!revision)
    return {
      status: "unavailable",
      reason: "No appearance update is available for this project.",
    };
  const release = validateAppearanceCatalogRevision(revision);
  if (
    project.registration.characterId !== release.characterId ||
    project.registration.sourceSha256 !== release.sourceSha256 ||
    project.document.sourceSha256 !== release.sourceSha256 ||
    project.document.registrationSha256 !== release.registrationSha256
  )
    return {
      status: "unavailable",
      reason:
        "This appearance release belongs to a different character or source.",
    };
  const bank = project.appearanceBank;
  if (project.document.version === 1 && !bank)
    return {
      status: "available",
      reason:
        "Preview hair and face options in a new copy. Your original project stays unchanged.",
    };
  if (
    project.document.version !== 2 ||
    !bank ||
    project.document.appearance.bankSha256 !== bank.sha256 ||
    bank.manifest.characterId !== release.characterId ||
    bank.manifest.sourceSha256 !== release.sourceSha256 ||
    bank.manifest.registrationSha256 !== release.registrationSha256
  )
    return {
      status: "unavailable",
      reason: "The saved appearance does not match this project's source.",
    };
  if (
    bank.sha256 === release.bankSha256 ||
    libraryBanks.some(
      (entry) =>
        entry.sha256 === bank.sha256 && entry.bankId === bank.manifest.id,
    )
  )
    return {
      status: "current",
      reason: "This project already uses the current appearance assets.",
    };
  if (!release.previousBankSha256s.includes(bank.sha256))
    return {
      status: "unavailable",
      reason:
        "This project uses custom or unrecognized appearance assets. They will be kept.",
    };
  return {
    status: "available",
    reason:
      "Preview improved hair edges while keeping your clothing, colors and movement.",
  };
}

/** Returns an isolated document/new bank for preview; never replaces the open
 * project's document, bytes or selected look. Source/garment buffers retain the
 * project's existing immutable sharing convention. Persistence still validates
 * the entire candidate via exportWardrobeProject before downloading a copy. */
export async function prepareAppearanceUpgrade(
  project: WardrobeProject,
  bytes: Uint8Array,
  revision: AppearanceCatalogRevision,
  options: SourcePreparationOptions = {},
): Promise<WardrobeProject> {
  assertSourcePreparationActive(options);
  const release = validateAppearanceCatalogRevision(revision);
  const availability = getAppearanceUpgradeAvailability(project, release);
  if (availability.status !== "available") throw Error(availability.reason);
  const copiedBank = new Uint8Array(bytes);
  const [sourceHash, registrationHash, bankHash, previousHash] =
    await Promise.all([
      sha256(project.source),
      sha256(project.registrationBytes),
      sha256(copiedBank),
      project.appearanceBank ? sha256(project.appearanceBank.bytes) : undefined,
    ]);
  assertSourcePreparationActive(options);
  if (
    sourceHash !== release.sourceSha256 ||
    registrationHash !== release.registrationSha256
  )
    throw Error(
      "The original source or registration bytes changed. Reopen the saved project before previewing an update.",
    );
  if (previousHash !== project.appearanceBank?.sha256)
    throw Error(
      "The saved appearance bytes changed. Reopen the saved project before previewing an update.",
    );
  if (bankHash !== release.bankSha256)
    throw Error(
      "The downloaded appearance assets do not match the catalog release.",
    );
  // Snapshot current controls before asynchronous bank decoding. Keep every
  // selected style or reject; resetting missing styles would silently alter it.
  const base = { ...project, document: structuredClone(project.document) };
  const selection = getWardrobeAppearanceSelection(base);
  const candidate = await addWardrobeAppearanceBank(base, copiedBank, options);
  assertSourcePreparationActive(options);
  if (candidate.appearanceBank!.manifest.id !== release.bankId)
    throw Error(
      "The downloaded appearance bank does not match the catalog identity.",
    );
  return selectWardrobeAppearance(candidate, selection);
}
