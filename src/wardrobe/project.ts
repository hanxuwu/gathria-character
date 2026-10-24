import { readAppearanceBank } from "../appearance/bank";
import {
  APPEARANCE_MAX_BYTES,
  DEFAULT_APPEARANCE_SELECTION,
  type AppearanceSelection,
} from "../appearance/contract";
import { strToU8, zipSync } from "fflate";
import { readBoundedArchive } from "../core/bounded-archive";
import type { PortableCharacterPackArchive } from "../core/pack";
import { BAKED_MAX_ARCHIVE_BYTES } from "../core/pack-v2";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  prepareSourceArchive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import { checkPageHeader, validateGarmentPage } from "./garment-pages";
import {
  WARDROBE_MAX_ITEMS,
  WARDROBE_MAX_PAGES,
  WARDROBE_MAX_ITEM_BYTES,
  WARDROBE_MAX_PROJECT_BYTES,
  WARDROBE_MAX_METADATA_BYTES,
  validateWardrobeDocument,
  validateWardrobeRegistration,
  validateWardrobeGarmentManifest,
  wardrobeObject,
  type WardrobeDocument,
  type WardrobeGarment,
  type WardrobeProject,
  type WardrobeRegistration,
  type WardrobeSlot,
} from "./contract";

// fflate writes DOS timestamps with local getters, not UTC getters. Construct
// the same local wall-clock value at export time so ZIP bytes match across zones.
const zipTime = () => new Date(2020, 0, 1, 0, 0, 0);
const decoder = new TextDecoder("utf-8", { fatal: true });
const DOCUMENT_MAX_BYTES = 64 * 1024;
const SOURCE_CACHE_MAX_BYTES = 96 * 1024 * 1024;
const sourceCache = new Map<
  string,
  { archive: PortableCharacterPackArchive; bytes: number }
>();

/** A hash-verified private cache avoids repeating CRC scans of an unchanged
 * 25 MiB source at every outfit selection. Public typed arrays never alias it. */
async function sourceArchive(
  bytes: Uint8Array,
  hash: string,
  options: SourcePreparationOptions,
): Promise<PortableCharacterPackArchive> {
  assertSourcePreparationActive(options);
  let cached = sourceCache.get(hash);
  if (!cached) {
    const archive = await prepareSourceArchive(bytes, options);
    assertSourcePreparationActive(options);
    cached = {
      archive,
      bytes:
        archive.png.length +
        (archive.additionalPngs ?? []).reduce((n, page) => n + page.length, 0),
    };
    sourceCache.set(hash, cached);
    while (
      sourceCache.size > 2 ||
      [...sourceCache.values()].reduce((n, entry) => n + entry.bytes, 0) >
        SOURCE_CACHE_MAX_BYTES
    )
      sourceCache.delete(sourceCache.keys().next().value!);
  } else {
    // Refresh insertion order for an inexpensive two-entry LRU.
    sourceCache.delete(hash);
    sourceCache.set(hash, cached);
  }
  return structuredClone(cached.archive);
}
const GARMENT_ARCHIVE_CACHE_BYTES = 64 * 1024 * 1024;
const garmentArchives = new Map<
  string,
  { files: Record<string, Uint8Array>; bytes: number }
>();
function garmentFiles(hash: string, load: () => Record<string, Uint8Array>) {
  const cached =
    garmentArchives.get(hash) ??
    (() => {
      // Stored ZIP entries can be subarrays of the caller-visible archive.
      // Own the buffers on insertion as well as on return.
      const files = Object.fromEntries(
        Object.entries(load()).map(([name, bytes]) => [
          name,
          new Uint8Array(bytes),
        ]),
      );
      return {
        files,
        bytes: Object.values(files).reduce((n, bytes) => n + bytes.length, 0),
      };
    })();
  garmentArchives.delete(hash);
  garmentArchives.set(hash, cached);
  let bytes = [...garmentArchives.values()].reduce(
    (n, entry) => n + entry.bytes,
    0,
  );
  while (
    garmentArchives.size > WARDROBE_MAX_ITEMS ||
    bytes > GARMENT_ARCHIVE_CACHE_BYTES
  ) {
    const oldest = garmentArchives.keys().next().value!;
    bytes -= garmentArchives.get(oldest)!.bytes;
    garmentArchives.delete(oldest);
  }
  // Mutable public bytes/pages must never alias the private verified ZIP cache.
  return structuredClone(cached.files);
}

