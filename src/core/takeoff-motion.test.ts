import { describe, expect, it } from "vitest";
import currentSpecifications from "./gameplay-motion-profiles.json";
import legacySpecifications from "./gameplay-motion-legacy-profiles.json";
import {
  advanceGameplayMotion,
  createGameplayState,
  gameplayFrameId,
  gameplayManifest,
  gameplayMotionMetadata,
  gameplayTransitionWait,
  readGameplayMotion,
  requestGameplayAction,
  type GameplayMotion,
} from "./gameplay-motion";
import type { PortableCharacterPackManifest } from "./types";

const TICK = 1000 / 24;

describe("reviewed side takeoff response windows", () => {
  for (const character of ["male", "female"] as const) {
    const current = currentSpecifications.find(
      (item) =>
        item.profile.characterId === character && item.profile.view === "side",
    )!;
    const profile = current.profile as GameplayMotion;
    const previous = legacySpecifications.find(
      (item) => item.profile.id === `kling-${character}-side-single-jump-v2`,
    )!;
    const old = previous.profile as GameplayMotion;
    const extraExit = character === "male" ? 9 : 6;
    const oldExit = character === "male" ? 16 : 13;
    const firstJump = character === "male" ? 63 : 58;

    it(`${character}: changes only the reviewed extra takeoff route, not artwork or landing`, () => {
      expect(profile.id).toBe(`kling-${character}-side-single-jump-v3`);
      const normalized = structuredClone(profile);
      normalized.id = old.id;
      normalized.routes = normalized.routes.filter(
        (route) =>
          !(
            route.from === "run" &&
            route.to === "jump" &&
            route.exit === extraExit
          ),
      );
      expect(normalized).toEqual(old);
      expect(current.sourceActions).toEqual(previous.sourceActions);
      expect(profile.actions.jump.frames).toEqual(
        Array.from({ length: 28 }, (_, index) => firstJump + index),
      );
    });

    it(`${character}: requests throughout the cycle wait at most eleven ticks and retain full anticipation`, () => {
      // Examine both whole drawings and requests just past a seam. This catches
      // waiting an extra lap, wrapping to the wrong exit, and discarded delta.
      for (let tick = 0; tick < 18; tick++) {
        for (const fraction of [0, 0.001, 0.5, 0.999]) {
          const elapsedMs = (tick + fraction) * TICK;
          const request = requestGameplayAction(
            { ...createGameplayState("run"), elapsedMs },
            "jump",
            profile,
          );
          const expected = Math.min(
            ...[extraExit, oldExit].map((exit) =>
              exit * TICK >= elapsedMs
                ? exit * TICK - elapsedMs
                : (exit + 18) * TICK - elapsedMs,
            ),
          );
          const wait = gameplayTransitionWait(profile, request)!;
          expect(wait).toBeCloseTo(expected, 6);
          expect(wait).toBeLessThanOrEqual(11 * TICK + 1e-6);
          if (wait > 1e-4)
            expect(
              advanceGameplayMotion(profile, request, wait - 1e-4).action,
            ).toBe("run");
          const started = advanceGameplayMotion(profile, request, wait);
          expect(started.action).toBe("jump");
          expect(started.elapsedMs).toBeCloseTo(0, 6);
          expect(gameplayFrameId(profile, started)).toBe(firstJump);
          expect(requestGameplayAction(started, "jump", profile)).toEqual(
            started,
          );
          expect(
            advanceGameplayMotion(profile, request, wait + 3 * TICK).elapsedMs,
          ).toBeCloseTo(3 * TICK, 6);
        }
      }
      const afterLastSeam = requestGameplayAction(
        { ...createGameplayState("run"), elapsedMs: oldExit * TICK + 0.001 },
        "jump",
        profile,
      );
      expect(gameplayTransitionWait(profile, afterLastSeam)).toBeCloseTo(
        11 * TICK - 0.001,
        6,
      );
    });

    it(`${character}: historical V2 imports retain their single takeoff window`, () => {
      const manifest = {
        animations: current.sourceActions,
        frames: [
          ...new Set(
            Object.values(current.sourceActions).flatMap((clip) => clip.frames),
          ),
        ].map((id) => ({ id })),
      } as PortableCharacterPackManifest;
      const archived = readGameplayMotion(gameplayManifest(manifest, old), {
        sourceMetadata: { gameplayMotion: gameplayMotionMetadata(old) },
      });
      expect(archived).toEqual(old);
      const requested = requestGameplayAction(
        { ...createGameplayState("run"), elapsedMs: oldExit * TICK + 0.001 },
        "jump",
        archived!,
      );
      expect(gameplayTransitionWait(archived!, requested)).toBeCloseTo(
        18 * TICK - 0.001,
        6,
      );
    });
  }
});
