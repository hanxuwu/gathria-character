import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";

const v6Config = new URL(
  "../../docs/art-polished/suit-gentle/character.json",
  import.meta.url,
).pathname;
const v7Config = new URL(
  "../../docs/art-harmonized/dress-joyful/character.json",
  import.meta.url,
).pathname;
const originalRunConfig = new URL(
  "../../docs/running/suit-joyful/character.json",
  import.meta.url,
).pathname;

async function waitForDraw(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

function preview(page: Page) {
  return page
    .getByRole("region", { name: "Animation preview" })
    .locator("canvas");
}

test("running settings survive customization, save/reopen and an independently loaded export", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/editor.html");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("button", { name: "Face left", exact: true }).click();
  await page.getByLabel("Character name", { exact: true }).fill("Running Mira");
  await page
    .getByRole("button", { name: "Wedding dress", exact: true })
    .click();
  await page.getByLabel("Hairstyle", { exact: true }).selectOption("waves");
  await page.getByLabel("Expression", { exact: true }).selectOption("joyful");
  await page.getByLabel("Custom hair color", { exact: true }).fill("#755879");
  await page
    .getByRole("button", { name: "Skin tone #805039", exact: true })
    .click();
  await page.getByLabel("Pixel zoom", { exact: true }).selectOption("1");
  await waitForDraw(page);
  await expect(preview(page)).toHaveAttribute(
    "aria-label",
    "Running Mira, run, facing left",
  );
  const left = await preview(page).evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  await expect(
    page.getByText("In-place preview · no travel", { exact: true }),
  ).toBeVisible();

  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const configPath = testInfo.outputPath("running.character.json");
  await (await saved).saveAs(configPath);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  expect(config).toMatchObject({
    artworkVersion: 6,
    motionVersion: 3,
    preview: { animation: "run", facing: "left" },
    hairstyle: "waves",
    expression: "joyful",
    upperClothing: "bodice",
    lowerClothing: "dress",
    hairColor: "#755879",
    skinTone: "#805039",
  });
  await page.getByRole("button", { name: "Rowan preset", exact: true }).click();
  await expect(preview(page)).toHaveAttribute(
    "aria-label",
    "Rowan, idle, facing right",
  );
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(configPath);
  await expect(preview(page)).toHaveAttribute(
    "aria-label",
    "Running Mira, run, facing left",
  );
  await waitForDraw(page);
  expect(
    await preview(page).evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    ),
  ).toBe(left);

  // All action switches begin at their first timing step, including while paused.
  for (const motion of ["Idle", "Walk", "Run"]) {
    await page.getByRole("button", { name: motion, exact: true }).click();
    await waitForDraw(page);
    await expect(page.getByLabel(/Timing step 1 of /)).toBeVisible();
    await expect(preview(page)).toHaveAttribute(
      "aria-label",
      `Running Mira, ${motion.toLowerCase()}, facing left`,
    );
  }

  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export character", exact: true })
    .click();
  const zipPath = testInfo.outputPath("running.character.zip");
  await (await exported).saveAs(zipPath);
  const files = unzipSync(new Uint8Array(await readFile(zipPath)));
  expect(JSON.parse(Buffer.from(files["character.json"]).toString())).toEqual(
    config,
  );
  const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
  expect(manifest.generator).toBe("gathria-polished-pixels-v6-motion-v3");
  expect(manifest.animations.run).toEqual({
    frames: Array.from({ length: 12 }, (_, index) => index + 12),
    fps: 18,
    loop: true,
  });
  expect(manifest.spritesheet).toMatchObject({
    width: 1536,
    height: 1024,
    frameWidth: 192,
    frameHeight: 256,
  });

  // Close the Studio, then load only exported files in a fresh consumer page.
  await page.close();
  const player = await context.newPage();
  player.on("pageerror", (error) => errors.push(error.message));
  const forbidden: string[] = [];
  await player.route(
    /\/src\/(?:editor\/|core\/(?:generator|running-|polished-|cohesive-|harmonized-|illustrated-|expressive-))/,
    (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    },
  );
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles(zipPath);
  await expect(player.getByRole("status")).toContainText(
    "Loaded: Running Mira",
  );
  await player
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await player.getByRole("button", { name: "Run", exact: true }).click();
  const canvas = player.getByTestId("consumer-canvas");
  for (const facing of ["Left", "Right"]) {
    await player.getByRole("button", { name: facing, exact: true }).click();
    await waitForDraw(player);
    await expect(canvas).toHaveAttribute(
      "aria-label",
      new RegExp(
        `^Running Mira, run, facing ${facing.toLowerCase()}, frame (1[2-9]|2[0-3])$`,
      ),
    );
    const paused = await canvas.evaluate((element: HTMLCanvasElement) =>
      element.toDataURL(),
    );
    await player
      .getByRole("button", { name: "Play animation", exact: true })
      .click();
    await expect
      .poll(() =>
        canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()),
      )
      .not.toBe(paused);
    await player
      .getByRole("button", { name: "Pause animation", exact: true })
      .click();
  }
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

