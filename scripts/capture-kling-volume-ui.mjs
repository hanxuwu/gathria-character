// Final picker screenshots with thumbnails sourced from real exported frames.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = root + "docs/kling-collection/volume-v1/ui";
await mkdir(output, { recursive: true });
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5220, strictPort: true, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
});
const report = { format: "gathria-volume-ui-review", errors: [], captures: [] };
try {
  for (const [character, outfit, hair] of [
    ["male", "Oat weekend", "Airy tousle"],
    ["female", "Honey garden", "Ribbon pony"],
  ]) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.goto(
      `http://127.0.0.1:5220/workbench.html?character=${character}&mode=wardrobe`,
    );
    const p = page.locator("#wardrobe-panel");
    await expect(p.getByRole("status")).toContainText("Original outfit.", {
      timeout: 240000,
    });
    const buttons = p.getByRole("button", { name: /^Choose / });
    // Six hairstyles per character: three existing plus three newly authored.
    await expect(buttons).toHaveCount(6);
    await p.getByRole("button", { name: outfit, exact: true }).click();
    await expect(p.getByRole("status")).toContainText(`${outfit} selected`, {
      timeout: 240000,
    });
    await p
      .getByRole("button", { name: `Choose ${hair}`, exact: true })
      .click();
    await expect(p.getByRole("status")).toContainText("Appearance updated", {
      timeout: 240000,
    });
    const pause = p.getByRole("button", {
      name: "Pause wardrobe animation",
      exact: true,
    });
    if (await pause.count()) await pause.click();
    await p.getByLabel("Wardrobe action", { exact: true }).selectOption("idle");
    await p
      .getByLabel("Wardrobe facing", { exact: true })
      .selectOption("right");
    await expect(p.getByRole("alert")).toHaveCount(0);
    await expect(
      p.getByText("This project uses the current appearance.", { exact: true }),
    ).toBeVisible();
    await expect(p.getByText(/custom or unrecognized appearance/)).toHaveCount(
      0,
    );
    const previews = p.locator('[aria-label="Hairstyle previews"] img');
    await expect(previews).toHaveCount(6);
    await expect
      .poll(() =>
        previews.evaluateAll((imgs) =>
          imgs.every((im) => im.complete && im.naturalWidth > 0),
        ),
      )
      .toBe(true);
    for (const [device, width, height] of [
      ["desktop", 1440, 1100],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: `${output}/${character}-${device}.png`,
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false);
      report.captures.push({
        character,
        outfit,
        hair,
        device,
        thumbnailCount: 6,
        overflow,
        file: `docs/kling-collection/volume-v1/ui/${character}-${device}.png`,
      });
    }
    await page.close();
    console.log(`Final UI checked: ${character}`);
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await writeFile(
    `${output}/evidence-index.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
