/** Validate the Python builder's outputs through the actual runtime readers.
 * Bundle with esbuild --platform=node --format=esm, then run with --assets DIR.
 * This verifies contract integrity and protected-pixel composition, not art acceptance.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { unzipSync } from "fflate";
import { readPortableCharacterPackArchive } from "../src/core/pack";
import {
  addWardrobeAppearanceBank,
  createWardrobeProject,
  exportWardrobeProject,
  importWardrobeProject,
  selectWardrobeAppearance,
  selectWardrobeGarment,
} from "../src/wardrobe/project";
import {
  createWardrobeCompositor,
  validateWardrobeAppearance,
} from "../src/wardrobe/compositor";
import type { WardrobeSelection } from "../src/wardrobe/contract";

const { values } = parseArgs({
  options: {
    assets: { type: "string" },
    root: { type: "string" },
    report: { type: "string" },
    "source-only": { type: "boolean", default: false },
  },
  strict: true,
});
const root = resolve(values.root ?? process.cwd());
const directory = resolve(
  values.assets ?? root + "/docs/kling-landing-production/assets",
);
const read = (path: string) => new Uint8Array(readFileSync(path));
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));
const candidateId = "kling-male-side-landing-candidate-v1";
const catalog = json(read(directory + "/catalog.json"));
const receipt = json(read(directory + "/build-receipt.json"));
const source = read(directory + "/male.source.zip");
const registration = read(directory + "/male.registration.json");
assert.equal(hash(source), catalog.sourceSha256);
assert.equal(hash(registration), catalog.registrationSha256);
assert.equal(catalog.characterId, candidateId);
assert.equal(catalog.visualAcceptance, "pending");
for (const [filename, item] of Object.entries(receipt.outputs) as Array<
  [string, { bytes: number; sha256: string }]
>) {
  const bytes = read(directory + "/" + filename);
  assert.equal(bytes.length, item.bytes, filename);
  assert.equal(hash(bytes), item.sha256, filename);
}
const loaded = readPortableCharacterPackArchive(source);
const baseBytes = read(
  root + "/docs/kling-side-workspace/assets/male.source.zip",
);
const base = readPortableCharacterPackArchive(baseBytes);
assert.equal(loaded.config.characterId, candidateId);
assert.equal(loaded.manifest.schemaVersion, 3);
assert.equal(loaded.manifest.frames.length, 109);
assert.equal(loaded.additionalPngs?.length, 3);
assert.deepEqual(loaded.png, base.png);
for (let i = 0; i < 2; i++)
  assert.deepEqual(loaded.additionalPngs![i], base.additionalPngs![i]);
assert.deepEqual(loaded.manifest.frames.slice(0, 107), base.manifest.frames);
assert.deepEqual(loaded.manifest.animations, base.manifest.animations);
assert.deepEqual(loaded.manifest.anchor, base.manifest.anchor);
assert.deepEqual(loaded.manifest.facing, base.manifest.facing);
assert(!loaded.config.sourceMetadata?.gameplayMotion);
assert(!loaded.config.sourceMetadata?.motionFlow);
assert.equal(
  loaded.config.source.sha256,
  hash(read(directory + "/male-landing-reference.zip")),
);
const oldRegistration = json(
  read(root + "/artwork/kling-side-expansion/templates/male.registration.json"),
);
const registered = json(registration);
for (const [index, frame] of registered.frames.slice(0, 107).entries())
  assert.deepEqual(frame, {
    ...oldRegistration.frames[index],
    sourceFrame: oldRegistration.frames[index].frameId,
  });

const filenames = [
  "male-daily-top.garment.zip",
  "male-daily-bottom.garment.zip",
  "male-wedding-top.garment.zip",
  "male-wedding-bottom.garment.zip",
];
const garments = values["source-only"]
  ? []
  : filenames.map((filename) => read(directory + "/" + filename));
let project = await createWardrobeProject(source, registration, garments);
project = await addWardrobeAppearanceBank(
  project,
  read(directory + "/male.appearance.zip"),
);
assert.equal(project.registration.frames.length, 109);
assert.equal(project.document.sourceSha256, catalog.sourceSha256);
assert.equal(project.document.registrationSha256, catalog.registrationSha256);
const bank = project.appearanceBank!;
const appearanceFiles = unzipSync(bank.bytes);
const originalAppearance = unzipSync(
  read(root + "/docs/matched-hair/assets/male-side.appearance.zip"),
);
const originalAppearanceManifest = json(originalAppearance["manifest.json"]);
for (const [filename, data] of Object.entries(originalAppearance))
  if (filename !== "manifest.json")
    assert.deepEqual(appearanceFiles[filename], data, filename);
assert.equal(bank.manifest.poses.length, 109);
for (const [styleIndex, style] of bank.manifest.styles.entries())
  for (const [layerIndex, layer] of style.layers.entries()) {
    assert.equal(layer.frames.length, 109);
    assert.deepEqual(
      layer.frames.slice(0, 107),
      originalAppearanceManifest.styles[styleIndex].layers[layerIndex].frames,
    );
  }
const hairIds = [
  null,
  ...bank.manifest.styles
    .filter((style) => style.slot === "hair")
    .map((style) => style.id),
];
const faceIds = [
  null,
  ...bank.manifest.styles
    .filter((style) => style.slot === "face")
    .map((style) => style.id),
];
const looks = values["source-only"]
  ? (["original"] as const)
  : (["original", "daily", "wedding"] as const);
const compositions: Array<{
  look: string;
  hairId: string | null;
  faceId: string | null;
  frames: number;
  newPoseRgbaSha256: Record<string, string>;
}> = [];
for (const look of looks) {
  const selection = catalog.presets[look] as WardrobeSelection;
  let dressed = project;
  for (const slot of ["fullBody", "top", "bottom", "shoes"] as const)
    dressed = selectWardrobeGarment(dressed, slot, null);
  for (const slot of ["top", "bottom", "shoes", "fullBody"] as const)
    if (selection[slot])
      dressed = selectWardrobeGarment(dressed, slot, selection[slot]);
  for (const hairId of hairIds)
    for (const faceId of faceIds) {
      const selected = selectWardrobeAppearance(dressed, { hairId, faceId });
      const renderer = await createWardrobeCompositor(selected);
      try {
        const validation = await validateWardrobeAppearance(renderer);
        assert.equal(validation.frames, 109);
        compositions.push({
          look,
          hairId,
          faceId,
          frames: validation.frames,
          newPoseRgbaSha256: Object.fromEntries(
            [107, 108].map((id) => [
              String(id),
              hash(renderer.renderFrame(id).pixels),
            ]),
          ),
        });
        console.log(
          `Validated ${look}: hair=${hairId ?? "source"}, face=${faceId ?? "source"}, 109 frames`,
        );
      } finally {
        renderer.dispose();
      }
    }
}
const saved = await exportWardrobeProject(project);
const restored = await importWardrobeProject(saved);
assert.deepEqual(restored.document, project.document);
assert.deepEqual(restored.source, project.source);
assert.deepEqual(restored.registrationBytes, project.registrationBytes);
assert.equal(restored.appearanceBank!.sha256, bank.sha256);
assert.deepEqual(
  restored.items.map((item) => item.sha256),
  project.items.map((item) => item.sha256),
);
const report = {
  format: "gathria-landing-production-runtime-verification",
  version: 1,
  visualAcceptance: "pending",
  sourceOnly: values["source-only"],
  sourceSha256: hash(source),
  registrationSha256: hash(registration),
  original107SourceFramesAndThreePagesExact: true,
  originalRegistrationGeometryExact: true,
  originalAppearancePngsAndAllStyleCropsExact: true,
  sourceActionsUnchanged: true,
  independentReferenceHashVerified: true,
  wardrobeProjectRoundtrip: {
    sha256: hash(saved),
    bytes: saved.length,
    exactEmbeddedSourceRegistrationItemsAppearance: true,
  },
  compositions,
};
const reportPath = resolve(
  values.report ?? directory + "/runtime-verification.json",
);
mkdirSync(resolve(reportPath, ".."), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    verified: true,
    compositions: compositions.length,
    report: reportPath,
  }),
);
