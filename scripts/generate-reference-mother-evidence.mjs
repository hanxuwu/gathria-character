// Evidence comes from actual candidate UI downloads and the unchanged consumer.
// This is a four-static-pose study; no animation cycles are generated or claimed.
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const phase = process.env.EVIDENCE_PHASE || "final";
assert(phase === "final" || /^iterations\/[a-z0-9-]+$/.test(phase));
const outputPath = `docs/reference-mother/${phase}/`;
const output = new URL(outputPath, root);
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Keep prior evidence; choose a fresh EVIDENCE_PHASE instead of overwriting it.",
);
const startedAt = new Date().toISOString();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const log = (message) => console.log(new Date().toISOString(), message);
const poses = [
  ["standing", "Standing"],
  ["walk-contact", "Walk contact"],
  ["run-flight", "Run flight"],
  ["celebrate", "Celebrate"],
];
const sourcePaths = [];
for (const directory of [
  "src/skeletal",
  "src/consumer",
  "src/core",
  "artwork/reference-mother/prepared",
])
  for (const file of await readdir(new URL(`${directory}/`, root), {
    recursive: true,
  }))
    if (/\.(tsx?|css|json|png|zip)$/.test(file))
      sourcePaths.push(`${directory}/${file}`);
sourcePaths.push("scripts/generate-reference-mother-evidence.mjs");
sourcePaths.sort();
async function fileHashes(paths) {
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        sha(await readFile(new URL(path, root))),
      ]),
    ),
  );
}
const inputHashes = await fileHashes(sourcePaths);
const errors = [],
  externalRequests = [],
  forbiddenGeneratorRequests = [];
const downloads = [],
  decodedPngs = [],
  archives = [],
  editorPoses = [],
  playback = [];
const result = {
  format: "gathria-reference-mother-evidence",
  version: 1,
  startedAt,
  phase,
  scope:
    "Four static review poses, not completed animation cycles. CharacterPack selectors idle/walk/run are one-frame still holds; celebration is not mapped to jump.",
  inputHashes,
  downloads,
  decodedPngs,
  archives,
  editorPoses,
  playback,
  errors,
  externalRequests,
  forbiddenGeneratorRequests,
};

