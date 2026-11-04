import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import specifications from "../core/gameplay-motion-profiles.json";
import {
  gameplayManifest,
  gameplayMotionMetadata,
  gameplayTransitionWait,
  readGameplayMotion,
  resolveGameplayMotion,
  type GameplayMotion,
} from "../core/gameplay-motion";
import type {
  BakedCharacterPackManifest,
  BakedCharacterRecipe,
} from "../core/types";
import {
  advanceSidePlayback,
  createSideGameplayState,
  createSidePlaybackCheckpoint,
  requestSidePlayback,
  restoreSidePlaybackCheckpoint,
  sideGameplayState,
  sidePlaybackFrameId,
  type SideGameplayState,
} from "./gameplay";
import type { SideMotionOptions } from "./motion";
import type { WardrobeProject } from "../wardrobe/contract";
import {
  createWardrobeProject,
  exportWardrobeProject,
  importWardrobeProject,
  updateWardrobePreview,
} from "../wardrobe/project";

const ID = "kling-male-side-landing-candidate-v1";
const TICK = 1000 / 24;
const candidate = specifications.find((row) => row.profile.id === ID)!;
const previous = specifications.find(
  (row) => row.profile.id === "kling-male-side-single-jump-v7",
)!;
const profile = candidate.profile as GameplayMotion;
const config = { characterId: ID };
const manifest = {
  animations: candidate.sourceActions,
  frames: Array.from({ length: 109 }, (_, id) => ({ id })),
} as BakedCharacterPackManifest;
const effective = gameplayManifest(manifest, profile, config);
const options: SideMotionOptions = {
  mode: "travel",
  walkSpeed: 530,
  runSpeed: 700,
  bounds: { min: -1_000_000, max: 1_000_000 },
};
const advance = (state: SideGameplayState, delta: number) =>
  advanceSidePlayback(state, delta, effective, options, profile);
const request = (
  state: SideGameplayState,
  action: SideGameplayState["action"],
) => requestSidePlayback(state, action, effective, profile);
const frame = (state: SideGameplayState) =>
  sidePlaybackFrameId(state, effective, profile);

function takeoff() {
  return advance(
    request(
      {
        ...createSideGameplayState(),
        action: "run",
        returnAction: "run",
        elapsedMs: 4 * TICK,
      },
      "jump",
    ),
    0,
  );
}
function recovery(index: number, fraction = 0) {
  return advance(takeoff(), (3 + 23 + index) * TICK + fraction);
}

