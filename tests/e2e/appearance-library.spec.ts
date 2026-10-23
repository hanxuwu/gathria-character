import { expect, test } from "@playwright/test";
import { installAppearanceFixture } from "./appearance-fixture";

test("changing separate library banks keeps face/color and rejects a mismatched download without losing the accepted look", async ({
  page,
}) => {
  const fixture = await installAppearanceFixture(page, { libraryBank: true });
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  expect(fixture.bankRequests()).toBe(0);
  const choose = async (label: string, value: string) => {
    await p.getByLabel(label, { exact: true }).selectOption(value);
    await expect(p.getByRole("status")).toContainText("Appearance updated");
  };
  await choose("Hairstyle", "volume-hair");
  expect(fixture.bankRequests()).toBe(1);
  await choose("Face", "gentle");
  await choose("Hair color", "copper");
  await choose("Hairstyle", "soft-bob");
  expect(fixture.bankRequests()).toBe(2);
  await expect(p.getByLabel("Face", { exact: true })).toHaveValue("gentle");
  await expect(p.getByLabel("Hair color", { exact: true })).toHaveValue(
    "copper",
  );
  const preview = p.getByTestId("wardrobe-preview");
  const rgba = await preview.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.route("**/fixture-appearance/male-volume.zip", (r) =>
    r.fulfill({ body: Buffer.from(fixture.variants.male.current) }),
  );
  await p.getByLabel("Hairstyle", { exact: true }).selectOption("volume-hair");
  await expect(p.getByRole("alert")).toContainText(
    "does not match its library entry",
  );
  await expect(p.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "soft-bob",
  );
  expect(await preview.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    rgba,
  );
  await page.unroute("**/fixture-appearance/male-volume.zip");
  await choose("Hairstyle", "volume-hair");
  await expect(p.getByLabel("Face", { exact: true })).toHaveValue("gentle");
  await expect(p.getByLabel("Hair color", { exact: true })).toHaveValue(
    "copper",
  );
});