test("historical V6 has no running until explicitly enabled and keeps its original idle pixels", async ({
  page,
}, testInfo) => {
  await page.goto("/editor.html");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(v6Config);
  await page.getByLabel("Pixel zoom", { exact: true }).selectOption("1");
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await expect(preview(page)).toHaveAttribute(
    "aria-label",
    /, idle, facing right$/,
  );
  await waitForDraw(page);
  const idle = await preview(page).evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const oldPath = testInfo.outputPath("old-v6.json");
  await (await download).saveAs(oldPath);
  expect(JSON.parse(await readFile(oldPath, "utf8"))).toEqual(
    JSON.parse(await readFile(v6Config, "utf8")),
  );
  await page.getByRole("button", { name: "Add running", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
  await expect(preview(page)).toHaveAttribute(
    "aria-label",
    /, run, facing right$/,
  );
  await page.getByRole("button", { name: "Idle", exact: true }).click();
  await waitForDraw(page);
  expect(
    await preview(page).evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    ),
  ).toBe(idle);
});

test("V7 remains in its saved style with running explicitly unavailable", async ({
  page,
}) => {
  await page.goto("/editor.html");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(v7Config);
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add running", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Art V7 · detailed", { exact: true }),
  ).toBeVisible();
  await expect(preview(page)).toHaveAttribute(
    "aria-label",
    /, idle, facing right$/,
  );
  await expect(page.locator("#running-availability")).toContainText(
    "Running is unavailable for Art V7",
  );
});

test("saved original running poses and presets stay unchanged until an explicit compact copy", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const source = {
    ...JSON.parse(await readFile(originalRunConfig, "utf8")),
    preview: { animation: "run", facing: "left" },
  };
  const upload = {
    name: "original-running.character.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(source)),
  };
  await page.goto("/editor.html");
  await page
    .getByRole("button", { name: "Pause animation", exact: true })
    .click();
  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(upload);
  await page.getByLabel("Pixel zoom", { exact: true }).selectOption("1");
  await waitForDraw(page);
  await expect(preview(page)).toHaveAttribute(
    "aria-label",
    `${source.name}, run, facing left`,
  );
  const preserved = await preview(page).evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  const originalPixels = await page.evaluate(async () => {
    const folder = "/docs/running/suit-joyful/";
    const bitmap = await createImageBitmap(
      await (await fetch(folder + "spritesheet.png")).blob(),
    );
    const manifest = await (await fetch(folder + "manifest.json")).json();
    const frame = manifest.frames.find(
      (item: { id: number }) => item.id === 12,
    );
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(
      bitmap,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    );
    bitmap.close();
    return canvas.toDataURL();
  });
  expect(preserved).toBe(originalPixels);
  const originalDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const originalPath = testInfo.outputPath("original-run.json");
  await (await originalDownload).saveAs(originalPath);
  expect(JSON.parse(await readFile(originalPath, "utf8"))).toEqual(source);

  // Preset selection inside a historical file must not silently select motion 2.
  await page.getByRole("button", { name: "Rowan preset", exact: true }).click();
  const presetDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const presetPath = testInfo.outputPath("original-run-preset.json");
  await (await presetDownload).saveAs(presetPath);
  expect(JSON.parse(await readFile(presetPath, "utf8"))).toMatchObject({
    name: "Rowan",
    artworkVersion: 6,
    motionVersion: 1,
    preview: { animation: "idle", facing: "right" },
  });

  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(upload);
  await page
    .getByRole("button", { name: "Create compact running copy", exact: true })
    .click();
  await waitForDraw(page);
  await expect(preview(page)).toHaveAttribute(
    "aria-label",
    `${source.name}, run, facing left`,
  );
  expect(
    await preview(page).evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    ),
  ).not.toBe(preserved);
  await expect(
    page.getByRole("button", {
      name: "Create compact running copy",
      exact: true,
    }),
  ).toHaveCount(0);
  const copyDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save config", exact: true }).click();
  const copyPath = testInfo.outputPath("compact-run.json");
  await (await copyDownload).saveAs(copyPath);
  expect(JSON.parse(await readFile(copyPath, "utf8"))).toEqual({
    ...source,
    motionVersion: 2,
  });

  await page
    .getByLabel("Open character configuration", { exact: true })
    .setInputFiles(originalPath);
  await waitForDraw(page);
  expect(
    await preview(page).evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    ),
  ).toBe(preserved);
});
