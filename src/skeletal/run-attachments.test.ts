import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync, zlibSync } from "fflate";
import { describe, expect, it } from "vitest";
import { bakeProject } from "./bake";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import {
  createMotionLibrary,
  createMotionLibraryV2,
  createRigDefinition,
} from "./definition";
import { prepareRig } from "./renderer";
import {
  preferBentLeg,
  validateRunLegs,
  validateRunShoes,
} from "./run-attachments";
import {
  importSkinPack,
  validateProject,
  validateSkin,
  validateSkinMetadata,
} from "./skin-io";
import { importWardrobeItem } from "./wardrobe-item-io";
import {
  addWardrobeItem,
  createWardrobeItemTemplate,
  decodeWardrobeItemPart,
  validateWardrobeItem,
  validateWardrobeItems,
} from "./wardrobe-items";
import {
  applyWardrobe,
  assembleWardrobe,
  defaultWardrobeRecipe,
} from "./wardrobe";
import {
  RUN_LEG_SLOTS,
  RUN_SHOE_SLOTS,
  type JointTriple,
  type Point,
  type RunLegs,
  type RunShoes,
  type SkinPack,
} from "./types";
import type {
  CustomWardrobeItemV4,
  EncodedWardrobePart,
} from "./wardrobe-types";

const hash = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");
const legMap = (): RunLegs => ({
  nearLeg: {
    slot: "near-leg-bent",
    joints: [
      [76, 176],
      [99, 186],
      [84, 207],
    ],
  },
  farLeg: {
    slot: "far-leg-bent",
    joints: [
      [103, 176],
      [122, 187],
      [105, 206],
    ],
  },
});
const shoeMap = (): RunShoes => ({
  nearLeg: { slot: "near-shoe-run", ankle: [45, 210] },
  farLeg: { slot: "far-shoe-run", ankle: [140, 210] },
});
function variantSkin(legs = true, shoes = false): SkinPack {
  const skin = createBuiltinSkin("denim-daytrip");
  const runLegs = legMap(),
    runShoes = shoeMap();
  skin.metadata = {
    ...skin.metadata,
    version: 3,
    slots: [
      ...skin.metadata.slots,
      ...(legs ? RUN_LEG_SLOTS : []),
      ...(shoes ? RUN_SHOE_SLOTS : []),
    ],
    ...(legs ? { runLegs } : {}),
    ...(shoes ? { runShoes } : {}),
  } as SkinPack["metadata"];
  for (const side of ["near", "far"] as const) {
    if (legs) {
      const pixels = new Uint8ClampedArray(192 * 256 * 4);
      for (const part of ["thigh", "shin"] as const) {
        const source = skin.images[`${side}-${part}`]!;
        for (let p = 0; p < pixels.length; p += 4)
          if (source[p + 3]) pixels.set([188, 30, 201, 255], p);
      }
      skin.images[`${side}-leg-bent`] = pixels;
    }
    if (shoes) {
      const pixels = new Uint8ClampedArray(192 * 256 * 4);
      const [ax, ay] = runShoes[`${side}Leg`].ankle;
      for (let y = ay - 3; y <= ay + 14; y++)
        for (let x = ax - 5; x <= ax + 18; x++)
          pixels.set(
            side === "near" ? [20, 70, 140, 255] : [60, 80, 90, 255],
            (y * 192 + x) * 4,
          );
      if (side === "near")
        for (let y = ay - 2; y <= ay + 2; y++)
          for (let x = ax - 2; x <= ax + 2; x++)
            pixels.set([230, 10, 20, 255], (y * 192 + x) * 4);
      skin.images[`${side}-shoe-run`] = pixels;
    }
  }
  return skin;
}
function runItem(group: "bottom" | "shoes"): CustomWardrobeItemV4 {
  const original = createWardrobeItemTemplate(defaultWardrobeRecipe(), group);
  const parts = structuredClone(original.parts);
  for (const side of ["near", "far"] as const) {
    const sources = group === "bottom" ? ["thigh", "shin"] : ["shoe"];
    const sourceParts = sources.map(
      (name) => parts.find((p) => p.slot === `${side}-${name}`)!,
    );
    const pixels = new Uint8Array(192 * 256 * 5);
    for (const source of sourceParts) {
      const raw = decodeWardrobeItemPart(source.data);
      for (let p = 0; p < raw.length; p += 5)
        if (raw[p + 3]) pixels.set(raw.subarray(p, p + 5), p);
    }
    parts.push({
      ...sourceParts[0],
      slot: `${side}-${group === "bottom" ? "leg-bent" : "shoe-run"}`,
      data: Buffer.from(zlibSync(pixels)).toString("base64"),
    } as EncodedWardrobePart);
  }
  const common = {
    ...original,
    id: `custom-run-${group}`,
    version: 4 as const,
    colorModel: "source-relative-v1" as const,
    parts,
  };
  if (original.group === "bottom")
    return {
      ...common,
      group: "bottom",
      chains: original.chains,
      runLegs: legMap(),
    };
  if (original.group !== "shoes") throw Error("Unexpected fixture item group");
  return {
    ...common,
    group: "shoes",
    ankles: original.ankles,
    runShoes: {
      nearLeg: { slot: "near-shoe-run", ankle: original.ankles.near },
      farLeg: { slot: "far-shoe-run", ankle: original.ankles.far },
    },
  };
}
function installedProject() {
  const base = applyWardrobe(createAuthoringProject(), defaultWardrobeRecipe());
  return addWardrobeItem(
    addWardrobeItem(base, runItem("bottom")),
    runItem("shoes"),
  );
}

