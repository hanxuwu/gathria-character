import { Unzlib } from "fflate";
import type { CustomWardrobeIdentity } from "./identity-types";
import { validateActionForearms } from "./action-forearms";
import { validateRunLegs, validateRunShoes } from "./run-attachments";
import { WARDROBE_ASSETS } from "./wardrobe-assets.generated";
import {
  applyWardrobe,
  validateWardrobeRecipe,
  WARDROBE_OPTIONS,
} from "./wardrobe";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  ACTION_FOREARM_SLOTS,
  RUN_LEG_SLOTS,
  RUN_SHOE_SLOTS,
  RIG_ID,
  type AuthoringProject,
  type JointTriple,
  type Point,
  type Slot,
} from "./types";
import type {
  CustomWardrobeItem,
  EncodedWardrobePart,
  WardrobeItemGroup,
  WardrobeMaterial,
  WardrobeRecipe,
} from "./wardrobe-types";

export type { CustomWardrobeItem, WardrobeItemGroup } from "./wardrobe-types";
export const MAX_WARDROBE_LIBRARY_BYTES = 4 * 1024 * 1024;

export const WARDROBE_ITEM_SLOTS = {
  top: [
    "torso",
    "near-upper-arm",
    "near-forearm",
    "far-upper-arm",
    "far-forearm",
  ],
  bottom: [
    "hips",
    "near-thigh",
    "near-shin",
    "far-thigh",
    "far-shin",
    "garment",
  ],
  shoes: ["near-shoe", "far-shoe"],
} as const satisfies Record<WardrobeItemGroup, readonly Slot[]>;
const PIXELS = FRAME_WIDTH * FRAME_HEIGHT;
const MATERIALS = [
  undefined,
  "skin",
  "hair",
  "upper",
  "lower",
  "shoe",
] as const;
const GROUP_MATERIALS = { top: [0, 1, 3], bottom: [0, 1, 4], shoes: [0, 5] };

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
function point(value: unknown, path: string): Point {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some(
      (n, i) =>
        !Number.isInteger(n) ||
        n < 1 ||
        n >= (i ? FRAME_HEIGHT - 1 : FRAME_WIDTH - 1),
    )
  )
    throw Error(
      `${path} must be an integer source point inside the 192×256 canvas.`,
    );
  return [value[0], value[1]];
}
function chain(value: unknown, path: string): JointTriple {
  if (!Array.isArray(value) || value.length !== 3)
    throw Error(`${path} needs three registered joints.`);
  const result = value.map((p, i) =>
    point(p, `${path}[${i}]`),
  ) as unknown as JointTriple;
  for (let i = 1; i < 3; i++) {
    const length = Math.hypot(
      result[i][0] - result[i - 1][0],
      result[i][1] - result[i - 1][1],
    );
    if (length < 3 || length > 96)
      throw Error(`${path} segment length must be 3–96 pixels.`);
  }
  return result;
}

/** Bounded streaming inflate is also used before saving/assembling imported
 * parts; the trusted built-in catalog retains its original decode path. */
export function decodeWardrobeItemPart(data: string): Uint8Array {
  if (
    typeof data !== "string" ||
    data.length > 400000 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      data,
    ) ||
    !data.length
  )
    throw Error(
      "Wardrobe part data must be bounded, canonical base64 zlib data.",
    );
  const compressed = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const output = new Uint8Array(PIXELS * 5);
  let written = 0,
    complete = false;
  try {
    const inflate = new Unzlib((chunk, final) => {
      if (written + chunk.length > output.length)
        throw Error("Inflation exceeds the registered canvas.");
      output.set(chunk, written);
      written += chunk.length;
      complete ||= final;
    });
    for (let i = 0; i < compressed.length; i += 256)
      inflate.push(
        compressed.subarray(i, i + 256),
        i + 256 >= compressed.length,
      );
  } catch {
    throw Error(
      "Wardrobe part cannot be decompressed within its registered 192×256 canvas.",
    );
  }
  if (!complete || written !== output.length)
    throw Error(
      "Wardrobe part data must decode to exactly 192×256 RGBA/material pixels.",
    );
  // fflate's streaming zlib reader does not verify the trailer checksum.
  let a = 1,
    b = 0;
  for (const value of output) {
    a = (a + value) % 65521;
    b = (b + a) % 65521;
  }
  const checksum = ((b << 16) | a) >>> 0;
  if (
    compressed.length < 6 ||
    new DataView(compressed.buffer).getUint32(compressed.length - 4) !==
      checksum
  )
    throw Error("Wardrobe part zlib checksum is invalid.");
  return output;
}

