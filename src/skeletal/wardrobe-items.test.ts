import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate";
import { createAuthoringProject } from "./builtins";
import { prepareRig } from "./renderer";
import {
  applyWardrobe,
  assembleWardrobe,
  assertWardrobeSkinMatches,
  defaultWardrobeRecipe,
  validateWardrobeRecipe,
} from "./wardrobe";
import {
  addWardrobeItem,
  createWardrobeItemTemplate,
  decodeWardrobeItemPart,
  removeWardrobeItem,
  MAX_WARDROBE_LIBRARY_BYTES,
  validateWardrobeItem,
  validateWardrobeItems,
  wardrobeOptions,
} from "./wardrobe-items";
import type {
  CustomWardrobeItem,
  WardrobeItemGroup,
  WardrobeRecipe,
} from "./wardrobe-types";

const bytes = (raw: Uint8Array) =>
  Buffer.from(zlibSync(raw)).toString("base64");
const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const project = () =>
  applyWardrobe(createAuthoringProject(), defaultWardrobeRecipe());
function mutatePart(item: CustomWardrobeItem, edit: (raw: Uint8Array) => void) {
  const changed = structuredClone(item),
    part = changed.parts[0],
    raw = decodeWardrobeItemPart(part.data);
  edit(raw);
  part.data = bytes(raw);
  return changed;
}
const visible = (raw: Uint8Array) =>
  raw.findIndex((value, i) => i % 5 === 3 && value === 255) - 3;

