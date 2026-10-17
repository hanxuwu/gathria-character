import type { WardrobeRecipe } from "./wardrobe-types";
import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate";
import { createAuthoringProject } from "./builtins";
import { prepareRig } from "./renderer";
import { validateProject } from "./skin-io";
import { ACTION_FOREARM_SLOTS, type Slot } from "./types";
import {
  applyWardrobe,
  assertWardrobeSkinMatches,
  defaultWardrobeRecipe,
} from "./wardrobe";
import {
  addWardrobeItem,
  createWardrobeItemTemplate,
  decodeWardrobeItemPart,
  validateWardrobeItem,
  validateWardrobeItems,
} from "./wardrobe-items";
import type { CustomWardrobeItemV2 } from "./wardrobe-types";

function activeTop(): CustomWardrobeItemV2 {
  const original = createWardrobeItemTemplate(defaultWardrobeRecipe(), "top");
  if (original.group !== "top") throw Error("Expected top template");
  const parts = structuredClone(original.parts);
  for (const side of ["near", "far"] as const) {
    const source = structuredClone(
      parts.find((part) => part.slot === `${side}-forearm`)!,
    );
    source.slot = `${side}-forearm-active`;
    const pixels = decodeWardrobeItemPart(source.data);
    // Deliberately distinct alternate art proves the renderer selects sources,
    // while retaining the same registration, coverage and material ownership.
    for (let p = 0; p < pixels.length; p += 5)
      if (pixels[p + 3]) pixels[p] = (pixels[p] + 37) % 256;
    source.data = Buffer.from(zlibSync(pixels)).toString("base64");
    parts.push(source);
  }
  const pair = {
    "near-forearm": "near-forearm-active",
    "far-forearm": "far-forearm-active",
  } as const;
  return {
    ...original,
    version: 2,
    id: "custom-action-top",
    parts,
    actionForearms: { run: { ...pair }, jump: { ...pair } },
  };
}

const project = () =>
  applyWardrobe(createAuthoringProject(), defaultWardrobeRecipe());
const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

