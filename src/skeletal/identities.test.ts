import { describe, expect, it } from "vitest";
import { strToU8, zipSync, zlibSync } from "fflate";
import { createMotionLibrary, createRigDefinition } from "./definition";
import { WARDROBE_ASSETS } from "./wardrobe-assets.generated";
import {
  decodeWardrobeItemPart,
  addWardrobeItem,
  createWardrobeItemTemplate,
} from "./wardrobe-items";
import {
  addWardrobeIdentity,
  createWardrobeIdentityTemplate,
  defaultCustomWardrobeRecipe,
  removeWardrobeIdentity,
  selectWardrobeIdentity,
  validateWardrobeIdentities,
  validateWardrobeIdentity,
} from "./identities";
import { importWardrobeIdentity } from "./identity-io";
import {
  applyWardrobe,
  assembleWardrobe,
  assertWardrobeSkinMatches,
  defaultWardrobeRecipe,
  validateWardrobeRecipe,
} from "./wardrobe";
import { importProject, validateProject } from "./skin-io";
import type { CustomWardrobeIdentity } from "./identity-types";
import type { AuthoringProject } from "./types";

const equal = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
function identity(): CustomWardrobeIdentity {
  return createWardrobeIdentityTemplate(defaultWardrobeRecipe());
}
function project(): AuthoringProject {
  const wardrobe = defaultWardrobeRecipe();
  return {
    format: "gathria-rig-authoring",
    version: 1,
    rig: createRigDefinition(),
    motions: createMotionLibrary(),
    skin: assembleWardrobe(wardrobe),
    wardrobe,
    preview: { animation: "run", facing: "left", expression: "joyful" },
  };
}
function mutatePixels(
  source: CustomWardrobeIdentity,
  edit: (pixels: Uint8Array) => void,
): CustomWardrobeIdentity {
  const copy = structuredClone(source),
    part = copy.parts[0],
    pixels = decodeWardrobeItemPart(part.data);
  edit(pixels);
  part.data = Buffer.from(zlibSync(pixels)).toString("base64");
  return copy;
}

