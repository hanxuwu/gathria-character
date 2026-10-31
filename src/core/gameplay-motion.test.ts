import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import legacySpecifications from "./gameplay-motion-legacy-profiles.json";
import type {
  BakedCharacterRecipe,
  PortableCharacterPackManifest,
} from "./types";
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

const TICK = 1000 / 24;
function source(character: "male" | "female", view: "original" | "side") {
  const path =
    view === "original"
      ? `docs/kling-motion/exports/${character}.character.zip`
      : `docs/kling-side-workspace/assets/${character}.source.zip`;
  const bytes = readFileSync(path);
  const files = unzipSync(bytes, {
    filter: (file) => file.name.endsWith(".json"),
  });
  const manifest = JSON.parse(
    new TextDecoder().decode(files["manifest.json"]),
  ) as PortableCharacterPackManifest;
  const config = JSON.parse(
    new TextDecoder().decode(files["character.json"]),
  ) as BakedCharacterRecipe;
  const hash = createHash("sha256").update(bytes).digest("hex");
  const profile = resolveGameplayMotion(manifest, hash)!;
  return { manifest, config, hash, profile };
}
const sources = ["original", "side"].flatMap((view) =>
  ["male", "female"].map((character) => ({
    view: view as "original" | "side",
    character: character as "male" | "female",
  })),
);
const side = source("male", "side");

describe("source-bound single-jump gameplay profiles", () => {
  it.each(sources)(
    "derives $character $view without changing source artwork, timing, or archive bindings",
    ({ character, view }) => {
      const { manifest, hash, profile } = source(character, view);
      expect(profile).not.toBeNull();
      expect(profile.sourceSha256).toBe(hash);
      expect(profile.characterId).toBe(character);
      expect(profile.view).toBe(view);
      const before = structuredClone(manifest);
      const effective = gameplayManifest(manifest, profile);
      expect(manifest).toEqual(before);
      expect(effective.frames).toBe(manifest.frames);
      expect(effective.anchor).toBe(manifest.anchor);
      expect(effective.spritesheet).toBe(manifest.spritesheet);
      expect(effective.animations.jump!.fps).toBe(24);
      expect(effective.animations.jump!.loop).toBe(false);
      expect(effective.animations.jump!.frames).toHaveLength(
        view === "side" ? 28 : 39,
      );
      if (view === "side") {
        expect(manifest.animations.jump!.frames).toHaveLength(50);
        expect(effective.animations.jump!.frames[0]).toBe(
          character === "male" ? 63 : 58,
        );
        expect(effective.animations.jump!.frames.at(-1)).toBe(
          character === "male" ? 90 : 85,
        );
      } else
        expect(effective.animations.jump).toEqual(manifest.animations.jump);
      for (const action of ["idle", "walk", "run", "celebrate"] as const)
        expect(effective.animations[action]).toEqual(
          manifest.animations[action],
        );
      effective.animations.jump!.frames[0] = -1;
      expect(profile.actions.jump.frames[0]).toBeGreaterThan(0);
      expect(manifest).toEqual(before);
    },
  );

  it.each(sources)(
    "has complete, unambiguous full-pose routes for $character $view",
    ({ character, view }) => {
      const { profile } = source(character, view);
      const names = Object.keys(profile.actions);
      const pairs = new Set<string>();
      const exits = new Set<string>();
      for (const route of profile.routes) {
        const from = profile.actions[route.from]!,
          to = profile.actions[route.to]!;
        expect(route.from).not.toBe(route.to);
        expect(route.exit).toBeGreaterThan(0);
        expect(route.exit).toBeLessThanOrEqual(from.frames.length);
        expect(route.entry).toBeGreaterThanOrEqual(0);
        expect(route.entry).toBeLessThan(to.frames.length);
        if (route.exit < from.frames.length)
          expect(from.frames[route.exit - 1]).not.toBe(from.frames[route.exit]);
        if (route.entry > 0)
          expect(to.frames[route.entry - 1]).not.toBe(to.frames[route.entry]);
        if (route.from === "jump") {
          // Independent pose review: compression is complete before native112
          // (original), 89 (male side), or 84 (female side). Run can leave here;
          // all other destinations keep the complete original recovery.
          const movingExit = view === "original" ? 30 : 27;
          if (route.to === "run")
            expect([movingExit, from.frames.length]).toContain(route.exit);
          else expect(route.exit).toBe(from.frames.length);
        }
        if (route.to === "jump") expect(route.entry).toBe(0);
        pairs.add(`${route.from}:${route.to}`);
        const key = `${route.from}:${route.to}:${route.exit}`;
        expect(exits.has(key)).toBe(false);
        exits.add(key);
      }
      expect(pairs.size).toBe(names.length * (names.length - 1));
    },
  );

  it("accepts exported metadata only with the exact reviewed effective clips", () => {
    const { manifest, profile } = side;
    const effective = gameplayManifest(manifest, profile);
    const config = {
      sourceMetadata: { gameplayMotion: gameplayMotionMetadata(profile) },
    };
    expect(readGameplayMotion(effective, config)).toEqual(profile);
    expect(readGameplayMotion(manifest, config)).toBeNull();
    expect(readGameplayMotion(effective)).toBeNull();
    for (const mutate of [
      (p: GameplayMotion) => {
        p.sourceSha256 = "a".repeat(64);
      },
      (p: GameplayMotion) => {
        p.id += "-edited";
      },
      (p: GameplayMotion) => {
        p.routes[0].entry++;
      },
      (p: GameplayMotion) => {
        p.actions.jump.frames.pop();
      },
    ]) {
      const metadata = structuredClone(profile);
      mutate(metadata);
      expect(
        readGameplayMotion(effective, {
          sourceMetadata: { gameplayMotion: metadata as never },
        }),
      ).toBeNull();
    }
    const changed = structuredClone(effective);
    changed.animations.run!.fps = 30;
    expect(readGameplayMotion(changed, config)).toBeNull();
  });

  it("refuses cross-source, missing-cell and retimed source profiles", () => {
    const { manifest, hash, profile } = side;
    expect(resolveGameplayMotion(manifest, "0".repeat(64))).toBeNull();
    expect(
      resolveGameplayMotion(manifest, source("female", "side").hash),
    ).toBeNull();
    const missing = {
      ...manifest,
      frames: manifest.frames.filter((f) => f.id !== 70),
    } as PortableCharacterPackManifest;
    expect(resolveGameplayMotion(missing, hash)).toBeNull();
    const edited = structuredClone(manifest);
    edited.animations.walk.fps = 12;
    expect(resolveGameplayMotion(edited, hash)).toBeNull();
    expect(() => gameplayManifest(edited, profile)).toThrow(/does not match/);
    expect(() => gameplayMotionMetadata({ ...profile, id: "unknown" })).toThrow(
      /Unreviewed/,
    );
  });
});

