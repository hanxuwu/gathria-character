import { FRAME_HEIGHT, FRAME_WIDTH, type Point } from "./types";

export interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BindingDrag {
  /** Keep where the handle was grabbed; pressing its edge must not move it. */
  grabOffset: Point;
  lastPoint: Point;
  changed: boolean;
}

const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

export function clampJoint(point: Point): Point {
  return [
    Math.min(FRAME_WIDTH - 1, Math.max(0, Math.round(point[0]))),
    Math.min(FRAME_HEIGHT - 1, Math.max(0, Math.round(point[1]))),
  ];
}

/** Use actual CSS bounds, including responsive sizing and browser zoom. */
export function pointerInSource(pointer: Point, bounds: CanvasBounds): Point {
  if (
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new Error("The binding canvas must have a visible size.");
  }
  return [
    ((pointer[0] - bounds.left) * FRAME_WIDTH) / bounds.width,
    ((pointer[1] - bounds.top) * FRAME_HEIGHT) / bounds.height,
  ];
}

export function beginBindingDrag(
  joint: Point,
  pointer: Point,
  bounds: CanvasBounds,
): BindingDrag {
  const local = pointerInSource(pointer, bounds);
  return {
    grabOffset: [local[0] - joint[0], local[1] - joint[1]],
    lastPoint: [...joint],
    changed: false,
  };
}

export function advanceBindingDrag(
  drag: BindingDrag,
  pointer: Point,
  bounds: CanvasBounds,
): { drag: BindingDrag; point: Point; changed: boolean; begin: boolean } {
  const local = pointerInSource(pointer, bounds);
  const point = clampJoint([
    local[0] - drag.grabOffset[0],
    local[1] - drag.grabOffset[1],
  ]);
  const changed = !samePoint(point, drag.lastPoint);
  return {
    drag: changed ? { ...drag, lastPoint: point, changed: true } : drag,
    point,
    changed,
    begin: changed && !drag.changed,
  };
}

/** The owner stores the original project, so cancellation restores all edits. */
export function finishBindingDrag(
  drag: BindingDrag,
  cancel: boolean,
): "none" | "commit" | "cancel" {
  return drag.changed ? (cancel ? "cancel" : "commit") : "none";
}

export function nudgeJoint(
  point: Point,
  key: string,
  coarse = false,
): Point | null {
  const step = coarse ? 10 : 1;
  const delta: Record<string, Point> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  if (!delta[key]) return null;
  const result = clampJoint([
    point[0] + delta[key][0],
    point[1] + delta[key][1],
  ]);
  return samePoint(point, result) ? null : result;
}