export interface WardrobeValidationOptions extends SourcePreparationOptions {
  /** False is for preview preflight only; import and persistence always decode. */
  decodeGarments?: boolean;
}
function parse(
  bytes: Uint8Array,
  name: string,
  max = WARDROBE_MAX_METADATA_BYTES,
): unknown {
  if (!bytes || bytes.length > max)
    throw Error(`${name} is missing or exceeds its metadata limit.`);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw Error(`${name} must be valid UTF-8 JSON.`);
  }
}
function canonicalItems(items: WardrobeGarment[]) {
  return [...items].sort((a, b) =>
    a.manifest.id < b.manifest.id ? -1 : a.manifest.id > b.manifest.id ? 1 : 0,
  );
}
/** Public validation never accepts a caller-supplied cache key. */
export async function validateWardrobePagePixels(
  patch: Uint8Array,
  ownership: Uint8Array,
  dimensions: { width: number; height: number },
): Promise<void> {
  await validateGarmentPage(patch, ownership, dimensions);
}

export async function readWardrobeGarment(
  bytes: Uint8Array,
  registration: WardrobeRegistration,
  registrationSha256: string,
  options: WardrobeValidationOptions = {},
): Promise<WardrobeGarment> {
  assertSourcePreparationActive(options);
  const allowed: Record<string, number> = {
    "manifest.json": WARDROBE_MAX_METADATA_BYTES,
  };
  const paired: Array<readonly [string, string]> = [];
  for (let i = 0; i < WARDROBE_MAX_PAGES; i++) {
    allowed[`patches-${i}.png`] = WARDROBE_MAX_ITEM_BYTES;
    allowed[`ownership-${i}.png`] = WARDROBE_MAX_ITEM_BYTES;
    paired.push([`patches-${i}.png`, `ownership-${i}.png`]);
  }
  if (bytes.length > WARDROBE_MAX_ITEM_BYTES)
    throw Error("Garment archive exceeds its size limit.");
  const copied = new Uint8Array(bytes);
  const hash = await sha256(copied);
  assertSourcePreparationActive(options);
  const files = garmentFiles(hash, () =>
    readBoundedArchive(copied, {
      label: "Garment archive",
      maxArchiveBytes: WARDROBE_MAX_ITEM_BYTES,
      maxExpandedBytes: WARDROBE_MAX_ITEM_BYTES,
      minFiles: 3,
      maxFiles: 1 + WARDROBE_MAX_PAGES * 2,
      files: allowed,
      required: ["manifest.json", "patches-0.png", "ownership-0.png"],
      paired,
    }),
  );
  const manifest = validateWardrobeGarmentManifest(
    parse(files["manifest.json"], "Garment manifest"),
    registration,
    registrationSha256,
  );
  if (Object.keys(files).length !== 1 + manifest.pages.length * 2)
    throw Error("Garment archive has undeclared pages.");
  const pages: WardrobeGarment["pages"] = [];
  for (const page of manifest.pages) {
    assertSourcePreparationActive(options);
    const patch = files[page.file],
      ownership = files[page.maskFile];
    if (!patch || !ownership)
      throw Error("Garment archive is missing a declared atlas page.");
    checkPageHeader(patch, page.width, page.height);
    checkPageHeader(ownership, page.width, page.height);
    if (options.decodeGarments !== false)
      await validateGarmentPage(
        patch,
        ownership,
        page,
        `${hash}:${pages.length}`,
      );
    pages.push({ patch, ownership });
  }
  assertSourcePreparationActive(options);
  return { bytes: copied, sha256: hash, manifest, pages };
}