// These are synthetic source alternatives, not assertions of visual quality.
// Browser evidence checks real prepared artwork and archive PNG roundtrips.
describe("explicit run pose attachment contracts", () => {
  it("keeps source registrations detached and accepts independently optional paired extensions", () => {
    for (const [legs, shoes] of [
      [true, false],
      [false, true],
      [true, true],
    ]) {
      const source = variantSkin(legs, shoes),
        checked = validateSkin(source);
      expect(checked.metadata).toEqual(source.metadata);
      expect(
        validateSkinMetadata(JSON.parse(JSON.stringify(source.metadata))),
      ).toEqual(source.metadata);
      if (legs) {
        expect(checked.metadata.runLegs).not.toBe(source.metadata.runLegs);
        expect(checked.metadata.runLegs!.nearLeg.joints).not.toBe(
          source.metadata.runLegs!.nearLeg.joints,
        );
        expect(checked.images["near-leg-bent"]).not.toBe(
          source.images["near-leg-bent"],
        );
      }
      if (shoes)
        expect(checked.metadata.runShoes!.nearLeg.ankle).not.toBe(
          source.metadata.runShoes!.nearLeg.ankle,
        );
    }
  });

  it("retains existing active forearms when a skin also declares run shoes", () => {
    const source = variantSkin(false, true);
    const pair = {
      "near-forearm": "near-forearm-active",
      "far-forearm": "far-forearm-active",
    } as const;
    source.metadata.actionForearms = { run: pair, jump: pair };
    for (const side of ["near", "far"] as const) {
      const slot = `${side}-forearm-active` as const;
      source.metadata.slots.push(slot);
      const pixels = new Uint8ClampedArray(source.images[`${side}-forearm`]!);
      for (let p = 0; p < pixels.length; p += 4)
        if (pixels[p + 3]) pixels.set([190, 44, 203, 255], p);
      source.images[slot] = pixels;
    }
    const checked = validateSkin(source);
    const {
      runShoes: _runShoes,
      runLegs: _runLegs,
      ...metadata
    } = checked.metadata;
    const original = structuredClone(checked);
    original.metadata = {
      ...metadata,
      version: 2,
      actionForearms: { run: pair, jump: pair },
      slots: metadata.slots.filter(
        (slot) => !(RUN_SHOE_SLOTS as readonly string[]).includes(slot),
      ),
    };
    for (const slot of RUN_SHOE_SLOTS) delete original.images[slot];
    const motions = createMotionLibrary();
    const before = prepareRig(
      createRigDefinition(),
      validateSkin(original),
      motions,
    );
    const after = prepareRig(createRigDefinition(), checked, motions);
    for (const action of ["idle", "walk", "run", "jump"] as const)
      for (let frame = 0; frame < motions.clips[action]!.keys.length; frame++) {
        const a = before.frame(action, frame),
          b = after.frame(action, frame);
        for (const id of ["nearArm", "farArm"]) {
          const oldArm = before
            .inspect(action, frame)
            .limbs.find((l) => l.id === id)!;
          const newArm = after
            .inspect(action, frame)
            .limbs.find((l) => l.id === id)!;
          expect(newArm.bones).toEqual(oldArm.bones);
          expect(newArm.sourceSlots).toEqual(oldArm.sourceSlots);
        }
        // Run footwear may move leg IK. The upper crop excludes the hip texture at y169; all other
        // actions must retain the existing active-forearm rendering contract.
        expect(
          hash(action === "run" ? b.slice(0, 192 * 160 * 4) : b),
          `${action} frame ${frame}`,
        ).toBe(hash(action === "run" ? a.slice(0, 192 * 160 * 4) : a));
      }
  });

  it("rejects partial pairs, foreign slots, invalid registrations, and undeclared fields", () => {
    for (const validate of [validateRunLegs, validateRunShoes]) {
      for (const value of [
        undefined,
        {},
        [],
        { nearLeg: {} },
        { nearLeg: {}, farLeg: {}, run: {} },
      ])
        expect(() => validate(value)).toThrow();
    }
    for (const value of [NaN, Infinity, -1, 0, 192, 1.5]) {
      const legs = legMap();
      legs.nearLeg.joints = [
        [value, 176],
        legs.nearLeg.joints[1],
        legs.nearLeg.joints[2],
      ];
      expect(() => validateRunLegs(legs)).toThrow();
      const shoes = shoeMap();
      shoes.nearLeg.ankle = [value, 210];
      expect(() => validateRunShoes(shoes)).toThrow();
    }
    const zero = legMap();
    zero.nearLeg.joints = [
      zero.nearLeg.joints[0],
      zero.nearLeg.joints[0],
      zero.nearLeg.joints[2],
    ];
    expect(() => validateRunLegs(zero)).toThrow();
    expect(() =>
      validateRunLegs({
        ...legMap(),
        nearLeg: { slot: "far-leg-bent", joints: legMap().nearLeg.joints },
      }),
    ).toThrow();
    expect(() =>
      validateRunShoes({
        ...shoeMap(),
        farLeg: { slot: "near-shoe-run", ankle: [140, 210] },
      }),
    ).toThrow();
    const source = variantSkin(true, true);
    for (const version of [1, 2, 4])
      expect(() =>
        validateSkinMetadata({ ...source.metadata, version }),
      ).toThrow();
    const { runLegs: _legs, runShoes: _shoes, ...noMap } = source.metadata;
    expect(() =>
      validateSkinMetadata({
        ...noMap,
        slots: createBuiltinSkin("denim-daytrip").metadata.slots,
      }),
    ).toThrow();
    const missing = structuredClone(source);
    delete missing.images["far-leg-bent"];
    expect(() => validateSkin(missing)).toThrow();
    const blank = structuredClone(source);
    blank.images["near-shoe-run"]!.fill(0);
    expect(() => validateSkin(blank)).toThrow();
    expect(() =>
      validateSkinMetadata({
        ...source.metadata,
        slots: source.metadata.slots.filter((s) => s !== "far-shoe-run"),
      }),
    ).toThrow();
  });

  it("checks exact alternative archive ownership before decoding PNG data", async () => {
    const skin = variantSkin(true, true);
    const files: Record<string, Uint8Array> = {
      "skin.json": strToU8(JSON.stringify(skin.metadata)),
      ...Object.fromEntries(
        skin.metadata.slots.map((slot) => [
          `slots/${slot}.png`,
          new Uint8Array([1, 2, 3]),
        ]),
      ),
    };
    delete files["slots/far-leg-bent.png"];
    await expect(importSkinPack(new Blob([zipSync(files)]))).rejects.toThrow(
      /exactly match/,
    );
    const item = runItem("shoes");
    const entries: Record<string, Uint8Array> = {
      "item.json": strToU8(
        JSON.stringify({
          ...item,
          parts: item.parts.map(({ data: _data, ...p }) => p),
        }),
      ),
      ...Object.fromEntries(
        item.parts.flatMap(({ slot }) => [
          [`artwork/${slot}.png`, new Uint8Array([1])],
          [`masks/${slot}.png`, new Uint8Array([1])],
        ]),
      ),
    };
    delete entries["masks/far-shoe-run.png"];
    await expect(
      importWardrobeItem(new Blob([zipSync(entries)])),
    ).rejects.toThrow(/both artwork and mask/);
  });
});

