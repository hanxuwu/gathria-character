// Rebind retained UI thumbnails only after current runtime native output is exact.
// This is NOT a new browser capture. Existing PNGs and original capture metadata stay intact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const indexPath = "src/wardrobe/outfit-previews/index.json";
const catalogPath = "docs/kling-wardrobe/catalog.json";
const reportPath = "docs/wardrobe-coverage/thumbnail-revalidation.json";
const { values } = parseArgs({
  options: { check: { type: "boolean", default: false } },
});
const local = (path) => {
  const result = resolve(root, path.replace(/^\//, ""));
  assert(result.startsWith(root + sep), "Asset path escaped repository");
  return result;
};
const bytes = async (path) => new Uint8Array(await readFile(local(path)));
const sha = (data) => createHash("sha256").update(data).digest("hex");
const jsonText = (data) => JSON.stringify(data, null, 2) + "\n";
const indexBytes = await bytes(indexPath);
const catalogBytes = await bytes(catalogPath);
const index = JSON.parse(new TextDecoder().decode(indexBytes));
const catalog = JSON.parse(new TextDecoder().decode(catalogBytes));
const nextIndex = structuredClone(index);
const originalCaptureCatalogSha256 =
  index.coverageRevalidation?.originalCaptureCatalogSha256 ??
  index.catalogSha256;
const wanted = catalog.characters.flatMap((entry) =>
  entry.presets
    .filter((preset) => Object.values(preset.selection).some(Boolean))
    .map((preset) => `${entry.key}/${preset.id}`),
);
assert.equal(new Set(wanted).size, wanted.length, "Duplicate catalog preset");
assert.deepEqual(
  index.previews.map((row) => `${row.character}/${row.presetId}`).sort(),
  [...wanted].sort(),
  "Preview index must cover every non-bare catalog preset exactly once",
);
const report = {
  format: "gathria-wardrobe-thumbnail-coverage-revalidation",
  version: 1,
  method:
    "Decode each retained actual-UI native PNG and compare dimensions and every RGBA byte against the current WardrobeCompositor at the recorded sourceFrame, original head, with only that preset's selected garments loaded. Verify retained thumbnail and native PNG digests. No image resampling, repainting, or new browser capture.",
  scope:
    "Standing outfit thumbnails only. Equality here does not certify other animation frames or clothing coverage; see the separate full runtime/visual reviews.",
  capture: {
    producedAt: index.producedAt,
    commitAtCapture: index.commitAtCapture,
    finishedAt: index.finishedAt,
    recipe: index.recipe,
    originalCaptureCatalogSha256,
  },
  catalogSha256: sha(catalogBytes),
  codeSha256: Object.fromEntries(
    await Promise.all(
      [
        "src/wardrobe/contract.ts",
        "src/wardrobe/protection.ts",
        "src/wardrobe/compositor.ts",
        "src/wardrobe/neckline-permissions.ts",
        "src/wardrobe/project.ts",
        "src/core/baked-source.ts",
      ].map(async (path) => [path, sha(await bytes(path))]),
    ),
  ),
  results: [],
};
const server = await createServer({
  root,
  server: { middlewareMode: true, hmr: false },
});
const sourceCache = new Map();
const assetCache = new Map();
const assetBytes = async (path) => {
  if (!assetCache.has(path)) assetCache.set(path, await bytes(path));
  return assetCache.get(path);
};
try {
  const { createWardrobeProject, selectWardrobeGarment } =
    await server.ssrLoadModule("/src/wardrobe/project.ts");
  const { createWardrobeCompositor } = await server.ssrLoadModule(
    "/src/wardrobe/compositor.ts",
  );
  const { decodeSourceRgbaPng } = await server.ssrLoadModule(
    "/src/core/baked-source.ts",
  );
  for (let rowIndex = 0; rowIndex < index.previews.length; rowIndex++) {
    const row = index.previews[rowIndex];
    const entry = catalog.characters.find((item) => item.key === row.character);
    const preset = entry.presets.find((item) => item.id === row.presetId);
    const key = `${row.character}/${row.presetId}`;
    assert.deepEqual(
      row.selection,
      preset.selection,
      `${key}: selection changed`,
    );
    if (!sourceCache.has(entry.key)) {
      const source = await bytes(entry.sourceUrl);
      const registration = await bytes(entry.registrationUrl);
      sourceCache.set(entry.key, { source, registration });
    }
    const { source, registration } = sourceCache.get(entry.key);
    assert.equal(
      sha(source),
      row.sourceSha256,
      `${key}: original source changed`,
    );
    assert.equal(
      sha(registration),
      row.registrationSha256,
      `${key}: registration changed`,
    );
    const ids = Object.values(preset.selection).filter(Boolean);
    assert.deepEqual(
      [...row.items.map((item) => item.id)].sort(),
      [...ids].sort(),
      `${key}: captured selected item IDs changed`,
    );
    const selectedItems = ids.map((id) => {
      const matches = entry.items.filter((item) => item.id === id);
      assert.equal(matches.length, 1, `${key}: ambiguous/missing ${id}`);
      return matches[0];
    });
    const garments = await Promise.all(
      selectedItems.map(async (item) => {
        const data = await assetBytes(item.url);
        assert.equal(
          sha(data),
          item.sha256,
          `${item.id}: catalog digest is stale`,
        );
        return data;
      }),
    );
    let project = await createWardrobeProject(source, registration, garments);
    for (const [slot, id] of Object.entries(preset.selection))
      if (id) project = selectWardrobeGarment(project, slot, id);
    const nativeBytes = await bytes(row.nativeFile);
    const thumbnailBytes = await bytes(
      `src/wardrobe/outfit-previews/${row.file}`,
    );
    assert.equal(
      sha(nativeBytes),
      row.nativeSha256,
      `${key}: captured native PNG changed`,
    );
    assert.equal(nativeBytes.length, row.nativeBytes);
    assert.equal(
      sha(thumbnailBytes),
      row.thumbnailSha256,
      `${key}: thumbnail PNG changed`,
    );
    assert.equal(thumbnailBytes.length, row.thumbnailBytes);
    const native = decodeSourceRgbaPng(nativeBytes);
    const thumbnail = decodeSourceRgbaPng(thumbnailBytes);
    assert.deepEqual(
      [native.width, native.height],
      [row.nativeWidth, row.nativeHeight],
    );
    assert.deepEqual(
      [thumbnail.width, thumbnail.height],
      [row.width, row.height],
    );
    const compositor = await createWardrobeCompositor(project);
    try {
      const rendered = compositor.renderFrame(row.sourceFrame);
      const dimensionsExact =
        native.width === rendered.width && native.height === rendered.height;
      let changedRgbaBytes = 0;
      if (dimensionsExact)
        for (let i = 0; i < native.pixels.length; i++)
          if (native.pixels[i] !== rendered.pixels[i]) changedRgbaBytes++;
      const exact = dimensionsExact && changedRgbaBytes === 0;
      report.results.push({
        character: row.character,
        presetId: row.presetId,
        sourceFrame: row.sourceFrame,
        nativeFile: row.nativeFile,
        thumbnailFile: `src/wardrobe/outfit-previews/${row.file}`,
        sourceSha256: row.sourceSha256,
        registrationSha256: row.registrationSha256,
        selectedItems: selectedItems.map(({ id, sha256 }) => ({ id, sha256 })),
        nativeSha256: row.nativeSha256,
        thumbnailSha256: row.thumbnailSha256,
        nativeWidth: native.width,
        nativeHeight: native.height,
        renderedWidth: rendered.width,
        renderedHeight: rendered.height,
        nativeRgbaSha256: sha(native.pixels),
        renderedRgbaSha256: sha(rendered.pixels),
        changedRgbaBytes: dimensionsExact ? changedRgbaBytes : null,
        nativeRgbaExact: exact,
      });
      if (exact) {
        // Preserve row order and every other captured field; only refresh SHA values.
        for (const item of nextIndex.previews[rowIndex].items)
          item.sha256 = selectedItems.find(
            (candidate) => candidate.id === item.id,
          ).sha256;
      }
      console.log(
        `${key}: ${exact ? "exact native RGBA" : `DIFF ${changedRgbaBytes} bytes`}`,
      );
    } finally {
      compositor.dispose();
    }
  }
} finally {
  await server.close();
}
report.summary = {
  presets: report.results.length,
  exactNativeRgba: report.results.filter((row) => row.nativeRgbaExact).length,
  differingNativeRgba: report.results.filter((row) => !row.nativeRgbaExact)
    .length,
  retainedNativeAndThumbnailPngDigestsVerified: report.results.length,
};
assert.equal(
  sha(await bytes(catalogPath)),
  report.catalogSha256,
  "Catalog changed during revalidation",
);
assert.equal(
  sha(await bytes(indexPath)),
  sha(indexBytes),
  "Preview index changed during revalidation",
);
for (const [path, checksum] of Object.entries(report.codeSha256))
  assert.equal(
    sha(await bytes(path)),
    checksum,
    `${path}: runtime code changed during revalidation`,
  );
if (report.summary.differingNativeRgba) {
  if (!values.check) {
    await mkdir(dirname(local(reportPath)), { recursive: true });
    await writeFile(local(reportPath), jsonText(report));
  }
  throw Error(
    `${report.summary.differingNativeRgba} native preview(s) differ. Index bindings were NOT refreshed. ` +
      "Regenerate affected previews through scripts/capture-kling-outfit-thumbnails.mjs using the actual UI.",
  );
}
nextIndex.catalogSha256 = report.catalogSha256;
nextIndex.coverageRevalidation = {
  report: reportPath,
  method:
    "Current WardrobeCompositor compared with retained actual-UI native PNGs; no new capture.",
  originalCaptureCatalogSha256,
  catalogSha256: report.catalogSha256,
  checkedPresets: report.results.length,
  nativeRgbaExactForEveryPreset: true,
  originalCaptureMetadataAndPngFilesPreserved: true,
};
if (values.check) {
  assert.equal(
    await readFile(local(indexPath), "utf8"),
    jsonText(nextIndex),
    "Preview index bindings are stale",
  );
  assert.equal(
    await readFile(local(reportPath), "utf8"),
    jsonText(report),
    "Thumbnail revalidation report is stale",
  );
} else {
  await mkdir(dirname(local(reportPath)), { recursive: true });
  await writeFile(local(reportPath), jsonText(report));
  await writeFile(local(indexPath), jsonText(nextIndex));
}
console.log(JSON.stringify(report.summary));
