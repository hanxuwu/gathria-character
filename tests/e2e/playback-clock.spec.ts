import { expect, test, type Page } from "@playwright/test";

type ControlledClock = {
  now: number;
  hidden: boolean;
  advance: (milliseconds: number, paint: boolean) => void;
};
type ClockWindow = Window & { playerTestClock: ControlledClock };

async function advance(page: Page, milliseconds: number, paint = true) {
  await page.evaluate(
    ({ milliseconds, paint }) =>
      (window as unknown as ClockWindow).playerTestClock.advance(
        milliseconds,
        paint,
      ),
    { milliseconds, paint },
  );
}

async function elapsed(page: Page, milliseconds: number) {
  await expect
    .poll(async () =>
      Number(
        await page
          .getByTestId("consumer-canvas")
          .getAttribute("data-elapsed-ms"),
      ),
    )
    .toBeCloseTo(milliseconds, 5);
}

test("independent player retains redraw time and excludes paused/background time", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Drive only the application's clock. Browser networking, React tasks and
  // Playwright timeouts stay real. This is deterministic lifecycle coverage,
  // not a measurement of real device frame pacing or OS background throttling.
  await page.addInitScript(() => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    const clock: ControlledClock = {
      now: 1000,
      hidden: false,
      advance(milliseconds, paint) {
        this.now += milliseconds;
        if (!paint) return;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback(this.now);
      },
    };
    (window as unknown as ClockWindow).playerTestClock = clock;
    Object.defineProperty(performance, "now", { value: () => clock.now });
    Object.defineProperty(document, "hidden", { get: () => clock.hidden });
    Object.defineProperty(document, "visibilityState", {
      get: () => (clock.hidden ? "hidden" : "visible"),
    });
    window.requestAnimationFrame = (callback) => {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      callbacks.delete(id);
    };
  });
  await page.goto("/player.html");
  await page
    .locator("#player-zip")
    .setInputFiles("docs/kling-playback/exports/male.character.zip");
  await expect(page.locator(".player-status")).toContainText("Loaded:", {
    timeout: 90_000,
  });
  const canvas = page.getByTestId("consumer-canvas");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-action", "run");
  await elapsed(page, 0);
  await advance(page, 25);
  await elapsed(page, 25);

  // Facing changes rebuild the same drawing effect used by an automatic
  // landing→run action update. The 6 ms before the redraw must not disappear.
  await advance(page, 6, false);
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await elapsed(page, 31);
  await advance(page, 11);
  await elapsed(page, 42);
  await expect(canvas).toHaveAttribute("data-frame-position", "1");

  await page.getByRole("button", { name: "Pause animation" }).click();
  await advance(page, 5000);
  await elapsed(page, 42);
  await page.getByRole("button", { name: "Play animation" }).click();
  await elapsed(page, 42);
  await advance(page, 16);
  await elapsed(page, 58);

  // Simulate the case where the tab disappears without a final hidden RAF.
  // Visibility events must clear the baseline before the resumed callback.
  await page.evaluate(() => {
    (window as unknown as ClockWindow).playerTestClock.hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await advance(page, 5000, false);
  await page.evaluate(() => {
    (window as unknown as ClockWindow).playerTestClock.hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await advance(page, 16);
  await elapsed(page, 58);
  await advance(page, 16);
  await elapsed(page, 74);

  // A rate change resets the sample, then applies the new rate exactly once.
  await advance(page, 100, false);
  await page.getByLabel("Playback speed", { exact: true }).selectOption("2");
  await elapsed(page, 74);
  await advance(page, 20);
  await elapsed(page, 114);
  await page.getByRole("button", { name: "Walk", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-action", "walk");
  await elapsed(page, 0);
  await advance(page, 20);
  await elapsed(page, 40);
  expect(errors).toEqual([]);
  await testInfo.attach("controlled-player-clock", {
    contentType: "application/json",
    body: JSON.stringify({
      fixture: "docs/kling-playback/exports/male.character.zip",
      deterministicClock: true,
      redrawPreservedMs: 6,
      pausedMsIgnored: 5000,
      suspendedMsIgnored: 5000,
      speedAppliedOnce: true,
      immediateActionReset: true,
      realDeviceJankMeasured: false,
    }),
  });
});
