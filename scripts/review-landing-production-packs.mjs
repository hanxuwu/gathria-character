import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
const input = resolve(process.argv[2] ?? "/tmp/landing-production/ui-review");
const out = resolve(process.argv[3] ?? "docs/kling-landing-production/review");
// Keep the default real-time review strict. Under concurrent CPU-heavy asset
// validation, this explicit mode checks every player clock tick without making
// a wall-clock performance claim or changing the production animation FPS.
const controlledClock = process.argv.includes("--controlled-clock");
await mkdir(out, { recursive: true });
const server = await createServer({
  root: process.cwd(),
  server: { host: "127.0.0.1", port: 5194, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
});
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rows = [];
try {
  const { importWardrobeProject } = await server.ssrLoadModule(
    "/src/wardrobe/project.ts",
  );
  const { createWardrobeCompositor } = await server.ssrLoadModule(
    "/src/wardrobe/compositor.ts",
  );
  const { decodeSourceRgbaPng } = await server.ssrLoadModule(
    "/src/core/baked-source.ts",
  );
  for (const look of ["original", "daily", "wedding"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
      acceptDownloads: true,
    });
    const forbidden = [],
      errors = [];
    context.on("request", (r) => {
      if (
        /\/src\/(?:wardrobe|appearance|side-view|skeletal)\/|\/workbench\.html/.test(
          r.url(),
        )
      )
        forbidden.push(r.url());
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    if (controlledClock)
      await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.goto("http://127.0.0.1:5194/player.html");
    const path = resolve(input, `${look}.character.zip`);
    const original = await readFile(path);
    const manifest = JSON.parse(
      Buffer.from(unzipSync(original)["manifest.json"]).toString(),
    );
    await page.locator("#player-zip").setInputFiles(path);
    await expect(page.locator(".player-status")).toContainText("Loaded:", {
      timeout: 180000,
    });
    const canvas = page.getByTestId("consumer-canvas");
    await expect(canvas).toHaveAttribute("data-gameplay-motion", "true");
    if (controlledClock)
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    await canvas.evaluate((c) => {
      window.__landingFrames = [];
      const capture = () =>
        window.__landingFrames.push({
          action: c.dataset.action,
          frameId: Number(c.dataset.frameId),
          page: Number(c.dataset.framePage),
          nowMs: performance.now(),
          elapsedMs: Number(c.dataset.elapsedMs),
          leadIn: c.dataset.leadIn === "true",
          leadInElapsedMs: Number(c.dataset.leadInElapsedMs),
        });
      window.__landingObserver = new MutationObserver(capture);
      window.__landingObserver.observe(c, { attributes: true });
      capture();
    });
    await page
      .getByRole("button", { name: "Run", exact: true })
      .click({ force: controlledClock });
    if (controlledClock) await page.clock.runFor(16);
    await expect(canvas).toHaveAttribute("data-action", "run");
    await page
      .getByRole("button", { name: "Jump", exact: true })
      .click({ force: controlledClock });
    if (controlledClock) {
      let completed = false,
        jumped = false;
      for (let ms = 0; ms < 5000; ms += 16) {
        await page.clock.runFor(16);
        const state = await canvas.evaluate((c) => ({
          action: c.dataset.action,
          leadIn: c.dataset.leadIn,
        }));
        jumped ||= state.action === "jump";
        if (jumped && state.action === "run" && state.leadIn === "false") {
          completed = true;
          break;
        }
      }
      assert(
        completed,
        "Run/Jump/Run must complete within 5 seconds of the controlled player clock",
      );
    } else {
      await expect(canvas).toHaveAttribute("data-action", "jump", {
        timeout: 5000,
      });
      await expect(canvas).toHaveAttribute("data-action", "run", {
        timeout: 5000,
      });
      await expect(canvas).toHaveAttribute("data-lead-in", "false", {
        timeout: 5000,
      });
    }
    const frames = await page.evaluate(() => {
      window.__landingObserver.disconnect();
      return window.__landingFrames;
    });
    await writeFile(
      resolve(out, `${look}-player-clock-trace.json`),
      JSON.stringify(
        {
          clock: controlledClock ? "playwright-controlled-16ms" : "wall-clock",
          nativeRunFps: manifest.animations.run.fps,
          nativeJumpFps: manifest.animations.jump.fps,
          frames,
        },
        null,
        2,
      ) + "\n",
    );
    for (const id of [107, 108])
      assert.ok(
        frames.some(
          (f) =>
            f.frameId === id &&
            f.page ===
              (manifest.frames.find((frame) => frame.id === id).page ?? 0),
        ),
        `Standalone ${look} must render frame${id} from its exported atlas`,
      );
    await page.screenshot({
      path: resolve(out, `${look}-independent-player.png`),
      fullPage: true,
    });
    const waiting = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Export selected CharacterPack",
        exact: true,
      })
      .click();
    const download = await waiting;
    const saved = await readFile(await download.path());
    assert.equal(sha(saved), sha(original));
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);
    // Independently compare every exported atlas crop to the exact saved UI
    // project, then check the two lossless frame PNGs downloaded in that UI.
    const project = await importWardrobeProject(
      new Uint8Array(await readFile(resolve(input, `${look}.wardrobe.zip`))),
    );
    const compositor = await createWardrobeCompositor(project);
    const files = unzipSync(original),
      digest = createHash("sha256");
    try {
      for (const [index, sheet] of [
        manifest.spritesheet,
        ...(manifest.additionalSheets ?? []),
      ].entries()) {
        const atlas = decodeSourceRgbaPng(files[sheet.file]);
        for (const frame of manifest.frames.filter(
          (f) => (f.page ?? 0) === index,
        )) {
          const expected = compositor.renderFrame(frame.id);
          assert.equal(expected.width, frame.width);
          assert.equal(expected.height, frame.height);
          for (let y = 0; y < frame.height; y++) {
            const start = ((frame.y + y) * atlas.width + frame.x) * 4;
            assert.deepEqual(
              atlas.pixels.subarray(start, start + frame.width * 4),
              expected.pixels.subarray(
                y * frame.width * 4,
                (y + 1) * frame.width * 4,
              ),
              `${look}: exported frame${frame.id} row${y}`,
            );
          }
          digest.update(String(frame.id) + ":");
          digest.update(expected.pixels);
        }
      }
      for (const id of [107, 108]) {
        const png = decodeSourceRgbaPng(
          new Uint8Array(
            await readFile(resolve(input, `${look}-${id}-right.png`)),
          ),
        );
        const expected = compositor.renderFrame(id);
        assert.equal(png.width, expected.width);
        assert.equal(png.height, expected.height);
        assert.deepEqual(
          png.pixels,
          expected.pixels,
          `${look}: UI PNG frame${id}`,
        );
      }
    } finally {
      compositor.dispose();
    }
    rows.push({
      look,
      bytes: original.length,
      sha256: sha(original),
      reexportExact: true,
      newFramesSeen: [107, 108],
      atlasPageCount: 1 + (manifest.additionalSheets?.length ?? 0),
      runJumpRun: true,
      playbackClock: controlledClock
        ? "playwright-controlled-16ms"
        : "wall-clock",
      clockScope: controlledClock
        ? "Deterministic player-clock functional check; not a wall-clock smoothness measurement."
        : "One strict real-time bridge-frame observation; not a sustained frame-rate certification.",
      maximumObservedDrawGapMs: frames
        .slice(1)
        .reduce(
          (maximum, frame, index) =>
            Math.max(maximum, frame.nowMs - frames[index].nowMs),
          0,
        ),
      nativeRunFps: manifest.animations.run.fps,
      nativeJumpFps: manifest.animations.jump.fps,
      allExportedFramesMatchSavedProject: manifest.frames.length,
      savedProjectRgbaSha256: digest.digest("hex"),
      exactWorkbenchPngs: [107, 108],
      forbiddenEditorRequests: forbidden,
      pageErrors: errors,
    });
    await context.close();
    console.log(`Standalone ${look} passed`);
  }
  await writeFile(
    resolve(out, "standalone-player-review.json"),
    JSON.stringify(
      { visualAcceptance: "pending", actualPlayer: "player.html", rows },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
