import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { WardrobeProject } from "./contract";
import { compatibleNecklineProfile } from "./mask-edit";

const read = (path: string) =>
  new Uint8Array(readFileSync(new URL("../../" + path, import.meta.url)));
const cases = [
  {
    garment: "docs/kling-wardrobe/garments/female/teal-top.zip",
    registration: "docs/kling-wardrobe/registration/female.json",
    current: "female-neckline-cloth-v2",
    previous: "female-neckline-cloth-v1",
  },
  {
    garment:
      "docs/dual-tailored/assets/female/dual-tailored-female-original-sea-top-v1.garment.zip",
    registration:
      "docs/dual-tailored/assets/female/original-tailored-v1.registration.json",
    current: "female-original-tailored-neckline-cloth-v2",
    previous: "female-original-tailored-neckline-cloth-v1",
  },
] as const;

function projectFromPublishedAssets(entry: (typeof cases)[number]) {
  const bytes = read(entry.registration);
  const registration = JSON.parse(new TextDecoder().decode(bytes));
  const manifest = JSON.parse(
    new TextDecoder().decode(unzipSync(read(entry.garment))["manifest.json"]),
  );
  return {
    registration,
    document: {
      sourceSha256: registration.sourceSha256,
      registrationSha256: createHash("sha256").update(bytes).digest("hex"),
    },
    items: [{ manifest }],
  } as WardrobeProject;
}

describe("mask workbench preserves embedded neckline permission revisions", () => {
  for (const entry of cases) {
    it(`keeps the actual ${entry.current} garment profile when opening the repair editor`, () => {
      const project = projectFromPublishedAssets(entry);
      const manifest = project.items[0].manifest;
      expect(manifest.necklinePermissionProfile).toBe(entry.current);
      const before = structuredClone(project);
      expect(compatibleNecklineProfile(project, manifest.id)).toBe(
        entry.current,
      );
      expect(project).toEqual(before);
    });

    it(`does not upgrade ${entry.previous} or opt unreviewed clothing into V2`, () => {
      const project = projectFromPublishedAssets(entry);
      const manifest = project.items[0].manifest;
      manifest.necklinePermissionProfile = entry.previous;
      expect(compatibleNecklineProfile(project, manifest.id)).toBe(
        entry.previous,
      );
      delete manifest.necklinePermissionProfile;
      manifest.version = 1;
      expect(compatibleNecklineProfile(project, manifest.id)).toBe(
        entry.previous,
      );
      expect(manifest.necklinePermissionProfile).toBeUndefined();
    });

    it.each(["unknown", "source", "registration", "dimensions"])(
      `rejects a %s permission binding on ${entry.current}`,
      (change) => {
        const project = projectFromPublishedAssets(entry);
        const manifest = project.items[0].manifest;
        if (change === "unknown")
          manifest.necklinePermissionProfile = "unpublished-neckline-release";
        if (change === "source")
          project.registration.sourceSha256 = "0".repeat(64);
        if (change === "registration")
          project.document.registrationSha256 = "0".repeat(64);
        if (change === "dimensions") project.registration.frameWidth++;
        expect(() => compatibleNecklineProfile(project, manifest.id)).toThrow(
          /exact approved source and registration/,
        );
      },
    );
  }
});
