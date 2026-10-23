import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { installWardrobeFixture } from "./wardrobe-fixture";

test("a larger lazy clothing catalog exports the exact selected authoring kit without loading unused items", async ({
  page,
}) => {
  const { male, female } = await installWardrobeFixture(page);
  const extra = Array.from({ length: 18 }, (_, i) => ({
    ...male.entry.items[0],
    id: `extra-${i}`,
    name: `Extra ${i}`,
    url: `/unused-clothing/${i}.zip`,
  }));
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({
      json: {
        version: 1,
        characters: [
          { ...male.entry, items: [...male.entry.items, ...extra] },
          female.entry,
        ],
      },
    }),
  );
  const unused: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/unused-clothing/")) unused.push(request.url());
  });
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const panel = page.locator("#wardrobe-panel");
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await panel.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  const before = await panel
    .getByTestId("wardrobe-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await panel.locator("summary").filter({ hasText: "Fitting guides" }).click();
  await panel
    .getByLabel("Recipe clothing", { exact: true })
    .selectOption("male-top");
  const pending = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Download clothing recipe", exact: true })
    .click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const files = unzipSync(await readFile((await download.path())!));
  const recipe = JSON.parse(strFromU8(files["recipe.json"]));
  const original = male.items.find((i) => i.id === "male-top")!;
  expect(files["base.garment.zip"]).toEqual(original.bytes);
  expect(files["registration.json"]).toEqual(male.registrationBytes);
  expect(recipe.base.sha256).toBe(
    createHash("sha256").update(original.bytes).digest("hex"),
  );
  expect(recipe.category).toBe("shirt");
  expect(
    await panel
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(before);
  expect(unused).toEqual([]);
});
