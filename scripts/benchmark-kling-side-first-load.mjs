// Compare scheduling alone, with frozen identical artwork and strict validators.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 180000 });
import { createServer } from "vite";

const args = Object.fromEntries(
  process.argv.slice(2).map((v) => v.replace(/^--/, "").split("=")),
);
assert(
  args.output && args["baseline-ref"],
  "Use --baseline-ref=COMMIT --output=/tmp/new-report.json [--rounds=2]",
);
const root = process.cwd(),
  output = resolve(args.output),
  rounds = Number(args.rounds ?? 2);
assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 4);
try {
  await stat(output);
  throw Error("Preserve existing reports; choose a new output path.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(dirname(output), { recursive: true });
const hash = (b) => createHash("sha256").update(b).digest("hex");
const changed = ["src/appearance/bank.ts", "src/wardrobe/compositor.ts"];
const runtime = new Map();
for (const name of await readdir(resolve(root, "src"), { recursive: true })) {
  if (/\.(tsx?|css)$/.test(name) && !name.includes(".test."))
    runtime.set(
      `src/${name}`,
      await readFile(resolve(root, "src", name), "utf8"),
    );
}
const baseline = new Map(
  changed.map((path) => [
    path,
    execFileSync("git", ["show", `${args["baseline-ref"]}:${path}`], {
      cwd: root,
      encoding: "utf8",
    }),
  ]),
);
const assets = new Map();
for (const id of ["male", "female"])
  for (const path of [
    `docs/kling-side-workspace/assets/${id}.source.zip`,
    `artwork/kling-side-expansion/templates/${id}.registration.json`,
    ...(id === "male" ? ["shirt", "trousers"] : ["blouse", "skirt"]).map(
      (slot) => `docs/kling-side-expansion/assets/${id}-${slot}.garment.zip`,
    ),
    `docs/kling-side-expansion/assets/${id}.appearance.zip`,
  ])
    assets.set(
      `/${path}`,
      execFileSync(
        "git",
        ["show", `${args["asset-ref"] ?? args["baseline-ref"]}:${path}`],
        { cwd: root, maxBuffer: 64 * 1024 * 1024 },
      ),
    );
const report = {
  format: "gathria-side-first-load-benchmark",
  version: 1,
  passed: false,
  startedAt: new Date().toISOString(),
  baselineRef: args["baseline-ref"],
  assetRef: args["asset-ref"] ?? args["baseline-ref"],
  rounds,
  scope:
    "Actual Chromium workbench, new browser context for every character/variant, HTTP cache disabled. Frozen identical source/clothes/hair. Only bank/compositor yield scheduling differs; all strict parsing, pixels, ownership and all-frame acceptance remain. Long tasks include existing synchronous PNG/ZIP operations, not only scheduling slices.",
  runtimeSha256: Object.fromEntries([...runtime].map(([p, c]) => [p, hash(c)])),
  baselineChangedSha256: Object.fromEntries(
    [...baseline].map(([p, c]) => [p, hash(c)]),
  ),
  assets: Object.fromEntries(
    [...assets].map(([p, b]) => [p, { sha256: hash(b), bytes: b.length }]),
  ),
  ui: [],
  pipeline: [],
  errors: [],
};
const servers = [];
let browser;
try {
  for (const [kind, port] of [
    ["before", 5192],
    ["after", 5193],
  ]) {
    const server = await createServer({
      root,
      cacheDir: resolve(
        dirname(output),
        `.vite-first-load-${process.pid}-${kind}`,
      ),
      plugins: [
        {
          name: "frozen-scheduling-benchmark",
          enforce: "pre",
          transform(_code, id) {
            const path = id.split("?")[0].replace(`${root}/`, "");
            const code =
              kind === "before" && baseline.has(path)
                ? baseline.get(path)
                : runtime.get(path);
            if (code !== undefined) return { code, map: null };
          },
          configureServer(vite) {
            vite.middlewares.use((req, res, next) => {
              const path = new URL(req.url, "http://localhost").pathname;
              if (path === "/benchmark-blank.html") {
                res.setHeader("content-type", "text/html");
                res.end("<!doctype html><title>Cold loader check</title>");
                return;
              }
              const bytes = assets.get(path);
              if (!bytes) {
                next();
                return;
              }
              res.setHeader(
                "content-type",
                path.endsWith(".json") ? "application/json" : "application/zip",
              );
              res.setHeader("cache-control", "no-store");
              res.setHeader("content-length", bytes.length);
              res.end(bytes);
            });
          },
        },
      ],
      server: {
        host: "127.0.0.1",
        port,
        strictPort: true,
        watch: null,
        hmr: false,
      },
    });
    await server.listen();
    servers.push(server);
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--enable-precise-memory-info"],
  });
  for (let round = 0; round < rounds; round++)
    for (const kind of round % 2 ? ["after", "before"] : ["before", "after"])
      for (const character of ["male", "female"]) {
        const origin = `http://127.0.0.1:${kind === "before" ? 5192 : 5193}`;
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        });
        try {
          await context.addInitScript(() => {
            window.__loadingMetrics = {
              longTasks: [],
              heartbeats: [],
              readyAt: null,
            };
            new PerformanceObserver((entries) => {
              for (const e of entries.getEntries())
                window.__loadingMetrics.longTasks.push({
                  start: e.startTime,
                  duration: e.duration,
                });
            }).observe({ type: "longtask", buffered: true });
            let previous = performance.now();
            window.__heartbeatTimer = setInterval(() => {
              const now = performance.now();
              window.__loadingMetrics.heartbeats.push(now - previous);
              previous = now;
            }, 16);
            const inspect = () => {
              const playground = document.querySelector(
                  '[data-testid="side-playground"]',
                ),
                canvas = document.querySelector('[data-testid="side-stage"]');
              if (
                window.__loadingMetrics.readyAt === null &&
                playground?.getAttribute("aria-busy") === "false" &&
                canvas?.getAttribute("data-character")
              ) {
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    window.__loadingMetrics.readyAt ??= performance.now();
                    clearInterval(window.__heartbeatTimer);
                  }),
                );
              }
            };
            new MutationObserver(inspect).observe(document, {
              subtree: true,
              childList: true,
              attributes: true,
            });
          });
          const page = await context.newPage();
          page.setDefaultTimeout(180000);
          page.on("pageerror", (e) => report.errors.push(e.message));
          const cdp = await context.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          await page.goto(
            `${origin}/workbench.html?character=${character}&mode=side-view&collection=tailored`,
          );
          await expect(page.getByTestId("side-playground")).toHaveAttribute(
            "aria-busy",
            "false",
          );
          await expect(page.getByTestId("side-stage")).toHaveAttribute(
            "data-character",
            character,
          );
          await page.waitForFunction(
            () => window.__loadingMetrics.readyAt !== null,
          );
          assert.deepEqual(
            await page
              .getByTestId("side-playground")
              .getByRole("alert")
              .allTextContents(),
            [],
          );
          const metrics = await page.evaluate(() => ({
            ...window.__loadingMetrics,
            heapBytes: performance.memory?.usedJSHeapSize ?? null,
          }));
          if (
            (await page
              .getByTestId("side-stage")
              .getAttribute("data-paused")) === "false"
          )
            await page.getByTestId("side-play-pause").click();
          await page.getByTestId("side-frame").fill("0");
          await expect(page.getByTestId("side-stage")).toHaveAttribute(
            "data-frame-position",
            "0",
          );
          const canvasSha256 = await page
            .getByTestId("side-stage")
            .evaluate(async (canvas) => {
              const rgba = canvas
                .getContext("2d")
                .getImageData(0, 0, canvas.width, canvas.height).data;
              return Array.from(
                new Uint8Array(await crypto.subtle.digest("SHA-256", rgba)),
                (n) => n.toString(16).padStart(2, "0"),
              ).join("");
            });
          report.ui.push({ round, kind, character, ...metrics, canvasSha256 });
          console.log(
            `${round} ${kind} ${character} first canvas ${Math.round(metrics.readyAt)}ms; longest task ${Math.round(Math.max(0, ...metrics.longTasks.filter((t) => t.start < metrics.readyAt).map((t) => t.duration)))}ms`,
          );
        } finally {
          await context.close();
        }
        // Independent fresh module state isolates load/normalization/all-pose stages.
        const pipelineContext = await browser.newContext();
        try {
          const page = await pipelineContext.newPage();
          page.on("pageerror", (e) => report.errors.push(e.message));
          await page.goto(`${origin}/benchmark-blank.html`);
          const metrics = await page.evaluate(async (character) => {
            const { loadSideProject, sideLookSelection } = await import(
              "/src/side-view/catalog.ts"
            );
            const { selectWardrobeGarment } = await import(
              "/src/wardrobe/project.ts"
            );
            const { createWardrobeCompositor, validateWardrobeAppearance } =
              await import("/src/wardrobe/compositor.ts");
            const times = {},
              start = performance.now();
            let project = await loadSideProject(
              character,
              undefined,
              "tailored",
            );
            times.load = performance.now() - start;
            const selection = sideLookSelection(character, "tailored");
            for (const slot of ["top", "bottom", "shoes"])
              if (selection[slot])
                project = selectWardrobeGarment(project, slot, selection[slot]);
            let tick = performance.now();
            const compositor = await createWardrobeCompositor(project);
            times.compositor = performance.now() - tick;
            const progress = [];
            tick = performance.now();
            const checked = await validateWardrobeAppearance(compositor, {
              onProgress: (done, total) => progress.push([done, total]),
            });
            times.allPoseValidation = performance.now() - tick;
            const digest = async (bytes) =>
              Array.from(
                new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
                (n) => n.toString(16).padStart(2, "0"),
              ).join("");
            const frames = [];
            for (const frame of compositor.sourceManifest.frames)
              frames.push([
                frame.id,
                await digest(compositor.renderFrame(frame.id).pixels),
              ]);
            const identities = await Promise.all(
              [
                project.source,
                project.registrationBytes,
                ...project.items.map((i) => i.bytes),
                project.appearanceBank.bytes,
              ].map(digest),
            );
            compositor.dispose();
            return { times, checked, progress, frames, identities };
          }, character);
          report.pipeline.push({ round, kind, character, ...metrics });
          console.log(
            `${round} ${kind} ${character} stages ${JSON.stringify(metrics.times)}`,
          );
        } finally {
          await pipelineContext.close();
        }
      }
  for (const character of ["male", "female"]) {
    const ui = report.ui.filter((r) => r.character === character),
      runs = report.pipeline.filter((r) => r.character === character);
    for (const row of ui)
      assert.equal(
        row.canvasSha256,
        ui[0].canvasSha256,
        "Changed actual UI canvas",
      );
    for (const row of runs) {
      assert.deepEqual(row.frames, runs[0].frames, "Changed rendered RGBA");
      assert.deepEqual(
        row.identities,
        runs[0].identities,
        "Changed asset identities",
      );
      assert.equal(row.checked.cacheHit, false, "Cold run was warm");
      assert.deepEqual(
        row.progress,
        Array.from({ length: row.frames.length + 1 }, (_, i) => [
          i,
          row.frames.length,
        ]),
        "Skipped pose acceptance progress",
      );
    }
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (e) {
  report.errors.push(String(e));
  throw e;
} finally {
  if (browser) await browser.close();
  for (const server of servers) await server.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
