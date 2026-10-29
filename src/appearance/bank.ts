import { sha256 } from "../core/sha256";
import { createCooperativeYield } from "../core/cooperative-yield";
import {
  assertSourcePreparationActive,
  prepareBoundedArchive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type { Point, Rect, WardrobeRegistration } from "../wardrobe/contract";
import {
  checkPageHeader,
  decodedGarmentPage,
  validateGarmentPage,
} from "../wardrobe/garment-pages";
import {
  APPEARANCE_MAX_BYTES,
  APPEARANCE_MAX_METADATA_BYTES,
  APPEARANCE_MAX_PAGES,
  validateAppearanceBankManifest,
  type AppearanceBank,
  type AppearancePose,
} from "./contract";

const decoder = new TextDecoder("utf-8", { fatal: true });
// Keep validation facts, not decoded pixels. A complete head bank can exceed
// the shared decoded-page cache; rereading it on every selection would evict
// and decode its own pages repeatedly. Content is copied and rehashed below,
// then archive structure, bindings and page headers are still checked on hits.
const checkedBanks = new Set<string>();

export function insideAppearancePolygon(
  x: number,
  y: number,
  polygon: Point[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
    if (
      Math.abs(cross) < 1e-7 &&
      x >= Math.min(a.x, b.x) &&
      x <= Math.max(a.x, b.x) &&
      y >= Math.min(a.y, b.y) &&
      y <= Math.max(a.y, b.y)
    )
      return true;
    if (
      a.y > y !== b.y > y &&
      x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)
    )
      inside = !inside;
  }
  return inside;
}
function insideRect(x: number, y: number, rect: Rect) {
  return (
    x >= rect.x &&
    y >= rect.y &&
    x <= rect.x + rect.width &&
    y <= rect.y + rect.height
  );
}

/** Complete, bounded bank import. All PNG streams and every style/pose ownership
 * mask are checked before a bank can enter a live wardrobe project. */
export async function readAppearanceBank(
  bytes: Uint8Array,
  registration: WardrobeRegistration,
  registrationSha256: string,
  options: SourcePreparationOptions = {},
): Promise<AppearanceBank> {
  assertSourcePreparationActive(options);
  if (bytes.length > APPEARANCE_MAX_BYTES)
    throw Error("Appearance bank exceeds its 64 MiB limit.");
  const copied = new Uint8Array(bytes),
    hash = await sha256(copied);
  assertSourcePreparationActive(options);
  const allowed: Record<string, number> = {
    "manifest.json": APPEARANCE_MAX_METADATA_BYTES,
  };
  const paired: Array<readonly [string, string]> = [];
  for (let i = 0; i < APPEARANCE_MAX_PAGES; i++) {
    allowed[`patches-${i}.png`] = APPEARANCE_MAX_BYTES;
    allowed[`ownership-${i}.png`] = APPEARANCE_MAX_BYTES;
    paired.push([`patches-${i}.png`, `ownership-${i}.png`]);
  }
  const files = await prepareBoundedArchive(
    copied,
    {
      label: "Appearance bank",
      maxArchiveBytes: APPEARANCE_MAX_BYTES,
      maxExpandedBytes: APPEARANCE_MAX_BYTES,
      minFiles: 3,
      maxFiles: 1 + 2 * APPEARANCE_MAX_PAGES,
      files: allowed,
      required: ["manifest.json", "patches-0.png", "ownership-0.png"],
      paired,
    },
    options,
  );
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(files["manifest.json"]));
  } catch {
    throw Error("Appearance manifest must be valid UTF-8 JSON.");
  }
  const manifest = validateAppearanceBankManifest(
    raw,
    registration,
    registrationSha256,
  );
  if (Object.keys(files).length !== 1 + 2 * manifest.pages.length)
    throw Error("Appearance bank has undeclared pages.");
  const validationKey = `${hash}:${registrationSha256}`;
  const checked = checkedBanks.has(validationKey);
  const pages: AppearanceBank["pages"] = [];
  for (let i = 0; i < manifest.pages.length; i++) {
    assertSourcePreparationActive(options);
    const declared = manifest.pages[i],
      patch = files[declared.file],
      ownership = files[declared.maskFile];
    if (!patch || !ownership)
      throw Error("Appearance bank is missing an atlas page.");
    checkPageHeader(patch, declared.width, declared.height);
    checkPageHeader(ownership, declared.width, declared.height);
    if (!checked)
      await validateGarmentPage(
        patch,
        ownership,
        declared,
        `appearance:${hash}:${i}`,
        options,
      );
    pages.push({
      patch: new Uint8Array(patch),
      ownership: new Uint8Array(ownership),
    });
  }
  if (!checked) {
    const yieldValidation = createCooperativeYield(() =>
      assertSourcePreparationActive(options),
    );
    const poses = new Map<number, AppearancePose>(
      manifest.poses.map((pose) => [pose.frameId, pose]),
    );
    for (const style of manifest.styles)
      for (const layer of style.layers)
        for (const frame of layer.frames) {
          assertSourcePreparationActive(options);
          if (frame.mode === "source") continue;
          const page = pages[frame.page],
            declared = manifest.pages[frame.page];
          const { ownership } = decodedGarmentPage(
            `appearance:${hash}:${frame.page}`,
            page.patch,
            page.ownership,
            declared,
          );
          const pose = poses.get(frame.frameId)!;
          for (let y = 0; y < frame.rect.height; y++)
            for (let x = 0; x < frame.rect.width; x++) {
              const index =
                (frame.rect.y + y) * declared.width + frame.rect.x + x;
              if (!ownership[index]) continue;
              const px = frame.offset.x + x + 0.5,
                py = frame.offset.y + y + 0.5;
              if (
                layer.role === "face"
                  ? !insideAppearancePolygon(px, py, pose.facePolygon)
                  : !insideRect(px, py, pose.hairBounds)
              )
                throw Error(
                  `Appearance ${style.id} ${layer.role} ownership exceeds its registered region in frame ${frame.frameId}.`,
                );
            }
          // Keep the full pose checks; yield by elapsed work rather than
          // imposing a clamped browser timer on every small layer/pose.
          await yieldValidation();
        }
  }
  assertSourcePreparationActive(options);
  // Promote only after every stream and every ownership region succeeded and
  // the operation remains active. A failed/aborted read never becomes a hit.
  checkedBanks.delete(validationKey);
  checkedBanks.add(validationKey);
  while (checkedBanks.size > 16)
    checkedBanks.delete(checkedBanks.values().next().value!);
  return { bytes: copied, sha256: hash, manifest, pages };
}
