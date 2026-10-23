import { sha256 } from "../core/sha256";
import { APPEARANCE_MAX_BYTES } from "../appearance/contract";
import { WARDROBE_MAX_ITEM_BYTES, type WardrobeProject } from "./contract";
import { LOOKS_KEY, readNamedLooks, type NamedLook } from "./named-looks";

const DATABASE = "gathria-look-materials-v1";
const STORE = "materials";
export const LOCAL_MATERIAL_BUDGET = 256 * 1024 * 1024;
type Kind = "garment" | "appearance";
type Entry = {
  key: string;
  kind: Kind;
  hash: string;
  size: number;
  data: Blob;
  /** Only writers participating in the cross-tab lock may opt into cleanup. */
  managed?: 1;
};
const LOCK = "gathria-look-materials-write-v1";
export function withLookStorageLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return globalThis.navigator?.locks
    ? navigator.locks.request(LOCK, operation)
    : operation();
}
const keyFor = (kind: Kind, hash: string) => `${kind}:${hash}`;
const limitFor = (kind: Kind) =>
  kind === "garment" ? WARDROBE_MAX_ITEM_BYTES : APPEARANCE_MAX_BYTES;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB)
      return reject(
        Error(
          "Local artwork storage is unavailable. Use Save wardrobe for a portable copy.",
        ),
      );
    const request = indexedDB.open(DATABASE, 1);
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(
        Error(
          "Local artwork storage is busy. Close other open versions and try again, or use Save wardrobe.",
        ),
      );
    }, 10000);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onerror = () => {
      clearTimeout(timeout);
      settled = true;
      reject(request.error);
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (settled) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

/** Only hashes of already accepted immutable archive bytes are persisted.
 * The caller holds withLookStorageLock until the recipe update completes.
 * Storage is a convenience, not a backup. It never evicts an existing look. */
export async function retainLookMaterials(
  project: WardrobeProject,
  look: NamedLook,
): Promise<void> {
  const entries: Entry[] = [];
  const add = async (kind: Kind, hash: string, input: Uint8Array) => {
    const bytes = new Uint8Array(input);
    if (bytes.length > limitFor(kind) || (await sha256(bytes)) !== hash)
      throw Error(
        "The selected artwork changed while saving. Save the wardrobe again before keeping this look.",
      );
    entries.push({
      key: keyFor(kind, hash),
      kind,
      hash,
      size: bytes.length,
      data: new Blob([bytes]),
      ...(globalThis.navigator?.locks ? { managed: 1 as const } : {}),
    });
  };
  for (const ref of look.items) {
    const item = project.items.find(
      (i) => i.manifest.id === ref.id && i.sha256 === ref.sha256,
    );
    if (!item)
      throw Error("Saved look material is missing from this wardrobe.");
    await add("garment", ref.sha256, item.bytes);
  }
  if (look.appearance) {
    if (project.appearanceBank?.sha256 !== look.appearance.bankSha256)
      throw Error("Saved look appearance is missing from this wardrobe.");
    await add(
      "appearance",
      look.appearance.bankSha256,
      project.appearanceBank.bytes,
    );
  }
  if (!entries.length) return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite"),
        store = tx.objectStore(STORE);
      let size = 0,
        failure: Error | undefined;
      const sizes = new Map<string, number>();
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (row) {
          const e = row.value as Entry;
          if (!(e.data instanceof Blob)) {
            failure = Error(
              "Stored artwork is damaged. Reopen a saved wardrobe before saving this look.",
            );
            tx.abort();
            return;
          }
          // Account for actual stored bytes, including repairs replacing an
          // entry whose old size metadata is corrupt or stale.
          size += e.data.size;
          sizes.set(e.key, e.data.size);
          row.continue();
          return;
        }
        size += entries.reduce(
          (sum, e) => sum + e.size - (sizes.get(e.key) ?? 0),
          0,
        );
        if (size > LOCAL_MATERIAL_BUDGET) {
          failure = Error(
            "Local artwork storage is full (256 MiB). Your saved looks are unchanged. Use Save wardrobe for a portable copy.",
          );
          tx.abort();
          return;
        }
        // Rewriting the same key also repairs corrupt stored bytes from this
        // verified open project, without substituting a different revision.
        for (const entry of entries) store.put(entry);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          failure ??
            Error(
              "Could not store the artwork in this browser. Use Save wardrobe for a portable copy.",
            ),
        );
      tx.onerror = () => {
        /* onabort reports atomic failure */
      };
    });
  } finally {
    db.close();
  }
}

