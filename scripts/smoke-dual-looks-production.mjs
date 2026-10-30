import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const directory = process.argv[2] || "docs/dual-looks/review/production";
const catalogPath = "docs/matched-hair/assets/catalog.json";
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
await mkdir(directory, { recursive: true });
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
    const apply = page.getByTestId("dual-complete-look");
    await expect(apply).toBeEnabled({ timeout: 120000 });
    await expect(page.getByTestId("dual-outfit")).toHaveValue("cotton-day");
    await apply.click();
    await expect(apply).toBeEnabled({ timeout: 240000 });
    for (const view of ["original", "side"]) {
      const representation = catalog.representations.find(
        (entry) => entry.character === character && entry.view === view,
      );
      assert(
        representation,
        `Missing active catalog row: ${character}/${view}`,
      );
      await page
        .getByTestId("workbench-source")
        .selectOption(view === "side" ? "side-view" : "original");
      const stage = page.getByTestId("dual-stage");
      await expect(stage).toHaveAttribute("data-view", view);
      await expect(stage).toHaveAttribute(
        "data-outfit",
        character === "female" ? "complete-day" : "tailored-day",
      );
      await expect(stage).toHaveAttribute("data-hair", "daily-hair");
      await expect(stage).toHaveAttribute("data-face", "gentle");
      await expect(stage).toHaveAttribute(
        "data-appearance-sha",
        representation.bankSha256,
      );
      await page.getByTestId("dual-action").selectOption("run");
      await expect(stage).toHaveAttribute("data-action", "run");
      await page.screenshot({
        path: `${directory}/${character}-${view}.png`,
        fullPage: true,
      });
      results.push({
        character,
        view,
        outfit: await stage.getAttribute("data-outfit"),
        appearanceSha256: await stage.getAttribute("data-appearance-sha"),
        activeCatalogBankExact: true,
        errors: [...errors],
      });
    }
    if (character === "female") {
      await page.setViewportSize({ width: 390, height: 844 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "Mobile horizontal overflow",
      );
      await page.screenshot({
        path: `${directory}/female-side-mobile.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, [], `${character} production errors`);
    await context.close();
  }
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify(
      { build: "vite production", catalogPath, results },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Complete-look production smoke passed: both characters/views, native appearance URLs, preserved cotton defaults, mobile layout; no HTTP/page errors.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
