import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { bakedAuthoringReference } from "./baked-provenance";
import type { AuthoringProject } from "./types";

/** Actual two-identity, six-garment project that previously exceeded the
 * independent player's 256 KiB text-entry quota when library data was copied. */
function libraryProject(): AuthoringProject {
  const files = unzipSync(
    readFileSync(
      new URL(
        "../../artwork/portable-identities/prepared/maple.rig.zip",
        import.meta.url,
      ),
    ),
  );
  return {
    ...JSON.parse(strFromU8(files["project.json"])),
    skin: { metadata: JSON.parse(strFromU8(files["skin.json"])), images: {} },
    wardrobeIdentities: JSON.parse(strFromU8(files["identities.json"]))
      .identities,
    wardrobeItems: JSON.parse(strFromU8(files["wardrobe.json"])).items,
  };
}

describe("bounded baked authoring provenance", () => {
  it("keeps the real two-identity/six-item export compact without embedding artwork or unused sources", () => {
    const project = libraryProject();
    expect(project.wardrobeIdentities).toHaveLength(2);
    expect(project.wardrobeItems).toHaveLength(6);
    // Establish the former failure from actual sources, not artificial filler.
    expect(
      new TextEncoder().encode(JSON.stringify(project, null, 2)).length,
    ).toBeGreaterThan(256 * 1024);
    const { metadata, sourceNotice } = bakedAuthoringReference(project);
    const serialized = sourceNotice + JSON.stringify(metadata, null, 2);
    expect(new TextEncoder().encode(serialized).length).toBeLessThan(64 * 1024);
    expect(metadata.wardrobe).toEqual(project.wardrobe);
    expect(metadata.rig).toEqual(project.rig);
    expect(metadata.motions).toEqual(project.motions);
    expect(metadata.preview).toEqual(project.preview);
    expect(metadata.selectedSources.identity?.id).toBe("custom-maple");
    expect(
      metadata.selectedSources.clothing.map((item) => item.id).sort(),
    ).toEqual([
      "custom-maple-active-top",
      "custom-maple-bottom",
      "custom-maple-shoes",
    ]);
    expect(serialized).not.toContain('"wardrobeItems"');
    expect(serialized).not.toContain('"wardrobeIdentities"');
    expect(serialized).not.toContain('"data"');
    for (const source of [
      ...project.wardrobeIdentities!,
      ...project.wardrobeItems!,
    ]) {
      const selected =
        source.id === project.wardrobe!.identity ||
        ("group" in source && source.id === project.wardrobe![source.group]);
      if (selected) expect(sourceNotice).toContain(source.provenance);
      else expect(serialized).not.toContain(`"${source.id}"`);
      for (const part of source.parts)
        expect(serialized).not.toContain(part.data);
    }
    expect(metadata.skin.images).toContain("separate authoring ZIP");
  });

  it("deduplicates selected edited rights and omits all detached or maximum-capacity library payloads", () => {
    const project = libraryProject();
    const commonCredit =
      "Additional creator attribution: retain this exact license notice.";
    for (const item of project.wardrobeItems!)
      if (item.id === project.wardrobe![item.group])
        item.provenance = commonCredit;
    project.wardrobeIdentities!.push(
      ...project.wardrobeIdentities!.map((identity, index) => ({
        ...identity,
        id: `custom-unused-identity-${index}`,
      })),
    );
    project.wardrobeItems!.push(
      ...project
        .wardrobeItems!.slice(0, 2)
        .map((item, index) => ({ ...item, id: `custom-unused-item-${index}` })),
    );
    const result = bakedAuthoringReference(project);
    expect(result.sourceNotice.split(commonCredit)).toHaveLength(2);
    expect(
      new Set(
        result.metadata.selectedSources.clothing.map(
          (item) => item.provenanceReference,
        ),
      ).size,
    ).toBe(1);
    expect(result.metadata.selectedSources.clothing).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain("custom-unused");
    expect(
      new TextEncoder().encode(JSON.stringify(result)).length,
    ).toBeLessThan(64 * 1024);
    delete project.wardrobe;
    const detached = bakedAuthoringReference(project);
    expect(detached.metadata.selectedSources.clothing).toEqual([]);
    expect(detached.metadata.selectedSources.identity).toBeUndefined();
    expect(detached.metadata.wardrobe).toBeUndefined();
    expect(detached.sourceNotice).toContain(project.skin.metadata.provenance);
    expect(detached.sourceNotice).not.toContain(commonCredit);
    // The complete authoring library was neither modified nor consumed.
    expect(project.wardrobeIdentities).toHaveLength(4);
    expect(project.wardrobeItems).toHaveLength(8);
  });
});
