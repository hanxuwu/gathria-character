import { strToU8, zipSync } from "fflate";
import type { WardrobeProject } from "./contract";
import { validateWardrobeProject } from "./project";

/** Portable authoring input, deliberately distinct from a playable character or
 * an importable garment. The base is exact, fully checked clothing artwork. */
export async function exportClothingRecipeKit(
  project: WardrobeProject,
  itemId: string,
): Promise<Uint8Array> {
  const verified = await validateWardrobeProject(project);
  const item = verified.items.find((i) => i.manifest.id === itemId);
  if (
    !item ||
    !Object.values(verified.document.selection).includes(itemId) ||
    item.manifest.slot === "shoes"
  )
    throw Error("Choose a currently worn top, bottom or dress for the recipe.");
  const category =
    item.manifest.slot === "fullBody"
      ? "dress"
      : item.manifest.slot === "bottom"
        ? "trousers"
        : /jacket|suit/i.test(item.manifest.name)
          ? "jacket"
          : "shirt";
  const recipe = {
    format: "gathria-garment-recipe",
    version: 1,
    category,
    base: { file: "base.garment.zip", sha256: item.sha256 },
    output: {
      id: `${itemId.slice(0, 53)}-variant-v1`,
      name: `${item.manifest.name.slice(0, 100)} variant`,
    },
    poseOverrides: [],
  };
  const instructions = `# Clothing variant authoring kit

This kit contains the exact selected clothing, its source-bound anchors and a
versioned recipe. It is not a CharacterPack or a ready-to-import garment.

1. Extract this ZIP. Keep base.garment.zip and registration.json unchanged.
2. Edit recipe.json: give the output a new id/name. Optional material rules use
   sourceRgb, targetRgb and tolerance (see the repository recipe guide).
3. For a difficult pose, add a frameId plus SHA-256-bound image and mask files
   to poseOverrides. Paint at the native ${item.manifest.frameWidth} × ${item.manifest.frameHeight} frame size.
   Masks are binary grayscale PNGs; paint only inside existing clothing ownership
   and preserve alpha. Frame crop offsets are in the base garment manifest.
4. From a checkout of gathria-character with the artwork Python dependencies:
   python scripts/build-kling-garment-variant.py /path/to/kit/recipe.json --root /path/to/kit --output /path/to/new-item.zip
5. Use Import clothing in the same character's wardrobe, then inspect all five
   actions in both directions. Save wardrobe and export CharacterPack separately.

The unchanged source/registration hashes prevent applying this clothing to the
other body or an incompatible source revision. There is no automatic fitting of
one standing PNG. New sleeve lengths or silhouettes require the full authoring
template and explicit ownership review. No source face/body pixels are edited.
Full guide: docs/kling-refinement/recipes/README.md in the repository.
`;
  return zipSync(
    {
      "base.garment.zip": new Uint8Array(item.bytes),
      "registration.json": new Uint8Array(verified.registrationBytes),
      "recipe.json": strToU8(JSON.stringify(recipe, null, 2) + "\n"),
      "README.md": strToU8(instructions),
    },
    { level: 6, mtime: new Date("2020-01-01T00:00:00Z") },
  );
}
