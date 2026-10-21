// Same-machine, sequential production-output comparison. Does not build or edit the app.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { cpus, loadavg, totalmem, freemem, platform, release } from "node:os";
import { readFile, writeFile, readdir, mkdir, access } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    assert(
      arg.startsWith("--") && arg.includes("="),
      `Expected --key=value: ${arg}`,
    );
    const split = arg.indexOf("=");
    return [arg.slice(2, split), arg.slice(split + 1)];
  }),
);
const root = resolve(args.root ?? process.cwd());
const output = resolve(
  args.output ?? "/tmp/wardrobe-load-profile/browser-report.json",
);
if (args.mode === "pixels") {
  await verifyDecoderPixels({ root, output, ref: args.ref ?? "ec9bd75" });
  process.exit(0);
}
const directories = {
  baseline: resolve(args.baseline ?? ""),
  candidate: resolve(args.candidate ?? ""),
};
assert(
  args.baseline && args.candidate,
  "Pass separate --baseline and --candidate production output directories.",
);
assert.notEqual(directories.baseline, directories.candidate);
const rounds = Number(args.rounds ?? 2);
assert(
  Number.isInteger(rounds) && rounds >= 2 && rounds <= 4,
  "Use 2–4 balanced rounds.",
);
const looks = (args.looks ?? "day").split(",");
assert(
  looks.length &&
    looks.every((look) => ["day", "wedding"].includes(look)) &&
    new Set(looks).size === looks.length,
);
const revisit = args.revisit;
assert(
  !revisit || looks.includes(revisit),
  "Revisit must be one of the initial looks.",
);
const stagesToTry = [
  ...looks.map((look) => ({ preset: look, stage: look })),
  ...(revisit ? [{ preset: revisit, stage: `${revisit}-revisit` }] : []),
];
const frozenRef = args.ref ?? "ec9bd75";
try {
  await access(output);
  throw Error(`Preserve prior results; output exists: ${output}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await mkdir(resolve(output, ".."), { recursive: true });
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");
const chromiumPath = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...argv) =>
  execFileSync("git", argv, { cwd: root, encoding: "utf8" }).trim();
const frozenCommit = git("rev-parse", `${frozenRef}^{commit}`);
const gitHashAlgorithm = git("rev-parse", "--show-object-format");
const catalogBytes = await readFile(
  join(root, "docs/kling-wardrobe/catalog.json"),
);
const catalog = JSON.parse(catalogBytes);
const logicalPaths = [
  ...new Set([
    "docs/kling-wardrobe/catalog.json",
    ...catalog.characters.flatMap((entry) =>
      [
        entry.sourceUrl,
        entry.registrationUrl,
        ...entry.items.map((item) => item.url),
      ].map((path) => path.slice(1)),
    ),
  ]),
].sort();
const frozenInputs = {};
for (const path of logicalPaths) {
  const bytes = await readFile(join(root, path));
  const objectId = createHash(gitHashAlgorithm)
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  assert.equal(
    objectId,
    git("rev-parse", `${frozenCommit}:${path}`),
    `Frozen catalog/art input changed: ${path}`,
  );
  frozenInputs[path] = { sha256: sha(bytes), bytes: bytes.length };
}
async function inventory(directory, parent = "") {
  const result = [];
  for (const entry of await readdir(join(directory, parent), {
    withFileTypes: true,
  })) {
    const file = join(parent, entry.name);
    if (entry.isDirectory()) result.push(...(await inventory(directory, file)));
    else if (entry.isFile()) {
      const bytes = await readFile(join(directory, file));
      result.push({
        file: file.split(sep).join("/"),
        bytes: bytes.length,
        sha256: sha(bytes),
      });
    }
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
}
const builds = {};
for (const [label, directory] of Object.entries(directories)) {
  const files = await inventory(directory);
  assert(
    files.some((file) => file.file === "workbench.html"),
    "Missing production workbench.html",
  );
  const byHash = new Map(files.map((file) => [file.sha256, file.file]));
  for (const [path, input] of Object.entries(frozenInputs))
    assert(
      byHash.has(input.sha256),
      `${label} does not contain frozen ${path}`,
    );
  builds[label] = {
    directory,
    files,
    assetPaths: Object.fromEntries(
      Object.entries(frozenInputs).map(([path, input]) => [
        path,
        "/" + byHash.get(input.sha256),
      ]),
    ),
  };
}
assert.notEqual(
  sha(JSON.stringify(builds.baseline.files)),
  sha(JSON.stringify(builds.candidate.files)),
  "Production outputs are identical; provide the optimized build.",
);
const report = {
  format: "gathria-wardrobe-load-comparison",
  version: 1,
  startedAt: new Date().toISOString(),
  frozenCommit,
  decoderSourceSha256: {
    baseline: sha(
      execFileSync(
        "git",
        ["show", `${frozenCommit}:src/core/baked-source.ts`],
        {
          cwd: root,
        },
      ),
    ),
    candidate: sha(await readFile(join(root, "src/core/baked-source.ts"))),
  },
  harnessSha256: sha(await readFile(new URL(import.meta.url))),
  frozenInputs,
  builds,
  conditions: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpus: cpus().map((cpu) => ({ model: cpu.model, speed: cpu.speed })),
    totalMemory: totalmem(),
    rounds,
    looks,
    revisit: revisit ?? null,
    viewport: { width: 1440, height: 1000 },
    browser: "Chromium headless",
    chromiumPath,
    cache:
      "New Chromium process and context per case; browser HTTP cache disabled. OS filesystem cache is not cleared.",
    execution:
      "Sequential; two builds served by identical loopback servers with no compression, no-store headers, and all build files preloaded in memory before timing.",
    timing:
      "Navigation start / captured preset click to the first observed ready canvas and non-busy status. Resource responseEnd values define transfer boundaries; these do not isolate import, validation, or PNG decoding.",
    limitations:
      "Small, order-balanced same-host sample. No browser instrumentation enters application functions. CPU contention and JIT/runtime variation may hide or exaggerate gains; report all runs and ranges. Startup and first-use preset results are separate; presets share the already-decoded source within that case.",
  },
  runs: [],
  errors: [],
  summary: [],
  passed: false,
};
const persist = () => writeFile(output, JSON.stringify(report, null, 2) + "\n");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".zip": "application/zip",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const servers = [],
  servedBytes = new Map();
async function serve(label) {
  const files = new Map();
  for (const file of builds[label].files) {
    if (!servedBytes.has(file.sha256))
      servedBytes.set(
        file.sha256,
        await readFile(join(directories[label], file.file)),
      );
    files.set("/" + file.file, servedBytes.get(file.sha256));
  }
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const bytes = files.get(pathname === "/" ? "/index.html" : pathname);
    response.writeHead(bytes ? 200 : 404, {
      "Content-Type": mime[extname(pathname)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      ...(bytes ? { "Content-Length": bytes.length } : {}),
    });
    response.end(bytes);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
function browserInstrumentation() {
  const state = (window.__wardrobeLoadProbe = {
    statuses: [],
    longTasks: [],
    ready: [],
    clicks: [],
  });
  let previous = "";
  const observe = () => {
    const editor = document.querySelector("#wardrobe-panel .wardrobe-editor");
    if (!editor) return;
    const status =
      editor.querySelector(".wardrobe-status")?.textContent?.trim() ?? "";
    const busy = editor.getAttribute("aria-busy");
    const canvas = editor.querySelector('[data-testid="wardrobe-preview"]');
    const snapshot = {
      status,
      busy,
      frameId: canvas?.dataset.renderedFrameId ?? null,
    };
    const key = JSON.stringify(snapshot);
    if (key === previous) return;
    previous = key;
    state.statuses.push({ at: performance.now(), ...snapshot });
    if (
      busy === "false" &&
      canvas?.dataset.renderedFrameId &&
      /Original outfit\.|selected\./.test(status)
    )
      state.ready.push({ at: performance.now(), ...snapshot });
  };
  new MutationObserver(observe).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-busy", "data-rendered-frame-id"],
  });
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest?.("#wardrobe-panel button");
      if (button)
        state.clicks.push({
          at: performance.now(),
          text: button.textContent.trim(),
        });
    },
    true,
  );
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        state.longTasks.push({
          start: entry.startTime,
          duration: entry.duration,
        });
    }).observe({ type: "longtask", buffered: true });
  } catch {}
}
async function ready(page, text, after = -1) {
  await page.waitForFunction(
    ({ text, after }) =>
      document.querySelector('#wardrobe-panel [role="alert"]') ||
      window.__wardrobeLoadProbe?.ready.some(
        (entry) => entry.at > after && entry.status.includes(text),
      ),
    { text, after },
    { timeout: 120000 },
  );
  const alerts = await page
    .locator('#wardrobe-panel [role="alert"]')
    .allTextContents();
  assert.deepEqual(alerts, []);
  return page.evaluate(
    ({ text, after }) =>
      window.__wardrobeLoadProbe.ready.find(
        (entry) => entry.at > after && entry.status.includes(text),
      ),
    { text, after },
  );
}
async function preview(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('[data-testid="wardrobe-preview"]');
    const pixels = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    return {
      width: canvas.width,
      height: canvas.height,
      frameId: canvas.dataset.renderedFrameId,
      action: canvas.dataset.renderedAction,
      rgbaSha256: [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    };
  });
}
function stages(run, from, to, logicalAssets) {
  const wanted = logicalAssets.map(
    (path) => builds[run.label].assetPaths[path],
  );
  const assets = run.resources.filter(
    (item) =>
      wanted.includes(item.pathname) && item.start >= from && item.end <= to,
  );
  assert.equal(
    assets.length,
    wanted.length,
    `Expected actual asset transfers: ${run.label}/${run.character}`,
  );
  const lastTransferEnd = assets.length
    ? Math.max(...assets.map((item) => item.end))
    : from;
  const tasks = run.probe.longTasks.filter(
    (task) => task.start >= from && task.start < to,
  );
  return {
    totalMs: to - from,
    lastAssetTransferEndMs: lastTransferEnd - from,
    afterLastAssetTransferToReadyMs: to - lastTransferEnd,
    assetTransferDurationSumMs: assets.reduce(
      (sum, item) => sum + item.duration,
      0,
    ),
    longTaskTotalMs: tasks.reduce((sum, task) => sum + task.duration, 0),
    longTaskMaxMs: Math.max(0, ...tasks.map((task) => task.duration)),
    assets,
  };
}
let browser;
try {
  const origins = {
    baseline: await serve("baseline"),
    candidate: await serve("candidate"),
  };
  for (let round = 0; round < rounds; round++)
    for (const character of ["male", "female"])
      for (const label of round % 2
        ? ["candidate", "baseline"]
        : ["baseline", "candidate"]) {
        const entry = catalog.characters.find((item) => item.key === character);
        const origin = origins[label];
        const errors = [];
        const run = {
          round,
          label,
          character,
          startedAt: new Date().toISOString(),
          hostBefore: { loadAverage: loadavg(), freeMemory: freemem() },
          looks: [],
        };
        report.runs.push(run);
        browser = await chromium.launch({
          headless: true,
          executablePath: chromiumPath,
        });
        report.conditions.chromiumVersion ??= browser.version();
        const context = await browser.newContext({
          viewport: report.conditions.viewport,
          deviceScaleFactor: 1,
          serviceWorkers: "block",
        });
        await context.addInitScript(browserInstrumentation);
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        page.on("pageerror", (error) =>
          errors.push({ kind: "pageerror", message: error.message }),
        );
        page.on("console", (message) => {
          if (message.type() === "error")
            errors.push({ kind: "console", message: message.text() });
        });
        page.on("requestfailed", (request) =>
          errors.push({
            kind: "requestfailed",
            url: request.url(),
            failure: request.failure(),
          }),
        );
        page.on("response", (response) => {
          if (response.status() >= 400)
            errors.push({
              kind: "http",
              url: response.url(),
              status: response.status(),
            });
        });
        page.on("request", (request) => {
          if (
            /^https?:/.test(request.url()) &&
            !request.url().startsWith(origin + "/")
          )
            errors.push({ kind: "external", url: request.url() });
        });
        await page.goto(
          `${origin}/workbench.html?character=${character}&mode=wardrobe`,
          { waitUntil: "domcontentloaded", timeout: 120000 },
        );
        const initial = await ready(page, "Original outfit.");
        run.initialReadyAt = initial.at;
        run.initialPreview = await preview(page);
        for (const look of stagesToTry) {
          const preset = entry.presets.find((item) => item.id === look.preset);
          assert(preset);
          await page
            .locator("#wardrobe-panel")
            .getByRole("button", { name: preset.name, exact: true })
            .click();
          const clicked = await page.evaluate(
            (name) =>
              window.__wardrobeLoadProbe.clicks.findLast(
                (entry) => entry.text === name,
              ),
            preset.name,
          );
          assert(clicked);
          const accepted = await ready(
            page,
            `${preset.name} selected.`,
            clicked.at,
          );
          const selection = {};
          for (const [slot, label] of Object.entries({
            top: "Top",
            bottom: "Bottom",
            fullBody: "Dress / one-piece",
            shoes: "Shoes",
          }))
            selection[slot] =
              (await page
                .getByRole("combobox", { name: label, exact: true })
                .inputValue()) || null;
          assert.deepEqual(selection, preset.selection);
          run.looks.push({
            look: look.stage,
            preset: look.preset,
            selection,
            clickAt: clicked.at,
            readyAt: accepted.at,
            preview: await preview(page),
          });
        }
        const observed = await page.evaluate(() => ({
          probe: window.__wardrobeLoadProbe,
          resources: performance.getEntriesByType("resource").map((item) => ({
            pathname: new URL(item.name).pathname,
            start: item.startTime,
            end: item.responseEnd,
            duration: item.duration,
            transferSize: item.transferSize,
            encodedBodySize: item.encodedBodySize,
          })),
          navigation: performance.getEntriesByType("navigation")[0]?.toJSON(),
        }));
        Object.assign(run, observed);
        run.initial = stages(run, 0, run.initialReadyAt, [
          "docs/kling-wardrobe/catalog.json",
          entry.sourceUrl.slice(1),
          entry.registrationUrl.slice(1),
        ]);
        const seen = new Set();
        for (const selected of run.looks) {
          const paths = Object.values(selected.selection)
            .filter((id) => id && !seen.has(id))
            .map((id) => {
              seen.add(id);
              return entry.items.find((item) => item.id === id).url.slice(1);
            });
          selected.stages = stages(
            run,
            selected.clickAt,
            selected.readyAt,
            paths,
          );
        }
        run.errors = errors;
        assert.deepEqual(errors, []);
        run.hostAfter = { loadAverage: loadavg(), freeMemory: freemem() };
        await persist();
        await browser.close();
        browser = null;
        console.log(
          `${label} ${character} round ${round + 1}: original ${run.initial.totalMs.toFixed(0)} ms; ${run.looks.map((look) => `${look.look} ${look.stages.totalMs.toFixed(0)} ms`).join("; ")}`,
        );
      }
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  for (const character of ["male", "female"])
    for (const stage of [
      "original",
      ...stagesToTry.map((look) => look.stage),
    ]) {
      const runs = report.runs.filter((run) => run.character === character);
      const get = (run) =>
        stage === "original"
          ? run.initial
          : run.looks.find((look) => look.look === stage).stages;
      const image = (run) =>
        stage === "original"
          ? run.initialPreview
          : run.looks.find((look) => look.look === stage).preview;
      for (const run of runs)
        assert.deepEqual(
          image(run),
          image(runs[0]),
          `Preview changed: ${character}/${stage}`,
        );
      const summary = { character, stage, pixelsIdenticalAcrossRuns: true };
      for (const label of ["baseline", "candidate"]) {
        const ms = runs
          .filter((run) => run.label === label)
          .map((run) => get(run).totalMs);
        summary[label] = {
          milliseconds: ms,
          medianMs: median(ms),
          minMs: Math.min(...ms),
          maxMs: Math.max(...ms),
        };
      }
      summary.medianChangeMs =
        summary.candidate.medianMs - summary.baseline.medianMs;
      summary.medianChangePercent =
        (100 * summary.medianChangeMs) / summary.baseline.medianMs;
      summary.rangesOverlap =
        summary.baseline.minMs <= summary.candidate.maxMs &&
        summary.candidate.minMs <= summary.baseline.maxMs;
      report.summary.push(summary);
    }
  for (const [label, directory] of Object.entries(directories))
    assert.deepEqual(
      await inventory(directory),
      builds[label].files,
      `${label} changed during measurement`,
    );
  report.passed = true;
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  throw error;
} finally {
  await browser?.close();
  await Promise.all(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
  report.finishedAt = new Date().toISOString();
  await persist();
}

async function verifyDecoderPixels({ root, output, ref }) {
  try {
    await access(output);
    throw Error(`Preserve prior results; output exists: ${output}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(resolve(output, ".."), { recursive: true });
  const require = createRequire(join(root, "package.json"));
  const { createServer } = await import(require.resolve("vite"));
  const { unzipSync } = require("fflate");
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const sourcePath = "src/core/baked-source.ts";
  const baselineCommit = execFileSync("git", ["rev-parse", `${ref}^{commit}`], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const baselineSource = execFileSync(
    "git",
    ["show", `${baselineCommit}:${sourcePath}`],
    { cwd: root, encoding: "utf8" },
  );
  const candidateSource = await readFile(join(root, sourcePath), "utf8");
  const boundaries = (source) => {
    const start = source.indexOf("export function decodeSourceRgbaPng("),
      end = source.indexOf("\nfunction pngChunk(", start);
    assert(start >= 0 && end > start);
    return {
      start,
      end,
      fn: source.slice(start, end),
      other: source.slice(0, start) + source.slice(end),
    };
  };
  const baseline = boundaries(baselineSource),
    candidate = boundaries(candidateSource);
  assert.equal(
    candidate.other,
    baseline.other,
    "Keep this change confined to the decoder function.",
  );
  assert.notEqual(
    candidate.fn,
    baseline.fn,
    "Candidate decoder matches baseline.",
  );
  const auditFile = "docs/kling-wardrobe/fit-polish/verification/exports.json";
  const auditBytes = await readFile(join(root, auditFile)),
    audit = JSON.parse(auditBytes);
  assert.equal(audit.passed, true);
  assert.equal(audit.exports.length, 4);
  const report = {
    format: "gathria-wardrobe-decoder-pixel-comparison",
    version: 1,
    startedAt: new Date().toISOString(),
    baselineCommit,
    baselineSourceSha256: hash(baselineSource),
    candidateSourceSha256: hash(candidateSource),
    harnessSha256: hash(await readFile(new URL(import.meta.url))),
    exportAudit: { file: auditFile, sha256: hash(auditBytes) },
    scope:
      "Every decoded RGBA byte and color-profile chunk on the eight atlas pages in the four audited actual UI CharacterPack downloads. Decode durations are diagnostics under shared-host conditions, not the isolated browser timing comparison.",
    pages: [],
    errors: [],
    passed: false,
  };
  let server;
  try {
    server = await createServer({
      root,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "error",
      plugins: [
        {
          name: "compare-frozen-decoder",
          enforce: "pre",
          transform(code, id) {
            if (!id.endsWith("/" + sourcePath)) return;
            assert.equal(code, candidateSource);
            return (
              code +
              "\n" +
              baseline.fn.replace(
                "export function decodeSourceRgbaPng(",
                "export function decodeBaselineRgbaPng(",
              )
            );
          },
        },
      ],
    });
    const { decodeSourceRgbaPng, decodeBaselineRgbaPng } =
      await server.ssrLoadModule("/" + sourcePath);
    for (const entry of audit.exports) {
      const bytes = await readFile(join(root, entry.pack.file));
      assert.equal(hash(bytes), entry.pack.sha256);
      assert.equal(bytes.length, entry.pack.bytes);
      const files = unzipSync(bytes),
        manifest = JSON.parse(
          Buffer.from(files["manifest.json"]).toString("utf8"),
        );
      const sheets = [
        manifest.spritesheet,
        ...(manifest.additionalSheets ?? []),
      ];
      assert.equal(sheets.length, 2);
      for (const [page, sheet] of sheets.entries()) {
        const png = files[sheet.file];
        assert.equal(hash(png), entry.pages[page].pngSha256);
        let at = performance.now();
        const before = decodeBaselineRgbaPng(png, sheet),
          baselineMs = performance.now() - at;
        at = performance.now();
        const after = decodeSourceRgbaPng(png, sheet),
          candidateMs = performance.now() - at;
        assert.equal(after.width, before.width);
        assert.equal(after.height, before.height);
        assert.deepEqual(after.colorChunks, before.colorChunks);
        const beforeBytes = Buffer.from(
            before.pixels.buffer,
            before.pixels.byteOffset,
            before.pixels.byteLength,
          ),
          afterBytes = Buffer.from(
            after.pixels.buffer,
            after.pixels.byteOffset,
            after.pixels.byteLength,
          );
        assert.equal(
          Buffer.compare(beforeBytes, afterBytes),
          0,
          `${entry.character}/${entry.look}/${page}: RGBA bytes differ`,
        );
        assert.equal(hash(afterBytes), entry.pages[page].rgbaSha256);
        report.pages.push({
          character: entry.character,
          look: entry.look,
          pack: entry.pack.file,
          packSha256: entry.pack.sha256,
          page,
          width: after.width,
          height: after.height,
          pngSha256: hash(png),
          rgbaSha256: hash(afterBytes),
          bytesCompared: afterBytes.length,
          rgbaBytesIdentical: true,
          colorChunksIdentical: true,
          baselineMs,
          candidateMs,
        });
        await writeFile(output, JSON.stringify(report, null, 2) + "\n");
        console.log(
          `Exact RGBA match: ${entry.character}/${entry.look} page ${page}, ${afterBytes.length} bytes`,
        );
      }
    }
    assert.equal(report.pages.length, 8);
    report.passed = true;
  } catch (error) {
    report.errors.push(error.stack ?? String(error));
    throw error;
  } finally {
    await server?.close();
    report.finishedAt = new Date().toISOString();
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  }
}
