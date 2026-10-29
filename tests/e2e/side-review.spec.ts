import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

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
}
async function download(page: Page, id: string) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId(id).click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  const bytes = await readFile((await result.path())!);
  await ready(page);
  return bytes;
}

test("review slow playback preserves exported pixels and native GIF timing; detail crops mirror exactly", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto(
    "/workbench.html?mode=side-view&collection=tailored&character=male",
  );
  await ready(page);
  await page.getByTestId("side-play-pause").click();
  await page.getByTestId("side-action-run").click();
  await page.getByTestId("side-frame").fill("4");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "4");
  const png = await download(page, "side-export-png");
  const gif = await download(page, "side-export-gif");
  await page.getByTestId("side-review-toggle").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
  await expect(stage(page)).toHaveAttribute("data-mode", "in-place");
  await expect(page.getByTestId("side-comparison")).toBeChecked();
  await expect(page.getByTestId("side-mode-travel")).toBeDisabled();
  await page.getByTestId("side-review-rate").selectOption("0.25");
  await expect(stage(page)).toHaveAttribute("data-preview-rate", "0.25");
  expect(await download(page, "side-export-png")).toEqual(png);
  expect(await download(page, "side-export-gif")).toEqual(gif);

  for (const testId of ["side-review-source", "side-review-dressed"]) {
    await expect(page.getByTestId(testId)).toHaveAttribute(
      "data-facing",
      "right",
    );
  }
  const expectedLeft = await page
    .getByTestId("side-review-dressed")
    .evaluate((element) => {
      const right = element as HTMLCanvasElement;
      const left = document.createElement("canvas");
      left.width = right.width;
      left.height = right.height;
      const context = left.getContext("2d")!;
      context.translate(left.width, 0);
      context.scale(-1, 1);
      context.drawImage(right, 0, 0);
      return left.toDataURL();
    });
  await page.getByTestId("side-facing-left").click();
  await expect(page.getByTestId("side-review-dressed")).toHaveAttribute(
    "data-facing",
    "left",
  );
  expect(
    await page
      .getByTestId("side-review-dressed")
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
  ).toBe(expectedLeft);

  await page.getByTestId("side-action-jump").click();
  await page.getByTestId("side-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "false");
  const timing = await stage(page).evaluate(async (canvas) => {
    const before = Number(canvas.getAttribute("data-elapsed-ms")),
      start = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      source: Number(canvas.getAttribute("data-elapsed-ms")) - before,
      wall: performance.now() - start,
    };
  });
  expect(timing.source / timing.wall).toBeGreaterThan(0.12);
  expect(timing.source / timing.wall).toBeLessThan(0.4);
  await expect(stage(page)).toHaveAttribute("data-fps", "24");
  await page.getByTestId("side-review-toggle").click();
  await expect(stage(page)).toHaveAttribute("data-timing", "native-1x");
  await expect(page.getByTestId("side-mode-travel")).toBeEnabled();
});

test("review bookmarks persist per source with look context, restore a paused pose, and fit mobile", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto(
    "/workbench.html?mode=side-view&collection=tailored&character=male",
  );
  await ready(page);
  await page.getByTestId("side-review-toggle").click();
  await page.getByTestId("side-action-walk").click();
  await page.getByTestId("side-frame").fill("5");
  await page.getByTestId("side-facing-left").click();
  await expect(stage(page)).toHaveAttribute("data-frame-id", "26");
  await page.getByTestId("side-review-note").fill("检查手腕与旧短裤残片");
  await page.getByTestId("side-review-bookmark").click();
  await expect(page.getByTestId("side-review-notes").locator("li")).toHaveCount(
    1,
  );
  const report = JSON.parse(
    (await download(page, "side-review-export")).toString(),
  );
  expect(report.format).toBe("gathria-side-review-notes");
  expect(report.character).toBe("male");
  expect(report.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.notes[0]).toMatchObject({
    action: "walk",
    frame: 26,
    facing: "left",
    region: "nearHand",
  });
  const look = JSON.parse(report.notes[0].lookKey);
  expect(look.registrationSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(look.items).toHaveLength(2);
  await page.reload();
  await ready(page);
  await page.getByTestId("side-review-toggle").click();
  await expect(page.getByTestId("side-review-notes").locator("li")).toHaveCount(
    1,
  );
  await page.getByTestId("side-bottom").selectOption("");
  await ready(page);
  await expect(page.getByTestId("side-review-notes")).toContainText(
    "搭配或素材版本不同",
  );
  await page.getByRole("button", { name: "定位此帧" }).click();
  await expect(stage(page)).toHaveAttribute("data-action", "walk");
  await expect(stage(page)).toHaveAttribute("data-frame-id", "26");
  await expect(stage(page)).toHaveAttribute("data-facing", "left");
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
  await expect(page.getByTestId("side-bottom")).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("side-review-scale").selectOption("3");
  const size = await page
    .getByTestId("side-review-dressed")
    .evaluate((canvas) => ({
      nativeWidth: (canvas as HTMLCanvasElement).width,
      displayWidth: canvas.getBoundingClientRect().width,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
  expect(size.displayWidth).toBe(size.nativeWidth);
  expect(size.documentWidth).toBeLessThanOrEqual(size.viewportWidth);
  await page.getByTestId("side-character").selectOption("female");
  await ready(page);
  await expect(page.getByTestId("side-review-notes").locator("li")).toHaveCount(
    0,
  );
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
});
