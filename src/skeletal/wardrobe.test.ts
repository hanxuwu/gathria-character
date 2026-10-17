import { describe, expect, it } from "vitest";
import { unzlibSync } from "fflate";
import { WARDROBE_ASSETS } from "./wardrobe-assets.generated";
import { createMotionLibrary, createRigDefinition } from "./definition";
import { prepareRig } from "./renderer";
import {
  applyWardrobe,
  assembleWardrobe,
  assertWardrobeSkinMatches,
  defaultWardrobeRecipe,
  validateWardrobeRecipe,
} from "./wardrobe";
import type { WardrobeColor, WardrobeRecipe } from "./wardrobe-types";
import {
  FRAME_HEIGHT as H,
  FRAME_WIDTH as W,
  type Slot,
  type AuthoringProject,
} from "./types";

/** Flat projects have no implicit catalog association. Core assembly tests do
 * not invoke historical generators; old file compatibility has I/O coverage. */
function flatProject(): AuthoringProject {
  return {
    format: "gathria-rig-authoring",
    version: 1,
    rig: createRigDefinition(),
    motions: createMotionLibrary(),
    skin: assembleWardrobe(defaultWardrobeRecipe()),
    preview: { animation: "run", facing: "right", expression: "gentle" },
  };
}

const equalPixels = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const changedSlots = (
  a: ReturnType<typeof assembleWardrobe>,
  b: ReturnType<typeof assembleWardrobe>,
) =>
  a.metadata.slots.filter(
    (slot) => !b.images[slot] || !equalPixels(a.images[slot]!, b.images[slot]!),
  );

