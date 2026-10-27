import type { RgbaPng } from "../core/baked-source";

/** A versioned, deterministic conversion recipe. No per-frame fitting, palette,
 * stochastic texture or temporal interpolation is used. */
export interface PixelSettings {
  factor: 4 | 6 | 8;
  colors: 64 | 96 | 128;
  sampling: "detail" | "nearest";
  /** Omission preserves the original v1 rendering and serialized recipe. */
  finish?: "cluster";
}

export interface PixelGeometry {
  factor: number;
  padding: { left: number; top: number; right: number; bottom: number };
  width: number;
  height: number;
  anchor: { x: number; y: number };
}

export type PixelRgb = [number, number, number];
export const DEFAULT_PIXEL_SETTINGS: Readonly<PixelSettings> = Object.freeze({
  factor: 4,
  colors: 128,
  sampling: "detail",
});
export const STRONG_PIXEL_SETTINGS: Readonly<PixelSettings> = Object.freeze({
  factor: 6,
  colors: 96,
  sampling: "detail",
  finish: "cluster",
});
export const PIXEL_ALGORITHM = "fixed-grid-detail-oklab-v1";
export const CLUSTER_FINISH_VERSION = "supported-shade-islands-v1";
const MAX_PIXELS = 64_000_000;
const MAX_BANK_PIXELS = 64_000_000;
const ALPHA_COVERAGE = 0.42;

export function validatePixelSettings(value: unknown): PixelSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Pixel settings must be an object.");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (key) => !["factor", "colors", "sampling", "finish"].includes(key),
    ) ||
    ![4, 6, 8].includes(v.factor as number) ||
    ![64, 96, 128].includes(v.colors as number) ||
    !["detail", "nearest"].includes(v.sampling as string) ||
    (Object.hasOwn(v, "finish") && v.finish !== "cluster")
  )
    throw Error(
      "Choose pixel size 4, 6 or 8, 64/96/128 colors, detail or nearest sampling, and an optional cluster finish.",
    );
  return {
    factor: v.factor,
    colors: v.colors,
    sampling: v.sampling,
    ...(Object.hasOwn(v, "finish") ? { finish: "cluster" } : {}),
  } as PixelSettings;
}

function validImage(image: RgbaPng): void {
  if (
    !Number.isSafeInteger(image.width) ||
    image.width < 1 ||
    !Number.isSafeInteger(image.height) ||
    image.height < 1 ||
    image.width * image.height > MAX_PIXELS ||
    !(image.pixels instanceof Uint8Array) ||
    image.pixels.length !== image.width * image.height * 4
  )
    throw Error("Pixel conversion requires a bounded, complete RGBA image.");
}

function validGeometry(image: RgbaPng, geometry: PixelGeometry): void {
  const { factor, padding, width, height, anchor } = geometry;
  if (
    ![4, 6, 8].includes(factor) ||
    !padding ||
    !anchor ||
    ![width, height].every((v) => Number.isSafeInteger(v) && v > 0) ||
    width * height > MAX_PIXELS ||
    ![padding.left, padding.top, padding.right, padding.bottom].every(
      (v) => Number.isSafeInteger(v) && v >= 0 && v < factor,
    ) ||
    image.width + padding.left + padding.right !== width * factor ||
    image.height + padding.top + padding.bottom !== height * factor ||
    !Number.isSafeInteger(anchor.x) ||
    !Number.isSafeInteger(anchor.y) ||
    anchor.x < 0 ||
    anchor.y < 0 ||
    anchor.x > width ||
    anchor.y > height
  )
    throw Error("All frames require one fixed, integer pixel grid and anchor.");
}

const luminance = (r: number, g: number, b: number) =>
  (54 * r + 183 * g + 19 * b) / 256;

/** Fixed cells are sampled in source coordinates, including declared transparent
 * padding. Detail sampling selects an existing visible RGB, rather than making
 * an averaged fringe color. A coherent narrow dark stroke gets an extra vote;
 * unrelated isolated dark specks do not. This is a tonal heuristic, not a
 * semantic face detector. Alpha is deliberately binary in this candidate. */
