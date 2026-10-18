// Actual Studio controls/downloads are authoritative; renderer checks verify outputs.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";
const log = (...items) => console.log(new Date().toISOString(), ...items);
const startedAt = new Date().toISOString();
const root = new URL("../", import.meta.url);
const phase = process.env.EVIDENCE_PHASE || "final";
assert(phase === "final" || /^iterations\/[a-z0-9-]+$/.test(phase));
const outputPath = `docs/theo-passing-poses/${phase}/`;
const output = new URL(outputPath, root);
const prepared = new URL("artwork/theo-passing-poses/prepared/", root);
const origin = `http://127.0.0.1:${Number(process.env.THEO_PASSING_EVIDENCE_PORT || 5202)}`;
const actions = ["idle", "walk", "run", "jump"];
const mainIds = ["theo-passing"];
const sourceFiles = [];
for (const directory of [
  "src/skeletal",
  "src/consumer",
  "src/core",
  "src/experiments/denim-rig",
])
  for (const file of await readdir(new URL(directory + "/", root), {
    recursive: true,
  }))
    if (/\.(ts|tsx|css)$/.test(file)) sourceFiles.push(`${directory}/${file}`);
sourceFiles.push(
  "scripts/generate-theo-passing-evidence.mjs",
  "scripts/render-theo-passing-review.py",
);
sourceFiles.sort();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileHashes = async (files) =>
  Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        sha(await readFile(new URL(file, root))),
      ]),
    ),
  );
const initialHashes = await fileHashes(sourceFiles);
const inputPaths = [
  "docs/theo-run-repair/final/theo-run.rig.zip",
  "docs/theo-run-repair/final/theo-run.character.zip",
  "docs/theo-pose-study/final/theo-study.rig.zip",
  "docs/theo-pose-study/final/theo-study.character.zip",
  "scripts/prepare-theo-passing-poses.mjs",
];
for (const file of await readdir(new URL("artwork/theo-passing-poses/", root), {
  recursive: true,
}))
  if (
    /\.(zip|json|png)$/.test(file) ||
    (file.startsWith("source/") && /\.(md|txt)$/.test(file))
  )
    inputPaths.push(`artwork/theo-passing-poses/${file}`);
const inputHashes = await fileHashes(inputPaths);
const readArchive = async (path) => unzipSync(await readFile(path));
const metadata = (entries, file) =>
  JSON.parse(Buffer.from(entries[file]).toString());
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Refusing to overwrite an existing evidence phase; retain it and choose a new EVIDENCE_PHASE.",
);
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
  editorFrames = [],
  itemRoundtrips = [],
  sourceParts = [],
  legacyChecks = [],
  importChecks = [],
  topDyeChecks = [],
  regression = [];
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
async function capture(page, id, preserveName = false) {
  if (!preserveName) {
    await page
      .getByLabel("Character name", { exact: true })
      .fill(id.replaceAll("-", " "));
    await page.getByLabel("Character name", { exact: true }).press("Tab");
  }
  const project = await download(page, "Save project ZIP", `${id}.rig.zip`);
  const projectMetadata = metadata(project, "project.json");
  const skin = metadata(project, "skin.json");
  assert.equal(projectMetadata.wardrobe.version, 3);
  assert.equal(projectMetadata.motions.version, 2);
  const pack = await download(
    page,
    "Export CharacterPack",
    `${id}.character.zip`,
    `${id}/`,
  );
  const manifest = metadata(pack, "manifest.json");
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
      const first = bakeProject(project),
        second = bakeProject(project);
      const loaded = await loadCharacterPack(
        await (await fetch(`/${outputPath}${id}.character.zip`)).blob(),
      );
      const canvas = document.createElement("canvas");
      canvas.width = first.width;
      canvas.height = first.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(loaded.image, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return {
        pngDecodePixelEquality: rgba.every((v, i) => v === first.pixels[i]),
        deterministicPixels: second.pixels.every(
          (v, i) => v === first.pixels[i],
        ),
        alpha: [...new Set(rgba.filter((_, i) => i % 4 === 3))].sort(),
        customItems: project.wardrobeItems?.length ?? 0,
        customIdentities: project.wardrobeIdentities?.length ?? 0,
      };
    },
    { id, outputPath },
  );
  assert(checked.pngDecodePixelEquality && checked.deterministicPixels);
  assert.deepEqual(checked.alpha, [0, 255]);
  exports.push({
    id,
    name: skin.name,
    recipe: projectMetadata.wardrobe,
    ...checked,
  });
  log(`Actual UI export ${id}: all 36 baked PNG poses match; deterministic.`);
  return { project, metadata: projectMetadata, pack, manifest };
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
      const sequenceIndices = mainIds.includes(id)
        ? clip.frames.flatMap((frameId, index) =>
            clip.frames.indexOf(frameId) === index ? [index] : [],
          )
        : [action === "idle" ? 0 : 5];
      for (const sequenceIndex of sequenceIndices) {
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
        `editor/${id}/${action}-${facing}-1x.png`,
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
      `editor/${id}/${action}-right-2x.png`,
    );
  }
  log(
    `Editor: ${editorFrames.length} timed frames/facings exactly match the actual exported PNG.`,
  );
}

