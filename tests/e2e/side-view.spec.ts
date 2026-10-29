import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";

// These cases intentionally use the shipped side assets. Small existing wardrobe
// fixtures have different source identities and cannot validate side registration.
const stage = (page: Page) => page.getByTestId("side-stage");
async function ready(page: Page) {
  await expect(page.getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await expect(
    page.getByTestId("side-playground").getByRole("alert"),
  ).toHaveCount(0);
  await expect(stage(page)).toBeVisible();
}
async function pause(page: Page) {
  if ((await stage(page).getAttribute("data-paused")) === "false")
    await page.getByTestId("side-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
}
async function frame(page: Page, value: number) {
  await page.getByTestId("side-frame").fill(value === 0 ? "1" : "0");
  await page.getByTestId("side-frame").fill(String(value));
  await expect(stage(page)).toHaveAttribute(
    "data-frame-position",
    String(value),
  );
}
async function download(page: Page, id: string) {
  const pending = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId(id).click();
  const result = await pending;
  expect(await result.failure()).toBeNull();
  const path = (await result.path())!;
  const bytes = await readFile(path);
  await ready(page);
  return { path, bytes };
}

for (const character of ["male", "female"] as const) {
  test(`${character}: native side frames, guide-free exports, mixed outfit and project reopen`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/workbench.html?mode=side-view&character=${character}`);
    await ready(page);
    await expect(stage(page)).toHaveAttribute("data-character", character);
    await expect(stage(page)).toHaveAttribute("data-fps", "24");
    await expect(stage(page)).toHaveAttribute("data-timing", "native-1x");
    await pause(page);
    await page.getByTestId("side-action-run").click();
    await expect(stage(page)).toHaveAttribute("data-action", "run");
    await frame(page, 4);
    const original = await download(page, "side-export-png");
    const originalRgba = decodeSourceRgbaPng(original.bytes);
    expect([originalRgba.width, originalRgba.height]).toEqual([512, 768]);
    await page.getByTestId("side-anchors").check();
    await page.getByTestId("side-ground").check();
    await page.getByTestId("side-comparison").check();
    const withGuides = await download(page, "side-export-png");
    expect(withGuides.bytes).toEqual(original.bytes);
    await page.getByTestId("side-anchors").uncheck();
    await page.getByTestId("side-comparison").uncheck();
    await page.getByTestId("side-look-daily").click();
    await ready(page);
    await expect(page.getByTestId("side-look-daily")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const selection = JSON.parse(
      (await stage(page).getAttribute("data-selection"))!,
    );
    expect(selection.top).toBeTruthy();
    expect(selection.bottom).toBeTruthy();
    expect(selection.shoes).toBeTruthy();
    const daily = await download(page, "side-export-png");
    const dailyRgba = decodeSourceRgbaPng(daily.bytes);
    let changed = 0,
      alphaChanges = 0;
    for (let i = 0; i < originalRgba.pixels.length; i += 4) {
      if (dailyRgba.pixels[i + 3] !== originalRgba.pixels[i + 3])
        alphaChanges++;
      if (
        dailyRgba.pixels[i] !== originalRgba.pixels[i] ||
        dailyRgba.pixels[i + 1] !== originalRgba.pixels[i + 1] ||
        dailyRgba.pixels[i + 2] !== originalRgba.pixels[i + 2]
      )
        changed++;
    }
    expect(alphaChanges).toBe(0);
    expect(changed).toBeGreaterThan(0);
    await page.getByTestId("side-top").selectOption("");
    await ready(page);
    await expect(page.getByTestId("side-top")).toHaveValue("");
    await expect(page.getByTestId("side-bottom")).toHaveValue(selection.bottom);
    await expect(page.getByTestId("side-shoes")).toHaveValue(selection.shoes);
    await page.getByTestId("side-facing-left").click();
    await expect(stage(page)).toHaveAttribute("data-facing", "left");
    const saved = await download(page, "side-save-project");
    const entries = unzipSync(saved.bytes);
    const document = JSON.parse(
      Buffer.from(entries["document.json"]).toString(),
    );
    expect(document.selection).toEqual({ ...selection, top: null });
    expect(document.preview).toEqual({ action: "run", facing: "left" });
    expect(entries["source.character.zip"].byteLength).toBeGreaterThan(
      1_000_000,
    );
    const registration = JSON.parse(
      Buffer.from(entries["registration.json"]).toString(),
    );
    expect(registration.frames).toHaveLength(character === "male" ? 107 : 102);
    await page.reload();
    await ready(page);
    await page.getByTestId("side-project-input").setInputFiles(saved.path);
    await ready(page);
    await expect(stage(page)).toHaveAttribute("data-action", "run");
    await expect(stage(page)).toHaveAttribute("data-facing", "left");
    expect(
      JSON.parse((await stage(page).getAttribute("data-selection"))!),
    ).toEqual(document.selection);
    await pause(page);
    await frame(page, 4);
    const savedPose = await download(page, "side-export-png");
    await page.getByTestId("side-project-input").setInputFiles({
      name: "broken.wardrobe.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("not a project"),
    });
    await expect(
      page.getByTestId("side-playground").getByRole("alert"),
    ).toBeVisible();
    await expect(page.getByTestId("side-playground")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    expect(
      JSON.parse((await stage(page).getAttribute("data-selection"))!),
    ).toEqual(document.selection);
    // A successful PNG operation clears the error and proves the retained renderer works.
    const retained = await download(page, "side-export-png");
    expect(retained.bytes).toEqual(savedPose.bytes);
    expect(errors).toEqual([]);
  });
}

test("side keyboard travel retains source timing and the full two-jump one-shot", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/workbench.html?mode=side-view&character=male");
  await ready(page);
  await page.getByTestId("side-mode-travel").click();
  await page.getByTestId("side-walk-speed").fill("120");
  await stage(page).focus();
  await page.keyboard.down("ArrowRight");
  await expect(stage(page)).toHaveAttribute("data-action", "walk");
  await expect
    .poll(async () => Number(await stage(page).getAttribute("data-position")))
    .toBeGreaterThan(20);
  await page.keyboard.down("Shift");
  await expect(stage(page)).toHaveAttribute("data-action", "run");
  await expect(stage(page)).toHaveAttribute("data-fps", "24");
  await page.keyboard.press("Space");
  await expect(stage(page)).toHaveAttribute("data-action", "jump");
  // Release movement while jumping: the request must wait until both source jumps finish.
  await page.keyboard.up("Shift");
  await page.keyboard.up("ArrowRight");
  await expect(stage(page)).toHaveAttribute("data-pending", "idle");
  await expect(page.getByTestId("side-facing-left")).toBeDisabled();
  await expect(stage(page)).toHaveAttribute("data-action", "idle", {
    timeout: 6000,
  });
  await pause(page);
  await page.getByTestId("side-action-jump").click();
  await expect(page.getByTestId("side-frame")).toHaveAttribute("max", "49");
  await frame(page, 48);
  await page.getByTestId("side-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-ended", "true");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "49");
  const held = await stage(page).evaluate((c: HTMLCanvasElement) =>
    c.toDataURL(),
  );
  await page.waitForTimeout(150);
  expect(
    await stage(page).evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(held);
  await page.getByTestId("side-action-jump").click();
  await expect(stage(page)).toHaveAttribute("data-ended", "false");
  await expect
    .poll(async () =>
      Number(await stage(page).getAttribute("data-frame-position")),
    )
    .toBeLessThan(25);
});
