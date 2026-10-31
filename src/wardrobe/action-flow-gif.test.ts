import { describe, expect, it } from "vitest";
import { decompressFrames, parseGIF } from "gifuct-js";
import profiles from "../core/gameplay-motion-profiles.json";
import legacyProfiles from "../core/gameplay-motion-legacy-profiles.json";
import type { GameplayMotion } from "../core/gameplay-motion";
import type { WardrobeCompositor } from "./compositor";
import { exportWardrobeActionGif, gifDelays } from "./action-gif";
import {
  buildWardrobeRunJumpSequence,
  exportWardrobeRunJumpGif,
} from "./action-flow-gif";

function fixture(row: (typeof profiles)[number]) {
  const profile = row.profile as GameplayMotion;
  const all = [
    ...new Set(Object.values(row.sourceActions).flatMap((clip) => clip.frames)),
  ];
  const calls: number[] = [];
  const renderer = {
    manifest: {
      spritesheet: { frameWidth: 4, frameHeight: 2 },
      frames: all.map((id) => ({ id, x: 0, y: 0, width: 4, height: 2 })),
      animations: row.sourceActions,
    },
    renderFrame(id: number) {
      calls.push(id);
      return {
        width: 4,
        height: 2,
        colorChunks: [],
        pixels: new Uint8Array(
          Array.from({ length: 8 }, (_, index) =>
            index % 4 < 2 ? [id, 50, 90, 255] : [180, 110, 30, 255],
          ).flat(),
        ),
      };
    },
  } as unknown as Pick<WardrobeCompositor, "manifest" | "renderFrame">;
  return { renderer, calls, profile };
}
const read = (bytes: Uint8Array) => parseGIF(new Uint8Array(bytes).buffer);

