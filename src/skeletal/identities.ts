import { parseCharacterConfig } from "../core/config";
import { WARDROBE_ASSETS } from "./wardrobe-assets.generated";
import { decodeWardrobeItemPart } from "./wardrobe-items";
import { applyWardrobe, defaultWardrobeRecipe } from "./wardrobe";
import { IDENTITY_SLOTS, type CustomWardrobeIdentity } from "./identity-types";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  RIG_ID,
  type AuthoringProject,
  type Point,
} from "./types";
import type {
  EncodedWardrobePart,
  WardrobeRecipe,
  WardrobeRecipeV3,
} from "./wardrobe-types";

export type { CustomWardrobeIdentity } from "./identity-types";
export const MAX_IDENTITY_LIBRARY_BYTES = 4 * 1024 * 1024;
export const MAX_IDENTITIES = 4;

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function fields(
  raw: Record<string, unknown>,
  names: readonly string[],
  path: string,
) {
  if (
    Object.keys(raw).length !== names.length ||
    names.some((name) => !Object.hasOwn(raw, name))
  )
    throw Error(`${path} must contain exactly: ${names.join(", ")}.`);
}
function text(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw Error(`${path} must contain 1–${max} characters.`);
  return value.trim();
}
function number(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw Error(`${path} must be finite and between ${min} and ${max}.`);
  return value;
}
function color(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(value) ||
    ["#000000", "#ffffff"].includes(value.toLowerCase())
  )
    throw Error(
      "Identity source colors must be six-digit hex colors, excluding black and white.",
    );
  return value.toLowerCase();
}
function pair(
  value: unknown,
  expected: readonly [number, number],
  path: string,
) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((v, i) => v !== expected[i])
  )
    throw Error(`${path} must be [${expected.join(",")}].`);
}

/** Identity sources are separate from frozen catalog identities. Their authored
 * neutral source colors are preserved exactly; recoloring requires explicit V3. */