describe("registered top action forearms", () => {
  it("keeps idle/walk and bone registration exact while enabling alternate run/jump sources", () => {
    const before = project(),
      item = activeTop(),
      after = addWardrobeItem(before, item);
    expect(after.skin.metadata.version).toBe(2);
    expect(after.skin.metadata.actionForearms).toEqual(item.actionForearms);
    expect(after.skin.metadata.bindings).toEqual(before.skin.metadata.bindings);
    expect(after.rig).toBe(before.rig);
    expect(after.motions).toBe(before.motions);
    for (const slot of before.skin.metadata.slots)
      expect(
        equal(after.skin.images[slot]!, before.skin.images[slot]!),
        slot,
      ).toBe(true);
    const oldRig = prepareRig(before.rig, before.skin, before.motions),
      newRig = prepareRig(after.rig, after.skin, after.motions);
    for (const action of ["idle", "walk", "run", "jump"] as const) {
      const clip = after.motions.clips[action]!;
      let changed = 0;
      for (let frame = 0; frame < clip.keys.length; frame++)
        changed += +!equal(
          oldRig.frame(action, frame, "gentle"),
          newRig.frame(action, frame, "gentle"),
        );
      if (action === "idle" || action === "walk") expect(changed).toBe(0);
      else expect(changed).toBe(clip.keys.length);
    }
  });

  it("clears active attachments on a normal top and restores them from the same library", () => {
    const installed = addWardrobeItem(project(), activeTop());
    const legacy = applyWardrobe(installed, {
      ...installed.wardrobe!,
      top: "denim-jacket",
    });
    expect(legacy.skin.metadata.version).toBe(1);
    expect(Object.hasOwn(legacy.skin.metadata, "actionForearms")).toBe(false);
    for (const slot of ACTION_FOREARM_SLOTS) {
      expect(legacy.skin.metadata.slots).not.toContain(slot);
      expect(Object.hasOwn(legacy.skin.images, slot)).toBe(false);
    }
    expect(legacy.wardrobeItems).toEqual(installed.wardrobeItems);
    const restored = applyWardrobe(legacy, installed.wardrobe!);
    expect(restored.skin.metadata).toEqual(installed.skin.metadata);
    for (const slot of installed.skin.metadata.slots)
      expect(
        equal(restored.skin.images[slot]!, installed.skin.images[slot]!),
      ).toBe(true);
    expect(validateProject(restored).wardrobeItems).toEqual(
      installed.wardrobeItems,
    );
  });

  it("recolors alternate skin and sleeve channels while leaving fixed details and original sources intact", () => {
    const item = activeTop(),
      installed = addWardrobeItem(project(), item),
      recolored = applyWardrobe(installed, {
        ...installed.wardrobe!,
        colors: {
          ...installed.wardrobe!.colors,
          skin: "#8d5135",
          top: "#759151",
        },
      } as WardrobeRecipe);
    const changes = new Map<number, number>();
    for (const slot of ACTION_FOREARM_SLOTS) {
      const raw = decodeWardrobeItemPart(
        item.parts.find((part) => part.slot === slot)!.data,
      );
      const oldPixels = installed.skin.images[slot]!,
        newPixels = recolored.skin.images[slot]!;
      for (let p = 0; p < raw.length / 5; p++) {
        expect(newPixels[p * 4 + 3]).toBe(oldPixels[p * 4 + 3]);
        const changed = !equal(
          oldPixels.subarray(p * 4, p * 4 + 4),
          newPixels.subarray(p * 4, p * 4 + 4),
        );
        if (changed) {
          const material = raw[p * 5 + 4];
          expect([1, 3]).toContain(material);
          changes.set(material, (changes.get(material) ?? 0) + 1);
        }
      }
    }
    expect(changes.get(1)).toBeGreaterThan(10);
    expect(changes.get(3)).toBeGreaterThan(10);
    expect(recolored.wardrobeItems).toEqual([validateWardrobeItem(item)]);
    expect(() =>
      assertWardrobeSkinMatches(
        recolored.wardrobe!,
        recolored.skin,
        recolored.wardrobeItems,
      ),
    ).not.toThrow();
  });

  it("retains alternate parts and maps through selected-item templates and JSON library reopen", () => {
    const source = activeTop(),
      installed = addWardrobeItem(project(), source);
    const copied = createWardrobeItemTemplate(
      installed.wardrobe!,
      "top",
      installed.wardrobeItems,
    );
    expect(copied).toEqual(validateWardrobeItem(source));
    expect(copied.parts).not.toBe(installed.wardrobeItems![0].parts);
    expect(
      validateWardrobeItems(
        JSON.parse(JSON.stringify(installed.wardrobeItems)),
      ),
    ).toEqual(installed.wardrobeItems);
    const original = createWardrobeItemTemplate(defaultWardrobeRecipe(), "top");
    expect(original.version).toBe(1);
    expect(Object.hasOwn(original, "actionForearms")).toBe(false);
    expect(original.parts).toHaveLength(5);
  });

  it("rejects incomplete pairs, unsupported actions, foreign parts and version ambiguity", () => {
    const check = (edit: (item: any) => void, error: RegExp) => {
      const item = activeTop();
      edit(item);
      expect(() => validateWardrobeItem(item)).toThrow(error);
    };
    check((item) => item.parts.pop(), /complete/);
    check((item) => (item.parts[6] = item.parts[5]), /duplicate|missing/);
    check((item) => (item.parts[6].slot = "head-neutral"), /own slot/);
    check((item) => (item.actionForearms = {}), /run|jump/);
    check(
      (item) => (item.actionForearms.walk = item.actionForearms.run),
      /only/,
    );
    check((item) => delete item.actionForearms.run["far-forearm"], /matching/);
    check(
      (item) =>
        (item.actionForearms.jump["near-forearm"] = "far-forearm-active"),
      /matching/,
    );
    check((item) => (item.version = 1), /exactly/);
    check((item) => {
      item.version = 1;
      delete item.actionForearms;
    }, /complete/);
    check((item) => delete item.actionForearms, /exactly/);
    for (const group of ["bottom", "shoes"] as const)
      expect(() =>
        validateWardrobeItem({
          ...createWardrobeItemTemplate(defaultWardrobeRecipe(), group),
          version: 2,
          actionForearms: activeTop().actionForearms,
        }),
      ).toThrow(/reserved for tops/);
    const mismatched = addWardrobeItem(project(), activeTop());
    delete mismatched.skin.images["near-forearm-active" as Slot];
    expect(() => validateProject(mismatched)).toThrow(/missing|image|slots/i);
  });
});
