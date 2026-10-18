import {
  boneTransform,
  type Matrix,
  type IllustratedCanvas,
} from "../../core/illustrated-canvas";
import type { IllustratedLayer } from "../../core/illustrated-types";
import type { Point } from "../../core/pixel-art";

/** This experimental mesh renderer is project-owned. It uses no Spine format,
 * implementation or runtime. Source pixels remain nearest-neighbour samples. */
export interface LimbMesh {
  rest: Point[];
  triangles: number[];
  /** Interleaved [upper, lower] influence pairs; every pair sums to one. */
  weights: number[];
  joints: readonly [Point, Point, Point];
  volume: number;
}

export interface MeshOptions {
  /** Radius in source pixels over which the two bones share influence. */
  blendRadius?: number;
  /** Local transverse-volume correction, 0 = ordinary linear skinning. */
  volume?: number;
}

const length = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
const map = (m: Matrix, p: Point): Point => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];
const mix = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

function assertJoints(joints: readonly [Point, Point, Point]) {
  if (joints.some((p) => p.some((n) => !Number.isFinite(n))))
    throw new Error("Mesh joints must be finite.");
  if (
    length(joints[0], joints[1]) < 1e-5 ||
    length(joints[1], joints[2]) < 1e-5
  )
    throw new Error("Mesh bones must have nonzero lengths.");
}

/** A regular 3 px mesh is deliberately inspectable, rather than hidden inside
 * a special knee shader. Bounds use source-pixel edges, e.g. x - 0.5. */
export function createLimbMesh(
  bounds: readonly [number, number, number, number],
  joints: readonly [Point, Point, Point],
  options: MeshOptions = {},
): LimbMesh {
  assertJoints(joints);
  const [left, top, right, bottom] = bounds;
  if (!bounds.every(Number.isFinite) || right <= left || bottom <= top)
    throw new Error("Mesh bounds must have positive area.");
  const radius = options.blendRadius ?? 6;
  const volume = options.volume ?? 0.65;
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(volume) ||
    volume < 0 ||
    volume > 1
  )
    throw new Error(
      "Mesh blend radius must be positive and volume must be between 0 and 1.",
    );
  const [h, k, a] = joints;
  const l1 = length(h, k),
    l2 = length(k, a);
  // Joint plane follows the source skeleton rather than a horizontal crop.
  let ux = (k[0] - h[0]) / l1 + (a[0] - k[0]) / l2;
  let uy = (k[1] - h[1]) / l1 + (a[1] - k[1]) / l2;
  const axisLength = Math.hypot(ux, uy);
  if (axisLength < 1e-5) {
    ux = (k[0] - h[0]) / l1;
    uy = (k[1] - h[1]) / l1;
  } else {
    ux /= axisLength;
    uy /= axisLength;
  }
  const columns = Math.ceil((right - left) / 3);
  const rows = Math.ceil((bottom - top) / 3);
  const rest: Point[] = [],
    weights: number[] = [],
    triangles: number[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const x = left + ((right - left) * column) / columns;
      const y = top + ((bottom - top) * row) / rows;
      rest.push([x, y]);
      const t = clamp(
        ((x - k[0]) * ux + (y - k[1]) * uy + radius) / (2 * radius),
        0,
        1,
      );
      const lower = t * t * (3 - 2 * t);
      weights.push(1 - lower, lower);
      if (row < rows && column < columns) {
        const n = row * (columns + 1) + column;
        triangles.push(
          n,
          n + 1,
          n + columns + 2,
          n,
          n + columns + 2,
          n + columns + 1,
        );
      }
    }
  }
  return { rest, triangles, weights, joints, volume };
}

/** Linear blend skinning with a bounded, local width corrective. A weighted
 * average of opposing rotations collapses at a tight fold; restoring part of
 * the transverse length keeps cloth thickness without a painted joint disk.
 * It cannot invent the crease or newly visible cloth of an authored bend. */
export function deformLimbMesh(
  mesh: LimbMesh,
  posed: readonly [Point, Point, Point],
): Point[] {
  assertJoints(posed);
  const [h, k, a] = mesh.joints;
  const upper = boneTransform(h, k, posed[0], posed[1]);
  const lower = boneTransform(k, a, posed[1], posed[2]);
  return mesh.rest.map((p, i) => {
    const w = mesh.weights[i * 2 + 1];
    const blended = mix(map(upper, p), map(lower, p), w);
    if (w === 0 || w === 1 || mesh.volume === 0) return blended;
    const from = w < 0.5 ? h : k,
      to = w < 0.5 ? k : a;
    const dx = to[0] - from[0],
      dy = to[1] - from[1];
    const t =
      ((p[0] - from[0]) * dx + (p[1] - from[1]) * dy) / (dx * dx + dy * dy);
    const center: Point = [from[0] + t * dx, from[1] + t * dy];
    const posedCenter = mix(map(upper, center), map(lower, center), w);
    const vx = blended[0] - posedCenter[0],
      vy = blended[1] - posedCenter[1];
    const originalWidth = length(center, p),
      blendedWidth = Math.hypot(vx, vy);
    if (blendedWidth < 1e-5 || originalWidth < 1e-5) return blended;
    const preserve = mesh.volume * 4 * w * (1 - w);
    const scale =
      1 + (clamp(originalWidth / blendedWidth, 1, 1.65) - 1) * preserve;
    return [posedCenter[0] + vx * scale, posedCenter[1] + vy * scale];
  });
}

