/** Bounded immutable authoring history. Values may share large, read-only PNG
 * buffers: edits replace them rather than copying every image on every step. */
export interface EditHistory<T> {
  present: T;
  past: { value: T; label: string }[];
  future: { value: T; label: string }[];
  transaction?: { before: T; label: string };
}
export const HISTORY_LIMIT = 20;
export function createHistory<T>(value: T): EditHistory<T> {
  return { present: value, past: [], future: [] };
}
export function recordEdit<T>(
  history: EditHistory<T>,
  next: T,
  label: string,
): EditHistory<T> {
  if (next === history.present) return history;
  if (history.transaction) return { ...history, present: next };
  return {
    present: next,
    past: [...history.past, { value: history.present, label }].slice(
      -HISTORY_LIMIT,
    ),
    future: [],
  };
}
/** Preview selections are saved in the project, but do not consume undo steps
 * or clear redo. Never use this for an artwork, binding or motion edit. */
export function replaceView<T>(
  history: EditHistory<T>,
  next: T,
): EditHistory<T> {
  return { ...history, present: next };
}
export function beginEdit<T>(
  history: EditHistory<T>,
  label: string,
): EditHistory<T> {
  if (history.transaction) return history;
  return { ...history, transaction: { before: history.present, label } };
}
export function finishEdit<T>(history: EditHistory<T>): EditHistory<T> {
  const { transaction, ...rest } = history;
  if (!transaction || transaction.before === history.present) return rest;
  return {
    ...rest,
    past: [
      ...history.past,
      { value: transaction.before, label: transaction.label },
    ].slice(-HISTORY_LIMIT),
    future: [],
  };
}
export function cancelEdit<T>(history: EditHistory<T>): EditHistory<T> {
  const { transaction, ...rest } = history;
  return transaction ? { ...rest, present: transaction.before } : rest;
}
export function undoEdit<T>(history: EditHistory<T>): EditHistory<T> {
  if (history.transaction) return cancelEdit(history);
  const last = history.past.at(-1);
  if (!last) return history;
  return {
    present: last.value,
    past: history.past.slice(0, -1),
    future: [...history.future, { value: history.present, label: last.label }],
  };
}
export function redoEdit<T>(history: EditHistory<T>): EditHistory<T> {
  if (history.transaction) return history;
  const next = history.future.at(-1);
  if (!next) return history;
  return {
    present: next.value,
    past: [
      ...history.past,
      { value: history.present, label: next.label },
    ].slice(-HISTORY_LIMIT),
    future: history.future.slice(0, -1),
  };
}
