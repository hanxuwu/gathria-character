/** Shared native-resolution skeletal geometry. No character artwork or fixed
 * sprite dimensions are embedded here. The math is retained from the original
 * renderer so extracting it does not alter the approved candidate output. */
export type Point = readonly [number, number];
export type Matrix = readonly [number, number, number, number, number, number];

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
