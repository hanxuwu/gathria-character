// Verify actual source-bound clothing and browser exports. This script never
// repaints characters, generates clothing, or substitutes fixtures for artwork.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, resolve, sep } from "node:path";
import { createServer } from "vite";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const stage =
  process.argv.find((arg) => arg.startsWith("--stage="))?.slice(8) ?? "all";
assert(
  ["assets", "exports", "all"].includes(stage),
  "Use --stage=assets, --stage=exports or --stage=all.",
);
const expectedItems = Number(
  process.argv
    .find((arg) => arg.startsWith("--expected-items="))
    ?.split("=")[1] ?? 12,
);
assert(Number.isSafeInteger(expectedItems) && expectedItems > 0);
const outputDir = resolve(root, "docs/kling-wardrobe");
const assetReportPath = resolve(outputDir, "verification-assets.json");
const reportPath = resolve(outputDir, "verification.json");
const catalogPath = resolve(outputDir, "catalog.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const round = (value) => Math.round(value * 1000) / 1000;
const describeFile = async (path) => {
  const bytes = new Uint8Array(await readFile(path));
  return {
    file: relative(root, path).split(sep).join("/"),
    bytes: bytes.length,
    sha256: sha(bytes),
  };
};
const localPath = (url) => {
  assert(
    typeof url === "string" && url.startsWith("/") && !url.startsWith("//"),
    "Catalog URLs must be application-root paths.",
  );
  assert(
    !url.includes("?") && !url.includes("#") && !url.includes("\\"),
    "Use plain catalog asset paths.",
  );
  const path = resolve(root, `.${url}`);
  assert(path.startsWith(root + sep), "Catalog asset escaped repository.");
  return path;
};
const readBytes = async (path) => new Uint8Array(await readFile(path));
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const codePaths = [
  "src/wardrobe/contract.ts",
  "src/wardrobe/project.ts",
  "src/wardrobe/compositor.ts",
  "src/core/baked-source.ts",
  "src/core/pack.ts",
  "src/core/pack-v2.ts",
  "src/core/pack-v3.ts",
  "src/core/bounded-archive.ts",
  "src/core/sha256.ts",
  "src/core/types.ts",
  "package-lock.json",
  "scripts/verify-kling-wardrobe-assets.mjs",
];
const slots = ["top", "bottom", "fullBody", "shoes"];
const outputLooks = ["day", "wedding"];
const catalog = await readJson(catalogPath);
assert.equal(catalog.version, 1);
assert.equal(catalog.characters.length, 2);
assert.deepEqual(catalog.characters.map((entry) => entry.key).sort(), [
  "female",
  "male",
]);
assert.equal(
  catalog.characters.reduce((sum, entry) => sum + entry.items.length, 0),
  expectedItems,
  "Do not validate an incomplete clothing catalog as the full batch.",
);
const inputPaths = new Set([
  catalogPath,
  ...codePaths.map((path) => resolve(root, path)),
]);
for (const entry of catalog.characters) {
  assert(entry.items.length && entry.presets.length);
  for (const path of [
    entry.sourceUrl,
    entry.registrationUrl,
    ...entry.items.map((item) => item.url),
    ...(entry.templateUrl ? [entry.templateUrl] : []),
  ])
    inputPaths.add(localPath(path));
  for (const look of outputLooks)
    assert(
      entry.presets.some((preset) => preset.id === look),
      `${entry.key} is missing its ${look} preset.`,
    );
}
const snapshots = async () =>
  Object.fromEntries(
    await Promise.all(
      [...inputPaths].sort().map(async (path) => {
        const info = await describeFile(path);
        return [info.file, { bytes: info.bytes, sha256: info.sha256 }];
      }),
    ),
  );
const inputFiles = await snapshots();
const baseReport = {
  format: "gathria-kling-wardrobe-verification",
  version: 1,
  startedAt: new Date().toISOString(),
  scope:
    "Actual catalog assets, all registered frames and ordinary exported CharacterPack files. No fixture clothing or new source artwork. These checks prove ownership, preservation, format integrity and runtime composition behavior; they do not assert visual acceptance, naturalness or the absence of every perceptual artifact.",
  inputFiles,
  expectedItems,
  characters: [],
};
await mkdir(outputDir, { recursive: true });
const vite = await createServer({ root, server: { middlewareMode: true } });
const projects = new Map();

try {
  const {
    createWardrobeProject,
    selectWardrobeGarment,
    importWardrobeProject,
  } = await vite.ssrLoadModule("/src/wardrobe/project.ts");
  const {
    createWardrobeCompositor,
    validateWardrobeAppearance,
    exportWardrobeCharacterPack,
  } = await vite.ssrLoadModule("/src/wardrobe/compositor.ts");
  const { decodeSourceRgbaPng } = await vite.ssrLoadModule(
    "/src/core/baked-source.ts",
  );
  const { readPortableCharacterPackArchive } =
    await vite.ssrLoadModule("/src/core/pack.ts");

  async function projectFor(entry) {
    if (!projects.has(entry.key)) {
      const source = await readBytes(localPath(entry.sourceUrl));
      const registration = await readBytes(localPath(entry.registrationUrl));
      // Keep import validation serial, so decoded page buffers can be reclaimed.
      const items = [];
      for (const item of entry.items)
        items.push(await readBytes(localPath(item.url)));
      const project = await createWardrobeProject(source, registration, items);
      assert.equal(project.registration.characterId, entry.characterId);
      assert.equal(project.document.sourceSha256, sha(source));
      assert.equal(project.document.registrationSha256, sha(registration));
      assert.equal(project.archive.manifest.spritesheet.frameWidth, 704);
      assert.equal(project.archive.manifest.spritesheet.frameHeight, 1056);
      assert.deepEqual(project.archive.manifest.anchor, {
        x: 352,
        y: 998,
        units: "pixels",
        origin: "top-left",
      });
      assert.equal(
        project.registration.frames.length,
        entry.key === "male" ? 88 : 96,
      );
      assert.deepEqual(
        Object.keys(project.archive.manifest.animations).sort(),
        ["celebrate", "idle", "jump", "run", "walk"],
      );
      assert.equal(project.archive.manifest.animations.jump.loop, false);
      assert.equal(project.archive.manifest.animations.jump.frames.length, 39);
      projects.set(entry.key, project);
    }
    return projects.get(entry.key);
  }

  function withSelection(project, selection) {
    assert.deepEqual(Object.keys(selection).sort(), [...slots].sort());
    let selected = project;
    for (const slot of slots)
      selected = selectWardrobeGarment(selected, slot, null);
    for (const slot of slots)
      if (selection[slot] !== null)
        selected = selectWardrobeGarment(selected, slot, selection[slot]);
    assert.deepEqual(
      selected.document.selection,
      selection,
      "Preset contains mutually exclusive selections.",
    );
    return selected;
  }

  /** Retain only compact ownership bitsets, not every decoded clothing atlas. */
  function inspectItem(item) {
    const frames = new Map(),
      report = [];
    for (const [pageIndex, spec] of item.manifest.pages.entries()) {
      const patch = decodeSourceRgbaPng(item.pages[pageIndex].patch, spec);
      const ownership = decodeSourceRgbaPng(
        item.pages[pageIndex].ownership,
        spec,
      );
      for (const frame of item.manifest.frames.filter(
        (value) => value.page === pageIndex,
      )) {
        const bits = new Uint8Array(
          Math.ceil((frame.rect.width * frame.rect.height) / 8),
        );
        let owned = 0,
          visible = 0,
          erasure = 0,
          partialAlpha = 0;
        for (let y = 0; y < frame.rect.height; y++) {
          let p = ((frame.rect.y + y) * patch.width + frame.rect.x) * 4;
          for (let x = 0; x < frame.rect.width; x++, p += 4) {
            const alpha = ownership.pixels[p + 3];
            assert(
              alpha === 0 || alpha === 255,
              `${item.manifest.id}/${frame.frameId}: nonbinary ownership.`,
            );
            assert(
              alpha || patch.pixels[p + 3] === 0,
              `${item.manifest.id}/${frame.frameId}: visible artwork outside ownership.`,
            );
            if (!alpha) continue;
            const i = y * frame.rect.width + x;
            bits[i >>> 3] |= 1 << (i & 7);
            owned++;
            if (patch.pixels[p + 3]) visible++;
            else erasure++;
            if (patch.pixels[p + 3] > 0 && patch.pixels[p + 3] < 255)
              partialAlpha++;
          }
        }
        assert(
          owned > 0,
          `${item.manifest.id}/${frame.frameId}: empty ownership is not a complete garment pose.`,
        );
        assert(
          visible > 0,
          `${item.manifest.id}/${frame.frameId}: no visible garment pixels.`,
        );
        frames.set(frame.frameId, {
          bits,
          width: frame.rect.width,
          height: frame.rect.height,
          offset: frame.offset,
        });
        report.push({
          frameId: frame.frameId,
          ownedPixels: owned,
          visiblePixels: visible,
          erasedPixels: erasure,
          partialAlphaPixels: partialAlpha,
        });
      }
    }
    return { frames, report: report.sort((a, b) => a.frameId - b.frameId) };
  }

  function unionOwnership(project, masks, frameId, width, height) {
    const union = new Uint8Array(width * height);
    for (const id of Object.values(project.document.selection)) {
      if (id === null) continue;
      const mask = masks.get(id)?.get(frameId);
      assert(mask, `Missing prepared ownership ${id}/${frameId}.`);
      for (let y = 0; y < mask.height; y++)
        for (let x = 0; x < mask.width; x++) {
          const bit = y * mask.width + x;
          if (mask.bits[bit >>> 3] & (1 << (bit & 7)))
            union[(mask.offset.y + y) * width + mask.offset.x + x] = 1;
        }
    }
    return union;
  }

  const outputReport =
    stage === "exports" ? await readJson(assetReportPath) : baseReport;
  if (stage === "exports") {
    assert.equal(
      outputReport.passed,
      true,
      "Complete asset checks before exported-pack verification.",
    );
    assert.deepEqual(
      outputReport.inputFiles,
      inputFiles,
      "Assets or compositor changed after asset validation; rerun --stage=assets.",
    );
  }

  if (stage !== "exports") {
    for (const entry of catalog.characters) {
      console.log(
        `Checking ${entry.key}: ${entry.items.length} garments and all five source actions.`,
      );
      const project = await projectFor(entry),
        masks = new Map();
      const character = {
        key: entry.key,
        source:
          inputFiles[
            relative(root, localPath(entry.sourceUrl)).split(sep).join("/")
          ],
        registrationSha256: project.document.registrationSha256,
        nativeSize: { width: 704, height: 1056 },
        anchor: project.archive.manifest.anchor,
        frameCount: project.archive.manifest.frames.length,
        actions: Object.fromEntries(
          Object.entries(project.archive.manifest.animations).map(
            ([name, clip]) => [
              name,
              {
                timelineEntries: clip.frames.length,
                uniqueFrames: new Set(clip.frames).size,
                fps: clip.fps,
                loop: clip.loop,
                durationMs: round((clip.frames.length / clip.fps) * 1000),
              },
            ],
          ),
        ),
        items: [],
        presets: [],
        originalResetExact: false,
      };
      for (const descriptor of entry.items) {
        const item = project.items.find(
          (candidate) => candidate.manifest.id === descriptor.id,
        );
        assert(item, `${descriptor.id} is absent after import.`);
        assert.equal(item.manifest.name, descriptor.name);
        assert.equal(item.manifest.slot, descriptor.slot);
        const inspected = inspectItem(item);
        masks.set(descriptor.id, inspected.frames);
        const selected = selectWardrobeGarment(
          project,
          descriptor.slot,
          descriptor.id,
        );
        const renderer = await createWardrobeCompositor(selected);
        try {
          await validateWardrobeAppearance(renderer);
        } finally {
          renderer.dispose();
        }
        character.items.push({
          id: descriptor.id,
          slot: descriptor.slot,
          sha256: item.sha256,
          atlasPages: item.manifest.pages.length,
          allFramesDecoded: true,
          protectedSourceOverlapPixels: 0,
          frames: inspected.report,
        });
        console.log(
          `  ${descriptor.id}: ${inspected.frames.size} nonempty prepared poses; protection passed.`,
        );
      }
      for (const preset of entry.presets) {
        const selected = withSelection(project, preset.selection);
        const renderer = await createWardrobeCompositor(selected);
        const started = performance.now(),
          frames = [],
          timings = [];
        try {
          await validateWardrobeAppearance(renderer);
          for (const frame of selected.archive.manifest.frames) {
            const source = renderer.renderSourceFrame(frame.id);
            const dressed = renderer.renderFrame(frame.id);
            assert.equal(source.width, dressed.width);
            assert.equal(source.height, dressed.height);
            const ownership = unionOwnership(
              selected,
              masks,
              frame.id,
              dressed.width,
              dressed.height,
            );
            const source32 = new Uint32Array(
              source.pixels.buffer,
              source.pixels.byteOffset,
              source.pixels.length / 4,
            );
            const result32 = new Uint32Array(
              dressed.pixels.buffer,
              dressed.pixels.byteOffset,
              dressed.pixels.length / 4,
            );
            let changed = 0,
              owned = 0,
              transparent = 0,
              partial = 0;
            for (let i = 0; i < result32.length; i++) {
              if (ownership[i]) owned++;
              if (source32[i] !== result32[i]) {
                assert(
                  ownership[i],
                  `${entry.key}/${preset.id}/${frame.id}: changed source outside clothing ownership at ${i % dressed.width},${Math.floor(i / dressed.width)}.`,
                );
                changed++;
              }
              const alpha = dressed.pixels[i * 4 + 3];
              if (!alpha) transparent++;
              else if (alpha < 255) partial++;
            }
            assert(
              transparent > 0,
              `${entry.key}/${preset.id}/${frame.id}: transparent background lost.`,
            );
            frames.push({
              frameId: frame.id,
              rgbaSha256: sha(dressed.pixels),
              ownedPixels: owned,
              changedPixels: changed,
              transparentPixels: transparent,
              partialAlphaPixels: partial,
            });
          }
          // CPU measurements are separate from browser playback evidence.
          if (outputLooks.includes(preset.id)) {
            for (let loop = 0; loop < 2; loop++)
              for (const frame of selected.archive.manifest.frames) {
                const start = performance.now();
                renderer.renderFrame(frame.id);
                timings.push(performance.now() - start);
              }
          }
        } finally {
          renderer.dispose();
        }
        timings.sort((a, b) => a - b);
        character.presets.push({
          id: preset.id,
          selection: preset.selection,
          allFramesChecked: true,
          outsideOwnershipByteExact: true,
          checkedMs: round(performance.now() - started),
          frames,
          ...(timings.length
            ? {
                warmCpuRender: {
                  samples: timings.length,
                  medianMs: round(timings[Math.floor(timings.length * 0.5)]),
                  p95Ms: round(timings[Math.floor(timings.length * 0.95)]),
                  maxMs: round(timings.at(-1)),
                  over24FpsFrameBudget: timings.filter((ms) => ms > 1000 / 24)
                    .length,
                  scope:
                    "Node CPU per-frame composition on the current machine; not a claim of browser refresh/frame delivery.",
                },
              }
            : {}),
        });
        console.log(
          `  ${preset.id}: ${frames.length} frames preserve all pixels outside garment ownership.`,
        );
      }
      assert.deepEqual(
        await exportWardrobeCharacterPack(project),
        project.source,
        `${entry.key}: original reset changed source ZIP bytes.`,
      );
      character.originalResetExact = true;
      outputReport.characters.push(character);
      projects.delete(entry.key);
    }
    assert.deepEqual(
      await snapshots(),
      inputFiles,
      "Verification inputs changed while asset checks ran.",
    );
    outputReport.passed = true;
    outputReport.assetChecksCompletedAt = new Date().toISOString();
    await writeFile(
      assetReportPath,
      JSON.stringify(outputReport, null, 2) + "\n",
    );
  }

  if (stage !== "assets") {
    const browserPaths = [
      "docs/kling-wardrobe/browser/evidence-index.json",
      "docs/kling-wardrobe/browser/final/evidence-index.json",
    ];
    const browserPath = browserPaths
      .map((path) => resolve(root, path))
      .find(existsSync);
    assert(
      browserPath,
      "Browser evidence is required to identify actual UI-exported native PNG frames.",
    );
    const browser = await readJson(browserPath);
    assert(
      Array.isArray(browser.nativeFrames),
      "Browser report must list nativeFrames with frameId/action/facing.",
    );
    outputReport.exportVerificationStartedAt = new Date().toISOString();
    outputReport.browserEvidence = await describeFile(browserPath);
    outputReport.exports = [];
    outputReport.mixedOutfitNativePngs = [];
    for (const entry of catalog.characters) {
      const original = await projectFor(entry);
      for (const look of outputLooks) {
        console.log(`Checking actual UI exports ${entry.key}-${look}.`);
        const preset = entry.presets.find((value) => value.id === look);
        const expected = withSelection(original, preset.selection);
        const stem = resolve(outputDir, `exports/${entry.key}-${look}`);
        const packBytes = await readBytes(`${stem}.character.zip`),
          projectBytes = await readBytes(`${stem}.wardrobe.zip`);
        const pack = readPortableCharacterPackArchive(packBytes);
        const saved = await importWardrobeProject(projectBytes);
        assert.deepEqual(
          saved.source,
          original.source,
          "Saved wardrobe changed the approved source pack.",
        );
        assert.deepEqual(
          saved.document.selection,
          preset.selection,
          "Saved wardrobe lost selected clothing.",
        );
        const knownItems = new Map(
          original.document.items.map((item) => [item.id, item.sha256]),
        );
        const savedItems = new Map(
          saved.document.items.map((item) => [item.id, item.sha256]),
        );
        for (const [id, hash] of savedItems)
          assert.equal(
            hash,
            knownItems.get(id),
            "Saved wardrobe changed a fetched catalog garment.",
          );
        for (const id of Object.values(preset.selection))
          if (id !== null)
            assert(
              savedItems.has(id),
              "Saved wardrobe omitted a selected garment needed for offline restoration.",
            );
        assert.deepEqual(
          saved.registrationBytes,
          original.registrationBytes,
          "Saved wardrobe changed registration bytes.",
        );
        assert.equal(
          saved.document.sourceSha256,
          original.document.sourceSha256,
        );
        assert.equal(
          saved.document.registrationSha256,
          original.document.registrationSha256,
        );
        for (const field of [
          "frames",
          "animations",
          "anchor",
          "facing",
          "scale",
          "capabilities",
        ])
          assert.deepEqual(
            pack.manifest[field],
            original.archive.manifest[field],
            `Export changed ${field}.`,
          );
        assert.equal(
          pack.manifest.schemaVersion,
          original.archive.manifest.schemaVersion,
        );
        assert.deepEqual(pack.config.source, original.archive.config.source);
        assert.deepEqual(
          pack.config.derivation.frames,
          original.archive.config.derivation.frames,
        );
        assert.deepEqual(
          pack.config.sourceMetadata?.motionFlow,
          original.archive.config.sourceMetadata?.motionFlow,
        );
        assert.deepEqual(
          pack.config.sourceMetadata?.wardrobe?.selection,
          preset.selection,
        );
        assert.equal(
          pack.config.sourceMetadata?.wardrobe?.sourcePackSha256,
          original.document.sourceSha256,
        );
        const renderer = await createWardrobeCompositor(expected),
          pages = [];
        try {
          const encoded = [pack.png, ...(pack.additionalPngs ?? [])];
          for (const [page, png] of encoded.entries()) {
            const decoded = decodeSourceRgbaPng(png),
              composed = renderer.renderPage(page);
            assert.equal(decoded.width, composed.width);
            assert.equal(decoded.height, composed.height);
            assert.deepEqual(decoded.colorChunks, composed.colorChunks);
            assert.equal(
              sha(decoded.pixels),
              sha(composed.pixels),
              `${entry.key}/${look}/page${page}: actual exported pixels differ from compositor.`,
            );
            pages.push({
              page,
              width: decoded.width,
              height: decoded.height,
              pngBytes: png.length,
              pngSha256: sha(png),
              rgbaSha256: sha(decoded.pixels),
              fullPagePixelsExact: true,
            });
          }
          const native = browser.nativeFrames.find(
            (value) => value.character === entry.key && value.look === look,
          );
          assert(
            native,
            `${entry.key}/${look}: no actual native PNG export record.`,
          );
          const nativePath = resolve(root, native.file);
          assert(nativePath.startsWith(root + sep));
          const nativeBytes = await readBytes(nativePath),
            decoded = decodeSourceRgbaPng(nativeBytes);
          assert.equal(sha(nativeBytes), native.sha256);
          const composed = renderer.renderFrame(native.frameId);
          assert.equal(decoded.width, composed.width);
          assert.equal(decoded.height, composed.height);
          const pixels = new Uint8Array(composed.pixels.length);
          assert(["right", "left"].includes(native.facing));
          if (native.facing === "right") pixels.set(composed.pixels);
          else
            for (let y = 0; y < composed.height; y++)
              for (let x = 0; x < composed.width; x++) {
                const from = (y * composed.width + x) * 4,
                  to = (y * composed.width + composed.width - x - 1) * 4;
                pixels.set(composed.pixels.subarray(from, from + 4), to);
              }
          assert.equal(
            sha(decoded.pixels),
            sha(pixels),
            `${entry.key}/${look}: native PNG does not match its recorded frame/facing.`,
          );
          const record = {
            character: entry.key,
            look,
            pack: await describeFile(`${stem}.character.zip`),
            project: await describeFile(`${stem}.wardrobe.zip`),
            nativePng: {
              ...(await describeFile(nativePath)),
              frameId: native.frameId,
              facing: native.facing,
              action: native.action,
              rgbaSha256: sha(decoded.pixels),
              exact: true,
            },
            savedPreview: saved.document.preview,
            savedEmbeddedItemIds: [...savedItems.keys()],
            pages,
            originalSourceEmbeddedExact: true,
            actionAndAnchorMetadataExact: true,
            independentFormat: pack.manifest.schemaVersion,
          };
          // One actual full native garment export, repeated after browser export,
          // establishes deterministic ZIP bytes without rebuilding every output.
          if (entry.key === "male" && look === "day") {
            const repeated = await exportWardrobeCharacterPack(expected);
            assert.equal(
              sha(repeated),
              sha(packBytes),
              "Repeated representative export differs from the actual UI ZIP.",
            );
            record.repeatedExportByteExact = true;
          }
          outputReport.exports.push(record);
        } finally {
          renderer.dispose();
        }
      }
      if (entry.key === "female") {
        const mixedLooks = browser.mixedOutfits?.filter(
          (value) => value.character === entry.key,
        );
        assert.equal(
          mixedLooks?.length,
          2,
          "Final browser evidence must include both dress-plus-shoes combinations.",
        );
        for (const mixed of mixedLooks) {
          const preset = entry.presets.find((value) => value.id === mixed.look);
          assert(preset && outputLooks.includes(mixed.look));
          assert.deepEqual(mixed.selection, {
            ...preset.selection,
            shoes: "brown-shoes",
          });
          assert.deepEqual(
            mixed.frames.map((value) => value.frameId),
            [51, 58, 87, 104],
            "Use the four source-registered garment and ankle stress poses.",
          );
          const selected = withSelection(original, mixed.selection);
          const renderer = await createWardrobeCompositor(selected);
          try {
            await validateWardrobeAppearance(renderer);
            for (const native of mixed.frames) {
              assert.equal(native.facing, "right");
              assert(
                original.archive.manifest.animations[
                  native.action
                ]?.frames.includes(native.frameId),
                "Mixed outfit PNG frame must belong to its recorded source action.",
              );
              const path = resolve(root, native.file);
              assert(path.startsWith(root + sep));
              const bytes = await readBytes(path);
              assert.equal(bytes.length, native.bytes);
              assert.equal(sha(bytes), native.sha256);
              const decoded = decodeSourceRgbaPng(bytes);
              const composed = renderer.renderFrame(native.frameId);
              assert.equal(decoded.width, composed.width);
              assert.equal(decoded.height, composed.height);
              assert.deepEqual(decoded.colorChunks, composed.colorChunks);
              assert.equal(
                sha(decoded.pixels),
                sha(composed.pixels),
                `${entry.key}/${mixed.look}/brown-shoes/${native.frameId}: actual native PNG differs from the selected compositor.`,
              );
              outputReport.mixedOutfitNativePngs.push({
                ...(await describeFile(path)),
                character: entry.key,
                look: mixed.look,
                selection: mixed.selection,
                frameId: native.frameId,
                action: native.action,
                facing: native.facing,
                rgbaSha256: sha(decoded.pixels),
                exact: true,
                allFrameProtectionChecked: true,
              });
            }
          } finally {
            renderer.dispose();
          }
          console.log(
            `  ${entry.key}/${mixed.look}/brown-shoes: four native UI PNGs match the registered compositor.`,
          );
        }
      }
      projects.delete(entry.key);
    }
    assert.deepEqual(
      await snapshots(),
      inputFiles,
      "Verification inputs changed while export checks ran.",
    );
    outputReport.exportChecksCompletedAt = new Date().toISOString();
    outputReport.passed = true;
    await writeFile(reportPath, JSON.stringify(outputReport, null, 2) + "\n");
  }
  console.log(
    `Verified ${stage}: ${relative(root, stage === "assets" ? assetReportPath : reportPath)}. Visual review remains separate.`,
  );
} finally {
  projects.clear();
  await vite.close();
}