async function createBase(
  source: Uint8Array,
  registrationBytes: Uint8Array,
  options: SourcePreparationOptions,
) {
  assertSourcePreparationActive(options);
  if (source.length > BAKED_MAX_ARCHIVE_BYTES)
    throw Error("Original CharacterPack must be at most 64 MiB.");
  if (registrationBytes.length > WARDROBE_MAX_METADATA_BYTES)
    throw Error("Wardrobe registration exceeds its metadata limit.");
  const bytes = new Uint8Array(source),
    registered = new Uint8Array(registrationBytes);
  const sourceSha256 = await sha256(bytes),
    archive = await sourceArchive(bytes, sourceSha256, options);
  if (archive.manifest.schemaVersion === 4)
    throw Error(
      "Authored pixel theme packs belong in the theme workspace. This wardrobe accepts the original smooth source and its matched garment layers.",
    );
  assertSourcePreparationActive(options);
  const registration = validateWardrobeRegistration(
    parse(registered, "Wardrobe registration"),
    archive,
    sourceSha256,
  );
  const registrationSha256 = await sha256(registered);
  assertSourcePreparationActive(options);
  return {
    source: bytes,
    archive,
    registrationBytes: registered,
    registration,
    sourceSha256,
    registrationSha256,
  };
}
function checkInventory(
  project: Pick<
    WardrobeProject,
    "source" | "registrationBytes" | "items" | "appearanceBank"
  >,
) {
  if (project.items.length > WARDROBE_MAX_ITEMS)
    throw Error(
      `A wardrobe project supports at most ${WARDROBE_MAX_ITEMS} garments.`,
    );
  if (
    new Set(project.items.map((i) => i.manifest.id)).size !==
    project.items.length
  )
    throw Error(
      "Garment ids must be unique; remove or version an existing garment before replacing it.",
    );
  if (
    project.source.length +
      project.registrationBytes.length +
      (project.appearanceBank?.bytes.length ?? 0) +
      project.items.reduce(
        (sum, i) => sum + i.bytes.length,
        DOCUMENT_MAX_BYTES,
      ) >
    WARDROBE_MAX_PROJECT_BYTES
  )
    throw Error("Wardrobe project exceeds its 128 MiB embedded asset budget.");
}

export async function createWardrobeProject(
  source: Uint8Array,
  registrationBytes: Uint8Array,
  items: Uint8Array[] = [],
  options: SourcePreparationOptions = {},
): Promise<WardrobeProject> {
  assertSourcePreparationActive(options);
  if (items.length > WARDROBE_MAX_ITEMS)
    throw Error(
      `A wardrobe project supports at most ${WARDROBE_MAX_ITEMS} garments.`,
    );
  const base = await createBase(source, registrationBytes, options),
    garments: WardrobeGarment[] = [];
  // Serial decode bounds peak memory; rejected imports never mutate a live project.
  for (const bytes of items)
    garments.push(
      await readWardrobeGarment(
        bytes,
        base.registration,
        base.registrationSha256,
        { signal: options.signal },
      ),
    );
  const inventory = canonicalItems(garments);
  assertSourcePreparationActive(options);
  checkInventory({ ...base, items: inventory });
  return {
    source: base.source,
    archive: base.archive,
    registrationBytes: base.registrationBytes,
    registration: base.registration,
    items: inventory,
    document: {
      format: "gathria-wardrobe-project",
      version: 1,
      sourceSha256: base.sourceSha256,
      registrationSha256: base.registrationSha256,
      items: inventory.map((item) => ({
        id: item.manifest.id,
        sha256: item.sha256,
      })),
      selection: { top: null, bottom: null, fullBody: null, shoes: null },
      preview: { action: "idle", facing: "right" },
    },
  };
}

