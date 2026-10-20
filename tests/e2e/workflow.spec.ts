import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";

async function pixels(page: Page, selector: string) {
  return page
    .locator(selector)
    .evaluate((element: HTMLCanvasElement) => element.toDataURL());
}
async function waitForDraw(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("customize → save/reopen → export → independent PNG/metadata playback", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/editor.html");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await waitForDraw(page);
  // Preset thumbnails also render canvases; the prominent preview has an explicit region.
  const preview = page
    .getByRole("region", { name: "Animation preview" })
    .locator("canvas");
  const initial = await preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  await page.getByLabel("Character name", { exact: true }).fill("Aria");
  await page.getByLabel("Hairstyle", { exact: true }).selectOption("mohawk");
  await page
    .getByLabel("Upper clothing", { exact: true })
    .selectOption("jacket");
  await page
    .getByLabel("Lower clothing", { exact: true })
    .selectOption("shorts");
  await page
    .getByRole("button", { name: "Skin tone #805039", exact: true })
    .click();
  await page.getByLabel("Custom hair color", { exact: true }).fill("#755879");
  await page.getByLabel("Custom upper color", { exact: true }).fill("#b76866");
  await waitForDraw(page);
  const customized = await preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  expect(customized).not.toBe(initial);
  await page.getByRole("button", { name: "Walk", exact: true }).click();
  await page.getByRole("button", { name: "Face left", exact: true }).click();
  await expect(preview).toHaveAttribute(
    "aria-label",
    "Aria, walk, facing left",
  );
  const configDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const savedConfig = await configDownload;
  const configPath = testInfo.outputPath(savedConfig.suggestedFilename());
  await savedConfig.saveAs(configPath);
  const character = JSON.parse(await readFile(configPath, "utf8"));
  expect(character).toMatchObject({
    artworkVersion: 6,
    motionVersion: 3,
    preview: { animation: "walk", facing: "left" },
    name: "Aria",
    hairstyle: "mohawk",
    upperClothing: "jacket",
    lowerClothing: "shorts",
    skinTone: "#805039",
    hairColor: "#755879",
    upperColor: "#B76866",
  });
  await page.getByRole("button", { name: "Rowan preset", exact: true }).click();
  await expect(page.getByLabel("Character name", { exact: true })).toHaveValue(
    "Rowan",
  );
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(configPath);
  await expect(page.locator('.notice[role="status"]')).toContainText(
    "Opened Aria",
  );
  await expect(page.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "mohawk",
  );
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await page.getByRole("button", { name: "Face right", exact: true }).click();
  await waitForDraw(page);
  expect(
    await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(customized);
  const packDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export character", exact: true })
    .click();
  const savedPack = await packDownload;
  const packPath = testInfo.outputPath(savedPack.suggestedFilename());
  await savedPack.saveAs(packPath);
  await expect(page.locator('.notice[role="status"]')).toContainText(
    "CharacterPack downloaded",
  );
  const files = unzipSync(new Uint8Array(await readFile(packPath)));
  expect(Object.keys(files).sort()).toEqual([
    "INTEGRATION.md",
    "PROVENANCE.txt",
    "character.json",
    "manifest.json",
    "spritesheet.png",
  ]);
  expect(JSON.parse(Buffer.from(files["character.json"]).toString())).toEqual({
    ...character,
    preview: { animation: "idle", facing: "right" },
  });
  const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
  expect(manifest.spritesheet).toMatchObject({
    width: 1536,
    height: 1024,
    frameWidth: 192,
    frameHeight: 256,
  });
  expect(manifest.animations.walk.frames).toHaveLength(8);
  expect(manifest.animations.run.frames).toHaveLength(12);
  expect(manifest.facing).toEqual({
    native: "right",
    right: "none",
    left: "mirror-x",
  });
  const provenance = Buffer.from(files["PROVENANCE.txt"]).toString();
  expect(provenance).toContain("AI-assisted");
  expect(provenance).not.toContain("or AI generation are used");
  const png = Buffer.from(files["spritesheet.png"]);
  expect(png.readUInt32BE(16)).toBe(1536);
  expect(png.readUInt32BE(20)).toBe(1024);

  // Fresh page: block generator/editor sources to prove consumption uses exported files only.
  const player = await context.newPage();
  player.on("pageerror", (error) => errors.push(error.message));
  const forbidden: string[] = [];
  await player.route(
    /\/(?:src\/editor\/|src\/core\/(?:generator|illustrated-))/,
    (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    },
  );
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles(packPath);
  await expect(player.getByRole("status")).toContainText("Loaded: Aria");
  await player
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await player.getByRole("button", { name: "Walk", exact: true }).click();
  await waitForDraw(player);
  const canvas = player.getByTestId("consumer-canvas");
  const right = await pixels(player, '[data-testid="consumer-canvas"]');
  await player.getByRole("button", { name: "Left", exact: true }).click();
  await waitForDraw(player);
  expect(await pixels(player, '[data-testid="consumer-canvas"]')).not.toBe(
    right,
  );
  await expect(canvas).toHaveAttribute("aria-label", /Aria, walk, facing left/);
  const paused = await pixels(player, '[data-testid="consumer-canvas"]');
  await player.waitForTimeout(250);
  expect(await pixels(player, '[data-testid="consumer-canvas"]')).toBe(paused);
  await player
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect
    .poll(() => pixels(player, '[data-testid="consumer-canvas"]'))
    .not.toBe(paused);
  await player
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await player.getByRole("button", { name: "Idle", exact: true }).click();
  await waitForDraw(player);
  const idle = await pixels(player, '[data-testid="consumer-canvas"]');
  await player
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  await expect
    .poll(() => pixels(player, '[data-testid="consumer-canvas"]'), {
      timeout: 3000,
    })
    .not.toBe(idle);
  await player.getByRole("button", { name: "Right", exact: true }).click();
  await expect(canvas).toHaveAttribute("aria-label", /idle, facing right/);
  // Reopen exactly the exported PNG and manifest through the alternative flow.
  const pngPath = testInfo.outputPath("spritesheet.png");
  const manifestPath = testInfo.outputPath("manifest.json");
  await writeFile(pngPath, files["spritesheet.png"]);
  await writeFile(manifestPath, files["manifest.json"]);
  await player.getByText("Have individual files?", { exact: true }).click();
  await player.locator("#player-png").setInputFiles(pngPath);
  await player.locator("#player-manifest").setInputFiles(manifestPath);
  await player
    .getByRole("button", { name: "Load selected files", exact: true })
    .click();
  await expect(
    player.getByText("Not provided · optional", { exact: true }),
  ).toBeVisible();
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

test("invalid imports and unfinished names give feedback without losing the character", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/editor.html");
  await page.getByLabel("Character name", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("name");
  await page.getByLabel("Character name", { exact: true }).fill("Mira");
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ broken"),
    });
  await expect(page.getByRole("alert")).toContainText("not valid JSON");
  await expect(page.getByLabel("Character name", { exact: true })).toHaveValue(
    "Mira",
  );
  await page.goto("/player.html");
  await page.locator("#player-zip").setInputFiles({
    name: "bad.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not a zip archive"),
  });
  await expect(page.getByRole("alert")).toContainText("Couldn’t load");
  expect(errors).toEqual([]);
});

