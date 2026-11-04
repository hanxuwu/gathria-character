import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
const input = resolve(process.argv[2] ?? "/tmp/landing-production/ui-review");
const out = resolve(process.argv[3] ?? "docs/kling-landing-production/review");
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
    await canvas.evaluate((c) => {
      window.__landingFrames = [];
      const capture = () =>
        window.__landingFrames.push({
          action: c.dataset.action,
          frameId: Number(c.dataset.frameId),
          page: Number(c.dataset.framePage),
        });
      window.__landingObserver = new MutationObserver(capture);
      window.__landingObserver.observe(c, { attributes: true });
      capture();
    });
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-action", "run");
    await page.getByRole("button", { name: "Jump", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-action", "jump", {
      timeout: 5000,
    });
    await expect(canvas).toHaveAttribute("data-action", "run", {
      timeout: 5000,
    });
    await expect(canvas).toHaveAttribute("data-lead-in", "false", {
      timeout: 5000,
    });
    const frames = await page.evaluate(() => {
      window.__landingObserver.disconnect();
      return window.__landingFrames;
    });
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
    rows.push({
      look,
      bytes: original.length,
      sha256: sha(original),
      reexportExact: true,
      newFramesSeen: [107, 108],
      atlasPageCount: 1 + (manifest.additionalSheets?.length ?? 0),
      runJumpRun: true,
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
