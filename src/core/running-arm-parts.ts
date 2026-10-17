import { unzlibSync, zlibSync } from "fflate";
import type { ArtV6CharacterConfig } from "./types";
import type {
  IllustratedAssetBank,
  IllustratedLayer,
} from "./illustrated-types";

/** Source-space ownership, traced on the original illustrated soft top. The
 * old rectangular cuts included the neighboring skirt in each hand, and left
 * parts of the original standing arms on the waist/skirt. Those blue fragments
 * are mostly material 0 (fixed ink), so material/color rejection is incorrect.
 *
 * These contours follow the existing anatomical outline, including its dark
 * edge pixels. They are independent of selected colors and apply only to this
 * source garment. Original artwork and all previous motion versions stay frozen.
 */
const NEAR_ARM_RIGHT = [
  // y156..190: inner forearm edge, knuckles, fingers, then fingertip.
  79, 79, 79, 79, 79, 79, 78, 78, 78, 78, 77, 77, 76, 76, 74, 73, 73, 71, 70,
  70, 69, 68, 68, 68, 68, 67, 67, 67, 66, 65, 64, 64, 60, 61, 60,
] as const;
const FAR_ARM_LEFT = [
  // y156..189: inner forearm edge and palm; the last row is one fingertip.
  118, 119, 119, 119, 119, 119, 119, 118, 117, 117, 118, 119, 120, 121, 122,
  122, 123, 124, 125, 125, 126, 126, 127, 128, 128, 129, 130, 130, 129, 129,
  129, 130, 131, 133,
] as const;

const W = 192;
const H = 256;
type SourcePixels = Uint8Array;

function decode(layer: IllustratedLayer): SourcePixels {
  return unzlibSync(Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)));
}

function sourceImage(layers: IllustratedLayer[]): SourcePixels {
  const pixels = new Uint8Array(W * H * 5);
  for (const layer of layers) {
    const raw = decode(layer);
    for (let p = 0; p < layer.width * layer.height; p++) {
      if (!raw[p * 5 + 3]) continue;
      const x = layer.x + (p % layer.width);
      const y = layer.y + Math.floor(p / layer.width);
      pixels.set(raw.subarray(p * 5, p * 5 + 5), (y * W + x) * 5);
    }
  }
  return pixels;
}

function rebuilt(
  original: IllustratedLayer,
  pixels: SourcePixels,
): IllustratedLayer {
  let minX = W,
    minY = H,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!pixels[(y * W + x) * 5 + 3]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0)
    throw new Error(`Empty running ownership layer ${original.id}.`);
  const width = maxX - minX + 1,
    height = maxY - minY + 1;
  const raw = new Uint8Array(width * height * 5);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = ((y + minY) * W + x + minX) * 5;
      raw.set(pixels.subarray(p, p + 5), (y * width + x) * 5);
    }
  }
  return {
    ...original,
    id: `motion3:${original.id}`,
    x: minX,
    y: minY,
    width,
    height,
    data: btoa(String.fromCharCode(...zlibSync(raw, { level: 9 }))),
  };
}

function nearArmAt(x: number, y: number) {
  const right = NEAR_ARM_RIGHT[y - 156];
  return right !== undefined && x <= right && x >= 45;
}

function farArmAt(x: number, y: number) {
  const left = FAR_ARM_LEFT[y - 156];
  return left !== undefined && x >= left && x <= 145;
}

/** Return a separate bank for the repaired running rig. Idle/walk and saved
 * motion 1/2 never call this adapter. No source object or pose anchor is changed.
 * Hoodie/jacket sleeves already have correct ownership and pass through intact.
 */
export function repairRunningArmParts(
  bank: IllustratedAssetBank,
  config: ArtV6CharacterConfig,
): IllustratedAssetBank {
  if (config.upperClothing !== "tee" && config.lowerClothing !== "skirt")
    return bank;
  const lookup = new Map(bank.layers.map((layer) => [layer.id, layer]));
  const requireLayer = (id: string) => {
    const layer = lookup.get(id);
    if (!layer) throw new Error(`Running ownership is missing ${id}.`);
    return layer;
  };
  const body = bank.upper.tee;
  const skirt = bank.lower.skirt;
  // These seven layers are overlapping cuts of one source painting. Merging
  // them recovers arm edge pixels that were accidentally left on the torso.
  const source = sourceImage(
    [
      body.torso,
      body.nearUpperArm,
      body.farUpperArm,
      body.nearForearm,
      body.farForearm,
      skirt.hips,
      skirt.garment!,
    ].map(requireLayer),
  );
  const replacements = new Map<string, IllustratedLayer>();

  if (config.upperClothing === "tee") {
    for (const near of [true, false]) {
      const id = near ? body.nearForearm : body.farForearm;
      const original = requireLayer(id);
      const pixels = new Uint8Array(W * H * 5);
      const firstRow = near ? body.elbowNear[1] - 3 : body.elbowFar[1] - 3;
      const belongs = near ? nearArmAt : farArmAt;
      for (let y = firstRow; y < 194; y++) {
        for (let x = 45; x <= 145; x++) {
          if (!belongs(x, y)) continue;
          const p = (y * W + x) * 5;
          pixels.set(source.subarray(p, p + 5), p);
          // Reassigned skin was labeled upper/lower because it lived outside
          // the old anatomical arm mask. Ownership, not hue, makes it skin.
          if (pixels[p + 3] && pixels[p + 4] !== 0) pixels[p + 4] = 1;
        }
      }
      replacements.set(id, rebuilt(original, pixels));
    }
    const original = requireLayer(body.torso);
    const pixels = sourceImage([original]);
    for (let y = 156; y <= 168; y++) {
      for (let x = 0; x < W; x++) {
        if (nearArmAt(x, y) || farArmAt(x, y))
          pixels.fill(0, (y * W + x) * 5, (y * W + x) * 5 + 5);
      }
    }
    replacements.set(original.id, rebuilt(original, pixels));
  }

  if (config.lowerClothing === "skirt") {
    for (const id of [skirt.hips, skirt.garment!]) {
      const original = requireLayer(id);
      const pixels = sourceImage([original]);
      // Remove only the original standing-arm territory. Blue underskirt,
      // folds, hem and their recoloring masks remain byte-for-byte unchanged.
      for (let y = 163; y <= 189; y++) {
        for (let x = 0; x < W; x++) {
          if (nearArmAt(x, y) || farArmAt(x, y))
            pixels.fill(0, (y * W + x) * 5, (y * W + x) * 5 + 5);
        }
      }
      replacements.set(id, rebuilt(original, pixels));
    }
  }
  return {
    ...bank,
    // colorLayer caches source decoding by id. Independent ids keep rendering
    // old/new packs in either order deterministic inside the same browser.
    layers: [...bank.layers, ...replacements.values()],
    upper:
      config.upperClothing === "tee"
        ? {
            ...bank.upper,
            tee: {
              ...body,
              torso: replacements.get(body.torso)!.id,
              nearForearm: replacements.get(body.nearForearm)!.id,
              farForearm: replacements.get(body.farForearm)!.id,
            },
          }
        : bank.upper,
    lower:
      config.lowerClothing === "skirt"
        ? {
            ...bank.lower,
            skirt: {
              ...skirt,
              hips: replacements.get(skirt.hips)!.id,
              garment: replacements.get(skirt.garment!)!.id,
            },
          }
        : bank.lower,
  };
}
