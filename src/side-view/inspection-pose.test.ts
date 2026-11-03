import { describe, expect, it } from "vitest";
import specifications from "../core/gameplay-motion-profiles.json";
import type { GameplayMotion } from "../core/gameplay-motion";
import { sideInspectionPose } from "./inspection-pose";
import type { SideAction } from "./motion";

describe("native side-view inspection poses", () => {
  for (const character of ["male", "female"] as const) {
    const specification = specifications.find(
      (row) =>
        row.profile.view === "side" && row.profile.characterId === character,
    )!;
    const profile = specification.profile as GameplayMotion;
    const source = { animations: specification.sourceActions };
    const gameplay = { animations: profile.actions };

    it(`${character}: locates every takeoff and landing bridge drawing in its source action`, () => {
      for (const route of profile.routes) {
        for (const frame of route.leadIn ?? []) {
          const pose = sideInspectionPose(
            source,
            route.to as SideAction,
            frame,
          );
          expect(pose).toEqual({
            action: "jump",
            position: source.animations.jump.frames.indexOf(frame),
            fps: source.animations.jump.fps,
          });
          expect(source.animations[pose!.action]!.frames[pose!.position]).toBe(
            frame,
          );
        }
      }
    });

    it(`${character}: resolves a saved Run recovery note without jumping to the first Run frame`, () => {
      const route = profile.routes.find(
        (row) => row.from === "jump" && row.to === "run" && row.leadIn,
      )!;
      for (const frame of route.leadIn!) {
        expect(source.animations.run.frames).not.toContain(frame);
        const pose = sideInspectionPose(source, "run", frame)!;
        expect(pose.action).toBe("jump");
        expect(pose.position).toBeGreaterThan(0);
        expect(source.animations.jump.frames[pose.position]).toBe(frame);
      }
    });

    it(`${character}: keeps pre-takeoff drawings available through the full source instead of a base-clip fallback`, () => {
      const frame = profile.routes.find(
        (row) => row.from === "run" && row.to === "jump" && row.leadIn,
      )!.leadIn![0];
      expect(sideInspectionPose(gameplay, "jump", frame)).toBeNull();
      expect(sideInspectionPose(source, "jump", frame)?.action).toBe("jump");
    });
  }

  it("preserves the selected action when a drawing is intentionally shared", () => {
    const manifest = {
      animations: {
        idle: { frames: [7], fps: 12, loop: true },
        walk: { frames: [8, 7], fps: 24, loop: true },
      },
    };
    expect(sideInspectionPose(manifest, "walk", 7)).toEqual({
      action: "walk",
      position: 1,
      fps: 24,
    });
    expect(sideInspectionPose(manifest, "idle", 7)).toEqual({
      action: "idle",
      position: 0,
      fps: 12,
    });
    for (const frame of [-1, 7.5, NaN, 999])
      expect(sideInspectionPose(manifest, "walk", frame)).toBeNull();
  });
});
