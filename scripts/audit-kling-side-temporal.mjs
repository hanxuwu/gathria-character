// Descriptive diagnostics using the same application audit as the workbench.
// Does not render or alter character assets. Actual UI exports are separate QA.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
const output = resolve(
  process.argv[2] ?? `${root}/docs/kling-side-refinement/temporal/current`,
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root,
  cacheDir: "/tmp/side-refinement/temporal/vite-cache",
  server: { middlewareMode: true, watch: null, hmr: false },
  appType: "custom",
});
const summary = {
  checkedAt: new Date().toISOString(),
  method:
    "Strict runtime project import and auditFitting via isolated Vite SSR; descriptive inspection priorities, not visual acceptance or UI export evidence.",
  inputs: [],
  garments: [],
};
async function input(path) {
  const bytes = new Uint8Array(await readFile(resolve(root, path)));
  summary.inputs.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  return bytes;
}
try {
  const { createWardrobeProject } = await server.ssrLoadModule(
    "/src/wardrobe/project.ts",
  );
  const { decodeSourceRgbaPng } = await server.ssrLoadModule(
    "/src/core/baked-source.ts",
  );
  const { auditFitting } = await server.ssrLoadModule(
    "/src/side-view/fitting-analysis.ts",
  );
  for (const [gender, names] of [
    ["male", ["shirt", "trousers"]],
    ["female", ["blouse", "skirt"]],
  ]) {
    const source = await input(
      `docs/kling-side-workspace/assets/${gender}.source.zip`,
    );
    const registration = await input(
      `artwork/kling-side-expansion/templates/${gender}.registration.json`,
    );
    const items = [];
    for (const name of names)
      items.push(
        await input(
          `docs/kling-side-expansion/assets/${gender}-${name}.garment.zip`,
        ),
      );
    const project = await createWardrobeProject(source, registration, items);
    const pages = [
      project.archive.png,
      ...(project.archive.additionalPngs ?? []),
    ].map((png) => decodeSourceRgbaPng(png));
    function frame(frameId) {
      const f = project.archive.manifest.frames.find(
        (item) => item.id === frameId,
      );
      assert(f, `Missing source frame ${frameId}`);
      const page = pages[f.page ?? 0],
        pixels = new Uint8Array(f.width * f.height * 4);
      for (let y = 0; y < f.height; y++)
        pixels.set(
          page.pixels.subarray(
            ((f.y + y) * page.width + f.x) * 4,
            ((f.y + y) * page.width + f.x + f.width) * 4,
          ),
          y * f.width * 4,
        );
      return {
        width: f.width,
        height: f.height,
        pixels,
        colorChunks: page.colorChunks,
      };
    }
    for (const item of project.items) {
      const started = performance.now();
      const report = await auditFitting(project, item.manifest.id, frame);
      const durationMs = Math.round(performance.now() - started);
      const name = item.manifest.slot === "top" ? names[0] : names[1];
      const file = `${gender}-${name}.audit.json`;
      const bytes = JSON.stringify(report, null, 2) + "\n";
      await writeFile(resolve(output, file), bytes);
      const reviews = report.rows.filter((row) =>
        row.temporalChanges.some((change) => change.status === "review"),
      );
      const sourceMotion = report.rows.filter((row) =>
        row.temporalChanges.some((change) => change.status === "source-motion"),
      );
      const regionTotals = {};
      for (const row of report.rows)
        for (const region of row.temporalChanges) {
          const key = `${region.region}:${region.status}`;
          regionTotals[key] = (regionTotals[key] ?? 0) + 1;
        }
      const jumpEnd = report.rows.filter((row) => row.action === "jump").at(-1);
      assert(
        jumpEnd &&
          jumpEnd.nextFrameId === null &&
          !jumpEnd.isLoopSeam &&
          jumpEnd.temporalChanges.length === 0,
      );
      const seams = report.rows.filter((row) => row.isLoopSeam);
      assert.equal(seams.length, 3);
      summary.garments.push({
        gender,
        id: item.manifest.id,
        sha256: item.sha256,
        file,
        reportSha256: sha(bytes),
        durationMs,
        rows: report.rows.length,
        temporalReviewFrames: reviews.map((r) => ({
          action: r.action,
          frameId: r.frameId,
          nextFrameId: r.nextFrameId,
          regions: r.temporalChanges
            .filter((c) => c.status === "review")
            .map((c) => c.region),
        })),
        sourceMotionRows: sourceMotion.length,
        regionTotals,
        seams: seams.map((r) => ({
          action: r.action,
          from: r.frameId,
          to: r.nextFrameId,
        })),
        jumpEndUnpaired: true,
      });
      console.log(
        `${gender} ${name}: ${report.rows.length} rows, ${reviews.length} temporal inspection priorities, ${durationMs} ms`,
      );
    }
  }
  for (const record of summary.inputs)
    assert.equal(
      sha(await readFile(resolve(root, record.path))),
      record.sha256,
      `Input changed during audit: ${record.path}`,
    );
  summary.inputsUnchanged = true;
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
} finally {
  await server.close();
}
