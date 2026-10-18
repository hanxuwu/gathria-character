import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { IllustratedCanvas } from "../core/illustrated-canvas";
import { bakeProject } from "./bake";
import { createBuiltinSkin } from "./builtins";
import {
  createMotionLibrary,
  createMotionLibraryV2,
  createRigDefinition,
} from "./definition";
import { prepareRig } from "./renderer";
import { validateProject, validateSkin, validateSkinMetadata } from "./skin-io";
import {
  addWardrobeItem,
  createWardrobeItemTemplate,
  validateWardrobeItem,
} from "./wardrobe-items";
import { applyWardrobe, assembleWardrobe } from "./wardrobe";
import {
  RUN_SHOE_SLOTS,
  type AuthoringProject,
  type Point,
  type SkinPack,
} from "./types";
import type { CustomWardrobeItem } from "./wardrobe-types";

const digest = (p: Uint8ClampedArray) =>
  createHash("sha256").update(p).digest("hex");
const angleBetween = (a: Point, b: Point) =>
  Math.atan2(b[1] - a[1], b[0] - a[0]);
const angleError = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
function historicalTheo(): AuthoringProject {
  const files = unzipSync(
    readFileSync("docs/theo-passing-poses/final/theo-passing.rig.zip"),
  );
  const project = JSON.parse(strFromU8(files["project.json"]));
  const metadata = JSON.parse(strFromU8(files["skin.json"]));
  const items = JSON.parse(strFromU8(files["wardrobe.json"])).items;
  const identities = JSON.parse(strFromU8(files["identities.json"])).identities;
  return validateProject({
    ...project,
    wardrobeItems: items,
    wardrobeIdentities: identities,
    skin: assembleWardrobe(project.wardrobe, metadata.name, items, identities),
  });
}
function followingItem(project: AuthoringProject): CustomWardrobeItem {
  const original = project.wardrobeItems!.find(
    (item) => item.id === project.wardrobe!.shoes,
  )!;
  if (original.version !== 4 || original.group !== "shoes")
    throw Error("Expected historical run shoes");
  return {
    ...structuredClone(original),
    version: 5,
    id: "custom-theo-following-shoes",
    runShoes: {
      nearLeg: { ...original.runShoes.nearLeg, sourceShin: [74, 197] },
      farLeg: { ...original.runShoes.farLeg, sourceShin: [119, 197] },
    },
  };
}
function markedShoes(): SkinPack {
  const skin = createBuiltinSkin("denim-daytrip");
  for (const pixels of Object.values(skin.images))
    if (pixels)
      for (let p = 0; p < pixels.length; p += 4)
        if (pixels[p + 3]) pixels.set([100, 100, 100, 255], p);
  const runShoes = {
    nearLeg: {
      slot: "near-shoe-run" as const,
      ankle: [60, 220] as Point,
      sourceShin: [60, 200] as Point,
    },
    farLeg: {
      slot: "far-shoe-run" as const,
      ankle: [140, 220] as Point,
      sourceShin: [140, 200] as Point,
    },
  };
  skin.metadata = {
    ...skin.metadata,
    version: 4,
    runShoes,
    slots: [...skin.metadata.slots, ...RUN_SHOE_SLOTS],
  };
  for (const side of ["near", "far"] as const) {
    const pixels = new Uint8ClampedArray(192 * 256 * 4),
      [ax, ay] = runShoes[`${side}Leg`].ankle;
    for (let y = ay - 3; y <= ay + 13; y++)
      for (let x = ax - 5; x <= ax + 18; x++)
        pixels.set(
          side === "near" ? [20, 70, 140, 255] : [60, 80, 90, 255],
          (y * 192 + x) * 4,
        );
    if (side === "near") {
      for (const [dx, dy, color] of [
        [0, 0, [230, 10, 20, 255]],
        [13, 5, [20, 230, 10, 255]],
      ] as const)
        for (let y = ay + dy - 1; y <= ay + dy + 1; y++)
          for (let x = ax + dx - 1; x <= ax + dx + 1; x++)
            pixels.set(color, (y * 192 + x) * 4);
    }
    skin.images[`${side}-shoe-run`] = pixels;
  }
  return validateSkin(skin);
}
function markerMotions(version: 1 | 2) {
  const motions =
    version === 1 ? createMotionLibrary() : createMotionLibraryV2();
  // This deliberately artificial boot is shorter vertically than the catalog
  // source. Fit its test stride within reach instead of relying on bone stretch.
  for (const key of motions.clips.run.keys) key.footX *= 0.6;
  return motions;
}
function markerCenter(
  pixels: Uint8ClampedArray,
  color: readonly number[],
): Point {
  const points: Point[] = [];
  for (let p = 0; p < pixels.length / 4; p++)
    if (pixels[p * 4 + 3] && color.every((v, i) => pixels[p * 4 + i] === v))
      points.push([p % 192, Math.floor(p / 192)]);
  expect(points.length).toBeGreaterThan(0);
  return [
    points.reduce((sum, p) => sum + p[0], 0) / points.length,
    points.reduce((sum, p) => sum + p[1], 0) / points.length,
  ];
}

