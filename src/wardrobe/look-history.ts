import type { WardrobeProject } from "./contract";

export interface LookHistory {
  past: WardrobeProject[];
  future: WardrobeProject[];
}
export const LOOK_HISTORY_STEPS = 12;
export const LOOK_HISTORY_BYTES = 128 * 1024 * 1024;
export const emptyLookHistory = (): LookHistory => ({ past: [], future: [] });

/** Only styling/inventory belongs to undo. Scrubbing, direction and automatic
 * one-shot returns must not fill the stack or reset its redo branch. */
export function lookKey(project: WardrobeProject): string {
  const { preview: _preview, ...document } = project.document;
  return JSON.stringify(document);
}
function sameSource(a: WardrobeProject, b: WardrobeProject): boolean {
  return (
    a.document.sourceSha256 === b.document.sourceSha256 &&
    a.document.registrationSha256 === b.document.registrationSha256
  );
}
function materialBuffers(project: WardrobeProject): Set<ArrayBufferLike> {
  return new Set(
    [
      ...project.items,
      ...(project.appearanceBank ? [project.appearanceBank] : []),
    ]
      .flatMap((item) => [
        item.bytes,
        ...item.pages.flatMap((page) => [page.patch, page.ownership]),
      ])
      .map((bytes) => bytes.buffer),
  );
}
/** Snapshots share immutable source/asset buffers; they never keep renderers or
 * decoded frame atlases. Bound the additional material buffers, not just steps. */
export function retainedHistoryBytes(
  history: LookHistory,
  current: WardrobeProject,
): number {
  const currentBuffers = materialBuffers(current);
  const retained = new Set<ArrayBufferLike>();
  for (const project of [...history.past, ...history.future])
    for (const buffer of materialBuffers(project))
      if (!currentBuffers.has(buffer)) retained.add(buffer);
  return [...retained].reduce((sum, buffer) => sum + buffer.byteLength, 0);
}
export function boundLookHistory(
  history: LookHistory,
  current: WardrobeProject,
  limits = { steps: LOOK_HISTORY_STEPS, bytes: LOOK_HISTORY_BYTES },
): LookHistory {
  const next = { past: [...history.past], future: [...history.future] };
  while (
    next.past.length + next.future.length > limits.steps ||
    retainedHistoryBytes(next, current) > limits.bytes
  ) {
    // Retain the closest undo/redo steps before the farthest ones.
    if (next.past.length >= next.future.length && next.past.length)
      next.past.shift();
    else if (next.future.length) next.future.shift();
    else break;
  }
  return next;
}
export function recordLookChange(
  history: LookHistory,
  before: WardrobeProject,
  after: WardrobeProject,
): LookHistory {
  if (!sameSource(before, after)) return emptyLookHistory();
  if (lookKey(before) === lookKey(after)) return history;
  return boundLookHistory(
    { past: [...history.past, before], future: [] },
    after,
  );
}
/** A proposal only: commit this stack after the renderer accepts the target.
 * Canceled/invalid undo retains both the current project and its redo history. */
export function moveLookHistory(
  history: LookHistory,
  current: WardrobeProject,
  direction: "undo" | "redo",
): { project: WardrobeProject; history: LookHistory } | null {
  const from = direction === "undo" ? history.past : history.future;
  const target = from.at(-1);
  if (!target || !sameSource(target, current)) return null;
  const project = {
    ...target,
    document: { ...target.document, preview: { ...current.document.preview } },
  };
  const next =
    direction === "undo"
      ? {
          past: history.past.slice(0, -1),
          future: [...history.future, current],
        }
      : {
          past: [...history.past, current],
          future: history.future.slice(0, -1),
        };
  return { project, history: boundLookHistory(next, project) };
}
