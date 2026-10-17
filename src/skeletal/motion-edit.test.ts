import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bakeProject } from "./bake";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import { createMotionLibrary } from "./definition";
import {
  assignPlaybackPose,
  holdPlaybackPose,
  MOTION_LIMITS,
  MOTION_FIELDS,
  removePlaybackFrame,
  setMotionField,
  setMotionFps,
} from "./motion-edit";
import { prepareRig } from "./renderer";
import { validateProject } from "./skin-io";
import type { MotionClip, MotionKey } from "./types";

const digest = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");

describe("motion authoring without changing the rig format", () => {
  it("edits the pose shared by held frames without changing other poses, clips or defaults", () => {
    const motions = createMotionLibrary();
    const before = structuredClone(motions);
    // Idle playback frames 3 and 4 both reference the second source pose.
    const edited = setMotionField(motions.clips.idle, 3, "bodyBob", -3);
    expect(edited.keys[edited.sequence[2]].bodyBob).toBe(-3);
    expect(edited.keys[edited.sequence[3]].bodyBob).toBe(-3);
    expect(edited.keys[0]).toBe(motions.clips.idle.keys[0]);
    expect(edited.keys[1]).not.toBe(motions.clips.idle.keys[1]);
    expect(edited.keys.length).toBe(4);
    expect(edited.sequence).toEqual(before.clips.idle.sequence);
    expect(motions).toEqual(before);
    expect(createMotionLibrary()).toEqual(before);
  });

  it("rejects incomplete, non-finite or out-of-range edits without creating an undo entry", () => {
    const clip = createMotionLibrary().clips.run;
    for (const [field, [min, max]] of Object.entries(MOTION_LIMITS)) {
      for (const value of [
        Number.NaN,
        Infinity,
        -Infinity,
        min - 0.001,
        max + 0.001,
      ])
        expect(setMotionField(clip, 0, field as keyof MotionKey, value)).toBe(
          clip,
        );
      expect(
        setMotionField(
          clip,
          0,
          field as keyof MotionKey,
          clip.keys[0][field as keyof MotionKey] ?? 0,
        ),
      ).toBe(clip);
    }
    for (const frame of [-1, 0.5, 12, Number.NaN]) {
      expect(setMotionField(clip, frame, "bodyBob", 3)).toBe(clip);
      expect(holdPlaybackPose(clip, frame)).toBe(clip);
      expect(removePlaybackFrame(clip, frame)).toBe(clip);
      expect(assignPlaybackPose(clip, frame, 3)).toBe(clip);
    }
    for (const pose of [-1, 0.5, 12, Number.NaN])
      expect(assignPlaybackPose(clip, 0, pose)).toBe(clip);
    for (const fps of [0, 60.1, Infinity, Number.NaN])
      expect(setMotionFps(clip, fps)).toBe(clip);
  });

  it("changes timing and frame ordering without duplicating or destroying authored poses", () => {
    const clip = createMotionLibrary().clips.walk;
    const before = structuredClone(clip);
    let edited = setMotionFps(clip, 12.5);
    edited = holdPlaybackPose(edited, 2);
    expect(edited.sequence).toEqual([0, 1, 2, 2, 3, 4, 5, 6, 7]);
    expect(edited.sequence.length / edited.fps).toBe(0.72);
    edited = assignPlaybackPose(edited, 3, 6);
    expect(edited.sequence).toEqual([0, 1, 2, 6, 3, 4, 5, 6, 7]);
    edited = removePlaybackFrame(edited, 0);
    expect(edited.sequence).toEqual([1, 2, 6, 3, 4, 5, 6, 7]);
    expect(edited.keys).toBe(clip.keys);
    expect(clip).toEqual(before);
    const single = { ...clip, sequence: [7] };
    expect(removePlaybackFrame(single, 0)).toBe(single);
    const full = { ...clip, sequence: Array.from({ length: 120 }, () => 7) };
    expect(holdPlaybackPose(full, 119)).toBe(full);
    const lastAdded = holdPlaybackPose(
      { ...full, sequence: full.sequence.slice(1) },
      118,
    );
    expect(lastAdded.sequence).toHaveLength(120);
  });

  it("keeps editor limits compatible with the saved project's strict validator", () => {
    const project = createAuthoringProject();
    for (const edge of [0, 1]) {
      let clip = project.motions.clips.run;
      for (const field of MOTION_FIELDS.run)
        clip = setMotionField(clip, 0, field, MOTION_LIMITS[field][edge]);
      project.motions.clips.run = setMotionFps(clip, edge ? 60 : 1);
      const reopened = validateProject(project);
      expect(reopened.motions).toEqual(project.motions);
    }
  });

  it("authors jump height and elbow flex without changing the existing actions", () => {
    const project = createAuthoringProject();
    const before = structuredClone(project.motions);
    let jump = project.motions.clips.jump!;
    jump = setMotionField(jump, 4, "rootY", -12);
    jump = setMotionField(jump, 4, "armBend", 0.75);
    jump = holdPlaybackPose(jump, 5);
    project.motions.clips.jump = jump;
    const reopened = validateProject(project);
    expect(reopened.motions.clips.jump).toEqual(jump);
    expect(jump.loop).toBe(false);
    expect(jump.keys[jump.sequence[4]].rootY).toBe(-12);
    expect(jump.keys[jump.sequence[4]].armBend).toBe(0.75);
    for (const action of ["idle", "walk", "run"] as const)
      expect(reopened.motions.clips[action]).toEqual(before.clips[action]);
    expect(setMotionField(jump, 4, "rootY", -17)).toBe(jump);
    expect(setMotionField(jump, 4, "rootY", 1)).toBe(jump);
    expect(setMotionField(jump, 4, "armBend", 1.51)).toBe(jump);
  });

  it("shares authored poses across skins and exports the edited timing with actual pixels", () => {
    const denim = createAuthoringProject();
    const coral = createAuthoringProject(createBuiltinSkin("coral-afternoon"));
    const originalClip = denim.motions.clips.run;
    const originalFrames = [denim, coral].map((project) =>
      prepareRig(project.rig, project.skin, project.motions).frame("run", 0),
    );
    let clip: MotionClip = setMotionField(originalClip, 0, "armAngle", 0.45);
    clip = setMotionField(clip, 0, "bodyBob", 0);
    clip = holdPlaybackPose(setMotionFps(clip, 15), 0);
    for (const [index, project] of [denim, coral].entries()) {
      project.motions.clips.run = clip;
      const preview = prepareRig(project.rig, project.skin, project.motions);
      const current = preview.frame("run", 0);
      expect(digest(current)).not.toBe(digest(originalFrames[index]));
      const baked = bakeProject(validateProject(project));
      expect(baked.manifest.frames).toHaveLength(36);
      expect(baked.manifest.animations.run).toEqual({
        fps: 15,
        loop: true,
        frames: [12, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      });
      const atlasFrame = baked.manifest.frames.find(
        (frame) => frame.id === 12,
      )!;
      const extracted = new Uint8ClampedArray(current.length);
      for (let y = 0; y < 256; y++)
        extracted.set(
          baked.pixels.subarray(
            ((atlasFrame.y + y) * baked.width + atlasFrame.x) * 4,
            ((atlasFrame.y + y) * baked.width + atlasFrame.x + 192) * 4,
          ),
          y * 192 * 4,
        );
      expect(digest(extracted)).toBe(digest(current));
    }
    expect(originalClip).toEqual(createMotionLibrary().clips.run);
  });
});
