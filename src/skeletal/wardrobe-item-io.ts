import { strToU8, zipSync, zlibSync } from "fflate";
import { readBoundedArchive, type ArchivePolicy } from "./bounded-archive";
import { decodeAttachment, encodeAttachmentPng } from "./skin-io";
import { ALL_SLOTS, FRAME_HEIGHT, FRAME_WIDTH, type Slot } from "./types";
import {
  decodeWardrobeItemPart,
  validateWardrobeItem,
  type CustomWardrobeItem,
} from "./wardrobe-items";

const MAX_ZIP = 12 * 1024 * 1024;
const MAX_IMAGE = 1024 * 1024;
const MAX_TEXT = 128 * 1024;
const PIXEL_COUNT = FRAME_WIDTH * FRAME_HEIGHT;
const decoder = new TextDecoder("utf-8", { fatal: true });
const policy: ArchivePolicy = {
  label: "Wardrobe item ZIP",
  maxArchiveBytes: MAX_ZIP,
  maxExpandedBytes: MAX_ZIP,
  minFiles: 5,
  maxFiles: ALL_SLOTS.length * 2 + 2,
  files: {
    "item.json": MAX_TEXT,
    "TEMPLATE.md": MAX_TEXT,
    ...Object.fromEntries(
      ALL_SLOTS.flatMap((slot) => [
        [`artwork/${slot}.png`, MAX_IMAGE],
        [`masks/${slot}.png`, MAX_IMAGE],
      ]),
    ),
  },
  required: ["item.json"],
};

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function base64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}

/** PNG pairs keep artwork ownership and recolor semantics explicit and editable.
 * Material zero means fixed color, not a missing mask. Both PNGs share alpha. */
export async function exportWardrobeItem(
  item: CustomWardrobeItem,
): Promise<Blob> {
  const valid = validateWardrobeItem(item);
  const metadata = {
    ...valid,
    parts: valid.parts.map(({ data: _data, ...part }) => part),
  };
  const files: Record<string, Uint8Array> = {
    "item.json": strToU8(JSON.stringify(metadata, null, 2)),
    "TEMPLATE.md": strToU8(
      `# ${valid.name} — ${valid.group} wardrobe item\n\n` +
        `Every artwork/*.png and masks/*.png is a full ${FRAME_WIDTH}×${FRAME_HEIGHT} canvas. Keep registration and canvas size unchanged; the shared foot anchor is (96,240). Edit artwork and mask together. Keep background pixels transparent and use only binary alpha (0 or 255).\n\n` +
        `Masks are semantic data, not an illustration: at every visible artwork pixel use RGB (material,0,0) with material 0=fixed, 1=skin, 2=hair, 3=upper clothing, 4=lower clothing, 5=shoe. The mask alpha must exactly equal the artwork alpha. Transparent pixels have RGBA (0,0,0,0). Each used nonzero material needs its source hex color in that part's palette. Only materials belonging to this garment group are accepted. Do not paste a visual color legend into the mask.\n\n` +
        `item.json lists each owned slot and its source palette. Its chains/ankles describe source registration. Keep upper and lower limb artwork overlapping around the shared joint; keep torso and hips filled beneath moving limbs. Do not include head, hair, neighboring garments or decorative guides in these parts. Do not add or rename archive paths.\n\n` +
        `Before importing a new garment, choose a distinct custom- identifier (at most 32 characters), name, and provenance in item.json. Preserve the actual creator/license and describe your edits. This template currently comes from: ${valid.provenance}\n`,
    ),
  };
  for (const part of valid.parts) {
    // The validator has already bounded inflation and checked every byte.
    const decoded = decodeWardrobeItemPart(part.data);
    const artwork = new Uint8ClampedArray(PIXEL_COUNT * 4);
    const mask = new Uint8ClampedArray(PIXEL_COUNT * 4);
    for (let pixel = 0; pixel < PIXEL_COUNT; pixel++) {
      const source = pixel * 5,
        target = pixel * 4;
      artwork.set(decoded.subarray(source, source + 4), target);
      mask[target] = decoded[source + 4];
      mask[target + 3] = decoded[source + 3];
    }
    files[`artwork/${part.slot}.png`] = await encodeAttachmentPng(artwork);
    files[`masks/${part.slot}.png`] = await encodeAttachmentPng(mask);
  }
  const bytes = zipSync(files);
  readBoundedArchive(bytes, policy);
  return new Blob([bytes], { type: "application/zip" });
}

