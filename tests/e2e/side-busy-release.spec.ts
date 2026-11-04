import { expect, test } from "@playwright/test";

test("releasing movement during a landing save updates live intent without changing button-driven playback", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    "/workbench.html?mode=side-view&collection=tailored&character=male",
  );
  const stage = page.getByTestId("side-stage");
  const playground = page.getByTestId("side-playground");
  await expect(playground).toHaveAttribute("aria-busy", "false", {
    timeout: 90_000,
  });
  await page.getByTestId("side-mode-travel").click();
  await stage.focus();
  await page.keyboard.down("ArrowRight");
  await page.keyboard.down("Shift");
  await expect(stage).toHaveAttribute("data-action", "run");
  await page.keyboard.press("Space");
  await expect(stage).toHaveAttribute("data-action", "jump");
  const saving = page.waitForEvent("download");
  const savedFrame = await stage.evaluate(async (canvas) => {
    const start = performance.now();
    return new Promise<number>((resolve, reject) => {
      const check = () => {
        const frame = Number(canvas.dataset.frameId);
        if (canvas.dataset.action === "jump" && frame >= 80 && frame <= 85) {
          // Save sets its busy ref synchronously before awaiting ZIP creation.
          // Releasing in this same event turn deterministically hits the busy
          // path, before preparation can resume the controller's clock.
          document
            .querySelector<HTMLButtonElement>(
              '[data-testid="side-save-project"]',
            )!
            .click();
          for (const code of ["ArrowRight", "ShiftLeft"])
            window.dispatchEvent(
              new KeyboardEvent("keyup", { code, bubbles: true }),
            );
          resolve(frame);
        } else if (performance.now() - start > 5000)
          reject(new Error("Did not reach the landing approach."));
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  });
  expect(savedFrame).toBeGreaterThanOrEqual(80);
  expect(await (await saving).failure()).toBeNull();
  await expect(playground).toHaveAttribute("aria-busy", "false");
  await expect(stage).toHaveAttribute("data-action", "idle", { timeout: 4000 });
  const stopped = await stage.getAttribute("data-position");
  await page.waitForTimeout(180);
  expect(await stage.getAttribute("data-position")).toBe(stopped);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("Shift");

  // No keyboard changes means busy completion must not inject an idle request
  // into playback selected with a button or a scripted review.
  await page.getByTestId("side-action-run").click();
  await expect(stage).toHaveAttribute("data-action", "run");
  const secondSave = page.waitForEvent("download");
  await page.getByTestId("side-save-project").click();
  expect(await (await secondSave).failure()).toBeNull();
  await expect(playground).toHaveAttribute("aria-busy", "false");
  const actions = await stage.evaluate(async (canvas) => {
    const observed: string[] = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const sample = () => {
        observed.push(canvas.dataset.action ?? "");
        if (performance.now() - start >= 900) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return observed;
  });
  expect(new Set(actions)).toEqual(new Set(["run"]));
  expect(errors).toEqual([]);
});
