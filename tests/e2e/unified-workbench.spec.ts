import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";

const evidence = "/tmp/unified-workbench/browser";
const activeSide = (page: Page) =>
  page.locator('[data-testid="side-session"][data-active="true"]');
const stage = (page: Page) => activeSide(page).getByTestId("side-stage");
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const pixels = (canvas: Locator) =>
  canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

async function ready(page: Page) {
  await expect(activeSide(page).getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await expect(stage(page)).toBeVisible();
  await expect(activeSide(page).getByRole("alert")).toHaveCount(0);
}

async function pause(page: Page) {
  if ((await stage(page).getAttribute("data-paused")) === "false")
    await activeSide(page).getByTestId("side-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
}

async function seek(page: Page, action: string, index: number) {
  await pause(page);
  await activeSide(page).getByTestId(`side-action-${action}`).click();
  await expect(stage(page)).toHaveAttribute("data-action", action);
  // Trigger input even if the slider initially shows the desired value.
  await activeSide(page)
    .getByTestId("side-frame")
    .fill(index === 0 ? "1" : "0");
  await activeSide(page).getByTestId("side-frame").fill(String(index));
  await expect(stage(page)).toHaveAttribute(
    "data-frame-position",
    String(index),
  );
}

async function download(page: Page, control: Locator, name?: string) {
  const pending = page.waitForEvent("download", { timeout: 180_000 });
  await control.click();
  const result = await pending;
  expect(await result.failure()).toBeNull();
  const path = name ? `${evidence}/${name}` : (await result.path())!;
  if (name) await result.saveAs(path);
  const bytes = await readFile(path);
  return { path, bytes, filename: result.suggestedFilename() };
}

async function exportSide(page: Page, kind: string, name?: string) {
  const output = await download(
    page,
    activeSide(page).getByTestId(`side-${kind}`),
    name,
  );
  await ready(page);
  return output;
}

test("a shared side pose and unsaved fitting review survive source and advanced-tool switches", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Another source failing must not destroy the already opened side session.
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({ status: 503, body: "Controlled original-source failure" }),
  );
  await page.goto(
    "/workbench.html?character=male&mode=side-view&collection=tailored",
  );
  await ready(page);
  await expect(page.getByTestId("workbench-source")).toHaveValue("side-view");
  await seek(page, "run", 4);
  await activeSide(page).getByTestId("side-facing-left").click();
  await activeSide(page).getByTestId("side-bottom").selectOption("");
  await ready(page);
  await activeSide(page).getByTestId("side-fitting-toggle").click();
  await expect(activeSide(page).getByTestId("side-fitting")).toBeVisible();
  await activeSide(page).getByTestId("fitting-guides").uncheck();
  await activeSide(page).getByTestId("fitting-position").fill("5");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "5");
  await expect(activeSide(page).getByTestId("fitting-frame")).toContainText(
    "姿势 44",
  );
  await activeSide(page).getByTestId("side-frame").fill("4");
  await expect(activeSide(page).getByTestId("fitting-position")).toHaveValue(
    "4",
  );
  await activeSide(page).getByTestId("fitting-zoom").selectOption("2");
  await activeSide(page).getByTestId("fitting-neighbors-toggle").click();
  const before = await exportSide(
    page,
    "export-png",
    "male-run-left-before.png",
  );
  expect(before.filename).toContain("run-left-43.png");
  const fittingPixels = await pixels(
    activeSide(page).getByTestId("fitting-current"),
  );
  const retained = page.locator(
    '[data-testid="side-session"][data-session-key="male:tailored"]',
  );
  await page.getByTestId("workbench-source").selectOption("original");
  await expect(retained).toBeHidden();
  await expect(retained).toHaveAttribute("data-active", "false");
  const inactivePixels = await pixels(retained.getByTestId("side-stage"));
  await page.getByRole("tab", { name: "Male skeleton", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  // Observe a longer interval than several 24 FPS frames while inactive.
  await page.waitForTimeout(250);
  expect(await pixels(retained.getByTestId("side-stage"))).toBe(inactivePixels);
  await expect(retained.getByTestId("side-stage")).toHaveAttribute(
    "data-frame-position",
    "4",
  );
  await page.getByTestId("workbench-source").selectOption("side-view");
  await ready(page);
  await expect(activeSide(page).getByTestId("side-bottom")).toHaveValue("");
  await expect(stage(page)).toHaveAttribute("data-facing", "left");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "4");
  await expect(activeSide(page).getByTestId("fitting-zoom")).toHaveValue("2");
  await expect(activeSide(page).getByTestId("fitting-neighbors")).toBeVisible();
  expect(await pixels(activeSide(page).getByTestId("fitting-current"))).toBe(
    fittingPixels,
  );
  const after = await exportSide(page, "export-png", "male-run-left-after.png");
  expect(after.bytes).toEqual(before.bytes);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: `${evidence}/side-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: `${evidence}/side-retained-review.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("four side contexts retain their own source-bound wardrobe and motion state", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await mkdir(evidence, { recursive: true });
  await page.goto(
    "/workbench.html?character=male&mode=side-view&collection=tailored",
  );
  await ready(page);
  await seek(page, "run", 4);
  await activeSide(page).getByTestId("side-facing-left").click();
  await activeSide(page).getByTestId("side-bottom").selectOption("");
  await ready(page);
  const tailored = await exportSide(page, "export-png");
  const tailoredProject = await exportSide(page, "save-project");
  await activeSide(page)
    .getByTestId("side-collection")
    .selectOption("material");
  await ready(page);
  await seek(page, "walk", 6);
  await activeSide(page).getByTestId("side-look-daily").click();
  await ready(page);
  const material = await exportSide(page, "export-png");
  const materialProject = await exportSide(page, "save-project");
  const tailoredDocument = JSON.parse(
    Buffer.from(unzipSync(tailoredProject.bytes)["document.json"]).toString(),
  );
  const materialDocument = JSON.parse(
    Buffer.from(unzipSync(materialProject.bytes)["document.json"]).toString(),
  );
  expect(tailoredDocument.sourceSha256).toBe(materialDocument.sourceSha256);
  expect(tailoredDocument.registrationSha256).not.toBe(
    materialDocument.registrationSha256,
  );
  await activeSide(page).getByTestId("side-character").selectOption("female");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-character", "female");
  await expect(activeSide(page).getByTestId("side-collection")).toHaveValue(
    "material",
  );
  await seek(page, "jump", 7);
  await activeSide(page)
    .getByTestId("side-collection")
    .selectOption("tailored");
  await ready(page);
  await seek(page, "run", 3);
  const femaleTailored = await exportSide(page, "export-png");
  await activeSide(page).getByTestId("side-character").selectOption("male");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-action", "run");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "4");
  await expect(stage(page)).toHaveAttribute("data-facing", "left");
  await expect(activeSide(page).getByTestId("side-bottom")).toHaveValue("");
  expect((await exportSide(page, "export-png")).bytes).toEqual(tailored.bytes);
  await activeSide(page)
    .getByTestId("side-collection")
    .selectOption("material");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-action", "walk");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "6");
  await expect(activeSide(page).getByTestId("side-look-daily")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect((await exportSide(page, "export-png")).bytes).toEqual(material.bytes);
  await activeSide(page).getByTestId("side-character").selectOption("female");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-action", "jump");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "7");
  await activeSide(page)
    .getByTestId("side-collection")
    .selectOption("tailored");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-action", "run");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "3");
  expect((await exportSide(page, "export-png")).bytes).toEqual(
    femaleTailored.bytes,
  );
  await expect(page.locator('[data-testid="side-session"]')).toHaveCount(4);
  await expect(
    page.locator('[data-testid="side-session"][data-active="true"]'),
  ).toHaveCount(1);
  await expect(page).toHaveURL(/character=female/);
  await expect(page).toHaveURL(/collection=tailored/);
});

test("unified workbench exports unchanged GIF and CharacterPack with independent playback", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  await mkdir(evidence, { recursive: true });
  await page.goto(
    "/workbench.html?character=female&mode=side-view&collection=tailored",
  );
  await ready(page);
  await seek(page, "run", 4);
  const before = await exportSide(
    page,
    "export-png",
    "female-run-right-before.png",
  );
  const gifBefore = await exportSide(
    page,
    "export-gif",
    "female-run-right-before.gif",
  );
  const packBefore = await exportSide(
    page,
    "export-pack",
    "female-before.character.zip",
  );
  await page.getByTestId("workbench-source").selectOption("original");
  await page.getByTestId("workbench-source").selectOption("side-view");
  await ready(page);
  const after = await exportSide(
    page,
    "export-png",
    "female-run-right-after.png",
  );
  const gifAfter = await exportSide(
    page,
    "export-gif",
    "female-run-right-after.gif",
  );
  const packAfter = await exportSide(
    page,
    "export-pack",
    "female-after.character.zip",
  );
  expect(after.bytes).toEqual(before.bytes);
  expect(gifAfter.bytes).toEqual(gifBefore.bytes);
  // ZIP timestamps are incidental; compare every decompressed member exactly.
  const beforeFiles = unzipSync(packBefore.bytes),
    afterFiles = unzipSync(packAfter.bytes);
  expect(Object.keys(afterFiles).sort()).toEqual(
    Object.keys(beforeFiles).sort(),
  );
  for (const key of Object.keys(beforeFiles))
    expect(sha(afterFiles[key])).toBe(sha(beforeFiles[key]));
  const archive = readPortableCharacterPackArchive(packAfter.bytes);
  const manifest = archive.manifest;
  expect(manifest.schemaVersion).toBe(3);
  expect(manifest.frames).toHaveLength(102);
  expect(Object.keys(manifest.animations).sort()).toEqual([
    "idle",
    "jump",
    "run",
    "walk",
  ]);
  expect(manifest.animations.jump?.loop).toBe(false);
  expect(manifest.animations.jump?.frames).toHaveLength(50);
  const run = manifest.animations.run!;
  expect(run.fps).toBe(24);
  const parsed = parseGIF(new Uint8Array(gifAfter.bytes).buffer);
  const gifFrames = decompressFrames(parsed, true);
  expect([parsed.lsd.width, parsed.lsd.height]).toEqual([256, 384]);
  expect(gifFrames).toHaveLength(run.frames.length);
  expect(gifFrames.map((frame) => frame.delay)).toEqual(
    run.frames.map(
      (_, i) =>
        (Math.round(((i + 1) * 100) / run.fps) -
          Math.round((i * 100) / run.fps)) *
        10,
    ),
  );
  expect(gifAfter.bytes.includes(Buffer.from("NETSCAPE2.0"))).toBe(true);
  const png = decodeSourceRgbaPng(after.bytes);
  expect([png.width, png.height]).toEqual([512, 768]);
  const alpha = png.pixels.filter((_, index) => index % 4 === 3);
  expect(alpha.some((value) => value === 0)).toBe(true);
  expect(alpha.some((value) => value === 255)).toBe(true);
  for (const [name, bytes] of Object.entries(afterFiles))
    if (name.endsWith(".png")) {
      const sheet = decodeSourceRgbaPng(bytes);
      expect(sheet.pixels.length).toBe(sheet.width * sheet.height * 4);
    }
  await page.close();
  const independent = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const forbidden: string[] = [];
  independent.on("request", (request) => {
    if (
      /\/src\/(?:side-view|wardrobe|skeletal)\/|\/workbench\.html/.test(
        request.url(),
      )
    )
      forbidden.push(request.url());
  });
  const player = await independent.newPage();
  try {
    await player.goto("http://127.0.0.1:5175/player.html");
    await player.locator("#player-zip").setInputFiles(packAfter.path);
    await expect(player.locator(".player-status")).toHaveText(
      `Loaded: ${manifest.name}`,
      { timeout: 180_000 },
    );
    await player.getByRole("button", { name: "Run", exact: true }).click();
    const canvas = player.getByTestId("consumer-canvas");
    await expect(canvas).toHaveAttribute("data-action", "run");
    await expect(player.locator(".player-timing")).toHaveText("24 FPS · LOOP");
    const first = await canvas.getAttribute("data-frame-position");
    await expect
      .poll(() => canvas.getAttribute("data-frame-position"))
      .not.toBe(first);
    await player.getByRole("button", { name: "Left", exact: true }).click();
    await expect(
      player.getByRole("button", { name: "Left", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await player.screenshot({
      path: `${evidence}/female-independent-player.png`,
      fullPage: true,
    });
    const reexport = await download(
      player,
      player.getByRole("button", {
        name: "Export selected CharacterPack",
        exact: true,
      }),
    );
    expect(reexport.bytes).toEqual(packAfter.bytes);
    expect(forbidden).toEqual([]);
    await writeFile(
      `${evidence}/export-proof.json`,
      JSON.stringify(
        {
          character: "female",
          source: "Application UI downloads",
          pngSha256: sha(after.bytes),
          gifSha256: sha(gifAfter.bytes),
          pngExactAcrossSwitch: true,
          gifExactAcrossSwitch: true,
          characterPackMembersExactAcrossSwitch: true,
          decodedFrames: manifest.frames.length,
          gifDelaysMs: gifFrames.map((frame) => frame.delay),
          workbenchClosed: page.isClosed(),
          independentContext: true,
          independentByteExactReexport: true,
          forbiddenRequests: forbidden,
        },
        null,
        2,
      ),
    );
  } finally {
    await independent.close();
  }
});

test("suspending a side session releases its modal and preserves the exact uncommitted mask draft", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await mkdir(evidence, { recursive: true });
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      body: "Original unavailable during draft suspension test",
    }),
  );
  await page.goto(
    "/workbench.html?character=male&mode=side-view&collection=tailored",
  );
  await ready(page);
  await seek(page, "run", 4);
  await activeSide(page).getByTestId("side-fitting-toggle").click();
  await activeSide(page).getByTestId("fitting-guides").uncheck();
  const before = await exportSide(page, "export-png");
  const coordinate = await activeSide(page)
    .getByTestId("fitting-cloth")
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      for (
        let y = Math.floor(canvas.height * 0.58);
        y < canvas.height * 0.7;
        y++
      )
        for (
          let x = Math.floor(canvas.width * 0.45);
          x < canvas.width * 0.6;
          x++
        ) {
          let solid = true;
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              if (pixels[((y + dy) * canvas.width + x + dx) * 4 + 3] !== 255)
                solid = false;
          if (solid) return { x, y };
        }
      throw Error("No solid torso clothing sample for the actual mask stroke");
    });
  await activeSide(page).getByTestId("fitting-repair").click();
  const dialog = page.getByRole("dialog", { name: "Clothing mask workbench" });
  await expect(
    dialog.getByRole("button", { name: "Restore source", exact: true }),
  ).toBeEnabled({ timeout: 180_000 });
  await dialog.getByLabel("Brush size", { exact: true }).fill("1");
  await dialog
    .getByLabel("Native X", { exact: true })
    .fill(String(coordinate.x));
  await dialog
    .getByLabel("Native Y", { exact: true })
    .fill(String(coordinate.y));
  await dialog
    .getByRole("button", { name: "Restore source", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Apply brush at coordinates", exact: true })
    .click();
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "5 changed pixels",
  );
  await expect(activeSide(page).getByTestId("side-frame")).toBeDisabled();
  await expect(activeSide(page).getByTestId("side-export-png")).toBeDisabled();
  const originalDraft = await download(
    page,
    dialog.getByRole("button", { name: "Save mask draft", exact: true }),
  );
  const editedPixels = await pixels(dialog.getByTestId("mask-edit-canvas"));
  // Exercise host-driven suspension while a native modal owns the top layer.
  // This intentionally bypasses outside-click blocking, which remains correct
  // for ordinary modal interaction; it is not a simulated user click.
  await page
    .getByTestId("workbench-source")
    .selectOption("original", { force: true });
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Sprite actions", exact: true }),
  ).toBeVisible();
  await page.getByTestId("workbench-source").selectOption("side-view");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "5 changed pixels",
  );
  expect(await pixels(dialog.getByTestId("mask-edit-canvas"))).toBe(
    editedPixels,
  );
  const restoredDraft = await download(
    page,
    dialog.getByRole("button", { name: "Save mask draft", exact: true }),
  );
  expect(restoredDraft.bytes).toEqual(originalDraft.bytes);
  await dialog
    .getByRole("button", { name: "Undo stroke", exact: true })
    .click();
  await expect(dialog.getByTestId("mask-pose-status")).toContainText(
    "0 changed pixels",
  );
  await dialog
    .getByRole("button", { name: "Close mask workbench", exact: true })
    .click();
  expect((await exportSide(page, "export-png")).bytes).toEqual(before.bytes);
});

