import { describe, expect, it } from "vitest";
import type { BakedCharacterPackManifest } from "../core/types";
import {
  advanceSideMotion,
  createSideMotionState,
  requestSideAction,
  sideActionEnded,
  sideFrameId,
  sideMotionFeedback,
  type SideAction,
  type SideMotionOptions,
  type SideMotionState,
} from "./motion";

const FRAME_MS = 1000 / 24;
const JUMP_MS = 50 * FRAME_MS;

function fixture(): BakedCharacterPackManifest {
  // Frame IDs deliberately differ from their atlas-array indices.
  const frames = Array.from({ length: 107 }, (_, index) => ({
    id: 1000 + index * 7,
    x: 0,
    y: 0,
    width: 512,
    height: 768,
  }));
  const clip = (start: number, length: number, loop = true) => ({
    frames: frames.slice(start, start + length).map((frame) => frame.id),
    fps: 24,
    loop,
  });
  return {
    frames,
    animations: {
      idle: clip(0, 21),
      walk: clip(21, 18),
      run: clip(39, 18),
      jump: clip(57, 50, false),
    },
  } as BakedCharacterPackManifest;
}

const options: SideMotionOptions = {
  mode: "travel",
  walkSpeed: 120,
  runSpeed: 240,
  bounds: { min: -10000, max: 10000 },
};
const state = (action: SideAction, elapsedMs = 0): SideMotionState => ({
  ...createSideMotionState(),
  action,
  elapsedMs,
});

