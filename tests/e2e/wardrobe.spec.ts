import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { importWardrobeProject } from "../../src/wardrobe/project";
import { readPortableCharacterPackArchive } from "../../src/core/pack";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { installWardrobeFixture } from "./wardrobe-fixture";

test("wardrobe selects registered outfits, retains sessions, and rejects incompatible clothing atomically", async ({
  page,
}) => {
  const fixtures = await installWardrobeFixture(page);
  const wardrobe = page.locator("#wardrobe-panel");
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await expect(
    page.locator('iframe[title="Sprite action workspace"]'),
  ).toHaveCount(0);
  const preview = wardrobe.getByTestId("wardrobe-preview");
  const pixels = () =>
    preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const original = await pixels();
  await wardrobe.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText("Daily selected");
  await expect(wardrobe.getByLabel("Top", { exact: true })).toHaveValue(
    "male-top",
  );
  await expect(wardrobe.getByLabel("Bottom", { exact: true })).toHaveValue(
    "male-bottom",
  );
  expect(await pixels()).not.toBe(original);
  await wardrobe.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText("Wedding selected");
  await expect(wardrobe.getByLabel("Top", { exact: true })).toHaveValue("");
  await expect(
    wardrobe.getByLabel("Dress / one-piece", { exact: true }),
  ).toHaveValue("male-fullBody");
  await wardrobe.getByLabel("Top", { exact: true }).selectOption("male-top");
  await expect(wardrobe.getByRole("status")).toContainText("Outfit updated");
  await expect(
    wardrobe.getByLabel("Dress / one-piece", { exact: true }),
  ).toHaveValue("");
  const accepted = await pixels();
  const wrongCharacter = fixtures.female.items[0].bytes;
  await wardrobe
    .getByLabel("Import registered clothing file", { exact: true })
    .setInputFiles({
      name: "wrong-character.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(wrongCharacter),
    });
  await expect(wardrobe.getByRole("alert")).toContainText(
    "current outfit is unchanged",
  );
  expect(await pixels()).toBe(accepted);
  await wardrobe.getByLabel("Wardrobe character").selectOption("female");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await wardrobe.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText("Wedding selected");
  await wardrobe.getByLabel("Wardrobe character").selectOption("male");
  await expect(wardrobe.getByRole("status")).toContainText(
    "Restored this character",
  );
  await expect(wardrobe.getByLabel("Top", { exact: true })).toHaveValue(
    "male-top",
  );
  expect(await pixels()).toBe(accepted);
  await page.getByRole("tab", { name: "Sprite actions", exact: true }).click();
  await page.getByRole("tab", { name: "Wardrobe", exact: true }).click();
  expect(await pixels()).toBe(accepted);
  await wardrobe.getByRole("button", { name: "Original", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Original outfit selected",
  );
  expect(await pixels()).toBe(original);
});

test("wardrobe saves, reopens, exports every action, and restores the independent character without the workbench", async ({
  page,
  context,
}, testInfo) => {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=female&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await wardrobe.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText("Wedding selected");
  await wardrobe
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("run");
  await wardrobe.getByLabel("Wardrobe facing").selectOption("left");
  await wardrobe.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  const save = page.waitForEvent("download");
  await wardrobe.getByRole("button", { name: /Save wardrobe/ }).click();
  const projectPath = testInfo.outputPath("saved.wardrobe.zip");
  await (await save).saveAs(projectPath);
  const saved = await importWardrobeProject(
    new Uint8Array(await readFile(projectPath)),
  );
  expect(saved.document.preview).toEqual({ action: "run", facing: "left" });
  expect(saved.document.selection.fullBody).toBe("female-fullBody");
  await wardrobe.getByRole("button", { name: "Original", exact: true }).click();
  await expect(wardrobe.getByRole("status")).toContainText(
    "Original outfit selected",
  );
  await wardrobe
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(projectPath);
  await expect(wardrobe.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  await expect(
    wardrobe.getByLabel("Wardrobe action", { exact: true }),
  ).toHaveValue("run");
  await expect(wardrobe.getByLabel("Wardrobe facing")).toHaveValue("left");
  await expect(
    wardrobe.getByLabel("Dress / one-piece", { exact: true }),
  ).toHaveValue("female-fullBody");
  // A saved project contains its source and garments; a missing online catalog
  // must not prevent it from reopening or exporting independently.
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({ status: 503, body: "Clothing library unavailable" }),
  );
  await page.reload();
  await expect(wardrobe.getByRole("alert")).toContainText("503");
  await expect(
    wardrobe.getByRole("button", { name: "Reopen wardrobe", exact: true }),
  ).toBeEnabled();
  await wardrobe
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(projectPath);
  await expect(wardrobe.getByRole("status")).toContainText(
    "Saved outfit and action settings restored",
  );
  await expect(
    wardrobe.getByLabel("Wardrobe character", { exact: true }),
  ).toHaveValue("female");
  await expect(
    wardrobe.getByLabel("Dress / one-piece", { exact: true }),
  ).toHaveValue("female-fullBody");
  const pngDownload = page.waitForEvent("download");
  await wardrobe
    .getByRole("button", { name: "Save current PNG", exact: true })
    .click();
  const pngPath = testInfo.outputPath("left.png");
  await (await pngDownload).saveAs(pngPath);
  const png = decodeSourceRgbaPng(new Uint8Array(await readFile(pngPath)), {
    width: 8,
    height: 8,
  });
  expect([png.width, png.height]).toEqual([8, 8]);
  const exported = page.waitForEvent("download");
  await wardrobe
    .getByRole("button", { name: "Export CharacterPack", exact: true })
    .click();
  const packPath = testInfo.outputPath("wardrobe.character.zip");
  await (await exported).saveAs(packPath);
  const pack = readPortableCharacterPackArchive(
    new Uint8Array(await readFile(packPath)),
  );
  expect(Object.keys(pack.manifest.animations).sort()).toEqual([
    "celebrate",
    "idle",
    "jump",
    "run",
    "walk",
  ]);
  expect(pack.manifest.animations.run).toEqual(
    saved.archive.manifest.animations.run,
  );
  expect(pack.manifest.anchor).toEqual(saved.archive.manifest.anchor);
  await page.close();
  const player = await context.newPage();
  await player.goto("/player.html");
  await player.locator("#player-zip").setInputFiles(packPath);
  await expect(player.getByRole("status")).toContainText("Loaded:");
  await player.getByRole("button", { name: "Run", exact: true }).click();
  await player.getByRole("button", { name: "Left", exact: true }).click();
  await expect(player.getByTestId("consumer-canvas")).toBeVisible();
});

test("corrupt saved projects retain the current outfit and the wardrobe fits a narrow screen", async ({
  page,
}) => {
  await installWardrobeFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workbench.html?mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  const preview = wardrobe.getByTestId("wardrobe-preview");
  const before = await preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  await wardrobe
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles({
      name: "corrupt.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync({ "document.json": strToU8("{}") })),
    });
  await expect(wardrobe.getByRole("alert")).toContainText(
    "open outfit has been kept",
  );
  expect(
    await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(before);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await wardrobe.getByLabel("Wardrobe preview size").selectOption("2");
  await wardrobe.getByLabel("Show anchors", { exact: true }).check();
  await wardrobe.getByLabel("Compare original", { exact: true }).check();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const wardTab = page.getByRole("tab", { name: "Wardrobe", exact: true });
  await wardTab.focus();
  await wardTab.press("ArrowRight");
  const pairedTab = page.getByRole("tab", { name: "双视角衣橱", exact: true });
  await expect(pairedTab).toBeFocused();
  await expect(pairedTab).toHaveAttribute("aria-selected", "true");
  await pairedTab.press("ArrowRight");
  const themesTab = page.getByRole("tab", { name: "Character themes" });
  await expect(themesTab).toBeFocused();
  // Arrow navigation now includes the new themes tab before the optional rig.
  await expect(themesTab).toHaveAttribute("aria-selected", "true");
  await themesTab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Male skeleton" })).toBeFocused();
});

test("a clothing file that touches the head in a later pose is rejected before replacing the outfit", async ({
  page,
}) => {
  const fixtures = await installWardrobeFixture(page);
  await page.goto("/workbench.html?mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  const preview = wardrobe.getByTestId("wardrobe-preview");
  const original = await preview.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL(),
  );
  const files = unzipSync(fixtures.male.items[0].bytes);
  const metadata = JSON.parse(strFromU8(files["manifest.json"]));
  metadata.id = "unsafe-late-pose";
  metadata.name = "Unsafe pose fixture";
  metadata.frames[1].offset.y = 0;
  files["manifest.json"] = strToU8(JSON.stringify(metadata));
  await wardrobe
    .getByLabel("Import registered clothing file", { exact: true })
    .setInputFiles({
      name: "unsafe.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipSync(files)),
    });
  await expect(wardrobe.getByRole("status")).toContainText("Clothing added");
  await wardrobe
    .getByLabel("Top", { exact: true })
    .selectOption("unsafe-late-pose");
  await expect(wardrobe.getByRole("alert")).toContainText(
    "current outfit is unchanged",
  );
  await expect(wardrobe.getByLabel("Top", { exact: true })).toHaveValue("");
  expect(
    await preview.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(original);
});

test("a completed direct-playback jump can be replayed without a separate restart", async ({
  page,
}) => {
  await installWardrobeFixture(page);
  await page.clock.install({ time: new Date("2026-10-21T14:00:00Z") });
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await page.clock.pauseAt(new Date("2026-10-21T15:00:00Z"));
  const canvas = wardrobe.getByTestId("wardrobe-preview");
  await wardrobe
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("jump");
  await wardrobe
    .getByRole("button", { name: "Play wardrobe animation" })
    .click();
  await page.clock.runFor(450);
  await expect(
    wardrobe.getByRole("button", { name: "Play wardrobe animation" }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-frame-position", "2");
  await wardrobe
    .getByRole("button", { name: "Play wardrobe animation" })
    .click();
  await page.clock.runFor(50);
  await expect(
    wardrobe.getByRole("button", { name: "Pause wardrobe animation" }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-frame-position", "0");
  await page.clock.runFor(400);
  await expect(
    wardrobe.getByRole("button", { name: "Play wardrobe animation" }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-frame-position", "2");
});

test("an outfit preflight keeps the queued landing, current pose and facing intact", async ({
  page,
}, testInfo) => {
  const fixtures = await installWardrobeFixture(page, { motionFlow: true });
  await page.clock.install({ time: new Date("2026-10-21T14:00:00Z") });
  await page.goto("/workbench.html?character=female&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await page.clock.pauseAt(new Date("2026-10-21T15:00:00Z"));
  const canvas = wardrobe.getByTestId("wardrobe-preview");
  await wardrobe
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("jump");
  await wardrobe.getByLabel("Wardrobe facing").selectOption("left");
  await wardrobe.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  const original = await canvas.evaluate((el: HTMLCanvasElement) =>
    el.toDataURL(),
  );
  await wardrobe
    .getByRole("button", { name: "Play wardrobe animation" })
    .click();
  await page.clock.runFor(17);
  await wardrobe
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("walk");
  await expect(
    wardrobe.getByText("Jump → Walk at the next prepared boundary"),
  ).toBeVisible();
  let finishFetch!: () => void;
  const fetchGate = new Promise<void>((resolve) => {
    finishFetch = resolve;
  });
  await page.route("**/fixture-wardrobe/female-fullBody.zip", async (route) => {
    await fetchGate;
    await route.fulfill({
      body: Buffer.from(
        fixtures.female.items.find((item) => item.slot === "fullBody")!.bytes,
      ),
    });
  });
  await wardrobe.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(wardrobe.locator(".wardrobe-editor")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.clock.runFor(2000);
  await expect(canvas).toHaveAttribute("data-frame-position", "1");
  expect(await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(
    original,
  );
  finishFetch();
  // The tiny fixture can validate within one cooperative work budget. Do not
  // require an intermediate progress label or advance the animation clock to
  // manufacture a scheduler yield; assert the completed preflight's behavior.
  await expect(wardrobe.getByRole("status")).toContainText("Wedding selected");
  await expect(canvas).toHaveAttribute("data-frame-position", "1");
  await expect(canvas).toHaveAttribute("data-action", "jump");
  await expect(canvas).toHaveAttribute("data-facing", "left");
  await expect(canvas).toHaveAttribute("data-pending-action", "walk");
  expect(
    await canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()),
  ).not.toBe(original);
  await page.clock.runFor(150);
  await expect(canvas).toHaveAttribute("data-action", "jump");
  await expect(canvas).toHaveAttribute("data-frame-position", "2");
  await wardrobe
    .getByRole("button", { name: "Pause wardrobe animation" })
    .click();
  await page.clock.runFor(1500);
  await expect(canvas).toHaveAttribute("data-action", "jump");
  await expect(canvas).toHaveAttribute("data-pending-action", "walk");
  await wardrobe
    .getByRole("button", { name: "Play wardrobe animation" })
    .click();
  await page.clock.runFor(160);
  await expect(canvas).toHaveAttribute("data-action", "walk");
  await expect(canvas).toHaveAttribute("data-pending-action", "");
  await expect(
    wardrobe.getByLabel("Wardrobe action", { exact: true }),
  ).toHaveValue("walk");
  await wardrobe
    .getByRole("button", { name: "Pause wardrobe animation" })
    .click();
  const downloading = page.waitForEvent("download");
  await wardrobe.getByRole("button", { name: /Save wardrobe/ }).click();
  const path = testInfo.outputPath("landed.wardrobe.zip");
  await (await downloading).saveAs(path);
  const saved = await importWardrobeProject(
    new Uint8Array(await readFile(path)),
  );
  expect(saved.document.preview).toEqual({ action: "walk", facing: "left" });
  expect(saved.document.selection.fullBody).toBe("female-fullBody");
  expect(saved.archive.manifest.anchor).toEqual({
    x: 4,
    y: 7,
    units: "pixels",
    origin: "top-left",
  });
});
