import { unzlibSync } from "fflate";
import { WARDROBE_ASSETS } from "./wardrobe-assets.generated";
import {
  ALL_SLOTS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  REQUIRED_SLOTS,
  RIG_ID,
  type AuthoringProject,
  type JointTriple,
  type Point,
  type SkinPack,
  type Slot,
} from "./types";
import type {
  EncodedWardrobePart,
  WardrobeIdentityId,
  WardrobeMaterial,
  WardrobeRecipe,
} from "./wardrobe-types";

export const WARDROBE_OPTIONS = {
  identities: WARDROBE_ASSETS.identities.map(({ id, name }) => ({
    id,
    label: name,
  })),
  tops: WARDROBE_ASSETS.tops.map(({ id, name }) => ({ id, label: name })),
  bottoms: WARDROBE_ASSETS.bottoms.map(({ id, name }) => ({ id, label: name })),
  shoes: WARDROBE_ASSETS.shoes.map(({ id, name }) => ({ id, label: name })),
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function fields(raw: Record<string, unknown>, names: string[], path: string) {
  if (
    Object.keys(raw).length !== names.length ||
    names.some((name) => !Object.hasOwn(raw, name))
  )
    throw Error(`${path} must contain exactly: ${names.join(", ")}.`);
}
function choice<T extends string>(
  value: unknown,
  options: readonly { id: T }[],
  path: string,
): T {
  if (typeof value !== "string" || !options.some((item) => item.id === value))
    throw Error(`${path} is not available in wardrobe catalog 1.`);
  return value as T;
}

/** Strict extension parsing avoids treating future catalogs as today's art.
 * Colors are canonicalized so equivalent input produces one saved recipe. */
export function validateWardrobeRecipe(value: unknown): WardrobeRecipe {
  const raw = object(value, "wardrobe");
  fields(
    raw,
    [
      "format",
      "version",
      "catalogVersion",
      "identity",
      "top",
      "bottom",
      "shoes",
      "colors",
    ],
    "wardrobe",
  );
  if (raw.format !== "gathria-wardrobe-recipe" || raw.version !== 1)
    throw Error("Unsupported wardrobe recipe format or version.");
  if (raw.catalogVersion !== 1)
    throw Error(
      "Unsupported wardrobe catalogVersion; keep this project’s existing flat artwork.",
    );
  const colors = object(raw.colors, "wardrobe.colors");
  fields(colors, ["skin", "top", "bottom", "shoes"], "wardrobe.colors");
  const color = (key: keyof WardrobeRecipe["colors"]) => {
    const value = colors[key];
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
      throw Error(
        `wardrobe.colors.${key} must be a six-digit hexadecimal color.`,
      );
    return value.toLowerCase();
  };
  return {
    format: "gathria-wardrobe-recipe",
    version: 1,
    catalogVersion: 1,
    identity: choice(
      raw.identity,
      WARDROBE_ASSETS.identities,
      "wardrobe.identity",
    ),
    top: choice(raw.top, WARDROBE_ASSETS.tops, "wardrobe.top"),
    bottom: choice(raw.bottom, WARDROBE_ASSETS.bottoms, "wardrobe.bottom"),
    shoes: choice(raw.shoes, WARDROBE_ASSETS.shoes, "wardrobe.shoes"),
    colors: {
      skin: color("skin"),
      top: color("top"),
      bottom: color("bottom"),
      shoes: color("shoes"),
    },
  };
}

export function defaultWardrobeRecipe(
  identity: WardrobeIdentityId = "crop",
): WardrobeRecipe {
  const selected = WARDROBE_ASSETS.identities.find(
    (item) => item.id === identity,
  );
  if (!selected) throw Error("Unknown wardrobe identity.");
  const config = selected.sourceAppearance;
  return validateWardrobeRecipe({
    format: "gathria-wardrobe-recipe",
    version: 1,
    catalogVersion: 1,
    identity,
    top: identity === "crop" ? "denim-jacket" : "soft-top",
    bottom: identity === "crop" ? "trousers" : "short-skirt",
    shoes: identity === "crop" ? "boots" : "flats",
    colors: {
      skin: config.skinTone,
      top: config.upperColor,
      bottom: config.lowerColor,
      shoes: config.shoeColor,
    },
  });
}

const PIXELS = FRAME_WIDTH * FRAME_HEIGHT;
const MATERIALS = [
  undefined,
  "skin",
  "hair",
  "upper",
  "lower",
  "shoe",
] as const;
const decoded = new WeakMap<EncodedWardrobePart, Uint8Array>();
function decode(part: EncodedWardrobePart): Uint8Array {
  let raw = decoded.get(part);
  if (!raw) {
    raw = unzlibSync(
      Uint8Array.from(atob(part.data), (value) => value.charCodeAt(0)),
    );
    if (raw.length !== PIXELS * 5)
      throw Error(
        `Catalog attachment ${part.sourceLayerId} has invalid dimensions.`,
      );
    decoded.set(part, raw);
  }
  return raw;
}
const rgb = (hex: string) =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const light = (channels: readonly number[]) =>
  channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;

/** Only authored semantic channels are recolored. Eyes, cuffs, stitching and
 * the coral design's fixed blue underskirt remain exactly their source pixels.
 * This local formula preserves V6 shading, including restrained hair highlights
 * and the original warm skin chroma; it never calls a legacy image generator. */
function colorPart(
  part: EncodedWardrobePart,
  targets: Record<WardrobeMaterial, string>,
): Uint8ClampedArray {
  const raw = decode(part);
  const pixels = new Uint8ClampedArray(PIXELS * 4);
  const colors = Object.fromEntries(
    Object.entries(targets).map(([name, hex]) => [name, rgb(hex)]),
  ) as Record<WardrobeMaterial, number[]>;
  const bases = Object.fromEntries(
    Object.entries(part.palette).map(([name, hex]) => [name, light(rgb(hex!))]),
  ) as Partial<Record<WardrobeMaterial, number>>;
  const skinBase = part.palette.skin ? rgb(part.palette.skin) : undefined;
  const hairStrength = 0.35 + (0.65 * light(colors.hair)) / 255;
  for (let p = 0; p < PIXELS; p++) {
    const source = p * 5,
      dest = p * 4;
    if (!raw[source + 3]) continue;
    const material = MATERIALS[raw[source + 4]],
      base = material && bases[material];
    if (!material || !base) {
      pixels.set(raw.subarray(source, source + 4), dest);
      continue;
    }
    const luminance = light([raw[source], raw[source + 1], raw[source + 2]]);
    const highlight = Math.max(0, (luminance - base) / (255 - base));
    const target = colors[material];
    for (let channel = 0; channel < 3; channel++) {
      // Preserve the original typed-array rounding at each stage, not a
      // subtly different single floating-point transform of the same art.
      pixels[dest + channel] =
        luminance <= base
          ? (target[channel] * luminance) / base
          : target[channel] + (255 - target[channel]) * highlight;
      if (material === "hair" && pixels[dest + channel] > target[channel])
        pixels[dest + channel] =
          target[channel] +
          (pixels[dest + channel] - target[channel]) * hairStrength;
      if (material === "skin" && part.preserveWarmSkin && skinBase) {
        const neutral =
          luminance <= base
            ? (skinBase[channel] * luminance) / base
            : skinBase[channel] + (255 - skinBase[channel]) * highlight;
        pixels[dest + channel] += (raw[source + channel] - neutral) * 0.35;
      }
    }
    pixels[dest + 3] = 255;
  }
  return pixels;
}

/** Fit both the source ankle and grounded sole. A plain Y translation is
 * canceled by the renderer's sole normalization, leaving a gap when a lower-cut
 * shoe is swapped for a boot. Only the shoe is sampled; leg geometry and the
 * established ground baseline remain unchanged. */
function fitShoe(
  pixels: Uint8ClampedArray,
  source: Point,
  target: Point,
): Uint8ClampedArray {
  if (![...source, ...target].every(Number.isInteger))
    throw Error("Wardrobe source registration must use integer coordinates.");
  let sole = -1;
  for (let p = 0; p < PIXELS; p++)
    if (pixels[p * 4 + 3]) sole = Math.floor(p / FRAME_WIDTH);
  if (sole <= source[1] || sole <= target[1])
    throw Error("Wardrobe shoe needs a sole below both registered ankles.");
  const ground = 239;
  if (source[0] === target[0] && source[1] === target[1] && sole === ground)
    return pixels;
  const ratio = (sole - source[1]) / (ground - target[1]);
  if (ratio < 0.65 || ratio > 1.5)
    throw Error(
      "Wardrobe shoe fit exceeds this catalog's supported ankle range.",
    );
  const result = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < FRAME_HEIGHT; y++)
    for (let x = 0; x < FRAME_WIDTH; x++) {
      const sx = x - target[0] + source[0],
        sy = Math.round(sole + (y - ground) * ratio);
      if (sx < 0 || sx >= FRAME_WIDTH || sy < 0 || sy >= FRAME_HEIGHT) continue;
      const from = (sy * FRAME_WIDTH + sx) * 4;
      if (!pixels[from + 3]) continue;
      result.set(pixels.subarray(from, from + 4), (y * FRAME_WIDTH + x) * 4);
    }
  return result;
}

