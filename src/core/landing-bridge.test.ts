import { describe, expect, it } from "vitest";
import currentSpecifications from "./gameplay-motion-profiles.json";
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
  type GameplayMotion,
  type GameplaySegment,
  type GameplayState,
} from "./gameplay-motion";
import type { PortableCharacterPackManifest } from "./types";

const TICK = 1000 / 24;

describe("V6 forward source-drawn running recovery", () => {
  for (const character of ["male", "female"] as const) {
    const specification = currentSpecifications.find(
      (row) => row.profile.id === `kling-${character}-side-single-jump-v6`,
    )!;
    const profile = specification.profile as GameplayMotion;
    const old = legacySpecifications.find(
      (row) => row.profile.id === `kling-${character}-side-single-jump-v5`,
    )!.profile as GameplayMotion;
    const recovery = character === "male" ? [88, 89] : [83, 84];
    const entry = character === "male" ? 10 : 7;
    const lastLandingFrame = character === "male" ? 85 : 80;
    const entryFrame = character === "male" ? 49 : 41;
    const jumping = {
      ...createGameplayState("jump"),
      returnAction: "run" as const,
      jumpFrom: "run" as const,
    };
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

    it(`${character}: changes only moving recovery and retains historical V5 imports without endorsing their artwork`, () => {
      const normalized = structuredClone(profile);
      normalized.id = old.id;
      normalized.routes = normalized.routes.map((route) =>
        route.from === "jump" && route.to === "run" && route.exit === 23
          ? old.routes.find(
              (r) => r.from === "jump" && r.to === "run" && r.exit === 23,
            )!
          : route,
      );
      expect(normalized).toEqual(old);
      expect(profile.actions.jump.frames).toHaveLength(28);
      const imported = readGameplayMotion(gameplayManifest(manifest, old), {
        sourceMetadata: { gameplayMotion: gameplayMotionMetadata(old) },
      });
      expect(imported).toEqual(old);
      const oldContact = advanceGameplayMotion(old, jumping, 22 * TICK);
      expect(gameplayFrameId(old, oldContact)).toBe(lastLandingFrame);
      const oldRecovery = advanceGameplayMotion(old, oldContact, TICK);
      expect(gameplayFrameId(old, oldRecovery)).toBe(
        character === "male" ? 63 : 58,
      );
      expect(
        gameplayFrameId(old, advanceGameplayMotion(old, oldRecovery, TICK)),
      ).toBe(character === "male" ? 62 : 57);
      const oldRun = advanceGameplayMotion(old, oldRecovery, 2 * TICK);
      expect(oldRun.leadIn).toBeUndefined();
      expect(gameplayFrameId(old, oldRun)).toBe(character === "male" ? 53 : 45);
    });

    it(`${character}: keeps landing drawings in source order at native cadence before entering the narrow running stride`, () => {
      const ids: number[] = [];
      let state = jumping as GameplayState;
      for (let tick = 0; tick < 25; tick++) {
        ids.push(gameplayFrameId(profile, state));
        state = advanceGameplayMotion(profile, state, TICK);
      }
      const expected = [
        ...profile.actions.jump.frames.slice(0, 23),
        ...recovery,
      ];
      expect(ids).toEqual(expected);
      expect(ids.every((id, index) => index === 0 || id > ids[index - 1])).toBe(
        true,
      );
      expect(profile.actions.jump.fps).toBe(24);
      expect(profile.actions.run.fps).toBe(24);
      expect(state.leadIn).toBeUndefined();
      expect(gameplayFrameId(profile, state)).toBe(entryFrame);
    });

    it(`${character}: finishes contact, shows both recovery drawings, and carries fractional time into the run entry`, () => {
      const contact = advanceGameplayMotion(profile, jumping, 22 * TICK);
      expect(contact.action).toBe("jump");
      expect(gameplayFrameId(profile, contact)).toBe(lastLandingFrame);
      const started = advanceGameplayMotion(profile, contact, TICK);
      expect(started.action).toBe("run");
      expect(started.jumpFrom).toBeNull();
      expect(started.leadIn).toEqual({ from: "jump", exit: 23, elapsedMs: 0 });
      for (let index = 0; index < recovery.length; index++) {
        for (const fraction of [0, 0.001, 0.5, 0.999]) {
          const state = advanceGameplayMotion(
            profile,
            started,
            (index + fraction) * TICK,
          );
          expect(gameplayFrameId(profile, state)).toBe(recovery[index]);
          expect(gameplayFramePosition(profile, state)).toBe(entry);
          expect(state.elapsedMs).toBeCloseTo(entry * TICK, 7);
          expect(requestGameplayAction(state, "jump", profile)).toEqual(state);
          expect(advanceGameplayMotion(profile, state, 0)).toEqual(state);
        }
      }
      const running = advanceGameplayMotion(profile, started, 2 * TICK + 7);
      expect(running.leadIn).toBeUndefined();
      expect(running.elapsedMs).toBeCloseTo(entry * TICK + 7, 7);
      expect(gameplayFrameId(profile, running)).toBe(entryFrame);
      expect(requestGameplayAction(running, "jump", profile).pending).toBe(
        "jump",
      );
    });

    it(`${character}: buffers idle/walk during recovery without losing their request to repeated Jump`, () => {
      const started = advanceGameplayMotion(profile, jumping, 23.5 * TICK);
      for (const target of ["idle", "walk"] as const) {
        const requested = requestGameplayAction(started, target, profile);
        expect(requested.pending).toBe(target);
        expect(requested.leadIn).toEqual(started.leadIn);
        expect(requestGameplayAction(requested, "jump", profile)).toEqual(
          requested,
        );
        const route = profile.routes.find(
          (r) => r.from === "run" && r.to === target,
        )!;
        const wait = (1.5 + route.exit - entry) * TICK;
        expect(gameplayTransitionWait(profile, requested)).toBeCloseTo(wait, 7);
        const running = advanceGameplayMotion(profile, requested, 1.5 * TICK);
        expect(running.leadIn).toBeUndefined();
        expect(running.pending).toBe(target);
        expect(gameplayFrameId(profile, running)).toBe(entryFrame);
        const completed = advanceGameplayMotion(profile, requested, wait);
        expect(completed.action).toBe(target);
        expect(completed.pending).toBeNull();
        expect(completed.leadIn).toBeUndefined();
      }
      const idle = requestGameplayAction(started, "idle", profile);
      const walk = requestGameplayAction(idle, "walk", profile);
      expect(walk.pending).toBe("walk");
      const cancelled = requestGameplayAction(walk, "run", profile);
      expect(cancelled.pending).toBeNull();
      expect(cancelled.leadIn).toEqual(started.leadIn);
    });

    it(`${character}: keeps the full standing recovery when idle or walk is requested before the moving exit`, () => {
      const contact = advanceGameplayMotion(profile, jumping, 22 * TICK);
      for (const target of ["idle", "walk"] as const) {
        const requested = requestGameplayAction(contact, target, profile);
        const last = advanceGameplayMotion(profile, requested, 5 * TICK);
        expect(last.action).toBe("jump");
        expect(last.leadIn).toBeUndefined();
        expect(gameplayFrameId(profile, last)).toBe(
          profile.actions.jump.frames.at(-1),
        );
        const completed = advanceGameplayMotion(profile, last, TICK);
        expect(completed.action).toBe(target);
        expect(completed.leadIn).toBeUndefined();
      }
    });

    it(`${character}: preserves large-vs-chunked clocks and travel through recovery without inventing a second jump`, () => {
      const before = { ...jumping, elapsedMs: 22.5 * TICK };
      const segments: GameplaySegment[] = [];
      const final = advanceGameplayMotion(profile, before, 5000, (part) =>
        segments.push(part),
      );
      expect(segments.map((part) => part.action)).toEqual([
        "jump",
        "run",
        "run",
      ]);
      expect(segments[0].durationMs).toBeCloseTo(0.5 * TICK, 7);
      expect(segments[1].durationMs).toBeCloseTo(2 * TICK, 7);
      expect(segments[0].jumpFrom).toBe("run");
      expect(segments[1].jumpFrom).toBeNull();
      expect(
        segments.reduce((total, part) => total + part.durationMs, 0),
      ).toBeCloseTo(5000, 7);
      let chunked: GameplayState = before;
      for (const delta of [5, 15, 33, 100, 846, 4001])
        chunked = advanceGameplayMotion(profile, chunked, delta);
      expect(chunked.action).toBe(final.action);
      expect(chunked.elapsedMs).toBeCloseTo(final.elapsedMs, 7);
      expect(final.action).toBe("run");
      expect(final.leadIn).toBeUndefined();
      expect(final.pending).toBeNull();
    });

    it(`${character}: rejects changed recovery art and inconsistent recovery checkpoints`, () => {
      const state = advanceGameplayMotion(profile, jumping, 23 * TICK);
      for (const elapsedMs of [-1, NaN, Infinity, 2 * TICK])
        expect(() =>
          gameplayFrameId(profile, {
            ...state,
            leadIn: { ...state.leadIn!, elapsedMs },
          }),
        ).toThrow(/approach/);
      expect(() =>
        gameplayFrameId(profile, { ...state, jumpFrom: "run" }),
      ).toThrow(/approach/);
      expect(() =>
        gameplayFrameId(profile, { ...state, pending: "jump" }),
      ).toThrow(/approach/);
      expect(() =>
        gameplayFrameId(profile, {
          ...state,
          elapsedMs: state.elapsedMs + TICK,
        }),
      ).toThrow(/approach/);
      const modified = structuredClone(profile);
      modified.routes
        .find((r) => r.from === "jump" && r.leadIn)!
        .leadIn!.reverse();
      expect(() => gameplayMotionMetadata(modified)).toThrow(/Unreviewed/);
    });
  }
});
