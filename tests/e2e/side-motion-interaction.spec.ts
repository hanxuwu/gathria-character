import { expect, test } from "@playwright/test";

for (const character of ["male", "female"]) {
  test(`${character}: airborne reversal, released keys and repeated jump input retain source sequencing`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `/workbench.html?mode=side-view&collection=tailored&character=${character}`,
    );
    const stage = page.getByTestId("side-stage");
    await expect(page.getByTestId("side-playground")).toHaveAttribute(
      "aria-busy",
      "false",
      { timeout: 90_000 },
    );
    await page.getByTestId("side-playback-mode").selectOption("source");
    await page.getByTestId("side-mode-travel").click();
    await stage.focus();
    await page.keyboard.down("ArrowRight");
    await expect(stage).toHaveAttribute("data-action", "walk");
    await page.keyboard.down("Shift");
    await expect(stage).toHaveAttribute("data-action", "run");
    await page.keyboard.press("Space");
    await expect(stage).toHaveAttribute("data-action", "jump");
    await expect(stage).toHaveAttribute("data-facing", "right");
    await page.keyboard.down("ArrowLeft");
    // Repeated/held jump input cannot restart the ongoing two-jump clip or
    // cancel the newest locomotion intent. Direction changes wait for landing.
    await page.keyboard.down("Space");
    await stage.evaluate((canvas) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          repeat: true,
          bubbles: true,
        }),
      );
      canvas.dataset.testStartPosition = canvas.dataset.position;
    });
    await expect(stage).toHaveAttribute("data-pending", "run");
    await expect(stage).toHaveAttribute("data-facing", "right");
    await expect(stage).toHaveAttribute("data-action", "run", {
      timeout: 6_000,
    });
    await expect(stage).toHaveAttribute("data-facing", "left");
    await page.keyboard.up("Space");
    await page.keyboard.up("ArrowLeft");
    await expect(stage).toHaveAttribute("data-facing", "right");
    await page.keyboard.press("Space");
    await expect(stage).toHaveAttribute("data-action", "jump");
    await page.keyboard.up("ArrowRight");
    await page.keyboard.up("Shift");
    await expect(stage).toHaveAttribute("data-pending", "idle");
    await expect(stage).toHaveAttribute("data-action", "idle", {
      timeout: 6_000,
    });
    const stopped = await stage.getAttribute("data-position");
    await page.waitForTimeout(180);
    expect(await stage.getAttribute("data-position")).toBe(stopped);
    await expect(stage).toHaveAttribute("data-fps", "24");
    await expect(stage).toHaveAttribute("data-timing", "native-1x");
    await stage.focus();
    await page.keyboard.down("ArrowRight");
    await expect(stage).toHaveAttribute("data-action", "walk");
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(stage).toHaveAttribute("data-action", "idle");
    await page.keyboard.up("ArrowRight");
    expect(errors).toEqual([]);
  });
}
