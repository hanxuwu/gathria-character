// Isolated real-player transition measurement, recording actual browser frames.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { unzipSync } from "fflate";
const root = fileURLToPath(new URL("../", import.meta.url));
const run = process.argv[2];
const warmActions = process.argv.includes("--warm-actions");
assert(/^[a-z0-9-]+$/.test(run ?? ""), "Pass a unique capture label.");
const output = join(root, "docs/kling-wardrobe/fit-v2/browser");
await mkdir(output, { recursive: true });
const reportPath = join(output, `transition-probe-${run}.json`);
assert(!existsSync(reportPath));
const temporary = await mkdtemp(join(tmpdir(), "kling-transition-"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path);
const report = {
  startedAt: new Date().toISOString(),
  scope:
    "Isolated actual independent player, two jump-to-walk requests per female outfit, direct Canvas drawImage timings and raw bitmap observations. No character/source timing edits.",
  run,
  warmActions,
  runtimeHashes: {},
  packs: [],
  captures: [],
  errors: [],
};
for (const file of [
  "src/core/pack.ts",
  "src/consumer/player.ts",
  "src/consumer/PackPlayer.tsx",
])
  report.runtimeHashes[file] = sha(await readFile(join(root, file)));
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5191, strictPort: true },
});
let browser;
const button = (page, name) => page.getByRole("button", { name, exact: true });
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (const look of ["day", "wedding"]) {
    const packPath = join(
      root,
      `docs/kling-wardrobe/fit-v2/exports/female-${look}.character.zip`,
    );
    report.packs.push({
      look,
      file: rel(packPath),
      sha256: sha(await readFile(packPath)),
    });
    const manifest = JSON.parse(
      Buffer.from(
        unzipSync(new Uint8Array(await readFile(packPath)))["manifest.json"],
      ).toString(),
    );
    const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
      recordVideo: { dir: temporary, size: { width: 960, height: 720 } },
    });
    await context.addInitScript(() => {
      const original = CanvasRenderingContext2D.prototype.drawImage;
      const identities = new WeakMap();
      let id = 0;
      window.__transitionDraws = [];
      window.__transitionLongTasks = [];
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        const measured =
          this.canvas.getAttribute?.("data-testid") === "consumer-canvas";
        const started = performance.now();
        const result = original.apply(this, args);
        if (measured) {
          const image = args[0];
          if (!identities.has(image)) identities.set(image, ++id);
          window.__transitionDraws.push({
            atMs: started,
            durationMs: performance.now() - started,
            image: identities.get(image),
            width: image.naturalWidth ?? image.width,
            height: image.naturalHeight ?? image.height,
            action: this.canvas.dataset.action,
            frame: Number(this.canvas.dataset.frameId),
            source: args.slice(1, 5),
          });
        }
        return result;
      };
      new PerformanceObserver((list) =>
        window.__transitionLongTasks.push(
          ...list
            .getEntries()
            .map((e) => ({ atMs: e.startTime, durationMs: e.duration })),
        ),
      ).observe({ type: "longtask", buffered: true });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.goto("http://127.0.0.1:5191/player.html");
    await page.locator("#player-zip").setInputFiles(packPath);
    await expect(page.getByRole("status")).toContainText("Loaded:", {
      timeout: 180000,
    });
    await expect(
      page.getByLabel("Wait for a matching pose", { exact: true }),
    ).toBeChecked();
    if (await button(page, "Pause animation").count())
      await button(page, "Pause animation").click();
    await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
    await page.getByTestId("consumer-canvas").scrollIntoViewIfNeeded();
    if (warmActions) {
      for (const action of ["idle", "walk", "run", "jump", "celebrate"]) {
        const clip = manifest.animations[action];
        for (const facing of ["Right", "Left"]) {
          if (await button(page, "Pause animation").count())
            await button(page, "Pause animation").click();
          await button(page, action[0].toUpperCase() + action.slice(1)).click();
          await button(page, facing).click();
          await page.locator("#player-frame").fill("0");
          await button(page, "Play animation").click();
          await page.waitForTimeout(
            Math.ceil(
              ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.1 : 1) +
                200,
            ),
          );
        }
      }
      await button(page, "Pause animation").click();
      await button(page, "Right").click();
    }
    for (let iteration = 0; iteration < 2; iteration++) {
      if (await button(page, "Pause animation").count())
        await button(page, "Pause animation").click();
      await button(page, "Jump").click();
      await page.locator("#player-frame").fill("0");
      const trace = await page.evaluate(async () => {
        const canvas = document.querySelector(
          '[data-testid="consumer-canvas"]',
        );
        const started = performance.now(),
          observations = [];
        let last = "";
        function capture() {
          const e = {
            atMs: performance.now() - started,
            action: canvas.dataset.action,
            frameId: Number(canvas.dataset.frameId),
            position: Number(canvas.dataset.framePosition),
            elapsedMs: Number(canvas.dataset.elapsedMs),
            pending: canvas.dataset.pendingAction || "",
          };
          const key = `${e.action}/${e.position}/${e.pending}`;
          if (last !== key) {
            observations.push(e);
            last = key;
          }
        }
        const observer = new MutationObserver(capture);
        observer.observe(canvas, { attributes: true });
        capture();
        document.querySelector('button[aria-label="Play animation"]').click();
        setTimeout(
          () =>
            [
              ...document.querySelectorAll(
                '[aria-labelledby="player-motion-label"] button',
              ),
            ]
              .find((b) => b.textContent.trim() === "Walk")
              .click(),
          200,
        );
        await new Promise((resolve) => setTimeout(resolve, 2400));
        capture();
        observer.disconnect();
        document.querySelector('button[aria-label="Pause animation"]')?.click();
        return {
          observations,
          draws: window.__transitionDraws
            .filter((e) => e.atMs >= started)
            .map((e) => ({ ...e, atMs: e.atMs - started })),
          longTasks: window.__transitionLongTasks
            .filter((e) => e.atMs >= started)
            .map((e) => ({ ...e, atMs: e.atMs - started })),
        };
      });
      const lastJump = trace.observations
          .filter((e) => e.action === "jump")
          .at(-1),
        firstWalk = trace.observations.find((e) => e.action === "walk");
      assert.equal(lastJump.position, 38);
      assert(firstWalk);
      const maxDraw = Math.max(...trace.draws.map((e) => e.durationMs));
      report.captures.push({
        look,
        iteration,
        gapAtTransitionMs: firstWalk.atMs - lastJump.atMs,
        maximumDrawMs: maxDraw,
        ...trace,
      });
      console.log(
        `${look} #${iteration}: transition gap ${firstWalk.atMs - lastJump.atMs} ms; max draw ${maxDraw} ms`,
      );
    }
    const video = page.video();
    await context.close();
    const destination = join(
      output,
      `${run}-female-${look}-independent-transitions.webm`,
    );
    assert(!existsSync(destination));
    await video.saveAs(destination);
    execFileSync(
      "ffmpeg",
      ["-v", "error", "-i", destination, "-f", "null", "-"],
      { timeout: 60000 },
    );
    report.packs.at(-1).recording = {
      file: rel(destination),
      bytes: (await readFile(destination)).length,
      sha256: sha(await readFile(destination)),
      decoded: true,
      source:
        "Complete actual browser session including ZIP load and two queued Jump→Walk runs; no trimming, substitution or synthesized frames.",
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack || String(error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
