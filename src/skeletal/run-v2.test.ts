import { describe, expect, it } from "vitest";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import {
  createMotionLibrary,
  createMotionLibraryV2,
  createRigDefinition,
} from "./definition";
import { motionFields, setMotionField } from "./motion-edit";
import { prepareRig } from "./renderer";
import { validateProject } from "./skin-io";
import type { MotionKey, MotionLibrary, Point } from "./types";

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function engine(motions = createMotionLibraryV2()) {
  return prepareRig(
    createRigDefinition(),
    createBuiltinSkin("denim-daytrip"),
    motions,
  );
}

describe("explicit centered run motion library v2", () => {
  it("uses equal half-cycle foot spacing without moving anatomical hip registrations", () => {
    const motions = createMotionLibraryV2();
    const rig = engine(motions);
    const legacy = engine({ ...motions, version: 1 });
    const space = (r: ReturnType<typeof engine>, key: number) => {
      const limbs = r.inspect("run", key).limbs;
      return (
        limbs.find((l) => l.id === "nearLeg")!.bones[2][0] -
        limbs.find((l) => l.id === "farLeg")!.bones[2][0]
      );
    };
    expect(space(rig, 0)).toBeCloseTo(-space(rig, 6), 10);
    expect(Math.abs(space(legacy, 0))).not.toBeCloseTo(
      Math.abs(space(legacy, 6)),
      3,
    );
    for (let key = 0; key < 12; key++) {
      const original = legacy.inspect("run", key).limbs;
      for (const leg of rig
        .inspect("run", key)
        .limbs.filter((l) => l.id.endsWith("Leg")))
        expect(leg.bones[0]).toEqual(
          original.find((l) => l.id === leg.id)!.bones[0],
        );
    }
  });

  it("grounds the rotated opaque sole and shares the shoe's transformed ankle with leg IK", () => {
    const source = createBuiltinSkin("denim-daytrip");
    // Isolate one shoe, preserving its real outline; a colored ankle patch is
    // a visual landmark independent from the inspector's returned bone data.
    const original = source.images["near-shoe"]!;
    for (const slot of source.metadata.slots) {
      const pixels = new Uint8ClampedArray(source.images[slot]!);
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i + 3]) pixels.set([100, 100, 100, 255], i);
      source.images[slot] = pixels;
    }
    source.images["near-shoe"] = new Uint8ClampedArray(original.length);
    const shoe = source.images["near-shoe"]!;
    for (let i = 0; i < original.length; i += 4)
      if (original[i + 3]) shoe.set([20, 70, 140, 255], i);
    const ankle = source.metadata.bindings.chains.nearLeg[2];
    for (let y = ankle[1] - 2; y <= ankle[1] + 2; y++)
      for (let x = ankle[0] - 2; x <= ankle[0] + 2; x++)
        shoe.set([230, 10, 20, 255], (y * 192 + x) * 4);
    // A second complete shoe is needed by the solver, even if hidden by an
    // identical color. Move it far enough from this ankle for the marker check.
    source.images["far-shoe"] = new Uint8ClampedArray(shoe);
    for (let i = 0; i < shoe.length; i += 4)
      if (source.images["far-shoe"]![i + 3])
        source.images["far-shoe"]!.set([60, 80, 90, 255], i);
    for (const pitch of [-0.4, 0, 0.18, 0.45]) {
      for (const lift of [0, 7]) {
        const motions = createMotionLibraryV2();
        motions.clips.run.keys[0] = {
          ...motions.clips.run.keys[0],
          footX: 20,
          footLift: lift,
          shoePitch: pitch,
          lean: 0,
        };
        motions.clips.run.keys[6] = {
          ...motions.clips.run.keys[6],
          footX: -35,
          footLift: 30,
        };
        const prepared = prepareRig(createRigDefinition(), source, motions);
        const pixels = prepared.frame("run", 0);
        const near = prepared
          .inspect("run", 0)
          .limbs.find((l) => l.id === "nearLeg")!.bones[2];
        const shoePixels: Point[] = [],
          markers: Point[] = [];
        for (let p = 0; p < 192 * 256; p++) {
          if (!pixels[p * 4 + 3]) continue;
          if (pixels[p * 4] === 20 || pixels[p * 4] === 230)
            shoePixels.push([p % 192, Math.floor(p / 192)]);
          if (pixels[p * 4] === 230)
            markers.push([p % 192, Math.floor(p / 192)]);
        }
        expect(Math.max(...shoePixels.map((p) => p[1]))).toBe(239 - lift);
        expect(Math.min(...markers.map((p) => distance(p, near)))).toBeLessThan(
          1,
        );
        expect(near[1]).not.toBeNaN();
      }
    }
  });

  it("rotates shoulders, torso and head together above stable hips, with connected inspector bones", () => {
    const base = createMotionLibraryV2();
    base.clips.run.keys[0].torsoLean = 0;
    const edited = structuredClone(base);
    edited.clips.run.keys[0].torsoLean = 0.1;
    const before = engine(base).inspect("run", 0),
      after = engine(edited).inspect("run", 0);
    for (const id of ["nearLeg", "farLeg"])
      expect(after.limbs.find((l) => l.id === id)!.bones).toEqual(
        before.limbs.find((l) => l.id === id)!.bones,
      );
    for (const id of ["nearArm", "farArm"]) {
      const a = before.limbs.find((l) => l.id === id)!.bones,
        b = after.limbs.find((l) => l.id === id)!.bones;
      expect(b[0]).not.toEqual(a[0]);
      expect(distance(b[0], b[1])).toBeCloseTo(distance(a[0], a[1]), 8);
      expect(distance(b[1], b[2])).toBeCloseTo(distance(a[1], a[2]), 8);
    }
    const bones = after.bodyBones!;
    expect(bones.find((b) => b.id === "root")!.to).toEqual(
      bones.find((b) => b.id === "torso")!.from,
    );
    expect(bones.find((b) => b.id === "torso")!.to).toEqual(
      bones.find((b) => b.id === "head")!.from,
    );
  });

  it("keeps historical defaults and every non-run frame unchanged and deterministic", () => {
    const old = createMotionLibrary(),
      next = createMotionLibraryV2();
    expect(old.version).toBe(1);
    for (const action of ["idle", "walk", "jump"] as const) {
      expect(next.clips[action]).toEqual(old.clips[action]);
      const a = engine(old),
        b = engine(next);
      for (let i = 0; i < old.clips[action]!.keys.length; i++)
        expect(
          Buffer.compare(
            Buffer.from(b.frame(action, i)),
            Buffer.from(a.frame(action, i)),
          ),
        ).toBe(0);
    }
    const prepared = engine(next);
    for (let i = 0; i < 12; i++) {
      const pixels = prepared.frame("run", i);
      expect(
        Buffer.compare(
          Buffer.from(pixels),
          Buffer.from(prepared.frame("run", i)),
        ),
      ).toBe(0);
      expect(pixels.some((v, p) => p % 4 === 3 && v === 255)).toBe(true);
      for (let y = 0; y < 256; y++) {
        expect(pixels[y * 192 * 4 + 3]).toBe(0);
        expect(pixels[(y * 192 + 191) * 4 + 3]).toBe(0);
      }
      expect(pixels.slice(0, 192 * 4).every((v) => v === 0)).toBe(true);
      expect(pixels.slice(255 * 192 * 4).every((v) => v === 0)).toBe(true);
    }
  });

  it("roundtrips opt-in data and exposes only compatible controls", () => {
    const project = createAuthoringProject();
    project.motions = createMotionLibraryV2();
    project.motions.clips.run = setMotionField(
      project.motions.clips.run,
      0,
      "torsoLean",
      0.09,
    );
    const reopened = validateProject(project);
    expect(reopened.motions).toEqual(project.motions);
    expect(reopened.motions.version).toBe(2);
    expect(motionFields("run", 2)).toContain("torsoLean");
    for (const action of ["idle", "walk", "jump"] as const)
      expect(motionFields(action, 2)).not.toContain("torsoLean");
    expect(motionFields("run", 1)).not.toContain("torsoLean");
    expect(createMotionLibrary().version).toBe(1);
  });

  it("rejects future versions and misplaced, nonfinite or out-of-range v2 fields", () => {
    const reject = (
      edit: (p: ReturnType<typeof createAuthoringProject>) => void,
    ) => {
      const project = createAuthoringProject();
      project.motions = createMotionLibraryV2();
      edit(project);
      return () => validateProject(project);
    };
    expect(
      reject((p) => {
        p.motions.version = 3 as MotionLibrary["version"];
      }),
    ).toThrow(/motions.version/);
    expect(
      reject((p) => {
        p.motions.version = 1;
      }),
    ).toThrow(/unsupported fields/);
    for (const action of ["idle", "walk", "jump"] as const)
      expect(
        reject((p) => {
          p.motions.clips[action]!.keys[0].torsoLean = 0;
        }),
      ).toThrow(/unsupported fields/);
    for (const value of [NaN, Infinity, -0.121, 0.121])
      expect(
        reject((p) => {
          p.motions.clips.run.keys[0].torsoLean = value;
        }),
      ).toThrow(/torsoLean/);
    for (const field of ["rootY", "armBend"] as const)
      expect(
        reject((p) => {
          p.motions.clips.run.keys[0][field] = 0;
        }),
      ).toThrow(/unsupported fields/);
    expect(
      reject((p) => {
        (
          p.motions.clips.run.keys[0] as MotionKey & { elbowFlex: number }
        ).elbowFlex = 0.1;
      }),
    ).toThrow(/unsupported fields/);
  });
});