export function downsamplePixelFrame(
  image: RgbaPng,
  geometry: PixelGeometry,
  sampling: PixelSettings["sampling"] = "detail",
): RgbaPng {
  validImage(image);
  validGeometry(image, geometry);
  if (sampling !== "detail" && sampling !== "nearest")
    throw Error("Unknown pixel sampling mode.");
  const { width, height, factor, padding } = geometry;
  const output = new Uint8Array(width * height * 4);
  const input = image.pixels;
  const indices = new Int32Array(64);
  const cellX = new Uint8Array(64),
    cellY = new Uint8Array(64);
  for (let y = 0; y < height; y++) {
    const sy = y * factor - padding.top;
    for (let x = 0; x < width; x++) {
      const sx = x * factor - padding.left;
      const out = (y * width + x) * 4;
      if (sampling === "nearest") {
        const ix = sx + Math.floor(factor / 2),
          iy = sy + Math.floor(factor / 2);
        if (ix < 0 || iy < 0 || ix >= image.width || iy >= image.height)
          continue;
        const at = (iy * image.width + ix) * 4;
        if (input[at + 3] < 128) continue;
        output[out] = input[at];
        output[out + 1] = input[at + 1];
        output[out + 2] = input[at + 2];
        output[out + 3] = 255;
        continue;
      }
      let count = 0,
        alphaSum = 0,
        weight = 0,
        r = 0,
        g = 0,
        b = 0;
      for (let cy = 0; cy < factor; cy++) {
        const iy = sy + cy;
        if (iy < 0 || iy >= image.height) continue;
        for (let cx = 0; cx < factor; cx++) {
          const ix = sx + cx;
          if (ix < 0 || ix >= image.width) continue;
          const at = (iy * image.width + ix) * 4,
            a = input[at + 3];
          alphaSum += a;
          // Nearly transparent spill contributes coverage, but not edge RGB.
          if (a < 64) continue;
          indices[count] = at;
          cellX[count] = cx;
          cellY[count] = cy;
          count++;
          weight += a;
          r += input[at] * a;
          g += input[at + 1] * a;
          b += input[at + 2] * a;
        }
      }
      if (!count || alphaSum < factor * factor * 255 * ALPHA_COVERAGE) continue;
      r /= weight;
      g /= weight;
      b /= weight;
      const meanLight = luminance(r, g, b);
      let darkCount = 0,
        darkWeight = 0,
        darkR = 0,
        darkG = 0,
        darkB = 0;
      let minX = factor,
        maxX = -1,
        minY = factor,
        maxY = -1;
      for (let p = 0; p < count; p++) {
        const at = indices[p],
          a = input[at + 3];
        const light = luminance(input[at], input[at + 1], input[at + 2]);
        if (a < 160 || light > 105 || light > meanLight - 32) continue;
        darkCount++;
        darkWeight += a;
        darkR += input[at] * a;
        darkG += input[at + 1] * a;
        darkB += input[at + 2] * a;
        minX = Math.min(minX, cellX[p]);
        maxX = Math.max(maxX, cellX[p]);
        minY = Math.min(minY, cellY[p]);
        maxY = Math.max(maxY, cellY[p]);
      }
      const narrowLine =
        darkCount >= Math.max(3, factor - 1) &&
        darkCount <= count * 0.4 &&
        ((maxX - minX >= factor - 2 && maxY - minY <= 1) ||
          (maxY - minY >= factor - 2 && maxX - minX <= 1));
      if (narrowLine) {
        r = darkR / darkWeight;
        g = darkG / darkWeight;
        b = darkB / darkWeight;
      }
      let chosen = -1,
        best = Infinity;
      const center = (factor - 1) / 2;
      for (let p = 0; p < count; p++) {
        const at = indices[p];
        // Prefer solid samples if they exist. Residual partial-edge cells use
        // their real visible RGB rather than borrowing hidden transparent RGB.
        const a = input[at + 3];
        const dr = input[at] - r,
          dg = input[at + 1] - g,
          db = input[at + 2] - b;
        const score =
          2 * dr * dr +
          4 * dg * dg +
          db * db +
          (255 - a) * 0.25 +
          ((cellX[p] - center) ** 2 + (cellY[p] - center) ** 2) * 0.001;
        if (score < best) {
          best = score;
          chosen = at;
        }
      }
      output[out] = input[chosen];
      output[out + 1] = input[chosen + 1];
      output[out + 2] = input[chosen + 2];
      output[out + 3] = 255;
    }
  }
  return {
    width,
    height,
    pixels: output,
    colorChunks: image.colorChunks.map((c) => new Uint8Array(c)),
  };
}