function part(
  value: unknown,
  group: WardrobeItemGroup,
  allowed: readonly Slot[],
): EncodedWardrobePart {
  const raw = object(value, "item part");
  fields(
    raw,
    ["slot", "data", "palette", "preserveWarmSkin", "sourceLayerId"],
    "item part",
  );
  if (!(allowed as readonly unknown[]).includes(raw.slot))
    throw Error(`A ${group} item cannot own slot ${String(raw.slot)}.`);
  if (typeof raw.preserveWarmSkin !== "boolean")
    throw Error("preserveWarmSkin must be boolean.");
  const palette: Partial<Record<WardrobeMaterial, string>> = {};
  for (const [key, value] of Object.entries(
    object(raw.palette, "item palette"),
  )) {
    if (
      !(MATERIALS as readonly unknown[]).includes(key) ||
      typeof value !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(value) ||
      value.toLowerCase() === "#000000"
    )
      throw Error(
        "Item palettes need known material names and non-black six-digit source colors.",
      );
    palette[key as WardrobeMaterial] = value.toLowerCase();
  }
  const pixels = decodeWardrobeItemPart(raw.data as string);
  let visible = 0;
  for (let p = 0; p < pixels.length; p += 5) {
    const alpha = pixels[p + 3],
      id = pixels[p + 4];
    if (alpha !== 0 && alpha !== 255)
      throw Error(
        "Item art must use binary alpha, with no partial transparency.",
      );
    if (!alpha) {
      if (pixels[p] || pixels[p + 1] || pixels[p + 2] || id)
        throw Error(
          "Transparent item pixels must have zero RGB and material ID.",
        );
      continue;
    }
    visible++;
    if (!GROUP_MATERIALS[group].includes(id))
      throw Error(`Material ${id} does not belong to the ${group} item.`);
    const material = MATERIALS[id];
    if (material && !palette[material])
      throw Error(`Item palette is missing the source ${material} color.`);
    const index = p / 5,
      x = index % FRAME_WIDTH,
      y = Math.floor(index / FRAME_WIDTH);
    if (!x || !y || x === FRAME_WIDTH - 1 || y === FRAME_HEIGHT - 1)
      throw Error(
        "Item artwork touches the frame edge; preserve transparent registration margins.",
      );
  }
  if (!visible || visible === PIXELS)
    throw Error(
      "Each item part needs visible art on a transparent background.",
    );
  return {
    slot: raw.slot as Slot,
    data: raw.data as string,
    palette,
    preserveWarmSkin: raw.preserveWarmSkin,
    sourceLayerId: text(raw.sourceLayerId, "sourceLayerId", 120),
  };
}

/** Validated items are detached values. Custom IDs never shadow frozen catalog
 * IDs, and complete slot groups prevent stale sleeves or skirts remaining. */
