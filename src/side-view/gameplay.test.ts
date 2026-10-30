import { describe, expect, it } from "vitest";
import specifications from "../core/gameplay-motion-profiles.json";
import {
  gameplayManifest,
  gameplayTransitionWait,
  type GameplayMotion,
} from "../core/gameplay-motion";
import type { BakedCharacterPackManifest } from "../core/types";
import { sideFrameId, type SideMotionOptions } from "./motion";
import {
  advanceSidePlayback,
  createSideGameplayState,
  requestSidePlayback,
  sideGameplayState,
  type SideGameplayState,
} from "./gameplay";

const options: SideMotionOptions = {
  mode: "travel",
  walkSpeed: 120,
  runSpeed: 240,
  bounds: { min: -10000, max: 10000 },
};

for (const character of ["male", "female"] as const) {
  const specification = specifications.find(
    (entry) =>
      entry.profile.view === "side" && entry.profile.characterId === character,
  )!;
  const profile = specification.profile as GameplayMotion;
  const manifest = {
    animations: specification.sourceActions,
    frames: [
      ...new Set(
        Object.values(specification.sourceActions).flatMap(
          (clip) => clip.frames,
        ),
      ),
    ].map((id) => ({ id })),
  } as BakedCharacterPackManifest;
  const effective = gameplayManifest(manifest, profile);

  describe(`${character} stage gameplay integration`, () => {
    it("keeps travel continuous through run, one jump, and the matched run return", () => {
      let state = requestSidePlayback(
        createSideGameplayState(),
        "run",
        effective,
        profile,
      );
      state = advanceSidePlayback(state, 175, effective, options, profile);
      state = requestSidePlayback(state, "jump", effective, profile);
      const fromX = state.worldX;
      const jumpFrames: number[] = [];
      for (let tick = 0; tick < 120; tick++) {
        if (state.action === "jump")
          jumpFrames.push(sideFrameId(state, effective));
        state = advanceSidePlayback(
          state,
          1000 / 24,
          effective,
          options,
          profile,
        );
      }
      expect([...new Set(jumpFrames)]).toEqual(profile.actions.jump.frames);
      expect(state.action).toBe("run");
      expect(state.worldX - fromX).toBeCloseTo(240 * 5);
      expect(state.returnAction).toBe("run");
    });

    it("queues released movement until full landing and cannot repeat jump on held input", () => {
      let state = requestSidePlayback(
        createSideGameplayState(),
        "run",
        effective,
        profile,
      );
      state = requestSidePlayback(state, "jump", effective, profile);
      const wait = gameplayTransitionWait(profile, sideGameplayState(state))!;
      state = advanceSidePlayback(
        state,
        wait + 200,
        effective,
        options,
        profile,
      );
      expect(state.action).toBe("jump");
      state = requestSidePlayback(state, "idle", effective, profile);
      const pending = structuredClone(state);
      for (let n = 0; n < 10; n++)
        state = requestSidePlayback(state, "jump", effective, profile);
      expect(state).toEqual(pending);
      state = advanceSidePlayback(state, 3000, effective, options, profile);
      expect(state.action).toBe("idle");
      const landedX = state.worldX;
      state = advanceSidePlayback(state, 1000, effective, options, profile);
      expect(state.worldX).toBe(landedX);
      expect(state.pending).toBeNull();
    });

    it("preserves paused inspection and stage direction without adding vertical motion", () => {
      let state: SideGameplayState = {
        ...createSideGameplayState(),
        facing: "left" as const,
        worldX: 500,
      };
      state = requestSidePlayback(state, "walk", effective, profile);
      state = advanceSidePlayback(state, 500, effective, options, profile);
      expect(state.worldX).toBeCloseTo(440);
      state = { ...state, paused: true };
      expect(
        advanceSidePlayback(state, 5000, effective, options, profile),
      ).toEqual(state);
      expect(state.facing).toBe("left");
    });

    it("keeps the optional full-source two-jump inspection behavior", () => {
      let state = requestSidePlayback(
        createSideGameplayState(),
        "jump",
        manifest,
        null,
      );
      state = advanceSidePlayback(state, 5000, manifest, options, null);
      expect(state.action).toBe("jump");
      expect(manifest.animations.jump!.frames).toHaveLength(50);
      expect(sideFrameId(state, manifest)).toBe(
        manifest.animations.jump!.frames.at(-1),
      );
      expect(state.worldX).toBe(0);
    });
  });
}
