import type { Point } from "./pixel-art";
import type { IllustratedLayer, IllustratedLegs } from "./illustrated-types";
import { IllustratedCanvas, type Matrix } from "./illustrated-canvas";

type Sample = { x: number; y: number; s: number };
const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mix = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/** A continuous painted strip replaces independently rotated horizontal cuts.
 * The source pixels, joint targets and footprint remain the original V6 ones.
 * A small rounded bend is confined to the knee; cloth/skin/sock materials come
 * from their own source rows, rather than a generic colored joint disk. */
export function prepareRunningLegParts(
  requireLayer: (id: string) => IllustratedLayer,
  colors: (id: string) => Uint8ClampedArray,
  legs: IllustratedLegs,
) {
  const sources = [false, true].map((near) => {
    const hip = near ? legs.hipNear : legs.hipFar;
    const knee = near ? legs.kneeNear : legs.kneeFar;
    const ankle = near ? legs.ankleNear : legs.ankleFar;
    const texture = new Uint8ClampedArray(192 * 256 * 4);
    for (const id of [
      near ? legs.nearThigh : legs.farThigh,
      near ? legs.nearShin : legs.farShin,
    ]) {
      const layer = requireLayer(id),
        pixels = colors(id);
      for (let y = 0; y < layer.height; y++)
        for (let x = 0; x < layer.width; x++) {
          const p = (y * layer.width + x) * 4;
          if (pixels[p + 3])
            texture.set(
              pixels.subarray(p, p + 4),
              ((y + layer.y) * 192 + x + layer.x) * 4,
            );
        }
    }
    // Shoe pixels already belong to the independently pitched foot. Keeping
    // their duplicate in the shin paints a second shoe along the leg axis.
    const shoe = requireLayer(near ? legs.nearShoe : legs.farShoe);
    const shoePixels = colors(shoe.id);
    for (let y = 0; y < shoe.height; y++)
      for (let x = 0; x < shoe.width; x++) {
        if (!shoePixels[(y * shoe.width + x) * 4 + 3]) continue;
        const p = ((y + shoe.y) * 192 + x + shoe.x) * 4;
        texture.fill(0, p, p + 4);
      }
    return {
      hip,
      knee,
      ankle,
      texture,
      upperLength: dist(hip, knee),
      lowerLength: dist(knee, ankle),
    };
  });
  return (
    canvas: IllustratedCanvas,
    near: boolean,
    h: Point,
    k: Point,
    a: Point,
    shoeMatrix: Matrix,
  ) => {
    const source = sources[near ? 1 : 0];
    const l1 = dist(h, k),
      l2 = dist(k, a),
      r = Math.min(5, l1 / 4, l2 / 4);
    const start = mix(k, h, r / l1),
      end = mix(k, a, r / l2);
    const samples: Sample[] = [];
    const add = (p: Point, s: number) => samples.push({ x: p[0], y: p[1], s });
    const sourceStart = source.upperLength * (1 - r / l1);
    const sourceEnd = source.upperLength + (source.lowerLength * r) / l2;
    for (let t = -10; t <= l1 - r; t += 1)
      add(mix(h, k, t / l1), (source.upperLength * t) / l1);
    add(start, sourceStart);
    for (let step = 1; step <= 12; step++) {
      const t = step / 12;
      add(
        mix(mix(start, k, t), mix(k, end, t), t),
        sourceStart + (sourceEnd - sourceStart) * t,
      );
    }
    for (let t = r + 1; t <= l2 + 4; t += 1)
      add(
        mix(k, a, t / l2),
        source.upperLength + (source.lowerLength * t) / l2,
      );
    const left = Math.max(
      0,
      Math.floor(Math.min(...samples.map((p) => p.x)) - 17),
    );
    const right = Math.min(
      191,
      Math.ceil(Math.max(...samples.map((p) => p.x)) + 17),
    );
    const top = Math.max(
      0,
      Math.floor(Math.min(...samples.map((p) => p.y)) - 17),
    );
    const bottom = Math.min(
      255,
      Math.ceil(Math.max(...samples.map((p) => p.y)) + 17),
    );
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) {
        // Do not extrude the final sampled row beyond either end of the strip.
        const first = samples[0],
          next = samples[1];
        const last = samples[samples.length - 1],
          previous = samples[samples.length - 2];
        if (
          (x - first.x) * (next.x - first.x) +
            (y - first.y) * (next.y - first.y) <
            0 ||
          (x - last.x) * (last.x - previous.x) +
            (y - last.y) * (last.y - previous.y) >
            0
        )
          continue;
        let best = Infinity,
          along = 0,
          across = 0;
        for (let i = 0; i < samples.length - 1; i++) {
          const p = samples[i],
            q = samples[i + 1],
            dx = q.x - p.x,
            dy = q.y - p.y;
          const length2 = dx * dx + dy * dy;
          if (length2 < 1e-8) continue;
          const t = Math.max(
            0,
            Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / length2),
          );
          const ex = x - p.x - dx * t,
            ey = y - p.y - dy * t,
            distance2 = ex * ex + ey * ey;
          if (distance2 < best) {
            best = distance2;
            along = p.s + (q.s - p.s) * t;
            across = ((x - p.x) * dy - (y - p.y) * dx) / Math.sqrt(length2);
          }
        }
        if (best > 17 * 17) continue;
        const upper = along < source.upperLength;
        const from = upper ? source.hip : source.knee,
          to = upper ? source.knee : source.ankle;
        const length = upper ? source.upperLength : source.lowerLength;
        const t = (along - (upper ? 0 : source.upperLength)) / length;
        const center = mix(from, to, t);
        const sx = Math.round(
          center[0] + (across * (to[1] - from[1])) / length,
        );
        const sy = Math.round(
          center[1] - (across * (to[0] - from[0])) / length,
        );
        if (sx < 0 || sx >= 192 || sy < 0 || sy >= 256) continue;
        const p = (sy * 192 + sx) * 4;
        if (source.texture[p + 3])
          canvas.pixels.set(
            source.texture.subarray(p, p + 4),
            (y * 192 + x) * 4,
          );
      }
    const shoeId = near ? legs.nearShoe : legs.farShoe;
    canvas.draw(requireLayer(shoeId), colors(shoeId), shoeMatrix);
  };
}
