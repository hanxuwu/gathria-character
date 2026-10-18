// Evidence uses real Skin Studio controls and downloads. Modules only verify downloads.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const phase = process.env.EVIDENCE_PHASE || "final";
assert(
  /^[a-z0-9-]+$/.test(phase),
  "EVIDENCE_PHASE must be a simple directory name",
);
const outputPath = `docs/generated-traveler/${phase}/`;
const output = new URL(outputPath, root);
const prepared = new URL("artwork/generated-traveler/prepared/", root);
const origin = `http://127.0.0.1:${Number(process.env.FRESH_CHARACTER_PORT || 5189)}`;
const actions = ["idle", "walk", "run", "jump"];
const sourceFiles = [
  "src/skeletal/Studio.tsx",
  "src/skeletal/WardrobePanel.tsx",
  "src/skeletal/WardrobeLibrary.tsx",
  "src/skeletal/wardrobe-types.ts",
  "src/skeletal/wardrobe.ts",
  "src/skeletal/wardrobe-items.ts",
  "src/skeletal/wardrobe-item-io.ts",
  "src/skeletal/bounded-archive.ts",
  "src/skeletal/wardrobe-panel.css",
  "src/skeletal/wardrobe-assets.generated.ts",
  "src/skeletal/definition.ts",
  "src/skeletal/builtins.ts",
  "src/skeletal/skin-io.ts",
  "src/skeletal/renderer.ts",
  "src/skeletal/bake.ts",
  "src/skeletal/types.ts",
  "src/consumer/PackPlayer.tsx",
  "src/consumer/player.ts",
  "src/core/pack.ts",
  "scripts/generate-fresh-character-evidence.mjs",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashes = async () =>
  Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => [
        file,
        sha(await readFile(new URL(file, root))),
      ]),
    ),
  );
const initialHashes = await hashes();
const inputFiles = [
  "traveler.skin.zip",
  "traveler.rig.zip",
  ...["top", "bottom", "shoes"].map(
    (group) => `traveler-${group}.wardrobe.zip`,
  ),
];
const inputHashes = Object.fromEntries(
  await Promise.all(
    inputFiles.map(async (name) => [
      name,
      sha(await readFile(new URL(name, prepared))),
    ]),
  ),
);
await mkdir(output, { recursive: true });
const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: Number(new URL(origin).port),
    strictPort: true,
  },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const archives = [],
  exports = [],
  playback = [],
  errors = [],
  external = [],
  forbidden = [],
  roundtrips = [],
  identityChecks = [],
  editorFrames = [],
  itemRoundtrips = [],
  sourceParts = [];
