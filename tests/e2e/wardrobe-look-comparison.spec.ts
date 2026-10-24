import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { parseGIF, decompressFrames } from "gifuct-js";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { installAppearanceFixture } from "./appearance-fixture";

test("a pinned look survives styling and history, aligns unequal hair padding, and exports mirrored comparisons", async ({
  page,
}) => {
  await installAppearanceFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel"),
    status = p.getByRole("status");
  await expect(status).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(status).toContainText("Daily selected");
  await p
    .getByRole("button", { name: "Pin current look", exact: true })
    .click();
  await expect(status).toContainText("Look pinned");
  await p.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(status).toContainText("Wedding selected");
  await p.getByLabel("Hairstyle", { exact: true }).selectOption("soft-crop");
  await expect(status).toContainText("Appearance updated");
  const comparison = p.getByRole("img", {
    name: "Pinned and current looks at the same pose",
  });
  await expect(comparison).toHaveAttribute("width", "40"); // 12 x 2 + 16, reference padded to hair
  await expect(comparison).toHaveAttribute("height", "58");
  await expect(
    p.getByRole("heading", { name: "Pinned look · Daily", exact: true }),
  ).toBeVisible();
  const frame = p.getByTestId("wardrobe-preview");
  const styled = await frame.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await p.getByRole("button", { name: "Undo styling", exact: true }).click();
  await expect(status).toContainText("Styling change undone");
  await expect(comparison).toHaveAttribute("width", "32");
  await p.getByRole("button", { name: "Redo styling", exact: true }).click();
  await expect(status).toContainText("Styling change redone");
  expect(await frame.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(
    styled,
  );
  await p.getByLabel("Wardrobe action", { exact: true }).selectOption("run");
  await p
    .getByLabel("Wardrobe preview speed", { exact: true })
    .selectOption("0.25");
  const gifs = [];
  for (const facing of ["right", "left"]) {
    await p.getByLabel("Wardrobe facing", { exact: true }).selectOption(facing);
    await expect(comparison).toHaveAttribute("data-facing", facing);
    const event = page.waitForEvent("download");
    await p
      .getByRole("button", {
        name: "Download look comparison GIF",
        exact: true,
      })
      .click();
    const d = await event;
    expect(d.suggestedFilename()).toContain(
      `${facing}-pinned-current-half.gif`,
    );
    const data = new Uint8Array(await readFile((await d.path())!));
    const parsed = parseGIF(data.buffer),
      frames = decompressFrames(parsed, true);
    expect(parsed.lsd).toMatchObject({ width: 20, height: 21 });
    expect(frames.map((f) => f.delay)).toEqual([80, 90]);
    gifs.push(frames);
    await expect(status).toContainText("Look comparison GIF saved");
  }
  for (let f = 0; f < 2; f++)
    for (const left of [0, 14])
      for (let y = 16; y < 21; y++)
        for (let x = 0; x < 6; x++) {
          const a = (y * 20 + left + x) * 4,
            b = (y * 20 + left + 5 - x) * 4;
          expect(gifs[0][f].patch.slice(a, a + 4)).toEqual(
            gifs[1][f].patch.slice(b, b + 4),
          );
        }
  const event = page.waitForEvent("download");
  await p
    .getByRole("button", { name: "Save look comparison PNG", exact: true })
    .click();
  const png = decodeSourceRgbaPng(
    new Uint8Array(await readFile((await (await event).path())!)),
    { width: 40, height: 58 },
  );
  expect(png.width).toBe(40);
  await p
    .getByLabel("Wardrobe character", { exact: true })
    .selectOption("female");
  await expect(status).toContainText("Original outfit.");
  await expect(comparison).toHaveCount(0);
  await expect(
    p.getByRole("button", { name: "Pin current look", exact: true }),
  ).toBeEnabled();
});
