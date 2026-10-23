import { expect, it } from "vitest";
import type { WardrobeProject, WardrobeGarment } from "./contract";
import { retainOutfitAndCustomItems } from "./library-inventory";
const item = (id: string, sha256: string) =>
  ({ manifest: { id }, sha256 }) as WardrobeGarment;
function project(): WardrobeProject {
  return {
    items: [
      item("worn", "a"),
      item("old", "b"),
      item("collision", "custom"),
      item("imported", "c"),
    ],
    document: {
      version: 1,
      selection: { top: "worn", bottom: null, fullBody: null, shoes: null },
      items: [],
    },
  } as unknown as WardrobeProject;
}
it("releases only inactive exact library copies and preserves custom imports even with colliding IDs", () => {
  const input = project();
  const result = retainOutfitAndCustomItems(input, [
    { id: "worn", sha256: "a" },
    { id: "old", sha256: "b" },
    { id: "collision", sha256: "released" },
  ]);
  expect(result.items.map((i) => i.manifest.id)).toEqual([
    "worn",
    "collision",
    "imported",
  ]);
  expect(result.document.items).toEqual(
    result.items.map((i) => ({ id: i.manifest.id, sha256: i.sha256 })),
  );
  expect(result.document.selection).toBe(input.document.selection);
  expect(input.items).toHaveLength(4);
});
it("does not discard saved assets when catalog hashes are absent or differ", () => {
  const input = project();
  expect(
    retainOutfitAndCustomItems(input, [
      { id: "old" },
      { id: "collision", sha256: "released" },
    ]),
  ).toBe(input);
  expect(retainOutfitAndCustomItems(input, [])).toBe(input);
});
