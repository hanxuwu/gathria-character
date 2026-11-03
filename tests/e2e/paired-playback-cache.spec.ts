import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

// Use actual paired-character assets. Only the animation clock is controlled;
// networking, React scheduling, canvas drawing and Playwright timeouts are real.
test.describe.configure({ mode: "default" });
const output =
  process.env.GATHRIA_PAIRED_PLAYBACK_EVIDENCE ?? "/tmp/paired-playback";
const TICK = 1000 / 24;
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
      leadIn: target.dataset.leadIn,
      leadInElapsedMs: Number(target.dataset.leadInElapsedMs ?? 0),
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

async function pauseBoth(page: Page) {
  const paused = await Promise.all(
    views.map((view) => canvas(page, view).getAttribute("data-paused")),
  );
  if (paused.some((value) => value === "false"))
    await page.getByTestId("dual-compare-play-all").click();
  await expectBoth(page, "data-paused", "true");
}

async function checkRunningApproaches(
  page: Page,
  character: "male" | "female",
  directory: string,
) {
  // Native IDs were reviewed from source artwork, independently of controller
  // frame resolution. Step each real canvas drawing, including the one-frame
  // route that an unpaced CI browser could otherwise skip in its observer.
  const routes =
    character === "male"
      ? [
          { exit: 4, frames: [60, 61, 62] },
          { exit: 10, frames: [59, 60, 61, 62] },
          { exit: 16, frames: [62] },
        ]
      : [
          { exit: 1, frames: [55, 56, 57] },
          { exit: 7, frames: [54, 55, 56, 57] },
          { exit: 13, frames: [57] },
        ];
  const results: Array<Record<string, unknown>> = [];
  for (const [index, route] of routes.entries()) {
    // During playback action selection queues a transition. Pause explicitly
    // before selecting a fresh inspected pose; re-selecting Run alone cannot
    // reset either its clock or its playing state.
    await pauseBoth(page);
    await page.getByTestId("dual-compare-action").selectOption("idle");
    await page.getByTestId("dual-compare-action").selectOption("run");
    await page
      .getByTestId("dual-compare-frame-side")
      .fill(String(route.exit - 1));
    await page.getByTestId("dual-jump-once").click();
    await advance(page, 0);
    await advance(page, TICK);
    const first = await painted(page, "side");
    expect(first.action).toBe("jump");
    expect(first.frameId).toBe(route.frames[0]);
    expect(first.position).toBe(0);
    expect(first.elapsedMs).toBe(0);
    expect(first.leadIn).toBe("true");
    expect(first.leadInElapsedMs).toBeCloseTo(0, 6);
    const target = index === 1 ? "idle" : "run";
    await page.getByTestId(`dual-${target}`).click();
    await expect(canvas(page, "side")).toHaveAttribute(
      "data-pending-action",
      target,
    );
    const queued = await painted(page, "side");
    await page.getByTestId("dual-jump-once").click();
    expect(await painted(page, "side")).toEqual(queued);

    let restored = null;
    if (index === 1) {
      // Save an actual approach drawing at a fractional clock. The paired
      // checkpoint must reopen that exact image and pending landing intent.
      await advance(page, 10);
      await page.getByTestId("dual-compare-play-all").click();
      await expectBoth(page, "data-paused", "true");
      const beforeSave = await painted(
        page,
        "side",
        `${directory}/side-approach-checkpoint.png`,
      );
      const pending = page.waitForEvent("download", { timeout: 180_000 });
      await page.getByTestId("dual-save-project").click();
      const download = await pending;
      expect(await download.failure()).toBeNull();
      const path = `${directory}/approach-project.zip`;
      await download.saveAs(path);
      const bytes = await readFile(path);
      const receipt = {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        filename: download.suggestedFilename(),
      };
      await ready(page);
      await page.getByTestId("dual-compare-action").selectOption("idle");
      await page.getByTestId("dual-project-input").setInputFiles(path);
      await ready(page);
      await expectBoth(page, "data-paused", "true");
      const reopened = await painted(page, "side");
      expect(reopened).toEqual(beforeSave);
      await rm(path);
      await page.getByTestId("dual-compare-play-all").click();
      await advance(page, 0);
      await backgroundWithoutRaf(page);
      const resumed = await painted(page, "side");
      expect(resumed).toEqual({ ...beforeSave, paused: "false" });
      restored = { beforeSave, reopened, resumed, download: receipt };
      await advance(page, TICK - 10);
    } else {
      await backgroundWithoutRaf(page);
      expect(await painted(page, "side")).toEqual(queued);
      await advance(page, TICK);
    }
    const shown = [first];
    for (let i = 1; i < route.frames.length; i++) {
      const drawing = await painted(page, "side");
      expect(drawing.frameId).toBe(route.frames[i]);
      expect(drawing.position).toBe(0);
      expect(drawing.elapsedMs).toBe(0);
      expect(drawing.leadIn).toBe("true");
      expect(drawing.leadInElapsedMs).toBeCloseTo(i * TICK, 6);
      shown.push(drawing);
      await advance(page, TICK);
    }
    const baseJump = await painted(page, "side");
    expect(baseJump.action).toBe("jump");
    expect(baseJump.frameId).toBe(character === "male" ? 63 : 58);
    expect(baseJump.elapsedMs).toBeCloseTo(0, 6);
    expect(baseJump.leadIn).toBe("false");
    expect(baseJump.pending).toBe(target);
    expect(baseJump.returnAction).toBe(target);
    await advance(page, (target === "idle" ? 28 : 25) * TICK);
    await expect(canvas(page, "side")).toHaveAttribute("data-action", target);
    await advance(page, 2000);
    await expect(canvas(page, "side")).toHaveAttribute("data-action", target);
    results.push({
      ...route,
      first,
      queued,
      shown,
      baseJump,
      restored,
      returnAction: target,
    });
  }
  await pauseBoth(page);
  await page.getByTestId("dual-compare-action").selectOption("idle");
  await page.getByTestId("dual-compare-action").selectOption("run");
  await expectBoth(page, "data-paused", "true");
  return results;
}

