import type { RgbaPng } from "../core/baked-source";
import type {
  Point,
  Rect,
  RegisteredFrame,
  WardrobeAnchorName,
  WardrobeSlot,
} from "../wardrobe/contract";

export type FittingRegion =
  | "collar"
  | "nearSleeve"
  | "farSleeve"
  | "nearCuff"
  | "farCuff"
  | "hem";

export interface FittingTemporalChange {
  region: FittingRegion;
  label: string;
  /** Mean coverage change in the same anatomy-aligned window, not pixel drift. */
  garmentChange: number;
  /** Original-source RGBA change in that window; retained even when suppressed. */
  sourceChange: number;
  excessChange: number;
  status: "review" | "source-motion" | "insufficient" | "stable";
  currentBounds: Rect;
  nextBounds: Rect;
  estimatedAnchors: boolean;
}

interface RegionWindow {
  region: FittingRegion;
  label: string;
  center: Point;
  down: Point;
  across: Point;
  halfWidth: number;
  halfHeight: number;
  estimated: boolean;
}

interface RegionSample {
  region: FittingRegion;
  label: string;
  bounds: Rect;
  estimated: boolean;
  /** 0–255 mean painted ownership coverage, four samples per cell. */
  garment: Uint8Array;
  /** Premultiplied original RGBA; transparent RGB never influences a score. */
  source: Uint8Array;
  valid: number;
}
export type FittingTemporalProfile = RegionSample[];

const SIZE = 24,
  CELLS = SIZE * SIZE;
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
function axis(from: Point, to: Point): Point | null {
  const length = distance(from, to);
  return length < 2
    ? null
    : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

/** Windows follow the existing guides; they never move or redraw artwork.
 * Missing/degenerate guides produce no synthetic measurement. */
function windows(frame: RegisteredFrame, slot: WardrobeSlot): RegionWindow[] {
  const p = frame.points;
  const has = (...keys: WardrobeAnchorName[]) =>
    keys.every(
      (key) => p[key] && Number.isFinite(p[key].x) && Number.isFinite(p[key].y),
    );
  if (!has("neck", "waistLeft", "waistRight")) return [];
  const waist = midpoint(p.waistLeft, p.waistRight),
    down = axis(p.neck, waist),
    torso = distance(p.neck, waist);
  if (!down || torso < 8) return [];
  const result: RegionWindow[] = [];
  function add(
    region: FittingRegion,
    label: string,
    center: Point,
    direction: Point,
    halfWidth: number,
    halfHeight: number,
    anchors: WardrobeAnchorName[],
  ) {
    result.push({
      region,
      label,
      center,
      down: direction,
      across: { x: direction.y, y: -direction.x },
      halfWidth: Math.max(4, halfWidth),
      halfHeight: Math.max(4, halfHeight),
      estimated: anchors.some(
        (key) =>
          p[key].visibility !== "visible" || (p[key].confidence ?? 1) < 0.6,
      ),
    });
  }
  if (slot === "top" || slot === "fullBody") {
    add(
      "collar",
      "领口",
      {
        x: p.neck.x + down.x * torso * 0.1,
        y: p.neck.y + down.y * torso * 0.1,
      },
      down,
      torso * 0.42,
      torso * 0.22,
      ["neck", "waistLeft", "waistRight"],
    );
    for (const side of ["near", "far"] as const) {
      const shoulder = `${side}Shoulder` as const,
        elbow = `${side}Elbow` as const,
        wrist = `${side}Wrist` as const;
      if (has(shoulder, elbow)) {
        const direction = axis(p[shoulder], p[elbow]);
        if (direction)
          add(
            `${side}Sleeve`,
            side === "near" ? "近侧袖身" : "远侧袖身",
            midpoint(p[shoulder], p[elbow]),
            direction,
            torso * 0.3,
            distance(p[shoulder], p[elbow]) * 0.65,
            [shoulder, elbow],
          );
      }
      if (has(elbow, wrist)) {
        const direction = axis(p[elbow], p[wrist]);
        if (direction)
          add(
            `${side}Cuff`,
            side === "near" ? "近侧袖口" : "远侧袖口",
            {
              x: p[wrist].x - direction.x * torso * 0.1,
              y: p[wrist].y - direction.y * torso * 0.1,
            },
            direction,
            torso * 0.22,
            torso * 0.25,
            [elbow, wrist],
          );
      }
    }
  }
  if (slot === "top") {
    add(
      "hem",
      "下摆",
      waist,
      down,
      Math.max(torso * 0.55, distance(p.waistLeft, p.waistRight) * 0.7),
      torso * 0.18,
      ["neck", "waistLeft", "waistRight"],
    );
  } else if (
    (slot === "bottom" || slot === "fullBody") &&
    has("nearKnee", "farKnee")
  ) {
    // A knee-centered band suits shorts and skirts; it does not promise to find
    // the exact hem of every future floor-length dress or trouser garment.
    const knees = midpoint(p.nearKnee, p.farKnee);
    add(
      "hem",
      "下摆",
      knees,
      down,
      Math.max(torso * 0.85, distance(p.nearKnee, p.farKnee) * 0.7),
      torso * 0.36,
      ["neck", "waistLeft", "waistRight", "nearKnee", "farKnee"],
    );
  }
  return result;
}

function bounds(window: RegionWindow, width: number, height: number): Rect {
  const dx =
      Math.abs(window.across.x) * window.halfWidth +
      Math.abs(window.down.x) * window.halfHeight,
    dy =
      Math.abs(window.across.y) * window.halfWidth +
      Math.abs(window.down.y) * window.halfHeight,
    x = Math.max(0, Math.floor(window.center.x - dx)),
    y = Math.max(0, Math.floor(window.center.y - dy));
  return {
    x,
    y,
    width: Math.max(0, Math.min(width, Math.ceil(window.center.x + dx)) - x),
    height: Math.max(0, Math.min(height, Math.ceil(window.center.y + dy)) - y),
  };
}

/** Keep only tiny sampled windows per pose; never retain decoded frame images.
 * Four subcell samples reduce single-pixel/antialiasing jitter in the score. */
export function fittingTemporalProfile(
  frame: RegisteredFrame,
  slot: WardrobeSlot,
  cloth: RgbaPng,
  ownership: RgbaPng,
  source: RgbaPng,
): FittingTemporalProfile {
  const { width, height } = cloth;
  if (
    [cloth, ownership, source].some(
      (p) =>
        p.width !== width ||
        p.height !== height ||
        p.pixels.length !== width * height * 4,
    )
  )
    throw Error("邻帧检查需要相同的原生画布尺寸。");
  return windows(frame, slot).map((window) => {
    const garment = new Uint8Array(CELLS),
      original = new Uint8Array(CELLS * 4);
    let valid = 0;
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        let cover = 0,
          red = 0,
          green = 0,
          blue = 0,
          alpha = 0;
        for (const oy of [0.25, 0.75])
          for (const ox of [0.25, 0.75]) {
            const u = (((x + ox) / SIZE) * 2 - 1) * window.halfWidth,
              v = (((y + oy) / SIZE) * 2 - 1) * window.halfHeight,
              px = Math.floor(
                window.center.x + window.across.x * u + window.down.x * v,
              ),
              py = Math.floor(
                window.center.y + window.across.y * u + window.down.y * v,
              );
            if (px < 0 || py < 0 || px >= width || py >= height) continue;
            valid++;
            const at = (py * width + px) * 4,
              a = source.pixels[at + 3] / 255;
            if (ownership.pixels[at]) cover += cloth.pixels[at + 3];
            red += source.pixels[at] * a;
            green += source.pixels[at + 1] * a;
            blue += source.pixels[at + 2] * a;
            alpha += source.pixels[at + 3];
          }
        const cell = y * SIZE + x;
        garment[cell] = Math.round(cover / 4);
        original.set(
          [
            Math.round(red / 4),
            Math.round(green / 4),
            Math.round(blue / 4),
            Math.round(alpha / 4),
          ],
          cell * 4,
        );
      }
    return {
      region: window.region,
      label: window.label,
      bounds: bounds(window, width, height),
      estimated: window.estimated,
      garment,
      source: original,
      valid: valid / (CELLS * 4),
    };
  });
}