describe("portable registered wardrobe items", () => {
  it.each([
    ["crop", "top"],
    ["waves", "top"],
    ["crop", "bottom"],
    ["waves", "bottom"],
    ["crop", "shoes"],
    ["waves", "shoes"],
  ] as const)(
    "makes a valid editable %s/%s template without changing its source art",
    (identity, group) => {
      const recipe = defaultWardrobeRecipe(identity),
        before = assembleWardrobe(recipe);
      const item = createWardrobeItemTemplate(recipe, group);
      expect(validateWardrobeItem(item)).toEqual(item);
      const custom: WardrobeRecipe = {
        ...recipe,
        version: 2,
        [group]: item.id,
      };
      const assembled = assembleWardrobe(custom, "Template", [item]);
      expect(assembled.metadata.bindings).toEqual(before.metadata.bindings);
      for (const slot of before.metadata.slots)
        expect(equal(assembled.images[slot]!, before.images[slot]!), slot).toBe(
          true,
        );
      expect(item.id).toMatch(/^custom-/);
      expect(assembled.metadata.provenance).toContain(item.provenance);
    },
  );

  it("accepts locally edited art and swaps only its entire clothing group with four actions intact", () => {
    const original = project(),
      template = createWardrobeItemTemplate(original.wardrobe!, "top");
    const item = mutatePart(template, (raw) => {
      const at = visible(raw);
      raw[at] = 211;
      raw[at + 1] = 87;
      raw[at + 2] = 123;
      raw[at + 4] = 0;
    });
    item.id = "custom-travel-shirt";
    item.provenance = "Test-owned patch on the documented source template.";
    const result = addWardrobeItem(original, item);
    expect(original.wardrobe!.version).toBe(1);
    expect(original.wardrobeItems).toBeUndefined();
    expect(result.wardrobe).toMatchObject({ version: 2, top: item.id });
    expect(result.skin.metadata.provenance).toContain(item.provenance);
    expect(result.rig).toBe(original.rig);
    expect(result.motions).toBe(original.motions);
    expect(result.preview).toBe(original.preview);
    for (const slot of original.skin.metadata.slots)
      if (slot !== "torso")
        expect(
          equal(result.skin.images[slot]!, original.skin.images[slot]!),
          slot,
        ).toBe(true);
    expect(equal(result.skin.images.torso!, original.skin.images.torso!)).toBe(
      false,
    );
    const renderer = prepareRig(result.rig, result.skin, result.motions);
    for (const action of ["idle", "walk", "run", "jump"] as const) {
      const pixels = renderer.frame(action, 0, "gentle");
      expect(pixels.some((value, i) => i % 4 === 3 && value === 255)).toBe(
        true,
      );
    }
    expect(() =>
      assertWardrobeSkinMatches(
        result.wardrobe!,
        result.skin,
        result.wardrobeItems,
      ),
    ).not.toThrow();
  });

  it("keeps fixed details intact while recoloring authored imported channels", () => {
    const source = project(),
      template = createWardrobeItemTemplate(source.wardrobe!, "top");
    const item = mutatePart(template, (raw) => {
      const at = visible(raw);
      raw[at] = 13;
      raw[at + 1] = 177;
      raw[at + 2] = 209;
      raw[at + 4] = 0;
    });
    const installed = addWardrobeItem(source, item);
    const recolored = applyWardrobe(installed, {
      ...installed.wardrobe!,
      colors: { ...installed.wardrobe!.colors, top: "#bc713e" },
    } as WardrobeRecipe);
    let changed = 0,
      fixed = 0;
    const raw = decodeWardrobeItemPart(item.parts[0].data);
    for (let p = 0; p < raw.length / 5; p++) {
      if (!raw[p * 5 + 3]) continue;
      const a = installed.skin.images.torso!.subarray(p * 4, p * 4 + 4),
        b = recolored.skin.images.torso!.subarray(p * 4, p * 4 + 4);
      if (raw[p * 5 + 4] === 0) {
        expect(equal(a, b)).toBe(true);
        fixed++;
      }
      if (!equal(a, b)) {
        expect(raw[p * 5 + 4]).toBe(3);
        changed++;
      }
    }
    expect(fixed).toBeGreaterThan(1);
    expect(changed).toBeGreaterThan(100);
  });

  it("does not resolve custom IDs through recipe version 1 or another group", () => {
    const recipe = defaultWardrobeRecipe(),
      item = createWardrobeItemTemplate(recipe, "top");
    expect(() =>
      validateWardrobeRecipe({ ...recipe, top: item.id }, [item]),
    ).toThrow(/top/);
    expect(() =>
      validateWardrobeRecipe({ ...recipe, version: 2, top: item.id }),
    ).toThrow(/top/);
    expect(() =>
      validateWardrobeRecipe({ ...recipe, version: 2, bottom: item.id }, [
        item,
      ]),
    ).toThrow(/bottom/);
    expect(() =>
      validateWardrobeRecipe({ ...recipe, version: 4 }, [item]),
    ).toThrow(/version/);
    expect(
      validateWardrobeRecipe({ ...recipe, version: 2 }, [item]).version,
    ).toBe(2);
  });

  it("replaces optional skirt ownership and all registration together", () => {
    const original = applyWardrobe(
      createAuthoringProject(),
      defaultWardrobeRecipe("waves"),
    );
    const item = createWardrobeItemTemplate(defaultWardrobeRecipe(), "bottom");
    const next = addWardrobeItem(original, item);
    expect(next.skin.images.garment).toBeUndefined();
    expect(next.skin.metadata.slots).not.toContain("garment");
    if (item.group !== "bottom") throw Error("Expected bottom");
    expect(next.skin.metadata.bindings.chains.nearLeg).toEqual(
      item.chains.nearLeg,
    );
    expect(
      equal(
        next.skin.images["head-neutral"]!,
        original.skin.images["head-neutral"]!,
      ),
    ).toBe(true);
  });

  it("keeps libraries isolated, exposes selected imports and removes only unselected items", () => {
    const source = project(),
      item = createWardrobeItemTemplate(source.wardrobe!, "top");
    const installed = addWardrobeItem(source, item);
    item.name = "Changed outside project";
    expect(installed.wardrobeItems![0].name).not.toBe(item.name);
    expect(
      wardrobeOptions(installed.wardrobeItems).tops.some(
        (choice) => choice.id === item.id,
      ),
    ).toBe(true);
    expect(wardrobeOptions().tops.some((choice) => choice.id === item.id)).toBe(
      false,
    );
    expect(() => addWardrobeItem(installed, item)).toThrow(/already exists/);
    expect(() => removeWardrobeItem(installed, item.id)).toThrow(
      /different item/,
    );
    const unselected = applyWardrobe(installed, {
      ...installed.wardrobe!,
      top: "soft-top",
    });
    const removed = removeWardrobeItem(unselected, item.id);
    expect(removed.wardrobeItems).toEqual([]);
    expect(removed.skin).toBe(unselected.skin);
    expect(() => removeWardrobeItem(removed, item.id)).toThrow(/not in/);
  });

  it("rejects incompatible shoe registration atomically", () => {
    const source = project(),
      item = createWardrobeItemTemplate(source.wardrobe!, "shoes");
    if (item.group !== "shoes") throw Error("Expected shoes");
    item.ankles.near = [73, 100];
    expect(() => addWardrobeItem(source, item)).toThrow(/shoe fit/i);
    expect(source.wardrobeItems).toBeUndefined();
    expect(source.wardrobe!.version).toBe(1);
  });

  it.each([
    [
      "foreign material",
      (raw: Uint8Array) => {
        raw[visible(raw) + 4] = 4;
      },
      /belong/,
    ],
    [
      "partial alpha",
      (raw: Uint8Array) => {
        raw[visible(raw) + 3] = 100;
      },
      /alpha/,
    ],
    [
      "hidden fragment",
      (raw: Uint8Array) => {
        raw[0] = 17;
      },
      /Transparent/,
    ],
    [
      "clipped source",
      (raw: Uint8Array) => {
        raw[3] = 255;
      },
      /edge/,
    ],
  ] as const)(
    "rejects %s instead of guessing material ownership",
    (_, edit, expected) => {
      const item = createWardrobeItemTemplate(defaultWardrobeRecipe(), "top");
      expect(() => validateWardrobeItem(mutatePart(item, edit))).toThrow(
        expected,
      );
    },
  );

  it("rejects missing/duplicate parts, invalid registration, palette ambiguity and future formats", () => {
    const template = createWardrobeItemTemplate(defaultWardrobeRecipe(), "top");
    const check = (edit: (item: any) => void, error: RegExp) => {
      const item = structuredClone(template);
      edit(item);
      expect(() => validateWardrobeItem(item)).toThrow(error);
    };
    check((item) => item.parts.pop(), /complete/);
    check((item) => (item.parts[1] = item.parts[0]), /duplicate/);
    check((item) => (item.parts[0].slot = "head-neutral"), /own slot/);
    check((item) => (item.parts[0].palette.upper = "#000000"), /palette/);
    check((item) => delete item.parts[0].palette.upper, /missing/);
    check((item) => (item.parts[0].palette.something = "#445566"), /palette/);
    check((item) => (item.chains.nearArm[1] = [NaN, 200]), /integer/);
    check((item) => (item.chains.nearArm[1] = [0, 200]), /integer/);
    check(
      (item) => (item.chains.nearArm[1] = item.chains.nearArm[0]),
      /segment/,
    );
    check((item) => (item.version = 3), /colorModel/);
    check((item) => (item.version = 4), /colorModel/);
    check((item) => (item.version = 5), /colorModel/);
    check((item) => (item.version = 6), /Unsupported/);
    check((item) => (item.id = "denim-jacket"), /custom-/);
    check((item) => (item.externalUrl = "https://example.invalid"), /exactly/);
  });

  it("bounds decompression and checks packed-source integrity", () => {
    expect(() =>
      decodeWardrobeItemPart(bytes(new Uint8Array(192 * 256 * 5 + 1))),
    ).toThrow(/within/);
    expect(() => decodeWardrobeItemPart(bytes(new Uint8Array(20)))).toThrow(
      /exactly/,
    );
    const item = createWardrobeItemTemplate(defaultWardrobeRecipe(), "top");
    const broken = Buffer.from(item.parts[0].data, "base64");
    broken[broken.length - 1] ^= 1;
    expect(() => decodeWardrobeItemPart(broken.toString("base64"))).toThrow(
      /checksum/,
    );
    expect(() => decodeWardrobeItemPart("A".repeat(400001))).toThrow(/bounded/);
  });

  it("limits embedded libraries and keeps long item IDs within the existing skin contract", () => {
    const template = createWardrobeItemTemplate(defaultWardrobeRecipe(), "top");
    expect(() => validateWardrobeItems([template, template])).toThrow(
      /Duplicate/,
    );
    expect(() =>
      validateWardrobeItems(
        Array.from({ length: 9 }, (_, i) => ({
          ...template,
          id: `custom-${i}`,
        })),
      ),
    ).toThrow(/eight/);
    const oversized = Array.from({ length: 8 }, (_, index) => ({
      ...structuredClone(template),
      id: `custom-textured-${index}`,
      parts: template.parts.map((part) => ({
        ...part,
        data: "A".repeat(110000),
      })),
    }));
    expect(JSON.stringify(oversized).length).toBeGreaterThan(
      MAX_WARDROBE_LIBRARY_BYTES,
    );
    expect(() => validateWardrobeItems(oversized)).toThrow(/4 MiB/);
    let current = project();
    for (const group of ["top", "bottom", "shoes"] as WardrobeItemGroup[]) {
      const item = createWardrobeItemTemplate(
        current.wardrobe!,
        group,
        current.wardrobeItems,
      );
      item.id = `custom-${group}-`.padEnd(32, "x");
      current = addWardrobeItem(current, item) as typeof current;
    }
    expect(current.skin.metadata.id.length).toBeLessThanOrEqual(80);
    expect(
      assembleWardrobe(
        current.wardrobe!,
        current.skin.metadata.name,
        current.wardrobeItems,
      ).metadata.id,
    ).toBe(current.skin.metadata.id);
  });
});