describe("independent male landing candidate source binding", () => {
  it("adds only two recovery drawings and keeps V7 and all basic clips intact", () => {
    const normalized = structuredClone(profile);
    normalized.id = previous.profile.id;
    normalized.sourceSha256 = previous.profile.sourceSha256;
    const landing = normalized.routes.find(
      (route) =>
        route.from === "jump" && route.to === "run" && route.exit === 23,
    )!;
    expect(landing).toEqual({
      from: "jump",
      to: "run",
      exit: 23,
      entry: 9,
      leadIn: [88, 89, 107, 108],
    });
    landing.leadIn = [88, 89];
    expect(normalized).toEqual(previous.profile);
    expect(candidate.sourceActions).toEqual(previous.sourceActions);
    expect(profile.actions.jump).toEqual({
      frames: Array.from({ length: 28 }, (_, i) => i + 63),
      fps: 24,
      loop: false,
    });
    expect(profile.actions.run.frames).toEqual(
      Array.from({ length: 18 }, (_, i) => i + 39),
    );
    expect(
      resolveGameplayMotion(
        {
          ...manifest,
          frames: manifest.frames.slice(0, 107),
        } as BakedCharacterPackManifest,
        previous.profile.sourceSha256,
      ),
    ).toEqual(previous.profile);
  });

  it("binds the actual append-only source archive by its bytes and character identity", () => {
    const bytes = readFileSync(
      "docs/kling-landing-production/assets/male.source.zip",
    );
    const source = unzipSync(bytes, {
      filter: (file) => file.name.endsWith(".json"),
    });
    const actualManifest = JSON.parse(
      new TextDecoder().decode(source["manifest.json"]),
    ) as BakedCharacterPackManifest;
    const actualConfig = JSON.parse(
      new TextDecoder().decode(source["character.json"]),
    ) as BakedCharacterRecipe;
    const hash = createHash("sha256").update(bytes).digest("hex");
    expect(hash).toBe(profile.sourceSha256);
    expect(actualConfig.characterId).toBe(ID);
    expect(actualManifest.frames).toHaveLength(109);
    expect(actualManifest.animations).toEqual(candidate.sourceActions);
    expect(resolveGameplayMotion(actualManifest, hash, actualConfig)).toEqual(
      profile,
    );
  });

  it("rejects absent or forged identity, missing poses and changed routes", () => {
    expect(
      resolveGameplayMotion(manifest, profile.sourceSha256, config),
    ).toEqual(profile);
    expect(resolveGameplayMotion(manifest, profile.sourceSha256)).toBeNull();
    expect(
      resolveGameplayMotion(manifest, profile.sourceSha256, {
        characterId: "kling-male-side-workspace-v1",
      }),
    ).toBeNull();
    for (const missing of [107, 108])
      expect(
        resolveGameplayMotion(
          {
            ...manifest,
            frames: manifest.frames.filter((row) => row.id !== missing),
          } as BakedCharacterPackManifest,
          profile.sourceSha256,
          config,
        ),
      ).toBeNull();
    expect(() => gameplayManifest(manifest, profile)).toThrow(/does not match/);
    const metadata = {
      ...config,
      sourceMetadata: { gameplayMotion: gameplayMotionMetadata(profile) },
    };
    expect(readGameplayMotion(effective, metadata)).toEqual(profile);
    expect(
      readGameplayMotion(effective, {
        sourceMetadata: metadata.sourceMetadata,
      }),
    ).toBeNull();
    expect(
      readGameplayMotion(effective, {
        ...metadata,
        characterId: "kling-male-side-workspace-v1",
      }),
    ).toBeNull();
    const edited = structuredClone(profile);
    edited.routes.find((route) => route.leadIn?.includes(107))!.leadIn = [
      88, 89, 108, 107,
    ];
    expect(() => gameplayMotionMetadata(edited)).toThrow(/Unreviewed/);
    expect(
      readGameplayMotion(effective, {
        ...config,
        sourceMetadata: { gameplayMotion: edited as never },
      }),
    ).toBeNull();
  });
});

describe("landing candidate project ZIP checkpoints", () => {
  let project: WardrobeProject;
  beforeAll(async () => {
    project = await createWardrobeProject(
      new Uint8Array(
        readFileSync("docs/kling-landing-production/assets/male.source.zip"),
      ),
      new Uint8Array(
        readFileSync(
          "docs/kling-landing-production/assets/male.registration.json",
        ),
      ),
    );
  }, 60_000);

  it.each([2, 3])(
    "saves and reopens paused recovery tick%s without losing release intent",
    async (index) => {
      const state = {
        ...request(recovery(index, 7.25), "idle"),
        paused: true,
        facing: "left" as const,
      };
      const saved = updateWardrobePreview(project, {
        action: state.action,
        facing: state.facing,
        playback: createSidePlaybackCheckpoint(state, profile),
      });
      const reopened = await importWardrobeProject(
        await exportWardrobeProject(saved),
      );
      const restoredProfile = resolveGameplayMotion(
        reopened.archive.manifest,
        reopened.document.sourceSha256,
        reopened.archive.config,
      )!;
      expect(restoredProfile).toEqual(profile);
      const restored = restoreSidePlaybackCheckpoint(
        reopened.document.preview.playback,
        restoredProfile,
      )!;
      expect(restored).toEqual(state);
      expect(frame(restored)).toBe(index === 2 ? 107 : 108);
      expect(advance(restored, 5000)).toEqual(state);
      const resumed = advance(
        { ...restored, paused: false },
        (4 - index) * TICK - 7.25,
      );
      expect(frame(resumed)).toBe(48);
      expect(resumed.pending).toBe("idle");
      expect(resumed.leadIn).toBeUndefined();
      expect(reopened.document.sourceSha256).toBe(profile.sourceSha256);
    },
  );
});

