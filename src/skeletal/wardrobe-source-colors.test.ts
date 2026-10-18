import { describe, expect, it } from "vitest";
import { createMotionLibrary, createRigDefinition } from "./definition";
import { prepareRig } from "./renderer";
import { validateProject } from "./skin-io";
import { assembleWardrobe, defaultWardrobeRecipe } from "./wardrobe";
import {
  createWardrobeItemTemplate,
  decodeWardrobeItemPart,
  validateWardrobeItem,
} from "./wardrobe-items";
import type {
  CustomWardrobeItemV3,
  WardrobeItemGroup,
  WardrobeRecipeV2,
} from "./wardrobe-types";

function sourceItem(group: WardrobeItemGroup): CustomWardrobeItemV3 {
  return {
    ...createWardrobeItemTemplate(defaultWardrobeRecipe(), group),
    version: 3,
    colorModel: "source-relative-v1",
    id: `custom-source-${group}`,
  } as CustomWardrobeItemV3;
}
function fixture(active = false) {
  const items = (["top", "bottom", "shoes"] as const).map(sourceItem);
  const top = items[0];
  if (active && top.group === "top") {
    const pair = {
      "near-forearm": "near-forearm-active",
      "far-forearm": "far-forearm-active",
    } as const;
    top.actionForearms = { run: pair, jump: pair };
    for (const side of ["near", "far"] as const)
      top.parts.push({
        ...structuredClone(
          top.parts.find((part) => part.slot === `${side}-forearm`)!,
        ),
        slot: `${side}-forearm-active`,
      });
  }
  const recipe: WardrobeRecipeV2 = {
    ...defaultWardrobeRecipe(),
    version: 2,
    top: items[0].id,
    bottom: items[1].id,
    shoes: items[2].id,
    colors: {
      skin: items[0].parts[0].palette.skin!,
      top: items[0].parts[0].palette.upper!,
      bottom: items[1].parts[0].palette.lower!,
      shoes: items[2].parts[0].palette.shoe!,
    },
  };
  return { items, recipe };
}
const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