/** Separate shin/foot ownership needs a small hidden allowance at their joint.
 * The original crops ended at the old shoe's top edge with no overlap. A posed
 * shin and an independently pitched shoe then separate, despite touching at
 * rest. Extend only this catalog's final owned cloth/skin columns, by at most
 * four pixels, to ankle + 1. No shoe-colored pixels are copied into the leg.
 * preserveAnkleOverlap keeps this clean allowance out of legacy shoe erasure. */
function ankleAllowance(
  part: EncodedWardrobePart,
  pixels: Uint8ClampedArray,
  joints: JointTriple,
): Uint8ClampedArray {
  const raw = decode(part),
    ankle = joints[2];
  const end = Math.round(ankle[1] + 1);
  for (
    let x = Math.max(0, Math.round(ankle[0]) - 14);
    x <= Math.min(FRAME_WIDTH - 1, Math.round(ankle[0]) + 14);
    x++
  ) {
    let last = -1;
    for (let y = end; y >= ankle[1] - 7; y--)
      if (raw[(y * FRAME_WIDTH + x) * 5 + 3]) {
        last = y;
        break;
      }
    if (last < 0 || last === end) continue;
    const tail = (last * FRAME_WIDTH + x) * 5;
    let sample = last;
    if (
      raw[tail + 4] === 0 &&
      x > 0 &&
      x < FRAME_WIDTH - 1 &&
      raw[tail - 5 + 3] &&
      raw[tail + 5 + 3]
    ) {
      for (let y = last - 1; y >= last - 3; y--) {
        const material = raw[(y * FRAME_WIDTH + x) * 5 + 4];
        if (material === 1 || material === 4) {
          sample = y;
          break;
        }
      }
    }
    const material = raw[(sample * FRAME_WIDTH + x) * 5 + 4];
    if (material !== 0 && material !== 1 && material !== 4) continue;
    const from = (sample * FRAME_WIDTH + x) * 4;
    for (let y = last + 1; y <= Math.min(end, last + 4); y++) {
      const dest = (y * FRAME_WIDTH + x) * 4;
      if (!pixels[dest + 3]) pixels.set(pixels.subarray(from, from + 4), dest);
    }
  }
  return pixels;
}

