// Local browser diagnostic, not a CI performance threshold. Instrument the
// unchanged compositor method at the dev-server boundary; exported pixels and
// the application's frame clock are not modified. Run before and after on the
// same machine, browser and native frame sequences.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

const output = process.argv[2];
if (!output) throw Error("Pass an output JSON path.");
const url = process.env.PAIRED_BENCH_URL ?? "http://127.0.0.1:5176";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
let frozenWorkspace;
try {
  for (const character of ["male", "female"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    // Freeze this module for both genders if development files change while a
    // diagnostic is running. The recorded hash identifies exactly what ran.
    await context.route(
      /\/src\/wardrobe\/DualViewWardrobe\.tsx(?:\?|$)/,
      async (route) => {
        if (!frozenWorkspace)
          frozenWorkspace = await (await route.fetch()).text();
        await route.fulfill({
          contentType: "text/javascript",
          body: frozenWorkspace,
        });
      },
    );
    await context.route(
      /\/src\/wardrobe\/compositor\.ts(?:\?|$)/,
      async (route) => {
        const response = await route.fetch();
        const body = await response.text();
        if (!body.includes("class RegisteredWardrobeCompositor"))
          throw Error("Compositor instrumentation target changed.");
        await route.fulfill({
          response,
          body:
            body +
            `\nconst measuredRenderFrame = RegisteredWardrobeCompositor.prototype.renderFrame;
RegisteredWardrobeCompositor.prototype.renderFrame = function(id) {
  const probe = window.pairedPlaybackProbe;
  if (!probe?.active) return measuredRenderFrame.call(this, id);
  const started = performance.now();
  try { return measuredRenderFrame.call(this, id); }
  finally { probe.compositions.push({ id, durationMs: performance.now() - started }); }
};\n`,
        });
      },
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${url}/workbench.html?character=${character}&mode=paired`);
    const ready = () =>
      expect(page.getByTestId("dual-wardrobe")).toHaveAttribute(
        "aria-busy",
        "false",
        { timeout: 180000 },
      );
    await ready();
    await page.getByTestId("dual-complete-look").click();
    await ready();
    const cdp = await context.newCDPSession(page);
    for (const view of ["original", "side", "comparison"]) {
      if (view === "comparison") {
        await page.getByTestId("dual-play-pause").click();
        await page.getByTestId("dual-compare-toggle").click();
      } else {
        if (view === "side") await page.getByTestId("dual-play-pause").click();
        await page
          .getByTestId("workbench-source")
          .selectOption(view === "side" ? "side-view" : "original");
      }
      await page.getByTestId("dual-run").click();
      // Warm more than two native cycles before measuring recurring work.
      await page.waitForTimeout(2400);
      for (const cpuRate of [1, 4]) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
        await page.evaluate(() => {
          const canvases = [
            ...document.querySelectorAll(".dual-preview canvas"),
          ];
          const probe = (window.pairedPlaybackProbe = {
            active: true,
            compositions: [],
            samples: [],
          });
          const observer = new MutationObserver(() => {
            for (const canvas of canvases) {
              const last = probe.samples.findLast(
                (s) => s.view === canvas.dataset.view,
              );
              const sample = {
                at: performance.now(),
                view: canvas.dataset.view,
                action: canvas.dataset.action,
                id: Number(canvas.dataset.frameId),
              };
              if (
                !last ||
                last.id !== sample.id ||
                last.action !== sample.action
              )
                probe.samples.push(sample);
            }
          });
          for (const canvas of canvases)
            observer.observe(canvas, { attributes: true });
          probe.stop = () => {
            observer.disconnect();
            probe.active = false;
          };
        });
        const started = Date.now();
        await page.waitForTimeout(3000);
        const measured = await page.evaluate(() => {
          const probe = window.pairedPlaybackProbe;
          probe.stop();
          return { compositions: probe.compositions, samples: probe.samples };
        });
        results.push({
          character,
          view,
          cpuRate,
          wallDurationMs: Date.now() - started,
          ...measured,
        });
        console.log(
          `${character}/${view}/${cpuRate}x: ${measured.compositions.length} compositions, ${measured.samples.length} displayed source frames`,
        );
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
    expect(errors).toEqual([]);
    await context.close();
  }
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        scope:
          "Actual dev browser playback; three-second warm run samples. CPU4 is simulated throttling, not a mobile-device benchmark. No FPS or wall-time SLA.",
        workspaceModuleSha256: createHash("sha256")
          .update(frozenWorkspace)
          .digest("hex"),
        results,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
