import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";

async function draw(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

// Historical motion2 must remain selectable/reopenable after motion3 becomes default.
test("saved everyday motion stays unchanged until corrected copy, then exports and plays without Studio", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  const original = {
    ...JSON.parse(
      await readFile("docs/everyday/coral-afternoon/character.json", "utf8"),
    ),
    preview: { animation: "run", facing: "left" },
  };
  await page.goto("/editor.html");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  const upload = {
    name: "coral-motion2.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  };
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(upload);
  const canvas = page
    .getByRole("region", { name: "Animation preview" })
    .locator("canvas");
  await draw(page);
  const before = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  async function save(name: string) {
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save config", exact: true })
      .click();
    const path = testInfo.outputPath(name);
    await (await download).saveAs(path);
    return { path, config: JSON.parse(await readFile(path, "utf8")) };
  }
  expect((await save("preserved.json")).config).toEqual(original);
  await page.getByRole("button", { name: "Rowan preset", exact: true }).click();
  expect((await save("preserved-preset.json")).config.motionVersion).toBe(2);
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(upload);
  await page
    .getByRole("button", { name: "Create corrected running copy", exact: true })
    .click();
  await draw(page);
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
  ).not.toBe(before);
  await expect(canvas).toHaveAttribute(
    "aria-label",
    `${original.name}, run, facing left`,
  );
  const saved = await save("corrected.json");
  expect(saved.config).toEqual({ ...original, motionVersion: 3 });
  await page.getByRole("button", { name: "Rowan preset", exact: true }).click();
  expect((await save("corrected-preset.json")).config.motionVersion).toBe(3);
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(saved.path);
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export character", exact: true })
    .click();
  const zipPath = testInfo.outputPath("corrected-coral.character.zip");
  await (await exported).saveAs(zipPath);
  const files = unzipSync(await readFile(zipPath));
  expect(JSON.parse(strFromU8(files["character.json"]))).toEqual(saved.config);
  expect(strFromU8(files["PROVENANCE.txt"])).toContain(
    "Motion version 3 corrects arm material ownership",
  );
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest.generator).toBe("gathria-polished-pixels-v6-motion-v3");
  await page.close();
  const player = await context.newPage();
  const forbidden: string[] = [];
  await player.route(
    /\/src\/(?:editor\/|core\/(?:generator|(?:cohesive|polished|running|illustrated)-))/,
    async (route) => {
      forbidden.push(route.request().url());
      await route.abort();
    },
  );
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles(zipPath);
  await expect(player.getByRole("status")).toContainText("Loaded:");
  await player.getByRole("button", { name: "Run", exact: true }).click();
  await expect(player.locator(".player-timing")).toHaveText("18 FPS · LOOP");
  const observed = await player.getByTestId("consumer-canvas").evaluate(
    (element) =>
      new Promise<number[]>((resolve) => {
        const ids = new Set<number>();
        const start = performance.now();
        function sample() {
          const id = Number(
            element.getAttribute("aria-label")?.match(/frame (\d+)$/)?.[1],
          );
          if (Number.isFinite(id)) ids.add(id);
          if (performance.now() - start < 1500) requestAnimationFrame(sample);
          else resolve([...ids].sort((a, b) => a - b));
        }
        sample();
      }),
  );
  expect(observed).toEqual(manifest.animations.run.frames);
  expect(forbidden).toEqual([]);
});
