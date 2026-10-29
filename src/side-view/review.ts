import type { Facing } from "../core/types";
import type {
  Point,
  RegisteredFrame,
  WardrobeProject,
} from "../wardrobe/contract";
import type { SideAction } from "./motion";

export const REVIEW_RATES = [0.25, 0.5, 1] as const;
export type ReviewRate = (typeof REVIEW_RATES)[number];
export type ReviewRegion =
  | "head"
  | "nearHand"
  | "farHand"
  | "waist"
  | "knee"
  | "ankle";
export const REVIEW_REGIONS: Record<ReviewRegion, string> = {
  head: "头发与耳部",
  nearHand: "近侧手与袖口",
  farHand: "远侧手与袖口",
  waist: "腰线",
  knee: "膝盖与裙摆",
  ankle: "裤脚与鞋子",
};
export const MAX_REVIEW_NOTES = 100;
export const MAX_REVIEW_NOTE_LENGTH = 1000;
export interface ReviewNote {
  action: SideAction;
  frame: number;
  facing: Facing;
  region: ReviewRegion;
  text: string;
  /** Canonical snapshot including asset hashes, not merely a collection name. */
  lookKey: string;
  updatedAt: string;
}
export interface ReviewScope {
  character: string;
  sourceSha256: string;
}

export function reviewStorageKey(scope: ReviewScope): string {
  return `gathria-side-review-v1:${scope.character}:${scope.sourceSha256}`;
}

export function reviewLookKey(project: WardrobeProject): string {
  const selected = new Set(
    Object.values(project.document.selection).filter(Boolean),
  );
  return JSON.stringify({
    registrationSha256: project.document.registrationSha256,
    selection: project.document.selection,
    items: project.document.items
      .filter((item) => selected.has(item.id))
      .map(({ id, sha256 }) => ({ id, sha256 }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    appearance: project.document.appearance ?? null,
  });
}

export function reviewNoteKey(note: ReviewNote): string {
  return `${note.action}:${note.frame}:${note.facing}:${note.region}:${note.lookKey}`;
}

export function storeReviewNote(
  notes: ReviewNote[],
  next: ReviewNote,
): ReviewNote[] {
  return [
    next,
    ...notes.filter((note) => reviewNoteKey(note) !== reviewNoteKey(next)),
  ].slice(0, MAX_REVIEW_NOTES);
}

export function readReviewNotes(
  raw: string | null,
  scope: ReviewScope,
): ReviewNote[] {
  if (!raw || raw.length > 1_500_000) return [];
  try {
    const value = JSON.parse(raw);
    if (
      value?.format !== "gathria-side-review-notes" ||
      value.version !== 1 ||
      value.character !== scope.character ||
      value.sourceSha256 !== scope.sourceSha256 ||
      !Array.isArray(value.notes)
    )
      return [];
    const valid = value.notes.filter((note: unknown): note is ReviewNote => {
      if (!note || typeof note !== "object") return false;
      const n = note as ReviewNote;
      return (
        ["idle", "walk", "run", "jump"].includes(n.action) &&
        Number.isSafeInteger(n.frame) &&
        n.frame >= 0 &&
        ["left", "right"].includes(n.facing) &&
        Object.hasOwn(REVIEW_REGIONS, n.region) &&
        typeof n.text === "string" &&
        n.text.trim().length > 0 &&
        n.text.length <= MAX_REVIEW_NOTE_LENGTH &&
        typeof n.lookKey === "string" &&
        n.lookKey.length <= 8000 &&
        typeof n.updatedAt === "string" &&
        Number.isFinite(Date.parse(n.updatedAt))
      );
    });
    const keys = new Set<string>();
    return valid
      .filter((note: ReviewNote) => {
        const key = reviewNoteKey(note);
        if (keys.has(key)) return false;
        keys.add(key);
        return true;
      })
      .slice(0, MAX_REVIEW_NOTES);
  } catch {
    return [];
  }
}

export function reviewNotesDocument(scope: ReviewScope, notes: ReviewNote[]) {
  return { format: "gathria-side-review-notes", version: 1, ...scope, notes };
}

/** Integer native coordinates. No resampling or edits to the character itself. */
export function reviewCrop(
  frame: RegisteredFrame,
  region: ReviewRegion,
  width: number,
  height: number,
) {
  let points: Point[];
  let size = 160;
  if (region === "head" || region === "nearHand" || region === "farHand") {
    points = frame.protected.find((p) => p.label === region)?.polygon ?? [
      frame.points.neck,
    ];
    if (region === "head") size = 240;
  } else {
    const names =
      region === "waist"
        ? (["waistLeft", "waistRight"] as const)
        : region === "knee"
          ? (["nearKnee", "farKnee"] as const)
          : (["nearAnkle", "farAnkle"] as const);
    points = names.map((name) => frame.points[name]);
    size = region === "waist" ? 192 : 208;
  }
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const cropWidth = Math.min(width, size),
    cropHeight = Math.min(height, size);
  return {
    x: Math.max(0, Math.min(width - cropWidth, Math.round(cx - cropWidth / 2))),
    y: Math.max(
      0,
      Math.min(height - cropHeight, Math.round(cy - cropHeight / 2)),
    ),
    width: cropWidth,
    height: cropHeight,
  };
}