describe("run source selection and anatomical attachment", () => {
  it("selects by signed bend geometry, remains invariant under placement, and favors base on ties", () => {
    const base: JointTriple = [
      [50, 170],
      [50, 190],
      [50, 210],
    ];
    const bent: JointTriple = [
      [50, 170],
      [70, 170],
      [70, 190],
    ];
    const opposite: JointTriple = [
      [50, 170],
      [70, 170],
      [70, 150],
    ];
    const halfway: JointTriple = [
      [50, 170],
      [70, 170],
      [90, 190],
    ];
    expect(preferBentLeg(base, bent, base)).toBe(false);
    expect(preferBentLeg(base, bent, bent)).toBe(true);
    expect(preferBentLeg(base, bent, opposite)).toBe(false);
    expect(preferBentLeg(base, bent, halfway)).toBe(false);
    const moved = bent.map(([x, y]) => [
      -2 * y + 500,
      2 * x + 40,
    ]) as unknown as JointTriple;
    expect(preferBentLeg(base, bent, moved)).toBe(true);
  });

  it("changes cloth sources without changing solved anatomy or any non-run frame", () => {
    const original = createBuiltinSkin("denim-daytrip"),
      source = variantSkin();
    const motions = createMotionLibraryV2(),
      definition = createRigDefinition();
    const base = prepareRig(definition, original, motions),
      next = prepareRig(definition, source, motions);
    const selected = new Set<string>();
    let runChanges = 0;
    for (const action of ["idle", "walk", "run", "jump"] as const)
      for (let frame = 0; frame < motions.clips[action]!.keys.length; frame++) {
        const prior = base.inspect(action, frame),
          actual = next.inspect(action, frame);
        expect(actual.limbs.map((l) => l.bones)).toEqual(
          prior.limbs.map((l) => l.bones),
        );
        const pixels = next.frame(action, frame);
        if (action === "run") {
          for (const limb of actual.limbs.filter((l) => l.id.endsWith("Leg")))
            selected.add(limb.variant!);
          runChanges += +(hash(pixels) !== hash(base.frame(action, frame)));
        } else expect(hash(pixels)).toBe(hash(base.frame(action, frame)));
        expect(hash(next.frame(action, frame))).toBe(hash(pixels));
      }
    expect(selected.has("bent")).toBe(true);
    expect(runChanges).toBeGreaterThan(0);
    // Re-index exactly the same poses; selection must follow solved geometry,
    // never a special "pose 9" or an identity-specific source branch.
    const shifted = structuredClone(motions);
    shifted.clips.run.keys = [
      ...motions.clips.run.keys.slice(3),
      ...motions.clips.run.keys.slice(0, 3),
    ];
    const renamed = structuredClone(source);
    renamed.metadata.id = "unrelated-imported-character";
    const reordered = prepareRig(definition, renamed, shifted);
    for (let frame = 0; frame < 12; frame++) {
      const a = next.inspect("run", (frame + 3) % 12).limbs,
        b = reordered.inspect("run", frame).limbs;
      expect(
        b.map((l) => ({
          bones: l.bones,
          variant: l.variant,
          sourceSlots: l.sourceSlots,
        })),
      ).toEqual(
        a.map((l) => ({
          bones: l.bones,
          variant: l.variant,
          sourceSlots: l.sourceSlots,
        })),
      );
    }
  });

  it.each([1, 2] as const)(
    "keeps run shoe support and the shin ankle connected in motion V%s",
    (version) => {
      const source = variantSkin(false, true);
      for (const slot of createBuiltinSkin("denim-daytrip").metadata.slots) {
        const pixels = source.images[slot]!;
        for (let p = 0; p < pixels.length; p += 4)
          if (pixels[p + 3]) pixels.set([100, 100, 100, 255], p);
      }
      for (const pitch of [-0.4, 0, 0.45])
        for (const lift of [0, 7]) {
          const motions =
            version === 1 ? createMotionLibrary() : createMotionLibraryV2();
          Object.assign(motions.clips.run.keys[0], {
            footX: 24,
            footLift: lift,
            shoePitch: pitch,
            lean: 0,
          });
          Object.assign(motions.clips.run.keys[6], {
            footX: -35,
            footLift: 30,
          });
          const rig = prepareRig(createRigDefinition(), source, motions),
            pixels = rig.frame("run", 0);
          const ankle = rig
            .inspect("run", 0)
            .limbs.find((l) => l.id === "nearLeg")!.bones[2];
          const sole: Point[] = [],
            markers: Point[] = [];
          for (let p = 0; p < pixels.length / 4; p++) {
            if (!pixels[p * 4 + 3]) continue;
            if (pixels[p * 4] === 20 || pixels[p * 4] === 230)
              sole.push([p % 192, Math.floor(p / 192)]);
            if (pixels[p * 4] === 230)
              markers.push([p % 192, Math.floor(p / 192)]);
          }
          expect(Math.max(...sole.map((p) => p[1]))).toBe(239 - lift);
          expect(
            Math.min(
              ...markers.map((p) =>
                Math.hypot(p[0] - ankle[0], p[1] - ankle[1]),
              ),
            ),
          ).toBeLessThan(1);
        }
    },
  );
});

