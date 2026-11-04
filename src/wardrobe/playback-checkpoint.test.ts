import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  gameplayManifest,
  gameplayTransitionWait,
  resolveGameplayMotion,
} from "../core/gameplay-motion";
import {
  advanceSidePlayback,
  createSideGameplayState,
  createSidePlaybackCheckpoint,
  requestSidePlayback,
  restoreSidePlaybackCheckpoint,
  sideGameplayState,
  sidePlaybackFrameId,
} from "../side-view/gameplay";
import type { SideMotionOptions } from "../side-view/motion";
import { validateWardrobeDocument, type WardrobeProject } from "./contract";
import {
  createWardrobeProject,
  exportWardrobeProject,
  importWardrobeProject,
  updateWardrobePreview,
} from "./project";

const TICK = 1000 / 24;
const options: SideMotionOptions = {
  mode: "travel",
  walkSpeed: 120,
  runSpeed: 240,
  bounds: { min: -10000, max: 10000 },
};

let sourceProject: WardrobeProject;
beforeAll(async () => {
  // The cold load verifies the complete immutable production source archive.
  sourceProject = await createWardrobeProject(
    new Uint8Array(
      readFileSync("docs/kling-side-workspace/assets/male.source.zip"),
    ),
    new Uint8Array(
      readFileSync("docs/kling-side-workspace/assets/male.registration.json"),
    ),
  );
}, 60_000);

function landingCheckpoint() {
  const project = sourceProject;
  const profile = resolveGameplayMotion(
    project.archive.manifest,
    project.document.sourceSha256,
    project.archive.config,
  )!;
  const manifest = gameplayManifest(project.archive.manifest, profile);
  let state = requestSidePlayback(
    { ...createSideGameplayState(), facing: "left", worldX: 500 },
    "run",
    manifest,
    profile,
  );
  state = requestSidePlayback(state, "jump", manifest, profile);
  state = advanceSidePlayback(
    state,
    gameplayTransitionWait(profile, sideGameplayState(state))!,
    manifest,
    options,
    profile,
  );
  const approach = profile.routes.find(
    (route) =>
      route.from === state.leadIn!.from &&
      route.exit === state.leadIn!.exit &&
      route.to === "jump",
  )!.leadIn!.length;
  state = advanceSidePlayback(
    state,
    (approach + 24) * TICK + 7,
    manifest,
    options,
    profile,
  );
  expect(sidePlaybackFrameId(state, manifest, profile)).toBe(89);
  state = requestSidePlayback(state, "idle", manifest, profile);
  state = { ...state, paused: true };
  const checkpoint = createSidePlaybackCheckpoint(state, profile);
  return {
    project: updateWardrobePreview(project, {
      action: state.action,
      facing: state.facing,
      playback: checkpoint,
    }),
    profile,
    manifest,
    state,
    checkpoint,
  };
}

describe("source-bound wardrobe playback checkpoints", () => {
  it("saves and reopens a paused recovery with its fractional clock and pending release", async () => {
    const { project, profile, manifest, state } = await landingCheckpoint();
    const bytes = await exportWardrobeProject(project);
    const reopened = await importWardrobeProject(bytes);
    expect(reopened.document).toEqual(project.document);
    const resumed = restoreSidePlaybackCheckpoint(
      reopened.document.preview.playback,
      profile,
    )!;
    expect(resumed).toEqual(state);
    expect(resumed.pending).toBe("idle");
    expect(resumed.leadIn?.elapsedMs).toBeCloseTo(TICK + 7);
    expect(sidePlaybackFrameId(resumed, manifest, profile)).toBe(89);
    expect(
      advanceSidePlayback(resumed, 5000, manifest, options, profile),
    ).toEqual(state);
    expect(
      advanceSidePlayback(
        { ...resumed, paused: false },
        1000,
        manifest,
        options,
        profile,
      ),
    ).toEqual(
      advanceSidePlayback(
        { ...state, paused: false },
        1000,
        manifest,
        options,
        profile,
      ),
    );
    const files = unzipSync(bytes);
    expect(
      createHash("sha256").update(files["source.character.zip"]).digest("hex"),
    ).toBe(project.document.sourceSha256);
    expect(Object.keys(files).sort()).toEqual([
      "document.json",
      "registration.json",
      "source.character.zip",
    ]);
  });

  it("rejects changed bindings, malformed clocks, unknown fields and contradictory previews", async () => {
    const { project, checkpoint } = await landingCheckpoint();
    for (const mutate of [
      (value: typeof checkpoint) => {
        value.sourceSha256 = "0".repeat(64);
      },
      (value: typeof checkpoint) => {
        value.profileId += "-edited";
      },
      (value: typeof checkpoint) => {
        value.state.elapsedMs = NaN;
      },
      (value: typeof checkpoint) => {
        value.state.leadIn!.exit = 1;
      },
      (value: typeof checkpoint) => {
        value.state.leadIn!.elapsedMs = 10000;
      },
      (value: typeof checkpoint) => {
        Object.assign(value.state, { invented: true });
      },
      (value: typeof checkpoint) => {
        Object.assign(value, { invented: true });
      },
    ]) {
      const edited = structuredClone(checkpoint);
      mutate(edited);
      expect(() =>
        updateWardrobePreview(project, {
          ...project.document.preview,
          playback: edited,
        }),
      ).toThrow(/checkpoint/);
    }
    for (const preview of [
      { ...project.document.preview, action: "idle" as const },
      { ...project.document.preview, facing: "right" as const },
      { ...project.document.preview, playback: null },
    ])
      expect(() =>
        validateWardrobeDocument({ ...project.document, preview }, project),
      ).toThrow(/checkpoint/);
    expect(() =>
      validateWardrobeDocument(
        { ...project.document, sourceSha256: "0".repeat(64) },
        project,
      ),
    ).toThrow(/checkpoint/);
    expect(() =>
      validateWardrobeDocument(
        {
          ...project.document,
          preview: { ...project.document.preview, invented: true },
        },
        project,
      ),
    ).toThrow(/Unexpected Preview field/);
  });

  it("rejects an edited checkpoint on ZIP import and preserves old previews without one", async () => {
    const { project } = await landingCheckpoint();
    const bytes = await exportWardrobeProject(project);
    const files = unzipSync(bytes);
    const document = structuredClone(project.document);
    document.preview.playback!.profileId = "unreviewed-profile";
    await expect(
      importWardrobeProject(
        zipSync({
          ...files,
          "document.json": strToU8(JSON.stringify(document)),
        }),
      ),
    ).rejects.toThrow(/checkpoint/);
    const legacy = updateWardrobePreview(project, {
      action: "jump",
      facing: "right",
    });
    expect(legacy.document.preview).toEqual({
      action: "jump",
      facing: "right",
    });
    const reopened = await importWardrobeProject(
      await exportWardrobeProject(legacy),
    );
    expect(reopened.document.preview).toEqual(legacy.document.preview);
    expect(reopened.document.preview).not.toHaveProperty("playback");
  });
});