/** Explicitly attach a fully validated bank; clothing and preview selections stay intact. */
export async function addWardrobeAppearanceBank(
  project: WardrobeProject,
  bytes: Uint8Array,
  options: SourcePreparationOptions = {},
): Promise<WardrobeProject> {
  const appearanceBank = await readAppearanceBank(
    bytes,
    project.registration,
    project.document.registrationSha256,
    options,
  );
  const next = { ...project, appearanceBank };
  checkInventory(next);
  const previous =
    project.document.version === 2 &&
    project.document.appearance.bankSha256 === appearanceBank.sha256
      ? project.document.appearance
      : DEFAULT_APPEARANCE_SELECTION;
  const document = validateWardrobeDocument(
    {
      ...project.document,
      version: 2,
      appearance: { ...previous, bankSha256: appearanceBank.sha256 },
    },
    next,
  );
  return { ...next, document };
}
export function getWardrobeAppearanceSelection(
  project: WardrobeProject,
): AppearanceSelection {
  if (project.document.version === 1)
    return { ...DEFAULT_APPEARANCE_SELECTION };
  const { hairId, faceId, hairColor } = project.document.appearance;
  return { hairId, faceId, hairColor };
}
export function selectWardrobeAppearance(
  project: WardrobeProject,
  selection: Partial<AppearanceSelection>,
): WardrobeProject {
  if (!project.appearanceBank || project.document.version !== 2)
    throw Error("Load an appearance bank before selecting hair or expression.");
  const document = validateWardrobeDocument(
    {
      ...project.document,
      appearance: { ...project.document.appearance, ...selection },
    },
    project,
  );
  return { ...project, document };
}

export async function addWardrobeGarment(
  project: WardrobeProject,
  bytes: Uint8Array,
): Promise<WardrobeProject> {
  const garment = await readWardrobeGarment(
    bytes,
    project.registration,
    project.document.registrationSha256,
  );
  const items = canonicalItems([...project.items, garment]);
  checkInventory({ ...project, items });
  const document = validateWardrobeDocument(
    {
      ...project.document,
      items: items.map((item) => ({
        id: item.manifest.id,
        sha256: item.sha256,
      })),
    },
    { ...project, items },
  );
  return { ...project, items, document };
}
export function selectWardrobeGarment(
  project: WardrobeProject,
  slot: WardrobeSlot,
  id: string | null,
): WardrobeProject {
  if (!["top", "bottom", "fullBody", "shoes"].includes(slot))
    throw Error("Unsupported garment slot.");
  const selection = { ...project.document.selection, [slot]: id };
  if (id !== null && slot === "fullBody") {
    selection.top = null;
    selection.bottom = null;
  }
  if (id !== null && (slot === "top" || slot === "bottom"))
    selection.fullBody = null;
  return {
    ...project,
    document: validateWardrobeDocument(
      { ...project.document, selection },
      project,
    ),
  };
}
export function updateWardrobePreview(
  project: WardrobeProject,
  preview: WardrobeDocument["preview"],
): WardrobeProject {
  return {
    ...project,
    document: validateWardrobeDocument(
      { ...project.document, preview },
      project,
    ),
  };
}

/** Reconstruct from original bytes; never trust mutable parsed caches at export. */
export async function validateWardrobeProject(
  project: WardrobeProject,
  options: WardrobeValidationOptions = {},
): Promise<WardrobeProject> {
  assertSourcePreparationActive(options);
  checkInventory(project);
  const base = await createBase(
    project.source,
    project.registrationBytes,
    options,
  );
  if (base.sourceSha256 !== project.document.sourceSha256)
    throw Error("Wardrobe source checksum mismatch.");
  if (base.registrationSha256 !== project.document.registrationSha256)
    throw Error("Wardrobe registration checksum mismatch.");
  const items: WardrobeGarment[] = [];
  for (const item of project.items)
    items.push(
      await readWardrobeGarment(
        item.bytes,
        base.registration,
        base.registrationSha256,
        options,
      ),
    );
  const appearanceBank = project.appearanceBank
    ? await readAppearanceBank(
        project.appearanceBank.bytes,
        base.registration,
        base.registrationSha256,
        options,
      )
    : undefined;
  checkInventory({ ...base, items, appearanceBank });
  assertSourcePreparationActive(options);
  const document = validateWardrobeDocument(project.document, {
    archive: base.archive,
    items,
    appearanceBank,
  });
  const normalized = canonicalItems(items);
  document.items = normalized.map((item) => ({
    id: item.manifest.id,
    sha256: item.sha256,
  }));
  return {
    source: base.source,
    archive: base.archive,
    registrationBytes: base.registrationBytes,
    registration: base.registration,
    items: normalized,
    ...(appearanceBank ? { appearanceBank } : {}),
    document,
  };
}
export const verifyWardrobeProject = validateWardrobeProject;

