/** Reviewed source89 head + newly painted body. No resizing or repainting of the head. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
} from "../src/core/baked-source";

const { values } = parseArgs({
  options: {
    "body-a": { type: "string" },
    "body-b": { type: "string" },
    out: { type: "string" },
    "repo-root": { type: "string" },
    input: { type: "string" },
  },
  strict: true,
});
for (const key of ["body-a", "body-b", "out"] as const)
  if (!values[key]) throw Error(`Missing --${key}`);
const root = resolve(values["repo-root"] ?? process.cwd());
const out = resolve(values.out!);
const defaults = {
  107: { x: -9, y: -7 },
  108: { x: -18, y: -14 },
} as const;
const shifts: Record<107 | 108, { x: number; y: number }> = {
  107: { ...defaults[107] },
  108: { ...defaults[108] },
};
if (values.input) {
  const spec = JSON.parse(readFileSync(resolve(values.input), "utf8"));
  if (!Array.isArray(spec.frames) || spec.frames.length !== 2)
    throw Error(
      "Head translation input must contain frames107 and108 exactly once",
    );
  for (const id of [107, 108] as const) {
    const rows = spec.frames.filter((row: any) => row?.frameId === id);
    if (rows.length !== 1)
      throw Error(
        `Head translation input must contain frame${id} exactly once`,
      );
    const row = rows[0];
    if (!("headTranslation" in row)) continue;
    const translation = row.headTranslation;
    if (
      !translation ||
      typeof translation !== "object" ||
      Object.keys(translation).sort().join(",") !== "x,y" ||
      ![translation.x, translation.y].every(
        (value) => Number.isInteger(value) && value >= -128 && value <= 128,
      )
    )
      throw Error(
        `Frame${id} headTranslation requires integer x/y offsets within ±128 native pixels`,
      );
    if (
      (translation.x !== defaults[id].x || translation.y !== defaults[id].y) &&
      (!Number.isInteger(spec.edition) || spec.edition < 4)
    )
      throw Error(
        "Changed head placement requires a separately bound V4+ edition",
      );
    shifts[id] = { x: translation.x, y: translation.y };
  }
}
mkdirSync(out, { recursive: true });
const sha = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const sourceBytes = new Uint8Array(
  readFileSync(root + "/docs/kling-side-workspace/assets/male.source.zip"),
);
if (
  sha(sourceBytes) !==
  "7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42"
)
  throw Error("Native source changed; re-review source89 before assembly");
const zip = unzipSync(sourceBytes);
const manifest = JSON.parse(new TextDecoder().decode(zip["manifest.json"]));
const frame = manifest.frames.find((f: any) => f.id === 89);
if (!frame || frame.width !== 512 || frame.height !== 768)
  throw Error("Expected native frame89");
const page = decodeSourceRgbaPng(
  zip[frame.page ? `spritesheet-${frame.page}.png` : "spritesheet.png"],
);
const pixels = new Uint8Array(512 * 768 * 4);
for (let y = 0; y < 768; y++)
  pixels.set(
    page.pixels.subarray(
      ((frame.y + y) * page.width + frame.x) * 4,
      ((frame.y + y) * page.width + frame.x + 512) * 4,
    ),
    y * 512 * 4,
  );
const registration = JSON.parse(
  readFileSync(
    root + "/artwork/kling-side-expansion/templates/male.registration.json",
    "utf8",
  ),
);
const head = registration.frames
  .find((f: any) => f.frameId === 89)
  .protected.find((r: any) => r.label === "head").polygon;
// Source89-only reviewed posterior neck boundary excludes the old tank's grey collar.
const neckTrim = [
  [242, 430],
  [243, 433],
  [247, 437],
  [251, 442],
  [254, 446],
  [259, 451],
  [264, 456],
  [268, 461],
  [273, 465],
  [281, 469],
].map(([x, y]) => ({ x, y }));
const refinedHead = head.flatMap((p: any) =>
  p.x === 243 && p.y === 426
    ? [p, ...neckTrim]
    : (p.x === 248 && p.y === 450) ||
        (p.x === 263 && p.y === 455) ||
        (p.x === 268 && p.y === 463)
      ? []
      : [p],
);
function inside(x: number, y: number) {
  let hit = false;
  for (let i = 0, j = refinedHead.length - 1; i < refinedHead.length; j = i++) {
    const a = refinedHead[i],
      b = refinedHead[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
}
const mask = new Uint8Array(512 * 768);
for (let y = 0; y < 768; y++)
  for (let x = 0; x < 512; x++)
    mask[y * 512 + x] = y < 425 || inside(x + 0.5, y + 0.5) ? 255 : 0;
const image = (rgba: Uint8Array) => ({
  width: 512,
  height: 768,
  pixels: rgba,
  colorChunks: page.colorChunks,
});
writeFileSync(out + "/source89.png", encodeSourceRgbaPng(image(pixels)));
const sourceMaskRgba = new Uint8Array(pixels.length);
for (let i = 0; i < mask.length; i++)
  if (mask[i]) sourceMaskRgba.set([255, 255, 255, 255], i * 4);
writeFileSync(
  out + "/source89-head-mask.png",
  encodeSourceRgbaPng(image(sourceMaskRgba)),
);
const variants: any[] = [];
for (const [id, key] of [
  [107, "body-a"],
  [108, "body-b"],
] as const) {
  const { x: dx, y: dy } = shifts[id];
  const bodyBytes = new Uint8Array(readFileSync(resolve(values[key]!)));
  const body = decodeSourceRgbaPng(bodyBytes, { width: 512, height: 768 });
  const result = new Uint8Array(body.pixels);
  const targetMask = new Uint8Array(result.length);
  let visibleCopied = 0,
    clipped = 0,
    mismatch = 0;
  for (let y = 0; y < 768; y++)
    for (let x = 0; x < 512; x++) {
      const at = y * 512 + x;
      if (!mask[at]) continue;
      const tx = x + dx,
        ty = y + dy;
      if (tx < 0 || tx >= 512 || ty < 0 || ty >= 768) {
        if (pixels[at * 4 + 3]) clipped++;
        continue;
      }
      const dest = (ty * 512 + tx) * 4;
      result.set(pixels.subarray(at * 4, at * 4 + 4), dest);
      targetMask.set([255, 255, 255, 255], dest);
      if (pixels[at * 4 + 3]) visibleCopied++;
    }
  const encoded = encodeSourceRgbaPng(image(result));
  const decoded = decodeSourceRgbaPng(encoded);
  for (let y = 0; y < 768; y++)
    for (let x = 0; x < 512; x++) {
      const at = y * 512 + x,
        tx = x + dx,
        ty = y + dy;
      if (!mask[at] || tx < 0 || tx >= 512 || ty < 0 || ty >= 768) continue;
      for (let c = 0; c < 4; c++)
        if (decoded.pixels[(ty * 512 + tx) * 4 + c] !== pixels[at * 4 + c])
          mismatch++;
    }
  if (clipped || mismatch) throw Error("Head fidelity failure");
  writeFileSync(`${out}/${id}.png`, encoded);
  writeFileSync(
    `${out}/${id}.head-mask.png`,
    encodeSourceRgbaPng(image(targetMask)),
  );
  variants.push({
    frameId: id,
    bodyPngSha256: sha(bodyBytes),
    outputPngSha256: sha(encoded),
    translation: { x: dx, y: dy },
    visibleCopied,
    clippedVisibleHeadPixels: clipped,
    exactRgbaMismatchedChannels: mismatch,
    protectedHeadPolygon: refinedHead.map((p: any) => ({
      x: p.x + dx,
      y: p.y + dy,
    })),
  });
}
const audit = {
  sourceSha256: sha(sourceBytes),
  sourceFrameId: 89,
  sourceRgbaSha256: sha(pixels),
  headMaskSha256: sha(mask),
  variants,
  provenance:
    "Generated body poses; original head pixels copied at integer translation only. No head resampling, repainting, morphing or scale changes.",
  visualAcceptance:
    "pending; exact head pixels do not establish neck seam or motion quality",
};
writeFileSync(
  out + "/head-copy-audit.json",
  JSON.stringify(audit, null, 2) + "\n",
);
console.log(JSON.stringify(audit, null, 2));
