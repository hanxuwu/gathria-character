import { strToU8, zipSync } from "fflate";
import type { WardrobeProject, WardrobeGarment } from "./contract";
import { validateWardrobeProject } from "./project";
import { decodedGarmentPage } from "./garment-pages";
import { encodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import { sha256 } from "../core/sha256";

/** Fresh native-coordinate images; authoring always uses the right-facing pose. */
export function clothingPose(
  item: WardrobeGarment,
  frameId: number,
): { image: RgbaPng; mask: RgbaPng } {
  const frame = item.manifest.frames.find((f) => f.frameId === frameId);
  if (!frame) throw Error(`Clothing has no source pose ${frameId}.`);
  const spec = item.manifest.pages[frame.page],
    files = item.pages[frame.page];
  const decoded = decodedGarmentPage(
    `${item.sha256}:${frame.page}`,
    files.patch,
    files.ownership,
    spec,
  );
  const { frameWidth: width, frameHeight: height } = item.manifest;
  const pixels = new Uint8Array(width * height * 4),
    mask = new Uint8Array(pixels.length);
  for (let i = 3; i < mask.length; i += 4) mask[i] = 255;
  for (let y = 0; y < frame.rect.height; y++)
    for (let x = 0; x < frame.rect.width; x++) {
      const at = ((frame.rect.y + y) * spec.width + frame.rect.x + x) * 4;
      const to = ((frame.offset.y + y) * width + frame.offset.x + x) * 4;
      pixels.set(decoded.patch.pixels.subarray(at, at + 4), to);
      mask.fill(decoded.ownership[at / 4], to, to + 3);
    }
  return {
    image: {
      width,
      height,
      pixels,
      colorChunks: decoded.patch.colorChunks.map((c) => new Uint8Array(c)),
    },
    mask: { width, height, pixels: mask, colorChunks: [] },
  };
}

/** Portable authoring input, deliberately distinct from a playable character or
 * an importable garment. The base is exact, fully checked clothing artwork. */
export async function exportClothingRecipeKit(
  project: WardrobeProject,
  itemId: string,
  frameId?: number,
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
    poseOverrides: [] as Array<{
      frameId: number;
      image: { file: string; sha256: string };
      mask: { file: string; sha256: string };
    }>,
  };
  const poseFiles: Record<string, Uint8Array> = {};
  if (frameId !== undefined) {
    const { image, mask } = clothingPose(item, frameId);
    const imageName = `pose-${frameId}.png`,
      maskName = `mask-${frameId}.png`;
    poseFiles[imageName] = encodeSourceRgbaPng(image);
    poseFiles[maskName] = encodeSourceRgbaPng(mask);
    recipe.poseOverrides.push({
      frameId,
      image: { file: imageName, sha256: await sha256(poseFiles[imageName]) },
      mask: { file: maskName, sha256: await sha256(poseFiles[maskName]) },
    });
    poseFiles["pose-guide.json"] = strToU8(
      JSON.stringify(
        {
          sourceSha256: verified.document.sourceSha256,
          registrationSha256: verified.document.registrationSha256,
          nativeFacing: "right",
          frameId,
          width: image.width,
          height: image.height,
          registration: verified.registration.frames.find(
            (f) => f.frameId === frameId,
          ),
          actions: Object.entries(verified.archive.manifest.animations)
            .filter(([, clip]) => clip?.frames.includes(frameId))
            .map(([name]) => name),
        },
        null,
        2,
      ) + "\n",
    );
  }
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

${
  frameId === undefined
    ? ""
    : `Included pose-${frameId}.png is the actual native clothing layer, not a screenshot.
mask-${frameId}.png is its exact binary ownership (white editable, black protected).
The pose always faces right, regardless of the current preview direction. Do not
resize or move it. Paint inside the white mask, keep alpha, update the image
SHA-256 in recipe.json after editing, then build with the command above. The
included unedited recipe reproduces the artwork exactly under a new item ID.
pose-guide.json includes this source pose's anchors and action membership.
Inspect neighboring frames for temporal continuity after any repaint.`
}
`;
  return zipSync(
    {
      "base.garment.zip": new Uint8Array(item.bytes),
      "registration.json": new Uint8Array(verified.registrationBytes),
      "recipe.json": strToU8(JSON.stringify(recipe, null, 2) + "\n"),
      "README.md": strToU8(instructions),
      ...poseFiles,
    },
    { level: 6, mtime: new Date("2020-01-01T00:00:00Z") },
  );
}
