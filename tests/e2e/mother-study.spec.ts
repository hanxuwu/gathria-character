import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

async function paint(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function pixels(page: Page) {
  await paint(page);
  return page
    .locator("#mother-study-canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

test("four static candidate poses, mirrors and overlays are separate from ordinary Studio", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/skin-studio.html");
  await expect(
    page.getByRole("button", { name: "Open base model", exact: true }),
  ).toBeVisible();
  await paint(page);
  const original = await page
    .locator("#skin-posed-canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page
    .getByRole("link", { name: "Review reference mother candidate" })
    .click();
  await expect(
    page.getByRole("button", { name: "Standing", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("These are still poses, not completed animation cycles.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Zoom", { exact: true }).selectOption("1");
  const appearances = new Set<string>();
  for (const label of ["Standing", "Walk contact", "Run flight", "Celebrate"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByLabel("Facing", { exact: true }).selectOption("right");
    const right = await pixels(page);
    appearances.add(right);
    await page.getByLabel("Facing", { exact: true }).selectOption("left");
    await paint(page);
    const matches = await page
      .locator("#mother-study-canvas")
      .evaluate(async (canvas: HTMLCanvasElement, right) => {
        const image = new Image();
        image.src = right;
        await image.decode();
        const target = document.createElement("canvas");
        target.width = 192;
        target.height = 256;
        const ctx = target.getContext("2d")!;
        ctx.translate(192, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, 0);
        return target.toDataURL() === canvas.toDataURL();
      }, right);
    expect(matches).toBe(true);
  }
  expect(appearances.size).toBe(4);
  const plain = await pixels(page);
  await page.getByLabel("Bones", { exact: true }).check();
  expect(await pixels(page)).not.toBe(plain);
  await page.getByLabel("Bones", { exact: true }).uncheck();
  expect(await pixels(page)).toBe(plain);
  await page.getByLabel("Zoom", { exact: true }).selectOption("4");
  await expect(page.locator("#mother-study-canvas")).toHaveAttribute(
    "width",
    "768",
  );
  await page
    .getByRole("link", { name: "← Skin & skeleton studio", exact: true })
    .click();
  await paint(page);
  expect(
    await page
      .locator("#skin-posed-canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(original);
  expect(errors).toEqual([]);
});

test("pose PNGs and separate archive decode; independent player loads three honest static holds", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/mother-study.html");
  await expect(
    page.getByRole("button", { name: "Standing", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Celebrate", exact: true }).click();
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  await page.getByLabel("Bones", { exact: true }).check();
  await page.getByLabel("Background", { exact: true }).selectOption("dark");
  async function download(label: string, filename: string) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const path = testInfo.outputPath(filename);
    await (await event).saveAs(path);
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toBeEnabled();
    return { path, bytes: await readFile(path) };
  }
  const current = await download(
    "Download current pose PNG",
    "celebrate-left.png",
  );
  const sheet = await download("Download four-pose PNG sheet", "four-left.png");
  for (const [file, expectedWidth] of [
    [current, 192],
    [sheet, 768],
  ] as const) {
    const decoded = await page.evaluate(
      async (bytes) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0,
          transparent = 0;
        for (let n = 3; n < rgba.length; n += 4) {
          if (rgba[n]) visible++;
          else transparent++;
        }
        return {
          width: image.width,
          height: image.height,
          visible,
          transparent,
        };
      },
      [...file.bytes],
    );
    expect(decoded.width).toBe(expectedWidth);
    expect(decoded.height).toBe(256);
    expect(decoded.visible).toBeGreaterThan(1000);
    expect(decoded.transparent).toBeGreaterThan(1000);
  }
  // Preview overlays and background never enter the transparent PNG download.
  await page.getByLabel("Zoom", { exact: true }).selectOption("1");
  await page.getByLabel("Bones", { exact: true }).uncheck();
  const actual = await pixels(page);
  expect(
    await page.evaluate(
      async (bytes) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = 192;
        canvas.height = 256;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
        return canvas.toDataURL();
      },
      [...current.bytes],
    ),
  ).toBe(actual);
  const archive = await download(
    "Download pose-study archive",
    "candidate.pose-study.zip",
  );
  const files = unzipSync(archive.bytes);
  expect(Object.keys(files).sort()).toEqual([
    "README.txt",
    "layer-registration.json",
    "poses.json",
    "project.rig.zip",
    "study.json",
  ]);
  expect(JSON.parse(strFromU8(files["study.json"])).format).toBe(
    "gathria-pose-study-archive",
  );
  expect(JSON.parse(strFromU8(files["poses.json"])).poses).toHaveLength(4);
  expect(Object.keys(unzipSync(files["project.rig.zip"]))).toContain(
    "project.json",
  );
  expect(() =>
    JSON.parse(strFromU8(files["layer-registration.json"])),
  ).not.toThrow();
  const pack = await download(
    "Download static-hold CharacterPack",
    "candidate.character.zip",
  );
  const contents = unzipSync(pack.bytes);
  expect(Object.keys(contents).sort()).toEqual([
    "INTEGRATION.md",
    "PROVENANCE.txt",
    "character.json",
    "manifest.json",
    "spritesheet.png",
  ]);
  const manifest = JSON.parse(strFromU8(contents["manifest.json"]));
  expect(manifest.animations).toEqual({
    idle: { frames: [0], fps: 1, loop: false },
    walk: { frames: [1], fps: 1, loop: false },
    run: { frames: [2], fps: 1, loop: false },
  });
  expect(strFromU8(contents["PROVENANCE.txt"])).toContain("NOT completed");
  await page.close();
  const player = await context.newPage();
  await player.goto("/player.html");
  await player
    .getByLabel("Choose character pack", { exact: true })
    .setInputFiles(pack.path);
  await expect(
    player.getByText("Reference mother — static pose holds", { exact: true }),
  ).toBeVisible();
  const displayed = new Set<string>();
  for (const action of ["Idle", "Walk", "Run"]) {
    await player.getByRole("button", { name: action, exact: true }).click();
    await expect(player.getByTestId("consumer-canvas")).toHaveAttribute(
      "aria-label",
      new RegExp(`, ${action.toLowerCase()},`),
    );
    await paint(player);
    displayed.add(
      await player
        .getByTestId("consumer-canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    );
  }
  expect(displayed.size).toBe(3);
  await expect(
    player.getByRole("button", { name: "Jump", exact: true }),
  ).toBeDisabled();
});

test("a failed candidate load is explicit and retryable, with exports disabled", async ({
  page,
}) => {
  await page.route(
    "**/artwork/reference-mother/prepared/project.rig.zip",
    (route) => route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/mother-study.html");
  await expect(page.getByRole("alert")).toContainText(
    "Candidate project could not be loaded",
  );
  await expect(
    page.getByRole("button", {
      name: "Download current pose PNG",
      exact: true,
    }),
  ).toBeDisabled();
  await page.unroute("**/artwork/reference-mother/prepared/project.rig.zip");
  await page
    .getByRole("button", { name: "Retry loading candidate", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Standing", exact: true }),
  ).toBeEnabled();
});