describe("single native jump exports", () => {
  it.each(["male", "female"] as const)(
    "%s V6 exports forward recovery and a complete run cycle while retaining the V5 basic jump",
    async (character) => {
      const row = profiles.find(
        (entry) =>
          entry.profile.view === "side" &&
          entry.profile.characterId === character,
      )!;
      const { renderer, calls, profile } = fixture(row);
      const previous = legacyProfiles.find(
        (entry) =>
          entry.profile.id === `kling-${character}-side-single-jump-v5`,
      )!.profile as GameplayMotion;
      expect(profile.id).toBe(`kling-${character}-side-single-jump-v6`);
      expect(profile.actions).toEqual(previous.actions);
      const recovery = character === "male" ? [88, 89] : [83, 84];
      const entry = character === "male" ? 10 : 7;
      expect(
        profile.routes.find(
          (route) => route.from === "jump" && route.to === "run",
        ),
      ).toEqual({
        from: "jump",
        to: "run",
        exit: 23,
        entry,
        leadIn: recovery,
      });
      const sequence = buildWardrobeRunJumpSequence(profile);
      const recoveryStart = sequence.frames.findIndex(
        (frame, index) =>
          index > 0 &&
          frame.action === "run" &&
          sequence.frames[index - 1].action === "jump",
      );
      expect(recoveryStart).toBeGreaterThan(0);
      expect(
        sequence.frames
          .slice(recoveryStart, recoveryStart + 2)
          .map((frame) => frame.frameId),
      ).toEqual(recovery);
      const nativeJumpPositions = sequence.frames
        .slice(recoveryStart - 1, recoveryStart + 2)
        .map((frame) => row.sourceActions.jump.frames.indexOf(frame.frameId));
      expect(nativeJumpPositions[0]).toBeGreaterThanOrEqual(0);
      expect(nativeJumpPositions[1]).toBeGreaterThan(nativeJumpPositions[0]);
      expect(nativeJumpPositions[2]).toBeGreaterThan(nativeJumpPositions[1]);
      const run = profile.actions.run;
      const resumedRun = [
        ...run.frames.slice(entry),
        ...run.frames.slice(0, entry),
      ];
      expect(
        sequence.frames.slice(recoveryStart + 2).map((frame) => frame.frameId),
      ).toEqual(resumedRun);
      expect(resumedRun[0]).toBe(character === "male" ? 49 : 41);
      expect(sequence.returnRunTicks).toBe(run.frames.length);
      expect(
        sequence.frames.every((frame) => frame.durationMs === 1000 / 24),
      ).toBe(true);

      const exported = await exportWardrobeRunJumpGif(
        renderer,
        profile,
        "right",
      );
      expect(calls.slice(recoveryStart)).toEqual([...recovery, ...resumedRun]);
      const decoded = decompressFrames(read(exported), true);
      expect(decoded).toHaveLength(sequence.frames.length);
      expect(decoded.map((frame) => frame.delay)).toEqual(
        gifDelays(sequence.frames.length, 24),
      );

      const basicJump = await exportWardrobeActionGif(
        renderer,
        "jump",
        "right",
        { gameplayMotion: profile },
      );
      const previousJump = await exportWardrobeActionGif(
        renderer,
        "jump",
        "right",
        { gameplayMotion: previous },
      );
      expect(basicJump).toEqual(previousJump);
      const oldSequence = buildWardrobeRunJumpSequence(previous);
      expect(
        oldSequence.frames
          .slice(recoveryStart, recoveryStart + 2)
          .map((frame) => frame.frameId),
      ).toEqual(character === "male" ? [63, 62] : [58, 57]);
    },
  );

  it.each(profiles)(
    "exports one complete run/jump/run sequence for $profile.id",
    async (row) => {
      const { renderer, calls, profile } = fixture(row);
      const sequence = buildWardrobeRunJumpSequence(profile);
      const run = profile.actions.run;
      const firstExit = Math.min(
        ...profile.routes
          .filter((route) => route.from === "run" && route.to === "jump")
          .map((route) => route.exit),
      );
      const leadIn =
        profile.routes.find(
          (route) =>
            route.from === "run" &&
            route.to === "jump" &&
            route.exit === firstExit,
        )?.leadIn ?? [];
      const landing = profile.routes.find(
        (route) => route.from === "jump" && route.to === "run",
      )!;
      const returnEntry = landing.entry;
      const landingFrames = profile.actions.jump.frames.slice(0, landing.exit);
      const expected = [
        ...run.frames,
        ...run.frames.slice(0, firstExit),
        ...leadIn,
        ...landingFrames,
        ...(landing.leadIn ?? []),
        ...run.frames.slice(returnEntry),
        ...run.frames.slice(0, returnEntry),
      ];
      expect(sequence.frames.map((frame) => frame.frameId)).toEqual(expected);
      expect(sequence.frames.slice(-run.frames.length)).toEqual(
        [
          ...run.frames.slice(returnEntry),
          ...run.frames.slice(0, returnEntry),
        ].map((frameId) => ({
          action: "run",
          frameId,
          durationMs: 1000 / run.fps,
        })),
      );
      expect(
        sequence.frames
          .filter((frame) => frame.action === "jump")
          .map((frame) => frame.frameId),
      ).toEqual([...leadIn, ...landingFrames]);
      expect(sequence.jumpRequestTick).toBe(run.frames.length);
      expect(sequence.returnRunTicks).toBe(run.frames.length);
      expect(sequence.durationMs).toBe((expected.length * 1000) / run.fps);
      const bytes = await exportWardrobeRunJumpGif(renderer, profile, "right");
      expect(calls).toEqual(expected);
      const decoded = decompressFrames(read(bytes), true);
      expect(decoded).toHaveLength(expected.length);
      expect(decoded.map((frame) => frame.delay)).toEqual(
        gifDelays(expected.length, run.fps),
      );
      expect(new TextDecoder().decode(bytes)).not.toContain("NETSCAPE2.0");
      calls.length = 0;
      const left = decompressFrames(
        read(await exportWardrobeRunJumpGif(renderer, profile, "left")),
        true,
      );
      for (let i = 0; i < left.length; i++) {
        expect(left[i].patch.slice(0, 4)).toEqual(decoded[i].patch.slice(4, 8));
        expect(left[i].patch.slice(4, 8)).toEqual(decoded[i].patch.slice(0, 4));
      }
    },
  );

  it.each(profiles)(
    "exports only the selected jump while leaving source clips intact: $profile.id",
    async (row) => {
      const { renderer, calls, profile } = fixture(row);
      const before = structuredClone(renderer.manifest);
      const bytes = await exportWardrobeActionGif(renderer, "jump", "right", {
        gameplayMotion: profile,
      });
      expect(calls).toEqual(profile.actions.jump.frames);
      expect(decompressFrames(read(bytes), true)).toHaveLength(
        profile.actions.jump.frames.length,
      );
      expect(new TextDecoder().decode(bytes)).not.toContain("NETSCAPE2.0");
      expect(renderer.manifest).toEqual(before);
      calls.length = 0;
      await exportWardrobeActionGif(renderer, "jump", "right");
      expect(calls).toEqual(row.sourceActions.jump.frames);
    },
  );

  it("rejects modified routes and an unrelated source instead of silently exporting a different jump", async () => {
    const { renderer, calls, profile } = fixture(profiles[0]);
    const altered = structuredClone(profile);
    altered.actions.jump.frames.pop();
    expect(() => buildWardrobeRunJumpSequence(altered)).toThrow(/Unreviewed/);
    await expect(
      exportWardrobeRunJumpGif(
        renderer,
        profiles[1].profile as GameplayMotion,
        "right",
      ),
    ).rejects.toThrow(/does not match/);
    expect(calls).toEqual([]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      exportWardrobeRunJumpGif(renderer, profile, "right", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toEqual([]);
  });
});