/** Assemble fresh flat RGBA attachments and coherent source chains. Complete
 * item groups own all their parts, so changing bottoms removes an old skirt
 * and changing tops never leaves a sleeve bound to the previous garment. */
export function assembleWardrobe(
  value: WardrobeRecipe,
  name = "Wardrobe character",
): SkinPack {
  const recipe = validateWardrobeRecipe(value);
  if (typeof name !== "string" || !name.trim() || name.length > 60)
    throw Error("Character name must contain 1–60 characters.");
  const identity = WARDROBE_ASSETS.identities.find(
    (item) => item.id === recipe.identity,
  )!;
  const top = WARDROBE_ASSETS.tops.find((item) => item.id === recipe.top)!;
  const bottom = WARDROBE_ASSETS.bottoms.find(
    (item) => item.id === recipe.bottom,
  )!;
  const shoes = WARDROBE_ASSETS.shoes.find((item) => item.id === recipe.shoes)!;
  const targets = {
    skin: recipe.colors.skin,
    hair: identity.sourceAppearance.hairColor,
    upper: recipe.colors.top,
    lower: recipe.colors.bottom,
    shoe: recipe.colors.shoes,
  };
  const images: SkinPack["images"] = {};
  const add = (parts: EncodedWardrobePart[], allowed: readonly Slot[]) => {
    for (const part of parts) {
      if (!allowed.includes(part.slot) || images[part.slot])
        throw Error(
          `Catalog item has invalid or duplicate slot ownership: ${part.slot}.`,
        );
      let pixels = colorPart(part, targets);
      if (part.slot === "near-shin" || part.slot === "far-shin")
        pixels = ankleAllowance(
          part,
          pixels,
          bottom.chains[part.slot === "near-shin" ? "nearLeg" : "farLeg"],
        );
      if (part.slot === "near-shoe" || part.slot === "far-shoe") {
        const side = part.slot === "near-shoe" ? "near" : "far";
        const source = shoes.ankles[side],
          target = bottom.chains[side === "near" ? "nearLeg" : "farLeg"][2];
        pixels = fitShoe(pixels, source, target);
      }
      images[part.slot] = pixels;
    }
  };
  add(identity.parts, [
    "head-neutral",
    "head-gentle",
    "head-joyful",
    "back-hair",
  ]);
  add(top.parts, [
    "torso",
    "near-upper-arm",
    "near-forearm",
    "far-upper-arm",
    "far-forearm",
  ]);
  add(bottom.parts, [
    "hips",
    "near-thigh",
    "near-shin",
    "far-thigh",
    "far-shin",
    "garment",
  ]);
  add(shoes.parts, ["near-shoe", "far-shoe"]);
  for (const slot of REQUIRED_SLOTS)
    if (!images[slot]) throw Error(`Wardrobe assembly is missing ${slot}.`);
  const sourceAppearance = {
    ...structuredClone(identity.sourceAppearance),
    skinTone: recipe.colors.skin.toUpperCase(),
    upperClothing:
      recipe.top === "denim-jacket" ? ("jacket" as const) : ("tee" as const),
    lowerClothing:
      recipe.bottom === "trousers" ? ("trousers" as const) : ("skirt" as const),
    upperColor: recipe.colors.top.toUpperCase(),
    lowerColor: recipe.colors.bottom.toUpperCase(),
    shoeColor: recipe.colors.shoes.toUpperCase(),
  };
  return {
    metadata: {
      format: "gathria-skin-pack",
      version: 1,
      id: `wardrobe-${recipe.identity}-${recipe.top}-${recipe.bottom}-${recipe.shoes}`,
      name: name.trim(),
      rigId: RIG_ID,
      slots: ALL_SLOTS.filter((slot) => !!images[slot]),
      bindings: {
        chains: structuredClone({ ...top.chains, ...bottom.chains }),
        offsets: {},
        mesh: { blendRadius: 6, volume: 0.65, preserveAnkleOverlap: true },
        jaw: structuredClone(identity.jaw),
        hairSway: 1,
        garmentSway: 1,
      },
      sourceAppearance,
      provenance: `${WARDROBE_ASSETS.provenance}\nWardrobe catalog 1 recipe: ${JSON.stringify(recipe)}\nMaterials are recolored from authored masks. Shoes are fitted by nearest-neighbor sampling between the selected bottom's source ankle and the common grounded sole at y=239. Clean skin/cloth ankle allowances extend at most four source pixels behind the shoes; explicit preserveAnkleOverlap retains them during mesh preparation. Flat skin images remain independently exportable; character.json is a compatibility reference, not the wardrobe recipe.`,
    },
    images,
  };
}

