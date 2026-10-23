import {
  APPEARANCE_HAIR_COLORS,
  type AppearanceDocumentSelection,
} from "../appearance/contract";
import type { KlingCharacterId } from "../consumer/kling-catalog";
import {
  WARDROBE_SLOTS,
  wardrobeSha,
  type WardrobeProject,
  type WardrobeSelection,
} from "./contract";

export const LOOKS_KEY = "gathria-kling-named-looks-v1";
export const LOOKS_PER_CHARACTER = 12;
export interface NamedLook {
  id: string;
  name: string;
  character: KlingCharacterId;
  sourceSha256: string;
  registrationSha256: string;
  selection: WardrobeSelection;
  items: Array<{ id: string; sha256: string }>;
  appearance: AppearanceDocumentSelection | null;
  preview: WardrobeProject["document"]["preview"];
}
const identifier = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
function fail(): never {
  throw Error(
    "Saved looks could not be read. Your wardrobe files are unchanged.",
  );
}

/** Recipes contain references only. The portable wardrobe ZIP remains the backup. */
export function readNamedLooks(text: string | null): NamedLook[] {
  if (text === null) return [];
  if (text.length > 100_000) fail();
  const data = JSON.parse(text);
  if (
    data?.version !== 1 ||
    !Array.isArray(data.looks) ||
    data.looks.length > 24
  )
    fail();
  const ids = new Set<string>();
  const counts = { male: 0, female: 0 };
  return data.looks.map((v: NamedLook) => {
    if (
      !v ||
      !identifier(v.id) ||
      ids.has(v.id) ||
      !["male", "female"].includes(v.character) ||
      typeof v.name !== "string" ||
      !v.name.trim() ||
      v.name.length > 60
    )
      fail();
    ids.add(v.id);
    if (++counts[v.character] > LOOKS_PER_CHARACTER) fail();
    wardrobeSha(v.sourceSha256, "Saved look source");
    wardrobeSha(v.registrationSha256, "Saved look registration");
    if (!v.selection || !Array.isArray(v.items) || v.items.length > 4) fail();
    const known = new Set<string>();
    for (const item of v.items) {
      if (!item || !identifier(item.id) || known.has(item.id)) fail();
      wardrobeSha(item.sha256, "Saved look clothing");
      known.add(item.id);
    }
    const selected = new Set<string>();
    for (const slot of WARDROBE_SLOTS) {
      const id = v.selection[slot];
      if (id !== null && (!identifier(id) || !known.has(id))) fail();
      if (id) selected.add(id);
    }
    if (
      selected.size !== known.size ||
      (v.selection.fullBody && (v.selection.top || v.selection.bottom))
    )
      fail();
    if (
      !v.preview ||
      !["idle", "walk", "run", "jump", "celebrate"].includes(
        v.preview.action,
      ) ||
      !["left", "right"].includes(v.preview.facing)
    )
      fail();
    if (v.appearance !== null) {
      const a = v.appearance;
      if (
        !a ||
        !APPEARANCE_HAIR_COLORS.includes(a.hairColor) ||
        ![a.hairId, a.faceId].every((id) => id === null || identifier(id))
      )
        fail();
      wardrobeSha(a.bankSha256, "Saved look appearance");
    }
    return v;
  });
}
export function writeNamedLooks(looks: NamedLook[]): string {
  const text = JSON.stringify({ version: 1, looks });
  readNamedLooks(text);
  return text;
}
export function captureNamedLook(
  project: WardrobeProject,
  character: KlingCharacterId,
  name: string,
  id: string,
): NamedLook {
  const selected = new Set(Object.values(project.document.selection));
  const look: NamedLook = {
    id,
    name: name.trim(),
    character,
    sourceSha256: project.document.sourceSha256,
    registrationSha256: project.document.registrationSha256,
    selection: { ...project.document.selection },
    items: project.document.items
      .filter((i) => selected.has(i.id))
      .map((i) => ({ ...i })),
    appearance: project.document.appearance
      ? { ...project.document.appearance }
      : null,
    preview: { ...project.document.preview },
  };
  writeNamedLooks([look]);
  return look;
}
export function checkLookSource(look: NamedLook, project: WardrobeProject) {
  if (
    look.sourceSha256 !== project.document.sourceSha256 ||
    look.registrationSha256 !== project.document.registrationSha256
  )
    throw Error(
      "This look belongs to a different source or anchor revision. Reopen its saved wardrobe project.",
    );
}
export function exactLookAsset<T extends { id: string; sha256?: string }>(
  ref: { id: string; sha256: string },
  available: T[],
): T {
  const match = available.find(
    (a) => a.id === ref.id && a.sha256 === ref.sha256,
  );
  if (!match)
    throw Error(
      `The exact saved material ${ref.id} is unavailable. Reopen its saved wardrobe project; no replacement was applied.`,
    );
  return match;
}
