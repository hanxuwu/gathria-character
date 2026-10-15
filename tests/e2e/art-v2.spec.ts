import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

async function waitForDraw(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("V1 saved work retains its exact artwork until an explicit V2 copy is made", async ({
  page,
}, testInfo) => {
  const legacyPath = new URL(
    "../../public/samples/mira/character.json",
    import.meta.url,
  ).pathname;
  const legacyConfig = JSON.parse(await readFile(legacyPath, "utf8"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByLabel("Pixel zoom", { exact: true }).selectOption("2");
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(legacyPath);
  await expect(
    page.getByText("Art V1 · original", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Face shape", { exact: true })).toHaveCount(0);
  const preview = page
    .getByRole("region", { name: "Animation preview" })
    .locator("canvas");
  await waitForDraw(page);
  const v1Pixels = await preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  const originalPixels = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(
      await (await fetch("/samples/mira/spritesheet.png")).blob(),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 128;
    const context = canvas.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0, 48, 64, 0, 0, 96, 128);
    bitmap.close();
    return canvas.toDataURL();
  });
  expect(v1Pixels).toBe(originalPixels);

  const v1Download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const original = await v1Download;
  const originalPath = testInfo.outputPath("original.character.json");
  await original.saveAs(originalPath);
  expect(JSON.parse(await readFile(originalPath, "utf8"))).toEqual(
    legacyConfig,
  );

  await page
    .getByRole("button", { name: "Create Art V2 copy", exact: true })
    .click();
  await expect(
    page.getByText("Art V1 · original", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Face shape", { exact: true }).selectOption("round");
  await waitForDraw(page);
  const v2Pixels = await preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  expect(v2Pixels).not.toBe(v1Pixels);
  const v2Download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const copy = await v2Download;
  const copyPath = testInfo.outputPath("copy.character.json");
  await copy.saveAs(copyPath);
  expect(JSON.parse(await readFile(copyPath, "utf8"))).toMatchObject({
    ...legacyConfig,
    schemaVersion: 2,
    artworkVersion: 2,
    faceVariant: "round",
  });
  await page.getByRole("button", { name: "Jun preset", exact: true }).click();
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(copyPath);
  await waitForDraw(page);
  expect(
    await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(v2Pixels);
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(originalPath);
  await waitForDraw(page);
  expect(
    await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(originalPixels);
});

for (const outfit of [
  { label: "Wedding suit", upper: "suit", lower: "trousers" },
  { label: "Wedding dress", upper: "bodice", lower: "dress" },
]) {
  test(`${outfit.label} exports actual V2 pixels and plays independently in both directions`, async ({
    page,
    context,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page
      .getByRole("button", { name: "Rowan preset", exact: true })
      .click();
    await page.getByLabel("Face shape", { exact: true }).selectOption("heart");
    await page.getByRole("button", { name: outfit.label, exact: true }).click();
    await expect(
      page.getByLabel("Upper clothing", { exact: true }),
    ).toHaveValue(outfit.upper);
    await expect(
      page.getByLabel("Lower clothing", { exact: true }),
    ).toHaveValue(outfit.lower);
    // Outfit starting points do not replace the user's selected identity.
    await expect(
      page.getByLabel("Character name", { exact: true }),
    ).toHaveValue("Rowan");
    await expect(page.getByLabel("Face shape", { exact: true })).toHaveValue(
      "heart",
    );
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export character", exact: true })
      .click();
    const saved = await download;
    const zipPath = testInfo.outputPath(saved.suggestedFilename());
    await saved.saveAs(zipPath);
    const files = unzipSync(new Uint8Array(await readFile(zipPath)));
    const config = JSON.parse(Buffer.from(files["character.json"]).toString());
    const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
    expect(config).toMatchObject({
      schemaVersion: 2,
      artworkVersion: 2,
      faceVariant: "heart",
      upperClothing: outfit.upper,
      lowerClothing: outfit.lower,
    });
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      generator: "gathria-warm-pixels-v2",
      anchor: { x: 24, y: 60 },
    });

    const player = await context.newPage();
    player.on("pageerror", (error) => errors.push(error.message));
    const forbidden: string[] = [];
    await player.route(/\/(?:src\/editor\/|src\/core\/generator)/, (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    });
    await player.goto("/player.html");
    await player.locator("#player-zip").setInputFiles(zipPath);
    await expect(player.getByRole("status")).toContainText("Loaded: Rowan");
    await expect(
      player.getByText("gathria-warm-pixels-v2", { exact: true }),
    ).toBeVisible();
    await player
      .getByRole("button", { name: "Pause animation", exact: true })
      .click();
    const canvas = player.getByTestId("consumer-canvas");
    for (const motion of ["Idle", "Walk"]) {
      await player.getByRole("button", { name: motion, exact: true }).click();
      await player.getByRole("button", { name: "Right", exact: true }).click();
      await waitForDraw(player);
      const right = await canvas.evaluate((element: HTMLCanvasElement) =>
        element.toDataURL(),
      );
      await player.getByRole("button", { name: "Left", exact: true }).click();
      await waitForDraw(player);
      const left = await canvas.evaluate((element: HTMLCanvasElement) =>
        element.toDataURL(),
      );
      expect(left).not.toBe(right);
      await expect(canvas).toHaveAttribute(
        "aria-label",
        new RegExp(`Rowan, ${motion.toLowerCase()}, facing left`),
      );
      await player
        .getByRole("button", { name: "Play animation", exact: true })
        .click();
      await expect
        .poll(() =>
          canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
        )
        .not.toBe(left);
      await player
        .getByRole("button", { name: "Pause animation", exact: true })
        .click();
    }
    // Reuse the same consumer with an untouched MVP export; playback must not
    // depend on the current generator or require a V1 package migration.
    await player
      .locator("#player-zip")
      .setInputFiles(
        new URL("../../public/samples/jun.character.zip", import.meta.url)
          .pathname,
      );
    await expect(player.getByRole("status")).toContainText("Loaded: Jun");
    await expect(
      player.getByText("gathria-original-pixels-v1", { exact: true }),
    ).toBeVisible();
    await player.getByRole("button", { name: "Walk", exact: true }).click();
    await waitForDraw(player);
    const legacyFrame = await canvas.evaluate((element: HTMLCanvasElement) =>
      element.toDataURL(),
    );
    await expect
      .poll(() =>
        canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
      )
      .not.toBe(legacyFrame);
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
  });
}
