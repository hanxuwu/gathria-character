import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installWardrobeFixture } from "./wardrobe-fixture";

test("frame inspection keeps source and dressed crops aligned without changing exported pixels", async ({
  page,
}, info) => {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=female&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Daily selected");
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("run");
  const image = p.getByTestId("wardrobe-preview");
  const first = await image.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const download = async (file: string) => {
    const event = page.waitForEvent("download");
    await p
      .getByRole("button", { name: "Save current PNG", exact: true })
      .click();
    const target = info.outputPath(file);
    await (await event).saveAs(target);
    return readFile(target);
  };
  const before = await download("before.png");
  await p.getByLabel("Compare original", { exact: true }).check();
  await p.getByLabel("Inspect connections", { exact: true }).check();
  await p
    .getByRole("button", { name: "Next wardrobe frame", exact: true })
    .click();
  await expect(p.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    "1",
  );
  const fid = await image.getAttribute("data-frame-id");
  await expect(p.getByTestId("wardrobe-original-preview")).toHaveAttribute(
    "data-frame-id",
    fid!,
  );
  const crop = p.getByRole("img", {
    name: "Original and current connection crops",
  });
  await expect(crop).toHaveAttribute("data-frame-id", fid!);
  await p.getByLabel("Wardrobe facing", { exact: true }).selectOption("left");
  await expect(crop).toHaveAttribute("data-facing", "left");
  for (const region of ["waist", "wrists", "feet", "head"]) {
    await p.getByLabel("Inspection area", { exact: true }).selectOption(region);
    expect(
      await crop.evaluate(
        (c: HTMLCanvasElement) => c.width > 0 && c.height > 0,
      ),
    ).toBe(true);
  }
  const nativeCrop = await crop.getAttribute("data-crop");
  const images: string[] = [];
  for (const backdrop of ["dark", "checker", "cream"]) {
    await p
      .getByLabel("Inspection background", { exact: true })
      .selectOption(backdrop);
    await expect(crop).toHaveAttribute("data-backdrop", backdrop);
    expect(await crop.getAttribute("data-crop")).toBe(nativeCrop);
    images.push(await crop.evaluate((c: HTMLCanvasElement) => c.toDataURL()));
  }
  expect(new Set(images).size).toBe(3);
  await p.getByLabel("Show silhouettes", { exact: true }).check();
  await expect(crop).toHaveAttribute("data-silhouette", "true");
  expect(await crop.getAttribute("data-crop")).toBe(nativeCrop);
  const comparison = page.waitForEvent("download");
  await p
    .getByRole("button", { name: "Save comparison PNG", exact: true })
    .click();
  const comparisonDownload = await comparison;
  expect(await comparisonDownload.failure()).toBeNull();
  expect(comparisonDownload.suggestedFilename()).toContain(
    "-left-cream-silhouette-2x.png",
  );
  await p
    .getByRole("button", { name: "Previous wardrobe frame", exact: true })
    .click();
  await p.getByLabel("Wardrobe facing", { exact: true }).selectOption("right");
  await p
    .getByLabel("Wardrobe preview speed", { exact: true })
    .selectOption("0.25");
  expect(await image.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    first,
  );
  expect(await download("after.png")).toEqual(before);
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("jump");
  await expect(
    p.getByRole("button", { name: "Previous wardrobe frame", exact: true }),
  ).toBeDisabled();
  await p
    .getByRole("button", { name: "Next wardrobe frame", exact: true })
    .click();
  await expect(p.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    "1",
  );
  await p
    .getByRole("button", { name: "Next wardrobe frame", exact: true })
    .click();
  await expect(
    p.getByRole("button", { name: "Next wardrobe frame", exact: true }),
  ).toBeDisabled();
});