export async function exportWardrobeProject(
  project: WardrobeProject,
): Promise<Uint8Array> {
  const verified = await validateWardrobeProject(project);
  const doc = strToU8(JSON.stringify(verified.document, null, 2));
  if (doc.length > DOCUMENT_MAX_BYTES)
    throw Error("Wardrobe project document exceeds its metadata limit.");
  const files: Parameters<typeof zipSync>[0] = {
    "document.json": doc,
    "source.character.zip": [verified.source, { level: 0 }],
    "registration.json": verified.registrationBytes,
  };
  verified.items.forEach((item, i) => {
    files[`item-${i}.zip`] = [item.bytes, { level: 0 }];
  });
  if (verified.appearanceBank)
    files["appearance.zip"] = [verified.appearanceBank.bytes, { level: 0 }];
  const bytes = zipSync(files, { level: 6, mtime: zipTime() });
  if (bytes.length > WARDROBE_MAX_PROJECT_BYTES)
    throw Error("Wardrobe project ZIP exceeds 128 MiB.");
  return bytes;
}

export async function importWardrobeProject(
  bytes: Uint8Array,
  options: SourcePreparationOptions = {},
): Promise<WardrobeProject> {
  assertSourcePreparationActive(options);
  const allowed: Record<string, number> = {
    "document.json": DOCUMENT_MAX_BYTES,
    "source.character.zip": BAKED_MAX_ARCHIVE_BYTES,
    "registration.json": WARDROBE_MAX_METADATA_BYTES,
    "appearance.zip": APPEARANCE_MAX_BYTES,
  };
  for (let i = 0; i < WARDROBE_MAX_ITEMS; i++)
    allowed[`item-${i}.zip`] = WARDROBE_MAX_ITEM_BYTES;
  const files = readBoundedArchive(bytes, {
    label: "Wardrobe project",
    maxArchiveBytes: WARDROBE_MAX_PROJECT_BYTES,
    maxExpandedBytes: WARDROBE_MAX_PROJECT_BYTES,
    minFiles: 3,
    maxFiles: 4 + WARDROBE_MAX_ITEMS,
    files: allowed,
    required: ["document.json", "source.character.zip", "registration.json"],
  });
  const raw = wardrobeObject(
    parse(files["document.json"], "Wardrobe document", DOCUMENT_MAX_BYTES),
    "Wardrobe project document",
    [
      "format",
      "version",
      "sourceSha256",
      "registrationSha256",
      "items",
      "selection",
      "preview",
      "appearance",
    ],
  );
  if (raw.version !== 1 && raw.version !== 2)
    throw Error("Unsupported wardrobe project format/version.");
  if ((raw.version === 2) !== !!files["appearance.zip"])
    throw Error("Wardrobe project appearance bank does not match its version.");
  if (
    !Array.isArray(raw.items) ||
    raw.items.length > WARDROBE_MAX_ITEMS ||
    Object.keys(files).length !==
      3 + raw.items.length + (raw.version === 2 ? 1 : 0)
  )
    throw Error(
      "Wardrobe project item references do not match its embedded assets.",
    );
  const itemBytes: Uint8Array[] = [];
  for (let i = 0; i < raw.items.length; i++) {
    assertSourcePreparationActive(options);
    const bytes = files[`item-${i}.zip`];
    if (!bytes) throw Error("Wardrobe project is missing an embedded garment.");
    const ref = wardrobeObject(raw.items[i], "Item reference", [
      "id",
      "sha256",
    ]);
    if (ref.sha256 !== (await sha256(bytes)))
      throw Error("Wardrobe embedded garment checksum mismatch.");
    itemBytes.push(bytes);
  }
  let project = await createWardrobeProject(
    files["source.character.zip"],
    files["registration.json"],
    itemBytes,
    options,
  );
  if (raw.version === 2)
    project = await addWardrobeAppearanceBank(
      project,
      files["appearance.zip"],
      options,
    );
  const document = validateWardrobeDocument(raw, project);
  if (document.sourceSha256 !== project.document.sourceSha256)
    throw Error("Wardrobe source checksum mismatch.");
  if (document.registrationSha256 !== project.document.registrationSha256)
    throw Error("Wardrobe registration checksum mismatch.");
  document.items = project.document.items;
  return { ...project, document };
}