describe("single jump and continuous source-pose transitions", () => {
  const profile = side.profile;
  it("responds from idle immediately and ignores repeat presses during the jump", () => {
    const jumping = requestGameplayAction(
      createGameplayState(),
      "jump",
      profile,
    );
    expect(jumping.action).toBe("jump");
    expect(gameplayFrameId(profile, jumping)).toBe(63);
    const airborne = advanceGameplayMotion(profile, jumping, 9 * TICK);
    const resumeRun = requestGameplayAction(airborne, "run", profile);
    expect(requestGameplayAction(resumeRun, "jump", profile)).toEqual(
      resumeRun,
    );
    expect(gameplayFramePosition(profile, resumeRun)).toBe(9);
  });

  it("preserves a queued jump when locomotion intent changes before its reviewed seam", () => {
    let state = { ...createGameplayState("run"), elapsedMs: 20 };
    state = requestGameplayAction(state, "jump", profile);
    state = requestGameplayAction(state, "walk", profile);
    expect(state.pending).toBe("jump");
    expect(state.returnAction).toBe("walk");
    expect(requestGameplayAction(state, "jump", profile)).toEqual(state);
    const seam = gameplayTransitionWait(profile, state)!;
    const jumping = advanceGameplayMotion(profile, state, seam);
    expect(jumping.action).toBe("jump");
    expect(jumping.elapsedMs).toBe(0);
    expect(jumping.jumpFrom).toBe("run");
    expect(jumping.returnAction).toBe("walk");
  });

  it("finishes landing before returning to running without the rebound-preparation tail", () => {
    const requested = requestGameplayAction(
      { ...createGameplayState("run"), elapsedMs: 20 },
      "jump",
      profile,
    );
    const jumping = advanceGameplayMotion(
      profile,
      requested,
      gameplayTransitionWait(profile, requested)!,
    );
    // Three contextual approach poses precede the unchanged single jump.
    const beforeLanding = advanceGameplayMotion(profile, jumping, 29 * TICK);
    expect(beforeLanding.action).toBe("jump");
    expect(gameplayFrameId(profile, beforeLanding)).toBe(89);
    const resumed = advanceGameplayMotion(profile, beforeLanding, TICK + 7);
    const route = profile.routes.find(
      (r) => r.from === "jump" && r.to === "run",
    )!;
    expect(resumed.action).toBe("run");
    expect(resumed.elapsedMs).toBeCloseTo(route.entry * TICK + 7, 6);
    expect(resumed.pending).toBeNull();
    expect(advanceGameplayMotion(profile, resumed, 20_000).action).toBe("run");
  });

  it("honors the latest movement request while airborne without cutting the landing", () => {
    let state = requestGameplayAction(
      createGameplayState("run"),
      "jump",
      profile,
    );
    state = advanceGameplayMotion(
      profile,
      state,
      gameplayTransitionWait(profile, state)! + 7 * TICK,
    );
    state = requestGameplayAction(state, "walk", profile);
    state = requestGameplayAction(state, "idle", profile);
    expect(state.pending).toBe("idle");
    const almost = advanceGameplayMotion(profile, state, 24 * TICK - 1);
    expect(almost.action).toBe("jump");
    expect(advanceGameplayMotion(profile, almost, 1).action).toBe("idle");
  });

  it("carries large elapsed deltas and travel segments through exactly one jump", () => {
    const start = requestGameplayAction(
      { ...createGameplayState("run"), elapsedMs: 20 },
      "jump",
      profile,
    );
    const segments: GameplaySegment[] = [];
    const final = advanceGameplayMotion(profile, start, 4000, (s) =>
      segments.push(s),
    );
    expect(final.action).toBe("run");
    expect(segments.map((s) => s.action)).toEqual([
      "run",
      "jump",
      "jump",
      "run",
    ]);
    expect(segments.reduce((sum, s) => sum + s.durationMs, 0)).toBeCloseTo(
      4000,
      8,
    );
    expect(segments[1].durationMs).toBeCloseTo(3 * TICK, 8);
    expect(segments[2].durationMs).toBeCloseTo(27 * TICK, 8);
    expect(segments[1].jumpFrom).toBe("run");
    let chunked = start;
    for (const delta of [17, 100, 31, 1700, 16, 2136])
      chunked = advanceGameplayMotion(profile, chunked, delta);
    expect(chunked.action).toBe(final.action);
    expect(chunked.elapsedMs).toBeCloseTo(final.elapsedMs, 7);
  });

  it("preserves original takeoff timing and celebration, and skips standing settle only for running", () => {
    const original = source("female", "original").profile;
    const state = requestGameplayAction(
      { ...createGameplayState("run"), elapsedMs: 4 * TICK },
      "jump",
      original,
    );
    expect(gameplayTransitionWait(original, state)).toBeCloseTo(TICK, 7);
    const jumping = advanceGameplayMotion(original, state, TICK);
    const resumed = advanceGameplayMotion(original, jumping, 30 * TICK);
    expect(resumed.action).toBe("run");
    expect(resumed.elapsedMs).toBeCloseTo(4 * TICK, 7);
    expect(
      requestGameplayAction(createGameplayState(), "celebrate", original)
        .action,
    ).toBe("celebrate");
    expect(() =>
      requestGameplayAction(createGameplayState(), "celebrate", profile),
    ).toThrow(/unavailable/);
  });

  it("rejects invalid times and does not mutate caller state", () => {
    const state = createGameplayState("run");
    expect(() => advanceGameplayMotion(profile, state, -1)).toThrow();
    expect(() => advanceGameplayMotion(profile, state, Infinity)).toThrow();
    expect(() =>
      advanceGameplayMotion(profile, { ...state, elapsedMs: NaN }, 1),
    ).toThrow();
    const before = structuredClone(state);
    const queued = requestGameplayAction(state, "jump", profile);
    advanceGameplayMotion(profile, queued, 3000);
    expect(state).toEqual(before);
  });

  it("wraps fractional source ticks at the exact cycle boundary without a last-frame duplicate", () => {
    let state = createGameplayState("run");
    for (let i = 0; i < profile.actions.run.frames.length; i++)
      state = advanceGameplayMotion(profile, state, TICK);
    expect(state.elapsedMs).toBe(0);
    expect(gameplayFramePosition(profile, state)).toBe(0);
    const rounded = { ...state, elapsedMs: 750 - 1e-10 };
    expect(gameplayFramePosition(profile, rounded)).toBe(0);
  });
});