export function validateWardrobeIdentity(
  value: unknown,
): CustomWardrobeIdentity {
  const raw = object(value, "identity");
  fields(
    raw,
    [
      "format",
      "version",
      "rigId",
      "id",
      "name",
      "provenance",
      "frame",
      "anchor",
      "neck",
      "jaw",
      "hairSway",
      "palette",
      "sourceAppearance",
      "parts",
    ],
    "identity",
  );
  if (
    raw.format !== "gathria-character-identity" ||
    raw.version !== 1 ||
    raw.rigId !== RIG_ID
  )
    throw Error(
      "Unsupported character identity format, version or rig family.",
    );
  const id = text(raw.id, "identity.id", 32);
  if (!/^custom-[a-z0-9][a-z0-9-]*$/.test(id))
    throw Error(
      "Identity ID must start with custom- and contain lowercase letters, digits or hyphens.",
    );
  const frame = object(raw.frame, "identity.frame");
  fields(frame, ["width", "height"], "identity.frame");
  if (frame.width !== FRAME_WIDTH || frame.height !== FRAME_HEIGHT)
    throw Error("Identity frame must be 192×256.");
  pair(raw.anchor, [96, 240], "identity.anchor");
  pair(raw.neck, [96, 118], "identity.neck");
  const jaw = object(raw.jaw, "identity.jaw");
  fields(jaw, ["center", "start", "scale", "length"], "identity.jaw");
  if (!Array.isArray(jaw.center) || jaw.center.length !== 2)
    throw Error("identity.jaw.center must be a point.");
  const checkedJaw = {
    center: [
      number(jaw.center[0], "jaw.center.x", 0, 192),
      number(jaw.center[1], "jaw.center.y", 0, 256),
    ] as Point,
    start: number(jaw.start, "jaw.start", 0, 240),
    scale: number(jaw.scale, "jaw.scale", 0.7, 1.3),
    length: number(jaw.length, "jaw.length", 0.7, 1.3),
  };
  const paletteRaw = object(raw.palette, "identity.palette");
  fields(paletteRaw, ["skin", "hair"], "identity.palette");
  const palette = {
    skin: color(paletteRaw.skin),
    hair: color(paletteRaw.hair),
  };
  const sourceAppearance = parseCharacterConfig(raw.sourceAppearance);
  const appearanceInput = object(
    raw.sourceAppearance,
    "identity.sourceAppearance",
  );
  if (
    Object.keys(appearanceInput).some(
      (key) => !Object.hasOwn(sourceAppearance, key),
    )
  )
    throw Error("identity.sourceAppearance contains unsupported fields.");
  if (appearanceInput.preview !== undefined) {
    fields(
      object(appearanceInput.preview, "identity.sourceAppearance.preview"),
      ["animation", "facing"],
      "identity.sourceAppearance.preview",
    );
  }
  if (
    sourceAppearance.schemaVersion !== 2 ||
    sourceAppearance.artworkVersion !== 6
  )
    throw Error("Identity sourceAppearance must use artworkVersion 6.");
  if (
    sourceAppearance.skinTone.toLowerCase() !== palette.skin ||
    sourceAppearance.hairColor.toLowerCase() !== palette.hair
  )
    throw Error(
      "Identity sourceAppearance skin/hair must match its source palette.",
    );
  if (!Array.isArray(raw.parts) || raw.parts.length < 3 || raw.parts.length > 4)
    throw Error("Identity needs three complete heads and optional back-hair.");
  const parts: EncodedWardrobePart[] = raw.parts.map((value, index) => {
    const part = object(value, `identity.parts[${index}]`);
    fields(
      part,
      ["slot", "data", "palette", "preserveWarmSkin", "sourceLayerId"],
      "identity part",
    );
    if (!(IDENTITY_SLOTS as readonly unknown[]).includes(part.slot))
      throw Error(
        "Identity may own only complete expression heads and back-hair.",
      );
    if (typeof part.preserveWarmSkin !== "boolean")
      throw Error("Identity preserveWarmSkin must be boolean.");
    const partPalette = object(part.palette, "identity part palette");
    if (Object.keys(partPalette).some((key) => !["skin", "hair"].includes(key)))
      throw Error("Identity palette accepts only skin and hair materials.");
    const canonicalPalette: Partial<typeof palette> = {};
    for (const key of Object.keys(partPalette) as (keyof typeof palette)[]) {
      const hex = color(partPalette[key]);
      if (hex !== palette[key])
        throw Error(
          "Every identity part must use the declared identity source palette.",
        );
      canonicalPalette[key] = hex;
    }
    const pixels = decodeWardrobeItemPart(part.data as string);
    let visible = 0;
    for (let p = 0; p < pixels.length; p += 5) {
      const alpha = pixels[p + 3],
        material = pixels[p + 4];
      if (alpha !== 0 && alpha !== 255)
        throw Error("Identity artwork must use binary alpha.");
      if (!alpha) {
        if (pixels[p] || pixels[p + 1] || pixels[p + 2] || material)
          throw Error(
            "Transparent identity pixels must have zero RGB and material ID.",
          );
        continue;
      }
      visible++;
      if (material > 2)
        throw Error(
          "Identity materials must be fixed (0), skin (1) or hair (2).",
        );
      if (material && !canonicalPalette[material === 1 ? "skin" : "hair"])
        throw Error("Identity part palette is missing a used material.");
      const i = p / 5,
        x = i % FRAME_WIDTH,
        y = Math.floor(i / FRAME_WIDTH);
      if (!x || !y || x === FRAME_WIDTH - 1 || y === FRAME_HEIGHT - 1)
        throw Error("Identity art must preserve transparent frame margins.");
    }
    if (!visible) throw Error("Each identity part needs visible artwork.");
    return {
      slot: part.slot as EncodedWardrobePart["slot"],
      data: part.data as string,
      palette: canonicalPalette,
      preserveWarmSkin: part.preserveWarmSkin,
      sourceLayerId: text(part.sourceLayerId, "identity sourceLayerId", 120),
    };
  });
  if (
    new Set(parts.map((part) => part.slot)).size !== parts.length ||
    IDENTITY_SLOTS.slice(0, 3).some(
      (slot) => !parts.some((part) => part.slot === slot),
    )
  )
    throw Error("Identity must contain each expression head exactly once.");
  parts.sort(
    (a, b) =>
      (IDENTITY_SLOTS as readonly string[]).indexOf(a.slot) -
      (IDENTITY_SLOTS as readonly string[]).indexOf(b.slot),
  );
  return {
    format: "gathria-character-identity",
    version: 1,
    rigId: RIG_ID,
    id,
    name: text(raw.name, "identity.name", 60),
    provenance: text(raw.provenance, "identity.provenance", 2000),
    frame: { width: 192, height: 256 },
    anchor: [96, 240],
    neck: [96, 118],
    jaw: checkedJaw,
    hairSway: number(raw.hairSway, "identity.hairSway", 0, 2),
    palette,
    sourceAppearance,
    parts,
  };
}

export function validateWardrobeIdentities(
  value: unknown,
): CustomWardrobeIdentity[] {
  if (!Array.isArray(value) || value.length > MAX_IDENTITIES)
    throw Error("A project supports at most four custom identities.");
  if (
    new TextEncoder().encode(
      JSON.stringify(
        { format: "gathria-identity-library", version: 1, identities: value },
        null,
        2,
      ),
    ).length > MAX_IDENTITY_LIBRARY_BYTES
  )
    throw Error(
      "Identity sources exceed the 4 MiB project identity library limit.",
    );
  const identities = value.map(validateWardrobeIdentity);
  if (
    new Set(identities.map((identity) => identity.id)).size !==
    identities.length
  )
    throw Error("Duplicate character identity IDs are not allowed.");
  return identities;
}

