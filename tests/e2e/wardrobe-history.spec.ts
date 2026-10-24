import { expect, test } from "@playwright/test";
import { installAppearanceFixture } from "./appearance-fixture";

test("undo/redo restores exact styled pixels without changing the current pose and isolates character histories", async ({
  page,
}) => {
  await installAppearanceFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel"),
    status = p.getByRole("status");
  await expect(status).toContainText("Original outfit.");
  const undo = p.getByRole("button", { name: "Undo styling", exact: true }),
    redo = p.getByRole("button", { name: "Redo styling", exact: true });
  await expect(undo).toBeDisabled();
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(status).toContainText("Daily selected");
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("run");
  await p.getByLabel("Wardrobe facing", { exact: true }).selectOption("left");
  await p.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  const pixels = () =>
    p
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const daily = await pixels();
  await p.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(status).toContainText("Wedding selected");
  const wedding = await pixels();
  expect(wedding).not.toBe(daily);
  await undo.click();
  await expect(status).toContainText("Styling change undone");
  expect(await pixels()).toBe(daily);
  await expect(p.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    "1",
  );
  await expect(p.getByLabel("Wardrobe facing", { exact: true })).toHaveValue(
    "left",
  );
  await redo.click();
  await expect(status).toContainText("Styling change redone");
  expect(await pixels()).toBe(wedding);
  await p
    .getByLabel("Wardrobe character", { exact: true })
    .selectOption("female");
  await expect(status).toContainText("Original outfit.");
  await expect(undo).toBeDisabled();
  await p
    .getByLabel("Wardrobe character", { exact: true })
    .selectOption("male");
  await expect(status).toContainText("Restored this character");
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(status).toContainText("Styling change undone");
  await p.getByRole("button", { name: "Original", exact: true }).click();
  await expect(status).toContainText("Original outfit selected");
  await expect(redo).toBeDisabled();
});

test("failed imports and canceled selection do not lose the redo branch; reopening resets history", async ({
  page,
}) => {
  await installAppearanceFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel"),
    status = p.getByRole("status");
  await expect(status).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(status).toContainText("Daily selected");
  const download = page.waitForEvent("download");
  await p.getByRole("button", { name: /^Save wardrobe/ }).click();
  const saved = await (await download).path();
  await expect(status).toContainText("Wardrobe project saved");
  await p.getByRole("button", { name: "Undo styling", exact: true }).click();
  await expect(status).toContainText("Styling change undone");
  const redo = p.getByRole("button", { name: "Redo styling", exact: true });
  await p
    .getByLabel("Import registered clothing file", { exact: true })
    .setInputFiles({
      name: "bad.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("broken"),
    });
  await expect(p.getByRole("alert")).toBeVisible();
  await expect(redo).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/fixture-wardrobe/male-fullBody.zip", async (route) => {
    await gate;
    await route.fallback();
  });
  await p.getByRole("button", { name: "Wedding", exact: true }).click();
  await p
    .getByRole("button", { name: "Cancel preparation", exact: true })
    .click();
  release();
  await expect(status).toContainText("Preparation canceled");
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(status).toContainText("Styling change redone");
  await p
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(saved!);
  await expect(status).toContainText(
    "Saved outfit and action settings restored",
  );
  await expect(redo).toBeDisabled();
  await expect(
    p.getByRole("button", { name: "Undo styling", exact: true }),
  ).toBeDisabled();
});
