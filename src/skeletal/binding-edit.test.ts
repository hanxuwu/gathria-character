import { describe, expect, it } from "vitest";
import {
  advanceBindingDrag,
  beginBindingDrag,
  clampJoint,
  finishBindingDrag,
  nudgeJoint,
  pointerInSource,
} from "./binding-edit";

describe("source joint editing", () => {
  it("maps displayed CSS coordinates to native pixels at integer and responsive scales", () => {
    for (const scale of [1, 2, 0.75, 1.25]) {
      const bounds = {
        left: 32,
        top: 17,
        width: 192 * scale,
        height: 256 * scale,
      };
      expect(
        pointerInSource([32 + 75 * scale, 17 + 122 * scale], bounds),
      ).toEqual([75, 122]);
      const drag = beginBindingDrag(
        [75, 122],
        [32 + 78 * scale, 17 + 125 * scale],
        bounds,
      );
      const move = advanceBindingDrag(
        drag,
        [32 + 81 * scale, 17 + 130 * scale],
        bounds,
      );
      expect(move.point).toEqual([78, 127]);
    }
  });

  it("preserves the grab offset, begins only on an actual move, and commits the entire drag once", () => {
    const bounds = { left: 10, top: 20, width: 384, height: 512 };
    const initial = beginBindingDrag([75, 122], [165, 268], bounds);
    const click = advanceBindingDrag(initial, [165, 268], bounds);
    expect(click.changed).toBe(false);
    expect(finishBindingDrag(click.drag, false)).toBe("none");
    const first = advanceBindingDrag(click.drag, [169, 272], bounds);
    expect(first).toMatchObject({
      point: [77, 124],
      changed: true,
      begin: true,
    });
    const next = advanceBindingDrag(first.drag, [173, 280], bounds);
    expect(next).toMatchObject({
      point: [79, 128],
      changed: true,
      begin: false,
    });
    expect(finishBindingDrag(next.drag, false)).toBe("commit");
    expect(finishBindingDrag(next.drag, true)).toBe("cancel");
    expect(finishBindingDrag(initial, true)).toBe("none");
  });

  it("rounds and clamps at source edges without repeated changes outside the canvas", () => {
    const bounds = { left: 0, top: 0, width: 192, height: 256 };
    const drag = beginBindingDrag([75, 122], [75, 122], bounds);
    const edge = advanceBindingDrag(drag, [-500, 500], bounds);
    expect(edge.point).toEqual([0, 255]);
    expect(advanceBindingDrag(edge.drag, [-501, 501], bounds).changed).toBe(
      false,
    );
    expect(clampJoint([75.4, 121.7])).toEqual([75, 122]);
    expect(clampJoint([999, -1])).toEqual([191, 0]);
    expect(() => pointerInSource([1, 2], { ...bounds, width: 0 })).toThrow(
      /visible size/,
    );
  });

  it("nudges by one or ten native pixels and does not edit for unrelated keys or blocked movement", () => {
    expect(nudgeJoint([75, 122], "ArrowRight")).toEqual([76, 122]);
    expect(nudgeJoint([75, 122], "ArrowUp", true)).toEqual([75, 112]);
    expect(nudgeJoint([5, 250], "ArrowDown", true)).toEqual([5, 255]);
    expect(nudgeJoint([0, 122], "ArrowLeft")).toBeNull();
    expect(nudgeJoint([75, 122], "Escape")).toBeNull();
  });
});
