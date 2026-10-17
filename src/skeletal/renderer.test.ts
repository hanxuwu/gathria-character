import { describe, expect, it } from "vitest";
import { bakeProject, REUSABLE_GENERATOR_ID } from "./bake";
import { createMotionLibrary, createRigDefinition } from "./definition";
import { prepareRig } from "./renderer";
import {
  FRAME_HEIGHT as H,
  FRAME_WIDTH as W,
  REQUIRED_SLOTS,
  RIG_ID,
  type AuthoringProject,
  type SkinPack,
  type Slot,
} from "./types";

function solid(
  left: number,
  top: number,
  width: number,
  height: number,
  color: number,
) {
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let y = top; y < top + height; y++)
    for (let x = left; x < left + width; x++)
      pixels.set([color, 100, 60, 255], (y * W + x) * 4);
  return pixels;
}
function skin(id = "independent-import", color = 140): SkinPack {
  const rig = createRigDefinition();
  const images: SkinPack["images"] = {};
  const rects: Record<Slot, [number, number, number, number]> = {
    torso: [78, 118, 42, 56],
    hips: [82, 168, 32, 12],
    "near-upper-arm": [63, 119, 15, 35],
    "near-forearm": [56, 147, 12, 30],
    "far-upper-arm": [120, 121, 15, 32],
    "far-forearm": [126, 147, 13, 30],
    "near-thigh": [73, 170, 18, 32],
    "near-shin": [67, 196, 16, 34],
    "near-shoe": [66, 225, 22, 15],
    "far-thigh": [102, 170, 18, 32],
    "far-shin": [102, 196, 16, 34],
    "far-shoe": [101, 225, 22, 15],
    "head-neutral": [85, 70, 40, 45],
    "head-gentle": [85, 70, 40, 45],
    "head-joyful": [85, 70, 40, 45],
    "back-hair": [85, 60, 40, 60],
    garment: [74, 165, 50, 40],
  };
  for (const slot of REQUIRED_SLOTS)
    images[slot] = solid(
      ...rects[slot],
      slot === "head-joyful" ? 220 : slot === "head-neutral" ? 80 : color,
    );
  return {
    metadata: {
      format: "gathria-skin-pack",
      version: 1,
      id,
      name: "Synthetic import",
      rigId: RIG_ID,
      sourceAppearance: {
        schemaVersion: 2,
        artworkVersion: 6,
        motionVersion: 3,
        name: "Reference",
        skinTone: "#E5AE87",
        hairstyle: "crop",
        hairColor: "#43312E",
        upperColor: "#527D9A",
        lowerColor: "#A37B56",
        shoeColor: "#594435",
        faceVariant: "oval",
        upperClothing: "jacket",
        lowerClothing: "trousers",
        expression: "gentle",
        hairAccessory: "none",
      },
      provenance: "Synthetic rectangles authored for geometry tests.",
      slots: [...REQUIRED_SLOTS],
      bindings: {
        chains: structuredClone(rig.chains),
        offsets: {},
        mesh: { blendRadius: 6, volume: 0.65 },
        jaw: { center: [111, 88], start: 99, scale: 1, length: 1 },
        hairSway: 1,
        garmentSway: 1,
      },
    },
    images,
  };
}
function project(): AuthoringProject {
  return {
    format: "gathria-rig-authoring",
    version: 1,
    rig: createRigDefinition(),
    motions: createMotionLibrary(),
    skin: skin(),
    preview: { animation: "run", facing: "right", expression: "gentle" },
  };
}
const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
  a.some((p, i) => p !== b[i]);

