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
  // A verified same-session bank is reused despite a later bad network response.
  await choose("Hairstyle", "volume-hair");
  expect(fixture.bankRequests()).toBe(2);
  // A new session must still reject that response rather than trusting its name.
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await choose("Hairstyle", "soft-bob");
  await choose("Face", "gentle");
  await choose("Hair color", "copper");
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

test("canceling a library download preserves the accepted pixels and a later retry succeeds", async ({
  page,
}) => {
  await installAppearanceFixture(page, { libraryBank: true });
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByLabel("Hairstyle", { exact: true }).selectOption("soft-bob");
  await expect(p.getByRole("status")).toContainText("Appearance updated");
  const preview = p.getByTestId("wardrobe-preview");
  const before = await preview.evaluate((c: HTMLCanvasElement) =>
    c.toDataURL(),
  );
  let release!: () => void, requested!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const started = new Promise<void>((r) => {
    requested = r;
  });
  await page.route("**/fixture-appearance/male-volume.zip", async (r) => {
    requested();
    await gate;
    await r.fallback();
  });
  await p.getByLabel("Hairstyle", { exact: true }).selectOption("volume-hair");
  try {
    await started;
    await p
      .getByRole("button", { name: "Cancel preparation", exact: true })
      .click();
    await expect(p.getByRole("status")).toContainText(
      "accepted outfit is unchanged",
    );
    expect(
      await preview.evaluate((c: HTMLCanvasElement) => c.toDataURL()),
    ).toBe(before);
    await expect(p.getByLabel("Hairstyle", { exact: true })).toHaveValue(
      "soft-bob",
    );
  } finally {
    release();
  }
  await page.unroute("**/fixture-appearance/male-volume.zip");
  await p.getByLabel("Hairstyle", { exact: true }).selectOption("volume-hair");
  await expect(p.getByRole("status")).toContainText("Appearance updated");
  await expect(p.getByLabel("Hairstyle", { exact: true })).toHaveValue(
    "volume-hair",
  );
});
