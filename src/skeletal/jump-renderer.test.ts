import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import { JUMP_PHASES } from "./definition";
import { prepareRig } from "./renderer";
import type { Point } from "./types";

const hash = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function bounds(pixels: Uint8ClampedArray) {
  const result = { left: 192, top: 256, right: -1, bottom: -1 };
  for (let p = 0; p < 192 * 256; p++) {
    const alpha = pixels[p * 4 + 3];
    if (alpha !== 0 && alpha !== 255)
      throw Error("Filtered alpha in pixel art");
    if (!alpha) continue;
    const x = p % 192,
      y = Math.floor(p / 192);
    result.left = Math.min(result.left, x);
    result.right = Math.max(result.right, x);
    result.top = Math.min(result.top, y);
    result.bottom = Math.max(result.bottom, y);
  }
  return result;
}

describe("shared one-shot skeletal jump", () => {
  for (const id of ["denim-daytrip", "coral-afternoon"] as const) {
    it(`${id}: preserves complete heads, neutral registration and transparent boundaries through all expressions`, () => {
      const p = createAuthoringProject(createBuiltinSkin(id));
      const engine = prepareRig(p.rig, p.skin, p.motions);
      const jump = p.motions.clips.jump!;
      expect(jump.loop).toBe(false);
      expect(jump.keys).toHaveLength(JUMP_PHASES.length);
      expect(jump.sequence).toEqual(Array.from({ length: 12 }, (_, i) => i));
      for (const expression of ["neutral", "gentle", "joyful"] as const) {
        const rest = engine.frame("idle", 0, expression);
        expect(hash(engine.frame("jump", 0, expression))).toBe(hash(rest));
        expect(hash(engine.frame("jump", 11, expression))).toBe(hash(rest));
        for (let frame = 0; frame < jump.keys.length; frame++) {
          const pixels = engine.frame("jump", frame, expression);
          const b = bounds(pixels);
          expect(b.left).toBeGreaterThan(0);
          expect(b.top).toBeGreaterThan(0);
          expect(b.right).toBeLessThan(191);
          expect(b.bottom).toBeLessThan(255);
          expect(hash(engine.frame("jump", frame, expression))).toBe(
            hash(pixels),
          );
        }
        // The in-frame head margin allows a small hop; both soles visibly leave
        // the fixed ground anchor while the complete haircut stays in frame.
        expect(bounds(engine.frame("jump", 5, expression)).bottom).toBe(225);
        expect(bounds(rest).bottom).toBe(239);
      }
    });

    it(`${id}: keeps feet planted during compression, then moves both complete legs and shoes together`, () => {
      const p = createAuthoringProject(createBuiltinSkin(id));
      const engine = prepareRig(p.rig, p.skin, p.motions);
      for (const frame of [0, 1, 2, 8, 9, 10, 11]) {
        expect(bounds(engine.frame("jump", frame)).bottom).toBe(239);
        for (const limb of engine
          .inspect("jump", frame)
          .limbs.filter((limb) => limb.id.endsWith("Leg"))) {
          const rest =
            p.skin.metadata.bindings.chains[limb.id as "nearLeg" | "farLeg"];
          expect(limb.bones[2]).toEqual(rest[2]);
        }
      }
      const apex = engine.inspect("jump", 5);
      for (const limb of apex.limbs.filter((limb) => limb.id.endsWith("Leg"))) {
        const rest =
          p.skin.metadata.bindings.chains[limb.id as "nearLeg" | "farLeg"];
        expect(limb.bones[0][1]).toBe(rest[0][1] - 4);
        expect(limb.bones[2][1]).toBe(rest[2][1] - 14);
        for (const segment of [0, 1])
          expect(
            distance(limb.bones[segment], limb.bones[segment + 1]),
          ).toBeCloseTo(distance(rest[segment], rest[segment + 1]), 5);
      }
      for (let frame = 0; frame < 12; frame++) {
        const inspected = engine.inspect("jump", frame);
        for (const limb of inspected.limbs) {
          expect(limb.vertices.flat().every(Number.isFinite)).toBe(true);
          const rest =
            p.skin.metadata.bindings.chains[
              limb.id as keyof typeof p.skin.metadata.bindings.chains
            ];
          for (const segment of [0, 1])
            expect(
              Math.abs(
                distance(limb.bones[segment], limb.bones[segment + 1]) -
                  distance(rest[segment], rest[segment + 1]),
              ),
            ).toBeLessThan(1.5);
        }
      }
      // The skeleton-only view uses the same moving torso/head targets as art.
      expect(apex.bodyBones?.find((b) => b.id === "head")?.from).toEqual([
        96, 114,
      ]);
      expect(apex.bodyBones?.find((b) => b.id === "root")?.from).toEqual([
        96, 240,
      ]);
      expect(engine.inspect("jump", 0).bodyBones).toEqual(
        engine.inspect("idle", 0).bodyBones,
      );
    });
  }
});
