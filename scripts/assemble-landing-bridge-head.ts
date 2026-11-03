import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
} from "../src/core/baked-source";
import { decodeGarmentPage } from "../src/wardrobe/garment-page-codec";
/** Source89-specific reviewed assembly. This is NOT a generic head extractor.
 * Keep the reviewed source frame, mask, scale and integer translations fixed.
 * The body inputs must already be 512x768 and must not contain painted faces.
 * Run from the repository root after bundling with esbuild --platform=node.
 */
const { values } = parseArgs({
  options: {
    "base-pack": { type: "string" },
    "body-a": { type: "string" },
    "body-b": { type: "string" },
    out: { type: "string" },
    "repo-root": { type: "string" },
  },
  strict: true,
});
for (const name of ["base-pack", "body-a", "body-b", "out"] as const)
  if (!values[name]) throw Error("Missing --" + name);
const root = resolve(values["repo-root"] ?? process.cwd()),
  out = resolve(values.out!),
  assembled = out;
const expectedSourceRgba =
  "00ade68244ccfd0b46f5667085bd1a3d68b078fabdea738843eff60c3c0d86da";
const expectedHeadMask =
  "3088fb7b2354b4580f5a11a4f168888e8eb009d94011d7bd73a1259acd61c3bc";
const expectedHeadLayerRgba =
  "a01045088b03100244067b842b31c50411c4c8571e5d8596f5c2dd67d7d3bdb3";
mkdirSync(out, { recursive: true });
mkdirSync(assembled, { recursive: true });
const hash = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const z = unzipSync(
    new Uint8Array(
      readFileSync(root + "/docs/matched-hair/assets/male-side.appearance.zip"),
    ),
  ),
  bank = JSON.parse(new TextDecoder().decode(z["manifest.json"]));
const rz = unzipSync(
    new Uint8Array(
      readFileSync(root + "/docs/kling-side-workspace/assets/male.source.zip"),
    ),
  ),
  manifest = JSON.parse(new TextDecoder().decode(rz["manifest.json"]));
const frame = manifest.frames.find((f: any) => f.id === 89),
  nativePage = decodeSourceRgbaPng(
    rz[frame.page ? `spritesheet-${frame.page}.png` : "spritesheet.png"],
  );
const native = new Uint8Array(512 * 768 * 4);
for (let y = 0; y < 768; y++)
  native.set(
    nativePage.pixels.subarray(
      ((frame.y + y) * nativePage.width + frame.x) * 4,
      ((frame.y + y) * nativePage.width + frame.x + 512) * 4,
    ),
    y * 512 * 4,
  );
const baseBytes = new Uint8Array(readFileSync(resolve(values["base-pack"]!))),
  baseZip = unzipSync(baseBytes),
  baseManifest = JSON.parse(new TextDecoder().decode(baseZip["manifest.json"]));
const baseFrame = baseManifest.frames.find((f: any) => f.id === 89);
if (!baseFrame || baseFrame.width !== 512 || baseFrame.height !== 768)
  throw Error("The reviewed base pack needs frame89 at512x768");
const baseSheet =
  (baseFrame.page ?? 0) === 0
    ? baseManifest.spritesheet
    : baseManifest.additionalSheets?.[baseFrame.page - 1];
if (!baseSheet || !baseZip[baseSheet.file])
  throw Error("Missing frame89 atlas");
const decodedBase = decodeSourceRgbaPng(baseZip[baseSheet.file], {
  width: baseSheet.width,
  height: baseSheet.height,
});
if (
  baseFrame.x < 0 ||
  baseFrame.y < 0 ||
  baseFrame.x + 512 > decodedBase.width ||
  baseFrame.y + 768 > decodedBase.height
)
  throw Error("Frame89 crop outside atlas");
const basePixels = new Uint8Array(512 * 768 * 4);
for (let y = 0; y < 768; y++)
  basePixels.set(
    decodedBase.pixels.subarray(
      ((baseFrame.y + y) * decodedBase.width + baseFrame.x) * 4,
      ((baseFrame.y + y) * decodedBase.width + baseFrame.x + 512) * 4,
    ),
    y * 512 * 4,
  );
