import { describe, expect, it } from "vitest";
import {
  beginEdit,
  cancelEdit,
  createHistory,
  finishEdit,
  HISTORY_LIMIT,
  recordEdit,
  redoEdit,
  replaceView,
  undoEdit,
} from "./history";

describe("authoring undo history", () => {
  it("keeps one undo step for a complete pointer gesture, and restores the exact PNG and binding source on undo/redo", () => {
    const image = new Uint8ClampedArray([20, 30, 40, 255]);
    const original = { image, joint: [10, 20], reset: [10, 20] };
    let history = beginEdit(createHistory(original), "Move elbow");
    for (let x = 11; x < 40; x++)
      history = recordEdit(history, { ...original, joint: [x, 20] }, "drag");
    expect(history.past).toHaveLength(0);
    history = finishEdit(history);
    expect(history.past).toHaveLength(1);
    const result = history.present;
    history = undoEdit(history);
    expect(history.present).toBe(original);
    history = redoEdit(history);
    expect(history.present).toBe(result);
    expect(history.present.image).toBe(image);
    expect([...image]).toEqual([20, 30, 40, 255]);
  });
  it("cancels a gesture without destroying an existing redo branch or adding a no-op edit", () => {
    let history = undoEdit(recordEdit(createHistory(1), 2, "Change"));
    history = recordEdit(beginEdit(history, "Drag"), 8, "Move");
    history = cancelEdit(history);
    expect(history.present).toBe(1);
    expect(history.past).toHaveLength(0);
    expect(redoEdit(history).present).toBe(2);
    expect(finishEdit(beginEdit(history, "No movement")).past).toHaveLength(0);
  });
  it("bounds retained edits and invalidates redo only after an actual edit, not preview navigation", () => {
    let history = createHistory({ pose: 0, preview: "idle" });
    for (let pose = 1; pose <= 45; pose++)
      history = recordEdit(history, { pose, preview: "idle" }, `Pose ${pose}`);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    history = undoEdit(history);
    history = replaceView(history, { ...history.present, preview: "run" });
    expect(history.future).toHaveLength(1);
    expect(recordEdit(history, history.present, "No change")).toBe(history);
    history = recordEdit(history, { pose: 7, preview: "run" }, "New branch");
    expect(history.future).toHaveLength(0);
    expect(undoEdit(history).present).toEqual({ pose: 44, preview: "run" });
  });
});