// Standard Oklab transform (Björn Ottosson's published color-space definition).
// This implementation is independent of PixelRefiner and has no runtime dependency.
const linear = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const value = i / 255;
  linear[i] =
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function oklab(r: number, g: number, b: number): PixelRgb {
  const R = linear[r],
    G = linear[g],
    B = linear[b];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const distance = (a: PixelRgb, b: PixelRgb) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const rgbKey = (rgb: PixelRgb) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
const keyRgb = (key: number): PixelRgb => [
  (key >>> 16) & 255,
  (key >>> 8) & 255,
  key & 255,
];
const maxChannelDifference = (a: PixelRgb, b: PixelRgb): number =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/** One bounded, order-independent palette for an entire composed frame bank.
 * Histogram bins and deterministic clustering are shared across all actions.
 * Representatives are real input colors, so no material-family recoloring or
 * arbitrary retro palette is imposed. Mild frequency flattening reserves room
 * for sparse line/highlight colors without making every video speck a color. */
export function buildSharedPixelPalette(
  images: readonly RgbaPng[],
  colors: PixelSettings["colors"],
): PixelRgb[] {
  if (![64, 96, 128].includes(colors))
    throw Error("Unsupported pixel palette size.");
  if (!images.length || images.length > 1024)
    throw Error("Choose a bounded nonempty frame bank.");
  let total = 0;
  for (const image of images) {
    validImage(image);
    total += image.width * image.height;
  }
  if (total > MAX_BANK_PIXELS)
    throw Error("Pixel palette exceeds the 64 million pixel bank budget.");
  const counts = new Uint32Array(32768),
    representatives = new Uint32Array(32768);
  const representativeDistance = new Float64Array(32768).fill(Infinity);
  const exact = new Set<number>();
  let trackExact = true;
  for (const image of images) {
    const bytes = image.pixels;
    for (let i = 0; i < bytes.length; i += 4) {
      if (bytes[i + 3] === 0) continue;
      const r = bytes[i],
        g = bytes[i + 1],
        b = bytes[i + 2];
      const key = (r << 16) | (g << 8) | b;
      if (trackExact) {
        exact.add(key);
        if (exact.size > colors) {
          exact.clear();
          trackExact = false;
        }
      }
      const bin = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      counts[bin]++;
      const delta =
        ((r & 7) - 3.5) ** 2 + ((g & 7) - 3.5) ** 2 + ((b & 7) - 3.5) ** 2;
      if (
        delta < representativeDistance[bin] ||
        (delta === representativeDistance[bin] && key < representatives[bin])
      ) {
        representativeDistance[bin] = delta;
        representatives[bin] = key;
      }
    }
  }
  if (trackExact) return [...exact].sort((a, b) => a - b).map(keyRgb);
  const points: Array<{ rgb: PixelRgb; lab: PixelRgb; weight: number }> = [];
  for (let i = 0; i < counts.length; i++)
    if (counts[i]) {
      const rgb = keyRgb(representatives[i]);
      points.push({ rgb, lab: oklab(...rgb), weight: counts[i] ** 0.75 });
    }
  if (points.length <= colors)
    return points.map((p) => p.rgb).sort((a, b) => rgbKey(a) - rgbKey(b));
  let first = 0;
  for (let i = 1; i < points.length; i++)
    if (points[i].weight > points[first].weight) first = i;
  const centers: PixelRgb[] = [[...points[first].lab]];
  const closest = new Float64Array(points.length).fill(Infinity);
  for (let count = 1; count < colors; count++) {
    const last = centers[centers.length - 1];
    let bestIndex = 0,
      bestScore = -1;
    for (let i = 0; i < points.length; i++) {
      closest[i] = Math.min(closest[i], distance(points[i].lab, last));
      const score = closest[i] * Math.sqrt(points[i].weight);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    centers.push([...points[bestIndex].lab]);
  }
  const labels = new Uint16Array(points.length);
  for (let iteration = 0; iteration < 8; iteration++) {
    const sums = Array.from({ length: colors }, () => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      let best = Infinity,
        index = 0;
      for (let c = 0; c < colors; c++) {
        const delta = distance(point.lab, centers[c]);
        if (delta < best) {
          best = delta;
          index = c;
        }
      }
      labels[i] = index;
      const sum = sums[index];
      sum[0] += point.lab[0] * point.weight;
      sum[1] += point.lab[1] * point.weight;
      sum[2] += point.lab[2] * point.weight;
      sum[3] += point.weight;
    }
    let movement = 0;
    for (let c = 0; c < colors; c++)
      if (sums[c][3]) {
        const center: PixelRgb = [
          sums[c][0] / sums[c][3],
          sums[c][1] / sums[c][3],
          sums[c][2] / sums[c][3],
        ];
        movement += distance(center, centers[c]);
        centers[c] = center;
      }
    if (movement < 0.000001) break;
  }
  const palette = new Map<number, PixelRgb>();
  for (let c = 0; c < colors; c++) {
    let best = Infinity,
      index = -1;
    for (let i = 0; i < points.length; i++)
      if (labels[i] === c) {
        const delta = distance(points[i].lab, centers[c]);
        if (delta < best) {
          best = delta;
          index = i;
        }
      }
    if (index >= 0)
      palette.set(rgbKey(points[index].rgb), [...points[index].rgb]);
  }
  return [...palette.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, rgb]) => rgb);
}