async function painted(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function download(page, button, file) {
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  await (await event).saveAs(new URL(file, output).pathname);
  await expect(
    page.getByRole("button", { name: button, exact: true }),
  ).toBeEnabled();
  const bytes = await readFile(new URL(file, output));
  assert(bytes.length > 0);
  downloads.push({
    file,
    bytes: bytes.length,
    sha256: sha(bytes),
    source: "Actual candidate UI download",
  });
  return bytes;
}
async function decodedPng(
  page,
  bytes,
  label,
  expectedDimensions,
  transparent = false,
) {
  const decoded = await page.evaluate(
    async (input) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(input)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let opaque = 0,
        clear = 0,
        dirtyTransparent = 0;
      const alpha = new Set();
      for (let n = 0; n < pixels.length; n += 4) {
        alpha.add(pixels[n + 3]);
        if (pixels[n + 3]) opaque++;
        else {
          clear++;
          if (pixels[n] || pixels[n + 1] || pixels[n + 2]) dirtyTransparent++;
        }
      }
      const digest = await crypto.subtle.digest("SHA-256", pixels);
      const pixelSha256 = [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      image.close();
      return {
        width: canvas.width,
        height: canvas.height,
        opaque,
        clear,
        dirtyTransparent,
        alpha: [...alpha].sort((a, b) => a - b),
        pixelSha256,
      };
    },
    [...bytes],
  );
  if (expectedDimensions)
    assert.deepEqual(
      [decoded.width, decoded.height],
      expectedDimensions,
      label,
    );
  assert(decoded.opaque > 0, `${label}: empty image`);
  if (transparent) {
    assert(decoded.clear > 0, `${label}: transparent area missing`);
    assert.equal(
      decoded.dirtyTransparent,
      0,
      `${label}: dirty transparent texels`,
    );
    assert.deepEqual(
      decoded.alpha,
      [0, 255],
      `${label}: runtime alpha contract`,
    );
  }
  decodedPngs.push({ file: label, ...decoded });
  return decoded;
}
async function inspectArchive(page, bytes, file, extractPrefix) {
  const entries = unzipSync(bytes),
    members = {};
  assert(Object.keys(entries).length);
  for (const [name, data] of Object.entries(entries)) {
    assert(
      data.length && !name.startsWith("/") && !name.split("/").includes(".."),
      `Unsafe/empty archive member: ${name}`,
    );
    members[name] = { bytes: data.length, sha256: sha(data) };
    if (name.endsWith(".json")) JSON.parse(Buffer.from(data).toString());
    if (name.endsWith(".png"))
      await decodedPng(
        page,
        data,
        `${file}!${name}`,
        name.startsWith("slots/") ? [192, 256] : undefined,
        name.startsWith("slots/"),
      );
    if (extractPrefix) {
      const target = new URL(`${extractPrefix}${name}`, output);
      await mkdir(new URL("./", target), { recursive: true });
      await writeFile(target, data);
    }
  }
  archives.push({ file, bytes: bytes.length, sha256: sha(bytes), members });
  return entries;
}
async function captureCanvas(page, file) {
  await painted(page);
  const url = await page
    .locator("#mother-study-canvas")
    .evaluate((canvas) => canvas.toDataURL("image/png"));
  const bytes = Buffer.from(url.split(",")[1], "base64");
  await writeFile(new URL(file, output), bytes);
  return bytes;
}
async function consumerPixels(player, pngBytes) {
  // Compare to the actual downloaded candidate PNG; match the consumer's existing
  // anchor guides too so every pixel, including transparent areas, is checked.
  return player.getByTestId("consumer-canvas").evaluate(
    async (canvas, input) => {
      const image = await createImageBitmap(
        new Blob([new Uint8Array(input)], { type: "image/png" }),
      );
      const expected = document.createElement("canvas");
      expected.width = canvas.width;
      expected.height = canvas.height;
      const context = expected.getContext("2d");
      const originX = Math.round(canvas.width / 2);
      const top = Math.floor((canvas.height - 256) / 2),
        anchorY = top + 240;
      context.strokeStyle = "#c7c4d1";
      context.lineWidth = 1;
      context.setLineDash([4, 5]);
      context.beginPath();
      context.moveTo(24, anchorY + 0.5);
      context.lineTo(canvas.width - 24, anchorY + 0.5);
      context.stroke();
      context.setLineDash([]);
      context.drawImage(image, originX - 96, top);
      context.strokeStyle = "#7762d6";
      context.beginPath();
      context.moveTo(originX - 5, anchorY + 0.5);
      context.lineTo(originX + 5, anchorY + 0.5);
      context.moveTo(originX + 0.5, anchorY - 5);
      context.lineTo(originX + 0.5, anchorY + 5);
      context.stroke();
      const actual = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      const wanted = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let mismatchedChannels = 0;
      for (let n = 0; n < actual.length; n++)
        if (actual[n] !== wanted[n]) mismatchedChannels++;
      image.close();
      return {
        width: canvas.width,
        height: canvas.height,
        mismatchedChannels,
        equal: mismatchedChannels === 0,
      };
    },
    [...pngBytes],
  );
}

const server = await createServer({
  root: root.pathname,
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor: 1,
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(origin + "/")) {
      externalRequests.push(url);
      return route.abort();
    }
    return route.continue();
  });
  const candidate = await context.newPage();
  await candidate.goto(origin + "/mother-study.html");
  await expect(
    candidate.getByRole("button", { name: "Standing", exact: true }),
  ).toBeEnabled();
  const posePngs = {};
  for (const facing of ["right", "left"]) {
    await candidate.getByLabel("Facing", { exact: true }).selectOption(facing);
    await candidate.getByLabel("Zoom", { exact: true }).selectOption("1");
    const sheet = await download(
      candidate,
      "Download four-pose PNG sheet",
      `four-poses-${facing}-1x.png`,
    );
    await decodedPng(
      candidate,
      sheet,
      `four-poses-${facing}-1x.png`,
      [768, 256],
      true,
    );
    for (const [id, label] of poses) {
      await candidate.getByRole("button", { name: label, exact: true }).click();
      const file = `${id}-${facing}-1x.png`;
      const png = await download(candidate, "Download current pose PNG", file);
      posePngs[`${id}-${facing}`] = png;
      const checked = await decodedPng(candidate, png, file, [192, 256], true);
      const displayed = await captureCanvas(
        candidate,
        `${id}-${facing}-canvas-1x.png`,
      );
      const decoded = await decodedPng(
        candidate,
        displayed,
        `${id}-${facing}-canvas-1x.png`,
        [192, 256],
        true,
      );
      assert.equal(
        checked.pixelSha256,
        decoded.pixelSha256,
        `${id}/${facing}: exported pixels differ from displayed pixels`,
      );
      editorPoses.push({
        pose: id,
        facing,
        exportedPng: file,
        pixelSha256: checked.pixelSha256,
        displayPixelsMatchExport: true,
      });
      if (facing === "right") {
        await candidate.getByLabel("Zoom", { exact: true }).selectOption("2");
        await painted(candidate);
        await candidate.locator(".mother-stage").screenshot({
          path: new URL(`ui-${id}-right-2x.png`, output).pathname,
        });
        await candidate.getByLabel("Bones", { exact: true }).check();
        await painted(candidate);
        await candidate.locator(".mother-stage").screenshot({
          path: new URL(`ui-${id}-bones-right-2x.png`, output).pathname,
        });
        await candidate.getByLabel("Bones", { exact: true }).uncheck();
        await candidate.getByLabel("Zoom", { exact: true }).selectOption("1");
      }
    }
  }
  // Prove mirrors and sheets use each exported frame exactly once, in documented order.
  result.sheetAndMirrorChecks = await candidate.evaluate(
    async ({ outputPath }) => {
      const decode = async (name) => {
        const image = await createImageBitmap(
          await (await fetch(`/${outputPath}${name}`)).blob(),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").drawImage(image, 0, 0);
        image.close();
        return {
          width: canvas.width,
          pixels: canvas
            .getContext("2d")
            .getImageData(0, 0, canvas.width, canvas.height).data,
        };
      };
      const ids = ["standing", "walk-contact", "run-flight", "celebrate"],
        checks = [];
      const sheets = {
        right: await decode("four-poses-right-1x.png"),
        left: await decode("four-poses-left-1x.png"),
      };
      for (let index = 0; index < ids.length; index++) {
        const id = ids[index],
          right = await decode(`${id}-right-1x.png`),
          left = await decode(`${id}-left-1x.png`);
        let mirror = true,
          sheetsExact = true;
        for (let y = 0; y < 256; y++)
          for (let x = 0; x < 192; x++)
            for (let c = 0; c < 4; c++) {
              const n = (y * 192 + x) * 4 + c;
              if (left.pixels[n] !== right.pixels[(y * 192 + 191 - x) * 4 + c])
                mirror = false;
              if (
                sheets.right.pixels[(y * 768 + index * 192 + x) * 4 + c] !==
                  right.pixels[n] ||
                sheets.left.pixels[(y * 768 + index * 192 + x) * 4 + c] !==
                  left.pixels[n]
              )
                sheetsExact = false;
            }
        checks.push({
          pose: id,
          exactMirror: mirror,
          exactSheetCells: sheetsExact,
        });
      }
      return checks;
    },
    { outputPath },
  );
  assert(
    result.sheetAndMirrorChecks.every(
      (check) => check.exactMirror && check.exactSheetCells,
    ),
  );
  await candidate.getByLabel("Facing", { exact: true }).selectOption("right");
  await candidate.getByLabel("Zoom", { exact: true }).selectOption("2");
  await candidate
    .getByRole("button", { name: "Standing", exact: true })
    .click();
  await painted(candidate);
  await candidate.screenshot({
    path: new URL("candidate-viewer.png", output).pathname,
    fullPage: true,
  });
  const studyBytes = await download(
    candidate,
    "Download pose-study archive",
    "reference-mother.pose-study.zip",
  );
  const studyFiles = await inspectArchive(
    candidate,
    studyBytes,
    "reference-mother.pose-study.zip",
    "pose-study/",
  );
  assert.deepEqual(Object.keys(studyFiles).sort(), [
    "README.txt",
    "layer-registration.json",
    "poses.json",
    "project.rig.zip",
    "study.json",
  ]);
  assert.equal(
    JSON.parse(Buffer.from(studyFiles["poses.json"]).toString()).poses.length,
    4,
  );
  await inspectArchive(
    candidate,
    studyFiles["project.rig.zip"],
    "reference-mother.pose-study.zip!project.rig.zip",
  );
  const packBytes = await download(
    candidate,
    "Download static-hold CharacterPack",
    "reference-mother-static-holds.character.zip",
  );
  const packFiles = await inspectArchive(
    candidate,
    packBytes,
    "reference-mother-static-holds.character.zip",
    "static-holds/",
  );
  assert.deepEqual(Object.keys(packFiles).sort(), [
    "INTEGRATION.md",
    "PROVENANCE.txt",
    "character.json",
    "manifest.json",
    "spritesheet.png",
  ]);
  const manifest = JSON.parse(
    Buffer.from(packFiles["manifest.json"]).toString(),
  );
  assert.deepEqual(manifest.animations, {
    idle: { frames: [0], fps: 1, loop: false },
    walk: { frames: [1], fps: 1, loop: false },
    run: { frames: [2], fps: 1, loop: false },
  });
  result.characterPack = {
    frames: manifest.frames.length,
    animations: manifest.animations,
    generator: manifest.generator,
    containsCelebration: false,
  };
  result.determinismAndPackPixels = await candidate.evaluate(
    async ({ outputPath }) => {
      const { importProject } = await import("/src/skeletal/skin-io.ts");
      const { parseMotherPoseStudy, bakeStudyHolds } = await import(
        "/src/skeletal/mother-study.ts"
      );
      const project = await importProject(
        await (await fetch(`/${outputPath}pose-study/project.rig.zip`)).blob(),
      );
      const study = parseMotherPoseStudy(
        await (await fetch(`/${outputPath}pose-study/poses.json`)).json(),
        project,
      );
      const first = bakeStudyHolds(project, study),
        second = bakeStudyHolds(project, study);
      const image = await createImageBitmap(
        await (
          await fetch(`/${outputPath}static-holds/spritesheet.png`)
        ).blob(),
      );
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      image.close();
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return {
        deterministic: first.pixels.every(
          (value, n) => value === second.pixels[n],
        ),
        decodedExportMatches: first.pixels.every(
          (value, n) => value === rgba[n],
        ),
        dimensions: [canvas.width, canvas.height],
      };
    },
    { outputPath },
  );
  assert(
    result.determinismAndPackPixels.deterministic &&
      result.determinismAndPackPixels.decodedExportMatches,
  );
  assert.deepEqual(result.determinismAndPackPixels.dimensions, [576, 256]);
  log(
    "Downloaded all four poses in both directions, pose archive and static-hold CharacterPack; PNGs match actual UI pixels.",
  );

  await candidate.close();
  assert.equal(context.pages().length, 0);
  result.candidateClosedBeforePlayer = true;
  const player = await context.newPage();
  await player.route(
    /\/src\/(skeletal\/|experiments\/|editor\/|core\/(generator|running-rig|cohesive|polished|harmonized|illustrated|expressive))/,
    (route) => {
      forbiddenGeneratorRequests.push(route.request().url());
      return route.abort();
    },
  );
  await player.goto(origin + "/player.html");
  await player
    .locator("#player-zip")
    .setInputFiles(
      new URL("reference-mother-static-holds.character.zip", output).pathname,
    );
  await expect(
    player.getByText("Loaded: Reference mother — static pose holds", {
      exact: true,
    }),
  ).toBeVisible();
  await player.locator("#player-zoom").selectOption("1");
  await expect(
    player.getByRole("button", { name: "Jump", exact: true }),
  ).toBeDisabled();
  for (const facing of ["right", "left"]) {
    await player
      .getByRole("button", {
        name: facing === "right" ? "Right" : "Left",
        exact: true,
      })
      .click();
    for (const [index, action] of ["idle", "walk", "run"].entries()) {
      await player
        .getByRole("button", {
          name: action[0].toUpperCase() + action.slice(1),
          exact: true,
        })
        .click();
      await painted(player);
      const before = await consumerPixels(
        player,
        posePngs[`${poses[index][0]}-${facing}`],
      );
      assert(
        before.equal,
        `${action}/${facing}: displayed still differs from downloaded PNG`,
      );
      const play = player.getByRole("button", {
        name: "Play animation",
        exact: true,
      });
      if (await play.count()) await play.click();
      await expect(
        player.getByRole("button", { name: "Replay animation", exact: true }),
      ).toBeVisible({ timeout: 4000 });
      await painted(player);
      const after = await consumerPixels(
        player,
        posePngs[`${poses[index][0]}-${facing}`],
      );
      assert(
        after.equal,
        `${action}/${facing}: hold after declared duration changed`,
      );
      const file = `player-${action}-${facing}-static-hold.png`;
      await player
        .locator(".player-preview-panel")
        .count()
        .then(async (count) => {
          if (count)
            await player
              .locator(".player-preview-panel")
              .screenshot({ path: new URL(file, output).pathname });
          else
            await player.screenshot({
              path: new URL(file, output).pathname,
              fullPage: true,
            });
        });
      playback.push({
        action,
        pose: poses[index][0],
        facing,
        sourceFrame: index,
        declaredDurationMs: 1000,
        frameCount: 1,
        loop: false,
        before,
        after,
        completedAndHeld: true,
        screenshot: file,
      });
    }
  }
  log(
    "Independent player verified all three static holds in both directions after candidate page closed.",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(forbiddenGeneratorRequests, []);
  const afterHashes = await fileHashes(sourcePaths);
  assert.deepEqual(
    afterHashes,
    inputHashes,
    "Source/assets changed during evidence capture; preserve this phase and rerun against final inputs.",
  );
  result.sourcesUnchangedDuringCapture = true;
  // Decode every delivered PNG, including UI screenshots, rather than only checking existence.
  for (const file of await readdir(output, { recursive: true }))
    if (
      file.endsWith(".png") &&
      !decodedPngs.some((entry) => entry.file === file)
    )
      await decodedPng(player, await readFile(new URL(file, output)), file);
  result.outputFiles = {};
  for (const file of (await readdir(output, { recursive: true })).sort()) {
    if (!/\.(png|zip|json|txt|md)$/.test(file)) continue;
    const bytes = await readFile(new URL(file, output));
    assert(bytes.length, `Empty delivery file: ${file}`);
    result.outputFiles[file] = { bytes: bytes.length, sha256: sha(bytes) };
  }
  result.executedAt = new Date().toISOString();
  result.status = "passed";
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(result, null, 2) + "\n",
  );
  await context.close();
  log(
    `Evidence saved to ${outputPath}; ${editorPoses.length} pose exports and ${playback.length} independent static-hold checks.`,
  );
} catch (error) {
  result.status = "failed";
  result.failure = error instanceof Error ? error.stack : String(error);
  result.executedAt = new Date().toISOString();
  await writeFile(
    new URL("evidence-index.failed.json", output),
    JSON.stringify(result, null, 2) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
