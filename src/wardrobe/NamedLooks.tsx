import { useEffect, useState } from "react";
import type { KlingCharacterId } from "../consumer/kling-catalog";
import type { WardrobeProject } from "./contract";
import {
  retainLookMaterials,
  withLookStorageLock,
  localMaterialUsage,
  removeUnusedMaterials,
  type LocalMaterialUsage,
  LOCAL_MATERIAL_BUDGET,
} from "./local-materials";
import {
  LOOKS_KEY,
  LOOKS_PER_CHARACTER,
  captureNamedLook,
  readNamedLooks,
  writeNamedLooks,
  type NamedLook,
} from "./named-looks";

export default function NamedLooks({
  project,
  character,
  disabled,
  onApply,
}: {
  project: WardrobeProject;
  character: KlingCharacterId;
  disabled: boolean;
  onApply: (look: NamedLook) => void;
}) {
  const [looks, setLooks] = useState<NamedLook[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [unreadable, setUnreadable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usage, setUsage] = useState<LocalMaterialUsage>();
  const [storageOpen, setStorageOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  useEffect(() => {
    if (!storageOpen) return;
    let current = true;
    void localMaterialUsage(project)
      .then((value) => {
        if (current) setUsage(value);
      })
      .catch((e: unknown) => {
        if (current) {
          setUsage(undefined);
          setMessage(
            e instanceof Error ? e.message : "Artwork storage is unavailable.",
          );
        }
      });
    return () => {
      current = false;
    };
  }, [project, looks, storageOpen, cleaning]);
  useEffect(() => {
    const read = () => {
      try {
        setLooks(readNamedLooks(localStorage.getItem(LOOKS_KEY)));
        setUnreadable(false);
      } catch {
        setUnreadable(true);
        setMessage(
          "Saved looks are unavailable in this browser. Use Save wardrobe to keep a portable copy.",
        );
      }
    };
    read();
    const update = (e: StorageEvent) => {
      if (e.key === LOOKS_KEY || e.key === null) read();
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  const available = looks.filter((l) => l.character === character);
  function persist(
    transform: (rows: NamedLook[]) => NamedLook[],
    text: string,
  ) {
    try {
      const next = transform(readNamedLooks(localStorage.getItem(LOOKS_KEY)));
      localStorage.setItem(LOOKS_KEY, writeNamedLooks(next));
      setLooks(next);
      setMessage(text);
    } catch {
      setMessage(
        "Could not save this change in browser storage. Your previous looks and open outfit are unchanged. Use Save wardrobe for a portable copy.",
      );
    }
  }
  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("Saving this look and its artwork…");
    try {
      await withLookStorageLock(async () => {
        const rows = readNamedLooks(localStorage.getItem(LOOKS_KEY));
        const existing = rows.find(
          (l) => l.character === character && l.name === name.trim(),
        );
        const id =
          existing?.id ??
          `look-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const next = captureNamedLook(project, character, name, id);
        // Keep the old recipe intact if artwork storage fails. Re-read other
        // tabs' recipes after the async operation instead of overwriting them.
        writeNamedLooks([...rows.filter((l) => l.id !== id), next]);
        await retainLookMaterials(project, next);
        persist(
          (current) => [...current.filter((l) => l.id !== id), next],
          `${next.name} and its artwork saved in this browser.`,
        );
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save this look. Use Save wardrobe for a portable copy.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function removeLook(id: string, name: string) {
    setSaving(true);
    try {
      await withLookStorageLock(async () =>
        persist(
          (rows) => rows.filter((l) => l.id !== id),
          `${name} removed from saved looks.`,
        ),
      );
    } catch {
      setMessage(
        "Could not update saved looks. Try again; your open outfit is unchanged.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function clean() {
    setCleaning(true);
    try {
      const removed = await removeUnusedMaterials(project);
      setMessage(
        `Removed ${removed.removableCount} unused artwork files. Saved looks and the open wardrobe are kept.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Artwork cleanup failed.");
    } finally {
      setCleaning(false);
    }
  }
  const replacing = available.some((l) => l.name === name.trim());
  return (
    <section className="wardrobe-named-looks" aria-label="Saved looks">
      <h2>Saved looks</h2>
      <p className="wardrobe-hint">
        Keep up to 12 combinations per character, including their artwork, in
        this browser. Browser data clearing removes them. Save wardrobe keeps a
        portable backup.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Look name
          <input
            aria-label="Look name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled || unreadable || saving || cleaning}
          />
        </label>
        <button
          disabled={
            disabled ||
            saving ||
            cleaning ||
            unreadable ||
            !name.trim() ||
            (!replacing && available.length >= LOOKS_PER_CHARACTER)
          }
        >
          {replacing ? "Replace saved look" : "Save look"}
        </button>
      </form>
      <ul>
        {available.map((look) => (
          <li key={look.id}>
            <button
              type="button"
              disabled={disabled || saving || cleaning}
              onClick={() => onApply(look)}
              aria-label={`Apply look ${look.name}`}
            >
              {look.name}
            </button>
            <button
              type="button"
              disabled={disabled || unreadable || saving || cleaning}
              aria-label={`Delete look ${look.name}`}
              onClick={() => void removeLook(look.id, look.name)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <details onToggle={(e) => setStorageOpen(e.currentTarget.open)}>
        <summary>Artwork stored in this browser</summary>
        {usage && (
          <>
            <p>
              {usage.count} files · {(usage.bytes / 1048576).toFixed(1)} /{" "}
              {LOCAL_MATERIAL_BUDGET / 1048576} MiB used.
            </p>
            <p>
              {usage.removableCount} unused files ·{" "}
              {(usage.removableBytes / 1048576).toFixed(1)} MiB can be removed.
              Saved looks for both characters and artwork in this open wardrobe
              are kept. Older storage entries are retained.
            </p>
            {!usage.cleanupAvailable && (
              <p>Safe cleanup is available on HTTPS or localhost.</p>
            )}
            <button
              type="button"
              disabled={
                disabled ||
                saving ||
                cleaning ||
                unreadable ||
                !usage.cleanupAvailable ||
                !usage.removableCount
              }
              onClick={() => void clean()}
            >
              Remove unused artwork
            </button>
          </>
        )}
      </details>
      <p aria-live="polite">{message}</p>
    </section>
  );
}
