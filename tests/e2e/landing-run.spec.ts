import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";

// The PNGs are actual application downloads. Keep them separate from the
// previous single-jump review and keep memory-heavy exports serial.
test.describe.configure({ mode: "default" });
const root =
  process.env.GATHRIA_LANDING_RUN_EXPORT_ROOT ?? "/tmp/landing-run/exports";
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
  pending: string;
  leadIn: boolean;
};
type AirborneInput = {
  at: number;
  action: string;
  position: number;
  target: "run" | "idle";
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
async function pose(page: Page, action: string, facing = "right") {
  await pause(page);
  await page.getByTestId("dual-action").selectOption(action);
  await page.getByTestId("dual-frame").fill("1");
  await page.getByTestId("dual-frame").fill("0");
  await page.getByTestId("dual-facing").selectOption(facing);
  await expect(stage(page)).toHaveAttribute("data-action", action);
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
      landingSamples: Sample[];
      landingObserver?: MutationObserver;
    };
    win.landingObserver?.disconnect();
    win.landingSamples = [];
    const capture = () => {
      const value = {
        at: performance.now(),
        action: node.dataset.action ?? "",
        position: Number(node.dataset.framePosition),
        frame: Number(node.dataset.frameId),
        elapsed: Number(node.dataset.elapsedMs),
        pending: node.dataset.pendingAction ?? "",
        leadIn: node.dataset.leadIn === "true",
      };
      const previous = win.landingSamples.at(-1);
      if (
        !previous ||
        previous.action !== value.action ||
        previous.position !== value.position ||
        previous.frame !== value.frame ||
        previous.leadIn !== value.leadIn ||
        previous.pending !== value.pending
      )
        win.landingSamples.push(value);
    };
    win.landingObserver = new MutationObserver(capture);
    win.landingObserver.observe(node, { attributes: true });
    capture();
  });
}
async function armAirborneInput(
  canvas: Locator,
  target: AirborneInput["target"],
  landingExit: number,
) {
  // Observe and press the real control in the same browser task. Awaiting a
  // Playwright poll, then observe(), then click() can consume the airborne
  // interval on a loaded runner before the transient pending state is checked.
  await canvas.evaluate(
    (node, { target, landingExit }) => {
      const win = window as unknown as {
        landingInput: AirborneInput | null;
        landingInputObserver?: MutationObserver;
      };
      win.landingInputObserver?.disconnect();
      win.landingInput = null;
      const button = document.querySelector<HTMLButtonElement>(
        `[data-testid="dual-${target}"]`,
      );
      if (!button) throw Error(`Missing ${target} movement control`);
      const trigger = () => {
        const position = Number(node.dataset.framePosition);
        if (
          win.landingInput ||
          node.dataset.action !== "jump" ||
          position < 9 ||
          position >= landingExit
        )
          return;
        win.landingInput = {
          at: performance.now(),
          action: node.dataset.action,
          position,
          target,
        };
        win.landingInputObserver?.disconnect();
        button.click();
      };
      win.landingInputObserver = new MutationObserver(trigger);
      win.landingInputObserver.observe(node, { attributes: true });
      trigger();
    },
    { target, landingExit },
  );
}
async function airborneInput(canvas: Locator): Promise<AirborneInput> {
  const input = await canvas.evaluate(() => {
    const win = window as unknown as {
      landingInput: AirborneInput | null;
      landingInputObserver?: MutationObserver;
    };
    win.landingInputObserver?.disconnect();
    return win.landingInput;
  });
  expect(
    input,
    "Movement request must be dispatched while airborne",
  ).not.toBeNull();
  return input!;
}
async function samples(canvas: Locator): Promise<Sample[]> {
  return canvas.evaluate(() => {
    const win = window as unknown as {
      landingSamples: Sample[];
      landingObserver?: MutationObserver;
    };
    win.landingObserver?.disconnect();
    return win.landingSamples;
  });
}
function phases(records: Sample[]) {
  return records
    .map((r) => r.action)
    .filter((value, i, all) => i === 0 || value !== all[i - 1]);
}