/** Apply only the assembled art and its recipe. A wardrobe choice never resets
 * user-authored rig geometry, motion timing, expression or preview direction. */
export function applyWardrobe(
  project: AuthoringProject,
  value: WardrobeRecipe,
): AuthoringProject & { wardrobe: WardrobeRecipe } {
  const wardrobe = validateWardrobeRecipe(value);
  return {
    ...project,
    wardrobe,
    skin: assembleWardrobe(wardrobe, project.skin.metadata.name),
  };
}

function equalData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.entries(a),
    right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      ([key, value]) =>
        Object.hasOwn(b, key) &&
        equalData(value, (b as Record<string, unknown>)[key]),
    )
  );
}

/** Validate, never regenerate, a saved project. A stale recipe would silently
 * discard custom edits at the next wardrobe change, so reject mismatches and
 * require explicit detachment. Renaming and appended provenance are allowed. */
export function assertWardrobeSkinMatches(
  value: WardrobeRecipe,
  skin: SkinPack,
): void {
  const expected = assembleWardrobe(value, skin.metadata.name);
  const {
    name: _actualName,
    provenance: actualProvenance,
    ...actualMetadata
  } = skin.metadata;
  const {
    name: _expectedName,
    provenance: expectedProvenance,
    ...expectedMetadata
  } = expected.metadata;
  if (
    !equalData(actualMetadata, expectedMetadata) ||
    (actualProvenance !== expectedProvenance &&
      !actualProvenance.startsWith(`${expectedProvenance}\n`))
  )
    throw Error(
      "Wardrobe recipe does not match the saved skin metadata. Detach the wardrobe recipe before editing custom artwork or bindings.",
    );
  if (
    !equalData(
      Object.keys(skin.images).sort(),
      Object.keys(expected.images).sort(),
    )
  )
    throw Error("Wardrobe recipe does not match the saved skin slots.");
  for (const slot of expected.metadata.slots) {
    const actual = skin.images[slot],
      wanted = expected.images[slot]!;
    if (
      !(actual instanceof Uint8ClampedArray) ||
      actual.length !== wanted.length ||
      actual.some((value, index) => value !== wanted[index])
    )
      throw Error(
        `Wardrobe recipe does not match the saved ${slot} pixels. Detach the wardrobe recipe before editing custom artwork.`,
      );
  }
}
