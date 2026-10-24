import { strToU8, zipSync } from "fflate";
import { readBoundedArchive } from "../core/bounded-archive";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  prepareSourcePng,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import {
  WARDROBE_MAX_ITEM_BYTES,
  wardrobeObject,
  type WardrobeProject,
} from "./contract";
import { readWardrobeGarment } from "./project";
import { clothingPose } from "./recipe-kit";

export const PAINT_MAX_POSES = 8;
const MAX_PNG = 20 * 1024 * 1024;
const MAX_EXPANDED = 96 * 1024 * 1024;
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export interface PaintImportReport {
  format: "gathria-paint-import";
  version: 1;
  inputSha256: string;
  baseSha256: string;
  registrationSha256: string;
  output: { id: string; name: string; sha256: string };
  poses: Array<{
    frameId: number;
    changedPixels: number;
    beforeRgbaSha256: string;
    afterRgbaSha256: string;
    inputPngSha256: string;
  }>;
  rules: string;
}
export interface PaintedGarment {
  bytes: Uint8Array;
  report: PaintImportReport;
}

/** Native RGB corrections only. Source pixels, alpha, ownership, anchors and
 * atlas layout are never inferred from a painting or silently replaced. */
export async function importPaintedPoses(
  project: WardrobeProject,
  input: Uint8Array,
  options: SourcePreparationOptions & {
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<PaintedGarment> {
  const check = () => assertSourcePreparationActive(options);
  check();
  if (!(input instanceof Uint8Array) || input.length > WARDROBE_MAX_ITEM_BYTES)
    throw Error("Painted kits must be at most 64 MiB.");
  const bytes = new Uint8Array(input);
  const allowed: Record<string, number> = {
    "recipe.json": 1024 * 1024,
    "base.garment.zip": WARDROBE_MAX_ITEM_BYTES,
    "registration.json": 1024 * 1024,
    "README.md": 64 * 1024,
    "pose-guide.json": 1024 * 1024,
    "neighbors-guide.json": 1024 * 1024,
  };
  for (const { frameId } of project.registration.frames) {
    allowed[`pose-${frameId}.png`] = MAX_PNG;
    allowed[`mask-${frameId}.png`] = MAX_PNG;
    allowed[`pose-${frameId}-guide.json`] = 1024 * 1024;
  }
  await yieldTask();
  check();
  const files = readBoundedArchive(bytes, {
    label: "Painted pose kit",
    maxArchiveBytes: WARDROBE_MAX_ITEM_BYTES,
    maxExpandedBytes: MAX_EXPANDED,
    minFiles: 5,
    maxFiles: 6 + PAINT_MAX_POSES * 3,
    files: allowed,
    required: ["recipe.json", "base.garment.zip", "registration.json"],
  });
  const recipe = wardrobeObject(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(files["recipe.json"]),
    ),
    "Paint recipe",
    ["format", "version", "category", "base", "output", "poseOverrides"],
  );
  if (recipe.format !== "gathria-garment-recipe" || recipe.version !== 1)
    throw Error("Choose a version 1 native clothing painting kit.");
  if (
    !["dress", "trousers", "shirt", "jacket"].includes(String(recipe.category))
  )
    throw Error("Unsupported painting category.");
  const baseRef = wardrobeObject(recipe.base, "Paint base", ["file", "sha256"]);
  if (
    baseRef.file !== "base.garment.zip" ||
    baseRef.sha256 !== (await sha256(files["base.garment.zip"]))
  )
    throw Error("The painting kit base hash does not match its clothing.");
  const item = project.items.find(
    (i) =>
      i.sha256 === baseRef.sha256 &&
      Object.values(project.document.selection).includes(i.manifest.id),
  );
  if (!item || item.manifest.slot === "shoes")
    throw Error(
      "Wear the exact original top, bottom or dress before importing its painted poses.",
    );
  if (
    !equal(item.bytes, files["base.garment.zip"]) ||
    !equal(project.registrationBytes, files["registration.json"]) ||
    (await sha256(files["registration.json"])) !==
      project.document.registrationSha256
  )
    throw Error(
      "The painting kit clothing or registration differs from this look.",
    );
  const base = await readWardrobeGarment(
    files["base.garment.zip"],
    project.registration,
    project.document.registrationSha256,
    options,
  );
  check();
  const output = wardrobeObject(recipe.output, "Paint output", ["id", "name"]);
  if (
    typeof output.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(output.id) ||
    project.items.some((i) => i.manifest.id === output.id)
  )
    throw Error(
      "Give the painted clothing a new, unused ID (1–64 letters, numbers, dots, underscores or hyphens).",
    );
  if (
    typeof output.name !== "string" ||
    !output.name.trim() ||
    output.name.length > 120
  )
    throw Error("Give the painted clothing a name of 1–120 characters.");
  if (
    !Array.isArray(recipe.poseOverrides) ||
    recipe.poseOverrides.length < 1 ||
    recipe.poseOverrides.length > PAINT_MAX_POSES
  )
    throw Error(`Include between 1 and ${PAINT_MAX_POSES} painted poses.`);
  const seen = new Set<number>(),
    referenced = new Set<string>();
  const poses = recipe.poseOverrides
    .map((value) => {
      const entry = wardrobeObject(value, "Paint pose", [
        "frameId",
        "image",
        "mask",
      ]);
      const id = entry.frameId;
      const frame = base.manifest.frames.find((f) => f.frameId === id);
      if (!frame || seen.has(frame.frameId))
        throw Error(
          "Painted poses must have unique, available source frame IDs.",
        );
      seen.add(frame.frameId);
      const image = wardrobeObject(entry.image, "Paint image", [
        "file",
        "sha256",
      ]);
      const mask = wardrobeObject(entry.mask, "Paint mask", ["file", "sha256"]);
      for (const [ref, prefix] of [
        [image, "pose"],
        [mask, "mask"],
      ] as const) {
        if (
          ref.file !== `${prefix}-${id}.png` ||
          !files[String(ref.file)] ||
          typeof ref.sha256 !== "string" ||
          !/^[0-9a-f]{64}$/.test(ref.sha256)
        )
          throw Error(
            "Painted poses need their exact native pose/mask filenames and SHA-256 fields.",
          );
        referenced.add(String(ref.file));
      }
      // Shared atlas rectangles would also edit an unrequested source pose.
      if (
        base.manifest.frames.some(
          (f) =>
            f.frameId !== id &&
            f.page === frame.page &&
            f.rect.x < frame.rect.x + frame.rect.width &&
            frame.rect.x < f.rect.x + f.rect.width &&
            f.rect.y < frame.rect.y + frame.rect.height &&
            frame.rect.y < f.rect.y + f.rect.height,
        )
      )
        throw Error(
          "This clothing shares atlas pixels between poses; use the full authoring workflow.",
        );
      return { frame, image, mask };
    })
    .sort(
      (a, b) =>
        a.frame.page - b.frame.page || a.frame.frameId - b.frame.frameId,
    );
  if (
    Object.keys(files).some(
      (name) => /^(pose|mask)-\d+\.png$/.test(name) && !referenced.has(name),
    )
  )
    throw Error("The kit contains an undeclared painting or mask.");
  const report: PaintImportReport = {
    format: "gathria-paint-import",
    version: 1,
    inputSha256: await sha256(bytes),
    baseSha256: base.sha256,
    registrationSha256: project.document.registrationSha256,
    output: { id: output.id, name: output.name.trim(), sha256: "" },
    poses: [],
    rules:
      "Raw RGB corrections within unchanged ownership. Exact alpha, native offsets and base PNG color metadata retained. No resampling, fitting or retiming. Edited PNG hashes recomputed; recipe hash must identify either the exported original or the supplied PNG.",
  };
  const rebuilt: Record<string, Uint8Array> = {};
  const dimensions = {
    width: base.manifest.frameWidth,
    height: base.manifest.frameHeight,
  };
  options.onProgress?.(0, poses.length);
  for (const [pageIndex, pageSpec] of base.manifest.pages.entries()) {
    check();
    const pagePoses = poses.filter((p) => p.frame.page === pageIndex);
    rebuilt[pageSpec.maskFile] = base.pages[pageIndex].ownership;
    if (!pagePoses.length) {
      rebuilt[pageSpec.file] = base.pages[pageIndex].patch;
      continue;
    }
    const page = await prepareSourcePng(
      base.pages[pageIndex].patch,
      pageSpec,
      options,
    );
    let pageChanged = false;
    for (const { frame, image, mask } of pagePoses) {
      await yieldTask();
      check();
      const original = clothingPose(base, frame.frameId);
      const paintBytes = files[String(image.file)],
        maskBytes = files[String(mask.file)];
      if ((await sha256(maskBytes)) !== mask.sha256)
        throw Error(`Pose ${frame.frameId}: the ownership mask was changed.`);
      const inputHash = await sha256(paintBytes);
      if (
        image.sha256 !== inputHash &&
        image.sha256 !== (await sha256(encodeSourceRgbaPng(original.image)))
      )
        throw Error(
          `Pose ${frame.frameId}: the image hash is neither the exported original nor the edited PNG.`,
        );
      const paint = await prepareSourcePng(paintBytes, dimensions, options);
      const suppliedMask = await prepareSourcePng(
        maskBytes,
        dimensions,
        options,
      );
      if (!equal(suppliedMask.pixels, original.mask.pixels))
        throw Error(
          `Pose ${frame.frameId}: retain the exact exported ownership mask.`,
        );
      let changedPixels = 0;
      for (let y = 0; y < dimensions.height; y++) {
        if (y % 64 === 0) {
          await yieldTask();
          check();
        }
        for (let x = 0; x < dimensions.width; x++) {
          const at = (y * dimensions.width + x) * 4;
          const a = original.image.pixels,
            b = paint.pixels;
          if (a[at + 3] !== b[at + 3])
            throw Error(
              `Pose ${frame.frameId}: alpha changed at ${x},${y}. Keep the original silhouette.`,
            );
          if (
            a[at] === b[at] &&
            a[at + 1] === b[at + 1] &&
            a[at + 2] === b[at + 2]
          )
            continue;
          if (!original.mask.pixels[at])
            throw Error(
              `Pose ${frame.frameId}: paint outside clothing ownership at ${x},${y}.`,
            );
          const dx = x - frame.offset.x,
            dy = y - frame.offset.y;
          if (
            dx < 0 ||
            dy < 0 ||
            dx >= frame.rect.width ||
            dy >= frame.rect.height
          )
            throw Error("Paint extends outside the original atlas crop.");
          page.pixels.set(
            b.subarray(at, at + 3),
            ((frame.rect.y + dy) * page.width + frame.rect.x + dx) * 4,
          );
          changedPixels++;
        }
      }
      pageChanged ||= changedPixels > 0;
      report.poses.push({
        frameId: frame.frameId,
        changedPixels,
        beforeRgbaSha256: await sha256(original.image.pixels),
        afterRgbaSha256: await sha256(paint.pixels),
        inputPngSha256: inputHash,
      });
      check();
      options.onProgress?.(report.poses.length, poses.length);
      check();
    }
    rebuilt[pageSpec.file] = pageChanged
      ? encodeSourceRgbaPng(page)
      : base.pages[pageIndex].patch;
  }
  check();
  const manifest = {
    ...base.manifest,
    id: report.output.id,
    name: report.output.name,
    provenance: `Browser RGB painting of ${base.manifest.id}. Base SHA256 ${base.sha256}; kit SHA256 ${report.inputSha256}; poses ${report.poses.map((p) => `${p.frameId}:${p.changedPixels}`).join(",")}. Ownership/alpha/registration unchanged. See separate paint-import report for input hashes.`,
  };
  const result = zipSync(
    { "manifest.json": strToU8(JSON.stringify(manifest, null, 2)), ...rebuilt },
    { level: 6, mtime: new Date(2020, 0, 1, 0, 0, 0) },
  );
  await readWardrobeGarment(
    result,
    project.registration,
    project.document.registrationSha256,
    options,
  );
  report.output.sha256 = await sha256(result);
  check();
  return { bytes: result, report };
}