const source = {
  width: 512,
  height: 768,
  pixels: basePixels,
  colorChunks: decodedBase.colorChunks.map((c) => new Uint8Array(c)),
};
if (hash(source.pixels) !== expectedSourceRgba)
  throw Error(
    "Base89 RGBA differs from the reviewed V7 source; refusing head assembly",
  );
const sourceBytes = encodeSourceRgbaPng(source);
writeFileSync(out + "/source89.png", sourceBytes);
const reg = JSON.parse(
    readFileSync(
      root + "/artwork/kling-side-expansion/templates/male.registration.json",
      "utf8",
    ),
  ),
  protectedRegions = reg.frames.find((f: any) => f.frameId === 89).protected,
  head = protectedRegions.find((r: any) => r.label === "head").polygon;
const pose = bank.poses.find((p: any) => p.frameId === 89);
// Pixel-center scan conversion follows src/appearance/render.ts, no soft mask or feather.
function polygonRows(polygons: any[]) {
  const rows = new Map<number, Array<[number, number]>>();
  for (const polygon of polygons) {
    const min = Math.ceil(Math.min(...polygon.map((p: any) => p.y)) - 0.5),
      max = Math.floor(Math.max(...polygon.map((p: any) => p.y)) - 0.5);
    for (let y = min; y <= max; y++) {
      const cy = y + 0.5,
        crossings: number[] = [],
        spans = rows.get(y) ?? [];
      const add = (a: number, b: number) => {
        const left = Math.ceil(Math.min(a, b) - 0.5 - 1e-9),
          right = Math.floor(Math.max(a, b) - 0.5 + 1e-9);
        if (left <= right) spans.push([left, right]);
      };
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j],
          b = polygon[i];
        if (a.y > cy !== b.y > cy)
          crossings.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
        if (Math.abs(a.y - cy) < 1e-9 && Math.abs(b.y - cy) < 1e-9)
          add(a.x, b.x);
        else if (Math.abs(a.y - cy) < 1e-9) add(a.x, a.x);
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        add(crossings[i], crossings[i + 1]);
      if (spans.length) rows.set(y, spans);
    }
  }
  return rows;
}
const contains = (rows: ReturnType<typeof polygonRows>, x: number, y: number) =>
    (rows.get(y) ?? []).some(([l, r]) => x >= l && x <= r),
  inRect = (r: any, x: number, y: number) =>
    x + 0.5 >= r.x &&
    y + 0.5 >= r.y &&
    x + 0.5 <= r.x + r.width &&
    y + 0.5 <= r.y + r.height;
// Source89-only manually reviewed skin-side neck boundary: omit the old grey tank collar.
const neckTrim = [
  { x: 242, y: 430 },
  { x: 243, y: 433 },
  { x: 247, y: 437 },
  { x: 251, y: 442 },
  { x: 254, y: 446 },
  { x: 259, y: 451 },
  { x: 264, y: 456 },
  { x: 268, y: 461 },
  { x: 273, y: 465 },
  { x: 281, y: 469 },
];
const refinedHead = head.flatMap((p: any) =>
  p.x === 243 && p.y === 426
    ? [p, ...neckTrim]
    : (p.x === 248 && p.y === 450) ||
        (p.x === 263 && p.y === 455) ||
        (p.x === 268 && p.y === 463)
      ? []
      : [p],
);
const headRows = polygonRows([refinedHead]),
  foregroundRows = polygonRows([
    ...pose.foreground,
    ...protectedRegions
      .filter((r: any) => r.label !== "head")
      .map((r: any) => r.polygon),
  ]);
const mask = new Uint8Array(512 * 768),
  reasons = new Uint8Array(512 * 768);
for (let y = 0; y < 768; y++)
  for (let x = 0; x < 512; x++) {
    const p = y * 512 + x;
    if (y < 425) reasons[p] |= 1;
    if (contains(headRows, x, y)) reasons[p] |= 2;
  }