export type LocalMaterialUsage = {
  bytes: number;
  count: number;
  removableBytes: number;
  removableCount: number;
  cleanupAvailable: boolean;
};
function protectedKeys(project: WardrobeProject): Set<string> {
  // Read both characters' recipes afresh. Unreadable storage must stop cleanup,
  // never be interpreted as an empty library.
  const looks = readNamedLooks(localStorage.getItem(LOOKS_KEY));
  const keep = new Set<string>();
  for (const look of looks) {
    for (const item of look.items) keep.add(keyFor("garment", item.sha256));
    if (look.appearance)
      keep.add(keyFor("appearance", look.appearance.bankSha256));
  }
  // The open project may include imports not yet saved as a named look.
  for (const item of project.items) keep.add(keyFor("garment", item.sha256));
  if (project.appearanceBank)
    keep.add(keyFor("appearance", project.appearanceBank.sha256));
  return keep;
}
async function inspectMaterials(
  project: WardrobeProject,
  remove: boolean,
): Promise<LocalMaterialUsage> {
  const canClean = Boolean(globalThis.navigator?.locks);
  if (remove && !canClean)
    throw Error(
      "Safe artwork cleanup needs HTTPS or localhost. Save wardrobe keeps a portable backup.",
    );
  const db = await openDatabase();
  try {
    // This executes within the same lock as saving artwork AND its look recipe.
    const keep = protectedKeys(project);
    return await new Promise<LocalMaterialUsage>((resolve, reject) => {
      const tx = db.transaction(STORE, remove ? "readwrite" : "readonly");
      const usage: LocalMaterialUsage = {
        bytes: 0,
        count: 0,
        removableBytes: 0,
        removableCount: 0,
        cleanupAvailable: canClean,
      };
      const cursor = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        const entry = row.value as Entry;
        const size = entry.data instanceof Blob ? entry.data.size : 0;
        usage.bytes += size;
        usage.count++;
        // Older or unknown writers never opted into this locking protocol.
        // Preserve their entries even when no current recipe references them.
        if (canClean && entry.managed === 1 && !keep.has(entry.key)) {
          usage.removableBytes += size;
          usage.removableCount++;
          if (remove) row.delete();
        }
        row.continue();
      };
      tx.oncomplete = () => resolve(usage);
      tx.onabort = () =>
        reject(
          tx.error ??
            Error("Artwork cleanup failed; stored materials are unchanged."),
        );
      tx.onerror = () => {
        /* atomic abort reports failure */
      };
    });
  } finally {
    db.close();
  }
}
export function localMaterialUsage(project: WardrobeProject) {
  return withLookStorageLock(() => inspectMaterials(project, false));
}
export function removeUnusedMaterials(project: WardrobeProject) {
  return withLookStorageLock(() => inspectMaterials(project, true));
}

export async function readLocalMaterial(
  kind: Kind,
  hash: string,
  signal?: AbortSignal,
  optionalStorage = false,
): Promise<Uint8Array | null> {
  if (!/^[a-f0-9]{64}$/.test(hash))
    throw Error("Invalid saved material fingerprint.");
  signal?.throwIfAborted();
  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch (error) {
    signal?.throwIfAborted();
    // A catalog asset can still be fetched and hash-verified when IndexedDB
    // itself is unavailable. A corrupt stored archive is NOT a cache miss.
    if (optionalStorage) return null;
    throw error;
  }
  let entry: Entry | undefined;
  try {
    entry = await new Promise<Entry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(keyFor(kind, hash));
      request.onsuccess = () => resolve(request.result as Entry | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
  signal?.throwIfAborted();
  if (!entry) return null;
  if (
    entry.kind !== kind ||
    entry.hash !== hash ||
    !(entry.data instanceof Blob) ||
    entry.data.size !== entry.size ||
    entry.size > limitFor(kind)
  )
    throw Error(
      "Stored artwork is damaged. Reopen its saved wardrobe project; no replacement was applied.",
    );
  const bytes = new Uint8Array(await entry.data.arrayBuffer());
  if ((await sha256(bytes)) !== hash)
    throw Error(
      "Stored artwork is damaged. Reopen its saved wardrobe project; no replacement was applied.",
    );
  signal?.throwIfAborted();
  return bytes;
}