/** Decode all parts and validate their ownership before returning any new item.
 * The caller can safely apply this atomically after this promise resolves. */
export async function importWardrobeItem(
  file: Blob,
): Promise<CustomWardrobeItem> {
  if (file.size > MAX_ZIP)
    throw Error("Wardrobe item ZIP must be at most 12 MiB.");
  const files = readBoundedArchive(
    new Uint8Array(await file.arrayBuffer()),
    policy,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(files["item.json"]));
  } catch {
    throw Error("item.json must be valid UTF-8 JSON.");
  }
  const raw = object(parsed, "item.json");
  if (
    !Array.isArray(raw.parts) ||
    !raw.parts.length ||
    raw.parts.length > ALL_SLOTS.length
  )
    throw Error("item.json must declare its owned wardrobe parts.");
  const paths = new Set(["item.json", "TEMPLATE.md"]);
  const declared = raw.parts.map((value, index) => {
    const part = object(value, `item.parts[${index}]`);
    if (
      typeof part.slot !== "string" ||
      !(ALL_SLOTS as readonly string[]).includes(part.slot)
    )
      throw Error("Item part has an unknown slot.");
    if (Object.hasOwn(part, "data"))
      throw Error(
        "Portable item parts store pixels in artwork/masks PNGs, not item.json data.",
      );
    const artworkPath = `artwork/${part.slot}.png`,
      maskPath = `masks/${part.slot}.png`;
    if (paths.has(artworkPath)) throw Error("Item contains a duplicate slot.");
    paths.add(artworkPath);
    paths.add(maskPath);
    if (!files[artworkPath] || !files[maskPath])
      throw Error(`Item ${part.slot} requires both artwork and mask PNGs.`);
    return { part, artworkPath, maskPath };
  });
  if (Object.keys(files).some((path) => !paths.has(path)))
    throw Error(
      "Item PNGs must exactly match the parts declared in item.json.",
    );
  const parts = [];
  for (const { part, artworkPath, maskPath } of declared) {
    const artwork = await decodeAttachment(
      new Blob([files[artworkPath]], { type: "image/png" }),
    );
    const mask = await decodeAttachment(
      new Blob([files[maskPath]], { type: "image/png" }),
    );
    if (artwork.thresholdedPixels || mask.thresholdedPixels)
      throw Error(
        `${part.slot} artwork and mask must use binary alpha; partial alpha is not normalized on item import.`,
      );
    const decoded = new Uint8Array(PIXEL_COUNT * 5);
    for (let pixel = 0; pixel < PIXEL_COUNT; pixel++) {
      const source = pixel * 4,
        target = pixel * 5;
      if (artwork.pixels[source + 3] !== mask.pixels[source + 3])
        throw Error(`${part.slot} mask alpha must exactly match the artwork.`);
      if (
        mask.pixels[source] > 5 ||
        mask.pixels[source + 1] ||
        mask.pixels[source + 2]
      )
        throw Error(`${part.slot} mask RGB must be (material 0–5,0,0).`);
      decoded.set(artwork.pixels.subarray(source, source + 4), target);
      decoded[target + 4] = mask.pixels[source];
    }
    parts.push({
      ...part,
      slot: part.slot as Slot,
      data: base64(zlibSync(decoded)),
    });
  }
  return validateWardrobeItem({ ...raw, parts });
}