async function checkLandingRecovery(
  page: Page,
  character: "male" | "female",
  directory: string,
) {
  const frames = character === "male" ? [88, 89] : [83, 84];
  const entry = character === "male" ? 10 : 7;
  await pauseBoth(page);
  await page.getByTestId("dual-compare-action").selectOption("jump");
  await page.getByTestId("dual-compare-frame-side").fill("22");
  await page.getByTestId("dual-run").click();
  await advance(page, 0);
  await advance(page, TICK);
  const first = await painted(page, "side");
  expect(first.action).toBe("run");
  expect(first.position).toBe(entry);
  expect(first.frameId).toBe(frames[0]);
  expect(first.leadIn).toBe("true");
  expect(first.elapsedMs).toBeCloseTo(entry * TICK, 6);
  expect(first.leadInElapsedMs).toBeCloseTo(0, 6);
  await expect(
    page.getByTestId("dual-compare-stage-side").locator("../.."),
  ).toContainText("落地接跑步");
  // Recovery belongs to this single jump. Repeat input must not schedule a
  // second jump just because its target action is already labelled Run.
  await page.getByTestId("dual-jump-once").click();
  expect(await painted(page, "side")).toEqual(first);
  await advance(page, 10);
  await pauseBoth(page);
  const checkpoint = await painted(
    page,
    "side",
    `${directory}/side-landing-checkpoint.png`,
  );
  expect(checkpoint.leadInElapsedMs).toBeCloseTo(10, 6);
  const reopenCheckpoint = async (name: string) => {
    const expected = await painted(page, "side");
    const downloading = page.waitForEvent("download", { timeout: 180_000 });
    await page.getByTestId("dual-save-project").click();
    const download = await downloading;
    expect(await download.failure()).toBeNull();
    const path = `${directory}/${name}.zip`;
    await download.saveAs(path);
    const bytes = await readFile(path);
    const receipt = {
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      filename: download.suggestedFilename(),
    };
    await ready(page);
    await page.getByTestId("dual-compare-action").selectOption("idle");
    await page.getByTestId("dual-project-input").setInputFiles(path);
    await ready(page);
    await expectBoth(page, "data-paused", "true");
    const reopened = await painted(page, "side");
    expect(reopened).toEqual(expected);
    await rm(path);
    return { reopened, receipt };
  };
  const { reopened, receipt } = await reopenCheckpoint("landing-project");
  await page.getByTestId("dual-compare-play-all").click();
  await advance(page, 0);
  await backgroundWithoutRaf(page);
  expect(await painted(page, "side")).toEqual({
    ...checkpoint,
    paused: "false",
  });
  await advance(page, TICK - 10);
  const second = await painted(
    page,
    "side",
    `${directory}/side-landing-second.png`,
  );
  expect(second.frameId).toBe(frames[1]);
  expect(second.leadIn).toBe("true");
  expect(second.elapsedMs).toBeCloseTo(entry * TICK, 6);
  expect(second.leadInElapsedMs).toBeCloseTo(TICK, 6);
  await page.getByTestId("dual-jump-once").click();
  expect(await painted(page, "side")).toEqual(second);
  // Both recovery drawings are real checkpointable states. Preserve the second
  // native image and its fractional elapsed time, not just the first drawing.
  await advance(page, 10);
  await pauseBoth(page);
  const secondCheckpoint = await painted(page, "side");
  expect(secondCheckpoint.frameId).toBe(frames[1]);
  expect(secondCheckpoint.leadInElapsedMs).toBeCloseTo(TICK + 10, 6);
  const secondRestore = await reopenCheckpoint("landing-second-project");
  await page.getByTestId("dual-compare-play-all").click();
  await advance(page, 0);
  await advance(page, TICK - 10);
  const running = await painted(
    page,
    "side",
    `${directory}/side-resumed-run.png`,
  );
  expect(running.action).toBe("run");
  expect(running.leadIn).toBe("false");
  expect(running.position).toBe(entry);
  expect(running.frameId).toBe(character === "male" ? 49 : 41);
  expect(running.elapsedMs).toBeCloseTo(entry * TICK, 6);
  await advance(page, 18 * TICK);
  expect((await painted(page, "side")).action).toBe("run");
  await pauseBoth(page);
  await page.getByTestId("dual-compare-action").selectOption("idle");
  await page.getByTestId("dual-compare-action").selectOption("run");
  return {
    first,
    checkpoint,
    reopened,
    second,
    secondCheckpoint,
    secondReopened: secondRestore.reopened,
    running,
    download: receipt,
    secondDownload: secondRestore.receipt,
    repeatJumpIgnored: true,
    fullRunCycleAfterRecovery: true,
  };
}

for (const character of ["male", "female"] as const) {
  test(`${character}: paired approach frames, saved checkpoints and airborne state retain native timing`, async ({
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

    const runningApproaches = await checkRunningApproaches(
      page,
      character,
      directory,
    );
    const landingRecovery = await checkLandingRecovery(
      page,
      character,
      directory,
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
    // The first side route has three approach drawings before base Jump0.
    const sideMainElapsed = 700 - ((character === "male" ? 4 : 1) + 3) * TICK;
    expect(airborne.side.position).toBe(
      Math.floor((sideMainElapsed + 1e-7) / TICK),
    );
    expect(airborne.side.elapsedMs).toBeCloseTo(sideMainElapsed, 6);

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
      runningApproaches,
      landingRecovery,
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
