import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";

// Retained sessions keep their state; interactions target the active source only.
const side = (page: Page) =>
  page.locator('[data-testid="side-session"][data-active="true"]');

const evidence = "/tmp/side-refinement/workbench/browser";
async function ready(page: Page) {
  await expect(side(page).getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
}
async function download(page: Page, click: () => Promise<void>) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  return readFile((await result.path())!);
}
async function open(page: Page, character: "male" | "female") {
  await page.goto(
    `/workbench.html?mode=side-view&collection=tailored&character=${character}`,
  );
  await ready(page);
  await side(page).getByTestId("side-fitting-toggle").click();
  await expect(side(page).getByTestId("side-fitting")).toBeVisible();
  await side(page).getByTestId("fitting-guides").uncheck();
  await side(page).getByTestId("fitting-neighbors-toggle").click();
}
async function pixels(page: Page, testId: string) {
  return side(page)
    .getByTestId(testId)
    .evaluate((element) => (element as HTMLCanvasElement).toDataURL());
}

test("fitting neighbor review preserves native pixels and distinguishes loops from jump boundaries", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (cause) => errors.push(cause.message));
  await open(page, "female");
  const initial = await download(page, () =>
    side(page).getByTestId("side-export-png").click(),
  );
  await ready(page);
  await expect(side(page).getByTestId("fitting-workflow-status")).toContainText(
    "不会自动保存",
  );
  await side(page).getByTestId("fitting-action").selectOption("run");
  await side(page).getByTestId("fitting-position").fill("0");
  await expect(
    side(page).getByTestId("fitting-neighbor-label-0"),
  ).toContainText("姿势 51（循环交界）");
  await expect(
    side(page).getByTestId("fitting-neighbor-label-1"),
  ).toContainText("姿势 34");
  await expect(
    side(page).getByTestId("fitting-neighbor-label-2"),
  ).toContainText("姿势 35");
  await expect
    .poll(
      async () =>
        (await pixels(page, "fitting-neighbor-1")) ===
        (await pixels(page, "fitting-current")),
    )
    .toBe(true);
  await side(page).getByTestId("fitting-previous").click();
  await expect(side(page).getByTestId("fitting-position")).toHaveValue("17");
  await expect(
    side(page).getByTestId("fitting-neighbor-label-2"),
  ).toContainText("姿势 34（循环交界）");
  await side(page).getByTestId("fitting-next").click();
  await expect(side(page).getByTestId("fitting-position")).toHaveValue("0");
  await side(page).getByTestId("fitting-neighbor-view").selectOption("cloth");
  await expect
    .poll(
      async () =>
        (await pixels(page, "fitting-neighbor-1")) ===
        (await pixels(page, "fitting-cloth")),
    )
    .toBe(true);
  await side(page).getByTestId("fitting-neighbor-view").selectOption("look");
  await side(page).getByTestId("fitting-action").selectOption("jump");
  await expect(side(page).getByTestId("fitting-previous")).toBeDisabled();
  await expect(side(page).getByTestId("fitting-neighbor-0")).toHaveCount(0);
  await side(page).getByTestId("fitting-position").fill("49");
  await expect(side(page).getByTestId("fitting-next")).toBeDisabled();
  await expect(side(page).getByTestId("fitting-neighbor-2")).toHaveCount(0);
  await side(page).getByTestId("fitting-audit").click();
  await expect(side(page).getByTestId("fitting-audit-results")).toBeVisible({
    timeout: 180_000,
  });
  await page.getByRole("button", { name: "跑步 / 40", exact: true }).click();
  await expect(side(page).getByTestId("fitting-frame")).toContainText(
    "姿势 40",
  );
  await expect(
    side(page).getByTestId("fitting-neighbor-label-0"),
  ).toContainText("姿势 39");
  await expect(
    side(page).getByTestId("fitting-neighbor-label-2"),
  ).toContainText("姿势 41");
  await expect(side(page).getByTestId("side-stage")).toHaveAttribute(
    "data-action",
    "run",
  );
  await expect(side(page).getByTestId("side-stage")).toHaveAttribute(
    "data-frame",
    "40",
  );
  const selectedPose = await download(page, () =>
    side(page).getByTestId("side-export-png").click(),
  );
  expect(selectedPose).not.toEqual(initial);
  await ready(page);
  await side(page)
    .getByTestId("side-fitting")
    .screenshot({ path: `${evidence}/female-temporal-review.png` });
  await side(page).getByTestId("fitting-repair-run-40").click();
  const dialog = page.getByRole("dialog", { name: "Clothing mask workbench" });
  await expect(
    dialog.getByRole("button", { name: "Restore source", exact: true }),
  ).toBeEnabled({ timeout: 180_000 });
  await expect(side(page).getByTestId("fitting-workflow-status")).toContainText(
    "局部草稿",
  );
  await dialog.getByRole("button", { name: "Close mask workbench" }).click();
  expect(
    await download(page, () =>
      side(page).getByTestId("side-export-png").click(),
    ),
  ).toEqual(selectedPose);
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await side(page).getByTestId("fitting-zoom").selectOption("2");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      side(page)
        .getByTestId("fitting-neighbor-1")
        .evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          const scroll = canvas.parentElement!;
          const scale = canvas.getBoundingClientRect().width / canvas.width;
          const x = Math.floor(scroll.scrollLeft / scale),
            y = Math.floor(scroll.scrollTop / scale);
          const width = Math.max(
            1,
            Math.min(canvas.width - x, Math.floor(scroll.clientWidth / scale)),
          );
          const height = Math.max(
            1,
            Math.min(
              canvas.height - y,
              Math.floor(scroll.clientHeight / scale),
            ),
          );
          const data = canvas
            .getContext("2d")!
            .getImageData(x, y, width, height).data;
          let painted = 0;
          for (let at = 3; at < data.length; at += 4)
            if (data[at] > 0) painted++;
          return painted;
        }),
    )
    .toBeGreaterThan(100);
  await side(page)
    .getByTestId("fitting-neighbors")
    .screenshot({ path: `${evidence}/female-neighbors-mobile.png` });
  expect(errors).toEqual([]);
});