describe("target-specific grounded landing exits", () => {
  it.each(sources)(
    "keeps $character $view standing recovery for idle and late run requests",
    ({ character, view }) => {
      const { profile } = source(character, view);
      const early = view === "original" ? 30 : 27;
      const full = view === "original" ? 39 : 28;
      const idleJump = createGameplayState("jump");
      const settling = advanceGameplayMotion(
        profile,
        idleJump,
        (full - 1) * TICK,
      );
      expect(settling.action).toBe("jump");
      expect(advanceGameplayMotion(profile, settling, TICK).action).toBe(
        "idle",
      );

      // Request after the early seam has passed: wait for its own final recovery
      // pose. Selecting a past route here would snap back down to the wrong gait.
      const late = advanceGameplayMotion(
        profile,
        idleJump,
        (early + 0.5) * TICK,
      );
      const requested = requestGameplayAction(late, "run", profile);
      expect(gameplayTransitionWait(profile, requested)).toBeCloseTo(
        (full - early - 0.5) * TICK,
        6,
      );
      expect(advanceGameplayMotion(profile, requested, 0).action).toBe("jump");
      const resumed = advanceGameplayMotion(
        profile,
        requested,
        (full - early - 0.5) * TICK,
      );
      expect(resumed.action).toBe("run");
      expect(gameplayFrameId(profile, resumed)).toBe(
        view === "original" ? 55 : character === "male" ? 50 : 42,
      );

      const runningJump = {
        ...idleJump,
        returnAction: "run" as const,
        jumpFrom: "run" as const,
      };
      const contact = advanceGameplayMotion(
        profile,
        runningJump,
        (early - 1) * TICK,
      );
      expect(contact.action).toBe("jump");
      expect(gameplayFrameId(profile, contact)).toBe(
        view === "original" ? 112 : character === "male" ? 89 : 84,
      );
      const moving = advanceGameplayMotion(profile, contact, TICK);
      expect(moving.action).toBe("run");
      expect(gameplayFrameId(profile, moving)).toBe(
        view === "original" || character === "male" ? 55 : 47,
      );
    },
  );

  it.each(sources)(
    "still reads $character $view previously exported V1 metadata without retiming it",
    ({ character, view }) => {
      const { manifest, profile } = source(character, view);
      const old = legacySpecifications.find(
        (row) =>
          row.profile.characterId === character && row.profile.view === view,
      )!.profile as GameplayMotion;
      expect(profile.id).toMatch(view === "side" ? /-v4$/ : /-v2$/);
      const archived = readGameplayMotion(gameplayManifest(manifest, old), {
        sourceMetadata: { gameplayMotion: gameplayMotionMetadata(old) },
      });
      expect(archived).toEqual(old);
      const state = {
        ...createGameplayState("jump"),
        returnAction: "run" as const,
      };
      const full = old.actions.jump.frames.length;
      const last = advanceGameplayMotion(archived!, state, (full - 1) * TICK);
      expect(last.action).toBe("jump");
      expect(gameplayFrameId(old, last)).toBe(old.actions.jump.frames.at(-1));
      expect(advanceGameplayMotion(old, last, TICK).action).toBe("run");
    },
  );
});
