import { useEffect, useState } from "react";
import type { KlingCharacterId } from "../consumer/kling-catalog";
import type { WardrobeProject } from "./contract";
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
  function save() {
    persist((rows) => {
      const existing = rows.find(
        (l) => l.character === character && l.name === name.trim(),
      );
      const id =
        existing?.id ??
        `look-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const next = captureNamedLook(project, character, name, id);
      return [...rows.filter((l) => l.id !== id), next];
    }, `${name.trim()} saved in this browser.`);
  }
  const replacing = available.some((l) => l.name === name.trim());
  return (
    <section className="wardrobe-named-looks" aria-label="Saved looks">
      <h2>Saved looks</h2>
      <p className="wardrobe-hint">
        Keep up to 12 combinations per character in this browser. Save wardrobe
        also keeps the actual artwork in a portable ZIP.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Look name
          <input
            aria-label="Look name"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled || unreadable}
          />
        </label>
        <button
          disabled={
            disabled ||
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
              disabled={disabled}
              onClick={() => onApply(look)}
              aria-label={`Apply look ${look.name}`}
            >
              {look.name}
            </button>
            <button
              type="button"
              disabled={disabled || unreadable}
              aria-label={`Delete look ${look.name}`}
              onClick={() =>
                persist(
                  (rows) => rows.filter((l) => l.id !== look.id),
                  `${look.name} removed from saved looks.`,
                )
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <p aria-live="polite">{message}</p>
    </section>
  );
}
