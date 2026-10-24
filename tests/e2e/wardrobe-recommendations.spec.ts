import { expect, test } from "@playwright/test";
import { installWardrobeFixture } from "./wardrobe-fixture";

test("recommended outfits keep earlier selections reachable and visible without changing the character", async ({
  page,
}) => {
  const { male, female } = await installWardrobeFixture(page);
  const recommended = {
    ...male.entry.presets[0],
    id: "day-refined",
    name: "Daily recommended",
  };
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({
      json: {
        version: 1,
        characters: [
          { ...male.entry, presets: [...male.entry.presets, recommended] },
          female.entry,
        ],
      },
    }),
  );
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  const snapshot = () =>
    p
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const original = await snapshot();
  await expect(
    p.getByRole("button", { name: "Daily recommended", exact: true }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Wedding", exact: true }),
  ).toHaveCount(0);
  const more = p.getByRole("button", {
    name: "More outfits and earlier versions",
    exact: true,
  });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(
    p.getByRole("button", { name: "Show recommended outfits" }),
  ).toHaveAttribute("aria-expanded", "true");
  expect(await snapshot()).toBe(original);
  await p.getByRole("button", { name: "Show recommended outfits" }).click();
  await p.getByLabel("Find an outfit", { exact: true }).fill("WEDDING");
  await expect(
    p.getByRole("button", { name: "Wedding", exact: true }),
  ).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Daily recommended", exact: true }),
  ).toHaveCount(0);
  expect(await snapshot()).toBe(original);
  await p.getByLabel("Find an outfit", { exact: true }).fill("no such outfit");
  await expect(
    p.getByText("0 matching outfits", { exact: true }),
  ).toBeVisible();
  expect(await snapshot()).toBe(original);
  await p.getByLabel("Find an outfit", { exact: true }).fill("wedding");
  await p.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Wedding selected");
  const old = await snapshot();
  await p.getByRole("button", { name: "Clear outfit search" }).click();
  await expect(
    p.getByRole("button", { name: "Wedding", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await snapshot()).toBe(old);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