/** Texture coordinates and screen coordinates both refer to pixel centres.
 * Inclusive shared edges avoid cracks; each triangle samples the same UV at
 * the edge. Source alpha is copied exactly, never filtered or synthesized. */
export function rasterizeTexturedMesh(
  canvas: IllustratedCanvas,
  texture: Uint8ClampedArray,
  rest: readonly Point[],
  vertices: readonly Point[],
  triangles: readonly number[],
) {
  for (let i = 0; i < triangles.length; i += 3) {
    const ia = triangles[i],
      ib = triangles[i + 1],
      ic = triangles[i + 2];
    const a = vertices[ia],
      b = vertices[ib],
      c = vertices[ic];
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(det) < 1e-8) continue;
    const minX = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(
      canvas.width - 1,
      Math.floor(Math.max(a[0], b[0], c[0])),
    );
    const minY = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(
      canvas.height - 1,
      Math.floor(Math.max(a[1], b[1], c[1])),
    );
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const wa =
          ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
        const wb =
          ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
        const wc = 1 - wa - wb;
        if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue;
        const sx = Math.round(
          wa * rest[ia][0] + wb * rest[ib][0] + wc * rest[ic][0],
        );
        const sy = Math.round(
          wa * rest[ia][1] + wb * rest[ib][1] + wc * rest[ic][1],
        );
        if (sx < 0 || sx >= canvas.width || sy < 0 || sy >= canvas.height)
          continue;
        const source = (sy * canvas.width + sx) * 4;
        if (texture[source + 3])
          canvas.pixels.set(
            texture.subarray(source, source + 4),
            (y * canvas.width + x) * 4,
          );
      }
    }
  }
}

export function prepareMeshLimb(
  requireLayer: (id: string) => IllustratedLayer,
  colors: (id: string) => Uint8ClampedArray,
  ids: readonly [string] | readonly [string, string],
  joints: readonly [Point, Point, Point],
  options: MeshOptions & { excludeId?: string } = {},
) {
  const texture = new Uint8ClampedArray(192 * 256 * 4);
  for (const id of ids) {
    const layer = requireLayer(id),
      pixels = colors(id);
    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.width; x++) {
        const source = (y * layer.width + x) * 4;
        const tx = layer.x + x,
          ty = layer.y + y;
        if (tx < 0 || tx >= 192 || ty < 0 || ty >= 256 || !pixels[source + 3])
          continue;
        texture.set(pixels.subarray(source, source + 4), (ty * 192 + tx) * 4);
      }
    }
  }
  if (options.excludeId) {
    const layer = requireLayer(options.excludeId),
      pixels = colors(options.excludeId);
    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.width; x++) {
        const tx = layer.x + x,
          ty = layer.y + y;
        if (
          tx < 0 ||
          tx >= 192 ||
          ty < 0 ||
          ty >= 256 ||
          !pixels[(y * layer.width + x) * 4 + 3]
        )
          continue;
        const p = (ty * 192 + tx) * 4;
        texture.fill(0, p, p + 4);
      }
    }
  }
  let left = 192,
    right = -1,
    top = 256,
    bottom = -1;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 192; x++) {
      if (!texture[(y * 192 + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  if (right < left)
    throw new Error(`No visible source pixels for mesh ${ids.join("/")}.`);
  const mesh = createLimbMesh(
    [left - 0.5, top - 0.5, right + 0.5, bottom + 0.5],
    joints,
    options,
  );
  return {
    draw(canvas: IllustratedCanvas, posed: readonly [Point, Point, Point]) {
      rasterizeTexturedMesh(
        canvas,
        texture,
        mesh.rest,
        deformLimbMesh(mesh, posed),
        mesh.triangles,
      );
    },
    inspect(posed: readonly [Point, Point, Point]) {
      return {
        vertices: deformLimbMesh(mesh, posed),
        triangles: mesh.triangles,
        weights: mesh.weights,
        rest: mesh.rest,
      };
    },
  };
}