/** Reuse one exact-RGB cache across the bank. Cache eviction affects work only,
 * never output. Returned frames and palette storage never alias caller data. */
export function createPixelPaletteMapper(
  palette: readonly PixelRgb[],
): (image: RgbaPng) => RgbaPng {
  if (
    palette.length > 128 ||
    palette.some(
      (rgb) =>
        !Array.isArray(rgb) ||
        rgb.length !== 3 ||
        rgb.some((v) => !Number.isSafeInteger(v) || v < 0 || v > 255),
    )
  )
    throw Error("Pixel palette requires at most 128 RGB colors.");
  const colors = palette
    .map((rgb) => [...rgb] as PixelRgb)
    .sort((a, b) => rgbKey(a) - rgbKey(b));
  const labs = colors.map((rgb) => oklab(...rgb));
  const cache = new Map<number, number>();
  return (image) => {
    validImage(image);
    const output = new Uint8Array(image.pixels.length),
      input = image.pixels;
    for (let i = 0; i < input.length; i += 4) {
      if (input[i + 3] === 0) continue;
      if (!colors.length)
        throw Error("Visible pixels require a nonempty palette.");
      if (input[i + 3] !== 255)
        throw Error("Pixel palette mapping requires binary sampled alpha.");
      const key = (input[i] << 16) | (input[i + 1] << 8) | input[i + 2];
      let chosen = cache.get(key);
      if (chosen === undefined) {
        const lab = oklab(input[i], input[i + 1], input[i + 2]);
        let best = Infinity;
        chosen = 0;
        for (let c = 0; c < colors.length; c++) {
          const delta = distance(lab, labs[c]);
          if (delta < best) {
            best = delta;
            chosen = c;
          }
        }
        if (cache.size >= 65536) cache.clear();
        cache.set(key, chosen);
      }
      output[i] = colors[chosen][0];
      output[i + 1] = colors[chosen][1];
      output[i + 2] = colors[chosen][2];
      output[i + 3] = 255;
    }
    return {
      width: image.width,
      height: image.height,
      pixels: output,
      colorChunks: image.colorChunks.map((c) => new Uint8Array(c)),
    };
  };
}

export function applyPixelPalette(
  image: RgbaPng,
  palette: readonly PixelRgb[],
): RgbaPng {
  return createPixelPaletteMapper(palette)(image);
}

/** One synchronous, non-cascading pass over palette-mapped pixels. Only an
 * isolated 8-connected component of one or two pixels may change, and only
 * toward an existing low-contrast shade supported by at least two thirds of
 * its unique boundary neighbors. Transparent boundaries, connected strokes,
 * dark ink and high-contrast detail are untouched. This deliberately leaves
 * silhouette geometry intact; it is not contour redrawing or semantic face
 * restoration. Every decision reads the original image, never prior writes. */
