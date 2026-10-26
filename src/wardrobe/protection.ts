import type {
  Point,
  ProtectedRegion,
  RegisteredFrame,
  WardrobeGarmentManifest,
} from "./contract";
import { reviewedNecklineAt } from "./neckline-permissions";

export type ProtectionSpan = {
  left: number;
  right: number;
  label: ProtectedRegion["label"];
};
export type ProtectionRows = Map<number, ProtectionSpan[]>;
/** Compact scanline intervals, not a full RGBA/mask image per pose. Polygon
 * work occurs once per registration, never once per clothing pixel per frame. */
export function prepareProtection(regions: ProtectedRegion[]): ProtectionRows {
  const rows: ProtectionRows = new Map();
  for (const region of regions) {
    const polygon = region.polygon;
    const top = Math.max(
      0,
      Math.ceil(Math.min(...polygon.map((p) => p.y)) - 0.5),
    );
    const bottom = Math.floor(Math.max(...polygon.map((p) => p.y)) - 0.5);
    for (let y = top; y <= bottom; y++) {
      const cy = y + 0.5,
        crossings: number[] = [];
      const spans = rows.get(y) ?? [];
      const add = (a: number, b: number) => {
        const left = Math.ceil(Math.min(a, b) - 0.5 - 1e-9);
        const right = Math.floor(Math.max(a, b) - 0.5 + 1e-9);
        if (left <= right) spans.push({ left, right, label: region.label });
      };
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j],
          b = polygon[i];
        if (a.y > cy !== b.y > cy)
          crossings.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
        // Exact horizontal edges and vertex centers are protected as boundaries.
        if (Math.abs(a.y - cy) < 1e-9 && Math.abs(b.y - cy) < 1e-9)
          add(a.x, b.x);
        else if (Math.abs(a.y - cy) < 1e-9) add(a.x, a.x);
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        add(crossings[i], crossings[i + 1]);
      if (spans.length) rows.set(y, spans);
    }
  }
  return rows;
}

export function protectedAt(
  x: number,
  spans: ProtectionSpan[] | undefined,
): string | undefined {
  for (const span of spans ?? [])
    if (x >= span.left && x <= span.right) return span.label;
}

/** An explicit V3 garment may replace only source-bound, pre-reviewed cloth
 * pixels inside the original head polygon. Overlapping hands remain protected.
 * No profile changes the shared registration or appearance-layer protection. */
export function protectedClothingAt(
  frameId: number,
  x: number,
  y: number,
  spans: ProtectionSpan[] | undefined,
  item: WardrobeGarmentManifest,
): string | undefined {
  for (const span of spans ?? []) {
    if (x < span.left || x > span.right) continue;
    if (span.label === "head" && reviewedNecklineAt(item, frameId, x, y))
      continue;
    return span.label;
  }
}

/** Check raster coverage as well as vertices: a concave original polygon may
 * have an unprotected gap between two otherwise valid review vertices. */
export function assertHandReviewSubset(
  original: ProtectedRegion,
  polygon: Point[],
): void {
  const before = prepareProtection([original]);
  const after = prepareProtection([{ label: original.label, polygon }]);
  let pixels = 0;
  for (const [y, spans] of after) {
    for (const span of spans) {
      for (let x = span.left; x <= span.right; x++) {
        if (!protectedAt(x, before.get(y)))
          throw Error(
            "Reviewed hand protection must stay inside its original registered region.",
          );
        pixels++;
      }
    }
  }
  if (!pixels)
    throw Error(
      "Reviewed hand protection must retain a visible, nonempty protected region.",
    );
}

/** Reviews belong to one clothing item. They never relax protection for other
 * garments or appearance layers, or rewrite the shared registration. */
export function reviewedRegions(
  frame: RegisteredFrame,
  item: WardrobeGarmentManifest,
): ProtectedRegion[] {
  return frame.protected.map((region) => {
    const review = item.handProtectionReviews?.find(
      (r) => r.frameId === frame.frameId && r.label === region.label,
    );
    return review ? { label: region.label, polygon: review.polygon } : region;
  });
}
