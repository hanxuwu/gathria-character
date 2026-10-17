import { strToU8, zipSync, zlibSync } from "fflate";
import { readBoundedArchive, type ArchivePolicy } from "./bounded-archive";
import { decodeAttachment, encodeAttachmentPng } from "./skin-io";
import { decodeWardrobeItemPart } from "./wardrobe-items";
import { validateWardrobeIdentity } from "./identities";
import { IDENTITY_SLOTS, type CustomWardrobeIdentity } from "./identity-types";
import { FRAME_HEIGHT, FRAME_WIDTH } from "./types";

const MAX_ZIP = 6 * 1024 * 1024;
const MAX_IMAGE = 1024 * 1024;
const MAX_TEXT = 128 * 1024;
const PIXELS = FRAME_WIDTH * FRAME_HEIGHT;
const decoder = new TextDecoder("utf-8", { fatal: true });
const policy: ArchivePolicy = {
  label: "Character identity ZIP",
  maxArchiveBytes: MAX_ZIP,
  maxExpandedBytes: MAX_ZIP,
  minFiles: 7,
  maxFiles: 10,
  files: {
    "identity.json": MAX_TEXT,
    "TEMPLATE.md": MAX_TEXT,
    ...Object.fromEntries(
      IDENTITY_SLOTS.flatMap((slot) => [
        [`artwork/${slot}.png`, MAX_IMAGE],
        [`masks/${slot}.png`, MAX_IMAGE],
      ]),
    ),
  },
  required: ["identity.json"],
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Identity metadata must be an object.");
  return value as Record<string, unknown>;
}
function base64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}

export async function exportWardrobeIdentity(
  value: CustomWardrobeIdentity,
): Promise<Blob> {
  const identity = validateWardrobeIdentity(value);
  const files: Record<string, Uint8Array> = {
    "identity.json": strToU8(
      JSON.stringify(
        {
          ...identity,
          parts: identity.parts.map(({ data: _data, ...part }) => part),
        },
        null,
        2,
      ),
    ),
    "TEMPLATE.md": strToU8(
      `# ${identity.name} — registered character identity\n\nEvery artwork and mask uses a 192×256 transparent canvas. Shared foot anchor (96,240), neck registration (96,118), source jaw binding and head placement must remain consistent across all three expressions. Heads include their face, ears, front hair and neck; optional back-hair is drawn behind the body. No clothing or limbs belong to this package.\n\nMasks are semantic data: RGB (material,0,0), with 0=fixed eyes/outlines/accessories, 1=skin, 2=hair. Match artwork alpha exactly using only 0 or 255; transparent pixels have zero RGBA. Keep all parts on the identity's declared source skin/hair palette. Changing a source color requires changing its matching sourceAppearance reference. Identity source colors preserve the authored pixels exactly; choosing another skin/hair color applies deterministic mask recoloring.\n\nKeep the three complete expression heads, registered neck and actor silhouette stable. Do not move heads independently to fit expressions. Do not add archive paths. Use a new custom- identifier, preserve creator/license information and record edits before importing a new character. Current provenance: ${identity.provenance}\n`,
    ),
  };
  for (const part of identity.parts) {
    const raw = decodeWardrobeItemPart(part.data),
      artwork = new Uint8ClampedArray(PIXELS * 4),
      mask = new Uint8ClampedArray(PIXELS * 4);
    for (let p = 0; p < PIXELS; p++) {
      artwork.set(raw.subarray(p * 5, p * 5 + 4), p * 4);
      mask[p * 4] = raw[p * 5 + 4];
      mask[p * 4 + 3] = raw[p * 5 + 3];
    }
    files[`artwork/${part.slot}.png`] = await encodeAttachmentPng(artwork);
    files[`masks/${part.slot}.png`] = await encodeAttachmentPng(mask);
  }
  const bytes = zipSync(files);
  readBoundedArchive(bytes, policy);
  return new Blob([bytes], { type: "application/zip" });
}

/** Strict bounded admission completes before callers install any library data. */
export async function importWardrobeIdentity(
  file: Blob,
): Promise<CustomWardrobeIdentity> {
  if (file.size > MAX_ZIP)
    throw Error("Character identity ZIP must be at most 6 MiB.");
  const files = readBoundedArchive(
    new Uint8Array(await file.arrayBuffer()),
    policy,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(files["identity.json"]));
  } catch {
    throw Error("identity.json must be valid UTF-8 JSON.");
  }
  const raw = object(parsed);
  if (!Array.isArray(raw.parts) || raw.parts.length < 3 || raw.parts.length > 4)
    throw Error(
      "identity.json must declare three heads and optional back-hair.",
    );
  const paths = new Set(["identity.json", "TEMPLATE.md"]);
  const declared = raw.parts.map((value) => {
    const part = object(value);
    if (!(IDENTITY_SLOTS as readonly unknown[]).includes(part.slot))
      throw Error("Identity contains an unknown or non-identity slot.");
    if (Object.hasOwn(part, "data"))
      throw Error(
        "Portable identities store pixels in artwork/masks PNGs, not identity.json data.",
      );
    const artwork = `artwork/${part.slot}.png`,
      mask = `masks/${part.slot}.png`;
    if (paths.has(artwork)) throw Error("Identity contains a duplicate slot.");
    paths.add(artwork);
    paths.add(mask);
    if (!files[artwork] || !files[mask])
      throw Error("Every identity part needs both artwork and mask PNGs.");
    return { part, artwork, mask };
  });
  if (Object.keys(files).some((path) => !paths.has(path)))
    throw Error("Identity PNGs must exactly match the declared parts.");
  const parts = [];
  for (const { part, artwork: artworkPath, mask: maskPath } of declared) {
    const artwork = await decodeAttachment(
      new Blob([files[artworkPath]], { type: "image/png" }),
    );
    const mask = await decodeAttachment(
      new Blob([files[maskPath]], { type: "image/png" }),
    );
    if (artwork.thresholdedPixels || mask.thresholdedPixels)
      throw Error(
        "Identity art and masks must use binary alpha; import does not normalize them.",
      );
    const decoded = new Uint8Array(PIXELS * 5);
    for (let p = 0; p < PIXELS; p++) {
      const source = p * 4,
        target = p * 5;
      if (artwork.pixels[source + 3] !== mask.pixels[source + 3])
        throw Error("Identity mask alpha must exactly match artwork alpha.");
      if (
        mask.pixels[source] > 2 ||
        mask.pixels[source + 1] ||
        mask.pixels[source + 2]
      )
        throw Error("Identity mask RGB must be (material 0–2,0,0).");
      decoded.set(artwork.pixels.subarray(source, source + 4), target);
      decoded[target + 4] = mask.pixels[source];
    }
    parts.push({ ...part, data: base64(zlibSync(decoded)) });
  }
  return validateWardrobeIdentity({ ...raw, parts });
}