test("small-screen studio and player keep controls usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editor.html");
  await page.getByRole("button", { name: "Jun preset", exact: true }).click();
  await page.getByLabel("Pixel zoom", { exact: true }).selectOption("6");
  await expect(page.getByLabel("Character name", { exact: true })).toHaveValue(
    "Jun",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.goto("/player.html");
  await expect(page.locator("#player-zip")).toBeAttached();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("bundled exports retain transparency, render at 8×, and reject corrupt PNGs", async ({
  page,
}) => {
  await page.goto("/player.html");
  await page.getByRole("button", { name: /Try Mira’s example pack/ }).click();
  await expect(page.getByRole("status")).toContainText("Loaded: Mira");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.locator("#player-zoom").selectOption("8");
  await waitForDraw(page);
  const bounds = await page
    .getByTestId("consumer-canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("2d")!;
      const top = context.getImageData(0, 0, canvas.width, 1).data;
      const bottom = context.getImageData(
        0,
        canvas.height - 1,
        canvas.width,
        1,
      ).data;
      return {
        height: canvas.height,
        topClear: top.every((value, i) => i % 4 !== 3 || value === 0),
        bottomClear: bottom.every((value, i) => i % 4 !== 3 || value === 0),
      };
    });
  expect(bounds.height).toBeGreaterThanOrEqual(64 * 8);
  expect(bounds.topClear && bounds.bottomClear).toBe(true);
  const transparency = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(
      await (await fetch("/samples/mira/spritesheet.png")).blob(),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0,
      opaque = 0,
      partial = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) clear++;
      else if (pixels[i] === 255) opaque++;
      else partial++;
    }
    return { clear, opaque, partial };
  });
  expect(transparency.clear).toBeGreaterThan(0);
  expect(transparency.opaque).toBeGreaterThan(0);
  expect(transparency.partial).toBe(0);
  await page.getByText("Have individual files?", { exact: true }).click();
  const actualPng = await readFile("public/samples/mira/spritesheet.png");
  await page.locator("#player-png").setInputFiles({
    name: "spritesheet.png",
    mimeType: "image/png",
    buffer: actualPng.subarray(0, 33),
  });
  await page
    .locator("#player-manifest")
    .setInputFiles("public/samples/mira/manifest.json");
  await page
    .getByRole("button", { name: "Load selected files", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(/decode|decoded/i);
  await expect(page.getByRole("status")).toContainText("Loaded: Mira");
});