test("fitting template reopens exact target guides and rejects a different source without changing the look", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await mkdir(evidence, { recursive: true });
  await open(page, "male");
  const before = await download(page, () =>
    side(page).getByTestId("side-export-png").click(),
  );
  await ready(page);
  await side(page).getByTestId("fitting-action").selectOption("run");
  await side(page).getByTestId("fitting-position").fill("4");
  await side(page)
    .getByTestId("fitting-template-panel")
    .locator("summary")
    .click();
  const reference = await download(page, () =>
    side(page).getByTestId("fitting-template-export").click(),
  );
  await expect(side(page).getByTestId("side-fitting")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const document = JSON.parse(reference.toString());
  expect(document.frameIds).toEqual([42, 43, 44]);
  await side(page).getByTestId("fitting-template-input").setInputFiles({
    name: "reference.json",
    mimeType: "application/json",
    buffer: reference,
  });
  await expect(side(page).getByTestId("fitting-template-result")).toBeVisible();
  const guide = unzipSync(
    await download(page, () =>
      side(page).getByTestId("fitting-template-kit").click(),
    ),
  );
  await expect(side(page).getByTestId("side-fitting")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(guide["base.garment.zip"]).toEqual(
    new Uint8Array(
      await readFile("docs/kling-side-expansion/assets/male-shirt.garment.zip"),
    ),
  );
  expect(guide["registration.json"]).toEqual(
    new Uint8Array(
      await readFile(
        "artwork/kling-side-expansion/templates/male.registration.json",
      ),
    ),
  );
  await side(page)
    .getByTestId("fitting-template-result")
    .getByRole("button", { name: "跑步 / 44", exact: true })
    .click();
  await expect(side(page).getByTestId("fitting-frame")).toContainText(
    "姿势 44",
  );
  await expect(side(page).getByTestId("side-stage")).toHaveAttribute(
    "data-frame",
    "44",
  );
  const selected = await download(page, () =>
    side(page).getByTestId("side-export-png").click(),
  );
  expect(selected).not.toEqual(before);
  const decoded = decodeSourceRgbaPng(selected);
  // Display comparison must use the same Canvas premultiplied-alpha storage.
  // Raw exported RGBA intentionally retains invisible RGB at alpha zero.
  const exportedDisplay = await page.evaluate(
    ({ width, height, rgba }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas
        .getContext("2d")!
        .putImageData(
          new ImageData(new Uint8ClampedArray(rgba), width, height),
          0,
          0,
        );
      return canvas.toDataURL();
    },
    {
      width: decoded.width,
      height: decoded.height,
      rgba: Array.from(decoded.pixels),
    },
  );
  expect(await pixels(page, "fitting-current")).toBe(exportedDisplay);
  await ready(page);
  await side(page)
    .getByTestId("fitting-template-panel")
    .screenshot({ path: `${evidence}/male-template-reuse.png` });
  await open(page, "female");
  await side(page)
    .getByTestId("fitting-template-panel")
    .locator("summary")
    .click();
  const femaleBefore = await pixels(page, "fitting-current");
  await side(page).getByTestId("fitting-template-input").setInputFiles({
    name: "male-template.json",
    mimeType: "application/json",
    buffer: reference,
  });
  await expect(
    side(page).getByTestId("side-fitting").getByRole("alert"),
  ).toContainText("模板属于不同原图或锚点版本");
  await expect(side(page).getByTestId("fitting-template-result")).toHaveCount(
    0,
  );
  expect(await pixels(page, "fitting-current")).toEqual(femaleBefore);
});
