// Isolate the side-view loader change with the same immutable asset snapshot.
// No source/garment/image edits and no reduced import validation in either build.
// Both sides use the current UI. Restoring a retained UI context is reported
// separately from loading one, and is not evidence of a faster catalog import.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const args = Object.fromEntries(
  process.argv.slice(2).map((v) => v.replace(/^--/, "").split("=")),
);
assert(
  args["baseline-ref"] && args.output,
  "Use --baseline-ref=COMMIT --output=/tmp/new-report.json [--latency-ms=0] [--rounds=2]",
);
const root = process.cwd();
const output = resolve(args.output);
const latency = Number(args["latency-ms"] || 0);
const rounds = Number(args.rounds || 2);
assert(Number.isInteger(latency) && latency >= 0 && latency <= 1000);
assert(Number.isInteger(rounds) && rounds > 0 && rounds <= 5);
try {
  await stat(output);
  throw Error("Choose a new report path; previous measurements are preserved.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(dirname(output), { recursive: true });
const sha = (data) => createHash("sha256").update(data).digest("hex");
const side = (page) => page.locator('[data-testid="side-playground"]:visible');
const baseline = execFileSync(
  "git",
  ["show", `${args["baseline-ref"]}:src/side-view/catalog.ts`],
  { cwd: root, encoding: "utf8" },
);
const candidate = await readFile(
  resolve(root, "src/side-view/catalog.ts"),
  "utf8",
);
const cacheCode = await readFile(
  resolve(root, "src/side-view/source-cache.ts"),
);
const runtimePaths = (await readdir(resolve(root, "src"), { recursive: true }))
  .filter((path) => /\.(ts|tsx|css)$/.test(path) && !/\.test\./.test(path))
  .sort();
async function runtimeHashes() {
  return Object.fromEntries(
    await Promise.all(
      runtimePaths.map(async (path) => [
        path,
        sha(await readFile(resolve(root, "src", path))),
      ]),
    ),
  );
}
const runtimeBefore = await runtimeHashes();
const snapshot = new Map();
for (const character of ["male", "female"]) {
  const entries = [
    `docs/kling-side-workspace/assets/${character}.source.zip`,
    `docs/kling-side-workspace/assets/${character}.registration.json`,
    ...["top", "bottom", "shoes"].map(
      (slot) =>
        `docs/kling-side-workspace/assets/${character}-${slot}.garment.zip`,
    ),
    `artwork/kling-side-expansion/templates/${character}.registration.json`,
    ...[
      ...(character === "male" ? ["shirt", "trousers"] : ["blouse", "skirt"]),
    ].map(
      (slot) =>
        `docs/kling-side-expansion/assets/${character}-${slot}.garment.zip`,
    ),
    `docs/kling-side-expansion/assets/${character}.appearance.zip`,
  ];
  for (const path of entries) {
    const bytes = execFileSync(
      "git",
      ["show", `${args["asset-ref"] || args["baseline-ref"]}:${path}`],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    );
    snapshot.set(`/${path}`, bytes);
  }
}
const report = {
  format: "gathria-side-loading-benchmark",
  version: 1,
  startedAt: new Date().toISOString(),
  passed: false,
  scope:
    "Real Chromium, Vite development modules, HTTP cache disabled. Same frozen asset bytes and validation code; only catalog loader is replaced by git baseline. Both UI runs use the current workbench. Catalog load excludes compositor/preflight/UI. UI context restoration is recorded separately and is not a loader speedup. Heap is a noisy browser observation, not total process/GPU memory.",
  latencyMsPerAsset: latency,
  baselineRef: args["baseline-ref"],
  assetRef: args["asset-ref"] || args["baseline-ref"],
  rounds,
  runtimeSha256: runtimeBefore,
  code: {
    baselineCatalog: sha(baseline),
    candidateCatalog: sha(candidate),
    sourceCache: sha(cacheCode),
  },
  assets: Object.fromEntries(
    [...snapshot].map(([path, data]) => [
      path,
      { bytes: data.length, sha256: sha(data) },
    ]),
  ),
  runs: [],
  uiRuns: [],
  uiTimingSemantics: {
    "fresh-document-load":
      "Initial page navigation through ready UI; includes document/module loading.",
    "new-context-load":
      "First opening of this source-bound context in an existing workbench.",
    "context-reload":
      "Switch requiring a load because no ready retained context was present.",
    "retained-context-restore":
      "A ready matching context existed before the action; visibility restoration, not catalog loading.",
    comparisonRule:
      "Compare only equal operation labels. Never pool retained restorations with fresh loads or infer catalog speedup from them.",
  },
  uiTimingGroups: {
    "fresh-document-load": [],
    "new-context-load": [],
    "context-reload": [],
    "retained-context-restore": [],
  },
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
        `.vite-side-loading-${process.pid}-${kind}`,
      ),
      plugins: [
        {
          name: "frozen-loader-benchmark",
          enforce: "pre",
          transform(_code, id) {
            if (id.split("?")[0] === resolve(root, "src/side-view/catalog.ts"))
              return {
                code: kind === "before" ? baseline : candidate,
                map: null,
              };
          },
          configureServer(vite) {
            vite.middlewares.use((req, res, next) => {
              const pathname = new URL(req.url, "http://localhost").pathname;
              const bytes = snapshot.get(pathname);
              if (pathname === "/performance-blank.html") {
                res.setHeader("content-type", "text/html");
                res.end("<!doctype html><title>Side loading benchmark</title>");
                return;
              }
              if (!bytes) {
                next();
                return;
              }
              const send = () => {
                res.setHeader(
                  "content-type",
                  pathname.endsWith(".json")
                    ? "application/json"
                    : "application/zip",
                );
                res.setHeader("cache-control", "no-store");
                res.setHeader("content-length", bytes.length);
                res.end(bytes);
              };
              if (latency) setTimeout(send, latency);
              else send();
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
  for (let round = 0; round < rounds; round++) {
    for (const kind of round % 2 ? ["after", "before"] : ["before", "after"]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        page.on("pageerror", (e) => report.errors.push(e.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await page.goto(
          `http://127.0.0.1:${kind === "before" ? 5192 : 5193}/performance-blank.html`,
        );
        const samples = await page.evaluate(async () => {
          const { loadSideProject } = await import("/src/side-view/catalog.ts");
          const samples = [];
          const digest = async (bytes) =>
            Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
              (n) => n.toString(16).padStart(2, "0"),
            ).join("");
          for (const [id, collection] of [
            ["male", "tailored"],
            ["female", "tailored"],
            ["male", "tailored"],
            ["male", "material"],
            ["male", "tailored"],
            ["female", "tailored"],
          ]) {
            performance.clearResourceTimings();
            const start = performance.now();
            const project = await loadSideProject(id, undefined, collection);
            const elapsedMs = performance.now() - start;
            const archiveHashes = [];
            for (const bytes of [
              project.source,
              project.registrationBytes,
              ...project.items.map((i) => i.bytes),
              ...(project.appearanceBank ? [project.appearanceBank.bytes] : []),
            ])
              archiveHashes.push(await digest(bytes));
            samples.push({
              id,
              collection,
              elapsedMs,
              heapBytes: performance.memory?.usedJSHeapSize ?? null,
              archiveHashes,
              document: structuredClone(project.document),
              resources: performance
                .getEntriesByType("resource")
                .filter((r) => /\.(zip|json)(?:\?|$)/.test(r.name))
                .map((r) => ({
                  path: new URL(r.name).pathname,
                  duration: r.duration,
                  transferBytes: r.transferSize,
                  encodedBytes: r.encodedBodySize,
                })),
            });
            // Public mutations must not affect subsequent validated imports.
            project.source[0] = 0;
            project.registrationBytes[0] = 0;
            project.document.preview.action = "jump";
          }
          return samples;
        });
        report.runs.push({ round, kind, samples });
        console.log(
          `${round} ${kind}: ${samples.map((s) => `${s.id}/${s.collection}=${Math.round(s.elapsedMs)}ms (${s.resources.length} requests)`).join(", ")}`,
        );
      } finally {
        await context.close();
      }
      if (args.ui === "true") {
        const uiContext = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
        });
        try {
          const page = await uiContext.newPage();
          page.setDefaultTimeout(180000);
          page.on("pageerror", (e) => report.errors.push(e.message));
          const cdp = await uiContext.newCDPSession(page);
          await cdp.send("Network.enable");
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          const ui = { round, kind, samples: [] };
          const sequence = [
            ["male", "tailored"],
            ["female", "tailored"],
            ["male", "tailored"],
            ["male", "material"],
            ["male", "tailored"],
          ];
          for (let i = 0; i < sequence.length; i++) {
            const [id, collection] = sequence[i];
            // Inspect before starting the existing measured interval: a fast
            // return to a retained editor must not be labelled a fresh import.
            const beforeAction = await page.evaluate(
              ({ id, collection }) => {
                const slots = [
                  ...document.querySelectorAll('[data-testid="side-session"]'),
                ];
                const target = slots.find(
                  (slot) =>
                    slot.getAttribute("data-character") === id &&
                    slot.getAttribute("data-collection") === collection,
                );
                return {
                  retainedWorkspace: slots.length > 0,
                  targetSessionKey:
                    target?.getAttribute("data-session-key") ?? null,
                  ready: !!target?.querySelector(
                    '[data-testid="side-playground"][aria-busy="false"] [data-testid="side-stage"][data-frame-id]',
                  ),
                };
              },
              { id, collection },
            );
            const operation =
              i === 0
                ? "fresh-document-load"
                : beforeAction.ready
                  ? "retained-context-restore"
                  : beforeAction.retainedWorkspace &&
                      !beforeAction.targetSessionKey
                    ? "new-context-load"
                    : "context-reload";
            const start = performance.now();
            if (i === 0) {
              await page.goto(
                `http://127.0.0.1:${kind === "before" ? 5192 : 5193}/workbench.html?character=male&mode=side-view&collection=tailored`,
              );
            } else if (sequence[i - 1][0] !== id) {
              await side(page).getByTestId("side-character").selectOption(id);
            } else {
              await side(page)
                .getByTestId("side-collection")
                .selectOption(collection);
            }
            await expect(side(page)).toHaveAttribute("aria-busy", "false", {
              timeout: 180000,
            });
            await expect(side(page).getByTestId("side-stage")).toHaveAttribute(
              "data-character",
              id,
            );
            await expect(side(page).getByTestId("side-stage")).toHaveAttribute(
              "data-collection",
              collection,
            );
            const elapsedMs = performance.now() - start;
            assert.deepEqual(
              await side(page).getByRole("alert").allTextContents(),
              [],
            );
            if (
              (await side(page)
                .getByTestId("side-stage")
                .getAttribute("data-paused")) === "false"
            )
              await side(page).getByTestId("side-play-pause").click();
            await side(page).getByTestId("side-frame").fill("0");
            await expect(side(page).getByTestId("side-stage")).toHaveAttribute(
              "data-frame-position",
              "0",
            );
            const pixels = await side(page)
              .getByTestId("side-stage")
              .evaluate(async (canvas) => {
                const rgba = canvas
                  .getContext("2d")
                  .getImageData(0, 0, canvas.width, canvas.height).data;
                const hash = Array.from(
                  new Uint8Array(await crypto.subtle.digest("SHA-256", rgba)),
                  (n) => n.toString(16).padStart(2, "0"),
                ).join("");
                return {
                  width: canvas.width,
                  height: canvas.height,
                  sha256: hash,
                  heapBytes: performance.memory?.usedJSHeapSize ?? null,
                };
              });
            ui.samples.push({
              id,
              collection,
              operation,
              beforeAction,
              elapsedMs,
              pixels,
            });
            report.uiTimingGroups[operation].push({
              round,
              kind,
              id,
              collection,
              elapsedMs,
            });
            console.log(
              `${round} ${kind} UI ${id}/${collection} [${operation}]=${Math.round(elapsedMs)}ms`,
            );
          }
          report.uiRuns.push(ui);
        } finally {
          await uiContext.close();
        }
      }
    }
  }
  if (report.uiRuns.length) {
    const reference = report.uiRuns[0].samples;
    for (const run of report.uiRuns)
      for (let i = 0; i < reference.length; i++)
        assert.equal(
          run.samples[i].pixels.sha256,
          reference[i].pixels.sha256,
          "UI preview changed between loader versions",
        );
  }
  const reference = report.runs[0].samples;
  for (const run of report.runs)
    for (let i = 0; i < reference.length; i++) {
      assert.deepEqual(
        run.samples[i].archiveHashes,
        reference[i].archiveHashes,
        "asset identity changed",
      );
      assert.deepEqual(
        run.samples[i].document,
        reference[i].document,
        "returned project identity changed or mutation leaked",
      );
      assert.equal(run.samples[i].document.preview.action, "idle");
      if (run.kind === "after" && i >= 2)
        assert(
          !run.samples[i].resources.some((r) => r.path.endsWith(".source.zip")),
          "warm source was unnecessarily downloaded",
        );
    }
  assert.deepEqual(report.errors, []);
  assert.equal(
    sha(await readFile(resolve(root, "src/side-view/source-cache.ts"))),
    sha(cacheCode),
    "cache code changed while benchmarking",
  );
  assert.deepEqual(
    await runtimeHashes(),
    runtimeBefore,
    "Runtime code changed during measurement; discard this run.",
  );
  report.finishedAt = new Date().toISOString();
  report.passed = true;
} catch (e) {
  report.errors.push(String(e));
  throw e;
} finally {
  if (browser) await browser.close();
  for (const server of servers) await server.close();
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
}