test("a cross-import updates the visible identity without overwriting its retained slot on later source navigation", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const donor = await context.newPage();
  await donor.goto(
    "/workbench.html?character=female&mode=side-view&collection=tailored",
  );
  await ready(donor);
  await seek(donor, "run", 3);
  await activeSide(donor).getByTestId("side-facing-left").click();
  await activeSide(donor).getByTestId("side-bottom").selectOption("");
  await ready(donor);
  const femalePixels = await exportSide(donor, "export-png");
  const femaleProject = await exportSide(donor, "save-project");
  await donor.close();

  await page.goto(
    "/workbench.html?character=male&mode=side-view&collection=material",
  );
  await ready(page);
  await activeSide(page)
    .getByTestId("side-project-input")
    .setInputFiles(femaleProject.path);
  await ready(page);
  await expect(page).toHaveURL(/character=female/);
  await expect(page).toHaveURL(/collection=tailored/);
  await expect(activeSide(page)).toHaveAttribute(
    "data-session-key",
    "male:material",
  );
  await expect(activeSide(page)).toHaveAttribute("data-character", "female");
  await expect(activeSide(page)).toHaveAttribute("data-collection", "tailored");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("female");
  await seek(page, "run", 3);
  expect((await exportSide(page, "export-png")).bytes).toEqual(
    femalePixels.bytes,
  );

  await activeSide(page).getByTestId("side-character").selectOption("male");
  await ready(page);
  await activeSide(page)
    .getByTestId("side-collection")
    .selectOption("material");
  await ready(page);
  await expect(activeSide(page)).toHaveAttribute("data-character", "male");
  await expect(activeSide(page)).toHaveAttribute("data-collection", "material");
  // male:material is still occupied by the imported female project. A new,
  // unused slot must host the requested male source instead of destroying it.
  await expect(activeSide(page)).not.toHaveAttribute(
    "data-session-key",
    "male:material",
  );
  const imported = page.locator(
    '[data-testid="side-session"][data-session-key="male:material"]',
  );
  await expect(imported).toBeHidden();
  await expect(imported).toHaveAttribute("data-character", "female");
  await expect(imported.getByTestId("side-stage")).toHaveAttribute(
    "data-frame-position",
    "3",
  );
  await activeSide(page)
    .getByTestId("side-collection")
    .selectOption("tailored");
  await ready(page);
  await activeSide(page).getByTestId("side-character").selectOption("female");
  await ready(page);
  await expect(activeSide(page)).toHaveAttribute(
    "data-session-key",
    "male:material",
  );
  await expect(stage(page)).toHaveAttribute("data-frame-position", "3");
  await expect(stage(page)).toHaveAttribute("data-facing", "left");
  await expect(activeSide(page).getByTestId("side-bottom")).toHaveValue("");
  expect((await exportSide(page, "export-png")).bytes).toEqual(
    femalePixels.bytes,
  );
});

