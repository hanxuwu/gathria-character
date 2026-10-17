import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuthoringProject } from "./builtins";
import {
  exportProject,
  validateProject,
  validateSkinMetadata,
} from "./skin-io";
import { applyWardrobe, defaultWardrobeRecipe } from "./wardrobe";
import type { AuthoringProject } from "./types";

function wardrobeProject() {
  return applyWardrobe(createAuthoringProject(), defaultWardrobeRecipe());
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}

function fingerprint(project: AuthoringProject) {
  const { skin, ...metadata } = project;
  const hash = createHash("sha256").update(
    JSON.stringify(canonical({ ...metadata, skin: skin.metadata })),
  );
  for (const slot of skin.metadata.slots) hash.update(skin.images[slot]!);
  return hash.digest("hex");
}

describe("wardrobe authoring persistence", () => {
  it("preserves explicit ankle overlap while leaving old skin metadata unchanged", () => {
    const metadata = createAuthoringProject().skin.metadata;
    expect(
      validateSkinMetadata(metadata).bindings.mesh.preserveAnkleOverlap,
    ).toBeUndefined();
    const current = structuredClone(metadata);
    current.bindings.mesh.preserveAnkleOverlap = true;
    expect(
      validateSkinMetadata(current).bindings.mesh.preserveAnkleOverlap,
    ).toBe(true);
    expect(metadata.bindings.mesh.preserveAnkleOverlap).toBeUndefined();
  });

  it.each([false, 1, "true", null])(
    "rejects malformed anatomical overlap flag %s",
    (value) => {
      const metadata = createAuthoringProject().skin.metadata;
      expect(() =>
        validateSkinMetadata({
          ...metadata,
          bindings: {
            ...metadata.bindings,
            mesh: { ...metadata.bindings.mesh, preserveAnkleOverlap: value },
          },
        }),
      ).toThrow(/preserveAnkleOverlap/);
    },
  );

  it("keeps old projects flat and never opts them into the catalog during validation", () => {
    const original = createAuthoringProject();
    const before = fingerprint(original);
    const parsed = validateProject(original);
    expect(parsed.wardrobe).toBeUndefined();
    expect(Object.hasOwn(parsed, "wardrobe")).toBe(false);
    expect(fingerprint(parsed)).toBe(before);
    expect(fingerprint(original)).toBe(before);
  });

  it("preserves a pinned recipe with self-contained artwork and detaches editable data", () => {
    const original = wardrobeProject();
    original.preview = {
      animation: "jump",
      expression: "joyful",
      facing: "left",
    };
    original.motions.clips.run.fps = 15;
    const before = fingerprint(original);
    const parsed = validateProject(original);
    expect(fingerprint(parsed)).toBe(before);
    expect(parsed.wardrobe).toEqual(original.wardrobe);
    expect(parsed.wardrobe).not.toBe(original.wardrobe);
    expect(parsed.wardrobe!.colors).not.toBe(original.wardrobe!.colors);
    parsed.wardrobe!.colors.top = "#123456";
    parsed.skin.images.torso![0] = 99;
    expect(fingerprint(original)).toBe(before);
  });

  it.each([
    ["unknown catalog", { catalogVersion: 2 }],
    ["unknown recipe version", { version: 2 }],
    ["unknown top", { top: "downloaded-shirt" }],
    ["missing identity", { identity: undefined }],
    ["unknown field", { externalUrl: "https://example.invalid/art.png" }],
    ["invalid colors", { colors: { skin: "red" } }],
  ])("rejects %s without changing the original project", (_, change) => {
    const original = wardrobeProject();
    const before = fingerprint(original);
    expect(() =>
      validateProject({
        ...original,
        wardrobe: { ...original.wardrobe, ...change },
      }),
    ).toThrow(/wardrobe|recipe|catalog|color|identity|top/i);
    expect(fingerprint(original)).toBe(before);
  });

  it("rejects a valid but stale recipe instead of replacing the supplied images", () => {
    const original = wardrobeProject();
    const before = fingerprint(original);
    expect(() =>
      validateProject({
        ...original,
        wardrobe: { ...original.wardrobe, top: "soft-top" },
      }),
    ).toThrow(/wardrobe|recipe|match/i);
    expect(fingerprint(original)).toBe(before);
  });

  it.each(["pixels", "bindings"] as const)(
    "rejects edited %s with a stale recipe but preserves explicitly detached custom artwork",
    (kind) => {
      const original = wardrobeProject();
      const edited = structuredClone(original);
      if (kind === "pixels") {
        const rgba = edited.skin.images.torso!;
        const offset =
          rgba.findIndex((_, index) => index % 4 === 3 && rgba[index] === 255) -
          3;
        expect(offset).toBeGreaterThanOrEqual(0);
        rgba[offset] = (rgba[offset] + 41) % 256;
      } else {
        edited.skin.metadata.bindings.offsets.torso = [1, 0];
      }
      const before = fingerprint(edited);
      expect(() => validateProject(edited)).toThrow(/wardrobe|recipe|match/i);
      expect(fingerprint(edited)).toBe(before);
      const { wardrobe: _recipe, ...custom } = edited;
      const accepted = validateProject(custom);
      expect(accepted.wardrobe).toBeUndefined();
      expect(fingerprint(accepted)).toBe(fingerprint(custom));
    },
  );

  it("allows names, motion edits and preview choices without detaching the same assembled artwork", () => {
    const project = wardrobeProject();
    const recipe = structuredClone(project.wardrobe);
    project.skin.metadata.name = "My named traveler";
    project.motions.clips.jump!.fps = 12;
    project.motions.clips.run.keys[0].lean += 0.05;
    project.preview = {
      animation: "jump",
      facing: "left",
      expression: "joyful",
    };
    const parsed = validateProject(project);
    expect(parsed.wardrobe).toEqual(recipe);
    expect(parsed.skin.metadata.name).toBe("My named traveler");
    expect(parsed.preview).toEqual(project.preview);
    expect(parsed.motions).toEqual(project.motions);
  });

  it("rejects stale wardrobe artwork before project export reaches browser PNG encoding", async () => {
    const project = wardrobeProject();
    project.wardrobe!.colors.top = "#114477";
    await expect(exportProject(project)).rejects.toThrow(
      /wardrobe|recipe|match/i,
    );
  });
});
