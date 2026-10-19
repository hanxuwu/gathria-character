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
const outputPath = `docs/standard-kit/${phase}/`;
const output = new URL(outputPath, root);
const prepared = new URL("artwork/standard-kit/prepared/", root);
const origin = `http://127.0.0.1:${Number(process.env.STANDARD_KIT_EVIDENCE_PORT || 5214)}`;
const actions = ["idle", "walk", "run", "jump"];
const mainIds = [
  "short-teal-boots",
  "short-teal-sneakers",
  "short-ochre-boots",
  "short-ochre-sneakers",
  "sweep-teal-boots",
  "sweep-teal-sneakers",
  "sweep-ochre-boots",
  "sweep-ochre-sneakers",
];
const representativeIds = ["short-teal-boots", "sweep-ochre-sneakers"];
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
  "scripts/generate-standard-kit-evidence.mjs",
  "scripts/render-standard-kit-review.py",
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
const inputPaths = [];
for (const file of await readdir(new URL("scripts/", root)))
  if (
    file.includes("standard-kit") &&
    !file.includes("evidence") &&
    !file.includes("review")
  )
    inputPaths.push(`scripts/${file}`);
for (const file of await readdir(new URL("artwork/standard-kit/", root), {
  recursive: true,
}))
  if (
    /\.(zip|json|png)$/.test(file) ||
    (file.startsWith("source/") && /\.(md|txt)$/.test(file))
  )
    inputPaths.push(`artwork/standard-kit/${file}`);
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
  expressionFrames = [],
  sourceParts = [],
  topDyeChecks = [],
  regression = [],
  combinationSelections = [];
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
    customMotionAndWardrobeLibrariesPreserved: true,
    identities: metadata(captured.project, "identities.json").identities.length,
    clothing: metadata(captured.project, "wardrobe.json").items.length,
    previewAndIdentityAndColorsRestored: true,
    pngPixelsEqual: true,
    manifestEqual: true,
  });
} // Recolor checks follow semantic ownership, including fixed eyes, tie and flower.
async function verifyMaterials(page, id) {
  const result = await page.evaluate(
    async ({ outputPath, id }) => {
      const { importProject } = await import("/src/skeletal/skin-io.ts");
      const { decodeWardrobeItemPart } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const load = async (name) =>
        importProject(
          await (await fetch(`/${outputPath}${name}.rig.zip`)).blob(),
        );
      const before = await load(id),
        after = await load(`${id}-variant`);
      const identity = before.wardrobeIdentities.find(
        (item) => item.id === before.wardrobe.identity,
      );
      const items = ["top", "bottom", "shoes"]
        .map((group) =>
          before.wardrobeItems?.find(
            (item) => item.id === before.wardrobe[group],
          ),
        )
        .filter(Boolean);
      const parts = [...identity.parts, ...items.flatMap((item) => item.parts)];
      const bottom = items.find((item) => item.group === "bottom");
      const shoes = items.find((item) => item.group === "shoes");
      const owned = [0, 0, 0, 0, 0, 0],
        changed = [0, 0, 0, 0, 0, 0],
        fixed = [];
      // The assembled base shoe fits its source ankle/sole to the selected
      // bottom. Its material mask must follow that exact nearest source sample.
      // Shin overlap likewise extends existing source pixels. This ownership
      // oracle checks every assembled pixel; it does not skip fitted parts.
      function ownership(part, raw) {
        let mapping = Int32Array.from({ length: 192 * 256 }, (_, p) =>
          raw[p * 5 + 3] ? p : -1,
        );
        const operations = [];
        if (part.slot === "near-shin" || part.slot === "far-shin") {
          const ankle =
              bottom.chains[
                part.slot === "near-shin" ? "nearLeg" : "farLeg"
              ][2],
            end = Math.round(ankle[1] + 1);
          let extended = 0;
          for (
            let x = Math.max(0, Math.round(ankle[0]) - 14);
            x <= Math.min(191, Math.round(ankle[0]) + 14);
            x++
          ) {
            let last = -1;
            for (let y = end; y >= ankle[1] - 7; y--)
              if (raw[(y * 192 + x) * 5 + 3]) {
                last = y;
                break;
              }
            if (last < 0 || last === end) continue;
            const tail = (last * 192 + x) * 5;
            let sample = last;
            if (
              raw[tail + 4] === 0 &&
              x > 0 &&
              x < 191 &&
              raw[tail - 5 + 3] &&
              raw[tail + 5 + 3]
            ) {
              for (let y = last - 1; y >= last - 3; y--) {
                const material = raw[(y * 192 + x) * 5 + 4];
                if (material === 1 || material === 4) {
                  sample = y;
                  break;
                }
              }
            }
            const source = sample * 192 + x,
              material = raw[source * 5 + 4];
            if (![0, 1, 4].includes(material)) continue;
            for (let y = last + 1; y <= Math.min(end, last + 4); y++) {
              const destination = y * 192 + x;
              if (mapping[destination] < 0) {
                mapping[destination] = source;
                extended++;
              }
            }
          }
          operations.push({
            kind: "anatomical-ankle-overlap",
            extendedPixels: extended,
            maxExtension: 4,
          });
        }
        if (part.slot === "near-shoe" || part.slot === "far-shoe") {
          const side = part.slot === "near-shoe" ? "near" : "far",
            source = shoes.ankles[side],
            target = bottom.chains[side === "near" ? "nearLeg" : "farLeg"][2];
          let sole = -1;
          for (let p = 0; p < 192 * 256; p++)
            if (raw[p * 5 + 3]) sole = Math.floor(p / 192);
          const ratio = (sole - source[1]) / (239 - target[1]);
          const fitted = new Int32Array(192 * 256).fill(-1);
          for (let y = 0; y < 256; y++)
            for (let x = 0; x < 192; x++) {
              const sx = x - target[0] + source[0],
                sy = Math.round(sole + (y - 239) * ratio);
              if (
                sx >= 0 &&
                sx < 192 &&
                sy >= 0 &&
                sy < 256 &&
                raw[(sy * 192 + sx) * 5 + 3]
              )
                fitted[y * 192 + x] = sy * 192 + sx;
            }
          mapping = fitted;
          operations.push({
            kind: "source-ankle-and-sole-fit",
            sourceAnkle: source,
            targetAnkle: target,
            sourceSole: sole,
            targetSole: 239,
            verticalRatio: ratio,
          });
        }
        return { mapping, operations };
      }
      for (const part of parts) {
        const source = decodeWardrobeItemPart(part.data),
          a = before.skin.images[part.slot],
          b = after.skin.images[part.slot];
        if (!a || !b) throw Error(`Missing assembled slot ${part.slot}`);
        const { mapping, operations } = ownership(part, source);
        let count = 0,
          opaque = 0;
        for (let p = 0; p < 192 * 256; p++) {
          const i = p * 4,
            sourcePixel = mapping[p];
          if (a[i + 3] !== b[i + 3])
            throw Error(`${part.slot}: recolor changed alpha`);
          if (a[i + 3] > 0 !== sourcePixel >= 0)
            throw Error(
              `${part.slot}: source ownership mapping differs from actual alpha at ${p % 192},${Math.floor(p / 192)}`,
            );
          if (sourcePixel < 0) continue;
          const j = sourcePixel * 5,
            material = source[j + 4],
            differs = [0, 1, 2].some((c) => a[i + c] !== b[i + c]);
          opaque++;
          owned[material]++;
          if (!material) {
            count++;
            if (differs || [0, 1, 2, 3].some((c) => a[i + c] !== source[j + c]))
              throw Error(
                `${part.slot}: mapped fixed source pixel changed at ${p % 192},${Math.floor(p / 192)}`,
              );
          } else if (differs) changed[material]++;
        }
        fixed.push({
          slot: part.slot,
          fixedPixels: count,
          assembledOpaquePixels: opaque,
          allExact: true,
          allOpaquePixelsHaveSourceOwner: true,
          ownershipTransforms: operations,
        });
      }
      for (let m = 1; m <= 5; m++)
        if (owned[m] && !changed[m])
          throw Error(`No visible recolor for owned material ${m}`);
      return {
        id,
        ownedPixels: owned,
        changedPixels: changed,
        fixed,
        allAlphasStable: true,
        allFixedPixelsExact: true,
        note: "Source colors may be harmonized across reused garments. Every assembled pixel is checked against its registered source owner, including base-shoe ankle/sole fitting and shin overlap. Fixed pixels must equal their source RGBA before and after recoloring.",
      };
    },
    { outputPath, id },
  );
  topDyeChecks.push(result);
}
async function verifyPreparedAndGeometry(page, id) {
  const result = await page.evaluate(
    async ({ outputPath, id }) => {
      const { importProject } = await import("/src/skeletal/skin-io.ts");
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const input = await importProject(
        await (
          await fetch(`/artwork/standard-kit/prepared/projects/${id}.rig.zip`)
        ).blob(),
      );
      const actual = await importProject(
        await (await fetch(`/${outputPath}${id}.rig.zip`)).blob(),
      );
      const slots = Object.keys(input.skin.images).map((slot) => ({
        slot,
        exact: input.skin.images[slot].every(
          (v, i) => v === actual.skin.images[slot][i],
        ),
      }));
      if (slots.some((slot) => !slot.exact))
        throw Error(
          `${id}: actual exported source differs from prepared source`,
        );
      for (const key of ["rig", "motions"])
        if (JSON.stringify(input[key]) !== JSON.stringify(actual[key]))
          throw Error(`${id}: changed ${key}`);
      if (
        JSON.stringify(input.skin.metadata.bindings) !==
        JSON.stringify(actual.skin.metadata.bindings)
      )
        throw Error(`${id}: changed bindings`);
      const rig = prepareRig(actual.rig, actual.skin, actual.motions);
      const run = actual.motions.clips.run.keys.map((key, index) => {
        const inspection = rig.inspect("run", index, "neutral");
        return {
          index,
          key,
          limbs: inspection.limbs.map((limb) => ({
            id: limb.id,
            bones: limb.bones,
            variant: limb.variant,
            sourceSlots: limb.sourceSlots,
          })),
          shoes: inspection.shoes,
        };
      });
      return {
        id,
        sourceSlots: slots,
        preparedBindingsAndMotionExact: true,
        rig: actual.rig,
        motions: actual.motions,
        run,
        skinVersion: actual.skin.metadata.version,
        selectedIdentity: actual.wardrobe.identity,
      };
    },
    { outputPath, id },
  );
  regression.push(result);
}
async function captureExpressions(page, id) {
  await page.getByLabel("Facing", { exact: true }).selectOption("right");
  await page.getByLabel("Zoom", { exact: true }).selectOption("1");
  for (const expression of ["neutral", "gentle", "joyful"]) {
    await page
      .getByLabel("Expression", { exact: true })
      .selectOption(expression);
    for (const action of ["idle", "run"]) {
      const index = action === "idle" ? 0 : 5;
      await page.getByLabel("Action", { exact: true }).selectOption(action);
      await page
        .getByLabel("Animation frame", { exact: true })
        .fill(String(index));
      const file = `expressions/${id}-${expression}-${action}-1x.png`,
        bytes = await canvasPng(page, "#skin-posed-canvas", file);
      expressionFrames.push({
        id,
        expression,
        action,
        index,
        file,
        bytes: bytes.length,
        sha256: sha(bytes),
      });
    }
  }
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
    new URL(`projects/${mainIds[0]}.rig.zip`, prepared).pathname,
  );
  for (const id of mainIds) {
    const expected = metadata(
      await readArchive(new URL(`projects/${id}.rig.zip`, prepared)),
      "project.json",
    );
    // Assemble each delivered combination through real selection controls in
    // one embedded library; prepared snapshots are independent comparison inputs.
    for (const group of ["identity", "top", "bottom", "shoes"])
      await studio
        .getByLabel(`Wardrobe ${group}`, { exact: true })
        .selectOption(expected.wardrobe[group]);
    await applyColors(studio, expected.wardrobe.colors);
    for (const group of ["identity", "top", "bottom", "shoes"])
      assert.equal(
        await studio
          .getByLabel(`Wardrobe ${group}`, { exact: true })
          .inputValue(),
        expected.wardrobe[group],
      );
    combinationSelections.push({
      id,
      selected: expected.wardrobe,
      selectedThroughControls: true,
    });
    await studio
      .getByLabel("Expression", { exact: true })
      .selectOption("neutral");
    await studio.getByLabel("Action", { exact: true }).selectOption("run");
    await studio.getByLabel("Facing", { exact: true }).selectOption("left");
    const base = await capture(studio, id);
    await checkEditorFrames(studio, id);
    if (representativeIds.includes(id))
      await sourceInspection(studio, base, id);
    await verifyReopen(studio, id, base);
    await verifyPreparedAndGeometry(studio, id);
    await captureExpressions(studio, id);
    if (representativeIds.includes(id)) {
      await applyColors(studio, {
        skin: "#8d5a43",
        hair: "#c6ae73",
        top: "#7e9c92",
        bottom: "#71649c",
        shoes: "#8b6747",
      });
      await studio
        .getByLabel("Expression", { exact: true })
        .selectOption("joyful");
      await studio.getByLabel("Action", { exact: true }).selectOption("run");
      const variant = await capture(studio, `${id}-variant`);
      assert.deepEqual(variant.metadata.motions, base.metadata.motions);
      assert.deepEqual(variant.metadata.rig, base.metadata.rig);
      await verifyMaterials(studio, id);
    }
    log(
      `${id}: all poses, both directions, saved/reopened, all expressions; actual output equals prepared assets.`,
    );
  }
  for (const record of regression) {
    assert.deepEqual(
      record.rig,
      regression[0].rig,
      `${record.id}: skeleton changed`,
    );
    assert.deepEqual(
      record.motions,
      regression[0].motions,
      `${record.id}: motion changed`,
    );
  }
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
  for (const id of mainIds) {
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
      for (const action of actions)
        await observePlayback(player, id, facing, action);
    }
  }
  await context.close();
  assert.equal(playback.length, 64);
  assert.equal(editorFrames.length, 576);
  assert.equal(exports.length, 10);
  assert.equal(roundtrips.length, 8);
  assert.equal(expressionFrames.length, 48);
  assert.equal(topDyeChecks.length, 2);
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
          "Actual Skin Studio controls assemble two registered haircut identities x two tops x two shoes on one body/trousers/motion library. UI downloads are authoritative; prepared projects and the renderer independently verify their content.",
        sourceFiles: initialHashes,
        preparedInputFiles: inputHashes,
        authoringClosedBeforeConsumer: true,
        exports,
        archives,
        roundtrips,
        combinationSelections,
        expressionFrames,
        sourceParts,
        topDyeChecks,
        regression,
        editorFrameCoverage:
          "Eight combinations: all36poses x bothdirections = 576 exact pixel checks. Threeexpressions x idle/run x eightcombinations = 48 actual canvas captures. Ten semantic packs = 360 exported poses. Closed Studio: 64 independent playbacks including once-only jump/replay.",
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
    `Captured ${archives.length} archives, ${editorFrames.length} editor comparisons, ${playback.length} independent playbacks into ${outputPath}`,
  );
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page
        .screenshot({
          path: "/tmp/standard-kit-capture-failure.png",
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
