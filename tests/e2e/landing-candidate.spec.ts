import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

const side = (page: Page) =>
  page.locator('[data-testid="side-session"][data-active="true"]');
const stage = (page: Page) => side(page).getByTestId("side-stage");

async function ready(page: Page) {
  await expect(side(page).getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await expect(side(page).getByRole("alert")).toHaveCount(0);
}

async function download(page: Page, id: string) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await side(page).getByTestId(id).click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  const path = (await result.path())!;
  await ready(page);
  return {
    path,
    bytes: await readFile(path),
    name: result.suggestedFilename(),
  };
}

test("male landing candidate: three looks, controller flow, paused landing reopen and GIF", async ({
  page,
}) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    "/workbench.html?character=male&mode=side-view&collection=landing-candidate",
  );
  await ready(page);
  await expect(stage(page)).toHaveAttribute(
    "data-collection",
    "landing-candidate",
  );
  await expect(side(page).getByTestId("side-candidate-notice")).toContainText(
    "待美术验收",
  );
  await expect(side(page).getByTestId("side-look-original")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(side(page).getByTestId("side-hair")).toHaveValue("");
  await side(page).getByTestId("side-play-pause").click();
  for (const look of ["daily", "wedding", "original", "wedding"]) {
    await side(page).getByTestId(`side-look-${look}`).click();
    await ready(page);
    await expect(side(page).getByTestId(`side-look-${look}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  const selection = await stage(page).getAttribute("data-selection");

  await side(page).getByTestId("side-preview-run-jump").click();
  await expect(stage(page)).toHaveAttribute("data-flow", "run-jump-run");
  const observed = await stage(page).evaluate(async (canvas) => {
    const frames: Array<{ action: string; frame: number }> = [];
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const sample = () => {
        frames.push({
          action: canvas.dataset.action ?? "",
          frame: Number(canvas.dataset.frame),
        });
        if (
          (performance.now() - started > 300 &&
            canvas.dataset.paused === "true") ||
          performance.now() - started > 12_000
        )
          resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return frames;
  });
  expect(observed.some((frame) => frame.action === "jump")).toBe(true);
  await expect(stage(page)).toHaveAttribute("data-action", "run");
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
  // The real controller reaches the initial run phase after the final native
  // Run56 pose, matching the export's last-to-first replay boundary.
  await expect(stage(page)).toHaveAttribute("data-frame-id", "39");
  await expect(side(page).getByTestId("side-status")).toContainText("预览完成");

  for (const frame of [107, 108]) {
    await side(page).getByTestId(`side-inspect-landing-${frame}`).click();
    await expect(stage(page)).toHaveAttribute("data-frame-id", String(frame));
    await expect(stage(page)).toHaveAttribute("data-phase", "landing-recovery");
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    const saved = await download(page, "side-save-project");
    const document = JSON.parse(
      Buffer.from(unzipSync(saved.bytes)["document.json"]).toString(),
    );
    expect(document.preview.playback.state.paused).toBe(true);
    expect(document.preview.playback.state.leadIn.from).toBe("jump");
    await side(page).getByTestId("side-action-idle").click();
    await side(page)
      .getByTestId("side-project-input")
      .setInputFiles(saved.path);
    await ready(page);
    await expect(stage(page)).toHaveAttribute("data-frame-id", String(frame));
    await expect(stage(page)).toHaveAttribute("data-phase", "landing-recovery");
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    await expect(stage(page)).toHaveAttribute("data-selection", selection!);
    await side(page).getByTestId("side-play-pause").click();
    await expect(stage(page)).toHaveAttribute("data-action", "run");
    await expect(stage(page)).toHaveAttribute("data-lead-in", "false");
  }
  const gif = await download(page, "side-export-run-jump-gif");
  expect(gif.name).toContain("landing-candidate-run-jump-run");
  expect(gif.bytes.subarray(0, 6).toString()).toBe("GIF89a");
  expect(gif.bytes.length).toBeGreaterThan(1000);
  // The original action control still chooses one jump, independently of flow review.
  await side(page).getByTestId("side-play-pause").click();
  await side(page).getByTestId("side-action-jump").click();
  await expect(stage(page)).toHaveAttribute("data-action", "jump");
  await expect(stage(page)).toHaveAttribute("data-frame-count", "28");
  await side(page).getByTestId("side-character").selectOption("female");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-character", "female");
  await expect(stage(page)).toHaveAttribute("data-collection", "material");
  await expect(
    side(page)
      .getByTestId("side-collection")
      .locator('option[value="landing-candidate"]'),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the normal workbench keeps its original entry and offers a labeled experiment", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("library-landing-candidate")).toHaveAttribute(
    "href",
    /collection=landing-candidate/,
  );
  await page.goto("/workbench.html?character=male");
  await expect(
    page.getByRole("tab", { name: "Sprite actions" }),
  ).toHaveAttribute("aria-selected", "true");
});
