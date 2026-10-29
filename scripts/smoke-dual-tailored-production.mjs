// Smoke the built asset URLs, independently of Vite's development file server.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const output = "docs/dual-tailored/review/production";
await mkdir(output, { recursive: true });
const server = await preview({
  preview: { host: "127.0.0.1", port: 5195, strictPort: true },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const character of ["male", "female"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(
      `http://127.0.0.1:5195/workbench.html?character=${character}&mode=paired`,
    );
    const group = page.getByTestId("dual-outfit");
    await expect(group).toBeEnabled({ timeout: 120000 });
    await expect(group).toHaveValue("cotton-day");
    await group.selectOption("tailored-day");
    await expect(group).toBeEnabled({ timeout: 120000 });
    for (const view of ["original", "side"]) {
      await page
        .getByTestId("workbench-source")
        .selectOption(view === "side" ? "side-view" : "original");
      const stage = page.getByTestId("dual-stage");
      await expect(stage).toHaveAttribute("data-view", view);
      await expect(stage).toHaveAttribute("data-outfit", "tailored-day");
      for (const palette of ["sea", "apricot"]) {
        await page.getByTestId("dual-palette").selectOption(palette);
        await expect(group).toBeEnabled({ timeout: 120000 });
        await expect(stage).toHaveAttribute("data-palette", palette);
      }
      await page.getByTestId("dual-action").selectOption("run");
      await expect(stage).toHaveAttribute("data-action", "run");
      await page.screenshot({
        path: `${output}/${character}-${view}.png`,
        fullPage: true,
      });
      results.push({
        character,
        view,
        palettes: ["sea", "apricot"],
        action: "run",
        errors: [...errors],
      });
    }
    assert.deepEqual(errors, [], `${character} production loading errors`);
    await context.close();
  }
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify({ build: "vite production", results }, null, 2) + "\n",
  );
  console.log(
    "Production smoke passed: both characters, both native views, both palettes; no page or HTTP errors.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
