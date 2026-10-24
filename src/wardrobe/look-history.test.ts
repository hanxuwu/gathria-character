import { expect, it } from "vitest";
import type { WardrobeProject, WardrobeGarment } from "./contract";
import {
  emptyLookHistory,
  recordLookChange,
  moveLookHistory,
  boundLookHistory,
  retainedHistoryBytes,
} from "./look-history";

const garment = (id: string): WardrobeGarment =>
  ({
    manifest: { id },
    bytes: new Uint8Array(10),
    sha256: id,
    pages: [{ patch: new Uint8Array(5), ownership: new Uint8Array(5) }],
  }) as WardrobeGarment;
function project(item = garment("custom-v1")): WardrobeProject {
  return {
    items: [item],
    document: {
      version: 1,
      sourceSha256: "source",
      registrationSha256: "anchors",
      items: [{ id: item.manifest.id, sha256: item.sha256 }],
      selection: {
        top: item.manifest.id,
        bottom: null,
        fullBody: null,
        shoes: null,
      },
      preview: { action: "idle", facing: "right" },
    },
  } as WardrobeProject;
}
it("keeps exact imported assets after inventory pruning and preserves current preview on undo/redo", () => {
  const first = project(),
    next = project(garment("custom-v2"));
  const history = recordLookChange(emptyLookHistory(), first, next);
  const open = {
    ...next,
    document: {
      ...next.document,
      preview: { action: "run" as const, facing: "left" as const },
    },
  };
  const undo = moveLookHistory(history, open, "undo")!;
  expect(undo.project.items[0]).toBe(first.items[0]);
  expect(undo.project.document.preview).toEqual(open.document.preview);
  const redo = moveLookHistory(undo.history, undo.project, "redo")!;
  expect(redo.project.items[0]).toBe(next.items[0]);
  expect(first.document.preview.action).toBe("idle");
  expect(history.past).toEqual([first]); // proposal never mutates accepted history
});
it("clears redo only for a new styling edit and never crosses source or anchor revisions", () => {
  const a = project(),
    b = project(garment("b"));
  const undo = moveLookHistory(
    recordLookChange(emptyLookHistory(), a, b),
    b,
    "undo",
  )!;
  const same = {
    ...a,
    document: {
      ...a.document,
      preview: { action: "walk" as const, facing: "left" as const },
    },
  };
  expect(recordLookChange(undo.history, a, same)).toBe(undo.history);
  expect(
    recordLookChange(undo.history, a, project(garment("c"))).future,
  ).toEqual([]);
  const foreign = {
    ...a,
    document: { ...a.document, registrationSha256: "other" },
  };
  expect(recordLookChange(undo.history, a, foreign)).toEqual(
    emptyLookHistory(),
  );
  expect(moveLookHistory(undo.history, foreign, "redo")).toBeNull();
});
it("bounds retained bytes with shared buffers counted once and evicts farthest history", () => {
  const a = project(),
    b = project(garment("b")),
    c = project(garment("c"));
  const history = { past: [a, { ...a }, b], future: [] };
  expect(retainedHistoryBytes(history, c)).toBe(40);
  expect(retainedHistoryBytes(history, a)).toBe(20);
  expect(boundLookHistory(history, c, { steps: 12, bytes: 20 }).past).toEqual([
    b,
  ]);
  expect(boundLookHistory(history, c, { steps: 1, bytes: 100 }).past).toEqual([
    b,
  ]);
  expect(boundLookHistory(history, c, { steps: 12, bytes: 0 })).toEqual(
    emptyLookHistory(),
  );
});
