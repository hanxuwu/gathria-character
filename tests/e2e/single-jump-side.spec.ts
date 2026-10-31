import { expect, test } from "@playwright/test";

for (const character of ["male", "female"] as const) {
  test(`${character}: basic jump once, resume movement, and retain full-source review`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `/workbench.html?mode=side-view&collection=tailored&character=${character}`,
    );
    await expect(page.getByTestId("side-playground")).toHaveAttribute(
      "aria-busy",
      "false",
      { timeout: 90_000 },
    );
    const stage = page.getByTestId("side-stage");
    await expect(page.getByTestId("side-playback-mode")).toHaveValue(
      "single-jump",
    );
    await expect(stage).toHaveAttribute("data-playback-mode", "single-jump");
    await page.getByTestId("side-mode-travel").click();
    await stage.focus();
    await page.keyboard.down("ArrowRight");
    await page.keyboard.down("Shift");
    await expect(stage).toHaveAttribute("data-action", "run");
    await page.keyboard.down("Space");
    await expect(stage).toHaveAttribute("data-action", "jump");
    await expect(stage).toHaveAttribute("data-frame-count", "28");
    await expect(stage).toHaveAttribute("data-pending", "run");
    await page.keyboard.down("ArrowLeft");
    await expect(stage).toHaveAttribute("data-facing", "right");
    await stage.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          repeat: true,
          bubbles: true,
        }),
      ),
    );
    await expect(stage).toHaveAttribute("data-action", "run", {
      timeout: 4000,
    });
    await expect(stage).toHaveAttribute("data-facing", "left");
    // Space remains physically held beyond the next full jump duration.
    // Autorepeat must not trigger another takeoff after landing.
    const actions = await stage.evaluate(async (canvas) => {
      const observed: string[] = [];
      const started = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          observed.push(canvas.dataset.action ?? "");
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              code: "Space",
              repeat: true,
              bubbles: true,
            }),
          );
          if (performance.now() - started >= 1400) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return observed;
    });
    expect(actions.length).toBeGreaterThan(2);
    expect(new Set(actions)).toEqual(new Set(["run"]));
    await page.keyboard.up("Space");
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.press("Space");
    await expect(stage).toHaveAttribute("data-action", "jump");
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("Shift");
    await expect(stage).toHaveAttribute("data-pending", "idle");
    await expect(stage).toHaveAttribute("data-action", "idle", {
      timeout: 4000,
    });
    const stopped = await stage.getAttribute("data-position");
    await page.waitForTimeout(180);
    expect(await stage.getAttribute("data-position")).toBe(stopped);
    await expect(stage).toHaveAttribute("data-fps", "24");
    await expect(stage).toHaveAttribute("data-timing", "native-1x");

    await page.getByTestId("side-playback-mode").selectOption("source");
    await expect(stage).toHaveAttribute("data-playback-mode", "source");
    await page.getByTestId("side-play-pause").click();
    await page.getByTestId("side-action-jump").click();
    await expect(stage).toHaveAttribute("data-action", "jump");
    await expect(stage).toHaveAttribute("data-frame-count", "50");
    await page.getByTestId("side-frame").fill("49");
    await expect(stage).toHaveAttribute(
      "data-frame-id",
      character === "male" ? "106" : "101",
    );
    await page.getByTestId("side-playback-mode").selectOption("single-jump");
    await page.getByTestId("side-action-jump").click();
    await expect(stage).toHaveAttribute("data-frame-count", "28");
    await expect(stage).toHaveAttribute(
      "data-frame-id",
      character === "male" ? "63" : "58",
    );
    expect(errors).toEqual([]);
  });
}