async function painted(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function download(page, button, file, extract) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: button, exact: true }).click();
  const path = new URL(file, output).pathname;
  await (await pending).saveAs(path);
  await page.waitForFunction(
    () => !document.querySelector(".skin-workspace").disabled,
  );
  const bytes = await readFile(path),
    entries = unzipSync(bytes),
    members = {};
  assert(bytes.length && Object.keys(entries).length);
  for (const [name, data] of Object.entries(entries)) {
    assert(data.length && !name.includes("..") && !name.startsWith("/"));
    members[name] = { bytes: data.length, sha256: sha(data) };
    if (extract) {
      const target = new URL(`${extract}${name}`, output);
      await mkdir(new URL("./", target), { recursive: true });
      await writeFile(target, data);
    }
  }
  archives.push({ file, bytes: bytes.length, sha256: sha(bytes), members });
  return entries;
}
async function pixelEqual(page, a, b) {
  return page.evaluate(
    async ({ a, b }) => {
      async function pixels(bytes) {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const result = {
          width: image.width,
          height: image.height,
          pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        };
        image.close();
        return result;
      }
      const left = await pixels(a),
        right = await pixels(b);
      return (
        left.width === right.width &&
        left.height === right.height &&
        left.pixels.every((value, i) => value === right.pixels[i])
      );
    },
    { a: [...a], b: [...b] },
  );
}
async function capture(page, id) {
  await page
    .getByLabel("Character name", { exact: true })
    .fill(id.replaceAll("-", " "));
  await page.getByLabel("Character name", { exact: true }).press("Tab");
  const project = await download(page, "Save project ZIP", `${id}.rig.zip`);
  const metadata = JSON.parse(Buffer.from(project["project.json"]).toString());
  const skin = JSON.parse(Buffer.from(project["skin.json"]).toString());
  const pack = await download(
    page,
    "Export CharacterPack",
    `${id}.character.zip`,
    `${id}/`,
  );
  const manifest = JSON.parse(Buffer.from(pack["manifest.json"]).toString());
  assert.deepEqual(Object.keys(manifest.animations), actions);
  assert.equal(manifest.frames.length, 36);
  assert.equal(manifest.animations.jump.loop, false);
  const checked = await page.evaluate(
    async ({ id, outputPath }) => {
      const { importProject } = await import("/src/skeletal/skin-io.ts");
      const { bakeProject } = await import("/src/skeletal/bake.ts");
      const { loadCharacterPack } = await import("/src/core/pack.ts");
      const project = await importProject(
        await (await fetch(`/${outputPath}${id}.rig.zip`)).blob(),
      );
      const bake = bakeProject(project);
      const loaded = await loadCharacterPack(
        await (await fetch(`/${outputPath}${id}.character.zip`)).blob(),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bake.width;
      canvas.height = bake.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(loaded.image, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return {
        pngDecodePixelEquality: rgba.every((v, i) => v === bake.pixels[i]),
        alpha: [...new Set(rgba.filter((_, i) => i % 4 === 3))].sort(),
        customItems: project.wardrobeItems?.length ?? 0,
      };
    },
    { id, outputPath },
  );
  assert(checked.pngDecodePixelEquality);
  assert.deepEqual(checked.alpha, [0, 255]);
  exports.push({ id, name: skin.name, recipe: metadata.wardrobe, ...checked });
  console.log(`Actual UI export ${id}: all 36 baked PNG poses match.`);
  return { project, metadata, pack, manifest };
}
async function openProject(page, path) {
  await page
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(path);
  await page
    .locator(".skin-notice[role=status]")
    .filter({ hasText: "project opened" })
    .waitFor();
  await painted(page);
}

async function canvasPng(page, selector, filename) {
  await painted(page);
  const base64 = await page
    .locator(selector)
    .evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  await mkdir(new URL("./", new URL(filename, output)), { recursive: true });
  const bytes = Buffer.from(base64, "base64");
  assert(bytes.length);
  await writeFile(new URL(filename, output), bytes);
  return bytes;
}

// Use UI-selected poses, not a second renderer, to compare the editor against
// the actual portable spritesheet. This includes mirrored native-size playback.
async function checkEditorFrames(page, id) {
  await page.getByLabel("Zoom", { exact: true }).selectOption("1");
  for (const label of ["Bones", "Mesh", "Skeleton only"])
    await page.getByLabel(label, { exact: true }).uncheck();
  const manifest = JSON.parse(
    await readFile(new URL(`${id}/manifest.json`, output), "utf8"),
  );
  for (const facing of ["right", "left"]) {
    await page.getByLabel("Facing", { exact: true }).selectOption(facing);
    for (const action of actions) {
      await page.getByLabel("Action", { exact: true }).selectOption(action);
      const clip = manifest.animations[action];
      for (
        let sequenceIndex = 0;
        sequenceIndex < clip.frames.length;
        sequenceIndex++
      ) {
        await page
          .getByLabel("Animation frame", { exact: true })
          .fill(String(sequenceIndex));
        await painted(page);
        const result = await page.locator("#skin-posed-canvas").evaluate(
          async (canvas, { frameId, facing, id, outputPath }) => {
            const manifest = await (
              await fetch(`/${outputPath}${id}/manifest.json`)
            ).json();
            const frame = manifest.frames.find((frame) => frame.id === frameId);
            const sheet = await createImageBitmap(
              await (await fetch(`/${outputPath}${id}/spritesheet.png`)).blob(),
            );
            const reference = document.createElement("canvas");
            reference.width = 192;
            reference.height = 256;
            const ctx = reference.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            if (facing === "left") {
              ctx.translate(192, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(sheet, frame.x, frame.y, 192, 256, 0, 0, 192, 256);
            sheet.close();
            const expected = ctx.getImageData(0, 0, 192, 256).data;
            const actual = canvas
              .getContext("2d")
              .getImageData(0, 0, 192, 256).data;
            return {
              exactPixels: actual.every(
                (value, index) => value === expected[index],
              ),
              frameId,
            };
          },
          { frameId: clip.frames[sequenceIndex], facing, id, outputPath },
        );
        assert(
          result.exactPixels,
          `${id}/${action}/${facing}/${sequenceIndex}: editor differs from exported PNG`,
        );
        editorFrames.push({ id, action, facing, sequenceIndex, ...result });
      }
      await page
        .getByLabel("Animation frame", { exact: true })
        .fill(action === "idle" ? "0" : "5");
      await canvasPng(
        page,
        "#skin-posed-canvas",
        `editor/${action}-${facing}-1x.png`,
      );
    }
  }
  await page.getByLabel("Facing", { exact: true }).selectOption("right");
  await page.getByLabel("Zoom", { exact: true }).selectOption("2");
  for (const action of actions) {
    await page.getByLabel("Action", { exact: true }).selectOption(action);
    await page
      .getByLabel("Animation frame", { exact: true })
      .fill(action === "idle" ? "0" : "5");
    await canvasPng(
      page,
      "#skin-posed-canvas",
      `editor/${action}-right-2x.png`,
    );
  }
  console.log(
    `Editor: ${editorFrames.length} timed frames/facings exactly match the actual exported PNG.`,
  );
}

async function sourceInspection(page, exported) {
  const skin = JSON.parse(
    Buffer.from(exported.project["skin.json"]).toString(),
  );
  await page.getByLabel("Zoom", { exact: true }).selectOption("1");
  for (const slot of skin.slots) {
    await page.getByLabel("Attachment", { exact: true }).selectOption(slot);
    const bytes = await canvasPng(
      page,
      "#skin-source-canvas",
      `isolated/${slot}-1x.png`,
    );
    assert(
      await pixelEqual(page, bytes, exported.project[`slots/${slot}.png`]),
      `${slot}: source panel changed the imported attachment`,
    );
    sourceParts.push({
      slot,
      exactSourcePixels: true,
      file: `isolated/${slot}-1x.png`,
      bytes: bytes.length,
      sha256: sha(bytes),
    });
  }
  await page
    .getByLabel("Attachment", { exact: true })
    .selectOption("near-forearm");
  await page.getByLabel("Action", { exact: true }).selectOption("run");
  await page.getByLabel("Animation frame", { exact: true }).fill("5");
  await page.getByLabel("Zoom", { exact: true }).selectOption("2");
  await page.getByLabel("Bones", { exact: true }).check();
  await page.getByLabel("Mesh", { exact: true }).check();
  await painted(page);
  await page
    .locator(".skin-preview-panel")
    .screenshot({
      path: new URL("studio-binding-inspection.png", output).pathname,
    });
  await page.getByLabel("Bones", { exact: true }).uncheck();
  await page.getByLabel("Mesh", { exact: true }).uncheck();
  await painted(page);
  await page.screenshot({
    path: new URL("studio-workflow.png", output).pathname,
    fullPage: true,
  });
}

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
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
  await openProject(studio, new URL("traveler.rig.zip", prepared).pathname);
  await studio
    .getByLabel("Expression", { exact: true })
    .selectOption("neutral");
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  await studio.getByLabel("Facing", { exact: true }).selectOption("left");
  const traveler = await capture(studio, "traveler-neutral");
  const savedSkin = await download(
    studio,
    "Save skin ZIP",
    "traveler.skin.zip",
  );
  const inputSkin = unzipSync(
    await readFile(new URL("traveler.skin.zip", prepared)),
  );
  for (const filename of Object.keys(inputSkin).filter((name) =>
    name.endsWith(".png"),
  ))
    assert(
      await pixelEqual(studio, inputSkin[filename], savedSkin[filename]),
      `Skin import/export changed ${filename}`,
    );
  await checkEditorFrames(studio, "traveler-neutral");
  await sourceInspection(studio, traveler);

  // Restore precisely the captured preview before saving/reopening again.
  await studio.reload();
  await openProject(
    studio,
    new URL("traveler-neutral.rig.zip", output).pathname,
  );
  for (const [label, value] of [
    ["Action", "run"],
    ["Facing", "left"],
    ["Expression", "neutral"],
  ])
    assert.equal(
      await studio.getByLabel(label, { exact: true }).inputValue(),
      value,
    );
  const reopened = await download(
    studio,
    "Export CharacterPack",
    "traveler-reopened.character.zip",
  );
  assert.deepEqual(
    JSON.parse(Buffer.from(reopened["manifest.json"]).toString()),
    traveler.manifest,
  );
  assert(
    await pixelEqual(
      studio,
      reopened["spritesheet.png"],
      traveler.pack["spritesheet.png"],
    ),
  );
  roundtrips.push({
    id: "traveler-neutral",
    freshPage: true,
    previewRestored: true,
    pngPixelsEqual: true,
    manifestEqual: true,
  });
  for (const expression of ["gentle", "joyful"]) {
    await studio
      .getByLabel("Expression", { exact: true })
      .selectOption(expression);
    const exported = await capture(studio, `traveler-${expression}`);
    assert.deepEqual(exported.metadata.rig, traveler.metadata.rig);
    assert.deepEqual(exported.metadata.motions, traveler.metadata.motions);
    for (const name of Object.keys(traveler.project).filter((name) =>
      name.endsWith(".png"),
    ))
      assert(
        await pixelEqual(
          studio,
          traveler.project[name],
          exported.project[name],
        ),
        `Expression selection changed source ${name}`,
      );
    identityChecks.push({
      id: `traveler-${expression}`,
      sourceAttachmentsUnchanged: true,
      rigAndMotionsExact: true,
    });
  }

  // The new garment groups must be reusable independently of the generated head.
  await studio.reload();
  await studio
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
  for (const group of ["top", "bottom", "shoes"]) {
    const filename = `traveler-${group}.wardrobe.zip`;
    const original = unzipSync(await readFile(new URL(filename, prepared)));
    const item = JSON.parse(Buffer.from(original["item.json"]).toString());
    await studio
      .getByLabel("Import clothing ZIP file", { exact: true })
      .setInputFiles(new URL(filename, prepared).pathname);
    await studio
      .getByLabel(`Wardrobe ${group}`, { exact: true })
      .locator(`option[value="${item.id}"]`)
      .waitFor({ state: "attached" });
    assert.equal(
      await studio
        .getByLabel(`Wardrobe ${group}`, { exact: true })
        .inputValue(),
      item.id,
    );
    const exported = await download(studio, `Save ${item.name}`, filename);
    assert.deepEqual(
      JSON.parse(Buffer.from(exported["item.json"]).toString()),
      item,
    );
    for (const name of Object.keys(original).filter((name) =>
      name.endsWith(".png"),
    ))
      assert(
        await pixelEqual(studio, original[name], exported[name]),
        `${group}: item PNG/mask roundtrip changed ${name}`,
      );
    itemRoundtrips.push({
      group,
      id: item.id,
      metadataEqual: true,
      artworkAndMasksDecodedPixelsEqual: true,
    });
  }
  await studio.getByLabel("Expression", { exact: true }).selectOption("gentle");
  await capture(studio, "crop-traveler-clothes");
  await studio
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption("waves");
  await studio.getByLabel("Top color", { exact: true }).fill("#75967e");
  await studio.getByLabel("Skin color", { exact: true }).fill("#8f5b40");
  await studio.getByLabel("Bottom color", { exact: true }).fill("#756444");
  await studio
    .getByRole("button", { name: "Apply colors", exact: true })
    .click();
  await studio.getByLabel("Expression", { exact: true }).selectOption("joyful");
  await studio.getByLabel("Action", { exact: true }).selectOption("jump");
  await studio.getByLabel("Facing", { exact: true }).selectOption("left");
  const mixed = await capture(studio, "waves-traveler-recolored");
  assert.equal(mixed.metadata.wardrobe.version, 2);
  assert.equal(
    JSON.parse(Buffer.from(mixed.project["wardrobe.json"]).toString()).items
      .length,
    3,
  );
  await studio.reload();
  await openProject(
    studio,
    new URL("waves-traveler-recolored.rig.zip", output).pathname,
  );
  const mixedReopened = await download(
    studio,
    "Export CharacterPack",
    "waves-traveler-reopened.character.zip",
  );
  assert.deepEqual(
    JSON.parse(Buffer.from(mixedReopened["manifest.json"]).toString()),
    mixed.manifest,
  );
  assert(
    await pixelEqual(
      studio,
      mixedReopened["spritesheet.png"],
      mixed.pack["spritesheet.png"],
    ),
  );
  assert.equal(
    await studio.getByLabel("Wardrobe identity", { exact: true }).inputValue(),
    "waves",
  );
  assert.equal(
    await studio.getByLabel("Skin color", { exact: true }).inputValue(),
    "#8f5b40",
  );
  roundtrips.push({
    id: "waves-traveler-recolored",
    freshPage: true,
    libraryItems: 3,
    wardrobeIdentityAndColorsRestored: true,
    pngPixelsEqual: true,
    manifestEqual: true,
  });

  // Preserve the exact selected source package and expression in a UI screenshot.
  await studio.getByLabel("Zoom", { exact: true }).selectOption("2");
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  await studio.getByLabel("Animation frame", { exact: true }).fill("5");
  await painted(studio);
  await studio.screenshot({
    path: new URL("studio-reused-clothing.png", output).pathname,
    fullPage: true,
  });
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
  for (const id of ["traveler-neutral"]) {
    await player
      .locator("#player-zip")
      .setInputFiles(new URL(`${id}.character.zip`, output).pathname);
    await player
      .getByText(`Loaded: ${exports.find((item) => item.id === id).name}`, {
        exact: true,
      })
      .waitFor();
    await player.locator("#player-zoom").selectOption("1");
    for (const facing of ["right", "left"]) {
      await player
        .getByRole("button", {
          name: facing === "right" ? "Right" : "Left",
          exact: true,
        })
        .click();
      for (const action of actions) {
        const observed = await player.getByTestId("consumer-canvas").evaluate(
          async (canvas, { id, facing, action, outputPath }) => {
            const manifest = await (
              await fetch(`/${outputPath}${id}/manifest.json`)
            ).json();
            const sheet = await createImageBitmap(
              await (await fetch(`/${outputPath}${id}/spritesheet.png`)).blob(),
            );
            const clip = manifest.animations[action],
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
            const button = [...document.querySelectorAll("button")].find(
              (button) => button.textContent.trim().toLowerCase() === action,
            );
            button.click();
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            const ctx = canvas.getContext("2d"),
              start = performance.now(),
              durationMs = (clip.frames.length * 1000) / clip.fps;
            const transitions = [],
              matchedFrames = new Set();
            // Adjacent repeated sequence entries are a timed hold, not a new pose.
            const uniqueOrder = clip.frames.filter(
              (frame, index) => index === 0 || frame !== clip.frames[index - 1],
            );
            const uniqueStartIndices = clip.frames.flatMap((frame, index) =>
              index === 0 || frame !== clip.frames[index - 1] ? [index] : [],
            );
            let position = 0,
              previous;
            while (performance.now() < start + durationMs + 320) {
              const pixels = ctx.getImageData(originX - 96, top, 192, 256).data;
              const matches = [...expected]
                .filter(([, reference]) =>
                  reference.every((value, i) => value === pixels[i]),
                )
                .map(([frame]) => frame);
              if (!matches.length)
                throw Error(
                  `${id}/${facing}/${action}: no exact exported PNG match`,
                );
              const current = uniqueOrder[position % uniqueOrder.length],
                next = uniqueOrder[(position + 1) % uniqueOrder.length];
              if (!matches.includes(current)) {
                if (
                  (clip.loop || position + 1 < uniqueOrder.length) &&
                  matches.includes(next)
                )
                  position++;
                else
                  throw Error(
                    `${id}/${facing}/${action}: skipped/reordered pose at ${position}: ${matches}`,
                  );
              }
              const frame = uniqueOrder[position % uniqueOrder.length];
              matchedFrames.add(frame);
              if (frame !== previous || transitions.length === 0) {
                transitions.push({
                  frame,
                  position,
                  ms: Math.round(performance.now() - start),
                });
                previous = frame;
              }
              await new Promise((resolve) => requestAnimationFrame(resolve));
            }
            const timingChecks = transitions
              .filter(
                (transition) =>
                  transition.position > 0 &&
                  transition.position < uniqueOrder.length,
              )
              .map((transition) => {
                const expectedMs =
                  (uniqueStartIndices[transition.position] * 1000) / clip.fps;
                return {
                  position: transition.position,
                  actualMs: transition.ms,
                  expectedMs,
                  errorMs: Math.round(transition.ms - expectedMs),
                };
              });
            if (!timingChecks.every((check) => Math.abs(check.errorMs) <= 90))
              throw Error(
                `${id}/${facing}/${action}: frame timing exceeds 90 ms browser scheduling allowance: ${JSON.stringify(timingChecks)}`,
              );
            let replayStartedAtFirstFrameAndCompleted;
            if (!clip.loop) {
              const replay = [...document.querySelectorAll("button")].find(
                (button) => button.textContent.trim() === "Replay clip",
              );
              replay.click();
              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              );
              const first = expected.get(clip.frames[0]);
              let pixels = ctx.getImageData(originX - 96, top, 192, 256).data;
              if (
                !first.every((value, index) => value === pixels[index]) ||
                !document
                  .querySelector("#player-one-shot-note")
                  ?.textContent.includes("Plays once")
              )
                throw Error(
                  `${id}/${facing}: replay did not reset to its first PNG pose and playing state`,
                );
              const until = performance.now() + durationMs + 120;
              while (performance.now() < until)
                await new Promise((resolve) => requestAnimationFrame(resolve));
              pixels = ctx.getImageData(originX - 96, top, 192, 256).data;
              const last = expected.get(clip.frames.at(-1));
              if (
                !last.every((value, index) => value === pixels[index]) ||
                !document
                  .querySelector("#player-one-shot-note")
                  ?.textContent.includes("Finished")
              )
                throw Error(
                  `${id}/${facing}: replay did not complete on the final PNG pose`,
                );
              replayStartedAtFirstFrameAndCompleted = true;
            }
            return {
              action,
              facing,
              expectedFrames: [...expected.keys()],
              matchedFrames: [...matchedFrames],
              transitions,
              timingChecks,
              timingAllowanceMs: 90,
              nominalDurationMs: durationMs,
              finalPosition: position,
              once: !clip.loop,
              replayStartedAtFirstFrameAndCompleted,
              finalStatus:
                document.querySelector("#player-one-shot-note")?.textContent ??
                null,
            };
          },
          { id, facing, action, outputPath },
        );
        assert.deepEqual(
          [...observed.matchedFrames].sort((a, b) => a - b),
          [...observed.expectedFrames].sort((a, b) => a - b),
        );
        if (action === "jump") {
          assert.equal(observed.finalPosition, 11);
          assert.match(observed.finalStatus, /Finished/);
          assert(observed.replayStartedAtFirstFrameAndCompleted);
          await player.screenshot({
            path: new URL(`${id}/independent-jump-${facing}.png`, output)
              .pathname,
            fullPage: true,
          });
        } else
          assert(
            observed.finalPosition >= observed.expectedFrames.length,
            `${id}/${action}: did not wrap`,
          );
        playback.push({ id, fullNativeFramePixelsMatchPng: true, ...observed });
        console.log(
          `Independent ${id}/${facing}/${action}: every source pose, order, ${action === "jump" ? "final hold + replay" : "wrap"}.`,
        );
      }
    }
  }

  await context.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(forbidden, []);
  assert.deepEqual(
    await hashes(),
    initialHashes,
    "Sources changed during capture; repeat after freeze",
  );
  assert.deepEqual(
    Object.fromEntries(
      await Promise.all(
        inputFiles.map(async (name) => [
          name,
          sha(await readFile(new URL(name, prepared))),
        ]),
      ),
    ),
    inputHashes,
    "Prepared input assets changed during capture; repeat after freeze",
  );
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        phase,
        source:
          "Newly prepared traveler project imported through Skin Studio controls; all preview and CharacterPack evidence comes from actual UI exports. Three clothing groups also imported independently onto both existing identities and recolored through the wardrobe controls.",
        sourceFiles: initialHashes,
        preparedInputFiles: inputHashes,
        authoringClosedBeforeConsumer: true,
        exports,
        archives,
        roundtrips,
        itemRoundtrips,
        identityChecks,
        sourceParts,
        editorFrames,
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
    `Captured ${archives.length} archives, ${editorFrames.length} editor frame checks and ${playback.length} full-cycle independent playback checks into ${outputPath}.`,
  );
} finally {
  await browser.close();
  await server.close();
}
