import { describe, expect, it } from "vitest";
import legacySpecifications from "./gameplay-motion-legacy-profiles.json";
import {
  advanceGameplayMotion,
  createGameplayState,
  gameplayFrameId,
  gameplayFramePosition,
  gameplayManifest,
  gameplayMotionMetadata,
  gameplayTransitionWait,
  readGameplayMotion,
  requestGameplayAction,
  resolveGameplayMotion,
  type GameplayMotion,
  type GameplaySegment,
} from "./gameplay-motion";
import type { PortableCharacterPackManifest } from "./types";

const TICK = 1000 / 24;

describe("historical V4 source-drawn running approaches", () => {
  for (const character of ["male", "female"] as const) {
    const specification = legacySpecifications.find(
      (row) => row.profile.id === `kling-${character}-side-single-jump-v4`,
    )!;
    const profile = specification.profile as GameplayMotion;
    const old = legacySpecifications.find(
      (row) => row.profile.id === `kling-${character}-side-single-jump-v3`,
    )!.profile as GameplayMotion;
    const approaches =
      character === "male"
        ? [
            { exit: 4, frames: [60, 61, 62] },
            { exit: 10, frames: [59, 60, 61, 62] },
            { exit: 16, frames: [62] },
          ]
        : [
            { exit: 1, frames: [55, 56, 57] },
            { exit: 7, frames: [54, 55, 56, 57] },
            { exit: 13, frames: [57] },
          ];
    const firstJump = character === "male" ? 63 : 58;
    const manifest = {
      animations: specification.sourceActions,
      frames: [
        ...new Set(
          Object.values(specification.sourceActions).flatMap(
            (clip) => clip.frames,
          ),
        ),
      ].map((id) => ({ id })),
    } as PortableCharacterPackManifest;

    it(`${character}: preserves standalone actions and landing routes while retaining exact V3 compatibility`, () => {
      const normalized = structuredClone(profile);
      normalized.id = old.id;
      normalized.routes = old.routes;
      expect(normalized).toEqual(old);
      const otherRoutes = (p: GameplayMotion) =>
        p.routes.filter((r) => !(r.from === "run" && r.to === "jump"));
      expect(otherRoutes(profile)).toEqual(otherRoutes(old));
      expect(
        profile.routes
          .filter((r) => r.leadIn)
          .map((r) => ({ exit: r.exit, frames: r.leadIn })),
      ).toEqual(approaches);
      const effective = gameplayManifest(manifest, profile);
      expect(effective.animations).toEqual(old.actions);
      expect(
        readGameplayMotion(effective, {
          sourceMetadata: { gameplayMotion: gameplayMotionMetadata(profile) },
        }),
      ).toEqual(profile);
      expect(
        readGameplayMotion(gameplayManifest(manifest, old), {
          sourceMetadata: { gameplayMotion: gameplayMotionMetadata(old) },
        }),
      ).toEqual(old);
      for (const { exit } of old.routes.filter(
        (r) => r.from === "run" && r.to === "jump",
      )) {
        const requested = requestGameplayAction(
          { ...createGameplayState("run"), elapsedMs: exit * TICK },
          "jump",
          old,
        );
        const started = advanceGameplayMotion(old, requested, 0);
        expect(started.leadIn).toBeUndefined();
        expect(gameplayFrameId(old, started)).toBe(firstJump);
      }
    });

    it(`${character}: refuses absent or edited approach art without invalidating the historical profile`, () => {
      const missing = {
        ...manifest,
        frames: manifest.frames.filter(
          (row) => row.id !== approaches[0].frames[0],
        ),
      } as PortableCharacterPackManifest;
      expect(resolveGameplayMotion(missing, profile.sourceSha256)).toBeNull();
      expect(() => gameplayManifest(missing, profile)).toThrow(
        /does not match/,
      );
      expect(
        readGameplayMotion(
          { ...missing, animations: profile.actions },
          {
            sourceMetadata: { gameplayMotion: gameplayMotionMetadata(profile) },
          },
        ),
      ).toBeNull();
      // Previous packs do not need native cells that their motion never uses.
      expect(
        readGameplayMotion(gameplayManifest(missing, old), {
          sourceMetadata: { gameplayMotion: gameplayMotionMetadata(old) },
        }),
      ).toEqual(old);
      const edited = structuredClone(profile);
      edited.routes.find((r) => r.leadIn)!.leadIn![0]++;
      expect(() => gameplayMotionMetadata(edited)).toThrow(/Unreviewed/);
    });

    for (const { exit, frames } of approaches) {
      it(`${character} exit ${exit}: plays every approach drawing for a complete native tick before full anticipation`, () => {
        const queued = requestGameplayAction(
          { ...createGameplayState("run"), elapsedMs: (exit - 0.5) * TICK },
          "jump",
          profile,
        );
        const inputCopy = structuredClone(queued);
        const started = advanceGameplayMotion(profile, queued, TICK / 2);
        expect(started.action).toBe("jump");
        expect(started.leadIn).toEqual({ from: "run", exit, elapsedMs: 0 });
        expect(gameplayTransitionWait(profile, started)).toBeCloseTo(
          (frames.length + 27) * TICK,
          7,
        );
        for (let position = 0; position < frames.length; position++) {
          for (const fraction of [0, 0.001, 0.5, 0.999]) {
            const state = advanceGameplayMotion(
              profile,
              started,
              (position + fraction) * TICK,
            );
            expect(gameplayFrameId(profile, state)).toBe(frames[position]);
            expect(gameplayFramePosition(profile, state)).toBe(0);
            expect(state.elapsedMs).toBe(0);
            expect(requestGameplayAction(state, "jump", profile)).toEqual(
              state,
            );
          }
        }
        const main = advanceGameplayMotion(
          profile,
          started,
          frames.length * TICK,
        );
        expect(main.leadIn).toBeUndefined();
        expect(main.elapsedMs).toBeCloseTo(0, 8);
        expect(gameplayFrameId(profile, main)).toBe(firstJump);
        const fraction = advanceGameplayMotion(
          profile,
          started,
          (frames.length + 0.5) * TICK,
        );
        expect(fraction.elapsedMs).toBeCloseTo(TICK / 2, 8);
        expect(gameplayFrameId(profile, fraction)).toBe(firstJump);
        expect(queued).toEqual(inputCopy);
      });

      it(`${character} exit ${exit}: carries suspended time, buffered intent and travel through one complete jump`, () => {
        const queued = requestGameplayAction(
          { ...createGameplayState("run"), elapsedMs: (exit - 0.5) * TICK },
          "jump",
          profile,
        );
        const segments: GameplaySegment[] = [];
        const final = advanceGameplayMotion(profile, queued, 4000, (part) =>
          segments.push(part),
        );
        expect(final.action).toBe("run");
        expect(final.leadIn).toBeUndefined();
        expect(
          segments.reduce((sum, part) => sum + part.durationMs, 0),
        ).toBeCloseTo(4000, 7);
        const jumpParts = segments.filter((part) => part.action === "jump");
        expect(jumpParts).toHaveLength(2);
        expect(jumpParts.every((part) => part.jumpFrom === "run")).toBe(true);
        expect(
          jumpParts.reduce((sum, part) => sum + part.durationMs, 0),
        ).toBeCloseTo((frames.length + 27) * TICK, 7);
        let chunked = queued;
        for (const delta of [17, 31, 50, 100, 1700, 2102])
          chunked = advanceGameplayMotion(profile, chunked, delta);
        expect(chunked.action).toBe(final.action);
        expect(chunked.elapsedMs).toBeCloseTo(final.elapsedMs, 7);

        const preparing = advanceGameplayMotion(profile, queued, TICK);
        const paused = advanceGameplayMotion(profile, preparing, 0);
        expect(paused).toEqual(preparing);
        const walk = requestGameplayAction(paused, "walk", profile);
        const idle = requestGameplayAction(walk, "idle", profile);
        expect(idle.pending).toBe("idle");
        expect(idle.leadIn).toEqual(preparing.leadIn);
        expect(requestGameplayAction(idle, "jump", profile)).toEqual(idle);
        const wait = (frames.length - 0.5 + 28) * TICK;
        expect(gameplayTransitionWait(profile, idle)).toBeCloseTo(wait, 7);
        expect(advanceGameplayMotion(profile, idle, wait - 0.001).action).toBe(
          "jump",
        );
        expect(advanceGameplayMotion(profile, idle, wait).action).toBe("idle");
        expect(advanceGameplayMotion(profile, idle, wait + 5000).action).toBe(
          "idle",
        );
      });
    }

    it(`${character}: keeps idle and walking jumps free of a running approach`, () => {
      for (const action of ["idle", "walk"] as const) {
        const queued = requestGameplayAction(
          createGameplayState(action),
          "jump",
          profile,
        );
        const state = advanceGameplayMotion(
          profile,
          queued,
          action === "idle" ? 0 : gameplayTransitionWait(profile, queued)!,
        );
        expect(state.action).toBe("jump");
        expect(state.leadIn).toBeUndefined();
        expect(gameplayFrameId(profile, state)).toBe(firstJump);
      }
    });

    it(`${character}: accepts requests throughout the cycle within six ticks without dropping approach poses`, () => {
      for (let tick = 0; tick < 18; tick++) {
        for (const fraction of [0, 0.001, 0.5, 0.999]) {
          const time = (tick + fraction) * TICK;
          const expected = approaches
            .map((approach) => ({
              ...approach,
              wait:
                (approach.exit * TICK >= time
                  ? approach.exit * TICK
                  : (approach.exit + 18) * TICK) - time,
            }))
            .sort((a, b) => a.wait - b.wait)[0];
          const queued = requestGameplayAction(
            { ...createGameplayState("run"), elapsedMs: time },
            "jump",
            profile,
          );
          expect(gameplayTransitionWait(profile, queued)).toBeCloseTo(
            expected.wait,
            6,
          );
          expect(expected.wait).toBeLessThanOrEqual(6 * TICK + 1e-6);
          expect(
            expected.wait + expected.frames.length * TICK,
          ).toBeLessThanOrEqual(10 * TICK + 1e-6);
          const started = advanceGameplayMotion(profile, queued, expected.wait);
          expect(started.leadIn?.exit).toBe(expected.exit);
          expect(gameplayFrameId(profile, started)).toBe(expected.frames[0]);
          const main = advanceGameplayMotion(
            profile,
            started,
            expected.frames.length * TICK,
          );
          expect(main.leadIn).toBeUndefined();
          expect(gameplayFrameId(profile, main)).toBe(firstJump);
        }
      }
    });

    it(`${character}: rejects malformed or inconsistent approach checkpoints`, () => {
      const queued = requestGameplayAction(
        { ...createGameplayState("run"), elapsedMs: approaches[0].exit * TICK },
        "jump",
        profile,
      );
      const state = advanceGameplayMotion(profile, queued, 0);
      for (const elapsedMs of [
        -1,
        NaN,
        Infinity,
        approaches[0].frames.length * TICK,
      ])
        expect(() =>
          gameplayFrameId(profile, {
            ...state,
            leadIn: { ...state.leadIn!, elapsedMs },
          }),
        ).toThrow(/approach/);
      expect(() =>
        gameplayFrameId(profile, { ...state, elapsedMs: TICK }),
      ).toThrow(/approach/);
      expect(() =>
        gameplayFrameId(profile, { ...state, jumpFrom: "walk" }),
      ).toThrow(/approach/);
      expect(() =>
        gameplayFrameId(profile, {
          ...state,
          leadIn: { ...state.leadIn!, exit: 2 },
        }),
      ).toThrow(/approach/);
      expect(() =>
        gameplayFrameId(profile, {
          ...state,
          leadIn: { ...state.leadIn!, extra: true } as typeof state.leadIn,
        }),
      ).toThrow(/approach/);
    });
  }
});
