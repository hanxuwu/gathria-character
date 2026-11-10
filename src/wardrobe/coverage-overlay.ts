import type { RgbaPng } from "../core/baked-source";
import { WARDROBE_COMPOSITION_ORDER, type WardrobeProject } from "./contract";
import { decodedGarmentPage } from "./garment-pages";

/** Read-only visualization of selected garment ownership, in native source
 * coordinates. Cyan is painted cloth; magenta is deliberate transparent
 * replacement. It is not a skin detector or automatic defect score. */
export function coverageOverlay(
  project: WardrobeProject,
  frameId: number,
): RgbaPng {
  const width = project.registration.frameWidth;
  const height = project.registration.frameHeight;
  const pixels = new Uint8Array(width * height * 4);
  for (const slot of WARDROBE_COMPOSITION_ORDER) {
    const id = project.document.selection[slot];
    if (!id) continue;
    const item = project.items.find((entry) => entry.manifest.id === id);
    if (!item) throw Error(`Selected clothing ${id} is unavailable.`);
    const frame = item.manifest.frames.find(
      (entry) => entry.frameId === frameId,
    );
    if (!frame)
      throw Error(`Selected clothing has no native frame ${frameId}.`);
    const spec = item.manifest.pages[frame.page];
    const files = item.pages[frame.page];
    const { patch, ownership } = decodedGarmentPage(
      `${item.sha256}:${frame.page}`,
      files.patch,
      files.ownership,
      spec,
    );
    for (let y = 0; y < frame.rect.height; y++) {
      for (let x = 0; x < frame.rect.width; x++) {
        const index = (frame.rect.y + y) * spec.width + frame.rect.x + x;
        if (ownership[index] !== 255) continue;
        const tx = frame.offset.x + x,
          ty = frame.offset.y + y;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
        const color = patch.pixels[index * 4 + 3]
          ? [0, 196, 224, 110]
          : [236, 60, 174, 145];
        pixels.set(color, (ty * width + tx) * 4);
      }
    }
  }
  return { width, height, pixels, colorChunks: [] };
}