test("duplicate imported identities remain individually reachable with their exact unsaved outfits", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto(
    "/workbench.html?character=male&mode=side-view&collection=material",
  );
  await ready(page);
  await seek(page, "run", 4);
  await activeSide(page).getByTestId("side-look-daily").click();
  await ready(page);
  const firstPixels = await exportSide(page, "export-png");
  const firstProject = await exportSide(page, "save-project");
  await activeSide(page).getByTestId("side-character").selectOption("female");
  await ready(page);
  await activeSide(page)
    .getByTestId("side-project-input")
    .setInputFiles(firstProject.path);
  await ready(page);
  await seek(page, "run", 4);
  await activeSide(page).getByTestId("side-bottom").selectOption("");
  await ready(page);
  await activeSide(page).getByTestId("side-facing-left").click();
  const secondPixels = await exportSide(page, "export-png");
  expect(secondPixels.bytes).not.toEqual(firstPixels.bytes);
  await expect(page.getByTestId("side-retained-project")).toHaveValue(
    "female:material",
  );
  await activeSide(page)
    .getByTestId("side-collection")
    .selectOption("tailored");
  await ready(page);
  await activeSide(page)
    .getByTestId("side-collection")
    .selectOption("material");
  await ready(page);
  await expect(activeSide(page)).toHaveAttribute(
    "data-session-key",
    "male:material",
  );
  expect((await exportSide(page, "export-png")).bytes).toEqual(
    firstPixels.bytes,
  );
  await page
    .getByTestId("side-retained-project")
    .selectOption("female:material");
  await ready(page);
  await expect(activeSide(page)).toHaveAttribute("data-character", "male");
  await expect(activeSide(page)).toHaveAttribute(
    "data-session-key",
    "female:material",
  );
  await expect(stage(page)).toHaveAttribute("data-frame-position", "4");
  await expect(stage(page)).toHaveAttribute("data-facing", "left");
  await expect(activeSide(page).getByTestId("side-bottom")).toHaveValue("");
  expect((await exportSide(page, "export-png")).bytes).toEqual(
    secondPixels.bytes,
  );
  await expect(page).toHaveURL(/character=male/);
});