describe("reusable imported-skin engine", () => {
  it("drives arbitrary skin IDs with one hierarchy and clip library", () => {
    const rig = createRigDefinition(),
      motions = createMotionLibrary();
    const a = prepareRig(rig, skin("first"), motions),
      b = prepareRig(rig, skin("different-id"), motions),
      c = prepareRig(rig, skin("third", 190), motions);
    for (const animation of ["idle", "walk", "run"] as const) {
      const first = a.frame(animation, 2, "gentle");
      expect(first).toEqual(b.frame(animation, 2, "gentle"));
      expect(changed(first, c.frame(animation, 2, "gentle"))).toBe(true);
      expect(first.some((n, i) => i % 4 === 3 && n === 255)).toBe(true);
      expect(first.every((n, i) => i % 4 !== 3 || n === 0 || n === 255)).toBe(
        true,
      );
    }
  });
  it("fits the same hierarchy to source garment joints instead of forcing one skin's proportions", () => {
    const source = skin();
    source.metadata.bindings.chains.nearLeg = [
      [85, 189],
      [77, 207],
      [74, 224],
    ];
    const engine = prepareRig(
      createRigDefinition(),
      source,
      createMotionLibrary(),
    );
    const info = engine.inspect("idle", 0, "gentle");
    expect(info.limbs.find((l) => l.id === "nearLeg")!.bones).toEqual([
      [85, 189],
      [77, 207],
      [74, 224],
    ]);
    expect(info.limbs).toHaveLength(4);
    for (const limb of info.limbs) {
      expect(limb.vertices.flat().every(Number.isFinite)).toBe(true);
      for (let i = 0; i < limb.weights.length; i += 2)
        expect(limb.weights[i] + limb.weights[i + 1]).toBeCloseTo(1);
    }
  });
  it("expressions share their head registration, and attachment offsets change actual pixels", () => {
    const original = project(),
      engine = prepareRig(original.rig, original.skin, original.motions);
    const neutral = engine.frame("idle", 0, "neutral"),
      gentle = engine.frame("idle", 0, "gentle");
    expect(changed(neutral, gentle)).toBe(true);
    expect(neutral.filter((_, i) => i % 4 === 3)).toEqual(
      gentle.filter((_, i) => i % 4 === 3),
    );
    original.skin.metadata.bindings.offsets["head-gentle"] = [8, 0];
    const shifted = prepareRig(original.rig, original.skin, original.motions);
    expect(changed(gentle, shifted.frame("idle", 0, "gentle"))).toBe(true);
    expect(shifted.inspect("idle", 0).limbs.map((l) => l.bones)).toEqual(
      engine.inspect("idle", 0).limbs.map((l) => l.bones),
    );
  });
  it("applies manual shoe Y offsets without changing the foot bone or cancelling them at the sole", () => {
    const original = project();
    original.skin.images["near-shoe"] = solid(66, 225, 22, 15, 230);
    const base = prepareRig(original.rig, original.skin, original.motions);
    original.skin.metadata.bindings.offsets["near-shoe"] = [0, 3];
    const edited = prepareRig(original.rig, original.skin, original.motions);
    const sole = (pixels: Uint8ClampedArray) => {
      let bottom = -1;
      for (let p = 0; p < W * H; p++)
        if (pixels[p * 4] === 230 && pixels[p * 4 + 3])
          bottom = Math.floor(p / W);
      return bottom;
    };
    for (const animation of ["idle", "walk", "run"] as const) {
      // Key zero has a flat planted near shoe in every shared clip.
      expect(sole(base.frame(animation, 0))).toBe(239);
      expect(sole(edited.frame(animation, 0))).toBe(242);
      expect(
        edited.inspect(animation, 0).limbs.find((l) => l.id === "nearLeg")!
          .bones,
      ).toEqual(
        base.inspect(animation, 0).limbs.find((l) => l.id === "nearLeg")!.bones,
      );
    }
  });
  it("uses editable motion values while keeping prepared engines deterministic snapshots", () => {
    const p = project(),
      engine = prepareRig(p.rig, p.skin, p.motions);
    const before = engine.frame("run", 0, "gentle");
    p.motions.clips.run.keys[0].footLift = 12;
    const edited = prepareRig(p.rig, p.skin, p.motions);
    expect(changed(before, edited.frame("run", 0, "gentle"))).toBe(true);
    expect(engine.frame("run", 0, "gentle")).toEqual(before);
    expect(edited.frame("idle", 0)).toEqual(engine.frame("idle", 0));
  });
  it("bakes 24 shared-engine frames with held idle timing, explicit provenance identity and mirror metadata", () => {
    const p = project(),
      generated = bakeProject(p),
      engine = prepareRig(p.rig, p.skin, p.motions);
    expect(generated.manifest.generator).toBe(REUSABLE_GENERATOR_ID);
    expect(generated.manifest.name).toBe("Synthetic import");
    expect(generated.manifest.frames).toHaveLength(24);
    expect(generated.manifest.animations.idle.frames).toHaveLength(12);
    expect(generated.manifest.animations.walk.fps).toBe(10);
    expect(generated.manifest.animations.run!.fps).toBe(18);
    expect(generated.manifest.facing.left).toBe("mirror-x");
    expect(generated.manifest.anchor).toMatchObject({ x: 96, y: 240 });
    for (const [animation, id] of [
      ["idle", 0],
      ["walk", 4],
      ["run", 12],
    ] as const) {
      const rect = generated.manifest.frames.find((f) => f.id === id)!;
      const expected = engine.frame(animation, 0, "gentle");
      for (let row = 0; row < H; row++)
        expect(
          generated.pixels.slice(
            ((rect.y + row) * generated.width + rect.x) * 4,
            ((rect.y + row) * generated.width + rect.x + W) * 4,
          ),
        ).toEqual(expected.slice(row * W * 4, (row + 1) * W * 4));
    }
  });
  it("rejects disconnected hierarchies, duplicate composition and invalid keys", () => {
    const p = project();
    p.rig.bones.find((b) => b.id === "nearArm:lower")!.parent = "root";
    expect(() => prepareRig(p.rig, p.skin, p.motions)).toThrow(/hierarchy/);
    p.rig = createRigDefinition();
    p.rig.drawOrder.push("head");
    expect(() => prepareRig(p.rig, p.skin, p.motions)).toThrow(/Draw order/);
    const engine = prepareRig(
      createRigDefinition(),
      skin(),
      createMotionLibrary(),
    );
    expect(() => engine.frame("run", 12)).toThrow(/outside/);
  });
});