describe("portable run wardrobe ownership and old project compatibility", () => {
  it("roundtrips V4 source registrations and selected project libraries without upgrading motions", () => {
    const project = installedProject();
    expect(project.skin.metadata.version).toBe(3);
    expect(project.motions.version).toBe(1);
    const checked = validateProject(project);
    expect(checked.skin.metadata).toEqual(project.skin.metadata);
    expect(checked.wardrobeItems).toEqual(project.wardrobeItems);
    expect(
      validateWardrobeItems(JSON.parse(JSON.stringify(project.wardrobeItems))),
    ).toEqual(project.wardrobeItems);
    for (const group of ["bottom", "shoes"] as const) {
      const selected = createWardrobeItemTemplate(
        project.wardrobe!,
        group,
        project.wardrobeItems,
      );
      expect(selected).toEqual(validateWardrobeItem(runItem(group)));
      expect(selected.parts).not.toBe(
        project.wardrobeItems!.find((i) => i.group === group)!.parts,
      );
    }
    const before = prepareRig(project.rig, project.skin, project.motions),
      after = prepareRig(checked.rig, checked.skin, checked.motions);
    for (const action of ["idle", "walk", "run", "jump"] as const)
      for (let f = 0; f < project.motions.clips[action]!.keys.length; f++)
        expect(hash(after.frame(action, f))).toBe(
          hash(before.frame(action, f)),
        );
  });

  it("clears only the changed wardrobe group's alternatives and restores them from the embedded library", () => {
    const installed = installedProject();
    for (const [group, ordinary, removed, retained] of [
      ["bottom", "trousers", "runLegs", "runShoes"],
      ["shoes", "boots", "runShoes", "runLegs"],
    ] as const) {
      const changed = applyWardrobe(installed, {
        ...installed.wardrobe!,
        [group]: ordinary,
      });
      expect(changed.skin.metadata.version).toBe(3);
      expect(changed.skin.metadata[removed]).toBeUndefined();
      expect(changed.skin.metadata[retained]).toEqual(
        installed.skin.metadata[retained],
      );
      const omitted = group === "bottom" ? RUN_LEG_SLOTS : RUN_SHOE_SLOTS;
      for (const slot of omitted) {
        expect(changed.skin.metadata.slots).not.toContain(slot);
        expect(changed.skin.images[slot]).toBeUndefined();
      }
      const restored = applyWardrobe(changed, installed.wardrobe!);
      expect(restored.skin.metadata).toEqual(installed.skin.metadata);
      for (const slot of restored.skin.metadata.slots)
        expect(hash(restored.skin.images[slot]!)).toBe(
          hash(installed.skin.images[slot]!),
        );
    }
    const plain = applyWardrobe(installed, {
      ...installed.wardrobe!,
      bottom: "trousers",
      shoes: "boots",
    });
    expect(plain.skin.metadata.version).toBe(1);
  });

  it("rejects cross-group ownership, missing pairs, ambiguous versions and non-source color models", () => {
    const bottom = runItem("bottom"),
      shoes = runItem("shoes");
    for (const invalid of [
      { ...bottom, version: 3 },
      { ...shoes, version: 1 },
      { ...bottom, colorModel: "legacy" },
      { ...bottom, runLegs: undefined },
      { ...bottom, runShoes: shoeMap() },
      { ...shoes, runLegs: legMap() },
      { ...bottom, parts: bottom.parts.slice(0, -1) },
      { ...bottom, parts: [...bottom.parts.slice(0, -1), shoes.parts.at(-1)!] },
      {
        ...createWardrobeItemTemplate(defaultWardrobeRecipe(), "top"),
        version: 4,
        colorModel: "source-relative-v1",
        runLegs: legMap(),
      },
    ])
      expect(() => validateWardrobeItem(invalid)).toThrow();
  });

  it("preserves alternate source pixels at authored colors and recolors only their owned materials", () => {
    const project = installedProject();
    const bottom = project.wardrobeItems!.find((i) => i.group === "bottom")!,
      shoes = project.wardrobeItems!.find((i) => i.group === "shoes")!;
    const recipe = structuredClone(project.wardrobe!);
    recipe.colors.bottom = bottom.parts[0].palette.lower!;
    recipe.colors.shoes = shoes.parts[0].palette.shoe!;
    const original = applyWardrobe(project, recipe);
    const recolored = structuredClone(recipe);
    recolored.colors.bottom = "#78964a";
    recolored.colors.shoes = "#c5684d";
    const changed = applyWardrobe(original, recolored);
    let changes = 0;
    for (const item of [bottom, shoes])
      for (const slot of item.group === "bottom"
        ? RUN_LEG_SLOTS
        : RUN_SHOE_SLOTS) {
        const raw = decodeWardrobeItemPart(
            item.parts.find((p) => p.slot === slot)!.data,
          ),
          a = original.skin.images[slot]!,
          b = changed.skin.images[slot]!;
        for (let p = 0; p < raw.length / 5; p++) {
          if (!raw[p * 5 + 3]) continue;
          expect(Array.from(a.subarray(p * 4, p * 4 + 4))).toEqual(
            Array.from(raw.subarray(p * 5, p * 5 + 4)),
          );
          expect(b[p * 4 + 3]).toBe(a[p * 4 + 3]);
          const altered =
            hash(a.subarray(p * 4, p * 4 + 4)) !==
            hash(b.subarray(p * 4, p * 4 + 4));
          if (altered) {
            expect(raw[p * 5 + 4]).toBe(item.group === "bottom" ? 4 : 5);
            changes++;
          }
        }
      }
    expect(changes).toBeGreaterThan(100);
  });

  it("reproduces every historical Theo motion V2 atlas pixel from its saved source library", () => {
    const files = unzipSync(
      readFileSync("docs/theo-run-repair/final/theo-run.rig.zip"),
    );
    const raw = JSON.parse(strFromU8(files["project.json"]));
    const metadata = JSON.parse(strFromU8(files["skin.json"]));
    const items = JSON.parse(strFromU8(files["wardrobe.json"])).items;
    const identities = JSON.parse(
      strFromU8(files["identities.json"]),
    ).identities;
    const skin = assembleWardrobe(
      raw.wardrobe,
      metadata.name,
      items,
      identities,
    );
    const restored = validateProject({
      ...raw,
      skin,
      wardrobeItems: items,
      wardrobeIdentities: identities,
    });
    expect(restored.skin.metadata.version).toBe(1);
    expect(restored.motions.version).toBe(2);
    const baked = bakeProject(restored);
    expect(baked.manifest.frames).toHaveLength(36);
    // SHA256 of Pillow-decoded checked-in PNG RGBA, calculated independently
    // of this renderer from docs/theo-run-repair/final/theo-run/spritesheet.png.
    expect(hash(baked.pixels)).toBe(
      "5e86e01fbe61fc77fc8efeae8dbea0e6d44bd3da66212e5ea2f897a62a8e1ec6",
    );
  });
});