describe("landing candidate through the actual side controller", () => {
  it.each(["left", "right"] as const)(
    "plays one jump from every run phase facing %s without auto-hops",
    (facing) => {
      for (let phase = 0; phase < 18; phase++)
        for (const fraction of [0, 0.5, 0.999]) {
          let state = request(
            {
              ...createSideGameplayState(),
              action: "run",
              returnAction: "run",
              elapsedMs: (phase + fraction) * TICK,
              facing,
            },
            "jump",
          );
          const wait = gameplayTransitionWait(
            profile,
            sideGameplayState(state),
          )!;
          expect(wait).toBeLessThanOrEqual(6 * TICK + 1e-7);
          state = advance(state, wait);
          const route = profile.routes.find(
            (row) =>
              row.from === "run" &&
              row.to === "jump" &&
              row.exit === state.leadIn?.exit,
          )!;
          const expected = [
            ...route.leadIn!,
            ...Array.from({ length: 23 }, (_, i) => 63 + i),
            88,
            89,
            107,
            108,
            48,
          ];
          const actual: number[] = [];
          for (let tick = 0; tick < expected.length; tick++) {
            actual.push(frame(state));
            if (tick < expected.length - 1) {
              const before = structuredClone(state);
              for (let repeat = 0; repeat < 3; repeat++)
                state = request(state, "jump");
              expect(state).toEqual(before);
              state = advance(state, TICK);
            }
          }
          expect(actual).toEqual(expected);
          expect(state.action).toBe("run");
          expect(state.leadIn).toBeUndefined();
          expect(state.pending).toBeNull();
          expect(state.worldX).toBeCloseTo(
            ((facing === "left" ? -1 : 1) *
              700 *
              (wait + (expected.length - 1) * TICK)) /
              1000,
            6,
          );
          const continued = advance(state, 10_000);
          expect(continued.action).toBe("run");
          expect(continued.pending).toBeNull();
        }
    },
  );

  it("honors direction release before the early landing seam using the existing full settle", () => {
    let state = advance(takeoff(), (3 + 23) * TICK - 1);
    expect(frame(state)).toBe(85);
    state = request(state, "idle");
    const seen: number[] = [];
    state = advance(state, 1);
    for (let tick = 0; tick < 5; tick++) {
      seen.push(frame(state));
      state = request(state, "jump");
      state = advance(state, TICK);
    }
    expect(seen).toEqual([86, 87, 88, 89, 90]);
    expect(state.action).toBe("idle");
    expect(advance(state, 1000).worldX).toBe(state.worldX);
  });

  it.each([2, 3])(
    "keeps release and repeated jump intent stable during recovery tick %s",
    (index) => {
      let state = request(recovery(index, 7), "idle");
      expect(frame(state)).toBe(index === 2 ? 107 : 108);
      const before = structuredClone(state);
      for (let repeat = 0; repeat < 20; repeat++)
        state = request(state, "jump");
      expect(state).toEqual(before);
      state = advance(state, (4 - index) * TICK - 7);
      expect(frame(state)).toBe(48);
      expect(state.pending).toBe("idle");
      expect(state.leadIn).toBeUndefined();
      state = advance(state, 9 * TICK);
      expect(state.action).toBe("idle");
      expect(advance(state, 1000).worldX).toBe(state.worldX);
    },
  );

  it.each([2, 3])(
    "restores a paused fractional checkpoint at recovery tick %s and resumes exact next pose",
    (index) => {
      const state = {
        ...request(recovery(index, 7.25), "idle"),
        facing: "left" as const,
        paused: true,
      };
      const saved = createSidePlaybackCheckpoint(state, profile);
      const restored = restoreSidePlaybackCheckpoint(
        JSON.parse(JSON.stringify(saved)),
        profile,
      )!;
      expect(restored).toEqual(state);
      expect(restored).not.toBe(state);
      expect(frame(restored)).toBe(index === 2 ? 107 : 108);
      expect(advance(restored, 5000)).toEqual(state);
      expect(
        restoreSidePlaybackCheckpoint(
          saved,
          previous.profile as GameplayMotion,
        ),
      ).toBeNull();
      const resumed = advance({ ...restored, paused: false }, TICK - 7.25);
      expect(frame(resumed)).toBe(index === 2 ? 108 : 48);
      expect(resumed.pending).toBe("idle");
      expect(resumed.facing).toBe("left");
      expect(resumed.worldX).toBeCloseTo(
        state.worldX - (700 * (TICK - 7.25)) / 1000,
      );
    },
  );
});