const hairAdded: Record<string, number> = {};
for (const layer of bank.styles.find(
  (s: any) => s.id === "side-part-matched-v1",
).layers) {
  const crop = layer.frames.find((f: any) => f.frameId === 89);
  if (crop.mode === "source") continue;
  const spec = bank.pages[crop.page],
    { patch, ownership } = decodeGarmentPage(
      z[spec.file],
      z[spec.maskFile],
      spec,
    );
  let added = 0;
  for (let y = 0; y < crop.rect.height; y++)
    for (let x = 0; x < crop.rect.width; x++) {
      const at = ((crop.rect.y + y) * patch.width + crop.rect.x + x) * 4;
      if (ownership[at / 4] !== 255 || !patch.pixels[at + 3]) continue;
      const fx = crop.offset.x + x,
        fy = crop.offset.y + y;
      if (fx < 0 || fy < 0 || fx >= 512 || fy >= 768) continue;
      const p = fy * 512 + fx,
        sa = native[p * 4 + 3],
        foreground = sa !== 0 && contains(foregroundRows, fx, fy);
      if (!inRect(pose.hairBounds, fx, fy)) throw Error("Hair out of bounds");
      if (
        layer.role === "hair-front" &&
        (foreground ||
          (!inRect(pose.hairOcclusionBounds ?? pose.headBounds, fx, fy) &&
            sa !== 0))
      )
        continue;
      if (layer.role === "hair-back" && (foreground || sa === 255)) continue;
      if (!reasons[p]) added++;
      reasons[p] |= 4;
    }
  hairAdded[layer.role] = added;
}
for (let i = 0; i < mask.length; i++) mask[i] = reasons[i] ? 255 : 0;
if (hash(mask) !== expectedHeadMask)
  throw Error("Source89 reviewed mask hash changed");
const pixels = new Uint8Array(source.pixels.length),
  maskRgba = new Uint8Array(source.pixels.length),
  reasonRgba = new Uint8Array(source.pixels.length);
let selected = 0,
  visibleSelected = 0,
  lowerVisible = 0;
const selectedSource: number[] = [];
for (let i = 0; i < mask.length; i++) {
  if (!mask[i]) continue;
  selected++;
  const at = i * 4;
  pixels.set(source.pixels.subarray(at, at + 4), at);
  selectedSource.push(...source.pixels.subarray(at, at + 4));
  maskRgba.set([255, 255, 255, 255], at);
  reasonRgba.set(
    [
      reasons[i] & 1 ? 255 : 0,
      reasons[i] & 2 ? 255 : 0,
      reasons[i] & 4 ? 255 : 0,
      255,
    ],
    at,
  );
  if (source.pixels[at + 3]) {
    visibleSelected++;
    if (Math.floor(i / 512) >= 425) lowerVisible++;
  }
}
if (hash(pixels) !== expectedHeadLayerRgba)
  throw Error("Reviewed source89 head layer hash changed");
