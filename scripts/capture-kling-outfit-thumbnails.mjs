// Standing previews from real production UI PNG downloads, with exact asset bindings.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(
  root,
  process.env.KLING_THUMBNAIL_DIR || "src/wardrobe/outfit-previews",
);
const evidence = resolve(
  root,
  process.env.KLING_THUMBNAIL_EVIDENCE || "docs/kling-look-workflow/thumbnails",
);
await mkdir(out, { recursive: true });
await mkdir(join(evidence, "native"), { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const catalogBytes = await readFile(
  join(root, "docs/kling-wardrobe/catalog.json"),
);
const catalog = JSON.parse(catalogBytes);
const report = {
  format: "gathria-outfit-preview-index",
  version: 1,
  producedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  catalogSha256: sha(catalogBytes),
  recipe:
    "Production UI Save current PNG at idle frame 0, right, original head. Browser Canvas draws the decoded download at width 176 with proportional height, smooth downsampling and unchanged transparency. No crop, recolor or repaint.",
  previews: [],
  errors: [],
};
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5201, strictPort: true },
});
const origin = "http://127.0.0.1:5201";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--disable-dev-shm-usage"],
});
try {
  for (const entry of catalog.characters) {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(String(error)));
    const panel = page.locator("#wardrobe-panel"),
      status = panel.getByRole("status");
    await page.goto(
      `${origin}/workbench.html?character=${entry.key}&mode=wardrobe`,
    );
    await expect(status).toContainText("Original outfit.", { timeout: 180000 });
    const registrationBytes = await readFile(join(root, entry.registrationUrl));
    const registration = JSON.parse(registrationBytes);
    for (const preset of entry.presets.filter((p) =>
      Object.values(p.selection).some(Boolean),
    )) {
      await panel
        .getByLabel("Find an outfit", { exact: true })
        .fill(preset.name);
      await panel
        .getByRole("button", { name: preset.name, exact: true })
        .click();
      await page.waitForFunction(
        (name) => {
          const panel = document.querySelector("#wardrobe-panel");
          return (
            panel.querySelector("[role=alert]") ||
            panel
              .querySelector("[role=status]")
              .textContent.includes(name + " selected")
          );
        },
        preset.name,
        { timeout: 180000 },
      );
      assert.deepEqual(await panel.getByRole("alert").allTextContents(), []);
      await panel
        .getByLabel("Wardrobe action", { exact: true })
        .selectOption("idle");
      await panel.getByLabel("Wardrobe frame", { exact: true }).fill("0");
      const sourceFrame = Number(
        await panel
          .getByTestId("wardrobe-preview")
          .getAttribute("data-rendered-frame-id"),
      );
      const file = `${entry.key}-${preset.id}.png`;
      const download = page.waitForEvent("download", { timeout: 120000 });
      await panel
        .getByRole("button", { name: "Save current PNG", exact: true })
        .click();
      const d = await download;
      assert.equal(await d.failure(), null);
      const native = join(evidence, "native", file);
      await d.saveAs(native);
      const bytes = await readFile(native);
      const result = await page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 176;
        canvas.height = Math.round((image.height * 176) / image.width);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return {
          png: canvas.toDataURL().split(",")[1],
          nativeWidth: image.width,
          nativeHeight: image.height,
          width: canvas.width,
          height: canvas.height,
        };
      }, bytes.toString("base64"));
      const thumbnail = Buffer.from(result.png, "base64");
      await writeFile(join(out, file), thumbnail);
      const ids = new Set(Object.values(preset.selection).filter(Boolean));
      report.previews.push({
        character: entry.key,
        presetId: preset.id,
        name: preset.name,
        selection: preset.selection,
        sourceSha256: registration.sourceSha256,
        registrationSha256: sha(registrationBytes),
        items: entry.items
          .filter((item) => ids.has(item.id))
          .map(({ id, sha256 }) => ({ id, sha256 })),
        file,
        thumbnailSha256: sha(thumbnail),
        thumbnailBytes: thumbnail.length,
        nativeFile: rel(native),
        nativeSha256: sha(bytes),
        nativeBytes: bytes.length,
        sourceFrame,
        width: result.width,
        height: result.height,
        nativeWidth: result.nativeWidth,
        nativeHeight: result.nativeHeight,
      });
      await writeFile(
        join(evidence, "capture-progress.json"),
        JSON.stringify(report, null, 2) + "\n",
      );
      console.log(entry.key, preset.name, sourceFrame, thumbnail.length);
    }
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Captured", report.previews.length, "actual outfit thumbnails.");
} catch (error) {
  report.failure = String(error);
  await writeFile(
    join(evidence, "failed-attempt.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  throw error;
} finally {
  await browser.close();
  await server.httpServer.close();
}
