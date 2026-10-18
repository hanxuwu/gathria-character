import type { AuthoringProject } from "./types";
import type { CustomWardrobeIdentity } from "./identity-types";
import type { CustomWardrobeItem } from "./wardrobe-types";

/** Playback documentation references only sources used by this look. Encoded
 * artwork and unused library entries belong exclusively to the authoring ZIP. */
export function bakedAuthoringReference(project: AuthoringProject) {
  const sources = [
    { id: "skin-artwork", text: project.skin.metadata.provenance },
  ];
  const sourceReference = (text: string) => {
    const existing = sources.find((source) => source.text.includes(text));
    if (existing) return existing.id;
    const id = `selected-source-${sources.length}`;
    sources.push({ id, text });
    return id;
  };
  const describe = (source: CustomWardrobeIdentity | CustomWardrobeItem) => {
    const { parts, provenance, ...registration } = source;
    return {
      ...registration,
      provenanceReference: sourceReference(provenance),
      parts: parts.map(({ data: _pixels, ...part }) => part),
    };
  };
  const recipe = project.wardrobe;
  const identity =
    recipe?.version === 3
      ? project.wardrobeIdentities?.find(
          (source) => source.id === recipe.identity,
        )
      : undefined;
  const clothing = recipe
    ? (project.wardrobeItems ?? []).filter(
        (source) => source.id === recipe[source.group],
      )
    : [];
  const { provenance: _provenance, ...skinMetadata } = project.skin.metadata;
  const metadata = {
    format: project.format,
    version: project.version,
    rig: project.rig,
    motions: project.motions,
    preview: project.preview,
    skin: {
      metadata: { ...skinMetadata, provenanceReference: "skin-artwork" },
      images:
        "Stored in the separate authoring ZIP; omitted from this playback package.",
    },
    ...(recipe ? { wardrobe: recipe } : {}),
    selectedSources: {
      ...(identity ? { identity: describe(identity) } : {}),
      clothing: clothing.map(describe),
      artwork:
        "All encoded source pixels and unused library entries remain in the separate authoring ZIP.",
    },
  };
  return {
    metadata,
    sourceNotice: sources
      .map((source) => `[${source.id}]\n${source.text}`)
      .join("\n\n"),
  };
}
