// Real native-pack UI evidence. No mock assets or source artwork changes.
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const output = new URL("docs/kling-workspace/", root);
await mkdir(output, { recursive: true });
const downloads = await mkdtemp(join(tmpdir(), "gathria-workspace-exports-"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const runtimeFiles = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
    "*.html",
    "vite.config.ts",
  ],
  { cwd: fileURLToPath(root), encoding: "utf8" },
)
  .trim()
  .split("\n");
const runtimeHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      runtimeFiles.map(async (file) => [
        file,
        sha(await readFile(new URL(file, root))),
      ]),
    ),
  );
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 5197, strictPort: true, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const origin = "http://127.0.0.1:5197";
const report = {
  startedAt: new Date().toISOString(),
  source: "Actual Vite application and unchanged native V3 character packs",
  runtimeHashes: await runtimeHashes(),
  errors: [],
  screenshots: [],
  characters: [],
};
const log = (message) => console.log(new Date().toISOString(), message);
const track = (page) =>
  page.on("pageerror", (error) => report.errors.push(error.message));
const snapshot = async (page, name, fullPage = false) => {
  const path = new URL(`${name}.png`, output);
  await page.screenshot({ path: fileURLToPath(path), fullPage });
  report.screenshots.push({
    file: `${name}.png`,
    sha256: sha(await readFile(path)),
  });
};
const pause = async (page) => {
  const button = page.getByRole("button", {
    name: "Pause animation",
    exact: true,
  });
  if (await button.count()) await button.click();
};
const ready = async (page) => {
  await expect(page.getByRole("status")).toContainText("Loaded:", {
    timeout: 120000,
  });
  await expect(page.locator("#player-zip")).toBeEnabled({ timeout: 120000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
};
const title = (value) => value[0].toUpperCase() + value.slice(1);
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const page = await context.newPage();
  track(page);
  const libraryRequests = [];
  page.on("request", (request) =>
    libraryRequests.push(new URL(request.url()).pathname),
  );
  await page.goto(origin);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  await snapshot(page, "library-desktop", true);
  assert(
    !libraryRequests.some((url) => url.endsWith(".zip")),
    "Library must not eagerly fetch native packs",
  );
  report.libraryFetchesNoPacks = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await snapshot(page, "library-mobile", true);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile library overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await context.close();

  for (const id of ["male", "female"]) {
    const isolated = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    });
    const requests = [];
    isolated.on("request", (request) =>
      requests.push(new URL(request.url()).pathname),
    );
    const player = await isolated.newPage();
    track(player);
    const started = performance.now();
    await player.goto(`${origin}/player.html?kling=${id}`);
    await ready(player);
    const loadSeconds = (performance.now() - started) / 1000;
    await pause(player);
    const nativeRequests = requests.filter((url) =>
      url.endsWith(".character.zip"),
    );
    assert.deepEqual(nativeRequests, [
      `/docs/kling-jump/exports/${id}.character.zip`,
    ]);
    assert(
      !requests.some((url) => url.endsWith("/kling-source.zip")),
      "Prepared load must not convert a source ZIP",
    );
    const pending = player.waitForEvent("download");
    await player
      .getByRole("button", {
        name: "Export selected CharacterPack",
        exact: true,
      })
      .click();
    const download = await pending;
    const exportPath = join(downloads, `${id}-verified.character.zip`);
    await download.saveAs(exportPath);
    const actual = await readFile(exportPath);
    const original = await readFile(
      new URL(`docs/kling-jump/exports/${id}.character.zip`, root),
    );
    assert.equal(
      sha(actual),
      sha(original),
      "Export must retain exact original ZIP bytes",
    );
    const members = unzipSync(actual);
    const manifest = JSON.parse(Buffer.from(members["manifest.json"]));
    assert.equal(manifest.schemaVersion, 3);
    const cases = [];
    for (const action of ["idle", "walk", "run", "jump", "celebrate"]) {
      for (const direction of ["right", "left"]) {
        await player
          .getByRole("button", { name: title(action), exact: true })
          .click();
        await pause(player);
        await player
          .getByRole("button", { name: title(direction), exact: true })
          .click();
        const clip = manifest.animations[action];
        for (const position of [0, clip.frames.length - 1]) {
          await player.locator("#player-frame").fill(String(position));
          await expect(player.getByTestId("consumer-canvas")).toHaveAttribute(
            "data-frame-position",
            String(position),
          );
          await expect(player.getByTestId("consumer-canvas")).toHaveAttribute(
            "data-frame-id",
            String(clip.frames[position]),
          );
        }
        cases.push({
          action,
          direction,
          frames: clip.frames.length,
          fps: clip.fps,
          loop: clip.loop,
        });
      }
    }
    await player.getByRole("button", { name: "Jump", exact: true }).click();
    await player.locator("#player-frame").fill("0");
    await player
      .getByRole("button", { name: "Play animation", exact: true })
      .click();
    await expect(
      player.getByRole("button", { name: "Replay animation", exact: true }),
    ).toBeVisible({ timeout: 5000 });
    await expect(player.getByTestId("consumer-canvas")).toHaveAttribute(
      "data-frame-position",
      "38",
    );
    await player
      .getByRole("button", { name: "Replay animation", exact: true })
      .click();
    await expect
      .poll(() =>
        player
          .getByTestId("consumer-canvas")
          .getAttribute("data-frame-position"),
      )
      .not.toBe("38");
    await pause(player);
    await player.getByRole("button", { name: "Right", exact: true }).click();
    await player.locator("#player-frame").fill("13");
    await snapshot(player, `${id}-player`, true);
    report.characters.push({
      id,
      loadSeconds,
      nativeRequests,
      sourceConversion: false,
      exportSha256: sha(actual),
      exactZipBytes: true,
      cases,
      heldJumpAndReplay: true,
    });
    log(
      `${id}: loaded ${loadSeconds.toFixed(2)}s, original export exact, five actions checked`,
    );
    await isolated.close();
  }

  if (process.env.KLING_WORKSPACE_BASELINE === "1") {
    const baselineContext = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    });
    const baseline = await baselineContext.newPage();
    track(baseline);
    await baseline.goto(`${origin}/player.html`);
    const started = performance.now();
    await baseline
      .locator("#player-zip")
      .setInputFiles(
        fileURLToPath(
          new URL("artwork/kling-jump/prepared/kling-source.zip", root),
        ),
      );
    await ready(baseline);
    report.rawSourceBaseline = {
      seconds: (performance.now() - started) / 1000,
      method:
        "Existing raw source ZIP imported through file chooser, same browser/environment, no other heavy test jobs. Prepared timings include navigation+HTTP fetch; raw source timing includes local file input+conversion, not network transfer.",
      firstCharacter: "male",
      nativeArtworkUnchanged: true,
    };
    log(`Raw source baseline: ${report.rawSourceBaseline.seconds.toFixed(2)}s`);
    await baselineContext.close();
  }

  const workspaceContext = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const workbench = await workspaceContext.newPage();
  track(workbench);
  await workbench.goto(`${origin}/workbench.html?character=male`);
  const originalFrame = workbench.frameLocator('iframe[src*="player.html"]');
  await ready(originalFrame);
  await pause(originalFrame);
  await originalFrame
    .getByRole("button", { name: "Jump", exact: true })
    .click();
  await originalFrame.locator("#player-frame").fill("13");
  await originalFrame.locator("#player-zoom").selectOption("0.5");
  await originalFrame.locator("body").evaluate(() => window.scrollTo(0, 0));
  await snapshot(workbench, "workbench-original", true);
  await workbench.getByRole("tab", { name: /Skeleton/i }).click();
  const rig = workbench.frameLocator('iframe[src*="skin-studio.html"]');
  await expect(
    rig.getByRole("heading", { name: "Skin & skeleton studio", exact: true }),
  ).toBeVisible();
  await rig.getByLabel("Bones", { exact: true }).check();
  await rig.getByLabel("Action", { exact: true }).selectOption("run");
  await rig.locator("body").evaluate(() => window.scrollTo(0, 0));
  await snapshot(workbench, "workbench-skeleton", true);
  await workbench.getByRole("tab", { name: /Original/i }).click();
  await expect(originalFrame.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-frame-position",
    "13",
  );
  await workbench.getByRole("tab", { name: /Skeleton/i }).click();
  await expect(rig.getByLabel("Bones", { exact: true })).toBeChecked();
  await expect(rig.getByLabel("Action", { exact: true })).toHaveValue("run");
  report.tabSessionsPreserved = true;
  const saved = workbench.waitForEvent("download");
  await rig
    .getByRole("button", { name: "Save project ZIP", exact: true })
    .click();
  const projectPath = new URL("verified-skeleton.rig.zip", output);
  await (await saved).saveAs(fileURLToPath(projectPath));
  const projectBytes = await readFile(projectPath);
  const projectMembers = unzipSync(projectBytes);
  assert(
    Object.keys(projectMembers).some((file) => file.endsWith(".png")),
    "Project must contain artwork",
  );
  report.skeletonProject = {
    sha256: sha(projectBytes),
    members: Object.keys(projectMembers).length,
    crcDecoded: true,
  };
  await rig
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(fileURLToPath(projectPath));
  await expect(rig.locator(".skin-notice")).toContainText("project opened", {
    timeout: 30000,
  });
  await expect(rig.getByLabel("Action", { exact: true })).toHaveValue("run");
  report.skeletonProject.reopened = true;
  await workbench.setViewportSize({ width: 390, height: 844 });
  await rig.locator("body").evaluate(() => window.scrollTo(0, 0));
  await snapshot(workbench, "workbench-mobile", true);
  assert(
    await workbench.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile workbench overflow",
  );
  await workspaceContext.close();
  assert.deepEqual(report.errors, []);
  report.runtimeHashesAfter = await runtimeHashes();
  assert.deepEqual(
    report.runtimeHashesAfter,
    report.runtimeHashes,
    "Runtime changed during evidence capture",
  );
  report.finishedAt = new Date().toISOString();
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await server.close();
  await rm(downloads, { recursive: true, force: true });
}