describe("explicit shin-following shoe registrations", () => {
  it("rejects absent, foreign, collapsed, nonfinite and out-of-bounds source axes", () => {
    const skin = markedShoes();
    expect(
      validateSkinMetadata(JSON.parse(JSON.stringify(skin.metadata))),
    ).toEqual(skin.metadata);
    const change = (edit: (v: any) => void) => {
      const v = structuredClone(skin.metadata);
      edit(v);
      expect(() => validateSkinMetadata(v)).toThrow();
    };
    change((v) => delete v.runShoes.farLeg.sourceShin);
    change((v) => delete v.runShoes.farLeg);
    change((v) => {
      v.runShoes.nearLeg.slot = "far-shoe-run";
    });
    change((v) => {
      v.runShoes.nearLeg.sourceShin = v.runShoes.nearLeg.ankle;
    });
    for (const point of [
      [NaN, 200],
      [Infinity, 200],
      [0, 200],
      [192, 200],
      [60, 256],
      [60.5, 200],
      [60, 120],
    ])
      change((v) => {
        v.runShoes.nearLeg.sourceShin = point;
      });
    change((v) => {
      v.version = 3;
    });
    change((v) => {
      v.version = 5;
    });
    const item = followingItem(historicalTheo());
    expect(validateWardrobeItem(JSON.parse(JSON.stringify(item)))).toEqual(
      item,
    );
    expect(() => validateWardrobeItem({ ...item, version: 4 })).toThrow();
    expect(() => validateWardrobeItem({ ...item, version: 6 })).toThrow();
    const badItem = structuredClone(item);
    if (badItem.version !== 5) throw Error("Expected following shoes");
    badItem.runShoes.farLeg.sourceShin = badItem.runShoes.farLeg.ankle;
    expect(() => validateWardrobeItem(badItem)).toThrow();
  });

  it.each([1, 2] as const)(
    "rotates asymmetric shoe markers with the solved shin and shares its ankle in motion V%s",
    (version) => {
      const skin = markedShoes(),
        motions = markerMotions(version);
      const rig = prepareRig(createRigDefinition(), skin, motions);
      for (const key of [0, 3, 6, 8, 10]) {
        const pixels = rig.frame("run", key),
          inspection = rig.inspect("run", key);
        const [_, knee, ankle] = inspection.limbs.find(
          (limb) => limb.id === "nearLeg",
        )!.bones;
        const red = markerCenter(pixels, [230, 10, 20]),
          green = markerCenter(pixels, [20, 230, 10]);
        expect(Math.hypot(red[0] - ankle[0], red[1] - ankle[1])).toBeLessThan(
          1,
        );
        // The green marker is deliberately not aligned with the shoe's sole.
        // Its measured final bearing proves actual pixels followed the shin.
        const expected =
          angleBetween(knee, ankle) - Math.PI / 2 + Math.atan2(5, 13);
        expect(angleError(angleBetween(red, green), expected)).toBeLessThan(
          0.09,
        );
      }
      const altered = structuredClone(motions);
      for (const key of altered.clips.run.keys)
        key.shoePitch = key.shoePitch >= 0 ? -0.7 : 0.7;
      const changed = prepareRig(createRigDefinition(), skin, altered);
      for (let key = 0; key < 12; key++) {
        const pixels = rig.frame("run", key);
        expect(digest(changed.frame("run", key))).toBe(digest(pixels));
        let sole = -1;
        for (let p = 0; p < pixels.length / 4; p++)
          if (
            pixels[p * 4 + 3] &&
            (pixels[p * 4] === 20 || pixels[p * 4] === 230)
          )
            sole = Math.max(sole, Math.floor(p / 192));
        expect(
          Math.abs(sole - (239 - motions.clips.run.keys[key].footLift)),
        ).toBeLessThanOrEqual(1);
      }
      const remembered = digest(rig.frame("run", 8));
      for (let key = 11; key >= 0; key--) rig.frame("run", key);
      expect(digest(rig.frame("run", 8))).toBe(remembered);
    },
  );

  it("rejects impossible non-first run poses only in the explicit following mode", () => {
    const source = markedShoes(),
      motions = markerMotions(2);
    motions.clips.run.keys[4].footX = 48;
    const following = prepareRig(createRigDefinition(), source, motions);
    expect(() => following.frame("run", 0)).not.toThrow();
    expect(() => following.frame("run", 4)).toThrow(/reach|travel/);
    const old = structuredClone(source);
    const near = source.metadata.runShoes!.nearLeg,
      far = source.metadata.runShoes!.farLeg;
    old.metadata = {
      ...source.metadata,
      version: 3,
      runShoes: {
        nearLeg: { slot: "near-shoe-run", ankle: near.ankle },
        farLeg: { slot: "far-shoe-run", ankle: far.ankle },
      },
    };
    const legacy = prepareRig(
      createRigDefinition(),
      validateSkin(old),
      motions,
    );
    expect(() => legacy.frame("run", 4)).not.toThrow();
    expect(digest(legacy.frame("run", 4))).toBe(digest(legacy.frame("run", 4)));
  });

  it("supports every real Theo run pose with rasterized soles and stable non-run artwork", () => {
    const original = historicalTheo(),
      current = addWardrobeItem(original, followingItem(original));
    const before = prepareRig(original.rig, original.skin, original.motions),
      after = prepareRig(current.rig, current.skin, current.motions);
    expect(current.motions).toEqual(original.motions);
    expect(current.skin.metadata.bindings.chains).toEqual(
      original.skin.metadata.bindings.chains,
    );
    expect(current.skin.metadata.runLegs).toEqual(
      original.skin.metadata.runLegs,
    );
    for (let key = 0; key < 12; key++) {
      const view = after.inspect("run", key);
      expect(view.shoes).toHaveLength(2);
      for (const shoe of view.shoes!) {
        const leg = view.limbs.find((limb) => limb.id === shoe.chain)!;
        expect(shoe.ankle).toEqual(leg.bones[2]);
        const sourceChain = current.skin.metadata.bindings.chains[shoe.chain];
        for (let segment = 0; segment < 2; segment++) {
          const a = leg.bones[segment],
            b = leg.bones[segment + 1];
          const sa = sourceChain[segment],
            sb = sourceChain[segment + 1];
          expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(
            Math.hypot(sb[0] - sa[0], sb[1] - sa[1]),
            7,
          );
        }
        const source =
          current.skin.metadata.runShoes![shoe.chain as "nearLeg" | "farLeg"];
        if (!("sourceShin" in source)) throw Error("Missing source axis");
        expect(
          angleError(
            shoe.rotation,
            angleBetween(leg.bones[1], leg.bones[2]) -
              angleBetween(source.sourceShin, source.ankle),
          ),
        ).toBeLessThan(1e-8);
        const canvas = new IllustratedCanvas();
        canvas.draw(
          {
            id: shoe.sourceSlot,
            x: 0,
            y: 0,
            width: 192,
            height: 256,
            data: "",
            palette: {},
          },
          current.skin.images[shoe.sourceSlot]!,
          shoe.matrix,
        );
        let sole = -1;
        for (let p = 0; p < canvas.pixels.length / 4; p++)
          if (canvas.pixels[p * 4 + 3])
            sole = Math.max(sole, Math.floor(p / 192));
        const phase = (key + (shoe.chain === "nearLeg" ? 0 : 6)) % 12;
        expect(
          Math.abs(
            sole - (239 - current.motions.clips.run.keys[phase].footLift),
          ),
        ).toBeLessThanOrEqual(1);
        expect(sole).toBe(shoe.sole);
        expect(shoe.searchSamples).toBeGreaterThan(0);
      }
    }
    for (const action of ["idle", "walk", "jump"] as const)
      for (
        let frame = 0;
        frame < current.motions.clips[action]!.keys.length;
        frame++
      )
        expect(digest(after.frame(action, frame))).toBe(
          digest(before.frame(action, frame)),
        );
    const reopened = validateProject(current);
    expect(reopened.skin.metadata).toEqual(current.skin.metadata);
    expect(reopened.wardrobeItems).toEqual(current.wardrobeItems);
    expect(digest(bakeProject(reopened).pixels)).toBe(
      digest(bakeProject(current).pixels),
    );
  });

  it("clears following footwear on replacement while preserving leg alternatives and active forearms", () => {
    const original = historicalTheo();
    const top = createWardrobeItemTemplate(
      original.wardrobe!,
      "top",
      original.wardrobeItems,
      original.wardrobeIdentities,
    );
    if (top.group !== "top" || top.version !== 3)
      throw Error("Expected source-relative top");
    top.id = "custom-theo-following-active-top";
    top.actionForearms = {
      run: {
        "near-forearm": "near-forearm-active",
        "far-forearm": "far-forearm-active",
      },
    };
    for (const side of ["near", "far"] as const)
      top.parts.push({
        ...structuredClone(
          top.parts.find((part) => part.slot === `${side}-forearm`)!,
        ),
        slot: `${side}-forearm-active`,
      });
    const active = addWardrobeItem(
      addWardrobeItem(original, top),
      followingItem(original),
    );
    const oldRecipe = structuredClone(active.wardrobe!);
    if (oldRecipe.version === 1) throw Error("Expected custom wardrobe recipe");
    oldRecipe.shoes = original.wardrobe!.shoes;
    const oldShoes = applyWardrobe(active, oldRecipe);
    expect(oldShoes.skin.metadata.version).toBe(3);
    expect(oldShoes.skin.metadata.runLegs).toEqual(
      active.skin.metadata.runLegs,
    );
    expect(oldShoes.skin.metadata.actionForearms).toEqual(
      active.skin.metadata.actionForearms,
    );
    expect(oldShoes.skin.metadata.runShoes).toEqual(
      original.skin.metadata.runShoes,
    );
    const plain = applyWardrobe(active, {
      ...active.wardrobe!,
      shoes: "boots",
    });
    expect(plain.skin.metadata.version).toBe(3);
    expect(plain.skin.metadata.runShoes).toBeUndefined();
    expect(plain.skin.metadata.runLegs).toEqual(active.skin.metadata.runLegs);
    expect(plain.skin.metadata.actionForearms).toEqual(
      active.skin.metadata.actionForearms,
    );
    for (const slot of RUN_SHOE_SLOTS)
      expect(plain.skin.images[slot]).toBeUndefined();
    const restored = applyWardrobe(plain, active.wardrobe!);
    expect(restored.skin.metadata).toEqual(active.skin.metadata);
  });

  it("keeps all 36 historical SkinV3 Theo frames pixel-exact", () => {
    const original = historicalTheo();
    expect(original.skin.metadata.version).toBe(3);
    const baked = bakeProject(original);
    expect(baked.manifest.frames).toHaveLength(36);
    // Independently decoded checked-in PNG RGBA; not a new-render snapshot.
    expect(digest(baked.pixels)).toBe(
      "d99c5de31ed090f475fa70f5ab5913d6a96c178f21cb2f2f149b66eb803ce38e",
    );
  });
});