export function compareFittingTemporal(
  current: FittingTemporalProfile,
  next: FittingTemporalProfile,
): FittingTemporalChange[] {
  return current.flatMap((a) => {
    const b = next.find((sample) => sample.region === a.region);
    if (!b) return [];
    let cloth = 0,
      source = 0,
      painted = 0;
    for (let i = 0; i < CELLS; i++) {
      cloth += Math.abs(a.garment[i] - b.garment[i]) / 255;
      painted += Math.max(a.garment[i], b.garment[i]) / 255;
      const at = i * 4;
      source +=
        Math.max(
          Math.abs(a.source[at] - b.source[at]),
          Math.abs(a.source[at + 1] - b.source[at + 1]),
          Math.abs(a.source[at + 2] - b.source[at + 2]),
          Math.abs(a.source[at + 3] - b.source[at + 3]),
        ) / 255;
    }
    const garmentChange = cloth / CELLS,
      sourceChange = source / CELLS,
      excessChange = Math.max(0, garmentChange - sourceChange),
      estimatedAnchors = a.estimated || b.estimated,
      // Hidden guides get a more conservative threshold. These are inspection
      // priorities, not proof that a frame passes or fails artistic acceptance.
      significant = garmentChange >= (estimatedAnchors ? 0.2 : 0.14),
      status: FittingTemporalChange["status"] =
        Math.min(a.valid, b.valid) < 0.9 || painted < CELLS * 0.025
          ? "insufficient"
          : !significant
            ? "stable"
            : excessChange < 0.09 || sourceChange >= garmentChange * 0.7
              ? "source-motion"
              : "review";
    const round = (n: number) => Math.round(n * 10000) / 10000;
    return [
      {
        region: a.region,
        label: a.label,
        garmentChange: round(garmentChange),
        sourceChange: round(sourceChange),
        excessChange: round(excessChange),
        status,
        currentBounds: a.bounds,
        nextBounds: b.bounds,
        estimatedAnchors,
      },
    ];
  });
}
