import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { installWardrobeFixture } from "./wardrobe-fixture";
import { installAppearanceFixture } from "./appearance-fixture";

test("named clothes survive reload, restore action/facing and retain an exact local asset after catalog changes", async ({
  page,
}) => {
  const f = await installWardrobeFixture(page);
  const entries = [f.male, f.female].map((c) => ({
    ...c.entry,
    items: c.items.map(({ id, name, slot, url, bytes }) => ({
      id,
      name,
      slot,
      url,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })),
  }));
  await page.route("**/docs/kling-wardrobe/catalog.json", (r) =>
    r.fulfill({ json: { version: 1, characters: entries } }),
  );
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Daily selected");
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("run");
  await p.getByLabel("Wardrobe facing", { exact: true }).selectOption("left");
  const before = await p
    .getByTestId("wardrobe-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await p.getByLabel("Look name").fill("Daily left");
  await p.getByRole("button", { name: "Save look", exact: true }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "artwork saved in this browser",
  );
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p
    .getByRole("button", { name: "Apply look Daily left", exact: true })
    .click();
  await expect(p.getByRole("status")).toContainText("Daily left restored");
  await expect(p.getByLabel("Wardrobe action", { exact: true })).toHaveValue(
    "run",
  );
  await expect(p.getByLabel("Wardrobe facing", { exact: true })).toHaveValue(
    "left",
  );
  expect(
    await p
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(before);
  entries[0].items[0].sha256 = "f".repeat(64);
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Apply look Daily left" }).click();
  await expect(p.getByRole("status")).toContainText("Daily left restored");
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue("male-top");
  // If the local copy is gone too, the mismatched library revision must still fail.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("gathria-look-materials-v1");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
  );
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Apply look Daily left" }).click();
  await expect(p.getByRole("alert")).toContainText("exact saved material");
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue("");
  await p.getByRole("button", { name: "Delete look Daily left" }).click();
  await page.reload();
  await expect(
    p.getByRole("button", { name: "Apply look Daily left" }),
  ).toHaveCount(0);
});

test("named hair and expression restore exactly, while an original look removes the appearance bank", async ({
  page,
}) => {
  await installAppearanceFixture(page, { libraryBank: true });
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  const original = await p
    .getByTestId("wardrobe-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const save = async (name: string) => {
    await p.getByLabel("Look name").fill(name);
    await p.getByRole("button", { name: "Save look", exact: true }).click();
    await expect(p.locator(".wardrobe-named-looks")).toContainText(
      "artwork saved in this browser",
    );
  };
  await save("Original");
  for (const [label, value] of [
    ["Hairstyle", "volume-hair"],
    ["Face", "gentle"],
    ["Hair color", "copper"],
  ]) {
    await p.getByLabel(label, { exact: true }).selectOption(value);
    await expect(p.getByRole("status")).toContainText("Appearance updated");
  }
  const dressed = await p
    .getByTestId("wardrobe-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await save("Copper smile");
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Apply look Copper smile" }).click();
  await expect(p.getByRole("status")).toContainText("Copper smile restored");
  expect(
    await p
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(dressed);
  await p
    .getByRole("button", { name: "Apply look Original", exact: true })
    .click();
  await expect(p.getByRole("status")).toContainText("Original restored");
  expect(
    await p
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(original);
});
