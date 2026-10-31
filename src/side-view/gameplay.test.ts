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
  sidePlaybackFrameId,
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
      let approach: number[] = [];
      for (let tick = 0; tick < 120; tick++) {
        if (state.action === "jump") {
          jumpFrames.push(sidePlaybackFrameId(state, effective, profile));
          if (state.leadIn)
            approach = profile.routes.find(
              (route) =>
                route.from === state.leadIn!.from &&
                route.to === state.action &&
                route.exit === state.leadIn!.exit,
            )!.leadIn!;
        }
        state = advanceSidePlayback(
          state,
          1000 / 24,
          effective,
          options,
          profile,
        );
      }
      const landingExit = profile.routes.find(
        (r) => r.from === "jump" && r.to === "run",
      )!.exit;
      expect([...new Set(jumpFrames)]).toEqual([
        ...approach,
        ...profile.actions.jump.frames.slice(0, landingExit),
      ]);
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

    it("retains the native approach across pause and removes it at its exact end", () => {
      const route = profile.routes.find(
        (r) => r.from === "run" && r.to === "jump" && r.leadIn,
      )!;
      let state: SideGameplayState = {
        ...createSideGameplayState(),
        action: "run",
        returnAction: "run",
        elapsedMs: (route.exit * 1000) / profile.actions.run.fps,
        facing: "left",
        worldX: 500,
      };
      state = requestSidePlayback(state, "jump", effective, profile);
      state = advanceSidePlayback(state, 7, effective, options, profile);
      expect(state.leadIn?.elapsedMs).toBeCloseTo(7);
      expect(sidePlaybackFrameId(state, effective, profile)).toBe(
        route.leadIn![0],
      );
      const paused = { ...state, paused: true };
      expect(
        advanceSidePlayback(paused, 5000, effective, options, profile),
      ).toEqual(paused);
      const remaining =
        (route.leadIn!.length * 1000) / profile.actions.jump.fps - 7;
      state = advanceSidePlayback(
        state,
        remaining,
        effective,
        options,
        profile,
      );
      expect(state).not.toHaveProperty("leadIn");
      expect(sidePlaybackFrameId(state, effective, profile)).toBe(
        profile.actions.jump.frames[0],
      );
      expect(state.elapsedMs).toBeCloseTo(0);
      state = advanceSidePlayback(
        state,
        1000 / 24,
        effective,
        options,
        profile,
      );
      expect(sidePlaybackFrameId(state, effective, profile)).toBe(
        profile.actions.jump.frames[1],
      );
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
