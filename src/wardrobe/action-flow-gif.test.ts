import { describe, expect, it } from "vitest";
import { decompressFrames, parseGIF } from "gifuct-js";
import profiles from "../core/gameplay-motion-profiles.json";
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
      const returnEntry = profile.routes.find(
        (route) => route.from === "jump" && route.to === "run",
      )!.entry;
      const expected = [
        ...run.frames,
        ...run.frames.slice(0, firstExit),
        ...profile.actions.jump.frames,
        ...run.frames.slice(returnEntry),
        ...run.frames.slice(0, returnEntry),
      ];
      expect(sequence.frames.map((frame) => frame.frameId)).toEqual(expected);
      expect(
        sequence.frames
          .filter((frame) => frame.action === "jump")
          .map((frame) => frame.frameId),
      ).toEqual(profile.actions.jump.frames);
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