describe("portable character identities", () => {
  it.each(["crop", "waves"] as const)(
    "exports a complete registered %s template without changing catalog sources",
    (name) => {
      const source = WARDROBE_ASSETS.identities.find(
          (entry) => entry.id === name,
        )!,
        copy = createWardrobeIdentityTemplate(defaultWardrobeRecipe(name));
      expect(copy.parts.map((part) => part.slot).sort()).toEqual(
        source.parts.map((part) => part.slot).sort(),
      );
      for (const part of copy.parts)
        expect(part.data).toBe(
          source.parts.find((p) => p.slot === part.slot)!.data,
        );
      expect(copy.parts).not.toBe(source.parts);
      expect(copy.neck).toEqual([96, 118]);
      expect(validateWardrobeIdentity(copy)).toEqual(copy);
    },
  );

  it("installs sources without changing flat pixels, then explicitly selects an independently retained identity", () => {
    const source = project();
    delete source.wardrobe;
    const custom = identity(),
      installed = addWardrobeIdentity(source, custom);
    expect(installed.skin).toBe(source.skin);
    expect(installed.wardrobe).toBeUndefined();
    const selected = selectWardrobeIdentity(installed, custom.id);
    expect(selected.wardrobe?.version).toBe(3);
    expect(selected.wardrobe?.identity).toBe(custom.id);
    expect(selected.preview).toEqual(source.preview);
    expect(selected.rig).toBe(source.rig);
    expect(selected.motions).toBe(source.motions);
    expect(() => removeWardrobeIdentity(selected, custom.id)).toThrow(
      /Choose another/,
    );
    const detached = { ...selected };
    delete detached.wardrobe;
    expect(validateProject(detached).wardrobeIdentities).toEqual(
      selected.wardrobeIdentities,
    );
    expect(
      removeWardrobeIdentity(detached, custom.id).wardrobeIdentities,
    ).toEqual([]);
  });

  it("preserves exact source identity pixels at source colors, while keeping all clothing unchanged", () => {
    const custom = identity(),
      recipe = defaultCustomWardrobeRecipe(custom),
      skin = assembleWardrobe(recipe, "test", [], [custom]),
      old = assembleWardrobe(
        {
          ...defaultWardrobeRecipe(),
          colors: {
            ...defaultWardrobeRecipe().colors,
            skin: recipe.colors.skin,
          },
        },
        "test",
      );
    for (const part of custom.parts) {
      const raw = decodeWardrobeItemPart(part.data),
        actual = skin.images[part.slot]!;
      for (let p = 0; p < raw.length / 5; p++)
        expect(
          Buffer.compare(
            Buffer.from(actual.subarray(p * 4, p * 4 + 4)),
            Buffer.from(raw.subarray(p * 5, p * 5 + 4)),
          ),
        ).toBe(0);
    }
    for (const slot of old.metadata.slots.filter(
      (slot) => !slot.startsWith("head-") && slot !== "back-hair",
    ))
      expect(equal(skin.images[slot]!, old.images[slot]!)).toBe(true);
    expect(skin.metadata.sourceAppearance.hairstyle).toBe(
      custom.sourceAppearance.hairstyle,
    );
  });

  it("recolors only authored skin/hair channels without touching fixed eyes or identity geometry", () => {
    const custom = identity(),
      recipe = defaultCustomWardrobeRecipe(custom),
      before = assembleWardrobe(recipe, "test", [], [custom]);
    const after = assembleWardrobe(
      {
        ...recipe,
        colors: { ...recipe.colors, hair: "#cab881", skin: "#87593f" },
      },
      "test",
      [],
      [custom],
    );
    let fixed = 0,
      changedHair = 0,
      changedSkin = 0;
    for (const part of custom.parts) {
      const raw = decodeWardrobeItemPart(part.data),
        a = before.images[part.slot]!,
        b = after.images[part.slot]!;
      for (let p = 0; p < raw.length / 5; p++) {
        expect(a[p * 4 + 3]).toBe(b[p * 4 + 3]);
        const same = equal(
          a.subarray(p * 4, p * 4 + 4),
          b.subarray(p * 4, p * 4 + 4),
        );
        if (!raw[p * 5 + 4]) {
          expect(same).toBe(true);
          fixed++;
        } else if (!same) {
          if (raw[p * 5 + 4] === 1) changedSkin++;
          else changedHair++;
        }
      }
    }
    expect(fixed).toBeGreaterThan(100);
    expect(changedSkin).toBeGreaterThan(100);
    expect(changedHair).toBeGreaterThan(100);
    expect(after.metadata.bindings).toEqual(before.metadata.bindings);
  });

  it("changes source-neighbor hair and skin colors continuously without a shading-model jump", () => {
    const custom = identity(),
      recipe = defaultCustomWardrobeRecipe(custom),
      source = assembleWardrobe(recipe, "test", [], [custom]);
    for (const material of ["skin", "hair"] as const) {
      const hex = recipe.colors[material],
        changed = `#${(parseInt(hex.slice(1), 16) + 1).toString(16).padStart(6, "0")}`;
      const neighbor = assembleWardrobe(
        { ...recipe, colors: { ...recipe.colors, [material]: changed } },
        "test",
        [],
        [custom],
      );
      let largest = 0,
        changedChannels = 0;
      for (const part of custom.parts) {
        const a = source.images[part.slot]!,
          b = neighbor.images[part.slot]!;
        for (let p = 0; p < a.length; p++) {
          const difference = Math.abs(a[p] - b[p]);
          largest = Math.max(largest, difference);
          changedChannels += +(difference > 0);
        }
      }
      expect(changedChannels).toBeGreaterThan(100);
      expect(largest).toBeLessThanOrEqual(2);
    }
  });

  it("combines a custom identity and a paired action-forearm top without changing the rig or heads", () => {
    const custom = identity(),
      selected = selectWardrobeIdentity(
        addWardrobeIdentity(project(), custom),
        custom.id,
      );
    const top = createWardrobeItemTemplate(
      selected.wardrobe!,
      "top",
      [],
      [custom],
    );
    if (top.group !== "top") throw Error("Expected top");
    const pair = {
      "near-forearm": "near-forearm-active",
      "far-forearm": "far-forearm-active",
    } as const;
    const parts = [
      ...top.parts,
      ...(["near", "far"] as const).map((side) => ({
        ...top.parts.find((part) => part.slot === `${side}-forearm`)!,
        slot: `${side}-forearm-active` as const,
      })),
    ];
    const dressed = addWardrobeItem(selected, {
      ...top,
      version: 2,
      actionForearms: { run: pair, jump: pair },
      parts,
    });
    expect(dressed.wardrobe?.version).toBe(3);
    expect(dressed.skin.metadata.version).toBe(2);
    expect(dressed.skin.metadata.actionForearms).toEqual({
      run: pair,
      jump: pair,
    });
    expect(dressed.rig).toBe(selected.rig);
    expect(dressed.motions).toBe(selected.motions);
    for (const part of custom.parts)
      expect(
        equal(
          selected.skin.images[part.slot]!,
          dressed.skin.images[part.slot]!,
        ),
      ).toBe(true);
    expect(validateProject(dressed).wardrobe?.identity).toBe(custom.id);
  });

  it("keeps all three custom heads invariant while swapping clothing, and persists used plus unused identities", () => {
    const custom = identity(),
      second = { ...identity(), id: "custom-second", name: "Second" };
    const selected = selectWardrobeIdentity(
      addWardrobeIdentity(addWardrobeIdentity(project(), custom), second),
      custom.id,
    );
    const dressed = applyWardrobe(selected, {
      ...selected.wardrobe!,
      top: "soft-top",
      bottom: "short-skirt",
      shoes: "flats",
    });
    for (const part of custom.parts)
      expect(
        equal(
          selected.skin.images[part.slot]!,
          dressed.skin.images[part.slot]!,
        ),
      ).toBe(true);
    expect(validateProject(dressed).wardrobeIdentities).toEqual([
      custom,
      second,
    ]);
    const item = createWardrobeItemTemplate(
      dressed.wardrobe!,
      "top",
      [],
      dressed.wardrobeIdentities,
    );
    const imported = addWardrobeItem(dressed, item);
    expect(imported.wardrobe?.version).toBe(3);
    expect(imported.wardrobe?.identity).toBe(custom.id);
    expect(validateProject(imported).wardrobe?.top).toBe(item.id);
  });

  it("keeps original V1/V2 builtin behavior and rejects implicit custom/hair upgrades", () => {
    const custom = identity(),
      old = project(),
      legacy = {
        ...defaultWardrobeRecipe(),
        colors: {
          skin: "#9a7654",
          top: "#112233",
          bottom: "#223344",
          shoes: "#334455",
        },
      };
    const colored = applyWardrobe(old, legacy),
      swapped = selectWardrobeIdentity(colored, "waves");
    expect(swapped.wardrobe?.version).toBe(1);
    expect(swapped.wardrobe?.colors).toEqual(legacy.colors);
    expect(() =>
      validateWardrobeRecipe({ ...legacy, identity: custom.id }, [], [custom]),
    ).toThrow(/identity/);
    expect(() =>
      validateWardrobeRecipe({
        ...legacy,
        colors: { ...legacy.colors, hair: "#223344" },
      }),
    ).toThrow(/exactly/);
    expect(() =>
      validateWardrobeRecipe(
        { ...defaultCustomWardrobeRecipe(custom), identity: "crop" },
        [],
        [custom],
      ),
    ).toThrow(/identity/);
    expect(() =>
      validateWardrobeRecipe(defaultCustomWardrobeRecipe(custom)),
    ).toThrow(/identity/);
    const selected = selectWardrobeIdentity(
        addWardrobeIdentity(old, custom),
        custom.id,
      ),
      restored = selectWardrobeIdentity(selected, "crop");
    expect(restored.wardrobe?.version).toBe(2);
    expect(restored.wardrobe?.colors).not.toHaveProperty("hair");
    expect(restored.wardrobeIdentities).toEqual([custom]);
  });

  it("rejects stale recipe pixels instead of silently rebuilding a changed head", () => {
    const custom = identity(),
      selected = selectWardrobeIdentity(
        addWardrobeIdentity(project(), custom),
        custom.id,
      ),
      damaged = structuredClone(selected.skin);
    const pixels = damaged.images["head-neutral"]!,
      index = pixels.findIndex((value, i) => i % 4 === 3 && value === 255) - 3;
    pixels[index] ^= 1;
    expect(() =>
      assertWardrobeSkinMatches(selected.wardrobe!, damaged, [], [custom]),
    ).toThrow(/pixels|edited|match/);
  });

  it("rejects missing/duplicate heads, non-identity ownership, unknown fields, palette drift and unregistered geometry", () => {
    const source = identity();
    const bad: unknown[] = [
      { ...source, extra: true },
      {
        ...source,
        sourceAppearance: { ...source.sourceAppearance, unknown: true },
      },
      { ...source, version: 2 },
      { ...source, id: "crop" },
      { ...source, neck: [96, 119] },
      { ...source, frame: { width: 256, height: 256 } },
      { ...source, jaw: { ...source.jaw, scale: NaN } },
      { ...source, parts: source.parts.slice(1) },
      { ...source, parts: [source.parts[0], source.parts[0], source.parts[2]] },
      {
        ...source,
        parts: [
          { ...source.parts[0], slot: "torso" },
          ...source.parts.slice(1),
        ],
      },
      { ...source, palette: { ...source.palette, skin: "#123456" } },
      {
        ...source,
        parts: [
          {
            ...source.parts[0],
            palette: { ...source.parts[0].palette, upper: "#123456" },
          },
          ...source.parts.slice(1),
        ],
      },
    ];
    for (const value of bad)
      expect(() => validateWardrobeIdentity(value)).toThrow();
  });

  it("rejects misplaced materials, nonbinary alpha, invisible hidden payload and clipped boundary pixels", () => {
    const source = identity();
    for (const edit of [
      (pixels: Uint8Array) => {
        const p = pixels.findIndex((v, i) => i % 5 === 3 && v === 255) - 3;
        pixels[p + 4] = 3;
      },
      (pixels: Uint8Array) => {
        const p = pixels.findIndex((v, i) => i % 5 === 3 && v === 255) - 3;
        pixels[p + 3] = 128;
      },
      (pixels: Uint8Array) => {
        pixels[0] = 1;
      },
      (pixels: Uint8Array) => {
        pixels[3] = 255;
      },
    ])
      expect(() =>
        validateWardrobeIdentity(mutatePixels(source, edit)),
      ).toThrow();
  });

  it("bounds libraries and prevents identity collisions without mutating existing projects", () => {
    const custom = identity(),
      installed = addWardrobeIdentity(project(), custom);
    expect(() => addWardrobeIdentity(installed, custom)).toThrow(
      /already exists/,
    );
    expect(() => validateWardrobeIdentities([custom, custom])).toThrow(
      /Duplicate/,
    );
    expect(() =>
      validateWardrobeIdentities(
        Array.from({ length: 5 }, (_, i) => ({ ...custom, id: `custom-${i}` })),
      ),
    ).toThrow(/four/);
    expect(installed.wardrobeIdentities).toHaveLength(1);
    expect(() =>
      validateWardrobeIdentity({
        ...custom,
        parts: [
          { ...custom.parts[0], data: "A".repeat(400004) },
          ...custom.parts.slice(1),
        ],
      }),
    ).toThrow(/bounded/);
  });

  it("rejects inline, ambiguous or unsupported project identity libraries before decoding any PNG", async () => {
    const source = project(),
      custom = identity();
    const { skin, ...metadata } = source;
    const baseFiles: Record<string, Uint8Array> = {
      "skin.json": strToU8(JSON.stringify(skin.metadata)),
      "project.json": strToU8(JSON.stringify(metadata)),
      ...Object.fromEntries(
        skin.metadata.slots.map((slot) => [
          `slots/${slot}.png`,
          new Uint8Array([1]),
        ]),
      ),
    };
    await expect(
      importProject(
        new Blob([
          zipSync({
            ...baseFiles,
            "project.json": strToU8(
              JSON.stringify({ ...metadata, wardrobeIdentities: [custom] }),
            ),
          }),
        ]),
      ),
    ).rejects.toThrow(/identities.json/);
    for (const library of [
      {
        format: "gathria-identity-library",
        version: 1,
        identities: [custom],
        extra: true,
      },
      { format: "gathria-identity-library", version: 2, identities: [custom] },
      {
        format: "gathria-identity-library",
        version: 1,
        identities: [custom, custom],
      },
      { format: "gathria-identity-library", version: 1 },
    ]) {
      await expect(
        importProject(
          new Blob([
            zipSync({
              ...baseFiles,
              "identities.json": strToU8(JSON.stringify(library)),
            }),
          ]),
        ),
      ).rejects.toThrow(/unsupported|version|Duplicate|four/);
    }
    const selected = selectWardrobeIdentity(
      addWardrobeIdentity(source, custom),
      custom.id,
    );
    delete selected.wardrobeIdentities;
    expect(() => validateProject(selected)).toThrow(/identity/);
  });

  it("rejects identity archive paths and missing PNG/mask pairs before browser decode", async () => {
    const metadata = identity(),
      parts = metadata.parts.map(({ data: _data, ...part }) => part);
    const files: Record<string, Uint8Array> = {
      "identity.json": strToU8(JSON.stringify({ ...metadata, parts })),
    };
    for (const part of parts) {
      files[`artwork/${part.slot}.png`] = new Uint8Array([1]);
      files[`masks/${part.slot}.png`] = new Uint8Array([1]);
    }
    await expect(
      importWardrobeIdentity(
        new Blob([
          zipSync({ ...files, "../outside.png": new Uint8Array([1]) }),
        ]),
      ),
    ).rejects.toThrow(/path|unsupported|unexpected/i);
    delete files["masks/head-neutral.png"];
    files["TEMPLATE.md"] = strToU8("template");
    await expect(
      importWardrobeIdentity(new Blob([zipSync(files)])),
    ).rejects.toThrow(/both artwork/);
  });
});