describe("side-view source timing and requests", () => {
  it("selects exact manifest frame IDs without interpolation, including repeated frame steps", () => {
    const manifest = fixture();
    let playing = state("walk");
    const ids = manifest.animations.walk.frames;
    expect(
      sideFrameId({ ...playing, elapsedMs: FRAME_MS - 0.001 }, manifest),
    ).toBe(ids[0]);
    expect(sideFrameId({ ...playing, elapsedMs: FRAME_MS }, manifest)).toBe(
      ids[1],
    );
    for (let frame = 0; frame < 18 * 20; frame++) {
      expect(sideFrameId(playing, manifest)).toBe(ids[frame % 18]);
      playing = advanceSideMotion(playing, FRAME_MS, manifest, options);
    }
    expect(sideActionEnded(playing, manifest)).toBe(false);
  });

  it("keeps the entire original two-jump clip, then holds its last pose without returning to idle", () => {
    const manifest = fixture();
    let playing = requestSideAction(createSideMotionState(), "jump", manifest);
    const ids = manifest.animations.jump!.frames;
    for (let frame = 0; frame < 50; frame++) {
      expect(sideFrameId(playing, manifest)).toBe(ids[frame]);
      expect(sideActionEnded(playing, manifest)).toBe(false);
      playing = advanceSideMotion(playing, FRAME_MS, manifest, options);
    }
    expect(sideActionEnded(playing, manifest)).toBe(true);
    playing = advanceSideMotion(playing, 60000, manifest, options);
    expect(playing.action).toBe("jump");
    expect(playing.elapsedMs).toBeCloseTo(JUMP_MS);
    expect(sideFrameId(playing, manifest)).toBe(ids[49]);
    expect(playing.worldX).toBe(0);
  });

  it("does not interrupt a jump for idle or restart on repeated jump input", () => {
    const manifest = fixture();
    const airborne = state("jump", 23 * FRAME_MS);
    expect(requestSideAction(airborne, "jump", manifest)).toEqual(airborne);
    const stopping = requestSideAction(airborne, "idle", manifest);
    expect(stopping.action).toBe("jump");
    expect(stopping.pending).toBe("idle");
    const justBeforeEnd = advanceSideMotion(
      stopping,
      JUMP_MS - airborne.elapsedMs - 0.01,
      manifest,
      options,
    );
    expect(justBeforeEnd.action).toBe("jump");
    expect(sideActionEnded(justBeforeEnd, manifest)).toBe(false);
    const exited = advanceSideMotion(
      stopping,
      JUMP_MS - airborne.elapsedMs + 25,
      manifest,
      options,
    );
    expect(exited.action).toBe("idle");
    expect(exited.elapsedMs).toBeCloseTo(25);
    const replay = requestSideAction(state("jump", JUMP_MS), "jump", manifest);
    expect(replay).toEqual(state("jump"));
    expect(sideActionEnded(replay, manifest)).toBe(false);
  });

  it("queues walk/run changes at the complete cycle seam and preserves overshoot and direction", () => {
    const manifest = fixture();
    const original = {
      ...state("walk", 700),
      worldX: 80,
      facing: "left" as const,
    };
    const requested = requestSideAction(original, "run", manifest);
    expect(requested.action).toBe("walk");
    expect(requested.pending).toBe("run");
    expect(advanceSideMotion(requested, 49, manifest, options).action).toBe(
      "walk",
    );
    const next = advanceSideMotion(requested, 100, manifest, options);
    expect(next.action).toBe("run");
    expect(next.elapsedMs).toBeCloseTo(50);
    expect(next.worldX).toBeCloseTo(62); // 50 ms walk + 50 ms run, both leftward.
    expect(next.facing).toBe("left");
    expect(next.pending).toBeNull();
    expect(original.elapsedMs).toBe(700);
    expect(requestSideAction(state("walk"), "run", manifest).action).toBe(
      "run",
    );
  });

  it("makes idle entry and exit immediate, replaces pending actions, and cancels a pending request", () => {
    const manifest = fixture();
    const walking = { ...state("walk", 300), worldX: 91 };
    const running = requestSideAction(walking, "run", manifest);
    expect(requestSideAction(running, "jump", manifest).pending).toBe("jump");
    expect(requestSideAction(running, "walk", manifest)).toEqual(walking);
    const idle = requestSideAction(running, "idle", manifest);
    expect(idle).toEqual({ ...state("idle"), worldX: 91 });
    expect(requestSideAction(idle, "walk", manifest)).toEqual({
      ...state("walk"),
      worldX: 91,
    });
  });

  it("honors manifest timing and length instead of assuming an atlas offset or synthetic jump tail", () => {
    const manifest = fixture();
    manifest.animations.jump!.frames = manifest.animations.jump!.frames.slice(
      0,
      31,
    );
    manifest.animations.jump!.fps = 12;
    const duration = 31000 / 12;
    const playing = advanceSideMotion(
      state("jump"),
      duration,
      manifest,
      options,
    );
    expect(sideActionEnded(playing, manifest)).toBe(true);
    expect(sideFrameId(playing, manifest)).toBe(
      manifest.animations.jump!.frames[30],
    );
  });

  it("freezes both pending requests and travel while paused", () => {
    const manifest = fixture();
    const paused = {
      ...state("walk", 700),
      pending: "jump" as const,
      paused: true,
    };
    expect(advanceSideMotion(paused, 5000, manifest, options)).toEqual(paused);
  });
});

