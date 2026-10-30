import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "parallel" });
const output =
  process.env.GATHRIA_REVIEW_EXPORT_ROOT ?? "/tmp/paired-polish/exports";
const views = ["original", "side"] as const;
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const comparison = (page: Page, view: string) =>
  page.getByTestId(`dual-compare-stage-${view}`);
async function ready(page: Page) {
  await expect(page.getByTestId("dual-wardrobe")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
}
async function pause(page: Page, view: string) {
  if ((await comparison(page, view).getAttribute("data-paused")) === "false")
    await page.getByTestId(`dual-compare-play-${view}`).click();
  await expect(comparison(page, view)).toHaveAttribute("data-paused", "true");
}
async function png(page: Page, path: string) {
  const pending = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("dual-export-png").click();
  const result = await pending;
  expect(await result.failure()).toBeNull();
  await result.saveAs(path);
  await ready(page);
  return readFile(path);
}

for (const character of ["male", "female"] as const) {
  test(`${character}: equal-height comparison retains independent clocks and native exports`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const dir = `${output}/${character}-comparison`;
    await mkdir(dir, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    // This regression retains the published source clocks and byte-exact exports.
    await page.getByTestId("dual-motion-mode").selectOption("source");
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue("source");
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("polished-day");

    const before: Record<string, Buffer> = {};
    for (const view of views) {
      await page
        .getByTestId("workbench-source")
        .selectOption(view === "side" ? "side-view" : "original");
      await ready(page);
      const stage = page.getByTestId("dual-stage");
      if ((await stage.getAttribute("data-paused")) === "false")
        await page.getByTestId("dual-play-pause").click();
      await page.getByTestId("dual-action").selectOption("run");
      await page.getByTestId("dual-frame").fill("0");
      await page.getByTestId("dual-frame").fill("3");
      await page.getByTestId("dual-facing").selectOption("right");
      before[view] = await png(page, `${dir}/${view}-single.png`);
    }

    await page.getByTestId("dual-compare-toggle").click();
    await expect(page.getByTestId("dual-compare-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const transforms: Record<string, Record<string, string | null>> = {};
    for (const view of views) {
      const canvas = comparison(page, view);
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveAttribute("data-frame-position", "3");
      await expect(canvas).toHaveAttribute("data-display-body-height", "460");
      await pause(page, view);
      transforms[view] = Object.fromEntries(
        await Promise.all(
          [
            "data-display-scale",
            "data-display-baseline",
            "width",
            "height",
          ].map(async (key) => [key, await canvas.getAttribute(key)]),
        ),
      );
      await page.getByTestId("dual-export-view").selectOption(view);
      expect(sha(await png(page, `${dir}/${view}-comparison.png`))).toBe(
        sha(before[view]),
      );
    }
    expect(transforms.original.width).toBe(transforms.side.width);
    expect(transforms.original.height).toBe(transforms.side.height);
    expect(transforms.original["data-display-baseline"]).toBe(
      transforms.side["data-display-baseline"],
    );
    expect(Number(transforms.original["data-display-scale"])).toBeLessThan(
      Number(transforms.side["data-display-scale"]),
    );

    // A frame step affects only its own native clip. Its display transform is fixed.
    await page.getByTestId("dual-compare-next-side").click();
    await expect(comparison(page, "side")).toHaveAttribute(
      "data-frame-position",
      "4",
    );
    await expect(comparison(page, "original")).toHaveAttribute(
      "data-frame-position",
      "3",
    );
    await page.getByTestId("dual-compare-previous-side").click();
    await expect(comparison(page, "side")).toHaveAttribute(
      "data-frame-position",
      "3",
    );
    await page.getByTestId("dual-compare-play-side").click();
    await expect
      .poll(() => comparison(page, "side").getAttribute("data-frame-position"))
      .not.toBe("3");
    await expect(comparison(page, "original")).toHaveAttribute(
      "data-frame-position",
      "3",
    );
    await page.getByTestId("dual-compare-play-all").click();
    for (const view of views)
      await expect(comparison(page, view)).toHaveAttribute(
        "data-paused",
        "true",
      );

    await page.getByTestId("dual-compare-action").selectOption("jump");
    for (const view of views) {
      await expect(comparison(page, view)).toHaveAttribute(
        "data-action",
        "jump",
      );
      for (const [key, value] of Object.entries(transforms[view]))
        await expect(comparison(page, view)).toHaveAttribute(key, value!);
    }
    await page.getByTestId("dual-compare-facing").selectOption("left");
    for (const view of views)
      await expect(comparison(page, view)).toHaveAttribute(
        "data-facing",
        "left",
      );
    await expect(
      page
        .getByTestId("dual-compare-action-side")
        .locator('option[value="celebrate"]'),
    ).toHaveJSProperty("disabled", true);
    await page
      .getByTestId("dual-compare-action-original")
      .selectOption("celebrate");
    await expect(comparison(page, "original")).toHaveAttribute(
      "data-action",
      "celebrate",
    );
    await expect(comparison(page, "side")).toHaveAttribute(
      "data-action",
      "jump",
    );
    await page.screenshot({ path: `${dir}/desktop.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    for (const view of views)
      await expect(comparison(page, view)).toBeVisible();
    const originalBounds = await comparison(page, "original").boundingBox();
    const sideBounds = await comparison(page, "side").boundingBox();
    expect(sideBounds!.y).toBeGreaterThan(
      originalBounds!.y + originalBounds!.height,
    );
    await page.screenshot({ path: `${dir}/mobile.png`, fullPage: true });
    await page.getByTestId("dual-compare-toggle").click();
    await expect(page.getByTestId("dual-stage")).toHaveAttribute(
      "data-action",
      "jump",
    );
    expect(errors).toEqual([]);
    await writeFile(
      `${dir}/comparison.json`,
      JSON.stringify(
        {
          character,
          transforms,
          nativeExportSha256: Object.fromEntries(
            views.map((v) => [v, sha(before[v])]),
          ),
          nativeExportsByteExactAcrossComparisonToggle: true,
          nativeClocksIndependent: true,
          frameStepAffectsOnlyChosenView: true,
          fixedTransformsAcrossActions: true,
          originalCelebrateDoesNotInventSideAction: true,
          partialPlaybackGlobalPauseStopsBoth: true,
          mobileWidth: 390,
          pageErrors: errors,
        },
        null,
        2,
      ) + "\n",
    );
  });
}
