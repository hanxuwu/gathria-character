import { describe, expect, it } from "vitest";
import { createDefaultProject, parseRigProject } from "./project";
import {
  bakeRigProject,
  baselineCharacter,
  SKELETAL_GENERATOR_ID,
} from "./bake";
import { validateManifest } from "../../core/pack";

describe("isolated Denim skeletal authoring", () => {
  it("round-trips a typed recipe without silently accepting other source versions or identities", () => {
    const project = createDefaultProject();
    project.timeline.frames[4].footLift = 26;
    expect(parseRigProject(JSON.parse(JSON.stringify(project)))).toEqual(
      project,
    );
    expect(() =>
      parseRigProject({ ...project, sourceRevision: "future" }),
    ).toThrow(/revision/);
    expect(() =>
      parseRigProject({
        ...project,
        config: { ...project.config, upperClothing: "tee" },
      }),
    ).toThrow(/Denim/);
    expect(() =>
      parseRigProject({ ...project, mesh: { ...project.mesh, volume: NaN } }),
    ).toThrow(/finite/);
    expect(() =>
      parseRigProject({
        ...project,
        timeline: { ...project.timeline, frames: [] },
      }),
    ).toThrow(/twelve/);
    expect(() =>
      parseRigProject({
        ...project,
        timeline: {
          ...project.timeline,
          frames: project.timeline.frames.map((f) => ({
            ...f,
            footLift: Infinity,
          })),
        },
      }),
    ).toThrow(/finite/);
  });

  it("bakes deterministic run frames with unchanged legacy rows, geometry and timing", () => {
    const project = createDefaultProject();
    const before = baselineCharacter();
    const a = bakeRigProject(project),
      b = bakeRigProject(parseRigProject(JSON.parse(JSON.stringify(project))));
    expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels))).toBe(true);
    expect(
      Buffer.from(a.pixels.subarray(0, a.width * 512 * 4)).equals(
        Buffer.from(before.pixels.subarray(0, before.width * 512 * 4)),
      ),
    ).toBe(true);
    expect(Buffer.from(a.pixels).equals(Buffer.from(before.pixels))).toBe(
      false,
    );
    expect(validateManifest(a.manifest)).toEqual(a.manifest);
    expect(a.manifest.generator).toBe(SKELETAL_GENERATOR_ID);
    expect(a.manifest.animations.run).toEqual(before.manifest.animations.run);
    expect(a.manifest.anchor).toEqual(before.manifest.anchor);
    for (const f of a.manifest.frames.filter((f) => f.id >= 12)) {
      let visible = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 192; x++) {
          const offset = ((f.y + y) * a.width + f.x + x) * 4;
          const alpha = a.pixels[offset + 3];
          expect(alpha === 0 || alpha === 255).toBe(true);
          if (alpha) visible++;
          if (x === 0 || x === 191 || y === 0 || y === 255)
            expect(alpha).toBe(0);
          // Frozen head and neck remain the same at every matched phase.
          if (y < 110)
            for (let c = 0; c < 4; c++)
              expect(a.pixels[offset + c]).toBe(before.pixels[offset + c]);
        }
      expect(visible).toBeGreaterThan(5000);
    }
  }, 20000);

  it("uses edited keys while preserving production output and unrelated run phases", () => {
    const project = createDefaultProject();
    const original = bakeRigProject(project);
    project.timeline.frames[4].footLift -= 3;
    const changed = bakeRigProject(project);
    for (let i = 0; i < 12; i++) {
      const f = original.manifest.frames.find((f) => f.id === 12 + i)!;
      let differences = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 192 * 4; x++) {
          const p = ((f.y + y) * original.width + f.x) * 4 + x;
          differences += Number(original.pixels[p] !== changed.pixels[p]);
        }
      // Near/far legs share a key track, offset by half a cycle.
      expect(differences > 0).toBe(i === 4 || i === 10);
    }
    const baseline = baselineCharacter();
    baseline.pixels.fill(0);
    expect(baselineCharacter().pixels.some((v) => v > 0)).toBe(true);
  }, 20000);
});
