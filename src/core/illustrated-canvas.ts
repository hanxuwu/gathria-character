import { unzlibSync } from "fflate";
import type { ArtV3CharacterConfig } from "./types";
import type { Point } from "./pixel-art";
import {
  MATERIAL_NAMES,
  type IllustratedLayer,
  type IllustratedMaterial,
} from "./illustrated-types";

export type Matrix = readonly [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function translated(dx = 0, dy = 0): Matrix {
  return [1, 0, 0, 1, dx, dy];
}

/** Maps an original bone onto a posed bone, preserving its original thickness. */
export function boneTransform(
  from: Point,
  to: Point,
  posedFrom: Point,
  posedTo: Point,
): Matrix {
  const sx = to[0] - from[0],
    sy = to[1] - from[1];
  const tx = posedTo[0] - posedFrom[0],
    ty = posedTo[1] - posedFrom[1];
  const sourceLength = Math.hypot(sx, sy),
    targetLength = Math.hypot(tx, ty);
  const ux = sx / sourceLength,
    uy = sy / sourceLength;
  const vx = tx / targetLength,
    vy = ty / targetLength;
  const stretch = targetLength / sourceLength;
  const a = stretch * vx * ux + vy * uy;
  const b = stretch * vy * ux - vx * uy;
  const c = stretch * vx * uy - vy * ux;
  const d = stretch * vy * uy + vx * ux;
  return [
    a,
    b,
    c,
    d,
    posedFrom[0] - a * from[0] - c * from[1],
    posedFrom[1] - b * from[0] - d * from[1],
  ];
}

const rawCache = new Map<string, Uint8Array>();
function decode(layer: IllustratedLayer): Uint8Array {
  let bytes = rawCache.get(layer.id);
  if (!bytes) {
    bytes = unzlibSync(
      Uint8Array.from(atob(layer.data), (char) => char.charCodeAt(0)),
    );
    if (bytes.length !== layer.width * layer.height * 5)
      throw new Error(
        `Illustrated layer ${layer.id} has invalid packed dimensions.`,
      );
    rawCache.set(layer.id, bytes);
  }
  return bytes;
}

function rgb(hex: string) {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
}
function luminance(channels: number[]) {
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

/** Preserve the source illustration's shadows, highlights and fine texture while
 * changing only explicitly masked materials. Eyes, stitching and jewelry stay fixed. */
export function colorLayer(
  layer: IllustratedLayer,
  config: ArtV3CharacterConfig,
): Uint8ClampedArray {
  const packed = decode(layer);
  const output = new Uint8ClampedArray(layer.width * layer.height * 4);
  const target: Record<IllustratedMaterial, string> = {
    skin: config.skinTone,
    hair: config.hairColor,
    upper: config.upperColor,
    lower: config.lowerColor,
    shoe: config.shoeColor,
  };
  const colors = Object.fromEntries(
    Object.entries(target).map(([name, hex]) => [name, rgb(hex)]),
  ) as Record<IllustratedMaterial, number[]>;
  const bases = Object.fromEntries(
    Object.entries(layer.palette).map(([name, hex]) => [
      name,
      luminance(rgb(hex!)),
    ]),
  ) as Partial<Record<IllustratedMaterial, number>>;
  for (let i = 0; i < layer.width * layer.height; i++) {
    const source = i * 5,
      dest = i * 4;
    if (packed[source + 3] === 0) continue;
    const material = MATERIAL_NAMES[packed[source + 4]];
    if (material === "fixed" || !material || !bases[material]) {
      output.set(packed.subarray(source, source + 4), dest);
      continue;
    }
    const light = luminance([
      packed[source],
      packed[source + 1],
      packed[source + 2],
    ]);
    const base = bases[material]!;
    const shade = light / base;
    const highlight = Math.max(0, (light - base) / (255 - base));
    const color = colors[material];
    for (let channel = 0; channel < 3; channel++) {
      output[dest + channel] =
        light <= base
          ? color[channel] * shade
          : color[channel] + (255 - color[channel]) * highlight;
    }
    output[dest + 3] = 255;
  }
  return output;
}

export interface LayerWarp {
  /** Optional inverse warp in original frame coordinates, after the bone transform. */
  inverse?: (x: number, y: number) => Point;
  margin?: number;
}

export class IllustratedCanvas {
  readonly width = 192;
  readonly height = 256;
  readonly pixels = new Uint8ClampedArray(this.width * this.height * 4);

  /** Nearest-neighbor posing can separate a one-pixel fringe from a lace or hair
   * edge. Remove only tiny isolated sampling flecks, never disconnected limbs. */
  removeSamplingFlecks() {
    const seen = new Uint8Array(this.width * this.height);
    for (let start = 0; start < seen.length; start++) {
      if (seen[start] || !this.pixels[start * 4 + 3]) continue;
      const pending = [start],
        component: number[] = [];
      seen[start] = 1;
      while (pending.length) {
        const point = pending.pop()!;
        component.push(point);
        const x = point % this.width,
          y = Math.floor(point / this.width);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height)
              continue;
            const next = ny * this.width + nx;
            if (!seen[next] && this.pixels[next * 4 + 3]) {
              seen[next] = 1;
              pending.push(next);
            }
          }
        }
      }
      if (component.length <= 8)
        for (const point of component)
          this.pixels.fill(0, point * 4, point * 4 + 4);
    }
  }

  draw(
    layer: IllustratedLayer,
    pixels: Uint8ClampedArray,
    matrix: Matrix = identity,
    warp: LayerWarp = {},
  ) {
    const [a, b, c, d, tx, ty] = matrix;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 0.00001)
      throw new Error(`Singular transform for ${layer.id}.`);
    const corners = [
      [layer.x, layer.y],
      [layer.x + layer.width, layer.y],
      [layer.x, layer.y + layer.height],
      [layer.x + layer.width, layer.y + layer.height],
    ];
    const xs = corners.map(([x, y]) => a * x + c * y + tx);
    const ys = corners.map(([x, y]) => b * x + d * y + ty);
    const margin = warp.margin ?? 1;
    const left = Math.max(0, Math.floor(Math.min(...xs)) - margin);
    const right = Math.min(this.width - 1, Math.ceil(Math.max(...xs)) + margin);
    const top = Math.max(0, Math.floor(Math.min(...ys)) - margin);
    const bottom = Math.min(
      this.height - 1,
      Math.ceil(Math.max(...ys)) + margin,
    );
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        let sx = (d * (x - tx) - c * (y - ty)) / determinant;
        let sy = (-b * (x - tx) + a * (y - ty)) / determinant;
        if (warp.inverse) [sx, sy] = warp.inverse(sx, sy);
        const ix = Math.round(sx) - layer.x,
          iy = Math.round(sy) - layer.y;
        if (ix < 0 || iy < 0 || ix >= layer.width || iy >= layer.height)
          continue;
        const source = (iy * layer.width + ix) * 4;
        if (pixels[source + 3] === 0) continue;
        this.pixels.set(
          pixels.subarray(source, source + 4),
          (y * this.width + x) * 4,
        );
      }
    }
  }
}
