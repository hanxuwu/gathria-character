import index from "./outfit-previews/index.json";
import type { WardrobeSelection } from "./contract";

interface Preview {
  character: string;
  presetId: string;
  selection: WardrobeSelection;
  sourceSha256: string;
  registrationSha256: string;
  items: Array<{ id: string; sha256: string }>;
  file: string;
}
const images = import.meta.glob<string>("./outfit-previews/*.png", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
/** Never illustrate a changed library entry with an older revision's art.
 * Static thumbnails do not fetch garment banks or change the current hair. */
export function outfitPreview(
  character: string,
  presetId: string,
  selection: WardrobeSelection,
  sourceSha256: string,
  registrationSha256: string,
  items: Array<{ id: string; sha256?: string }>,
): string | undefined {
  const preview = (index.previews as Preview[]).find(
    (row) => row.character === character && row.presetId === presetId,
  );
  const available = new Map(items.map((item) => [item.id, item.sha256]));
  if (
    !preview ||
    preview.sourceSha256 !== sourceSha256 ||
    preview.registrationSha256 !== registrationSha256 ||
    Object.entries(selection).some(
      ([slot, id]) => preview.selection[slot as keyof WardrobeSelection] !== id,
    ) ||
    preview.items.some((ref) => available.get(ref.id) !== ref.sha256)
  )
    return undefined;
  return images[`./outfit-previews/${preview.file}`];
}