export function validateWardrobeItem(value: unknown): CustomWardrobeItem {
  const raw = object(value, "wardrobe item");
  if (!["top", "bottom", "shoes"].includes(String(raw.group)))
    throw Error("Wardrobe item group must be top, bottom or shoes.");
  const group = raw.group as WardrobeItemGroup;
  if (
    raw.format !== "gathria-wardrobe-item" ||
    ![1, 2, 3, 4].includes(raw.version as number) ||
    raw.rigId !== RIG_ID
  )
    throw Error("Unsupported wardrobe item format, version or rig family.");
  if (raw.version === 2 && group !== "top")
    throw Error(
      "Wardrobe item version 2 is reserved for tops with action forearms.",
    );
  if (
    (raw.version === 3 || raw.version === 4) &&
    raw.colorModel !== "source-relative-v1"
  )
    throw Error(
      "Wardrobe item version 3/4 requires colorModel source-relative-v1.",
    );
  if (raw.version === 4 && group === "top")
    throw Error(
      "Wardrobe item version 4 is reserved for run bottoms and shoes.",
    );
  const runLegs =
    raw.version === 4 && group === "bottom"
      ? validateRunLegs(raw.runLegs)
      : undefined;
  const runShoes =
    raw.version === 4 && group === "shoes"
      ? validateRunShoes(raw.runShoes)
      : undefined;
  const hasActionForearms =
    raw.version === 2 ||
    (raw.version === 3 &&
      group === "top" &&
      Object.hasOwn(raw, "actionForearms"));
  fields(
    raw,
    [
      "format",
      "version",
      "rigId",
      "id",
      "name",
      "provenance",
      "group",
      "parts",
      group === "shoes" ? "ankles" : "chains",
      ...(raw.version === 3 || raw.version === 4 ? ["colorModel"] : []),
      ...(runLegs ? ["runLegs"] : []),
      ...(runShoes ? ["runShoes"] : []),
      ...(hasActionForearms ? ["actionForearms"] : []),
    ],
    "wardrobe item",
  );
  const id = text(raw.id, "item.id", 32);
  if (!/^custom-[a-z0-9][a-z0-9-]*$/.test(id))
    throw Error(
      "Item ID must start custom- and contain lowercase letters, digits or hyphens.",
    );
  const expected: readonly Slot[] = hasActionForearms
    ? [...WARDROBE_ITEM_SLOTS.top, ...ACTION_FOREARM_SLOTS]
    : [
        ...WARDROBE_ITEM_SLOTS[group],
        ...(runLegs ? RUN_LEG_SLOTS : []),
        ...(runShoes ? RUN_SHOE_SLOTS : []),
      ];
  if (
    !Array.isArray(raw.parts) ||
    raw.parts.length < expected.length - (group === "bottom" ? 1 : 0) ||
    raw.parts.length > expected.length
  )
    throw Error("Wardrobe item must contain its complete owned slot group.");
  const parts = raw.parts.map((value) => part(value, group, expected));
  const slots = new Set(parts.map((value) => value.slot));
  if (
    slots.size !== parts.length ||
    expected.some((slot) => slot !== "garment" && !slots.has(slot))
  )
    throw Error("Wardrobe item has duplicate or missing owned slots.");
  // Canonical ordering keeps the recipe's art/provenance reproducible after ZIP round trips.
  parts.sort(
    (a, b) =>
      (expected as readonly Slot[]).indexOf(a.slot) -
      (expected as readonly Slot[]).indexOf(b.slot),
  );
  const base = {
    format: "gathria-wardrobe-item" as const,
    ...(raw.version === 3
      ? { version: 3 as const, colorModel: "source-relative-v1" as const }
      : { version: 1 as const }),
    rigId: RIG_ID as typeof RIG_ID,
    id,
    name: text(raw.name, "item.name", 60),
    provenance: text(raw.provenance, "item.provenance", 2000),
    parts,
  };
  if (group === "shoes") {
    const rawAnkles = object(raw.ankles, "item.ankles");
    fields(rawAnkles, ["near", "far"], "item.ankles");
    const ankles = {
      near: point(rawAnkles.near, "item.ankles.near"),
      far: point(rawAnkles.far, "item.ankles.far"),
    };
    for (const image of parts) {
      const pixels = decodeWardrobeItemPart(image.data),
        ankle =
          image.slot === "near-shoe-run"
            ? runShoes!.nearLeg.ankle
            : image.slot === "far-shoe-run"
              ? runShoes!.farLeg.ankle
              : ankles[image.slot === "near-shoe" ? "near" : "far"];
      let sole = -1;
      for (let p = 0; p < PIXELS; p++)
        if (pixels[p * 5 + 3]) sole = Math.floor(p / FRAME_WIDTH);
      if (sole <= ankle[1])
        throw Error(
          "Shoe item needs a visible sole below its registered ankle.",
        );
    }
    return runShoes
      ? {
          ...base,
          version: 4,
          colorModel: "source-relative-v1",
          group,
          ankles,
          runShoes,
        }
      : { ...base, group, ankles };
  }
  const rawChains = object(raw.chains, "item.chains");
  if (group === "top") {
    fields(rawChains, ["nearArm", "farArm"], "item.chains");
    const chains = {
      nearArm: chain(rawChains.nearArm, "nearArm"),
      farArm: chain(rawChains.farArm, "farArm"),
    };
    return raw.version === 3
      ? {
          ...base,
          version: 3,
          colorModel: "source-relative-v1",
          group,
          chains,
          ...(hasActionForearms
            ? { actionForearms: validateActionForearms(raw.actionForearms) }
            : {}),
        }
      : raw.version === 2
        ? {
            ...base,
            version: 2,
            group,
            chains,
            actionForearms: validateActionForearms(raw.actionForearms),
          }
        : { ...base, version: 1, group, chains };
  }
  fields(rawChains, ["nearLeg", "farLeg"], "item.chains");
  const legChains = {
    nearLeg: chain(rawChains.nearLeg, "nearLeg"),
    farLeg: chain(rawChains.farLeg, "farLeg"),
  };
  return runLegs
    ? {
        ...base,
        version: 4,
        colorModel: "source-relative-v1",
        group,
        chains: legChains,
        runLegs,
      }
    : { ...base, group, chains: legChains };
}

