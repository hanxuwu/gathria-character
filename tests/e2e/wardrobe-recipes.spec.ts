import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { installWardrobeFixture } from "./wardrobe-fixture";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";

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

test("a paintable pose kit exports the native layer, binary ownership and source anchors", async ({
  page,
}) => {
  const { male } = await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Daily selected");
  await p.getByLabel("Wardrobe facing", { exact: true }).selectOption("left");
  await p.locator("summary").filter({ hasText: "Fitting guides" }).click();
  await p.getByLabel("Inspect clothing layer", { exact: true }).check();
  await expect(
    p.getByLabel("Native clothing pose", { exact: true }),
  ).toHaveAttribute("width", "8");
  await p.getByLabel("Show editable area", { exact: true }).check();
  const download = page.waitForEvent("download");
  await p
    .getByRole("button", {
      name: "Download this pose for painting",
      exact: true,
    })
    .click();
  const d = await download;
  expect(await d.failure()).toBeNull();
  const files = unzipSync(await readFile((await d.path())!));
  const recipe = JSON.parse(strFromU8(files["recipe.json"]));
  const override = recipe.poseOverrides[0];
  const guide = JSON.parse(strFromU8(files["pose-guide.json"]));
  expect(guide.nativeFacing).toBe("right");
  expect(guide.frameId).toBe(override.frameId);
  expect(guide.registration.points).toBeTruthy();
  expect(files["registration.json"]).toEqual(male.registrationBytes);
  const shape = { width: 8, height: 8 };
  const image = decodeSourceRgbaPng(files[override.image.file], shape);
  const mask = decodeSourceRgbaPng(files[override.mask.file], shape);
  expect(
    createHash("sha256").update(files[override.image.file]).digest("hex"),
  ).toBe(override.image.sha256);
  expect(
    createHash("sha256").update(files[override.mask.file]).digest("hex"),
  ).toBe(override.mask.sha256);
  let selected = 0;
  for (let i = 0; i < mask.pixels.length; i += 4) {
    expect([0, 255]).toContain(mask.pixels[i]);
    expect(mask.pixels[i + 1]).toBe(mask.pixels[i]);
    expect(mask.pixels[i + 2]).toBe(mask.pixels[i]);
    expect(mask.pixels[i + 3]).toBe(255);
    if (mask.pixels[i]) selected++;
    else expect(image.pixels[i + 3]).toBe(0);
  }
  expect(selected).toBeGreaterThan(0);
});

test("neighbor painting kits retain action positions, loop boundaries and unique native source layers", async ({
  page,
}) => {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Daily selected");
  await p.locator("summary").filter({ hasText: "Fitting guides" }).click();
  await p.getByLabel("Inspect clothing layer", { exact: true }).check();
  await expect(
    p.getByLabel("Previous native clothing pose", { exact: true }),
  ).toHaveCount(1);
  for (const [action, roles] of [
    ["idle", ["Previous", "Current", "Next"]],
    ["jump", ["Current", "Next"]],
  ] as const) {
    await p.getByLabel("Wardrobe action", { exact: true }).selectOption(action);
    const pending = page.waitForEvent("download");
    await p
      .getByRole("button", {
        name: "Download neighboring poses for painting",
        exact: true,
      })
      .click();
    const d = await pending;
    expect(await d.failure()).toBeNull();
    const files = unzipSync(await readFile((await d.path())!));
    const guide = JSON.parse(strFromU8(files["neighbors-guide.json"]));
    const recipe = JSON.parse(strFromU8(files["recipe.json"]));
    expect(guide.neighbors.map((n: { role: string }) => n.role)).toEqual(roles);
    expect(guide.position).toBe(0);
    expect(guide.nativeFacing).toBe("right");
    expect(recipe.poseOverrides).toHaveLength(2);
    for (const o of recipe.poseOverrides) {
      expect(
        createHash("sha256").update(files[o.image.file]).digest("hex"),
      ).toBe(o.image.sha256);
      expect(decodeSourceRgbaPng(files[o.image.file]).width).toBe(8);
      expect(
        JSON.parse(strFromU8(files[`pose-${o.frameId}-guide.json`])).frameId,
      ).toBe(o.frameId);
    }
  }
  await expect(
    p.getByLabel("Previous native clothing pose", { exact: true }),
  ).toHaveCount(0);
});
