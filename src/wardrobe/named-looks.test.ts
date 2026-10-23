import { expect, it } from "vitest";
import type { WardrobeProject } from "./contract";
import {
  captureNamedLook,
  checkLookSource,
  exactLookAsset,
  readNamedLooks,
  writeNamedLooks,
} from "./named-looks";
const project = {
  document: {
    sourceSha256: "a".repeat(64),
    registrationSha256: "b".repeat(64),
    items: [
      { id: "shirt", sha256: "c".repeat(64) },
      { id: "unused", sha256: "d".repeat(64) },
    ],
    selection: { top: "shirt", bottom: null, fullBody: null, shoes: null },
    preview: { action: "run", facing: "left" },
  },
} as WardrobeProject;
const look = () =>
  captureNamedLook(project, "male", " Morning walk ", "look-1");
it("stores only selected references and preserves the exact source, action and facing", () => {
  const saved = readNamedLooks(writeNamedLooks([look()]))[0];
  expect(saved.name).toBe("Morning walk");
  expect(saved.items).toEqual([project.document.items[0]]);
  expect(saved.preview).toEqual({ action: "run", facing: "left" });
  expect(saved.appearance).toBeNull();
  expect(readNamedLooks(null)).toEqual([]);
  expect(
    readNamedLooks(writeNamedLooks([{ ...look(), id: "custom.look-v2" }]))[0]
      .id,
  ).toBe("custom.look-v2");
});
it("refuses foreign anchors and unavailable hashes even if the display id matches", () => {
  expect(() =>
    checkLookSource({ ...look(), registrationSha256: "f".repeat(64) }, project),
  ).toThrow("anchor revision");
  expect(() =>
    exactLookAsset(look().items[0], [{ id: "shirt", sha256: "f".repeat(64) }]),
  ).toThrow("no replacement");
  expect(
    exactLookAsset(look().items[0], [{ ...look().items[0], url: "exact.zip" }])
      .url,
  ).toBe("exact.zip");
});
it("rejects damaged recipes, duplicate ids, excessive counts and invalid body combinations", () => {
  expect(() => readNamedLooks("broken")).toThrow();
  expect(() => writeNamedLooks([look(), look()])).toThrow();
  expect(() =>
    writeNamedLooks(
      Array.from({ length: 13 }, (_, i) => ({ ...look(), id: `look-${i}` })),
    ),
  ).toThrow();
  expect(() => writeNamedLooks([{ ...look(), sourceSha256: "bad" }])).toThrow();
  expect(() =>
    writeNamedLooks([
      { ...look(), selection: { ...look().selection, fullBody: "shirt" } },
    ]),
  ).toThrow();
  expect(() =>
    writeNamedLooks([{ ...look(), name: "x".repeat(61) }]),
  ).toThrow();
});