export function cleanupPixelClusters(
  image: RgbaPng,
  palette: readonly PixelRgb[],
): RgbaPng {
  validImage(image);
  if (
    palette.length > 128 ||
    palette.some(
      (rgb) =>
        !Array.isArray(rgb) ||
        rgb.length !== 3 ||
        rgb.some((v) => !Number.isSafeInteger(v) || v < 0 || v > 255),
    )
  )
    throw Error("Cluster finish requires at most 128 RGB palette colors.");
  const colors = palette
    .map((rgb) => [...rgb] as PixelRgb)
    .sort((a, b) => rgbKey(a) - rgbKey(b));
  const colorIds = new Map(colors.map((rgb, id) => [rgbKey(rgb), id]));
  const labs = colors.map((rgb) => oklab(...rgb));
  const { width, height, pixels: input } = image;
  const ids = new Uint8Array(width * height).fill(255);
  for (let p = 0; p < ids.length; p++) {
    const at = p * 4;
    if (input[at + 3] === 0) continue;
    if (input[at + 3] !== 255)
      throw Error("Cluster finish requires binary palette-mapped alpha.");
    const key = (input[at] << 16) | (input[at + 1] << 8) | input[at + 2];
    const id = colorIds.get(key);
    if (id === undefined)
      throw Error(
        "Cluster finish input contains a color outside its shared palette.",
      );
    ids[p] = id;
  }
  const output = new Uint8Array(input);
  const offsets = [
    -width - 1,
    -width,
    -width + 1,
    -1,
    1,
    width - 1,
    width,
    width + 1,
  ];
  const cardinal = [-width, -1, 1, width];
  const boundary = new Int32Array(16);
  const frequency = new Uint8Array(colors.length);
  const interior = (p: number): boolean => {
    const x = p % width,
      y = Math.floor(p / width);
    if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) return false;
    for (const offset of offsets) if (ids[p + offset] === 255) return false;
    return true;
  };
  for (let p = 0; p < ids.length; p++) {
    const id = ids[p];
    if (id === 255 || labs[id][0] < 0.25 || !interior(p)) continue;
    let neighbor = -1,
      same = 0;
    for (const offset of offsets)
      if (ids[p + offset] === id) {
        same++;
        neighbor = p + offset;
      }
    if (same > 1) continue;
    if (same === 1) {
      if (neighbor < p || !interior(neighbor)) continue;
      let secondSame = 0;
      for (const offset of offsets)
        if (ids[neighbor + offset] === id) secondSame++;
      if (secondSame !== 1) continue;
    }
    // Enumerate each outside neighbor once, even for two-pixel components.
    let boundaryCount = 0;
    for (let member = 0; member <= same; member++) {
      const cell = member === 0 ? p : neighbor;
      for (const offset of offsets) {
        const point = cell + offset;
        if (point === p || point === neighbor) continue;
        let found = false;
        for (let i = 0; i < boundaryCount; i++)
          if (boundary[i] === point) {
            found = true;
            break;
          }
        if (!found) boundary[boundaryCount++] = point;
      }
    }
    frequency.fill(0);
    let protectedContrast = false;
    for (let i = 0; i < boundaryCount; i++) {
      const next = ids[boundary[i]];
      frequency[next]++;
      // Preserve either side of an eye, mouth, hair stroke or cloth border.
      if (
        distance(labs[id], labs[next]) > 0.075 ** 2 ||
        maxChannelDifference(colors[id], colors[next]) > 48
      )
        protectedContrast = true;
    }
    if (protectedContrast) continue;
    let target = -1,
      support = 0;
    for (let i = 0; i < colors.length; i++)
      if (frequency[i] > support) {
        target = i;
        support = frequency[i];
      }
    if (
      target < 0 ||
      support < Math.ceil((boundaryCount * 2) / 3) ||
      distance(labs[id], labs[target]) > 0.05 ** 2 ||
      Math.abs(labs[id][0] - labs[target][0]) > 0.045 ||
      maxChannelDifference(colors[id], colors[target]) > 28
    )
      continue;
    let touching = 0;
    for (let member = 0; member <= same; member++) {
      const cell = member === 0 ? p : neighbor;
      for (const offset of cardinal)
        if (ids[cell + offset] === target) touching++;
    }
    if (touching < 2) continue;
    for (let member = 0; member <= same; member++) {
      const at = (member === 0 ? p : neighbor) * 4;
      output[at] = colors[target][0];
      output[at + 1] = colors[target][1];
      output[at + 2] = colors[target][2];
    }
  }
  return {
    width,
    height,
    pixels: output,
    colorChunks: image.colorChunks.map((chunk) => new Uint8Array(chunk)),
  };
}
