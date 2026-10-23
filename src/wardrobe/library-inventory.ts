import type { WardrobeProject } from "./contract";

/** Library browsing is not an ever-growing embedded archive. Retain selected
 * pieces and every custom/unknown imported item. Only exact catalog hashes may
 * be released, and their choices remain available for lazy reloading. */
export function retainOutfitAndCustomItems(
  project: WardrobeProject,
  catalog: readonly { id: string; sha256?: string }[],
): WardrobeProject {
  const selected = new Set(Object.values(project.document.selection));
  const known = new Map(catalog.map((item) => [item.id, item.sha256]));
  const items = project.items.filter(
    (item) =>
      selected.has(item.manifest.id) ||
      known.get(item.manifest.id) !== item.sha256,
  );
  if (items.length === project.items.length) return project;
  return {
    ...project,
    items,
    document: {
      ...project.document,
      items: items.map((item) => ({
        id: item.manifest.id,
        sha256: item.sha256,
      })),
    },
  };
}
