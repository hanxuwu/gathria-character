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
    expect(profile.id).toBe(`kling-${character}-side-single-jump-v5`);
    expect(
      profile.routes.filter(
        (r: { from: string; to: string }) =>
          r.from === "run" && r.to === "jump",
      ),
    ).toEqual(reviewedRoutes);
    // V5 retains the exact V4 takeoff routes above, and changes only the early
    // moving landing. All other routes and source bindings retain their values.
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
        entry: character === "male" ? 14 : 11,
        leadIn: character === "male" ? [63, 62] : [58, 57],
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
      const basic = await exported(page, "dual-export-gif", gifs.jump[facing]);
      expect(sha(basic)).toBe(
        sha(
          await readFile(
            `docs/kling-single-jump/review/${character}/side-jump-${facing}.gif`,
          ),
        ),
      );
      gifs.flow[facing] = `${directory}/side-run-jump-run-${facing}.gif`;
      await exported(page, "dual-export-run-jump-gif", gifs.flow[facing]);
    }
    await pose(page, "run");
    await page.screenshot({
      path: `${directory}/side-workspace.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
    const row = {
      character,
      view: "side",
      pack: packPath,
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
      ] as const) {
        let file = packPath;
        if (variant !== "current") {
          const archived = unzipSync(await readFile(baseline));
          const review =
            variant === "historical-v2"
              ? "kling-landing-run"
              : variant === "historical-v3"
                ? "kling-takeoff-refine"
                : "kling-takeoff-bridge";
          archived["manifest.json"] = await readFile(
            `docs/${review}/review/${character}/side.manifest.json`,
          );
          archived["character.json"] = await readFile(
            `docs/${review}/review/${character}/side.character.json`,
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
        await expect(canvas).toHaveAttribute("data-action", "run");
        await observe(canvas);
        const jumpButton = player.getByRole("button", {
          name: "Jump",
          exact: true,
        });
        await markRequest(jumpButton);
        await jumpButton.click();
        await expect(canvas).toHaveAttribute("data-action", "jump", {
          timeout: 5000,
        });
        await expect(canvas).toHaveAttribute("data-action", "run", {
          timeout: 5000,
        });
        const result = await observations(canvas);
        expect(phases(result.records)).toEqual(["run", "jump", "run"]);
        const firstJump = result.records.find((row) => row.action === "jump")!;
        const beforeJump = result.records
          .slice(0, result.records.indexOf(firstJump))
          .filter((row) => row.action === "run")
          .at(-1)!;
        const eligible = imported.routes
          .filter(
            (r: { from: string; to: string }) =>
              r.from === "run" && r.to === "jump",
          )
          .map((r: { exit: number }) => r.exit - 1);
        expect(
          eligible.some(
            (position: number) =>
              beforeJump.position >= position - 2 &&
              beforeJump.position <= position,
          ),
        ).toBe(true);
        await writeFile(
          `${directory}/side-${variant}-player.json`,
          JSON.stringify(
            {
              profileId: imported.id,
              eligibleLastRunPositions: eligible,
              historicalProfileRetained: variant !== "current",
              ...result,
            },
            null,
            2,
          ) + "\n",
        );
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