async function sourceInspection(page, exported, id) {
  const skin = JSON.parse(
    Buffer.from(exported.project["skin.json"]).toString(),
  );
  await page.getByLabel("Zoom", { exact: true }).selectOption("1");
  for (const slot of skin.slots) {
    await page.getByLabel("Attachment", { exact: true }).selectOption(slot);
    const bytes = await canvasPng(
      page,
      "#skin-source-canvas",
      `isolated/${id}/${slot}-1x.png`,
    );
    assert(
      await pixelEqual(page, bytes, exported.project[`slots/${slot}.png`]),
      `${slot}: source panel changed the imported attachment`,
    );
    sourceParts.push({
      id,
      slot,
      exactSourcePixels: true,
      file: `isolated/${id}/${slot}-1x.png`,
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
  await page.locator(".skin-preview-panel").screenshot({
    path: new URL(`${id}-studio-binding-inspection.png`, output).pathname,
  });
  await page.getByLabel("Bones", { exact: true }).uncheck();
  await page.getByLabel("Mesh", { exact: true }).uncheck();
  await painted(page);
  await page.screenshot({
    path: new URL(`${id}-studio-workflow.png`, output).pathname,
    fullPage: true,
  });
}

async function observePlayback(player, id, facing, action) {
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
          throw Error(`${id}/${facing}/${action}: no exact exported PNG match`);
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
            transition.position > 0 && transition.position < uniqueOrder.length,
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
          document.querySelector("#player-one-shot-note")?.textContent ?? null,
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
      path: new URL(`${id}/independent-jump-${facing}.png`, output).pathname,
      fullPage: true,
    });
  } else
    assert(
      observed.finalPosition >= observed.expectedFrames.length,
      `${id}/${action}: did not wrap`,
    );
  if (action === "run" && mainIds.includes(id))
    await player.screenshot({
      path: new URL(`${id}/independent-run-${facing}.png`, output).pathname,
      fullPage: true,
    });
  playback.push({ id, fullNativeFramePixelsMatchPng: true, ...observed });
  log(
    `Independent ${id}/${facing}/${action}: every source pose, order, ${action === "jump" ? "final hold + replay" : "wrap"}.`,
  );
}
async function currentPixels(page) {
  await painted(page);
  return page
    .locator("#skin-posed-canvas")
    .evaluate((canvas) => canvas.toDataURL());
}
async function applyColors(page, colors) {
  for (const [key, value] of Object.entries(colors))
    await page
      .getByLabel(`${key[0].toUpperCase() + key.slice(1)} color`, {
        exact: true,
      })
      .fill(value);
  const apply = page.getByRole("button", { name: "Apply colors", exact: true });
  if (await apply.isEnabled()) await apply.click();
  await painted(page);
}
async function verifyReopen(page, id, captured) {
  await page.reload();
  await openProject(page, new URL(`${id}.rig.zip`, output).pathname);
  assert.equal(
    await page.getByLabel("Wardrobe identity", { exact: true }).inputValue(),
    captured.metadata.wardrobe.identity,
  );
  assert.equal(
    await page.getByLabel("Action", { exact: true }).inputValue(),
    captured.metadata.preview.animation,
  );
  assert.equal(
    await page.getByLabel("Facing", { exact: true }).inputValue(),
    captured.metadata.preview.facing,
  );
  assert.equal(
    await page.getByLabel("Expression", { exact: true }).inputValue(),
    captured.metadata.preview.expression,
  );
  for (const [key, value] of Object.entries(captured.metadata.wardrobe.colors))
    assert.equal(
      await page
        .getByLabel(`${key[0].toUpperCase() + key.slice(1)} color`, {
          exact: true,
        })
        .inputValue(),
      value,
    );
  const reopened = await download(
    page,
    "Export CharacterPack",
    `${id}-reopened.character.zip`,
  );
  assert.deepEqual(metadata(reopened, "manifest.json"), captured.manifest);
  assert(
    await pixelEqual(
      page,
      reopened["spritesheet.png"],
      captured.pack["spritesheet.png"],
    ),
  );
  const reopenedProject = await download(
    page,
    "Save project ZIP",
    `${id}-reopened.rig.zip`,
  );
  assert.deepEqual(
    metadata(reopenedProject, "project.json").motions,
    captured.metadata.motions,
  );
  assert.deepEqual(
    metadata(reopenedProject, "wardrobe.json"),
    metadata(captured.project, "wardrobe.json"),
  );
  assert.deepEqual(
    metadata(reopenedProject, "identities.json"),
    metadata(captured.project, "identities.json"),
  );
  roundtrips.push({
    id,
    freshPage: true,
    customMotionAndV4ClothingPreserved: true,
    identities: metadata(captured.project, "identities.json").identities.length,
    clothing: metadata(captured.project, "wardrobe.json").items.length,
    previewAndIdentityAndColorsRestored: true,
    pngPixelsEqual: true,
    manifestEqual: true,
  });
} // Recolor checks follow semantic ownership, including fixed eyes, tie and flower.
async function verifyMaterials(page) {
  const result = await page.evaluate(
    async ({ outputPath }) => {
      const { importProject } = await import("/src/skeletal/skin-io.ts");
      const { decodeWardrobeItemPart } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const before = await importProject(
        await (await fetch(`/${outputPath}theo-passing.rig.zip`)).blob(),
      );
      const after = await importProject(
        await (await fetch(`/${outputPath}theo-recolored.rig.zip`)).blob(),
      );
      const identity = before.wardrobeIdentities.find(
        (item) => item.id === before.wardrobe.identity,
      );
      const items = ["top", "bottom", "shoes"].map((group) =>
        before.wardrobeItems.find((item) => item.id === before.wardrobe[group]),
      );
      if (!identity || items.some((item) => !item))
        throw Error("Missing self-contained identity/clothing library");
      const parts = [...identity.parts, ...items.flatMap((item) => item.parts)];
      const changed = [0, 0, 0, 0, 0, 0],
        owned = [0, 0, 0, 0, 0, 0],
        fixed = [];
      const sourceColors = [];
      for (const part of parts) {
        const source = decodeWardrobeItemPart(part.data);
        const a = before.skin.images[part.slot],
          b = after.skin.images[part.slot];
        if (!a || !b) throw Error(`Missing assembled slot ${part.slot}`);
        let sourcePixels = 0,
          exact = 0,
          fixedPixels = 0;
        for (let p = 0; p < 192 * 256; p++) {
          const i = p * 4,
            j = p * 5;
          if (a[i + 3] !== b[i + 3])
            throw Error(`${part.slot}: recolor changed alpha`);
          if (!source[j + 3]) continue;
          sourcePixels++;
          const equal = [0, 1, 2, 3].every((c) => source[j + c] === a[i + c]);
          if (equal) exact++;
          // Geometry can add an ankle allowance but must retain every authored pixel.
          if (!equal)
            throw Error(
              `${part.slot}: source-color artwork changed at ${p % 192},${Math.floor(p / 192)}`,
            );
          const material = source[j + 4];
          owned[material]++;
          const differs = [0, 1, 2].some((c) => a[i + c] !== b[i + c]);
          if (!material) {
            fixedPixels++;
            if (differs) throw Error(`${part.slot}: fixed color changed`);
          } else if (differs) changed[material]++;
        }
        sourceColors.push({
          slot: part.slot,
          sourcePixels,
          exactAuthoredPixels: exact,
          alphaStable: true,
        });
        fixed.push({ slot: part.slot, fixedPixels, allExact: true });
      }
      for (let material = 1; material <= 5; material++)
        if (!(owned[material] && changed[material]))
          throw Error(`No visible recolor for material ${material}`);
      return {
        sourceColors,
        ownedPixels: owned,
        changedPixels: changed,
        fixed,
        allSourceColorsExact: true,
        allAlphasStable: true,
      };
    },
    { outputPath },
  );
  topDyeChecks.push(result);
}

