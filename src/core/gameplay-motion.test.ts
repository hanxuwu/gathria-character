import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
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
        if (route.from === "jump") expect(route.exit).toBe(from.frames.length);
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

  it("plays all landing/recovery frames then returns to the previous run at its matched phase", () => {
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
    const beforeLanding = advanceGameplayMotion(profile, jumping, 27 * TICK);
    expect(beforeLanding.action).toBe("jump");
    expect(gameplayFrameId(profile, beforeLanding)).toBe(90);
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
      gameplayTransitionWait(profile, state)! + 4 * TICK,
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
    expect(segments.map((s) => s.action)).toEqual(["run", "jump", "run"]);
    expect(segments.reduce((sum, s) => sum + s.durationMs, 0)).toBeCloseTo(
      4000,
      8,
    );
    expect(segments[1].durationMs).toBeCloseTo(28 * TICK, 8);
    expect(segments[1].jumpFrom).toBe("run");
    let chunked = start;
    for (const delta of [17, 100, 31, 1700, 16, 2136])
      chunked = advanceGameplayMotion(profile, chunked, delta);
    expect(chunked.action).toBe(final.action);
    expect(chunked.elapsedMs).toBeCloseTo(final.elapsedMs, 7);
  });

  it("preserves the original view's reviewed route timing and optional celebration", () => {
    const original = source("female", "original").profile;
    const state = requestGameplayAction(
      { ...createGameplayState("run"), elapsedMs: 4 * TICK },
      "jump",
      original,
    );
    expect(gameplayTransitionWait(original, state)).toBeCloseTo(TICK, 7);
    const jumping = advanceGameplayMotion(original, state, TICK);
    const resumed = advanceGameplayMotion(original, jumping, 39 * TICK);
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
