import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../core/pack";
import type { GeneratedCharacter } from "../core/types";
import { bakeProject, REUSABLE_GENERATOR_ID } from "./bake";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import { prepareRig } from "./renderer";
import type { AnimationName, AuthoringProject } from "./types";

const digest = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");

function extractFrame(generated: GeneratedCharacter, id: number) {
  const frame = generated.manifest.frames.find((item) => item.id === id)!;
  const rgba = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++)
    rgba.set(
      generated.pixels.subarray(
        ((frame.y + y) * generated.width + frame.x) * 4,
        ((frame.y + y) * generated.width + frame.x + frame.width) * 4,
      ),
      y * frame.width * 4,
    );
  return rgba;
}

/** A novel identity and image supplied by a user, without any built-in preset
 * or generator branch. Repainting opaque torso texels keeps the alpha and
 * registration contract while proving the renderer consumes those pixels. */
function thirdSkinProject(): AuthoringProject {
  const project = createAuthoringProject();
  project.skin.metadata.id = "external-copper-jacket";
  project.skin.metadata.name = "Copper test visitor";
  project.skin.metadata.provenance = "Synthetic texture edited by this test.";
  const torso = project.skin.images.torso!;
  for (let p = 0; p < torso.length; p += 4)
    if (torso[p + 3]) {
      torso[p] = 217;
      torso[p + 1] = 101;
      torso[p + 2] = 46;
    }
  return project;
}