export function defaultCustomWardrobeRecipe(
  value: CustomWardrobeIdentity,
): WardrobeRecipeV3 {
  const identity = validateWardrobeIdentity(value),
    base = defaultWardrobeRecipe();
  return {
    ...base,
    version: 3,
    identity: identity.id,
    colors: {
      ...base.colors,
      skin: identity.palette.skin,
      hair: identity.palette.hair,
    },
  };
}

/** Installing sources never changes the visible character or guesses masks. */
export function addWardrobeIdentity(
  project: AuthoringProject,
  value: CustomWardrobeIdentity,
): AuthoringProject {
  const identity = validateWardrobeIdentity(value),
    library = validateWardrobeIdentities(project.wardrobeIdentities ?? []);
  if (library.some((entry) => entry.id === identity.id))
    throw Error(
      `Identity ${identity.id} already exists; use a new ID instead of overwriting saved artwork.`,
    );
  return {
    ...project,
    wardrobeIdentities: validateWardrobeIdentities([...library, identity]),
  };
}

/** Explicit selection keeps chosen clothes; a flat project starts a documented
 * default outfit. Caller snapshots retain the untouched previous flat artwork. */
export function selectWardrobeIdentity(
  project: AuthoringProject,
  id: string,
): AuthoringProject {
  const identities = validateWardrobeIdentities(
      project.wardrobeIdentities ?? [],
    ),
    identity = identities.find((entry) => entry.id === id);
  if (identity) {
    const recipe = project.wardrobe ?? defaultCustomWardrobeRecipe(identity);
    return applyWardrobe(project, {
      ...recipe,
      version: 3,
      identity: id,
      colors: {
        ...recipe.colors,
        skin: identity.palette.skin,
        hair: identity.palette.hair,
      },
    });
  }
  const builtin = WARDROBE_ASSETS.identities.find((entry) => entry.id === id);
  if (!builtin) throw Error("This character identity is not in the project.");
  const defaults = defaultWardrobeRecipe(builtin.id);
  if (!project.wardrobe) return applyWardrobe(project, defaults);
  const { hair: _hair, ...colors } = project.wardrobe
    .colors as WardrobeRecipeV3["colors"];
  return applyWardrobe(project, {
    ...project.wardrobe,
    version: project.wardrobe.version === 1 ? 1 : 2,
    identity: builtin.id,
    colors: {
      ...colors,
      skin: project.wardrobe.version === 3 ? defaults.colors.skin : colors.skin,
    },
  } as WardrobeRecipe);
}

export function removeWardrobeIdentity(
  project: AuthoringProject,
  id: string,
): AuthoringProject {
  const identities = validateWardrobeIdentities(
    project.wardrobeIdentities ?? [],
  );
  if (!identities.some((entry) => entry.id === id))
    throw Error("This character identity is not in the project.");
  if (project.wardrobe?.identity === id)
    throw Error(
      "Choose another identity before removing the selected character.",
    );
  return {
    ...project,
    wardrobeIdentities: identities.filter((entry) => entry.id !== id),
  };
}

export function createWardrobeIdentityTemplate(
  recipe: WardrobeRecipe,
  identities: CustomWardrobeIdentity[] = [],
): CustomWardrobeIdentity {
  const custom = validateWardrobeIdentities(identities).find(
    (entry) => entry.id === recipe.identity,
  );
  if (custom) return structuredClone(custom);
  const source = WARDROBE_ASSETS.identities.find(
    (entry) => entry.id === recipe.identity,
  );
  if (!source) throw Error("Unknown character identity.");
  const palette = source.parts.find(
    (part) => part.slot === "head-neutral",
  )!.palette;
  return validateWardrobeIdentity({
    format: "gathria-character-identity",
    version: 1,
    rigId: RIG_ID,
    id: `custom-${source.id}`,
    name: `${source.name} copy`,
    provenance: `${WARDROBE_ASSETS.provenance}\nIdentity template from frozen catalog 1 ${source.id}. Its original source pixels and palette are editable; custom identity source-color preservation is explicit and differs from the catalog's historical recolor. Record creator, license and edits.`,
    frame: { width: 192, height: 256 },
    anchor: [96, 240],
    neck: [96, 118],
    jaw: structuredClone(source.jaw),
    hairSway: 1,
    palette: {
      skin: palette.skin!,
      hair: palette.hair!,
    },
    sourceAppearance: {
      ...structuredClone(source.sourceAppearance),
      skinTone: palette.skin!,
      hairColor: palette.hair!,
    },
    parts: structuredClone(source.parts),
  });
}
