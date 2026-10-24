import type { RgbaPng } from "../core/baked-source";
import type { WardrobeProject } from "./contract";
import type { WardrobeCompositor } from "./compositor";

type Renderer = Pick<WardrobeCompositor, "manifest" | "renderFrame">;
export interface LookComparison {
  manifest: Renderer["manifest"];
  renderFrame: (id: number) => RgbaPng;
  renderSourceFrame: (id: number) => RgbaPng;
}

/** Translation only: two looks may have different hair padding. Align their
 * source attachment point in the union of both canvases, never crop or scale. */
export function createLookComparison(
  reference: Renderer,
  current: Renderer,
  referenceProject: Pick<WardrobeProject, "document">,
  currentProject: Pick<WardrobeProject, "document">,
): LookComparison {
  if (
    referenceProject.document.sourceSha256 !==
      currentProject.document.sourceSha256 ||
    referenceProject.document.registrationSha256 !==
      currentProject.document.registrationSha256 ||
    JSON.stringify(reference.manifest.animations) !==
      JSON.stringify(current.manifest.animations) ||
    reference.manifest.frames.map((f) => f.id).join(",") !==
      current.manifest.frames.map((f) => f.id).join(",")
  )
    throw Error(
      "Compare looks from the same original character, anchors and action sequence.",
    );
  const a = reference.manifest,
    b = current.manifest;
  const anchor = {
    x: Math.max(a.anchor.x, b.anchor.x),
    y: Math.max(a.anchor.y, b.anchor.y),
  };
  const width =
    anchor.x +
    Math.max(
      a.spritesheet.frameWidth - a.anchor.x,
      b.spritesheet.frameWidth - b.anchor.x,
    );
  const height =
    anchor.y +
    Math.max(
      a.spritesheet.frameHeight - a.anchor.y,
      b.spritesheet.frameHeight - b.anchor.y,
    );
  if (
    ![width, height, anchor.x, anchor.y].every(Number.isSafeInteger) ||
    width < 1 ||
    height < 1 ||
    width * height > 4_194_304
  )
    throw Error("These looks exceed the local comparison canvas limit.");
  const align = (renderer: Renderer, id: number): RgbaPng => {
    const input = renderer.renderFrame(id);
    if (
      input.width !== renderer.manifest.spritesheet.frameWidth ||
      input.height !== renderer.manifest.spritesheet.frameHeight
    )
      throw Error("Look dimensions changed during comparison.");
    const x = anchor.x - renderer.manifest.anchor.x,
      y = anchor.y - renderer.manifest.anchor.y;
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y))
      throw Error("Look comparison requires whole-pixel attachment points.");
    if (input.width === width && input.height === height && x === 0 && y === 0)
      return input;
    const pixels = new Uint8Array(width * height * 4);
    for (let row = 0; row < input.height; row++)
      pixels.set(
        input.pixels.subarray(
          row * input.width * 4,
          (row + 1) * input.width * 4,
        ),
        ((row + y) * width + x) * 4,
      );
    return { ...input, width, height, pixels };
  };
  return {
    // Viewing adapter only; not an exported CharacterPack manifest.
    manifest: {
      ...b,
      spritesheet: { ...b.spritesheet, frameWidth: width, frameHeight: height },
      anchor: { ...b.anchor, ...anchor },
    },
    renderFrame: (id) => align(current, id),
    renderSourceFrame: (id) => align(reference, id),
  };
}
