import { validateBakedManifest } from "./pack-v2";
import { BAKED_MAX_PAGES, validateMultipageBakedManifest } from "./pack-v3";
import type { CharacterPackV4Manifest } from "./types";

/** A distinct authored pixel contract: legacy smooth manifests stay strict.
 * PNG bytes are never quantized or resized by validation or playback. */
export function validateAuthoredPixelManifest(
  value: unknown,
): CharacterPackV4Manifest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Manifest must be an object.");
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 4)
    throw Error("schemaVersion must be 4 for an authored pixel CharacterPack.");
  if (
    !Array.isArray(data.additionalSheets) ||
    data.additionalSheets.length >= BAKED_MAX_PAGES
  )
    throw Error(
      "V4 requires 1–4 atlas pages, with additionalSheets explicitly declared.",
    );
  const scale = data.scale as Record<string, unknown> | undefined;
  if (
    !scale ||
    scale.pixelArt !== true ||
    scale.integerOnly !== true ||
    typeof scale.recommended !== "number" ||
    !Number.isSafeInteger(scale.recommended) ||
    scale.recommended < 1 ||
    scale.recommended > 16
  )
    throw Error(
      "V4 scale requires pixelArt=true, integerOnly=true and integer recommended zoom from 1 to 16.",
    );
  const anchor = data.anchor as Record<string, unknown> | undefined;
  if (
    !anchor ||
    !Number.isSafeInteger(anchor.x) ||
    !Number.isSafeInteger(anchor.y)
  )
    throw Error("V4 anchor must use integer pixel coordinates.");
  if (!Array.isArray(data.frames) || !data.frames.length)
    throw Error("V4 frames must declare one or more paged rectangles.");
  // Reuse all old geometry, overlap, action-reference and aggregate limits,
  // replacing sampling only in this private validation projection.
  const smooth = {
    ...data,
    scale: {
      pixelArt: false,
      integerOnly: false,
      recommended: scale.recommended,
    },
  };
  if (data.additionalSheets.length) {
    const normalized = validateMultipageBakedManifest({
      ...smooth,
      schemaVersion: 3,
    });
    return {
      ...normalized,
      schemaVersion: 4,
      scale: {
        pixelArt: true,
        integerOnly: true,
        recommended: scale.recommended,
      },
    };
  }
  if (
    data.frames.some(
      (frame) =>
        !frame ||
        typeof frame !== "object" ||
        (frame as Record<string, unknown>).page !== 0,
    )
  )
    throw Error("Every single-page V4 frame must explicitly use page 0.");
  const normalized = validateBakedManifest({ ...smooth, schemaVersion: 2 });
  return {
    ...normalized,
    schemaVersion: 4,
    additionalSheets: [],
    frames: normalized.frames.map((frame) => ({ ...frame, page: 0 })),
    scale: {
      pixelArt: true,
      integerOnly: true,
      recommended: scale.recommended,
    },
  };
}