describe("side-view transition feedback", () => {
  it("reports the queued cycle boundary and consumes exactly that wait", () => {
    const manifest = fixture();
    const queued = requestSideAction(state("walk", 700), "run", manifest);
    const feedback = sideMotionFeedback(queued, manifest);
    expect(feedback).toEqual({
      phase: "cycle",
      frameIndex: 16,
      frameCount: 18,
      durationMs: 750,
      remainingMs: 50,
      paused: false,
      transition: { action: "run", boundary: "cycle-end", remainingMs: 50 },
    });
    const before = advanceSideMotion(queued, 49.99, manifest, options);
    expect(
      sideMotionFeedback(before, manifest).transition?.remainingMs,
    ).toBeCloseTo(0.01);
    const entered = advanceSideMotion(
      queued,
      feedback.transition!.remainingMs,
      manifest,
      options,
    );
    expect(entered.action).toBe("run");
    expect(sideMotionFeedback(entered, manifest).frameIndex).toBe(0);
    expect(sideMotionFeedback(entered, manifest).transition).toBeNull();
  });

  it("distinguishes displaying the last jump frame from completing its full hold", () => {
    const manifest = fixture();
    const lastFrame = state("jump", 49 * FRAME_MS);
    const feedback = sideMotionFeedback(lastFrame, manifest);
    expect(feedback.phase).toBe("one-shot");
    expect(feedback.frameIndex).toBe(49);
    expect(feedback.remainingMs).toBeCloseTo(FRAME_MS);
    expect(feedback.transition).toBeNull();
    const ended = advanceSideMotion(lastFrame, FRAME_MS, manifest, options);
    expect(sideMotionFeedback(ended, manifest)).toMatchObject({
      phase: "endpoint-hold",
      frameIndex: 49,
      remainingMs: 0,
      transition: null,
    });
    expect(sideFrameId(lastFrame, manifest)).toBe(sideFrameId(ended, manifest));
    expect(
      sideMotionFeedback(
        advanceSideMotion(ended, 60000, manifest, options),
        manifest,
      ),
    ).toEqual(sideMotionFeedback(ended, manifest));
  });

  it.each(["idle", "walk", "run"] as const)(
    "keeps the complete final jump frame before a queued %s exit",
    (action) => {
      const manifest = fixture();
      const queued = requestSideAction(
        state("jump", 49 * FRAME_MS),
        action,
        manifest,
      );
      const feedback = sideMotionFeedback(queued, manifest);
      expect(feedback.transition?.action).toBe(action);
      expect(feedback.transition?.boundary).toBe("clip-end");
      expect(feedback.transition?.remainingMs).toBeCloseTo(FRAME_MS);
      expect(
        advanceSideMotion(queued, FRAME_MS - 0.001, manifest, options).action,
      ).toBe("jump");
      const entered = advanceSideMotion(
        queued,
        FRAME_MS + 7,
        manifest,
        options,
      );
      expect(entered.action).toBe(action);
      expect(entered.elapsedMs).toBeCloseTo(7);
      expect(sideMotionFeedback(entered, manifest).phase).toBe("cycle");
    },
  );

  it("reflects replacement, cancellation and pause without consuming a request", () => {
    const manifest = fixture();
    const original = { ...state("walk", 200), paused: true };
    const run = requestSideAction(original, "run", manifest);
    const jump = requestSideAction(run, "jump", manifest);
    const feedback = sideMotionFeedback(jump, manifest);
    expect(feedback.transition).toEqual({
      action: "jump",
      boundary: "cycle-end",
      remainingMs: 550,
    });
    expect(feedback.paused).toBe(true);
    expect(
      sideMotionFeedback(
        advanceSideMotion(jump, 5000, manifest, options),
        manifest,
      ),
    ).toEqual(feedback);
    const canceled = requestSideAction(jump, "walk", manifest);
    expect(canceled).toEqual(original);
    expect(sideMotionFeedback(canceled, manifest).transition).toBeNull();
    expect(run.pending).toBe("run");
    expect(jump.pending).toBe("jump");
  });

  it("describes immediate caller-supplied boundaries and suppresses same-action replays", () => {
    const manifest = fixture();
    for (const supplied of [
      { ...state("idle", 200), pending: "walk" as const },
      { ...state("walk", 200), pending: "idle" as const },
      { ...state("run"), pending: "jump" as const },
      { ...state("jump", JUMP_MS), pending: "walk" as const },
    ]) {
      expect(sideMotionFeedback(supplied, manifest).transition).toEqual({
        action: supplied.pending,
        boundary: "immediate",
        remainingMs: 0,
      });
      expect(advanceSideMotion(supplied, 0, manifest, options).action).toBe(
        supplied.pending,
      );
    }
    const replay = { ...state("jump", JUMP_MS), pending: "jump" as const };
    expect(sideMotionFeedback(replay, manifest).transition).toBeNull();
    expect(
      sideMotionFeedback(
        advanceSideMotion(replay, 10, manifest, options),
        manifest,
      ).phase,
    ).toBe("endpoint-hold");
  });

  it("derives feedback from manifest timing and keeps sparse frame IDs separate from positions", () => {
    const manifest = fixture();
    manifest.animations.jump!.frames = manifest.animations.jump!.frames.slice(
      0,
      31,
    );
    manifest.animations.jump!.fps = 12;
    const playing = state("jump", 2500);
    expect(sideMotionFeedback(playing, manifest)).toMatchObject({
      phase: "one-shot",
      frameIndex: 30,
      frameCount: 31,
      durationMs: 31000 / 12,
    });
    expect(sideMotionFeedback(playing, manifest).remainingMs).toBeCloseTo(
      1000 / 12,
    );
    expect(sideFrameId(playing, manifest)).toBe(
      manifest.animations.jump!.frames[30],
    );
    const before = structuredClone(manifest);
    sideMotionFeedback(playing, manifest);
    expect(manifest).toEqual(before);
    expect(playing).toEqual(state("jump", 2500));
  });
});