describe("explicit source-relative wardrobe item colors", () => {
  it("preserves an authored skirt while sharing the unchanged catalog identity and clothing", () => {
    const base = defaultWardrobeRecipe("waves");
    const item = validateWardrobeItem({
      ...createWardrobeItemTemplate(base, "bottom"),
      id: "custom-source-skirt",
      version: 3,
      colorModel: "source-relative-v1",
    });
    const garment = item.parts.find((part) => part.slot === "garment")!;
    const recipe: WardrobeRecipeV2 = {
      ...base,
      version: 2,
      bottom: item.id,
      colors: {
        ...base.colors,
        skin: garment.palette.skin!,
        bottom: garment.palette.lower!,
      },
    };
    const source = assembleWardrobe(recipe, "Source skirt", [item]);
    const catalog = assembleWardrobe(
      { ...base, colors: recipe.colors },
      "Source skirt",
    );
    const raw = decodeWardrobeItemPart(garment.data);
    const expected = new Uint8ClampedArray(192 * 256 * 4);
    for (let p = 0; p < raw.length / 5; p++)
      expected.set(raw.subarray(p * 5, p * 5 + 4), p * 4);
    expect(equal(source.images.garment!, expected)).toBe(true);
    for (const slot of [
      "head-neutral",
      "head-gentle",
      "head-joyful",
      "torso",
      "near-upper-arm",
      "near-forearm",
      "far-upper-arm",
      "far-forearm",
      "near-shoe",
      "far-shoe",
    ] as const)
      expect(equal(source.images[slot]!, catalog.images[slot]!)).toBe(true);
    expect(source.metadata.bindings).toEqual(catalog.metadata.bindings);
  });

  it("preserves authored RGB at source palettes for all garment groups and active hands", () => {
    const { items, recipe } = fixture(true);
    const skin = assembleWardrobe(recipe, "Source colors", items);
    for (const item of items) {
      expect(validateWardrobeItem(item)).toEqual(item);
      for (const part of item.parts) {
        const raw = decodeWardrobeItemPart(part.data);
        const actual = skin.images[part.slot]!;
        for (let p = 0; p < raw.length / 5; p++) {
          // Assembly may extend transparent ankle margins, but cannot repaint
          // existing material pixels. This fixture's shoes need no fitting.
          if (!raw[p * 5 + 3]) continue;
          expect(Array.from(actual.subarray(p * 4, p * 4 + 4))).toEqual(
            Array.from(raw.subarray(p * 5, p * 5 + 4)),
          );
        }
      }
    }
    expect(skin.metadata.version).toBe(2);
    expect(skin.metadata.actionForearms).toEqual({
      run: {
        "near-forearm": "near-forearm-active",
        "far-forearm": "far-forearm-active",
      },
      jump: {
        "near-forearm": "near-forearm-active",
        "far-forearm": "far-forearm-active",
      },
    });
  });

  it.each([
    ["skin", 1, "#87593f"],
    ["top", 3, "#c8786b"],
    ["bottom", 4, "#2e7b69"],
    ["shoes", 5, "#a67843"],
  ] as const)(
    "recolors only the authored %s channel and keeps alpha and fixed details",
    (color, material, target) => {
      const { items, recipe } = fixture(true);
      const before = assembleWardrobe(recipe, "Source colors", items);
      const after = assembleWardrobe(
        { ...recipe, colors: { ...recipe.colors, [color]: target } },
        "Source colors",
        items,
      );
      let changed = 0,
        alphaChanges = 0,
        unownedChanges = 0;
      for (const item of items)
        for (const part of item.parts) {
          const raw = decodeWardrobeItemPart(part.data);
          const a = before.images[part.slot]!,
            b = after.images[part.slot]!;
          for (let p = 0; p < a.length / 4; p++) {
            alphaChanges += +(a[p * 4 + 3] !== b[p * 4 + 3]);
            if (!raw[p * 5 + 3]) continue;
            const same = equal(
              a.subarray(p * 4, p * 4 + 4),
              b.subarray(p * 4, p * 4 + 4),
            );
            if (raw[p * 5 + 4] === material) changed += +!same;
            else unownedChanges += +!same;
          }
        }
      expect(changed).toBeGreaterThan(100);
      expect(alphaChanges).toBe(0);
      expect(unownedChanges).toBe(0);
    },
  );

  it("keeps source-neighbor colors continuous instead of switching shading models", () => {
    const { items, recipe } = fixture();
    const source = assembleWardrobe(recipe, "Source colors", items);
    for (const color of ["skin", "top", "bottom", "shoes"] as const) {
      const hex = recipe.colors[color];
      const target = `#${(parseInt(hex.slice(1), 16) + 1).toString(16).padStart(6, "0")}`;
      const neighbor = assembleWardrobe(
        { ...recipe, colors: { ...recipe.colors, [color]: target } },
        "Source colors",
        items,
      );
      let largest = 0,
        changed = 0;
      for (const item of items)
        for (const part of item.parts) {
          const a = source.images[part.slot]!,
            b = neighbor.images[part.slot]!;
          for (let p = 0; p < a.length; p++) {
            const delta = Math.abs(a[p] - b[p]);
            largest = Math.max(largest, delta);
            changed += +(delta > 0);
          }
        }
      expect(changed).toBeGreaterThan(100);
      expect(largest).toBeLessThanOrEqual(2);
    }
  });

  it("retains strict version, color-model and paired action ownership", () => {
    const { items } = fixture(true),
      plain = fixture().items;
    const invalid = [
      { ...items[0], version: 4 },
      { ...items[0], colorModel: "source-relative-v2" },
      { ...items[0], colorModel: undefined },
      { ...items[0], version: 2 },
      { ...items[0], version: 1 },
      { ...items[0], actionForearms: {} },
      { ...items[0], actionForearms: undefined },
      {
        ...items[0],
        actionForearms: {
          walk: {
            "near-forearm": "near-forearm-active",
            "far-forearm": "far-forearm-active",
          },
        },
      },
      {
        ...plain[0],
        actionForearms: {
          run: {
            "near-forearm": "near-forearm-active",
            "far-forearm": "far-forearm-active",
          },
        },
      },
      { ...items[1], actionForearms: {} },
      { ...items[2], actionForearms: {} },
    ];
    const withoutMap = structuredClone(items[0]);
    if (withoutMap.group === "top") delete withoutMap.actionForearms;
    invalid.push(withoutMap as (typeof invalid)[number]);
    for (const value of invalid)
      expect(() => validateWardrobeItem(value)).toThrow();
    for (const item of plain) expect(validateWardrobeItem(item)).toEqual(item);
  });

  it("persists the explicit model with deterministic posed artwork and stable registration", () => {
    const { items, recipe } = fixture(true);
    const project = {
      format: "gathria-rig-authoring" as const,
      version: 1 as const,
      rig: createRigDefinition(),
      motions: createMotionLibrary(),
      skin: assembleWardrobe(recipe, "Source colors", items),
      wardrobe: recipe,
      wardrobeItems: items,
      preview: {
        animation: "run" as const,
        facing: "left" as const,
        expression: "gentle" as const,
      },
    };
    const restored = validateProject(structuredClone(project));
    expect(restored.wardrobeItems).toEqual(items);
    expect(restored.skin.metadata).toEqual(project.skin.metadata);
    const a = prepareRig(project.rig, project.skin, project.motions);
    const b = prepareRig(restored.rig, restored.skin, restored.motions);
    for (const action of ["idle", "walk", "run", "jump"] as const)
      for (let key = 0; key < project.motions.clips[action]!.keys.length; key++)
        expect(
          equal(a.frame(action, key, "gentle"), b.frame(action, key, "gentle")),
        ).toBe(true);
  });
});
