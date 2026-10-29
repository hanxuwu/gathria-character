import { describe, expect, it } from "vitest";
import { sideKeyboardIntent } from "./input";

describe("side-view held-key intent", () => {
  it("uses the newest movement key still held after an alias is released", () => {
    const keys = new Set(["ArrowLeft", "ArrowRight", "KeyA"]);
    expect(sideKeyboardIntent(keys)).toEqual({
      action: "walk",
      facing: "left",
    });
    keys.delete("KeyA");
    expect(sideKeyboardIntent(keys)).toEqual({
      action: "walk",
      facing: "right",
    });
    keys.delete("ArrowRight");
    expect(sideKeyboardIntent(keys)).toEqual({
      action: "walk",
      facing: "left",
    });
    keys.clear();
    expect(sideKeyboardIntent(keys)).toEqual({ action: "idle", facing: null });
  });

  it("retains keydown order on repeated Set insertion and updates it after a new press", () => {
    const keys = new Set(["KeyD", "KeyA"]);
    keys.add("KeyD");
    expect(sideKeyboardIntent(keys).facing).toBe("left");
    keys.delete("KeyD");
    keys.add("KeyD");
    expect(sideKeyboardIntent(keys).facing).toBe("right");
    expect([...keys]).toEqual(["KeyA", "KeyD"]);
  });

  it("keeps run intent until both Shift keys are released without changing facing", () => {
    const keys = new Set(["ShiftLeft", "ArrowRight", "ShiftRight"]);
    expect(sideKeyboardIntent(keys)).toEqual({
      action: "run",
      facing: "right",
    });
    keys.delete("ShiftRight");
    expect(sideKeyboardIntent(keys)).toEqual({
      action: "run",
      facing: "right",
    });
    keys.delete("ShiftLeft");
    expect(sideKeyboardIntent(keys)).toEqual({
      action: "walk",
      facing: "right",
    });
  });

  it("does not turn a jump key, modifier, or unrelated key into movement", () => {
    expect(sideKeyboardIntent(["Space", "ShiftLeft", "KeyW"])).toEqual({
      action: "idle",
      facing: null,
    });
    expect(sideKeyboardIntent(["KeyA", "Space", "ShiftRight"])).toEqual({
      action: "run",
      facing: "left",
    });
  });
});