for (const character of ["male", "female"] as const) {
  test(`${character}: landing carries movement without the standing tail and preserves old exports`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(720_000);
    const directory = `${root}/${character}`;
    await mkdir(directory, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue(
      "single-jump",
    );
    await pose(page, "jump");
    await page.getByTestId("dual-frame").fill("7");
    const savedPath = `${directory}/saved-mode.zip`;
    const saved = unzipSync(
      await exported(page, "dual-save-project", savedPath),
    );
    expect(json(saved["manifest.json"]).motionMode).toBe("single-jump");
    await page.getByTestId("dual-motion-mode").selectOption("source");
    await page.getByTestId("dual-project-input").setInputFiles(savedPath);
    await ready(page);
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue(
      "single-jump",
    );
    await expect(stage(page)).toHaveAttribute("data-frame-position", "7");
    await rm(savedPath);
    const rows: Array<Record<string, unknown>> = [];
    const playback: Array<Record<string, unknown>> = [];
    for (const view of ["side", "original"] as const) {
      await page
        .getByTestId("workbench-source")
        .selectOption(view === "side" ? "side-view" : "original");
      await ready(page);
      await pose(page, "jump");
      const packPath = `${directory}/${view}.character.zip`;
      const pack = await exported(page, "dual-export-pack", packPath);
      const files = unzipSync(pack),
        manifest = json(files["manifest.json"]);
      const profile = json(files["character.json"]).sourceMetadata
        .gameplayMotion;
      expect(profile.id).toBe(
        `kling-${character}-${view}-single-jump-${view === "side" ? "v5" : "v2"}`,
      );
      expect(
        profile.routes
          .filter(
            (route: { from: string; to: string }) =>
              route.from === "run" && route.to === "jump",
          )
          .map((route: { exit: number; entry: number }) => [
            route.exit,
            route.entry,
          ])
          .sort((a: number[], b: number[]) => a[0] - b[0]),
      ).toEqual(
        view === "original"
          ? [
              [5, 0],
              [13, 0],
            ]
          : character === "male"
            ? [
                [4, 0],
                [10, 0],
                [16, 0],
              ]
            : [
                [1, 0],
                [7, 0],
                [13, 0],
              ],
      );
      const landing = profile.routes.find(
        (r: { from: string; to: string }) =>
          r.from === "jump" && r.to === "run",
      );
      expect(landing).toEqual(
        view === "side"
          ? {
              from: "jump",
              to: "run",
              exit: 23,
              entry: character === "male" ? 14 : 11,
              leadIn: character === "male" ? [63, 62] : [58, 57],
            }
          : { from: "jump", to: "run", exit: 30, entry: 4 },
      );
      expect(landing.exit).toBeLessThan(profile.actions.jump.frames.length);
      expect(manifest.animations.jump.frames).toHaveLength(
        view === "side" ? 28 : 39,
      );

      await pose(page, "run");
      await observe(stage(page));
      await page.getByTestId("dual-run").click();
      await page.getByTestId("dual-jump-once").click();
      await expect(stage(page)).toHaveAttribute("data-action", "jump", {
        timeout: 5000,
      });
      await expect(stage(page)).toHaveAttribute("data-return-action", "run");
      // Repeated presses cannot restart the jump or reinstate the discarded tail.
      await page.getByTestId("dual-jump-once").click();
      await expect(stage(page)).toHaveAttribute("data-action", "run", {
        timeout: 5000,
      });
      await page.waitForTimeout(400);
      const records = await samples(stage(page));
      expect(phases(records)).toEqual(["run", "jump", "run"]);
      const jumpRecords = records.filter((r) => r.action === "jump");
      expect(jumpRecords.length).toBeGreaterThan(4);
      expect(Math.max(...jumpRecords.map((r) => r.position))).toBeLessThan(
        landing.exit,
      );
      expect(
        Math.max(...jumpRecords.map((r) => r.position)),
      ).toBeGreaterThanOrEqual(landing.exit - 3);
      const recovery = records.filter((r) => r.action === "run" && r.leadIn);
      const recoveryFrames: number[] = landing.leadIn ?? [];
      expect(
        recovery.every(
          (r, index) =>
            r.position === landing.entry &&
            recoveryFrames.includes(r.frame) &&
            (index === 0 ||
              recoveryFrames.indexOf(r.frame) >
                recoveryFrames.indexOf(recovery[index - 1].frame)),
        ),
      ).toBe(true);
      // Real-time RAF may skip a short bridge under load. Controlled-clock
      // coverage checks each native drawing; every observed drawing stays valid.

      // A new Run request while airborne is buffered until the reviewed landing.
      await pose(page, "idle");
      await observe(stage(page));
      await armAirborneInput(stage(page), "run", landing.exit);
      await page.getByTestId("dual-jump-once").click();
      await expect(stage(page)).toHaveAttribute("data-action", "run", {
        timeout: 5000,
      });
      const runInput = await airborneInput(stage(page));
      expect(runInput.action).toBe("jump");
      expect(runInput.target).toBe("run");
      expect(runInput.position).toBeGreaterThanOrEqual(9);
      expect(runInput.position).toBeLessThan(landing.exit);
      const bufferedRecords = (await samples(stage(page))).filter(
        (record) => record.at >= runInput.at,
      );
      expect(
        bufferedRecords.some(
          (record) => record.action === "jump" && record.pending === "run",
        ),
        "Run must remain visibly queued during Jump before the landing",
      ).toBe(true);
      expect(phases(bufferedRecords)).toEqual(["jump", "run"]);
      const bufferedPositions = bufferedRecords
        .filter((r) => r.action === "jump")
        .map((r) => r.position);
      expect(Math.max(...bufferedPositions)).toBeLessThan(landing.exit);
      expect(Math.max(...bufferedPositions)).toBeGreaterThanOrEqual(
        landing.exit - 3,
      );

      // Finish this landing bridge before requesting a separate jump. A Jump
      // press during recovery is intentionally ignored, just like one in flight.
      await expect(stage(page)).toHaveAttribute("data-lead-in", "false");
      // An idle request during the airborne interval still keeps the complete
      // standing recovery; only an explicitly requested moving exit is shortened.
      await observe(stage(page));
      await armAirborneInput(stage(page), "idle", landing.exit);
      await page.getByTestId("dual-jump-once").click();
      await expect(stage(page)).toHaveAttribute("data-action", "idle", {
        timeout: 5000,
      });
      const idleInput = await airborneInput(stage(page));
      expect(idleInput.action).toBe("jump");
      expect(idleInput.target).toBe("idle");
      expect(idleInput.position).toBeGreaterThanOrEqual(9);
      expect(idleInput.position).toBeLessThan(landing.exit);
      const idleRecords = (await samples(stage(page))).filter(
        (record) => record.at >= idleInput.at,
      );
      expect(
        idleRecords.some(
          (record) => record.action === "jump" && record.pending === "idle",
        ),
        "Idle must remain visibly queued while Jump completes its recovery",
      ).toBe(true);
      expect(
        Math.max(
          ...idleRecords
            .filter((r) => r.action === "jump")
            .map((r) => r.position),
        ),
      ).toBeGreaterThanOrEqual(profile.actions.jump.frames.length - 3);
      // Request after the early seam and finish the remaining authored tail.
      // Neither view may rewind into the missed recovery bridge.
      await pose(page, "jump");
      await page
        .getByTestId("dual-frame")
        .fill(
          String(
            Math.min(landing.exit + 1, profile.actions.jump.frames.length - 1),
          ),
        );
      await observe(stage(page));
      await page.getByTestId("dual-run").click();
      await expect(stage(page)).toHaveAttribute("data-action", "run", {
        timeout: 5000,
      });
      const lateRecords = await samples(stage(page));
      expect(phases(lateRecords)).toEqual(["jump", "run"]);
      const latePositions = lateRecords
        .filter((r) => r.action === "jump")
        .map((r) => r.position);
      expect(Math.min(...latePositions)).toBeGreaterThanOrEqual(landing.exit);
      expect(Math.max(...latePositions)).toBeGreaterThanOrEqual(
        profile.actions.jump.frames.length - 3,
      );
      playback.push({
        view,
        profileId: profile.id,
        movingExit: landing,
        records,
        idleRecords,
        bufferedRecords,
        airborneInputs: [runInput, idleInput],
        lateRecords,
        lateCase: "strictly-after-seam fallback",
      });

      const gifs: Record<string, Record<string, string>> = {
        jump: {},
        flow: {},
      };
      await pose(page, "jump");
      gifs.jump.right = `${directory}/${view}-jump-right.gif`;
      const basic = await exported(page, "dual-export-gif", gifs.jump.right);
      const previousBasic = `docs/kling-single-jump/review/${character}/${view}-jump-right.gif`;
      expect(sha(basic)).toBe(sha(await readFile(previousBasic)));
      for (const facing of ["right", "left"]) {
        await pose(page, "jump", facing);
        gifs.flow[facing] = `${directory}/${view}-run-jump-run-${facing}.gif`;
        await exported(page, "dual-export-run-jump-gif", gifs.flow[facing]);
      }
      await pose(page, "run");
      await page.screenshot({
        path: `${directory}/${view}-workspace.png`,
        fullPage: true,
      });
      rows.push({
        character,
        view,
        pack: packPath,
        gifs,
        previousBasic,
        previousMetadata: `docs/kling-single-jump/review/${character}/${view}.character.json`,
        previousManifest: `docs/kling-single-jump/review/${character}/${view}.manifest.json`,
        previousFlow: `docs/kling-single-jump/review/${character}/${view}-run-jump-run-right.gif`,
        baseline:
          view === "side"
            ? `docs/paired-polish/review/${character}/side.character.zip`
            : `docs/matched-hair/review/${character}/original.character.zip`,
      });
    }
    expect(errors).toEqual([]);
    await writeFile(
      `${directory}/exports.json`,
      JSON.stringify(rows, null, 2) + "\n",
    );
    await writeFile(
      `${directory}/playback.json`,
      JSON.stringify({ character, playback, errors }, null, 2) + "\n",
    );
    await page.close();

    for (const row of rows) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const player = await context.newPage();
      const requests: string[] = [];
      player.on("request", (request) => {
        if (
          /\/src\/(?:wardrobe|appearance|side-view|skeletal)\/|\/workbench\.html/.test(
            request.url(),
          )
        )
          requests.push(request.url());
      });
      try {
        await player.goto("/player.html");
        const variants =
          row.view === "side"
            ? ["current", "historical-v1", "historical-v2"]
            : ["current", "historical-v1"];
        for (const variant of variants) {
          let file = String(row.pack);
          if (variant !== "current") {
            // Reconstruct the old review package from its committed actual JSON
            // and the byte-identical published atlas; no previous /tmp is needed.
            const files = unzipSync(await readFile(String(row.baseline)));
            const historicalRoot =
              variant === "historical-v2"
                ? `docs/kling-landing-run/review/${character}/${row.view}`
                : null;
            files["manifest.json"] = await readFile(
              historicalRoot
                ? `${historicalRoot}.manifest.json`
                : String(row.previousManifest),
            );
            files["character.json"] = await readFile(
              historicalRoot
                ? `${historicalRoot}.character.json`
                : String(row.previousMetadata),
            );
            file = `${directory}/${row.view}-${variant}.character.zip`;
            await writeFile(
              file,
              zipSync(files, { level: 0, mtime: new Date(2020, 0, 1) }),
            );
          }
          const bytes = await readFile(file),
            files = unzipSync(bytes);
          const profile = json(files["character.json"]).sourceMetadata
            .gameplayMotion;
          const exit = profile.routes.find(
            (r: { from: string; to: string }) =>
              r.from === "jump" && r.to === "run",
          ).exit;
          await player.goto("/player.html");
          await player.locator("#player-zip").setInputFiles(file);
          await expect(player.locator(".player-status")).toContainText(
            "Loaded:",
            { timeout: 180_000 },
          );
          const canvas = player.getByTestId("consumer-canvas");
          await expect(canvas).toHaveAttribute("data-gameplay-motion", "true");
          await player
            .getByRole("button", { name: "Run", exact: true })
            .click();
          await expect(canvas).toHaveAttribute("data-action", "run", {
            timeout: 5000,
          });
          await observe(canvas);
          await player
            .getByRole("button", { name: "Jump", exact: true })
            .click();
          await expect(canvas).toHaveAttribute("data-action", "jump", {
            timeout: 5000,
          });
          await expect(canvas).toHaveAttribute("data-action", "run", {
            timeout: 5000,
          });
          const records = await samples(canvas);
          expect(phases(records)).toEqual(["run", "jump", "run"]);
          const positions = records
            .filter((r) => r.action === "jump")
            .map((r) => r.position);
          expect(Math.max(...positions)).toBeLessThan(exit);
          expect(Math.max(...positions)).toBeGreaterThanOrEqual(exit - 3);
          await writeFile(
            `${directory}/${row.view}-${variant}-player.json`,
            JSON.stringify(
              {
                profileId: profile.id,
                exit,
                records,
                legacyProfileRetained: variant !== "current",
              },
              null,
              2,
            ) + "\n",
          );
          if (variant === "current") {
            await player.screenshot({
              path: `${directory}/${row.view}-independent-player.png`,
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
              path = `${directory}/${row.view}-reexport.zip`;
            await download.saveAs(path);
            expect(sha(await readFile(path))).toBe(sha(bytes));
            await rm(path);
          } else await rm(file);
        }
        expect(requests).toEqual([]);
      } finally {
        await context.close();
      }
    }
    const audit = execFileSync(
      "node",
      ["scripts/verify-landing-run-exports.mjs", `${directory}/exports.json`],
      {
        encoding: "utf8",
        timeout: 360_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    expect(JSON.parse(audit).passed).toBe(true);
  });
}
