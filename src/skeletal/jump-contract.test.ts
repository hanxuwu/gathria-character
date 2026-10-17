import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import {
  bakeProject,
  LEGACY_REUSABLE_GENERATOR_ID,
  REUSABLE_GENERATOR_ID,
} from "./bake";
import { validateProject } from "./skin-io";

const digest = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");
const oldPixels = {
  "denim-daytrip":
    "af40597228d164d932660a6af9846ff9f12712bb8a43a875064eea0a3feb2c33",
  "coral-afternoon":
    "1b56e29087739ab61b49d4596fb3b68892ada3e40d7960d8ff74252bc76ba492",
};

describe("four basic actions and old authoring projects", () => {
  it.each(["denim-daytrip", "coral-afternoon"] as const)(
    "preserves %s historical project data and every old atlas pixel",
    (id) => {
      // Hashes are decoded RGBA from the checked-in pre-jump PNGs, not this renderer.
      const files = unzipSync(readFileSync(`docs/reusable-rig/${id}.rig.zip`));
      const raw = JSON.parse(strFromU8(files["project.json"]));
      const old = validateProject(raw, createBuiltinSkin(id));
      expect(old.motions).toEqual(raw.motions);
      expect(old.motions.clips.jump).toBeUndefined();
      const oldBake = bakeProject(old);
      expect(digest(oldBake.pixels)).toBe(oldPixels[id]);
      expect(oldBake.manifest.generator).toBe(LEGACY_REUSABLE_GENERATOR_ID);
      expect(oldBake.manifest.frames).toHaveLength(24);
      expect(oldBake.height).toBe(1024);
      expect(oldBake.manifest.animations.jump).toBeUndefined();

      const current = createAuthoringProject(createBuiltinSkin(id));
      for (const action of ["idle", "walk", "run"] as const)
        expect(current.motions.clips[action]).toEqual(
          old.motions.clips[action],
        );
      const next = bakeProject(validateProject(current));
      expect(digest(next.pixels.slice(0, oldBake.pixels.length))).toBe(
        oldPixels[id],
      );
      expect(next.manifest.frames.slice(0, 24)).toEqual(
        oldBake.manifest.frames,
      );
      for (const action of ["idle", "walk", "run"] as const)
        expect(next.manifest.animations[action]).toEqual(
          oldBake.manifest.animations[action],
        );
      expect(next.manifest.generator).toBe(REUSABLE_GENERATOR_ID);
      expect(next.height).toBe(1536);
      expect(next.manifest.animations.jump).toEqual({
        fps: 15,
        loop: false,
        frames: Array.from({ length: 12 }, (_, i) => i + 24),
      });
      expect(next.manifest.frames[24]).toMatchObject({
        x: 0,
        y: 1024,
        width: 192,
        height: 256,
      });
    },
  );

  it("saves a jump selection and its detached motion data without changing skin format", () => {
    const project = createAuthoringProject();
    project.preview.animation = "jump";
    project.motions.clips.jump!.keys[5].rootY = -12;
    const parsed = validateProject(project);
    expect(parsed.preview).toEqual(project.preview);
    expect(parsed.rig).toEqual(project.rig);
    expect(parsed.motions).toEqual(project.motions);
    expect(parsed.skin.metadata).toEqual(project.skin.metadata);
    for (const slot of project.skin.metadata.slots)
      expect(digest(parsed.skin.images[slot]!)).toBe(
        digest(project.skin.images[slot]!),
      );
    expect(parsed.motions.clips.jump!.keys).not.toBe(
      project.motions.clips.jump!.keys,
    );
    expect(parsed.skin.metadata.version).toBe(1);
  });

  it("rejects unsupported or malformed jump data while permitting unchanged old projects", () => {
    const change = (
      edit: (p: ReturnType<typeof createAuthoringProject>) => void,
    ) => {
      const p = createAuthoringProject();
      edit(p);
      return () => validateProject(p);
    };
    expect(
      change((p) => {
        p.motions.clips.jump!.loop = true;
      }),
    ).toThrow(/jump.loop/);
    expect(
      change((p) => {
        p.motions.clips.jump!.keys.pop();
      }),
    ).toThrow(/exactly 12/);
    expect(
      change((p) => {
        p.motions.clips.jump!.keys[4].rootY = -17;
      }),
    ).toThrow(/rootY/);
    expect(
      change((p) => {
        p.motions.clips.jump!.keys[4].armBend = NaN;
      }),
    ).toThrow(/armBend/);
    expect(
      change((p) => {
        p.motions.clips.jump!.sequence.push(12);
      }),
    ).toThrow(/sequence index/);
    expect(
      change((p) => {
        p.motions.clips.run.keys[0].rootY = -2;
      }),
    ).toThrow(/unsupported fields/);
    expect(
      change((p) => {
        delete p.motions.clips.jump;
        p.preview.animation = "jump";
      }),
    ).toThrow(/preview/);
  });
});