describe("side-view travel", () => {
  it.each(["walk", "run"] as const)(
    "carries %s travel through all jump frames and stops after the last pose",
    (action) => {
      const manifest = fixture();
      const speed = action === "walk" ? options.walkSpeed : options.runSpeed;
      const requested = requestSideAction(state(action, 740), "jump", manifest);
      const airborne = advanceSideMotion(requested, 1010, manifest, options);
      expect(airborne.action).toBe("jump");
      expect(airborne.jumpFrom).toBe(action);
      expect(airborne.elapsedMs).toBeCloseTo(1000);
      expect(airborne.worldX).toBeCloseTo(speed * 1.01);
      const ended = advanceSideMotion(airborne, 10000, manifest, options);
      expect(ended.worldX).toBeCloseTo(speed * ((10 + JUMP_MS) / 1000));
      expect(advanceSideMotion(ended, 1000, manifest, options).worldX).toBe(
        ended.worldX,
      );
      expect(requestSideAction(ended, "jump", manifest).jumpFrom).toBeNull();
    },
  );

  it("integrates queued jump exit at the old and new speeds without dropping remainder time", () => {
    const manifest = fixture();
    const jumping = {
      ...state("jump", JUMP_MS - 100),
      jumpFrom: "run" as const,
    };
    const requested = requestSideAction(jumping, "walk", manifest);
    const result = advanceSideMotion(requested, 250, manifest, options);
    expect(result.action).toBe("walk");
    expect(result.jumpFrom).toBeNull();
    expect(result.elapsedMs).toBeCloseTo(150);
    expect(result.worldX).toBeCloseTo(42); // 100 ms run momentum + 150 ms walk.
  });

  it("keeps idle, standing jumps and in-place playback at their existing world position", () => {
    const manifest = fixture();
    for (const action of ["idle", "jump"] as const) {
      expect(
        advanceSideMotion(
          { ...state(action), worldX: 25 },
          500,
          manifest,
          options,
        ).worldX,
      ).toBe(25);
    }
    const playing = {
      ...state("run", 100),
      worldX: 25,
      pending: "jump" as const,
    };
    const result = advanceSideMotion(playing, 1000, manifest, {
      ...options,
      mode: "in-place",
    });
    expect(result.action).toBe("jump");
    expect(result.elapsedMs).toBeCloseTo(350);
    expect(result.worldX).toBe(25);
    expect(
      advanceSideMotion(state("walk"), 1000, manifest, {
        ...options,
        walkSpeed: 0,
      }).worldX,
    ).toBe(0);
  });

  it("clamps in each direction without wrapping or reversing, and can leave either boundary", () => {
    const manifest = fixture();
    const bounded = { ...options, bounds: { min: -30, max: 30 } };
    for (const facing of ["left", "right"] as const) {
      const result = advanceSideMotion(
        { ...state("run"), facing },
        10000,
        manifest,
        bounded,
      );
      expect(result.worldX).toBe(facing === "right" ? 30 : -30);
      expect(result.facing).toBe(facing);
      expect(advanceSideMotion(result, 10000, manifest, bounded).worldX).toBe(
        result.worldX,
      );
      const reverse = advanceSideMotion(
        { ...result, facing: facing === "right" ? "left" : "right" },
        50,
        manifest,
        bounded,
      );
      expect(reverse.worldX).toBe(facing === "right" ? 18 : -18);
    }
  });

  it("is independent of RAF chunk size across transitions, full jumps and stage bounds", () => {
    const manifest = fixture();
    const cases = [
      { ...state("walk", 697), pending: "run" as const },
      { ...state("run", 697), pending: "jump" as const },
      {
        ...state("jump", 1700),
        pending: "walk" as const,
        jumpFrom: "run" as const,
      },
    ];
    for (const initial of cases) {
      const whole = advanceSideMotion(initial, 4317, manifest, options);
      const chunks = [7, 23, 0, 931, 1400, 1956].reduce<SideMotionState>(
        (next, delta) => advanceSideMotion(next, delta, manifest, options),
        initial,
      );
      expect(chunks.action).toBe(whole.action);
      expect(chunks.pending).toBe(whole.pending);
      expect(chunks.elapsedMs).toBeCloseTo(whole.elapsedMs);
      expect(chunks.worldX).toBeCloseTo(whole.worldX);
      expect(sideFrameId(chunks, manifest)).toBe(sideFrameId(whole, manifest));
    }
  });
});