export function validateWardrobeItems(value: unknown): CustomWardrobeItem[] {
  if (!Array.isArray(value) || value.length > 8)
    throw Error("A project supports at most eight custom wardrobe items.");
  const envelope = JSON.stringify(
    { format: "gathria-wardrobe-library", version: 1, items: value },
    null,
    2,
  );
  if (new TextEncoder().encode(envelope).length > MAX_WARDROBE_LIBRARY_BYTES)
    throw Error(
      "Custom wardrobe sources exceed the 4 MiB project library limit; remove an unused item or simplify its artwork.",
    );
  const items = value.map(validateWardrobeItem);
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw Error("Duplicate wardrobe item IDs are not allowed.");
  return items;
}

export function wardrobeOptions(
  items: CustomWardrobeItem[] = [],
  identities: CustomWardrobeIdentity[] = [],
) {
  const options = (group: WardrobeItemGroup) =>
    items
      .filter((item) => item.group === group)
      .map(({ id, name }) => ({ id, label: name }));
  return {
    identities: [
      ...WARDROBE_OPTIONS.identities,
      ...identities.map(({ id, name }) => ({ id, label: name })),
    ],
    tops: [...WARDROBE_OPTIONS.tops, ...options("top")],
    bottoms: [...WARDROBE_OPTIONS.bottoms, ...options("bottom")],
    shoes: [...WARDROBE_OPTIONS.shoes, ...options("shoes")],
  };
}

export function createWardrobeItemTemplate(
  recipe: WardrobeRecipe,
  group: WardrobeItemGroup,
  items: CustomWardrobeItem[] = [],
  identities: CustomWardrobeIdentity[] = [],
): CustomWardrobeItem {
  const checkedItems = validateWardrobeItems(items),
    selected = validateWardrobeRecipe(recipe, checkedItems, identities);
  const custom = checkedItems.find(
    (item) => item.id === selected[group] && item.group === group,
  );
  if (custom) return structuredClone(custom);
  const collection =
    group === "top"
      ? WARDROBE_ASSETS.tops
      : group === "bottom"
        ? WARDROBE_ASSETS.bottoms
        : WARDROBE_ASSETS.shoes;
  const source = collection.find((item) => item.id === selected[group])!;
  return validateWardrobeItem({
    format: "gathria-wardrobe-item",
    version: 1,
    rigId: RIG_ID,
    id: `custom-${source.id}`,
    name: `${source.name} copy`,
    group,
    parts: structuredClone(source.parts),
    ...(group === "shoes"
      ? {
          ankles: structuredClone(
            (source as (typeof WARDROBE_ASSETS.shoes)[number]).ankles,
          ),
        }
      : {
          chains: structuredClone(
            (
              source as
                | (typeof WARDROBE_ASSETS.tops)[number]
                | (typeof WARDROBE_ASSETS.bottoms)[number]
            ).chains,
          ),
        }),
    provenance: `${WARDROBE_ASSETS.provenance}\nTemplate copied from catalog 1 ${group} ${source.id}. Record the creator, license and changes when replacing its artwork.`,
  });
}

/** One authoring edit validates, installs and selects a complete item. Any
 * incompatible registration throws before the caller replaces its project. */
export function addWardrobeItem(
  project: AuthoringProject,
  value: CustomWardrobeItem,
): AuthoringProject {
  if (!project.wardrobe)
    throw Error("Open wardrobe before importing a clothing item.");
  const item = validateWardrobeItem(value),
    items = validateWardrobeItems(project.wardrobeItems ?? []);
  if (items.some((existing) => existing.id === item.id))
    throw Error(
      `Item ${item.id} already exists; use a new ID instead of overwriting saved artwork.`,
    );
  if (items.length === 8)
    throw Error("A project supports at most eight custom wardrobe items.");
  const next = { ...project, wardrobeItems: [...items, item] };
  return project.wardrobe.version === 3
    ? applyWardrobe(next, { ...project.wardrobe, [item.group]: item.id })
    : applyWardrobe(next, {
        ...project.wardrobe,
        version: 2,
        [item.group]: item.id,
      });
}

export function removeWardrobeItem(
  project: AuthoringProject,
  id: string,
): AuthoringProject {
  const items = validateWardrobeItems(project.wardrobeItems ?? []),
    item = items.find((entry) => entry.id === id);
  if (!item) throw Error("This custom wardrobe item is not in the project.");
  if (project.wardrobe?.[item.group] === id)
    throw Error(
      "Choose a different item before removing the selected clothing.",
    );
  return {
    ...project,
    wardrobeItems: items.filter((entry) => entry.id !== id),
  };
}
