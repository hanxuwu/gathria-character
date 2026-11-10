import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { installAppearanceFixture } from "./appearance-fixture";

async function png(page: Page, button: ReturnType<Page["getByTestId"]>) {
  const pending = page.waitForEvent("download");
  await button.click();
  const file = await pending;
  expect(await file.failure()).toBeNull();
  return readFile((await file.path())!);
}

test("original checkpoints locate real frames, retain the look and export without ownership marks", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto("/workbench.html?mode=wardrobe&character=female");
  const panel = page.locator("#wardrobe-panel");
  await expect(
    panel.getByRole("button", { name: "Open look review", exact: true }),
  ).toBeEnabled({ timeout: 180_000 });
  await panel.getByLabel("Top", { exact: true }).selectOption("teal-top");
  await expect(panel.getByLabel("Top", { exact: true })).toBeEnabled({
    timeout: 180_000,
  });
  await panel
    .getByRole("button", { name: "Open look review", exact: true })
    .click();
  const review = panel.getByRole("region", {
    name: "Look review workbench",
    exact: true,
  });
  await expect(review.getByTestId("coverage-locate-62")).toBeEnabled();
  const selected = await panel
    .locator("select")
    .evaluateAll((selects) =>
      selects
        .filter((s) =>
          /top|bottom|dress|hair|expression|face/i.test(
            s.getAttribute("aria-label") ?? "",
          ),
        )
        .map((s) => (s as HTMLSelectElement).value),
    );
  expect(selected.length).toBeGreaterThan(2);
  await review.getByTestId("coverage-locate-62").click();
  await expect(
    panel.getByLabel("Wardrobe action", { exact: true }),
  ).toHaveValue("run");
  await expect(panel.getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-frame-id",
    "62",
  );
  await expect(review.locator("canvas").first()).toHaveAttribute(
    "data-frame-id",
    "62",
  );
  const before = await png(page, review.getByTestId("coverage-export-png"));
  await review.getByTestId("coverage-overlay").check();
  await expect(review.locator("canvas").first()).toHaveAttribute(
    "data-ownership",
    "true",
  );
  expect(await png(page, review.getByTestId("coverage-export-png"))).toEqual(
    before,
  );
  await review.getByTestId("coverage-locate-90").click();
  await expect(
    panel.getByLabel("Wardrobe action", { exact: true }),
  ).toHaveValue("jump");
  await expect(panel.getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-frame-id",
    "90",
  );
  expect(
    await panel
      .locator("select")
      .evaluateAll((selects) =>
        selects
          .filter((s) =>
            /top|bottom|dress|hair|expression|face/i.test(
              s.getAttribute("aria-label") ?? "",
            ),
          )
          .map((s) => (s as HTMLSelectElement).value),
      ),
  ).toEqual(selected);
  await review.screenshot({
    path: test.info().outputPath("female-original-coverage-review.png"),
  });
  await test.info().attach("female-original-coverage-review", {
    path: test.info().outputPath("female-original-coverage-review.png"),
    contentType: "image/png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await review.getByLabel("Review integer zoom").selectOption("2");
  await expect(review.locator("canvas").first()).toHaveAttribute(
    "data-scale",
    "2",
  );
  const bounds = await review
    .locator("canvas")
    .first()
    .evaluate((c) => ({
      width: c.getBoundingClientRect().width,
      native: (c as HTMLCanvasElement).width,
      doc: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
  expect(bounds.width).toBe(bounds.native * 2);
  expect(bounds.doc).toBeLessThanOrEqual(bounds.viewport);
});

test("side candidate checkpoints find source-only poses without changing garments or exported pixels", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.goto(
    "/workbench.html?mode=side-view&character=male&collection=landing-candidate",
  );
  const panel = page.locator(
    '[data-testid="side-session"][data-active="true"]',
  );
  await expect(panel.getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await panel.getByTestId("side-look-wedding").click();
  await expect(panel.getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  const hairChoice = await panel
    .getByTestId("side-hair")
    .locator("option")
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .find(Boolean),
    );
  expect(hairChoice).toBeTruthy();
  await panel.getByTestId("side-hair").selectOption(hairChoice!);
  await expect(panel.getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await panel.getByTestId("side-review-toggle").click();
  const top = await panel.getByTestId("side-top").inputValue();
  const bottom = await panel.getByTestId("side-bottom").inputValue();
  expect(top).not.toBe("");
  expect(bottom).not.toBe("");
  await panel.getByTestId("coverage-locate-100").click();
  await expect(panel.getByTestId("side-stage")).toHaveAttribute(
    "data-frame-id",
    "100",
  );
  await expect(panel.getByTestId("side-stage")).toHaveAttribute(
    "data-paused",
    "true",
  );
  await expect(panel.getByTestId("side-review-source")).toHaveAttribute(
    "data-frame",
    "100",
  );
  await expect(panel.getByTestId("side-review-dressed")).toHaveAttribute(
    "data-frame",
    "100",
  );
  await expect(panel.getByTestId("side-top")).toHaveValue(top);
  await expect(panel.getByTestId("side-bottom")).toHaveValue(bottom);
  await expect(panel.getByTestId("side-hair")).toHaveValue(hairChoice!);
  const before = await png(page, panel.getByTestId("coverage-export-png"));
  await panel.getByTestId("coverage-overlay").check();
  await expect(panel.getByTestId("side-review-dressed")).toHaveAttribute(
    "data-ownership",
    "true",
  );
  expect(await png(page, panel.getByTestId("coverage-export-png"))).toEqual(
    before,
  );
  await panel.getByTestId("side-review-panel").screenshot({
    path: test.info().outputPath("male-side-coverage-review.png"),
  });
  await test.info().attach("male-side-coverage-review", {
    path: test.info().outputPath("male-side-coverage-review.png"),
    contentType: "image/png",
  });
  await panel.getByTestId("side-facing-left").click();
  await expect(panel.getByTestId("side-review-dressed")).toHaveAttribute(
    "data-facing",
    "left",
  );
  await panel.getByTestId("coverage-locate-101").click();
  await expect(panel.getByTestId("side-stage")).toHaveAttribute(
    "data-frame-id",
    "101",
  );
  await expect(panel.getByTestId("side-stage")).toHaveAttribute(
    "data-facing",
    "left",
  );
  await expect(
    panel.getByTestId("side-playground").getByRole("alert"),
  ).toHaveCount(0);
});

test("ownership overlay follows appearance padding and mirrors inside each panel without modifying exports", async ({
  page,
}) => {
  await installAppearanceFixture(page);
  await page.goto("/workbench.html?mode=wardrobe&character=male");
  const panel = page.locator("#wardrobe-panel");
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await panel.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  await panel
    .getByLabel("Hairstyle", { exact: true })
    .selectOption("soft-crop");
  await expect(panel.getByRole("status")).toContainText("Appearance updated");
  await panel
    .getByRole("button", { name: "Open look review", exact: true })
    .click();
  const review = panel.getByRole("region", {
    name: "Look review workbench",
    exact: true,
  });
  await expect(review.getByTestId("coverage-no-checkpoints")).toBeVisible();
  await review
    .getByLabel("Review background", { exact: true })
    .selectOption("cream");
  const canvas = review.locator("canvas").first();
  const before = await canvas.evaluate((el) =>
    Array.from(
      (el as HTMLCanvasElement)
        .getContext("2d")!
        .getImageData(
          0,
          0,
          (el as HTMLCanvasElement).width,
          (el as HTMLCanvasElement).height,
        ).data,
    ),
  );
  const exported = await png(page, review.getByTestId("coverage-export-png"));
  await review.getByTestId("coverage-overlay").check();
  await expect(canvas).toHaveAttribute("data-ownership", "true");
  const changed = await canvas.evaluate((el, original) => {
    const c = el as HTMLCanvasElement,
      now = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    const points = [];
    for (let i = 0; i < now.length; i += 4)
      if (now.slice(i, i + 4).some((v, j) => v !== original[i + j]))
        points.push([(i / 4) % c.width, Math.floor(i / 4 / c.width)]);
    return points;
  }, before);
  // 8x8 source -> 12x10 appearance output, +2/+2 padding. The owned
  // source rect [2,3,4,4] lands at [4,5,4,4] in the right review panel.
  expect(changed).toHaveLength(16);
  expect(Math.min(...changed.map((p) => p[0]))).toBe(32);
  expect(Math.max(...changed.map((p) => p[0]))).toBe(35);
  expect(Math.min(...changed.map((p) => p[1]))).toBe(33);
  expect(Math.max(...changed.map((p) => p[1]))).toBe(36);
  expect(await png(page, review.getByTestId("coverage-export-png"))).toEqual(
    exported,
  );
  const expected = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return [0, 28].map((left) => {
      const part = document.createElement("canvas");
      part.width = 12;
      part.height = 10;
      const ctx = part.getContext("2d")!;
      ctx.translate(12, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(c, left, 28, 12, 10, 0, 0, 12, 10);
      return Array.from(ctx.getImageData(0, 0, 12, 10).data);
    });
  });
  await panel
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption("left");
  await expect(canvas).toHaveAttribute("data-facing", "left");
  expect(
    await canvas.evaluate((el) =>
      [0, 28].map((left) =>
        Array.from(
          (el as HTMLCanvasElement)
            .getContext("2d")!
            .getImageData(left, 28, 12, 10).data,
        ),
      ),
    ),
  ).toEqual(expected);
});