describe("reusable skeletal skin integration", () => {
  it("drives two different silhouettes and an unknown replacement skin with the exact same rig and clips", () => {
    const denim = createAuthoringProject();
    const coral = createAuthoringProject(createBuiltinSkin("coral-afternoon"));
    const third = thirdSkinProject();
    expect(coral.rig).toEqual(denim.rig);
    expect(coral.motions).toEqual(denim.motions);
    expect(third.rig).toEqual(denim.rig);
    expect(third.motions).toEqual(denim.motions);
    // Unknown metadata alone is not an alternate rendering branch.
    const renamed = structuredClone(denim);
    renamed.skin.metadata.id = "not-a-built-in";
    renamed.skin.metadata.name = "Someone new";
    const frame = (project: AuthoringProject) =>
      prepareRig(project.rig, project.skin, project.motions).frame("run", 4);
    const original = frame(denim);
    expect(digest(frame(renamed))).toBe(digest(original));
    expect(digest(frame(coral))).not.toBe(digest(original));
    const changed = frame(third);
    expect(digest(changed)).not.toBe(digest(original));
    // The identical head region establishes that a texture swap is localized.
    expect(digest(changed.slice(0, 192 * 100 * 4))).toBe(
      digest(original.slice(0, 192 * 100 * 4)),
    );
    expect(denim.skin.metadata.id).toBe("denim-daytrip");
  });

  it("bakes every animation from preview pixels, preserving geometry, timing and deterministic edits", () => {
    const project = thirdSkinProject();
    project.skin.metadata.bindings.offsets.torso = [3, -1];
    project.preview.expression = "joyful";
    project.preview.facing = "left";
    const originalImage = digest(project.skin.images.torso!);
    const preview = prepareRig(project.rig, project.skin, project.motions);
    const output = bakeProject(project);
    expect(digest(bakeProject(structuredClone(project)).pixels)).toBe(
      digest(output.pixels),
    );
    expect(validateManifest(output.manifest)).toEqual(output.manifest);
    expect(output.manifest.generator).toBe(REUSABLE_GENERATOR_ID);
    expect(output.manifest.anchor).toEqual({
      x: 96,
      y: 240,
      units: "pixels",
      origin: "top-left",
    });
    expect(output.manifest.facing).toEqual({
      native: "right",
      right: "none",
      left: "mirror-x",
    });
    let startId = 0;
    for (const action of ["idle", "walk", "run"] as const) {
      const clip = project.motions.clips[action];
      expect(output.manifest.animations[action]).toEqual({
        frames: clip.sequence.map((index) => index + startId),
        fps: clip.fps,
        loop: true,
      });
      for (let key = 0; key < clip.keys.length; key++)
        expect(digest(extractFrame(output, startId + key))).toBe(
          digest(preview.frame(action, key, "joyful")),
        );
      startId += clip.keys.length;
    }
    expect(output.manifest.frames).toHaveLength(24);
    expect(digest(project.skin.images.torso!)).toBe(originalImage);
  });

  it.each(["denim-daytrip", "coral-afternoon"] as const)(
    "%s has finite normalized meshes and clear frame margins through every expression and run key",
    (id) => {
      const project = createAuthoringProject(createBuiltinSkin(id));
      const rig = prepareRig(project.rig, project.skin, project.motions);
      const identities = new Set<string>();
      for (const expression of ["neutral", "gentle", "joyful"] as const) {
        identities.add(digest(rig.frame("run", 0, expression)));
        for (let key = 0; key < 12; key++) {
          const pixels = rig.frame("run", key, expression);
          let opaque = 0,
            edgeAlpha = 0,
            intermediateAlpha = 0;
          for (let y = 0; y < 256; y++)
            for (let x = 0; x < 192; x++) {
              const alpha = pixels[(y * 192 + x) * 4 + 3];
              opaque += Number(alpha === 255);
              intermediateAlpha += Number(alpha !== 0 && alpha !== 255);
              if (x === 0 || x === 191 || y === 0 || y === 255)
                edgeAlpha += alpha;
            }
          expect(opaque).toBeGreaterThan(4000);
          expect(opaque).toBeLessThan(192 * 256 - 4000);
          expect(edgeAlpha).toBe(0);
          expect(intermediateAlpha).toBe(0);
        }
      }
      expect(identities.size).toBe(3);
      for (const action of ["idle", "walk", "run"] as AnimationName[]) {
        for (
          let key = 0;
          key < project.motions.clips[action].keys.length;
          key++
        ) {
          const { limbs } = rig.inspect(action, key);
          expect(limbs).toHaveLength(4);
          for (const limb of limbs) {
            expect(limb.bones.flat().every(Number.isFinite)).toBe(true);
            expect(limb.vertices.flat().every(Number.isFinite)).toBe(true);
            expect(limb.weights).toHaveLength(limb.vertices.length * 2);
            let maxWeightError = 0;
            for (let i = 0; i < limb.weights.length; i += 2)
              maxWeightError = Math.max(
                maxWeightError,
                Math.abs(limb.weights[i] + limb.weights[i + 1] - 1),
              );
            expect(maxWeightError).toBeLessThan(1e-12);
            expect(limb.weights.every((w) => w >= 0 && w <= 1)).toBe(true);
            expect(
              limb.triangles.every(
                (v) =>
                  Number.isInteger(v) && v >= 0 && v < limb.vertices.length,
              ),
            ).toBe(true);
          }
        }
      }
    },
    20_000,
  );

  it("binding offsets alter only the selected texture without mutating its source or prior renderer", () => {
    const project = createAuthoringProject();
    const original = prepareRig(project.rig, project.skin, project.motions);
    const before = original.frame("run", 0);
    const textureHash = digest(project.skin.images.torso!);
    project.skin.metadata.bindings.offsets.torso = [4, 0];
    const adjusted = prepareRig(
      project.rig,
      project.skin,
      project.motions,
    ).frame("run", 0);
    expect(digest(adjusted)).not.toBe(digest(before));
    expect(digest(adjusted.slice(0, 192 * 100 * 4))).toBe(
      digest(before.slice(0, 192 * 100 * 4)),
    );
    expect(digest(original.frame("run", 0))).toBe(digest(before));
    expect(digest(project.skin.images.torso!)).toBe(textureHash);
  });
});
