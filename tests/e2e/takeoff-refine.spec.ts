import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";

test.describe.configure({ mode: "default" });
const root =
  process.env.GATHRIA_TAKEOFF_EXPORT_ROOT ?? "/tmp/takeoff-bridge/exports";
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (bytes: Uint8Array) => JSON.parse(Buffer.from(bytes).toString());
const stage = (page: Page) => page.getByTestId("dual-stage");
type Sample = {
  at: number;
  action: string;
  position: number;
  frame: number;
  elapsed: number;
};

async function ready(page: Page) {
  await expect(page.getByTestId("dual-wardrobe")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
}
async function pause(page: Page) {
  if ((await stage(page).getAttribute("data-paused")) === "false")
    await page.getByTestId("dual-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
}
async function pose(
  page: Page,
  action: string,
  position = 0,
  facing = "right",
) {
  await pause(page);
  await page.getByTestId("dual-action").selectOption(action);
  await page.getByTestId("dual-frame").fill(String(position === 0 ? 1 : 0));
  await page.getByTestId("dual-frame").fill(String(position));
  await page.getByTestId("dual-facing").selectOption(facing);
  await expect(stage(page)).toHaveAttribute("data-action", action);
  await expect(stage(page)).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
}
async function exported(page: Page, id: string, path: string) {
  const pending = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId(id).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  await download.saveAs(path);
  const bytes = await readFile(path);
  await writeFile(
    `${path}.receipt.json`,
    JSON.stringify(
      {
        file: path,
        filename: download.suggestedFilename(),
        bytes: bytes.length,
        sha256: sha(bytes),
        provenance: "Actual application download",
      },
      null,
      2,
    ) + "\n",
  );
  await ready(page);
  return bytes;
}
async function observe(canvas: Locator) {
  await canvas.evaluate((node) => {
    const win = window as unknown as {
      takeoffSamples: Sample[];
      takeoffObserver?: MutationObserver;
      takeoffRequestedAt: number;
    };
    win.takeoffObserver?.disconnect();
    win.takeoffSamples = [];
    win.takeoffRequestedAt = 0;
    const capture = () => {
      const value = {
        at: performance.now(),
        action: node.dataset.action ?? "",
        position: Number(node.dataset.framePosition),
        frame: Number(node.dataset.frameId),
        elapsed: Number(node.dataset.elapsedMs),
      };
      const prior = win.takeoffSamples.at(-1);
      if (
        !prior ||
        prior.action !== value.action ||
        prior.position !== value.position ||
        prior.frame !== value.frame
      )
        win.takeoffSamples.push(value);
    };
    win.takeoffObserver = new MutationObserver(capture);
    win.takeoffObserver.observe(node, { attributes: true });
    capture();
  });
}
async function markRequest(button: Locator) {
  await button.evaluate((node) => {
    node.addEventListener(
      "click",
      () => {
        (
          window as unknown as { takeoffRequestedAt: number }
        ).takeoffRequestedAt = performance.now();
      },
      { once: true, capture: true },
    );
  });
}
async function observations(canvas: Locator) {
  return canvas.evaluate(() => {
    const win = window as unknown as {
      takeoffSamples: Sample[];
      takeoffObserver?: MutationObserver;
      takeoffRequestedAt: number;
    };
    win.takeoffObserver?.disconnect();
    return { records: win.takeoffSamples, requestedAt: win.takeoffRequestedAt };
  });
}
// Only the independent player's animation clock is controlled. Asset loading,
// React commits, canvas rendering and UI interaction still use the real browser.
// A busy RAF must not skip the very boundary that this compatibility check audits.
type PlayerClockWindow = Window & {
  takeoffPlayerClock: { now: number; advance: (milliseconds: number) => void };
};
async function installPlayerClock(page: Page) {
  await page.addInitScript(() => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    const clock = {
      now: 1000,
      advance(milliseconds: number) {
        this.now += milliseconds;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback(this.now);
      },
    };
    (window as unknown as PlayerClockWindow).takeoffPlayerClock = clock;
    Object.defineProperty(performance, "now", { value: () => clock.now });
    window.requestAnimationFrame = (callback) => {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => callbacks.delete(id);
  });
}
async function advancePlayerClock(page: Page, milliseconds: number) {
  await page.evaluate(
    (delta) =>
      (window as unknown as PlayerClockWindow).takeoffPlayerClock.advance(
        delta,
      ),
    milliseconds,
  );
  await page.evaluate(
    () => new Promise<void>((resolve) => window.setTimeout(resolve, 0)),
  );
}
async function playerSample(canvas: Locator): Promise<Sample> {
  return canvas.evaluate((node) => ({
    at: performance.now(),
    action: node.dataset.action ?? "",
    position: Number(node.dataset.framePosition),
    frame: Number(node.dataset.frameId),
    elapsed: Number(node.dataset.elapsedMs),
  }));
}
function phases(records: Sample[]) {
  return records
    .map((row) => row.action)
    .filter((value, i, all) => i === 0 || value !== all[i - 1]);
}

for (const character of ["male", "female"] as const) {
  test(`${character}: source approach frames connect all three running takeoffs without changing the base jump`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(540_000);
    const directory = `${root}/${character}`;
    await mkdir(directory, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    await page.getByTestId("workbench-source").selectOption("side-view");
    await ready(page);
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue(
      "single-jump",
    );

    const previousMetadata = `docs/kling-takeoff-refine/review/${character}/side.character.json`;
    const previousManifest = `docs/kling-takeoff-refine/review/${character}/side.manifest.json`;
    const baseline = `docs/paired-polish/review/${character}/side.character.zip`;
    const oldProfile = json(await readFile(previousMetadata)).sourceMetadata
      .gameplayMotion;
    const reviewedRoutes =
      character === "male"
        ? [
            {
              from: "run",
              to: "jump",
              exit: 4,
              entry: 0,
              leadIn: [60, 61, 62],
            },
            {
              from: "run",
              to: "jump",
              exit: 10,
              entry: 0,
              leadIn: [59, 60, 61, 62],
            },
            { from: "run", to: "jump", exit: 16, entry: 0, leadIn: [62] },
          ]
        : [
            {
              from: "run",
              to: "jump",
              exit: 1,
              entry: 0,
              leadIn: [55, 56, 57],
            },
            {
              from: "run",
              to: "jump",
              exit: 7,
              entry: 0,
              leadIn: [54, 55, 56, 57],
            },
            { from: "run", to: "jump", exit: 13, entry: 0, leadIn: [57] },
          ];
    await pose(page, "jump");
    const packPath = `${directory}/side.character.zip`;
    const pack = await exported(page, "dual-export-pack", packPath);
    const files = unzipSync(pack),
      manifest = json(files["manifest.json"]);
    const profile = json(files["character.json"]).sourceMetadata.gameplayMotion;
    expect(profile.id).toBe(
      `kling-${character}-side-single-jump-${character === "male" ? "v7" : "v6"}`,
    );
    expect(
      profile.routes.filter(
        (r: { from: string; to: string }) =>
          r.from === "run" && r.to === "jump",
      ),
    ).toEqual(reviewedRoutes);
    // V7 male / V6 female retain the V4 takeoff routes above. Only the early
    // moving landing is refined; other routes and source bindings stay intact.
    expect(
      profile.routes.filter(
        (r: { from: string; to: string }) =>
          r.from === "jump" && r.to === "run",
      ),
    ).toEqual([
      {
        from: "jump",
        to: "run",
        exit: 23,
        entry: character === "male" ? 9 : 7,
        leadIn: character === "male" ? [88, 89] : [83, 84],
      },
      {
        from: "jump",
        to: "run",
        exit: 28,
        entry: character === "male" ? 11 : 8,
      },
    ]);
    const withoutRunningSeams = (value: typeof profile) => ({
      ...value,
      id: oldProfile.id,
      routes: value.routes.filter(
        (r: { from: string; to: string }) =>
          !(r.from === "run" && r.to === "jump") &&
          !(r.from === "jump" && r.to === "run"),
      ),
    });
    expect(withoutRunningSeams(profile)).toEqual(
      withoutRunningSeams(oldProfile),
    );
    expect(manifest).toEqual(json(await readFile(previousManifest)));

    const playback: Array<Record<string, unknown>> = [];
    const cases = reviewedRoutes.map((route) => ({
      name: `exit ${route.exit}`,
      start: route.exit - 1,
      exit: route.exit,
      approachFrames: route.leadIn,
    }));
    cases.push({
      name: "next-cycle first exit",
      start: reviewedRoutes.at(-1)!.exit + 1,
      exit: reviewedRoutes[0].exit + 18,
      approachFrames: reviewedRoutes[0].leadIn,
    });
    for (const item of cases) {
      await pose(page, "run", item.start);
      await observe(stage(page));
      const button = page.getByTestId("dual-jump-once");
      await markRequest(button);
      // This starts the paused inspected run phase and queues a single jump in
      // one actual button handler. No test-only controller call is involved.
      await button.click();
      await expect(stage(page)).toHaveAttribute("data-action", "jump", {
        timeout: 5000,
      });
      await expect(stage(page)).toHaveAttribute("data-return-action", "run");
      await button.click();
      await expect(stage(page)).toHaveAttribute("data-action", "run", {
        timeout: 5000,
      });
      await pause(page);
      const result = await observations(stage(page));
      expect(phases(result.records)).toEqual(["run", "jump", "run"]);
      const firstJump = result.records.find((row) => row.action === "jump")!;
      const approachFrames = item.approachFrames;
      const shownApproach = result.records.filter(
        (row) => row.action === "jump" && approachFrames.includes(row.frame),
      );
      // An unpaced browser may miss a one-tick drawing under CI load. The
      // controlled-clock case checks every approach image; here every observed
      // drawing must still belong to this exact source sequence and advance.
      const jumpDrawings = [...approachFrames, ...profile.actions.jump.frames];
      const observedJump = result.records.filter(
        (row) => row.action === "jump",
      );
      const observedOrder = observedJump.map((row) =>
        jumpDrawings.indexOf(row.frame),
      );
      expect(
        observedOrder.every(
          (order, i) => order >= 0 && (i === 0 || order > observedOrder[i - 1]),
        ),
      ).toBe(true);
      expect(
        observedJump.every((row) =>
          approachFrames.includes(row.frame)
            ? row.position === 0 && row.elapsed === 0
            : profile.actions.jump.frames[row.position] === row.frame,
        ),
      ).toBe(true);
      expect(
        shownApproach.every((row) => row.position === 0 && row.elapsed === 0),
      ).toBe(true);
      const expectedWaitMs = ((item.exit - item.start) * 1000) / 24;
      expect(expectedWaitMs).toBeLessThanOrEqual((6 * 1000) / 24);
      const observedWaitMs = firstJump.at - result.requestedAt;
      // A real browser can be late by a display tick or scheduling delay. This
      // threshold detects the old extra-cycle wait; the exact 250ms bound is
      // proven for every input phase by controller tests, not a wall-clock SLA.
      expect(observedWaitMs).toBeGreaterThanOrEqual(expectedWaitMs - 30);
      expect(observedWaitMs).toBeLessThan(expectedWaitMs + 250);
      const priorRun = result.records
        .slice(0, result.records.indexOf(firstJump))
        .filter((row) => row.action === "run")
        .at(-1)!;
      const expectedLastRun = (item.exit - 1) % 18;
      expect(priorRun.position).toBeGreaterThanOrEqual(expectedLastRun - 2);
      expect(priorRun.position).toBeLessThanOrEqual(expectedLastRun);
      expect(firstJump.position).toBeLessThanOrEqual(2);
      const jumpPositions = result.records
        .filter((row) => row.action === "jump")
        .map((row) => row.position);
      expect(Math.max(...jumpPositions)).toBeGreaterThanOrEqual(20);
      expect(Math.max(...jumpPositions)).toBeLessThan(23);
      playback.push({
        ...item,
        approachFrames,
        shownApproach,
        approachObserved: shownApproach.length > 0,
        observedOrder,
        expectedWaitMs,
        observedWaitMs,
        ...result,
      });
    }

    const gifs: Record<string, Record<string, string>> = { jump: {}, flow: {} };
    for (const facing of ["right", "left"]) {
      await pose(page, "jump", 0, facing);
      gifs.jump[facing] = `${directory}/side-jump-${facing}.gif`;
      // The garment coverage layer changes pixels, not the basic jump. The
      // independent verifier checks old/new GIFs against their own raw artwork.
      await exported(page, "dual-export-gif", gifs.jump[facing]);
      gifs.flow[facing] = `${directory}/side-run-jump-run-${facing}.gif`;
      await exported(page, "dual-export-run-jump-gif", gifs.flow[facing]);
    }
    await pose(page, "run");
    await page.screenshot({
      path: `${directory}/side-workspace.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
    const savedPair = unzipSync(
      await exported(
        page,
        "dual-save-project",
        `${directory}/current.dual.zip`,
      ),
    );
    await writeFile(
      `${directory}/side.wardrobe.zip`,
      savedPair["side.wardrobe.zip"],
    );
    const row = {
      character,
      view: "side",
      pack: packPath,
      project: `${directory}/side.wardrobe.zip`,
      closeRunCycle: true,
      historicalJumpGifs: Object.fromEntries(
        ["right", "left"].map((facing) => [
          facing,
          `docs/kling-single-jump/review/${character}/side-jump-${facing}.gif`,
        ]),
      ),
      baseline,
      gifs,
      previousMetadata,
      previousManifest,
    };
    await writeFile(
      `${directory}/exports.json`,
      JSON.stringify([row], null, 2) + "\n",
    );
    await writeFile(
      `${directory}/playback.json`,
      JSON.stringify(
        { character, profileId: profile.id, playback, errors },
        null,
        2,
      ) + "\n",
    );
    await page.close();

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const player = await context.newPage();
    await installPlayerClock(player);
    const playerErrors: string[] = [];
    const requests: string[] = [];
    player.on("pageerror", (error) => playerErrors.push(error.message));
    player.on("request", (request) => {
      if (
        /\/src\/(?:wardrobe|appearance|side-view|skeletal)\/|\/workbench\.html/.test(
          request.url(),
        )
      )
        requests.push(request.url());
    });
    try {
      for (const variant of [
        "current",
        "historical-v2",
        "historical-v3",
        "historical-v4",
        "historical-v5",
        ...(character === "male" ? ["historical-v6" as const] : []),
      ] as const) {
        let file = packPath;
        if (variant !== "current") {
          const archived = unzipSync(await readFile(baseline));
          const archiveDirectory =
            variant === "historical-v2"
              ? "docs/kling-landing-run/review"
              : variant === "historical-v3"
                ? "docs/kling-takeoff-refine/review"
                : variant === "historical-v4"
                  ? "docs/kling-takeoff-bridge/review"
                  : variant === "historical-v5"
                    ? "docs/kling-landing-posture/checks"
                    : "docs/kling-landing-forward/checks";
          archived["manifest.json"] = await readFile(
            `${archiveDirectory}/${character}/side.manifest.json`,
          );
          archived["character.json"] = await readFile(
            `${archiveDirectory}/${character}/side.character.json`,
          );
          file = `${directory}/side-${variant}.character.zip`;
          await writeFile(
            file,
            zipSync(archived, { level: 0, mtime: new Date(2020, 0, 1) }),
          );
        }
        const bytes = await readFile(file);
        const imported = json(unzipSync(bytes)["character.json"]).sourceMetadata
          .gameplayMotion;
        await player.goto("/player.html");
        await player.locator("#player-zip").setInputFiles(file);
        await expect(player.locator(".player-status")).toContainText(
          "Loaded:",
          { timeout: 180_000 },
        );
        const canvas = player.getByTestId("consumer-canvas");
        await expect(canvas).toHaveAttribute("data-gameplay-motion", "true");
        await player.getByRole("button", { name: "Run", exact: true }).click();
        // Run may be queued at the initial Idle cycle boundary. Advance the
        // real controller to Run's first drawing without wall-clock races.
        const tick = 1000 / imported.actions.run.fps;
        await advancePlayerClock(player, 0);
        for (
          let i = 0;
          i <= imported.actions.idle.frames.length &&
          (await canvas.getAttribute("data-action")) !== "run";
          i++
        )
          await advancePlayerClock(player, tick);
        await expect(canvas).toHaveAttribute("data-action", "run");
        await expect(canvas).toHaveAttribute("data-frame-position", "0");
        const takeoff = imported.routes
          .filter(
            (route: { from: string; to: string }) =>
              route.from === "run" && route.to === "jump",
          )
          .sort(
            (a: { exit: number }, b: { exit: number }) => a.exit - b.exit,
          )[0];
        const landing = imported.routes
          .filter(
            (route: { from: string; to: string }) =>
              route.from === "jump" && route.to === "run",
          )
          .sort(
            (a: { exit: number }, b: { exit: number }) => a.exit - b.exit,
          )[0];
        const native = (action: string, frames: number[]) =>
          frames.map((frame) => ({ action, frame }));
        // Build the expected sequence from the declared archived contract,
        // independently of the runtime's state/frame resolver. Include both
        // bridges and the first actual Run drawing after recovery, not merely
        // the transitional Run label while a Jump drawing is still displayed.
        const expected = [
          ...native("run", imported.actions.run.frames.slice(0, takeoff.exit)),
          ...native("jump", takeoff.leadIn ?? []),
          ...native(
            "jump",
            imported.actions.jump.frames.slice(takeoff.entry, landing.exit),
          ),
          ...native("run", landing.leadIn ?? []),
          ...native("run", [imported.actions.run.frames[landing.entry]]),
        ];
        const records = [await playerSample(canvas)];
        const jumpButton = player.getByRole("button", {
          name: "Jump",
          exact: true,
        });
        await markRequest(jumpButton);
        await jumpButton.click();
        for (let i = 1; i < expected.length; i++) {
          await advancePlayerClock(player, tick);
          records.push(await playerSample(canvas));
        }
        const result = {
          records,
          requestedAt: await player.evaluate(
            () =>
              (window as unknown as { takeoffRequestedAt: number })
                .takeoffRequestedAt,
          ),
        };
        const finalLeadIn = await canvas.getAttribute("data-lead-in");
        const eligible = imported.routes
          .filter(
            (route: { from: string; to: string }) =>
              route.from === "run" && route.to === "jump",
          )
          .map((route: { exit: number }) => route.exit - 1);
        // Always preserve observations before motion assertions so a failure
        // identifies the exact variant, declared frames and actual canvas state.
        await writeFile(
          `${directory}/side-${variant}-player.json`,
          JSON.stringify(
            {
              profileId: imported.id,
              eligibleLastRunPositions: eligible,
              historicalProfileRetained: variant !== "current",
              animationClock: "controlled-native-ticks",
              tickMs: tick,
              expected,
              finalLeadIn,
              ...result,
            },
            null,
            2,
          ) + "\n",
        );
        expect(phases(result.records)).toEqual(["run", "jump", "run"]);
        expect(records.map(({ action, frame }) => ({ action, frame }))).toEqual(
          expected,
        );
        const firstJump = records.findIndex((row) => row.action === "jump");
        expect(records[firstJump - 1].position).toBe(takeoff.exit - 1);
        expect(records[firstJump].position).toBe(takeoff.entry);
        expect(records.at(-1)!.position).toBe(landing.entry);
        expect(records.at(-1)!.elapsed).toBeCloseTo(landing.entry * tick, 6);
        expect(finalLeadIn).toBe("false");
        if (variant === "current") {
          await player.screenshot({
            path: `${directory}/side-independent-player.png`,
            fullPage: true,
          });
          const pending = player.waitForEvent("download");
          await player
            .getByRole("button", {
              name: "Export selected CharacterPack",
              exact: true,
            })
            .click();
          const download = await pending,
            path = `${directory}/side-reexport.zip`;
          await download.saveAs(path);
          expect(sha(await readFile(path))).toBe(sha(bytes));
          await rm(path);
        } else await rm(file);
      }
      expect(requests).toEqual([]);
      expect(playerErrors).toEqual([]);
    } finally {
      await context.close();
    }
    const audit = execFileSync(
      "node",
      ["scripts/verify-single-jump-exports.mjs", `${directory}/exports.json`],
      { encoding: "utf8", timeout: 360_000, maxBuffer: 8 * 1024 * 1024 },
    );
    expect(JSON.parse(audit).passed).toBe(true);
  });
}
