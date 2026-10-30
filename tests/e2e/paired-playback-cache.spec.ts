import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

// Use actual paired-character assets. Only the animation clock is controlled;
// networking, React scheduling, canvas drawing and Playwright timeouts are real.
test.describe.configure({ mode: "default" });
const output =
  process.env.GATHRIA_PAIRED_PLAYBACK_EVIDENCE ?? "/tmp/paired-playback";
const views = ["original", "side"] as const;
type View = (typeof views)[number];
type ControlledClock = {
  now: number;
  hidden: boolean;
  advance: (milliseconds: number, paint: boolean) => void;
};
type ClockWindow = Window & { pairedPlaybackClock: ControlledClock };
const canvas = (page: Page, view: View) =>
  page.getByTestId(`dual-compare-stage-${view}`);

async function installClock(page: Page) {
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
    (window as unknown as ClockWindow).pairedPlaybackClock = clock;
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
    window.cancelAnimationFrame = (id) => callbacks.delete(id);
  });
}

async function advance(page: Page, milliseconds: number, paint = true) {
  await page.evaluate(
    ({ milliseconds, paint }) =>
      (window as unknown as ClockWindow).pairedPlaybackClock.advance(
        milliseconds,
        paint,
      ),
    { milliseconds, paint },
  );
  // Let queued React commits paint before reading an unchanged-pose assertion.
  // This task yield does not advance the controlled animation clock.
  await page.evaluate(
    () => new Promise<void>((resolve) => window.setTimeout(resolve, 0)),
  );
}

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    (window as unknown as ClockWindow).pairedPlaybackClock.hidden = value;
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function ready(page: Page) {
  await expect(page.getByTestId("dual-wardrobe")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
}

async function expectBoth(page: Page, attribute: string, value: string) {
  for (const view of views)
    await expect(canvas(page, view)).toHaveAttribute(attribute, value);
}

async function painted(page: Page, view: View, path?: string) {
  const result = await canvas(page, view).evaluate((node) => {
    const target = node as HTMLCanvasElement;
    return {
      action: target.dataset.action,
      position: Number(target.dataset.framePosition),
      frameId: Number(target.dataset.frameId),
      elapsedMs: Number(target.dataset.elapsedMs),
      pending: target.dataset.pendingAction,
      returnAction: target.dataset.returnAction,
      paused: target.dataset.paused,
      width: target.width,
      height: target.height,
      dataUrl: target.toDataURL("image/png"),
    };
  });
  const { dataUrl, ...state } = result;
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  if (path) await writeFile(path, png);
  return {
    ...state,
    canvasPngSha256: createHash("sha256").update(png).digest("hex"),
  };
}

async function snapshot(page: Page, directory?: string) {
  const original = await painted(
    page,
    "original",
    directory ? `${directory}/original-airborne.png` : undefined,
  );
  const side = await painted(
    page,
    "side",
    directory ? `${directory}/side-airborne.png` : undefined,
  );
  return { original, side };
}

async function backgroundWithoutRaf(page: Page) {
  await setHidden(page, true);
  // Real browsers may suspend RAF immediately. A final hidden callback must
  // not be required to clear the visible-time baseline.
  await advance(page, 5000, false);
  await setHidden(page, false);
  await advance(page, 16);
}

for (const character of ["male", "female"] as const) {
  test(`${character}: paired playback retains airborne frames and return intent across a suspended tab`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const directory = `${output}/${character}`;
    await mkdir(directory, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installClock(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    await page.getByTestId("dual-compare-toggle").click();
    await expectBoth(page, "data-paused", "true");
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue(
      "single-jump",
    );

    // Start both native run clips at frame0, then request exactly one jump.
    // The two views enter Jump on their own reviewed clocks.
    await page.getByTestId("dual-compare-action").selectOption("run");
    await page.getByTestId("dual-jump-once").click();
    await advance(page, 0);
    await advance(page, 700);
    await expectBoth(page, "data-action", "jump");
    await expectBoth(page, "data-return-action", "run");
    const airborne = await snapshot(page, directory);
    expect(airborne.original.position).toBe(11);
    expect(airborne.side.position).toBe(character === "male" ? 7 : 10);

    await backgroundWithoutRaf(page);
    await expectBoth(page, "data-action", "jump");
    const resumed = await snapshot(page);
    expect(resumed).toEqual(airborne);

    // Repeat input must not restart the retained jump or queue a second one.
    await page.getByTestId("dual-jump-once").click();
    expect(await snapshot(page)).toEqual(airborne);
    await advance(page, 50);
    for (const view of views)
      await expect
        .poll(async () =>
          Number(await canvas(page, view).getAttribute("data-frame-position")),
        )
        .toBeGreaterThan(airborne[view].position);
    const progressed = await snapshot(page);
    for (const view of views) {
      expect(progressed[view].action).toBe("jump");
      expect(progressed[view].returnAction).toBe("run");
      expect(progressed[view].elapsedMs).toBeCloseTo(
        airborne[view].elapsedMs + 50,
        5,
      );
      expect(progressed[view].position).toBeGreaterThan(
        airborne[view].position,
      );
    }
    await advance(page, 2000);
    await expectBoth(page, "data-action", "run");
    await advance(page, 2000);
    await expectBoth(page, "data-action", "run");

    // A paused final Jump drawing must retain its full source tick on resume.
    await page.getByTestId("dual-compare-play-all").click();
    await expectBoth(page, "data-paused", "true");
    await page.getByTestId("dual-compare-action").selectOption("jump");
    for (const view of views)
      await page
        .getByTestId(`dual-compare-frame-${view}`)
        .fill(view === "original" ? "38" : "27");
    const finalJump = await snapshot(page);
    await advance(page, 5000);
    expect(await snapshot(page)).toEqual(finalJump);
    await page.getByTestId("dual-compare-play-all").click();
    await advance(page, 0);
    await advance(page, 20);
    await expectBoth(page, "data-action", "jump");
    const retainedLastPose = await snapshot(page);
    for (const view of views) {
      expect(retainedLastPose[view].frameId).toBe(finalJump[view].frameId);
      expect(retainedLastPose[view].canvasPngSha256).toBe(
        finalJump[view].canvasPngSha256,
      );
    }
    await advance(page, 30);
    await expectBoth(page, "data-action", "idle");

    // Also protect the historical source-mode clock. Its 50-frame side Jump
    // and native playback remain independent of the gameplay controller.
    let sourceResume = null;
    if (character === "male") {
      await page.getByTestId("dual-motion-mode").selectOption("source");
      await ready(page);
      await page.getByTestId("dual-compare-action").selectOption("run");
      await page.getByTestId("dual-compare-play-all").click();
      await advance(page, 0);
      await advance(page, 125);
      await expectBoth(page, "data-frame-position", "3");
      const before = await snapshot(page);
      await backgroundWithoutRaf(page);
      const after = await snapshot(page);
      expect(after).toEqual(before);
      await advance(page, 50);
      await expectBoth(page, "data-frame-position", "4");
      const next = await snapshot(page);
      for (const view of views)
        expect(next[view].elapsedMs).toBeCloseTo(
          before[view].elapsedMs + 50,
          5,
        );
      sourceResume = { before, after, next };
    }

    expect(errors).toEqual([]);
    const proof = {
      character,
      actualAssets: true,
      deterministicAppClock: true,
      hiddenMillisecondsIgnored: 5000,
      noHiddenRafRequired: true,
      airborne,
      resumed,
      progressed,
      repeatedJumpIgnored: true,
      continuedRunningWithoutReplay: true,
      pausedFinalJumpFrameRetained: true,
      finalJump,
      sourceResume,
      pageErrors: errors,
      realDeviceFramePacingMeasured: false,
    };
    const body = JSON.stringify(proof, null, 2) + "\n";
    await writeFile(`${directory}/visibility-playback.json`, body);
    await testInfo.attach(`${character}-paired-playback`, {
      contentType: "application/json",
      body,
    });
  });
}
