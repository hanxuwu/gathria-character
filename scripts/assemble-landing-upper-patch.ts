/** Copy a reviewed painted upper-body region over the frozen R2 body.
 * The mask selects artwork; it does not synthesize body or clothing geometry.
 * Reattach the exact source89 head with assemble-landing-production-base.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
} from "../src/core/baked-source";

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    patch: { type: "string" },
    mask: { type: "string" },
    out: { type: "string" },
  },
  strict: true,
});
for (const key of ["base", "patch", "mask", "out"] as const)
  if (!values[key]) throw Error(`Missing --${key}`);
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const read = (path: string) => new Uint8Array(readFileSync(resolve(path)));
const baseBytes = read(values.base!),
  patchBytes = read(values.patch!),
  maskBytes = read(values.mask!);
if (
  sha(baseBytes) !==
  "db5fa5c5967201b7921d3cd7b7eb11ebb9a527a89ed17c4d0fb3b4a5fa5a6247"
)
  throw Error(
    "Expected the frozen R2 frame108 body; re-review before changing this base",
  );
const base = decodeSourceRgbaPng(baseBytes, { width: 512, height: 768 });
const patch = decodeSourceRgbaPng(patchBytes, { width: 512, height: 768 });
const mask = decodeSourceRgbaPng(maskBytes, { width: 512, height: 768 });
const pixels = new Uint8Array(base.pixels);
let owned = 0,
  changed = 0,
  visibleChanged = 0;
const bounds = { left: 512, top: 768, right: 0, bottom: 0 };
for (let y = 0; y < 768; y++)
  for (let x = 0; x < 512; x++) {
    const p = (y * 512 + x) * 4,
      alpha = mask.pixels[p + 3];
    if (alpha !== 0 && alpha !== 255)
      throw Error("Upper edit ownership must be binary");
    if (!alpha) continue;
    if (y >= 570 || x < 125 || x > 320 || y < 400)
      throw Error("Upper patch ownership leaves reviewed upper-body envelope");
    owned++;
    bounds.left = Math.min(bounds.left, x);
    bounds.right = Math.max(bounds.right, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.bottom = Math.max(bounds.bottom, y);
    const differs = [0, 1, 2, 3].some(
      (c) => pixels[p + c] !== patch.pixels[p + c],
    );
    if (differs) {
      changed++;
      if (pixels[p + 3] || patch.pixels[p + 3]) visibleChanged++;
    }
    pixels.set(patch.pixels.subarray(p, p + 4), p);
  }
if (owned < 1000 || visibleChanged < 100)
  throw Error("Upper patch does not contain a substantive painted correction");
const result = encodeSourceRgbaPng({ ...base, pixels });
const decoded = decodeSourceRgbaPng(result);
let unownedMismatches = 0,
  lowerMismatches = 0;
for (let y = 0; y < 768; y++)
  for (let x = 0; x < 512; x++) {
    const p = (y * 512 + x) * 4;
    for (let c = 0; c < 4; c++)
      if (decoded.pixels[p + c] !== base.pixels[p + c]) {
        if (!mask.pixels[p + 3]) unownedMismatches++;
        if (y >= 570) lowerMismatches++;
      }
  }
if (unownedMismatches || lowerMismatches)
  throw Error("Patch changed frozen pixels");
const out = resolve(values.out!);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, result);
const audit = {
  format: "gathria-owned-upper-body-edit",
  version: 1,
  sourceFrame: 108,
  basePngSha256: sha(baseBytes),
  patchPngSha256: sha(patchBytes),
  maskPngSha256: sha(maskBytes),
  outputPngSha256: sha(result),
  ownedPixels: owned,
  changedPixels: changed,
  visibleChangedPixels: visibleChanged,
  ownershipBounds: bounds,
  unownedRgbaMismatchedChannels: unownedMismatches,
  lowerBodyFromY: 570,
  lowerBodyRgbaMismatchedChannels: lowerMismatches,
  method:
    "Copy actual painted RGBA only inside reviewed binary ownership. No resampling, filtering, morphing, or blending. Original head is reapplied in a separate exact-copy step.",
  visualAcceptance: "pending",
};
writeFileSync(out + ".audit.json", JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify(audit));
