// Runtime-module audit, not an actual UI export. Uses frozen native source and
// existing authoring material variants to prove reuse without transferring art.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { unzipSync } from "fflate";
const root = new URL("../", import.meta.url).pathname;
const temp = process.env.TEMPLATE_AUDIT_OUT || "/tmp/side-refinement/templates";
const docs = `${root}/docs/kling-side-refinement/templates`;
await mkdir(temp, { recursive: true });
await mkdir(docs, { recursive: true });
const hash = (b) => createHash("sha256").update(b).digest("hex");
const bytesAt = (path) =>
  new Uint8Array(
    execFileSync(
      "git",
      ["show", `16fb1405239188a453d66cda94927106028eefbf:${path}`],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    ),
  );
const server = await createServer({
  root,
  cacheDir: `${temp}/vite-cache`,
  server: { middlewareMode: true, watch: null },
  appType: "custom",
});
const report = {
  checkedAt: new Date().toISOString(),
  baseline: "16fb1405239188a453d66cda94927106028eefbf",
  method:
    "Runtime TypeScript APIs via isolated Vite SSR; frozen source/registration/garment artwork. Existing authoring chromatic-ratio variants exercise a different garment ID/artwork. This is programmatic authoring evidence, not actual UI export or acceptance of new silhouettes.",
  characters: [],
};
try {
  const projectApi = await server.ssrLoadModule("/src/wardrobe/project.ts");
  const { createGarmentAuthoringSession } = await server.ssrLoadModule(
    "/src/wardrobe/garment-authoring.ts",
  );
  const api = await server.ssrLoadModule("/src/side-view/fitting-template.ts");
  const { importPaintedPoses } = await server.ssrLoadModule(
    "/src/wardrobe/paint-import.ts",
  );
  const { clothingPose } = await server.ssrLoadModule(
    "/src/wardrobe/recipe-kit.ts",
  );
  const { encodeSourceRgbaPng } = await server.ssrLoadModule(
    "/src/core/baked-source.ts",
  );
  for (const gender of ["male", "female"]) {
    const source = bytesAt(
      `docs/kling-side-workspace/assets/${gender}.source.zip`,
    );
    const registration = bytesAt(
      `artwork/kling-side-expansion/templates/${gender}.registration.json`,
    );
    const cloth = bytesAt(
      `docs/kling-side-expansion/assets/${gender}-${gender === "male" ? "shirt" : "blouse"}.garment.zip`,
    );
    const base = await projectApi.createWardrobeProject(source, registration, [
      cloth,
    ]);
    const donorId = base.items[0].manifest.id;
    const donor = projectApi.selectWardrobeGarment(base, "top", donorId);
    const poses =
      gender === "male"
        ? [0, 67, 82, 86, 89, 91, 95]
        : [0, 38, 39, 40, 49, 60, 67];
    const template = await api.exportFittingTemplate(donor, donorId, poses);
    await writeFile(`${docs}/${gender}.fitting-template.json`, template);
    const session = await createGarmentAuthoringSession(donor, donorId);
    let variant;
    try {
      variant = await session.build({
        id: `fitting-proof-${gender}-material-v1`,
        name: `${gender} fitting-template material proof`,
        material:
          gender === "male"
            ? {
                sourceRgb: [215, 120, 85],
                targetRgb: [85, 135, 155],
                tolerance: 0.32,
              }
            : {
                sourceRgb: [225, 215, 190],
                targetRgb: [160, 200, 215],
                tolerance: 0.32,
              },
      });
    } finally {
      session.dispose();
    }
    assert(variant.report.changedAtlasPixels > 0);
    const inventory = await projectApi.addWardrobeGarment(donor, variant.bytes);
    const targetId = variant.report.output.id;
    const target = projectApi.selectWardrobeGarment(inventory, "top", targetId);
    const inspected = api.inspectFittingTemplate(template, target, targetId);
    assert.equal(inspected.reusedFromDifferentGarment, true);
    assert.deepEqual(inspected.template.frameIds, poses);
    assert.equal(
      inspected.template.actions.find((clip) => clip.action === "jump").loop,
      false,
    );
    const kit = await api.exportFittingTemplateKit(template, target, targetId);
    const files = unzipSync(kit);
    assert.equal(hash(files["base.garment.zip"]), hash(variant.bytes));
    assert.equal(hash(files["registration.json"]), hash(registration));
    const targetItem = target.items.find(
      (item) => item.manifest.id === targetId,
    );
    for (const id of poses) {
      const native = clothingPose(targetItem, id);
      assert.equal(
        hash(files[`pose-${id}.png`]),
        hash(encodeSourceRgbaPng(native.image)),
      );
      assert.equal(
        hash(files[`mask-${id}.png`]),
        hash(encodeSourceRgbaPng(native.mask)),
      );
    }
    const roundtrip = await importPaintedPoses(target, kit);
    const rebuilt = await projectApi.readWardrobeGarment(
      roundtrip.bytes,
      target.registration,
      target.document.registrationSha256,
    );
    let exact = 0;
    for (const row of targetItem.manifest.frames) {
      const original = clothingPose(targetItem, row.frameId),
        output = clothingPose(rebuilt, row.frameId);
      assert.equal(hash(original.image.pixels), hash(output.image.pixels));
      assert.equal(hash(original.mask.pixels), hash(output.mask.pixels));
      exact++;
    }
    assert.equal(hash(target.source), hash(source));
    assert.equal(hash(target.registrationBytes), hash(registration));
    assert.equal(hash(donor.items[0].bytes), hash(cloth));
    await writeFile(`${temp}/${gender}.target.garment.zip`, variant.bytes);
    await writeFile(`${temp}/${gender}.target-kit.zip`, kit);
    const item = {
      gender,
      sourceSha256: hash(source),
      registrationSha256: hash(registration),
      donor: { id: donorId, sha256: hash(cloth) },
      target: {
        id: targetId,
        sha256: hash(variant.bytes),
        changedAtlasPixels: variant.report.changedAtlasPixels,
      },
      templateSha256: hash(template),
      templateBytes: template.length,
      kitSha256: hash(kit),
      selectedPoses: poses,
      exactTargetPosePngAndMasks: poses.length,
      fullTargetRoundtripExactFrames: exact,
      sourceAndRegistrationAndDonorUnchanged: true,
      jumpStillOneShot: true,
      currentMaskCopiedFromTarget: true,
    };
    report.characters.push(item);
    console.log(JSON.stringify(item));
  }
  await writeFile(
    `${docs}/verification.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await server.close();
}
