import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

// Deliberately serial: source-bound wardrobe preparation and atlas export are
// memory-heavy. These are actual UI downloads, never generated fixture images.
test.describe.configure({ mode: "default" });
const outputRoot = "/tmp/single-jump/exports";
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (bytes: Uint8Array) =>
  JSON.parse(Buffer.from(bytes).toString("utf8"));
const stage = (page: Page) => page.getByTestId("dual-stage");

async function ready(page: Page) {
  await expect(page.getByTestId("dual-wardrobe")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await expect(stage(page)).toBeVisible();
}
async function pause(page: Page) {
  if ((await stage(page).getAttribute("data-paused")) === "false")
    await page.getByTestId("dual-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
}
async function view(page: Page, source: "original" | "side") {
  await page
    .getByTestId("workbench-source")
    .selectOption(source === "side" ? "side-view" : "original");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-view", source);
}
async function pose(
  page: Page,
  action: string,
  position = 0,
  facing = "right",
) {
  await pause(page);
  await page.getByTestId("dual-action").selectOption(action);
  await page.getByTestId("dual-frame").fill(position ? "0" : "1");
  await page.getByTestId("dual-frame").fill(String(position));
  await page.getByTestId("dual-facing").selectOption(facing);
  await expect(stage(page)).toHaveAttribute("data-action", action);
  await expect(stage(page)).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
}
async function download(page: Page, testId: string, path: string) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId(testId).click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  await result.saveAs(path);
  const bytes = await readFile(path);
  await writeFile(
    `${path}.receipt.json`,
    JSON.stringify(
      {
        path,
        filename: result.suggestedFilename(),
        bytes: bytes.length,
        sha256: sha(bytes),
        provenance: "Actual browser download",
      },
      null,
      2,
    ) + "\n",
  );
  return bytes;
}
async function exported(page: Page, testId: string, path: string) {
  const bytes = await download(page, testId, path);
  await ready(page);
  return bytes;
}
async function collectPlayback(page: Page) {
  await stage(page).evaluate((canvas) => {
    const records: Array<Record<string, string | number>> = [];
    const win = window as unknown as {
      jumpEvidence?: typeof records;
      jumpObserver?: MutationObserver;
    };
    win.jumpObserver?.disconnect();
    const capture = () => {
      const row = {
        at: performance.now(),
        action: canvas.dataset.action ?? "",
        position: canvas.dataset.framePosition ?? "",
        frameId: canvas.dataset.frameId ?? "",
        elapsedMs: canvas.dataset.elapsedMs ?? "",
        pending: canvas.dataset.pendingAction ?? "",
        returnAction: canvas.dataset.returnAction ?? "",
      };
      const previous = records.at(-1);
      if (
        !previous ||
        previous.action !== row.action ||
        previous.position !== row.position ||
        previous.pending !== row.pending
      )
        records.push(row);
    };
    capture();
    win.jumpEvidence = records;
    win.jumpObserver = new MutationObserver(capture);
    win.jumpObserver.observe(canvas, { attributes: true });
  });
}
async function playback(page: Page) {
  return page.evaluate(() => {
    const win = window as unknown as {
      jumpEvidence: Array<Record<string, string | number>>;
      jumpObserver: MutationObserver;
    };
    win.jumpObserver.disconnect();
    return win.jumpEvidence;
  });
}

for (const character of ["male", "female"] as const) {
  test(`${character}: one jump returns to running, exports native art and reopens independently`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(900_000);
    const dir = `${outputRoot}/${character}`;
    await mkdir(dir, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue(
      "single-jump",
    );
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("polished-day");
    await view(page, "side");
    await pose(page, "jump");
    await expect(stage(page)).toHaveAttribute("data-frame-count", "28");
    await expect(stage(page)).toHaveAttribute("data-fps", "24");
    await expect(stage(page)).toHaveAttribute(
      "data-frame-id",
      character === "male" ? "63" : "58",
    );

    // Inspecting the full source sequence remains explicit and reversible.
    await page.getByTestId("dual-motion-mode").selectOption("source");
    await pose(page, "jump", 37);
    await expect(stage(page)).toHaveAttribute("data-frame-count", "50");
    const legacyPath = `${dir}/source-mode.zip`;
    const legacy = await exported(page, "dual-save-project", legacyPath);
    const legacyManifest = json(unzipSync(legacy)["manifest.json"]);
    expect(legacyManifest.version).toBe(1);
    expect(legacyManifest.motionMode).toBeUndefined();
    await page.getByTestId("dual-motion-mode").selectOption("single-jump");
    await page.getByTestId("dual-project-input").setInputFiles(legacyPath);
    await ready(page);
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue("source");
    await expect(stage(page)).toHaveAttribute("data-frame-position", "37");
    const legacyAgain = await exported(
      page,
      "dual-save-project",
      `${dir}/source-mode-reopened.zip`,
    );
    expect(sha(legacyAgain)).toBe(sha(legacy));
    await rm(`${dir}/source-mode-reopened.zip`);
    await page.getByTestId("dual-motion-mode").selectOption("single-jump");

    // A press during running schedules one jump. Repeated Space cannot start
    // a second jump or reset the current takeoff/landing frames.
    await pose(page, "run");
    await collectPlayback(page);
    await page.getByTestId("dual-run").click();
    await expect(stage(page)).toHaveAttribute("data-action", "run");
    await stage(page).focus();
    await page.keyboard.down("Space");
    await expect(stage(page)).toHaveAttribute("data-action", "jump", {
      timeout: 5_000,
    });
    await expect(stage(page)).toHaveAttribute("data-return-action", "run");
    await page.waitForTimeout(160);
    const beforeRepeat = Number(
      await stage(page).getAttribute("data-frame-position"),
    );
    await page.keyboard.down("Space");
    await page.keyboard.down("Space");
    await expect(stage(page)).toHaveAttribute("data-action", "jump");
    expect(
      Number(await stage(page).getAttribute("data-frame-position")),
    ).toBeGreaterThanOrEqual(beforeRepeat);
    await page.keyboard.up("Space");
    await expect(stage(page)).toHaveAttribute("data-action", "run", {
      timeout: 5_000,
    });
    await page.waitForTimeout(1_350);
    await expect(stage(page)).toHaveAttribute("data-action", "run");
    const runningJump = await playback(page);
    const actions = runningJump
      .map((row) => row.action)
      .filter((action, i, all) => i === 0 || action !== all[i - 1]);
    expect(actions).toEqual(["run", "jump", "run"]);
    expect(
      Math.max(
        ...runningJump
          .filter((r) => r.action === "jump")
          .map((r) => Number(r.position)),
      ),
    ).toBeGreaterThanOrEqual(25);

    // An idle request during flight must wait for the authored full landing.
    await page.getByTestId("dual-jump-once").click();
    await expect(stage(page)).toHaveAttribute("data-action", "jump", {
      timeout: 5_000,
    });
    await page.waitForTimeout(240);
    await page.getByTestId("dual-idle").click();
    await expect(stage(page)).toHaveAttribute("data-action", "jump");
    await expect(stage(page)).toHaveAttribute("data-pending-action", "idle");
    await expect(stage(page)).toHaveAttribute("data-action", "idle", {
      timeout: 5_000,
    });
    await pause(page);
    const held = await stage(page).getAttribute("data-frame-id");
    await page.waitForTimeout(160);
    await expect(stage(page)).toHaveAttribute("data-frame-id", held!);
    await pose(page, "jump", 7);
    await expect(stage(page)).toHaveAttribute("data-paused", "true");
    const savedPath = `${dir}/single-jump.zip`;
    const saved = await exported(page, "dual-save-project", savedPath);
    const savedFiles = unzipSync(saved),
      savedManifest = json(savedFiles["manifest.json"]);
    expect(savedManifest.version).toBe(2);
    expect(savedManifest.motionMode).toBe("single-jump");
    for (const source of ["original", "side"] as const) {
      const native = unzipSync(savedFiles[`${source}.wardrobe.zip`]);
      const document = json(native["document.json"]);
      expect(sha(native["source.character.zip"])).toBe(document.sourceSha256);
      expect(sha(native["registration.json"])).toBe(
        document.registrationSha256,
      );
      expect(document.version).toBe(2); // Native appearance format is unchanged.
    }
    await page.getByTestId("dual-motion-mode").selectOption("source");
    await page.getByTestId("dual-project-input").setInputFiles(savedPath);
    await ready(page);
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue(
      "single-jump",
    );
    await expect(stage(page)).toHaveAttribute("data-frame-position", "7");
    await expect(stage(page)).toHaveAttribute("data-frame-count", "28");

    const rows: Array<Record<string, unknown>> = [];
    for (const source of ["side", "original"] as const) {
      await view(page, source);
      await pose(page, "jump");
      await expect(stage(page)).toHaveAttribute(
        "data-frame-count",
        source === "side" ? "28" : "39",
      );
      const packPath = `${dir}/${source}.character.zip`;
      const packBytes = await exported(page, "dual-export-pack", packPath);
      const files = unzipSync(packBytes),
        manifest = json(files["manifest.json"]),
        config = json(files["character.json"]);
      expect(config.sourceMetadata.gameplayMotion.format).toBe(
        "gathria-gameplay-motion",
      );
      expect(config.sourceMetadata.gameplayMotion.jumpReturn).toBe(
        "previous-locomotion",
      );
      expect(manifest.animations.jump.loop).toBe(false);
      expect(manifest.animations.jump.fps).toBe(24);
      const gifs: Record<string, Record<string, string>> = {
        jump: {},
        flow: {},
      };
      for (const facing of ["right", "left"] as const) {
        await pose(page, "jump", 0, facing);
        gifs.jump[facing] = `${dir}/${source}-jump-${facing}.gif`;
        await exported(page, "dual-export-gif", gifs.jump[facing]);
        gifs.flow[facing] = `${dir}/${source}-run-jump-run-${facing}.gif`;
        await exported(page, "dual-export-run-jump-gif", gifs.flow[facing]);
      }
      await pose(page, "jump", source === "side" ? 12 : 16);
      await page.screenshot({
        path: `${dir}/${source}-workspace.png`,
        fullPage: true,
      });
      rows.push({
        character,
        view: source,
        pack: packPath,
        gifs,
        baseline:
          source === "side"
            ? `docs/paired-polish/review/${character}/side.character.zip`
            : `docs/matched-hair/review/${character}/original.character.zip`,
      });
    }
    await writeFile(
      `${dir}/playback.json`,
      JSON.stringify(
        {
          character,
          runningJump,
          actions,
          repeatDoesNotReplay: true,
          midairIdleWaitsForLanding: true,
          legacyV1ByteExact: true,
          v2ModeAndPreviewRestored: true,
          pageErrors: errors,
        },
        null,
        2,
      ) + "\n",
    );
    await writeFile(
      `${dir}/exports.json`,
      JSON.stringify(rows, null, 2) + "\n",
    );
    await page.close();

    // Each exported pack must control itself in a fresh player after the
    // wardrobe closes. No live editor/compositor can supply missing behavior.
    for (const row of rows) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const forbidden: string[] = [];
      context.on("request", (request) => {
        if (
          /\/src\/(?:wardrobe|appearance|side-view|skeletal)\/|\/workbench\.html/.test(
            request.url(),
          )
        )
          forbidden.push(request.url());
      });
      const player = await context.newPage();
      try {
        await player.goto("/player.html");
        await player.locator("#player-zip").setInputFiles(String(row.pack));
        await expect(player.locator(".player-status")).toContainText(
          "Loaded:",
          { timeout: 180_000 },
        );
        const canvas = player.getByTestId("consumer-canvas");
        await player.getByRole("button", { name: "Run", exact: true }).click();
        await expect(canvas).toHaveAttribute("data-action", "run", {
          timeout: 5_000,
        });
        await player.getByRole("button", { name: "Jump", exact: true }).click();
        await expect(canvas).toHaveAttribute("data-action", "jump", {
          timeout: 5_000,
        });
        await expect(canvas).toHaveAttribute("data-action", "run", {
          timeout: 5_000,
        });
        await player.screenshot({
          path: `${dir}/${row.view}-independent-player.png`,
          fullPage: true,
        });
        const pending = player.waitForEvent("download");
        await player
          .getByRole("button", {
            name: "Export selected CharacterPack",
            exact: true,
          })
          .click();
        const result = await pending,
          reexport = `${dir}/${row.view}-reexport.zip`;
        await result.saveAs(reexport);
        expect(sha(await readFile(reexport))).toBe(
          sha(await readFile(String(row.pack))),
        );
        await rm(reexport);
        expect(forbidden).toEqual([]);
      } finally {
        await context.close();
      }
    }
    expect(errors).toEqual([]);
    const audit = execFileSync(
      "node",
      ["scripts/verify-single-jump-exports.mjs", `${dir}/exports.json`],
      {
        encoding: "utf8",
        timeout: 360_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    expect(JSON.parse(audit).passed).toBe(true);
  });

  test(`${character}: resuming the last landing frame does not replay takeoff`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    await view(page, "side");
    await pose(page, "jump", 27);
    await collectPlayback(page);
    await page.getByTestId("dual-play-pause").click();
    await expect(stage(page)).toHaveAttribute("data-action", "idle", {
      timeout: 5_000,
    });
    const records = await playback(page);
    const jumpPositions = records
      .filter((row) => row.action === "jump")
      .map((row) => Number(row.position));
    expect(jumpPositions.length).toBeGreaterThan(0);
    expect(jumpPositions.every((position) => position === 27)).toBe(true);
    await page.getByTestId("dual-motion-mode").selectOption("source");
    await pose(page, "jump", 49);
    await collectPlayback(page);
    await page.getByTestId("dual-play-pause").click();
    await expect
      .poll(async () =>
        Number(await stage(page).getAttribute("data-frame-position")),
      )
      .toBeLessThan(10);
    await pause(page);
    const legacy = await playback(page);
    expect(
      legacy.some((row) => row.action === "jump" && Number(row.position) < 10),
    ).toBe(true);
    await mkdir(`${outputRoot}/${character}`, { recursive: true });
    await writeFile(
      `${outputRoot}/${character}/last-landing-resume.json`,
      JSON.stringify(
        {
          gameplayLastFrame: records,
          sourceModeReplay: legacy,
          gameplayDoesNotReplayTakeoff: true,
          legacyReplayRetained: true,
        },
        null,
        2,
      ) + "\n",
    );
  });
}
