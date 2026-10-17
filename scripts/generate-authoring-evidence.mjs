// Evidence is captured through the real authoring UI and its file downloads.
// Module calls below only verify downloads; they do not inject editing state.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const output = new URL("docs/authoring-tools/", root);
const port = Number(process.env.AUTHORING_PORT || 5186);
const origin = `http://127.0.0.1:${port}`;
const ids = ["denim-daytrip", "coral-afternoon"];
const sourceFiles = [
  "src/skeletal/Studio.tsx",
  "src/skeletal/studio.css",
  "src/skeletal/BindingCanvas.tsx",
  "src/skeletal/binding-edit.ts",
  "src/skeletal/binding-editor.css",
  "src/skeletal/MotionEditor.tsx",
  "src/skeletal/motion-edit.ts",
  "src/skeletal/motion-editor.css",
  "src/skeletal/history.ts",
  "src/skeletal/types.ts",
  "src/skeletal/builtins.ts",
  "src/skeletal/definition.ts",
  "src/skeletal/renderer.ts",
  "src/skeletal/bake.ts",
  "src/skeletal/skin-io.ts",
  "src/consumer/player.ts",
  "src/consumer/PackPlayer.tsx",
  "scripts/generate-authoring-evidence.mjs",
  "scripts/render-authoring-review.py",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function hashes() {
  return Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (name) => [
        name,
        sha(await readFile(new URL(name, root))),
      ]),
    ),
  );
}
const initialHashes = await hashes();
await mkdir(output, { recursive: true });
await mkdir(new URL("ui-steps/", output), { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [],
  external = [],
  forbidden = [],
  steps = [],
  exports = [],
  playback = [];
const archiveReports = [];
async function unpack(path, directory) {
  const bytes = await readFile(path),
    entries = unzipSync(bytes);
  assert(bytes.length > 0 && Object.keys(entries).length > 0);
  const members = {};
  for (const [name, data] of Object.entries(entries)) {
    assert(data.length > 0 && !name.includes("..") && !name.startsWith("/"));
    members[name] = { bytes: data.length, sha256: sha(data) };
    if (directory) {
      const target = new URL(name, directory);
      await mkdir(new URL("./", target), { recursive: true });
      await writeFile(target, data);
    }
  }
  archiveReports.push({
    file: path.replace(output.pathname, ""),
    bytes: bytes.length,
    sha256: sha(bytes),
    members,
  });
  return entries;
}
async function download(page, button, file, extract) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const path = new URL(file, output).pathname;
  await (await pending).saveAs(path);
  await page.getByRole("button", { name: button, exact: true }).waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".skin-workspace").disabled,
  );
  return unpack(path, extract ? new URL(extract, output) : undefined);
}
async function painted(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function posedPng(page) {
  await painted(page);
  return page
    .locator("#skin-posed-canvas")
    .evaluate((canvas) => canvas.toDataURL());
}
async function screenshotStep(page, label, filename) {
  await painted(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: new URL(`ui-steps/${filename}.png`, output).pathname,
  });
  steps.push({ file: `ui-steps/${filename}.png`, label, durationMs: 1300 });
}
async function pngEqual(page, left, right) {
  return page.evaluate(
    async ({ left, right }) => {
      async function pixels(bytes) {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        image.close();
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const a = await pixels(left),
        b = await pixels(right);
      return a.length === b.length && a.every((value, i) => value === b[i]);
    },
    { left: [...left], right: [...right] },
  );
}
try {
  const context = await browser.newContext({
    viewport: { width: 1560, height: 1400 },
    deviceScaleFactor: 1,
  });
  context.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin))
      external.push(request.url());
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  const studio = await context.newPage();
  await studio.goto(origin + "/skin-studio.html");
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  const defaults = [];
  for (const id of ids) {
    await studio.getByLabel("Example skin", { exact: true }).selectOption(id);
    const entries = await download(
      studio,
      "Export CharacterPack",
      `${id}-default.character.zip`,
      `${id}/default/`,
    );
    const previousPng = await readFile(
      new URL(`docs/reusable-rig/${id}/spritesheet.png`, root),
    );
    assert(
      await pngEqual(studio, entries["spritesheet.png"], previousPng),
      `${id}: default export changed historical pixels`,
    );
    const previousManifest = JSON.parse(
      await readFile(
        new URL(`docs/reusable-rig/${id}/manifest.json`, root),
        "utf8",
      ),
    );
    assert.deepEqual(
      JSON.parse(Buffer.from(entries["manifest.json"]).toString()),
      previousManifest,
      `${id}: default manifest changed`,
    );
    defaults.push({
      id,
      historicalPng: `docs/reusable-rig/${id}/spritesheet.png`,
      actualUiDefaultExportPixelsEqual: true,
      manifestEqual: true,
    });
  }
  await studio.getByLabel("Example skin", { exact: true }).selectOption(ids[0]);
  await studio
    .getByLabel("Attachment", { exact: true })
    .selectOption("near-forearm");
  await screenshotStep(
    studio,
    "1. Select the near forearm; source handles stay in native coordinates.",
    "01-select-forearm",
  );
  const elbow = studio.getByRole("button", {
    name: "Elbow joint",
    exact: true,
  });
  const original = [
    Number(await elbow.getAttribute("data-x")),
    Number(await elbow.getAttribute("data-y")),
  ];
  const originalPose = await posedPng(studio);
  const box = await elbow.boundingBox();
  assert(box);
  await studio.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await studio.mouse.down();
  await studio.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2, {
    steps: 5,
  });
  await studio.mouse.up();
  await painted(studio);
  assert.equal(Number(await elbow.getAttribute("data-x")), original[0] + 2);
  const movedPose = await posedPng(studio);
  assert.notEqual(
    movedPose,
    originalPose,
    "Elbow drag did not affect posed pixels",
  );
  await screenshotStep(
    studio,
    "2. Drag elbow +2 native pixels. One drag is one undoable edit.",
    "02-drag-elbow",
  );
  await studio.getByRole("button", { name: "Undo edit", exact: true }).click();
  assert.equal(Number(await elbow.getAttribute("data-x")), original[0]);
  assert.equal(
    await posedPng(studio),
    originalPose,
    "Undo did not restore posed pixels",
  );
  await screenshotStep(
    studio,
    "3. Undo restores the original binding.",
    "03-undo",
  );
  await studio.getByRole("button", { name: "Redo edit", exact: true }).click();
  assert.equal(Number(await elbow.getAttribute("data-x")), original[0] + 2);
  assert.equal(
    await posedPng(studio),
    movedPose,
    "Redo did not restore moved pixels",
  );
  await screenshotStep(
    studio,
    "4. Redo reapplies it. We undo again before exporting this timing example.",
    "04-redo",
  );
  await studio.getByRole("button", { name: "Undo edit", exact: true }).click();
  assert.equal(Number(await elbow.getAttribute("data-x")), original[0]);
  for (const [label, value] of [
    ["Motion FPS", "15"],
    ["Body bob (px)", "3"],
  ]) {
    const input = studio.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.press("Enter");
  }
  await studio
    .getByRole("button", { name: "Hold this pose", exact: true })
    .click();
  await studio
    .getByRole("button", { name: "Playback frame 1, pose 1", exact: true })
    .click();
  await screenshotStep(
    studio,
    "5. Shared run: 15 FPS, pose 1 bob 3 px, and a two-frame hold. Technical example only.",
    "05-edit-motion",
  );
  let editedMotion, editedRig;
  for (const id of ids) {
    await studio.getByLabel("Example skin", { exact: true }).selectOption(id);
    if (id === ids[1])
      await screenshotStep(
        studio,
        "6. Swap to Coral: its own bindings, the same edited skeleton and motion data.",
        "06-swap-skin",
      );
    const project = await download(studio, "Save project ZIP", `${id}.rig.zip`);
    const metadata = JSON.parse(
      Buffer.from(project["project.json"]).toString(),
    );
    const skin = JSON.parse(Buffer.from(project["skin.json"]).toString());
    const defaultSkin = JSON.parse(
      await readFile(
        new URL(`docs/reusable-rig/${id}/skin/skin.json`, root),
        "utf8",
      ),
    );
    assert.deepEqual(skin.bindings, defaultSkin.bindings);
    assert.equal(metadata.motions.clips.run.fps, 15);
    assert.equal(metadata.motions.clips.run.keys[0].bodyBob, 3);
    assert.deepEqual(
      metadata.motions.clips.run.sequence,
      [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    );
    if (editedMotion) {
      assert.deepEqual(metadata.motions, editedMotion);
      assert.deepEqual(metadata.rig, editedRig);
    }
    editedMotion = metadata.motions;
    editedRig = metadata.rig;
    const pack = await download(
      studio,
      "Export CharacterPack",
      `${id}.character.zip`,
      `${id}/`,
    );
    const manifest = JSON.parse(Buffer.from(pack["manifest.json"]).toString());
    assert.deepEqual(manifest.animations.run, {
      frames: [12, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      fps: 15,
      loop: true,
    });
    await studio
      .getByLabel("Import project file", { exact: true })
      .setInputFiles(new URL(`${id}.rig.zip`, output).pathname);
    await studio
      .locator(".skin-notice[role=status]")
      .filter({ hasText: "project opened" })
      .waitFor();
    const reopened = await download(
      studio,
      "Export CharacterPack",
      `${id}-reopened.character.zip`,
    );
    assert(
      await pngEqual(
        studio,
        pack["spritesheet.png"],
        reopened["spritesheet.png"],
      ),
      `${id}: reopened project changed pixels`,
    );
    assert.deepEqual(
      JSON.parse(Buffer.from(reopened["manifest.json"]).toString()),
      manifest,
    );
    const decoded = await studio.evaluate(
      async ({ projectPath, packPath }) => {
        const { importProject } = await import("/src/skeletal/skin-io.ts");
        const { bakeProject } = await import("/src/skeletal/bake.ts");
        const { loadCharacterPack } = await import("/src/core/pack.ts");
        const project = await importProject(
          await (await fetch(projectPath)).blob(),
        );
        const bake = bakeProject(project),
          pack = await loadCharacterPack(await (await fetch(packPath)).blob());
        const canvas = document.createElement("canvas");
        canvas.width = bake.width;
        canvas.height = bake.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(pack.image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        return {
          pngDecodePixelEquality: pixels.every((p, i) => p === bake.pixels[i]),
          alpha: [...new Set(pixels.filter((_, i) => i % 4 === 3))].sort(),
        };
      },
      {
        projectPath: `/docs/authoring-tools/${id}.rig.zip`,
        packPath: `/docs/authoring-tools/${id}.character.zip`,
      },
    );
    assert(decoded.pngDecodePixelEquality);
    assert.deepEqual(decoded.alpha, [0, 255]);
    exports.push({
      id,
      name: skin.name,
      exportedBindingsEqualHistoricalDefault: true,
      fullProjectReopenPixelEquality: true,
      fullProjectReopenManifestEquality: true,
      ...decoded,
    });
  }
  await studio.screenshot({
    path: new URL("studio-desktop.png", output).pathname,
    fullPage: true,
  });
  await studio.setViewportSize({ width: 390, height: 844 });
  await studio.screenshot({
    path: new URL("studio-mobile.png", output).pathname,
    fullPage: true,
  });
  const mobileWidth = await studio.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert(
    mobileWidth.document <= mobileWidth.viewport,
    "Mobile page overflows horizontally",
  );
  await studio.close();
  assert.equal(context.pages().length, 0);
  const player = await context.newPage();
  await player.setViewportSize({ width: 1280, height: 960 });
  await player.route(
    /\/src\/(skeletal\/|experiments\/|editor\/|core\/(generator|running-rig|cohesive|polished|harmonized|illustrated|expressive))/,
    (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    },
  );
  await player.goto(origin + "/player.html");
  for (const id of ids) {
    await player
      .locator("#player-zip")
      .setInputFiles(new URL(`${id}.character.zip`, output).pathname);
    await player
      .getByText(`Loaded: ${exports.find((item) => item.id === id).name}`, {
        exact: true,
      })
      .waitFor();
    await player.locator("#player-zoom").selectOption("1");
    await player.getByRole("button", { name: "Run", exact: true }).click();
    for (const facing of ["right", "left"]) {
      await player
        .getByRole("button", {
          name: facing === "right" ? "Right" : "Left",
          exact: true,
        })
        .click();
      const observed = await player.getByTestId("consumer-canvas").evaluate(
        async (canvas, { id, facing }) => {
          const manifest = await (
            await fetch(`/docs/authoring-tools/${id}/manifest.json`)
          ).json();
          const sheet = await createImageBitmap(
            await (
              await fetch(`/docs/authoring-tools/${id}/spritesheet.png`)
            ).blob(),
          );
          const clip = manifest.animations.run,
            expected = new Map();
          const originX = Math.round(canvas.width / 2),
            top = Math.floor((canvas.height - 256) / 2),
            anchorY = top + manifest.anchor.y;
          for (const frameId of new Set(clip.frames)) {
            const frame = manifest.frames.find((f) => f.id === frameId),
              reference = document.createElement("canvas");
            reference.width = canvas.width;
            reference.height = canvas.height;
            const ctx = reference.getContext("2d");
            ctx.strokeStyle = "#c7c4d1";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.moveTo(24, anchorY + 0.5);
            ctx.lineTo(canvas.width - 24, anchorY + 0.5);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.translate(originX, anchorY);
            ctx.scale(facing === "left" ? -1 : 1, 1);
            ctx.drawImage(
              sheet,
              frame.x,
              frame.y,
              192,
              256,
              -manifest.anchor.x,
              -manifest.anchor.y,
              192,
              256,
            );
            ctx.restore();
            ctx.strokeStyle = "#7762d6";
            ctx.beginPath();
            ctx.moveTo(originX - 5, anchorY + 0.5);
            ctx.lineTo(originX + 5, anchorY + 0.5);
            ctx.moveTo(originX + 0.5, anchorY - 5);
            ctx.lineTo(originX + 0.5, anchorY + 5);
            ctx.stroke();
            expected.set(
              frameId,
              ctx.getImageData(originX - 96, top, 192, 256).data,
            );
          }
          sheet.close();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const seen = new Set(),
            transitions = [];
          let previous;
          const ctx = canvas.getContext("2d"),
            start = performance.now(),
            loopMs = (clip.frames.length * 1000) / clip.fps;
          while (performance.now() < start + loopMs * 3 + 150) {
            const pixels = ctx.getImageData(originX - 96, top, 192, 256).data;
            // Canvas draw and React's aria-label commit have separate clocks.
            // Identify each pose from its actual complete RGBA pixels instead.
            const matches = [...expected]
              .filter(([, reference]) =>
                reference.every((value, i) => value === pixels[i]),
              )
              .map(([frame]) => frame);
            if (matches.length !== 1)
              throw Error(
                `${id}/${facing}: expected one exact exported PNG match, got ${matches.length}; aria=${canvas.getAttribute("aria-label")}`,
              );
            const frame = matches[0];
            seen.add(frame);
            if (frame !== previous) {
              transitions.push({
                frame,
                ms: Math.round(performance.now() - start),
              });
              previous = frame;
            }
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
          return {
            expectedFrames: [...expected.keys()].sort((a, b) => a - b),
            pixelVerifiedFrames: [...seen].sort((a, b) => a - b),
            transitions,
            nominalLoopMs: loopMs,
            fps: clip.fps,
            sequence: clip.frames,
          };
        },
        { id, facing },
      );
      assert.deepEqual(observed.pixelVerifiedFrames, observed.expectedFrames);
      for (let i = 1; i < observed.transitions.length; i++)
        assert.equal(
          observed.transitions[i].frame,
          12 + ((observed.transitions[i - 1].frame - 12 + 1) % 12),
        );
      playback.push({
        id,
        animation: "run",
        facing,
        fullNativeFramePixelEquality: true,
        ...observed,
      });
      console.log(
        `Independent playback: ${id}/${facing}, all 12 keys, edited 13-entry sequence at 15 FPS.`,
      );
    }
    await player.locator("#player-zoom").selectOption("2");
    await player.screenshot({
      path: new URL(`${id}/independent-player.png`, output).pathname,
      fullPage: true,
    });
  }
  await context.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(forbidden, []);
  assert.deepEqual(
    await hashes(),
    initialHashes,
    "Sources changed during capture; rerun after freeze",
  );
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source:
          "Real Skin Studio pointer/keyboard controls and ZIP downloads; no state injection. Decoder/module calls verify downloaded data only.",
        captureMethodNote:
          "The first capture stopped in independent playback because it required React's aria-label and the canvas paint to update simultaneously. The completed capture identifies every sampled pose by its unique full-native RGBA equality with an exported PNG frame; every sample must have exactly one match. No app code changed for this observer correction.",
        sourceFiles: initialHashes,
        defaults,
        steps,
        mobileWidth,
        sharedRigEqualAcrossSkins: true,
        sharedEditedMotionsEqualAcrossSkins: true,
        dragUndoRedoPixelEquality: true,
        bindingRestoredBeforeExports: true,
        editedMotion: {
          fps: 15,
          sequence: editedMotion.clips.run.sequence,
          key0BodyBob: 3,
        },
        exports,
        archives: archiveReports,
        authoringClosedBeforeConsumer: true,
        playback,
        errors,
        external,
        forbidden,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Captured ${steps.length} UI states, ${archiveReports.length} actual downloaded ZIPs, ${playback.length} independent playback cases.`,
  );
} finally {
  await browser.close();
  await server.close();
}
