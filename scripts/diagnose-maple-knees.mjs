// Direct-renderer diagnostics, not editor exports. No production asset is edited.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = new URL("../", import.meta.url);
const output = new URL("docs/maple-action-poses/knee-diagnostics/", root);
const scratch = await mkdtemp(join(tmpdir(), "gathria-maple-knees-"));
const port = Number(process.env.MAPLE_KNEE_PORT || 5197);
const baseline = "docs/generated-traveler/final/traveler-neutral";
const sourceFiles = [
  "src/skeletal/renderer.ts",
  "src/skeletal/skin-io.ts",
  "src/skeletal/types.ts",
  "src/experiments/denim-rig/mesh.ts",
  "src/core/illustrated-canvas.ts",
];
const inputFiles = [
  `${baseline}.rig.zip`,
  `${baseline}/manifest.json`,
  `${baseline}/spritesheet.png`,
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function hashes(paths) {
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        hash(await readFile(new URL(path, root))),
      ]),
    ),
  );
}
const variants = [
  ...[
    ["baseline", 6, 0.65],
    ["r3", 3, 0.65],
    ["r4", 4, 0.65],
    ["r8", 8, 0.65],
    ["r10", 10, 0.65],
    ["v0", 6, 0],
    ["v1", 6, 1],
    ["r4-v1", 4, 1],
    ["r8-v1", 8, 1],
  ].map(([name, blendRadius, volume]) => ({
    sweep: "mesh",
    name,
    blendRadius,
    volume,
  })),
  ...[
    ["baseline", 0, 0],
    ["knee-y-minus2", 0, -2],
    ["knee-y-plus2", 0, 2],
    ["knee-x-minus2", -2, 0],
    ["knee-x-plus2", 2, 0],
    ["knee-y-plus4", 0, 4],
  ].map(([name, kneeDx, kneeDy]) => ({
    sweep: "source-knee",
    name,
    kneeDx,
    kneeDy,
  })),
];
let server, browser;
try {
  const runtimeHashes = await hashes(sourceFiles);
  const inputHashes = await hashes(inputFiles);
  server = await createServer({
    root: fileURLToPath(root),
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/player.html`);
  const renders = await page.evaluate(
    async ({ baseline, variants }) => {
      const { importProject } = await import("/src/skeletal/skin-io.ts");
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const response = await fetch(`/${baseline}.rig.zip`);
      if (!response.ok)
        throw Error("Missing preserved Maple baseline project.");
      const project = await importProject(await response.blob());
      const results = [];
      for (const variant of variants) {
        // Only this in-memory copy changes; the original project stays untouched.
        const candidate = structuredClone(project);
        const bindings = candidate.skin.metadata.bindings;
        if (variant.sweep === "mesh") {
          bindings.mesh.blendRadius = variant.blendRadius;
          bindings.mesh.volume = variant.volume;
        } else {
          for (const chain of ["nearLeg", "farLeg"]) {
            bindings.chains[chain][1][0] += variant.kneeDx;
            bindings.chains[chain][1][1] += variant.kneeDy;
          }
        }
        const rig = prepareRig(
          candidate.rig,
          candidate.skin,
          candidate.motions,
        );
        const frames = [];
        for (const animation of ["idle", "walk", "run", "jump"]) {
          const clip = candidate.motions.clips[animation];
          for (let key = 0; key < clip.keys.length; key++) {
            const pixels = rig.frame(animation, key, "neutral");
            const canvas = document.createElement("canvas");
            canvas.width = 192;
            canvas.height = 256;
            canvas
              .getContext("2d")
              .putImageData(new ImageData(pixels, 192, 256), 0, 0);
            frames.push({
              animation,
              key,
              png: canvas.toDataURL("image/png").split(",")[1],
            });
          }
        }
        results.push({ ...variant, frames });
      }
      return results;
    },
    { baseline, variants },
  );
  assert.deepEqual(browserErrors, [], "Browser errors during diagnostics");
  assert.deepEqual(await hashes(sourceFiles), runtimeHashes, "Runtime changed");
  assert.deepEqual(await hashes(inputFiles), inputHashes, "Baseline changed");
  for (const variant of renders) {
    const folder = join(scratch, variant.sweep, variant.name);
    await mkdir(folder, { recursive: true });
    assert.equal(variant.frames.length, 36);
    for (const frame of variant.frames) {
      await writeFile(
        join(folder, `${frame.animation}-${frame.key}.png`),
        Buffer.from(frame.png, "base64"),
      );
    }
  }
  await writeFile(
    join(scratch, "diagnostics.json"),
    JSON.stringify({ baseline, variants, inputHashes, runtimeHashes }, null, 2),
  );
  await mkdir(output, { recursive: true });
  process.stdout.write(
    execFileSync(
      "python3",
      [
        fileURLToPath(
          new URL("render-maple-knee-diagnostics.py", import.meta.url),
        ),
        scratch,
        fileURLToPath(output),
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
} finally {
  await browser?.close();
  await server?.close();
  await rm(scratch, { recursive: true, force: true });
}