const image = (p: Uint8Array) => ({
  width: 512,
  height: 768,
  pixels: p,
  colorChunks: source.colorChunks.map((c) => new Uint8Array(c)),
});
writeFileSync(out + "/head-layer.png", encodeSourceRgbaPng(image(pixels)));
writeFileSync(out + "/head-mask.png", encodeSourceRgbaPng(image(maskRgba)));
writeFileSync(
  out + "/head-mask-reasons.png",
  encodeSourceRgbaPng(image(reasonRgba)),
);
writeFileSync(out + "/head-mask.u8", mask);
const selectedHash = hash(new Uint8Array(selectedSource));
const variants: any[] = [];
for (const [id, label, dx, dy] of [
  [107, "a", -9, -7],
  [108, "b", -18, -14],
] as const) {
  const bodyPath = resolve(
      label === "a" ? values["body-a"]! : values["body-b"]!,
    ),
    bodyBytes = new Uint8Array(readFileSync(bodyPath)),
    body = decodeSourceRgbaPng(bodyBytes, { width: 512, height: 768 }),
    target = new Uint8Array(body.pixels),
    translatedMask = new Uint8Array(maskRgba.length),
    verified: number[] = [];
  let outside = 0,
    overwrittenVisibleBody = 0,
    clearOverwroteBody = 0;
  for (let y = 0; y < 768; y++)
    for (let x = 0; x < 512; x++) {
      const p = y * 512 + x;
      if (!mask[p]) continue;
      const tx = x + dx,
        ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= 512 || ty >= 768) {
        if (source.pixels[p * 4 + 3]) outside++;
        continue;
      }
      const at = (ty * 512 + tx) * 4;
      if (source.pixels[p * 4 + 3] && body.pixels[at + 3])
        overwrittenVisibleBody++;
      if (!source.pixels[p * 4 + 3] && body.pixels[at + 3])
        clearOverwroteBody++;
      target.set(source.pixels.subarray(p * 4, p * 4 + 4), at);
      translatedMask.set([255, 255, 255, 255], at);
    }
  let nonzeroSourceInbounds = 0,
    verifiedMismatch = 0;
  const expectedInbounds: number[] = [];
  for (let y = 0; y < 768; y++)
    for (let x = 0; x < 512; x++) {
      const p = y * 512 + x;
      if (!mask[p]) continue;
      const tx = x + dx,
        ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= 512 || ty >= 768) continue;
      const at = (ty * 512 + tx) * 4;
      expectedInbounds.push(...source.pixels.subarray(p * 4, p * 4 + 4));
      verified.push(...target.subarray(at, at + 4));
      for (let c = 0; c < 4; c++)
        if (target[at + c] !== source.pixels[p * 4 + c]) verifiedMismatch++;
      if (source.pixels[p * 4 + 3]) nonzeroSourceInbounds++;
    }
  const targetImage = image(target),
    outputBytes = encodeSourceRgbaPng(targetImage);
  writeFileSync(assembled + "/" + id + ".png", outputBytes);
  writeFileSync(
    assembled + "/" + id + ".head-mask.png",
    encodeSourceRgbaPng(image(translatedMask)),
  );
  const reread = decodeSourceRgbaPng(outputBytes);
  if (hash(reread.pixels) !== hash(target))
    throw Error("PNG roundtrip changed RGBA");
  const boundary = {
    sampleRows: [418 + dy, 425 + dy, 440 + dy, 455 + dy, 470 + dy].map((y) => {
      let bodyUnderHead = 0,
        sourceVisible = 0;
      for (let x = 0; x < 512; x++) {
        const at = (y * 512 + x) * 4;
        if (translatedMask[at + 3] && target[at + 3]) {
          sourceVisible++;
          if (body.pixels[at + 3]) bodyUnderHead++;
        }
      }
      return { y, sourceVisible, bodyUnderHead };
    }),
    note: "Overlap counts flag neck/collar review only. They are not a claim that the generated torso anatomy or neck seam passes visual acceptance.",
  };
  variants.push({
    id,
    bodyPath,
    translation: { x: dx, y: dy },
    bodyPngSha256: hash(bodyBytes),
    outputPngSha256: hash(outputBytes),
    outputRgbaSha256: hash(target),
    expectedInboundsSelectedSha256: hash(new Uint8Array(expectedInbounds)),
    outputInboundsSelectedSha256: hash(new Uint8Array(verified)),
    exactRgbaMismatchedChannels: verifiedMismatch,
    clippedVisibleHeadPixels: outside,
    visibleHeadPixels: nonzeroSourceInbounds,
    overwrittenVisibleBody,
    clearOverwroteBody,
    boundary,
  });
}
const audit = {
  method:
    "Project lossless RGBA codec; hard pixel-center protected head polygon; accepted owned hair union; integer copy. Body PNG inputs are pre-sized512x768; this script does not resize any artwork. No resampling/Canvas/blending of approved source head.",
  sourcePng: out + "/source89.png",
  basePack: resolve(values["base-pack"]!),
  basePackSha256: hash(baseBytes),
  reviewedSourceFrameId: 89,
  sourcePngSha256: hash(sourceBytes),
  sourceRgbaSha256: hash(source.pixels),
  headMaskSha256: hash(mask),
  headLayerRgbaSha256: hash(pixels),
  selectedSourceRgbaSha256: selectedHash,
  selectedPixels: selected,
  visibleSelectedPixels: visibleSelected,
  visibleBelowY425: lowerVisible,
  hairAddedPixels: hairAdded,
  headPolygon: head,
  reviewedHeadPolygon: refinedHead,
  neckMaskNote:
    "Source89-only visible skin boundary excludes grey old tank collar; no source RGBA painted or resampled",
  variants,
  warning:
    "Image generation changes body pose and shading. This is an independent candidate, not a replacement, and pixel identity of the head does not validate the movement or neck seam.",
};
writeFileSync(
  out + "/head-copy-audit.json",
  JSON.stringify(audit, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { selected, visibleSelected, lowerVisible, hairAdded, variants },
    null,
    2,
  ),
);