async function verifyGeometryAndSources(page) {
  const result = await page.evaluate(
    async ({ outputPath }) => {
      const { importProject } = await import("/src/skeletal/skin-io.ts");
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const load = async (id) =>
        importProject(
          await (await fetch(`/${outputPath}${id}.rig.zip`)).blob(),
        );
      const before = await load("before"),
        after = await load("theo-passing");
      const slots = Object.keys(before.skin.images).map((slot) => ({
        slot,
        exact: before.skin.images[slot].every(
          (v, i) => v === after.skin.images[slot][i],
        ),
      }));
      if (slots.some((slot) => !slot.exact))
        throw Error("Existing source pixels changed: " + JSON.stringify(slots));
      if (JSON.stringify(before.motions) !== JSON.stringify(after.motions))
        throw Error("Motion changed outside passing artwork scope");
      if (
        JSON.stringify(before.skin.metadata.bindings) !==
        JSON.stringify(after.skin.metadata.bindings)
      )
        throw Error("Base anatomical bindings changed");
      const records = [];
      for (const id of ["before", "legs-only", "shoes-only", "theo-passing"]) {
        const project = await load(id),
          rig = prepareRig(project.rig, project.skin, project.motions);
        records.push({
          id,
          motionVersion: project.motions.version,
          run: project.motions.clips.run,
          keys: project.motions.clips.run.keys.map((key, index) => ({
            index,
            key,
            limbs: rig.inspect("run", index, "neutral").limbs.map((limb) => ({
              id: limb.id,
              bones: limb.bones,
              variant: limb.variant,
              sourceSlots: limb.sourceSlots,
            })),
          })),
        });
      }
      return {
        unchangedSourceSlots: slots,
        motionsExact: true,
        bindingsExact: true,
        identityLibraryExact:
          JSON.stringify(before.wardrobeIdentities) ===
          JSON.stringify(after.wardrobeIdentities),
        records,
      };
    },
    { outputPath },
  );
  assert(result.identityLibraryExact);
  regression.push(result);
}
async function importItem(page, group, filename) {
  const path = new URL(filename, prepared),
    original = await readArchive(path),
    item = metadata(original, "item.json");
  assert.equal(item.version, 4);
  assert.equal(item.group, group);
  await page
    .getByLabel("Import clothing ZIP file", { exact: true })
    .setInputFiles(path.pathname);
  await page
    .getByLabel(`Wardrobe ${group}`, { exact: true })
    .locator(`option[value="${item.id}"]`)
    .waitFor({ state: "attached" });
  assert.equal(
    await page.getByLabel(`Wardrobe ${group}`, { exact: true }).inputValue(),
    item.id,
  );
  const exported = await download(page, `Save ${item.name}`, filename);
  assert.deepEqual(metadata(exported, "item.json"), item);
  assert.deepEqual(Object.keys(exported).sort(), Object.keys(original).sort());
  for (const file of Object.keys(original).filter((file) =>
    file.endsWith(".png"),
  ))
    assert(
      await pixelEqual(page, original[file], exported[file]),
      `${filename}/${file}: portable artwork/mask changed`,
    );
  itemRoundtrips.push({
    id: item.id,
    group,
    version: 4,
    metadataEqual: true,
    artworkAndMasksDecodedPixelsEqual: true,
    registeredAlternative: item.runLegs ?? item.runShoes,
  });
  return item;
}
async function verifyAlternativeRegistrationEditing(page) {
  const input = await readArchive(new URL("theo-passing.rig.zip", prepared));
  const original = metadata(input, "skin.json"),
    project = metadata(input, "project.json");
  const kneeX = original.runLegs.nearLeg.joints[1][0],
    ankleY = original.runShoes.nearLeg.ankle[1];
  const select = (slot) =>
    page.getByLabel("Attachment", { exact: true }).selectOption(slot);
  const edit = async (label, value) => {
    await page.getByLabel(label, { exact: true }).fill(String(value));
    await page.getByLabel(label, { exact: true }).press("Tab");
    assert.equal(
      await page.getByLabel(label, { exact: true }).inputValue(),
      String(value),
    );
  };
  await select("near-leg-bent");
  await edit("Knee X", kneeX + 1);
  await select("near-shoe-run");
  await edit("Source ankle Y", ankleY - 1);
  const saved = await download(
    page,
    "Save project ZIP",
    "alternative-registration-edit.rig.zip",
  );
  const skin = metadata(saved, "skin.json");
  assert.deepEqual(skin.bindings, original.bindings);
  assert.equal(skin.runLegs.nearLeg.joints[1][0], kneeX + 1);
  assert.equal(skin.runShoes.nearLeg.ankle[1], ankleY - 1);
  assert.deepEqual(metadata(saved, "project.json").motions, project.motions);
  for (const file of Object.keys(input).filter(
    (f) => f.startsWith("slots/") && f.endsWith(".png"),
  ))
    assert(await pixelEqual(page, input[file], saved[file]));
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  assert.equal(
    await page.getByLabel("Source ankle Y", { exact: true }).inputValue(),
    String(ankleY),
  );
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await select("near-leg-bent");
  assert.equal(
    await page.getByLabel("Knee X", { exact: true }).inputValue(),
    String(kneeX),
  );

  await page.reload();
  await openProject(
    page,
    new URL("alternative-registration-edit.rig.zip", output).pathname,
  );
  await select("near-leg-bent");
  assert.equal(
    await page.getByLabel("Knee X", { exact: true }).inputValue(),
    String(kneeX + 1),
  );
  await edit("Knee X", kneeX + 2);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  assert.equal(
    await page.getByLabel("Knee X", { exact: true }).inputValue(),
    String(kneeX + 1),
  );
  await select("near-shoe-run");
  assert.equal(
    await page.getByLabel("Source ankle Y", { exact: true }).inputValue(),
    String(ankleY - 1),
  );
  await edit("Source ankle Y", ankleY - 2);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  assert.equal(
    await page.getByLabel("Source ankle Y", { exact: true }).inputValue(),
    String(ankleY - 1),
  );
  await page
    .getByRole("button", { name: "Reset bindings to loaded skin", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Source ankle Y", { exact: true }).inputValue(),
    String(ankleY - 1),
  );
  await select("near-leg-bent");
  assert.equal(
    await page.getByLabel("Knee X", { exact: true }).inputValue(),
    String(kneeX + 1),
  );
  await select("near-thigh");
  assert.equal(
    await page.getByLabel("Knee X", { exact: true }).inputValue(),
    String(original.bindings.chains.nearLeg[1][0]),
  );
  assert.equal(
    await page.getByLabel("Ankle Y", { exact: true }).inputValue(),
    String(original.bindings.chains.nearLeg[2][1]),
  );
  importChecks.push({
    alternativeSourceRegistrationEditing: true,
    sourceKneeEditedByOnePixel: true,
    sourceAnkleEditedByOnePixel: true,
    anatomicalBindingsAndMotionUnchanged: true,
    sourcePixelsUnchanged: true,
    saveAndFreshReopenExact: true,
    undoBeforeAndAfterReopenExact: true,
    resetBaseBindingsPreservesAlternativeRegistration: true,
    manualSourceEditsDetachWardrobeRecipe: !metadata(saved, "project.json")
      .wardrobe,
    diagnosticProject: "alternative-registration-edit.rig.zip",
    restoredPreparedProjectBeforeFinalExports: true,
  });
  await openProject(page, new URL("theo-passing.rig.zip", prepared).pathname);
}
async function verifySwaps(page, final, bottom, shoes) {
  const readState = async (name, legs, feet) => {
    const archive = await download(page, "Save project ZIP", `${name}.rig.zip`),
      skin = metadata(archive, "skin.json");
    assert.equal(Boolean(skin.runLegs), legs);
    assert.equal(Boolean(skin.runShoes), feet);
    for (const slot of ["near-leg-bent", "far-leg-bent"])
      assert.equal(skin.slots.includes(slot), legs);
    for (const slot of ["near-shoe-run", "far-shoe-run"])
      assert.equal(skin.slots.includes(slot), feet);
    assert.deepEqual(
      metadata(archive, "project.json").motions,
      final.metadata.motions,
    );
    importChecks.push({
      case: name,
      hasRunLegs: legs,
      hasRunShoes: feet,
      variantSlotsOwned: true,
      motionUnchanged: true,
    });
    return archive;
  };
  await page
    .getByLabel("Wardrobe bottom", { exact: true })
    .selectOption("trousers");
  await readState("ordinary-bottom", false, true);
  await page
    .getByLabel("Wardrobe bottom", { exact: true })
    .selectOption(bottom.id);
  await page
    .getByLabel("Wardrobe shoes", { exact: true })
    .selectOption("boots");
  await readState("ordinary-shoes", true, false);
  await page
    .getByLabel("Wardrobe bottom", { exact: true })
    .selectOption("trousers");
  await readState("ordinary-both", false, false);
  await page
    .getByLabel("Wardrobe bottom", { exact: true })
    .selectOption(bottom.id);
  await page
    .getByLabel("Wardrobe shoes", { exact: true })
    .selectOption(shoes.id);
  const restored = await readState("restored-variants", true, true);
  assert.deepEqual(
    metadata(restored, "skin.json").runLegs,
    metadata(final.project, "skin.json").runLegs,
  );
  assert.deepEqual(
    metadata(restored, "skin.json").runShoes,
    metadata(final.project, "skin.json").runShoes,
  );
  for (const file of Object.keys(final.project).filter(
    (f) => f.startsWith("slots/") && f.endsWith(".png"),
  ))
    assert(
      await pixelEqual(page, final.project[file], restored[file]),
      `Swap-back changed ${file}`,
    );
  importChecks.push({ swapBackAllBaseAndAlternativePixelsExact: true });
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  context.setDefaultTimeout(15000);
  context.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin))
      external.push(request.url());
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    const evaluate = page.evaluate.bind(page);
    page.evaluate = (...args) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              Error(
                "Browser verification exceeded 45 seconds; capture stopped.",
              ),
            ),
          45000,
        );
        evaluate(...args).then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });
  });
  const studio = await context.newPage();
  await studio.goto(origin + "/skin-studio.html");
  await openProject(
    studio,
    new URL("docs/theo-run-repair/final/theo-run.rig.zip", root).pathname,
  );
  const before = await capture(studio, "before", true);
  const originalBytes = await readFile(
    new URL("docs/theo-run-repair/final/theo-run.character.zip", root),
  );
  const original = unzipSync(originalBytes);
  assert.deepEqual(before.manifest, metadata(original, "manifest.json"));
  assert(
    await pixelEqual(
      studio,
      before.pack["spritesheet.png"],
      original["spritesheet.png"],
    ),
  );
  legacyChecks.push({
    id: "before",
    previousDirectory: "docs/theo-run-repair/final",
    all36FramesExact: true,
    manifestExact: true,
    motionVersion: 2,
    originalPackSha256: sha(originalBytes),
  });
  // Explicit V1 historical project is rendered for all36poses in the browser as well.
  const oldV1 = await studio.evaluate(async () => {
    const { importProject } = await import("/src/skeletal/skin-io.ts");
    const { bakeProject } = await import("/src/skeletal/bake.ts");
    const { loadCharacterPack } = await import("/src/core/pack.ts");
    const p = await importProject(
      await (
        await fetch("/docs/theo-pose-study/final/theo-study.rig.zip")
      ).blob(),
    );
    const b = bakeProject(p),
      prior = await loadCharacterPack(
        await (
          await fetch("/docs/theo-pose-study/final/theo-study.character.zip")
        ).blob(),
      );
    const canvas = document.createElement("canvas");
    canvas.width = b.width;
    canvas.height = b.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(prior.image, 0, 0);
    return {
      motionVersion: p.motions.version,
      all36FramesExact: ctx
        .getImageData(0, 0, b.width, b.height)
        .data.every((v, i) => v === b.pixels[i]),
    };
  });
  assert.equal(oldV1.motionVersion, 1);
  assert(oldV1.all36FramesExact);
  legacyChecks.push({
    id: "historical-v1",
    previousDirectory: "docs/theo-pose-study/final",
    ...oldV1,
  });
  await checkEditorFrames(studio, "before");

  const bottom = await importItem(
    studio,
    "bottom",
    "theo-passing-bottom.wardrobe.zip",
  );
  const legsOnly = await capture(studio, "legs-only");
  assert(metadata(legsOnly.project, "skin.json").runLegs);
  assert(!metadata(legsOnly.project, "skin.json").runShoes);
  assert.deepEqual(legsOnly.metadata.motions, before.metadata.motions);
  await openProject(
    studio,
    new URL("docs/theo-run-repair/final/theo-run.rig.zip", root).pathname,
  );
  const shoes = await importItem(
    studio,
    "shoes",
    "theo-passing-shoes.wardrobe.zip",
  );
  const shoesOnly = await capture(studio, "shoes-only");
  assert(metadata(shoesOnly.project, "skin.json").runShoes);
  assert(!metadata(shoesOnly.project, "skin.json").runLegs);
  assert.deepEqual(shoesOnly.metadata.motions, before.metadata.motions);

  await openProject(studio, new URL("theo-passing.rig.zip", prepared).pathname);
  await verifyAlternativeRegistrationEditing(studio);
  await studio
    .getByLabel("Expression", { exact: true })
    .selectOption("neutral");
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  await studio.getByLabel("Facing", { exact: true }).selectOption("left");
  const inputProject = metadata(
    await readArchive(new URL("theo-passing.rig.zip", prepared)),
    "project.json",
  );
  const fps = inputProject.motions.clips.run.fps;
  await studio.getByLabel("Motion FPS", { exact: true }).fill(String(fps - 1));
  await studio.getByLabel("Motion FPS", { exact: true }).press("Tab");
  await studio.getByLabel("Motion FPS", { exact: true }).fill(String(fps));
  await studio.getByLabel("Motion FPS", { exact: true }).press("Tab");
  const final = await capture(studio, "theo-passing");
  assert.deepEqual(final.metadata.motions, inputProject.motions);
  assert.deepEqual(final.metadata.motions, before.metadata.motions);
  assert.deepEqual(final.metadata.rig, before.metadata.rig);
  assert.equal(metadata(final.project, "skin.json").version, 3);
  importChecks.push({
    oldMotionVersion: 2,
    newMotionVersion: 2,
    allMotionClipsExact: true,
    sameRig: true,
    ordinaryMotionEditingPreservesExplicitMode: true,
  });
  await checkEditorFrames(studio, "theo-passing");
  await sourceInspection(studio, final, "theo-passing");
  await verifySwaps(studio, final, bottom, shoes);
  await verifyReopen(studio, "theo-passing", final);
  await verifyGeometryAndSources(studio);

  // Gentle uses actual editor canvas exports; no redundant semantic pack.
  await studio.getByLabel("Expression", { exact: true }).selectOption("gentle");
  await studio.getByLabel("Facing", { exact: true }).selectOption("right");
  await studio.getByLabel("Zoom", { exact: true }).selectOption("1");
  for (const action of actions) {
    await studio.getByLabel("Action", { exact: true }).selectOption(action);
    await studio
      .getByLabel("Animation frame", { exact: true })
      .fill(action === "idle" ? "0" : "5");
    await canvasPng(
      studio,
      "#skin-posed-canvas",
      `editor/theo-gentle/${action}-right-1x.png`,
    );
  }
  await studio.getByLabel("Expression", { exact: true }).selectOption("joyful");
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  const joyful = await capture(studio, "theo-joyful");
  assert.deepEqual(joyful.metadata.motions, final.metadata.motions);
  await studio
    .getByLabel("Expression", { exact: true })
    .selectOption("neutral");
  await applyColors(studio, {
    skin: "#9f684d",
    hair: "#b28a53",
    top: "#4c7068",
    bottom: "#596254",
    shoes: "#6d4f3c",
  });
  const colored = await capture(studio, "theo-recolored");
  assert.deepEqual(colored.metadata.motions, final.metadata.motions);
  await verifyMaterials(studio);
  await verifyReopen(studio, "theo-recolored", colored);
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
  for (const id of ["theo-passing", "before"]) {
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
      for (const action of id === "theo-passing" ? actions : ["run"])
        await observePlayback(player, id, facing, action);
    }
  }
  await context.close();
  assert.equal(playback.length, 10);
  assert.equal(editorFrames.length, 80);
  assert.equal(exports.length, 6);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(forbidden, []);
  assert.deepEqual(
    await fileHashes(sourceFiles),
    initialHashes,
    "Runtime/harness changed during capture",
  );
  assert.deepEqual(
    await fileHashes(inputPaths),
    inputHashes,
    "Prepared/source input changed during capture",
  );
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(
      {
        startedAt,
        capturedAt: new Date().toISOString(),
        phase,
        source:
          "Actual Studio project/item imports and controls/downloads. Prior V1/V2 Theo projects remain exact. Explicit run-only SkinV3/itemV4 alternatives; Studio closes before independent playback.",
        sourceFiles: initialHashes,
        preparedInputFiles: inputHashes,
        authoringClosedBeforeConsumer: true,
        exports,
        archives,
        roundtrips,
        itemRoundtrips,
        sourceParts,
        legacyChecks,
        importChecks,
        topDyeChecks,
        regression,
        editorFrameCoverage:
          "Final: all36poses in both directions(72); baseline representative four actions/bothdirections(8). Gentle actual canvas captures; 6 semantic packs/216poses. Old V1/V2 project goldens and new non-run pixels are checked separately. Independent final4actions2directions plus baseline run.",
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
  log(
    `Captured ${archives.length} archives, ${editorFrames.length} editor comparisons, ${playback.length} independent loops into ${outputPath}`,
  );
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page
        .screenshot({
          path: "/tmp/theo-passing-capture-failure.png",
          fullPage: true,
        })
        .catch(() => {});
      console.error(
        "Failure page notice:",
        await page
          .locator(".skin-notice")
          .allTextContents()
          .catch(() => []),
      );
    }
  throw error;
} finally {
  await browser.close();
  await server.close();
}