describe("explicit side-view input errors", () => {
  it("rejects missing actions and malformed source clips rather than selecting substitutes", () => {
    const manifest = fixture();
    delete manifest.animations.run;
    expect(() => requestSideAction(state("idle"), "run", manifest)).toThrow(
      "run is unavailable",
    );
    expect(() => sideFrameId(state("run"), manifest)).toThrow(
      "run is unavailable",
    );
    for (const alter of [
      (m: BakedCharacterPackManifest) => {
        m.animations.jump!.loop = true;
      },
      (m: BakedCharacterPackManifest) => {
        m.animations.jump!.frames = [];
      },
      (m: BakedCharacterPackManifest) => {
        m.animations.jump!.fps = 0;
      },
      (m: BakedCharacterPackManifest) => {
        m.animations.jump!.fps = NaN;
      },
      (m: BakedCharacterPackManifest) => {
        m.animations.jump!.frames[0] = 999999;
      },
    ]) {
      const broken = fixture();
      alter(broken);
      expect(() => requestSideAction(state("idle"), "jump", broken)).toThrow(
        /jump/,
      );
    }
  });

  it.each([-1, NaN, Infinity, -Infinity])(
    "rejects invalid time and speeds (%s), even in-place or paused",
    (value) => {
      const manifest = fixture();
      expect(() =>
        advanceSideMotion(state("idle"), value, manifest, options),
      ).toThrow("time");
      for (const speed of ["walkSpeed", "runSpeed"] as const) {
        expect(() =>
          advanceSideMotion({ ...state("idle"), paused: true }, 0, manifest, {
            ...options,
            mode: "in-place",
            [speed]: value,
          }),
        ).toThrow("speeds");
      }
    },
  );

  it("rejects invalid bounds and motion state without mutation", () => {
    const manifest = fixture();
    const initial = state("walk", 300);
    const before = structuredClone(manifest);
    for (const bounds of [
      { min: 5, max: 4 },
      { min: NaN, max: 1 },
      { min: 0, max: Infinity },
    ]) {
      expect(() =>
        advanceSideMotion(initial, 10, manifest, { ...options, bounds }),
      ).toThrow("bounds");
    }
    expect(() => sideFrameId({ ...initial, elapsedMs: -1 }, manifest)).toThrow(
      "state",
    );
    expect(() =>
      requestSideAction({ ...initial, worldX: NaN }, "run", manifest),
    ).toThrow("state");
    expect(manifest).toEqual(before);
    expect(initial).toEqual(state("walk", 300));
  });
});