describe("versioned modular wardrobe", () => {
  it("canonicalizes a detached recipe and rejects unknown catalog choices without coercion", () => {
    const input = defaultWardrobeRecipe("crop");
    input.colors.top = "#AABBCC";
    const result = validateWardrobeRecipe(input);
    expect(result.colors.top).toBe("#aabbcc");
    expect(result.colors).not.toBe(input.colors);
    expect(() =>
      validateWardrobeRecipe({ ...input, catalogVersion: 2 }),
    ).toThrow(/catalogVersion/);
    expect(() =>
      validateWardrobeRecipe({ ...input, top: "../external.png" }),
    ).toThrow(/wardrobe.top/);
    expect(() =>
      validateWardrobeRecipe({ ...input, ignored: "field" }),
    ).toThrow(/exactly/);
  });

  it("assembles deterministic independent buffers and does not turn flat projects into wardrobe projects", () => {
    const old = flatProject(),
      before = old.skin.images.torso!.slice();
    expect(old.wardrobe).toBeUndefined();
    const recipe = defaultWardrobeRecipe(),
      a = assembleWardrobe(recipe),
      b = assembleWardrobe(recipe);
    expect(a.metadata).toEqual(b.metadata);
    for (const slot of a.metadata.slots) {
      expect(equalPixels(a.images[slot]!, b.images[slot]!)).toBe(true);
      // Compare references without asking the assertion formatter to diff
      // fifteen full RGBA buffers just to report an identity check.
      expect(a.images[slot] === b.images[slot]).toBe(false);
    }
    a.images.torso!.fill(0);
    a.metadata.bindings.chains.nearArm = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];
    expect(
      equalPixels(assembleWardrobe(recipe).images.torso!, b.images.torso!),
    ).toBe(true);
    expect(equalPixels(old.skin.images.torso!, before)).toBe(true);
    expect(old.wardrobe).toBeUndefined();
  });

  it.each(["crop", "waves"] as const)(
    "keeps %s identity and all three expressions unchanged while clothing groups swap",
    (identity) => {
      const recipe = defaultWardrobeRecipe(identity),
        source = assembleWardrobe(recipe);
      const dressed = assembleWardrobe({
        ...recipe,
        top: recipe.top === "soft-top" ? "denim-jacket" : "soft-top",
        bottom: recipe.bottom === "trousers" ? "short-skirt" : "trousers",
        shoes: recipe.shoes === "boots" ? "flats" : "boots",
      });
      for (const slot of [
        "head-neutral",
        "head-gentle",
        "head-joyful",
        "back-hair",
      ] as const) {
        if (!source.images[slot]) expect(dressed.images[slot]).toBeUndefined();
        else
          expect(equalPixels(source.images[slot]!, dressed.images[slot]!)).toBe(
            true,
          );
      }
      expect(dressed.metadata.bindings.jaw).toEqual(
        source.metadata.bindings.jaw,
      );
      expect(dressed.metadata.sourceAppearance.hairstyle).toBe(
        source.metadata.sourceAppearance.hairstyle,
      );
      expect(dressed.metadata.sourceAppearance.faceVariant).toBe(
        source.metadata.sourceAppearance.faceVariant,
      );
      expect(
        equalPixels(
          source.images["head-neutral"]!,
          source.images["head-gentle"]!,
        ),
      ).toBe(false);
      expect(
        equalPixels(
          source.images["head-gentle"]!,
          source.images["head-joyful"]!,
        ),
      ).toBe(false);
    },
  );

  it("changes complete top groups without leaking into head, legs, shoes or source leg joints", () => {
    const recipe = defaultWardrobeRecipe(),
      before = assembleWardrobe(recipe);
    const after = assembleWardrobe({ ...recipe, top: "soft-top" });
    expect(changedSlots(before, after).sort()).toEqual([
      "far-forearm",
      "far-upper-arm",
      "near-forearm",
      "near-upper-arm",
      "torso",
    ]);
    expect(after.metadata.bindings.chains.nearLeg).toEqual(
      before.metadata.bindings.chains.nearLeg,
    );
    expect(after.metadata.bindings.chains.farLeg).toEqual(
      before.metadata.bindings.chains.farLeg,
    );
    expect(after.metadata.bindings.chains.nearArm).toEqual(
      WARDROBE_ASSETS.tops.find((item) => item.id === "soft-top")!.chains
        .nearArm,
    );
    expect(after.metadata.bindings.chains.farArm).toEqual(
      WARDROBE_ASSETS.tops.find((item) => item.id === "soft-top")!.chains
        .farArm,
    );
  });

  it("removes every skirt attachment when switching to trousers and atomically replaces leg source joints", () => {
    const recipe = defaultWardrobeRecipe("waves"),
      skirt = assembleWardrobe(recipe);
    const trousers = assembleWardrobe({ ...recipe, bottom: "trousers" });
    expect(skirt.images.garment).toBeDefined();
    expect(trousers.images.garment).toBeUndefined();
    expect(trousers.metadata.slots).not.toContain("garment");
    expect(trousers.metadata.bindings.chains.nearLeg).toEqual(
      WARDROBE_ASSETS.bottoms.find((item) => item.id === "trousers")!.chains
        .nearLeg,
    );
    expect(trousers.metadata.bindings.chains.farLeg).toEqual(
      WARDROBE_ASSETS.bottoms.find((item) => item.id === "trousers")!.chains
        .farLeg,
    );
    for (const slot of [
      "torso",
      "near-forearm",
      "far-forearm",
      "head-gentle",
    ] as const)
      expect(equalPixels(skirt.images[slot]!, trousers.images[slot]!)).toBe(
        true,
      );
  });

  it("changes only shoe attachments and fits their opening to the chosen ankles without shifting the soles", () => {
    const recipe = defaultWardrobeRecipe(),
      source = assembleWardrobe(recipe);
    const flats = assembleWardrobe({ ...recipe, shoes: "flats" });
    expect(changedSlots(source, flats).sort()).toEqual([
      "far-shoe",
      "near-shoe",
    ]);
    expect(flats.metadata.bindings).toEqual(source.metadata.bindings);
    const bootedSkirt = assembleWardrobe({ ...recipe, bottom: "short-skirt" });
    for (const [slot, chain] of [
      ["near-shoe", "nearLeg"],
      ["far-shoe", "farLeg"],
    ] as const) {
      const before = source.images[slot]!,
        after = bootedSkirt.images[slot]!;
      const a = source.metadata.bindings.chains[chain][2],
        b = bootedSkirt.metadata.bindings.chains[chain][2];
      const bounds = (pixels: Uint8ClampedArray) => {
        const box = { top: H, bottom: -1, left: W, right: -1 };
        for (let p = 0; p < W * H; p++)
          if (pixels[p * 4 + 3]) {
            box.top = Math.min(box.top, Math.floor(p / W));
            box.bottom = Math.max(box.bottom, Math.floor(p / W));
            box.left = Math.min(box.left, p % W);
            box.right = Math.max(box.right, p % W);
          }
        return box;
      };
      const original = bounds(before),
        fitted = bounds(after);
      expect(fitted.bottom).toBe(original.bottom);
      expect(fitted.bottom).toBe(239);
      expect(fitted.top).toBeLessThan(original.top);
      expect(fitted.left - original.left).toBe(b[0] - a[0]);
      expect(fitted.right - fitted.left).toBe(original.right - original.left);
      expect(after[(b[1] * W + b[0]) * 4 + 3]).toBe(255);
    }
  });

  it.each(["crop", "waves"] as const)(
    "recolors only authored material masks for %s, including skin on head, hands and legs",
    (identity) => {
      const recipe = defaultWardrobeRecipe(identity),
        before = assembleWardrobe(recipe);
      const sourceIdentity = WARDROBE_ASSETS.identities.find(
        (item) => item.id === identity,
      )!;
      const parts = [
        ...sourceIdentity.parts,
        ...WARDROBE_ASSETS.tops.find((item) => item.id === recipe.top)!.parts,
        ...WARDROBE_ASSETS.bottoms.find((item) => item.id === recipe.bottom)!
          .parts,
        ...WARDROBE_ASSETS.shoes.find((item) => item.id === recipe.shoes)!
          .parts,
      ];
      const channels: [WardrobeColor, number][] = [
        ["skin", 1],
        ["top", 3],
        ["bottom", 4],
        ["shoes", 5],
      ];
      for (const [color, material] of channels) {
        const after = assembleWardrobe({
          ...recipe,
          colors: { ...recipe.colors, [color]: "#354d69" },
        });
        const changed = new Set<Slot>();
        let count = 0,
          fixedBlue = 0;
        for (const part of parts) {
          const raw = unzlibSync(
            Uint8Array.from(atob(part.data), (char) => char.charCodeAt(0)),
          );
          const a = before.images[part.slot]!,
            b = after.images[part.slot]!;
          for (let p = 0; p < W * H; p++) {
            const pixel = p * 4,
              packed = p * 5;
            if (a[pixel + 3] !== b[pixel + 3])
              throw Error(`${part.slot}: recolor changed alpha`);
            if (
              a[pixel] !== b[pixel] ||
              a[pixel + 1] !== b[pixel + 1] ||
              a[pixel + 2] !== b[pixel + 2]
            ) {
              if (raw[packed + 4] !== material)
                throw Error(
                  `${part.slot}: ${color} changed material ${raw[packed + 4]}`,
                );
              changed.add(part.slot);
              count++;
            }
            if (
              raw[packed + 3] &&
              raw[packed + 4] === 0 &&
              raw[packed + 2] > raw[packed] + 10
            ) {
              if (
                b
                  .subarray(pixel, pixel + 4)
                  .some((value, i) => value !== a[pixel + i])
              )
                throw Error("Fixed blue detail changed");
              fixedBlue++;
            }
          }
        }
        expect(count).toBeGreaterThan(50);
        if (color === "skin") {
          expect(changed.has("head-gentle")).toBe(true);
          expect(changed.has("near-forearm")).toBe(true);
          if (identity === "waves") expect(changed.has("near-shin")).toBe(true);
        }
        if (identity === "waves") expect(fixedBlue).toBeGreaterThan(10);
      }
    },
  );

  it("keeps edited motions, preview and skeleton while recipe assembly replaces only the skin", () => {
    const project = flatProject();
    project.motions.clips.run.fps = 12;
    project.motions.clips.jump!.sequence.splice(4, 0, 4);
    project.preview = {
      animation: "jump",
      facing: "left",
      expression: "joyful",
    };
    const recipe = defaultWardrobeRecipe("waves"),
      next = applyWardrobe(project, recipe);
    expect(next.rig).toBe(project.rig);
    expect(next.motions).toBe(project.motions);
    expect(next.preview).toBe(project.preview);
    expect(next.skin.metadata.name).toBe(project.skin.metadata.name);
    expect(next.wardrobe).toEqual(recipe);
    expect(next.wardrobe).not.toBe(recipe);
    expect(() =>
      assertWardrobeSkinMatches(next.wardrobe, next.skin),
    ).not.toThrow();
  });

  it.each([
    { identity: "crop", top: "soft-top", bottom: "trousers", shoes: "flats" },
    {
      identity: "waves",
      top: "denim-jacket",
      bottom: "short-skirt",
      shoes: "boots",
    },
  ] as const)(
    "poses mixed clothing $identity/$top/$bottom/$shoes with every action and no frame clipping",
    (combination) => {
      const recipe: WardrobeRecipe = {
        ...defaultWardrobeRecipe(combination.identity),
        ...combination,
        colors: {
          skin: "#805039",
          top: "#83997b",
          bottom: "#705049",
          shoes: "#594435",
        },
      };
      const project = applyWardrobe(flatProject(), recipe);
      const rig = prepareRig(project.rig, project.skin, project.motions);
      for (const animation of ["idle", "walk", "run", "jump"] as const) {
        const clip = project.motions.clips[animation]!;
        for (let frame = 0; frame < clip.keys.length; frame++) {
          const pixels = rig.frame(
            animation,
            frame,
            frame % 3 === 0 ? "joyful" : frame % 3 === 1 ? "gentle" : "neutral",
          );
          let visible = 0;
          for (let p = 0; p < W * H; p++) {
            const alpha = pixels[p * 4 + 3];
            if (alpha !== 0 && alpha !== 255) throw Error("Non-binary alpha");
            if (!alpha) continue;
            visible++;
            const x = p % W,
              y = Math.floor(p / W);
            if (x === 0 || x === W - 1 || y === 0 || y === H - 1)
              throw Error(`${animation}/${frame}: clipped frame edge`);
          }
          expect(visible).toBeGreaterThan(1000);
        }
      }
    },
  );
});
