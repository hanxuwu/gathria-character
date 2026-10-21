import { describe, expect, it } from "vitest";
import type {
  CharacterPackV2Manifest,
  JsonValue,
  PortableAnimationName,
} from "../core/types";
import {
  advanceMotionFlow,
  readMotionFlow,
  requestMotionAction,
  type MotionFlow,
  type MotionState,
} from "./motion-flow";

function fixture() {
  const actions: MotionFlow["actions"] = {
    idle: { frames: [0, 0, 1, 1], fps: 10, loop: true },
    walk: { frames: [2, 2, 3, 3], fps: 10, loop: true },
    run: { frames: [4, 5, 6, 7], fps: 10, loop: true },
    jump: { frames: [8, 9, 10, 11, 12, 13], fps: 10, loop: false },
    celebrate: { frames: [14, 15, 16, 17], fps: 10, loop: true },
  };
  const names = Object.keys(actions) as PortableAnimationName[];
  const profile: MotionFlow = {
    format: "gathria-motion-flow",
    version: 1,
    characterId: "male",
    actions,
    routes: names.flatMap((from) =>
      names
        .filter((to) => to !== from)
        .map((to) => ({
          from,
          to,
          exit: actions[from].frames.length,
          entry: 0,
        })),
    ),
    returnToIdle: ["jump"],
  };
  profile.routes.push({ from: "walk", to: "run", exit: 2, entry: 1 });
  const manifest = {
    animations: structuredClone(actions),
  } as CharacterPackV2Manifest;
  const config = {
    sourceMetadata: { motionFlow: profile as unknown as JsonValue },
  };
  return { profile, manifest, config };
}
const state = (
  action: PortableAnimationName,
  elapsedMs: number,
  pending: PortableAnimationName | null = null,
): MotionState => ({ action, elapsedMs, pending });

describe("validated source-pose motion flow", () => {
  it("accepts the complete reviewed contract, preserving independent clip snapshots", () => {
    const { profile, manifest, config } = fixture();
    const parsed = readMotionFlow(manifest, config)!;
    expect(parsed).toEqual(profile);
    parsed.actions.walk.frames[0] = 99;
    expect(manifest.animations.walk.frames[0]).toBe(2);
    expect(readMotionFlow(manifest)).toBeNull();
  });

  it.each(["frames", "fps", "loop"] as const)(
    "disables stale routes after editing %s",
    (field) => {
      const { manifest, config } = fixture();
      if (field === "frames") manifest.animations.walk.frames[0] = 8;
      if (field === "fps") manifest.animations.walk.fps = 12;
      if (field === "loop") manifest.animations.walk.loop = false;
      expect(readMotionFlow(manifest, config)).toBeNull();
    },
  );

  it("rejects incomplete routes, cuts inside holds, ambiguous exits and truncated jumps", () => {
    for (const corrupt of [
      (p: MotionFlow) => {
        p.routes = p.routes.filter(
          (r) => !(r.from === "idle" && r.to === "run"),
        );
      },
      (p: MotionFlow) => {
        p.routes[0].exit = 1;
      },
      (p: MotionFlow) => {
        p.routes[0].entry = 1;
      },
      (p: MotionFlow) => {
        p.routes.push({ ...p.routes[0] });
      },
      (p: MotionFlow) => {
        p.routes.find((r) => r.from === "jump")!.exit = 5;
      },
      (p: MotionFlow) => {
        p.routes.find((r) => r.to === "jump")!.entry = 1;
      },
    ]) {
      const { profile, manifest, config } = fixture();
      corrupt(profile);
      expect(readMotionFlow(manifest, config)).toBeNull();
    }
  });

  it("waits through the complete hold, enters the reviewed target phase and consumes overshoot", () => {
    const { profile } = fixture();
    const requested = requestMotionAction(state("walk", 100), "run");
    expect(advanceMotionFlow(profile, requested, 99)).toEqual(
      state("walk", 199, "run"),
    );
    expect(advanceMotionFlow(profile, requested, 150)).toEqual(
      state("run", 150),
    );
    expect(requested).toEqual(state("walk", 100, "run"));
  });

  it("chooses the next upcoming boundary rather than the first listed route", () => {
    const { profile } = fixture();
    expect(advanceMotionFlow(profile, state("walk", 350, "run"), 100)).toEqual(
      state("run", 50),
    );
    expect(advanceMotionFlow(profile, state("walk", 450, "run"), 150)).toEqual(
      state("run", 100),
    );
    expect(advanceMotionFlow(profile, state("walk", 200, "run"), 0)).toEqual(
      state("run", 100),
    );
  });

  it("uses the latest request and lets the current action cancel waiting", () => {
    const first = requestMotionAction(state("walk", 100), "run");
    expect(requestMotionAction(first, "celebrate")).toEqual(
      state("walk", 100, "celebrate"),
    );
    expect(requestMotionAction(first, "walk")).toEqual(state("walk", 100));
  });

  it("finishes all airborne, landing and recovery frames before a pending jump exit", () => {
    const { profile } = fixture();
    const requested = state("jump", 200, "run");
    expect(advanceMotionFlow(profile, requested, 399)).toEqual(
      state("jump", 599, "run"),
    );
    expect(advanceMotionFlow(profile, requested, 450)).toEqual(
      state("run", 50),
    );
    expect(advanceMotionFlow(profile, state("jump", 200), 475)).toEqual(
      state("idle", 75),
    );
  });

  it("handles a large delta through a requested full jump and automatic idle return", () => {
    const { profile } = fixture();
    expect(advanceMotionFlow(profile, state("walk", 0, "jump"), 2000)).toEqual(
      state("idle", 200),
    );
  });

  it("is independent of RAF chunk size and honors already scaled playback time", () => {
    const { profile } = fixture();
    const start = state("walk", 100, "run");
    const whole = advanceMotionFlow(profile, start, 180);
    const chunks = advanceMotionFlow(
      profile,
      advanceMotionFlow(profile, start, 65),
      115,
    );
    expect(chunks).toEqual(whole);
    expect(advanceMotionFlow(profile, start, 90 * 2)).toEqual(whole);
    expect(advanceMotionFlow(profile, start, 0)).toEqual(start);
    expect(() => advanceMotionFlow(profile, start, Infinity)).toThrow();
  });
});
