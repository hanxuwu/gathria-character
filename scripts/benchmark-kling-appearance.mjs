// Sequential production-build comparison using identical repository artwork.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
const args = Object.fromEntries(
  process.argv.slice(2).map((v) => v.replace(/^--/, "").split("=")),
);
assert(
  args.before && args.after && args.output,
  "Use --before=dist --after=dist --output=report.json",
);
const root = process.cwd(),
  output = resolve(args.output);
try {
  await stat(output);
  throw Error("Preserve previous measurements; choose another output.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await mkdir(dirname(output), { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
  ".woff2": "font/woff2",
};
const assetHashes = new Map();
async function serve(directory, port) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const name = path === "/" ? "index.html" : path.slice(1);
    for (const base of [resolve(directory), resolve(root, "public"), root]) {
      const file = resolve(base, name);
      if (!file.startsWith(base + "/")) continue;
      try {
        const data = await readFile(file);
        if (path.startsWith("/docs/")) {
          const hash = sha(data);
          assert(
            !assetHashes.has(path) || assetHashes.get(path) === hash,
            `Artwork changed during timing: ${path}`,
          );
          assetHashes.set(path, hash);
        }
        res.writeHead(200, {
          "Content-Type": mime[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        res.end(data);
        return;
      } catch (e) {
        if (!["ENOENT", "EISDIR"].includes(e.code)) {
          res.writeHead(500);
          res.end(String(e));
          return;
        }
      }
    }
    res.writeHead(404);
    res.end("Not found");
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return server;
}
const servers = await Promise.all([
  serve(args.before, 5207),
  serve(args.after, 5208),
]);
const report = {
  scope:
    "Fresh Chromium contexts, HTTP cache disabled, identical local source/banks. Two order-balanced rounds; UI-ready timing, not a broad-device claim.",
  startedAt: new Date().toISOString(),
  runs: [],
  assetHashes: {},
  passed: false,
};
let browser;
async function ready(page, text) {
  await page.waitForFunction(
    (expected) => {
      const p = document.querySelector("#wardrobe-panel");
      return (
        p?.querySelector('[role="alert"]') ||
        (!p?.querySelector('[aria-busy="true"]') &&
          p?.querySelector('[role="status"]')?.textContent.includes(expected))
      );
    },
    text,
    { timeout: 240000 },
  );
  const error = await page
    .locator('#wardrobe-panel [role="alert"]')
    .allTextContents();
  assert.deepEqual(error, []);
}
async function pixels(page) {
  const pause = page.getByRole("button", {
    name: "Pause wardrobe animation",
    exact: true,
  });
  if (await pause.count()) await pause.click();
  await page
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("idle");
  await page.getByLabel("Wardrobe frame", { exact: true }).fill("0");
  return page.getByTestId("wardrobe-preview").evaluate(async (c) => {
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return {
      width: c.width,
      height: c.height,
      sha256: Array.from(digest, (n) => n.toString(16).padStart(2, "0")).join(
        "",
      ),
    };
  });
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (let round = 0; round < 2; round++)
    for (const build of round ? ["after", "before"] : ["before", "after"])
      for (const character of ["female", "male"]) {
        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(240000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await page.addInitScript(() => {
          window.__tasks = [];
          new PerformanceObserver((list) =>
            window.__tasks.push(
              ...list
                .getEntries()
                .map((e) => ({ start: e.startTime, duration: e.duration })),
            ),
          ).observe({ type: "longtask", buffered: true });
        });
        const run = { round, build, character, stages: [], errors };
        report.runs.push(run);
        console.log(`${round} ${build} ${character}`);
        async function measure(name, operation, text) {
          const start = await page.evaluate(() => performance.now());
          await operation();
          await ready(page, text);
          const end = await page.evaluate(() => performance.now());
          run.stages.push({
            name,
            milliseconds: Math.round(end - start),
            longTasks: await page.evaluate(
              ([a, b]) =>
                window.__tasks.filter((t) => t.start >= a && t.start <= b),
              [start, end],
            ),
            pixels: await pixels(page),
          });
        }
        const start = performance.now();
        await page.goto(
          `http://127.0.0.1:${build === "before" ? 5207 : 5208}/workbench.html?character=${character}&mode=wardrobe`,
        );
        await ready(page, "Original outfit.");
        run.sourceOpenMs = Math.round(performance.now() - start);
        await measure(
          "first-outfit",
          () =>
            page.getByRole("button", { name: "Everyday", exact: true }).click(),
          "Everyday selected",
        );
        const hair = character === "female" ? "ribbon-pony" : "airy-tousle";
        await measure(
          "first-hair",
          () =>
            page.getByLabel("Hairstyle", { exact: true }).selectOption(hair),
          "Appearance updated",
        );
        await measure(
          "reset-hair",
          () =>
            page
              .getByRole("button", { name: "Reset appearance", exact: true })
              .click(),
          "Appearance updated",
        );
        await measure(
          "repeat-hair",
          () =>
            page.getByLabel("Hairstyle", { exact: true }).selectOption(hair),
          "Appearance updated",
        );
        assert.deepEqual(run.stages[1].pixels, run.stages[3].pixels);
        assert.deepEqual(errors, []);
        await context.close();
        report.assetHashes = Object.fromEntries(assetHashes);
        await writeFile(output, JSON.stringify(report, null, 2) + "\n");
      }
  for (const character of ["female", "male"])
    for (const name of [
      "first-outfit",
      "first-hair",
      "reset-hair",
      "repeat-hair",
    ]) {
      const rows = report.runs
        .filter((r) => r.character === character)
        .map((r) => r.stages.find((s) => s.name === name));
      for (const row of rows) assert.deepEqual(row.pixels, rows[0].pixels);
    }
  report.finishedAt = new Date().toISOString();
  report.passed = true;
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
} catch (e) {
  report.failure = String(e);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  throw e;
} finally {
  await browser?.close();
  for (const server of servers) await new Promise((r) => server.close(r));
}
