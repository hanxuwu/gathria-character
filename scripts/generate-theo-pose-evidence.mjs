// Actual Studio imports/exports are authoritative; browser modules only verify them.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8 } from "fflate";
import assert from "node:assert/strict";
const log = (...items) => console.log(new Date().toISOString(), ...items);
const root = new URL("../", import.meta.url);
const phase = process.env.EVIDENCE_PHASE || "final";
assert(phase === "final" || /^iterations\/[a-z0-9-]+$/.test(phase));
const outputPath = `docs/theo-pose-study/${phase}/`;
const output = new URL(outputPath, root);
const prepared = new URL("artwork/theo-pose-study/prepared/", root);
const origin = `http://127.0.0.1:${Number(process.env.THEO_POSE_EVIDENCE_PORT || 5197)}`;
const actions = ["idle", "walk", "run", "jump"];
const groups = ["top", "bottom", "shoes"];
const people = ["theo-study"];
const mainIds = ["theo-study"];
const lookIds = ["before", "new-art-old-run", "theo-study"];
const sourceFiles = [];
for (const directory of ["src/skeletal", "src/consumer", "src/core"])
  for (const file of await readdir(new URL(directory + "/", root), {
    recursive: true,
  }))
    if (/\.(ts|tsx|css)$/.test(file)) sourceFiles.push(`${directory}/${file}`);
sourceFiles.push("scripts/generate-theo-pose-evidence.mjs");
sourceFiles.sort();
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
const inputPaths = [
  ...["theo-theo", "rose-rose"].flatMap((id) =>
    ["rig", "character"].map(
      (kind) => new URL(`docs/reference-pair/final/${id}.${kind}.zip`, root),
    ),
  ),
  new URL("registration.json", prepared),
  new URL("theo-study-old-run.rig.zip", prepared),
  new URL("../source/complete-pose-model.png", prepared),
  new URL("../source/hidden-parts-expressions.png", prepared),
  ...people.flatMap((person) => [
    new URL(`${person}.identity.zip`, prepared),
    new URL(`${person}.rig.zip`, prepared),
  ]),
  ...people.flatMap((person) =>
    groups.map((group) => new URL(`${person}-${group}.wardrobe.zip`, prepared)),
  ),
];
const inputHash = async () =>
  Object.fromEntries(
    await Promise.all(
      inputPaths.map(async (path) => [
        path.pathname.replace(root.pathname, ""),
        sha(await readFile(path)),
      ]),
    ),
  );
const inputHashes = await inputHash();
const readArchive = async (path) => unzipSync(await readFile(path));
const metadata = (entries, file) =>
  JSON.parse(Buffer.from(entries[file]).toString());
const identity = metadata(
  await readArchive(new URL("theo-study.identity.zip", prepared)),
  "identity.json",
);
const outfits = Object.fromEntries(
  await Promise.all(
    groups.map(async (group) => [
      group,
      {
        path: new URL(`theo-study-${group}.wardrobe.zip`, prepared),
        item: metadata(
          await readArchive(
            new URL(`theo-study-${group}.wardrobe.zip`, prepared),
          ),
          "item.json",
        ),
      },
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
  sourceParts = [],
  legacyChecks = [],
  importChecks = [],
  topDyeChecks = [];
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
    customMotionAndV3ClothingPreserved: true,
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
      const { importWardrobeIdentity } = await import(
        "/src/skeletal/identity-io.ts"
      );
      const { importWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { decodeWardrobeItemPart } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const before = await importProject(
        await (await fetch(`/${outputPath}theo-study.rig.zip`)).blob(),
      );
      const after = await importProject(
        await (await fetch(`/${outputPath}theo-recolored.rig.zip`)).blob(),
      );
      const identity = await importWardrobeIdentity(
        await (await fetch(`/${outputPath}theo-study.identity.zip`)).blob(),
      );
      const items = await Promise.all(
        ["top", "bottom", "shoes"].map(async (group) =>
          importWardrobeItem(
            await (
              await fetch(`/${outputPath}theo-study-${group}.wardrobe.zip`)
            ).blob(),
          ),
        ),
      );
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
  const oldBase = "docs/reference-pair/final/";
  let beforeResult;
  for (const person of ["theo", "rose"]) {
    const previousId = `${person}-${person}`;
    await openProject(
      studio,
      new URL(`${oldBase}${previousId}.rig.zip`, root).pathname,
    );
    const current =
      person === "theo"
        ? (beforeResult = await capture(studio, "before", true)).pack
        : await download(
            studio,
            "Export CharacterPack",
            "legacy-rose.character.zip",
          );
    const previousBytes = await readFile(
      new URL(`${oldBase}${previousId}.character.zip`, root),
    );
    const previous = unzipSync(previousBytes);
    assert.deepEqual(
      metadata(current, "manifest.json"),
      metadata(previous, "manifest.json"),
    );
    assert(
      await pixelEqual(
        studio,
        current["spritesheet.png"],
        previous["spritesheet.png"],
      ),
    );
    legacyChecks.push({
      id: person === "theo" ? "before" : "legacy-rose",
      previousId,
      previousDirectory: oldBase,
      all36FramesExact: true,
      manifestExact: true,
      originalProjectSha256: sha(
        await readFile(new URL(`${oldBase}${previousId}.rig.zip`, root)),
      ),
      originalPackSha256: sha(previousBytes),
    });
    log(`Old ${person}: all 36 poses and manifest remain exact.`);
    if (person === "theo") await checkEditorFrames(studio, "before");
  }
  // Import the portable libraries through their real controls. Identity install
  // preserves the old project's current pixels; clothing import applies the item.
  await studio.reload();
  await openProject(
    studio,
    new URL("docs/maple-action-poses/final/traveler-neutral.rig.zip", root)
      .pathname,
  );
  const prior = await currentPixels(studio);
  await studio
    .getByLabel("Import identity ZIP file", { exact: true })
    .setInputFiles(new URL("theo-study.identity.zip", prepared).pathname);
  await studio
    .getByLabel("Imported identities", { exact: true })
    .getByText(identity.name, { exact: true })
    .waitFor();
  await studio.waitForFunction(
    () => !document.querySelector(".skin-workspace").disabled,
  );
  assert.equal(await currentPixels(studio), prior);
  const originalIdentity = await readArchive(
    new URL("theo-study.identity.zip", prepared),
  );
  const downloadedIdentity = await download(
    studio,
    `Save ${identity.name} identity`,
    "theo-study.identity.zip",
  );
  assert.deepEqual(metadata(downloadedIdentity, "identity.json"), identity);
  for (const file of Object.keys(originalIdentity).filter((file) =>
    file.endsWith(".png"),
  ))
    assert(
      await pixelEqual(
        studio,
        originalIdentity[file],
        downloadedIdentity[file],
      ),
    );
  identityChecks.push({
    id: identity.id,
    importPreservesCurrentPixels: true,
    metadataEqual: true,
    artworkAndMasksDecodedPixelsEqual: true,
  });
  await studio
    .getByRole("button", { name: `Use ${identity.name} identity`, exact: true })
    .click();
  for (const group of groups) {
    const { path, item } = outfits[group];
    assert.equal(item.version, 3);
    assert.equal(item.colorModel, "source-relative-v1");
    await studio
      .getByLabel("Import clothing ZIP file", { exact: true })
      .setInputFiles(path.pathname);
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
    const original = await readArchive(path);
    const exported = await download(
      studio,
      `Save ${item.name}`,
      `theo-study-${group}.wardrobe.zip`,
    );
    assert.deepEqual(metadata(exported, "item.json"), item);
    for (const file of Object.keys(original).filter((file) =>
      file.endsWith(".png"),
    ))
      assert(await pixelEqual(studio, original[file], exported[file]));
    itemRoundtrips.push({
      group,
      id: item.id,
      version: 3,
      colorModel: item.colorModel,
      metadataEqual: true,
      artworkAndMasksDecodedPixelsEqual: true,
    });
  }
  await openProject(
    studio,
    new URL("theo-study-old-run.rig.zip", prepared).pathname,
  );
  await studio
    .getByLabel("Expression", { exact: true })
    .selectOption("neutral");
  const comparator = await capture(studio, "new-art-old-run");
  await checkEditorFrames(studio, "new-art-old-run");
  await openProject(studio, new URL("theo-study.rig.zip", prepared).pathname);
  await studio
    .getByLabel("Expression", { exact: true })
    .selectOption("neutral");
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  await studio.getByLabel("Facing", { exact: true }).selectOption("left");
  const final = await capture(studio, "theo-study");
  assert.deepEqual(comparator.metadata.rig, final.metadata.rig);
  for (const action of ["idle", "walk", "jump"])
    assert.deepEqual(
      comparator.metadata.motions.clips[action],
      final.metadata.motions.clips[action],
    );
  assert.notDeepEqual(
    comparator.metadata.motions.clips.run,
    final.metadata.motions.clips.run,
  );
  assert.deepEqual(
    comparator.metadata.motions.clips.run,
    beforeResult.metadata.motions.clips.run,
  );
  for (const action of ["idle", "walk"])
    assert.deepEqual(
      final.metadata.motions.clips[action],
      beforeResult.metadata.motions.clips[action],
    );
  const oldJump = beforeResult.metadata.motions.clips.jump,
    newJump = final.metadata.motions.clips.jump;
  const jumpDeltas = [];
  assert.equal(newJump.keys.length, oldJump.keys.length);
  for (let i = 0; i < newJump.keys.length; i++) {
    const before = oldJump.keys[i],
      after = newJump.keys[i];
    const oldOther = { ...before },
      newOther = { ...after };
    delete oldOther.rootY;
    delete newOther.rootY;
    assert.deepEqual(newOther, oldOther);
    if (before.rootY !== after.rootY)
      jumpDeltas.push({
        key: i,
        beforeRootY: before.rootY,
        afterRootY: after.rootY,
      });
  }
  assert.deepEqual({ ...newJump, keys: oldJump.keys }, oldJump);
  importChecks.push({
    newProjectOnlyJumpClearance: jumpDeltas,
    oldProjectClipsUnchanged: true,
  });
  for (const file of Object.keys(final.project).filter((file) =>
    file.startsWith("slots/"),
  ))
    assert(
      await pixelEqual(studio, comparator.project[file], final.project[file]),
    );
  importChecks.push({
    sameNewArtworkAndRigInComparator: true,
    onlyRunClipChanges: true,
    comparatorUsesExactOldRun: true,
    oldFilesUntouched: true,
  });
  await checkEditorFrames(studio, "theo-study");
  await sourceInspection(studio, final, "theo-study");
  await verifyReopen(studio, "theo-study", final);
  for (const expression of ["gentle", "joyful"]) {
    await studio
      .getByLabel("Expression", { exact: true })
      .selectOption(expression);
    await capture(studio, `theo-${expression}`);
  }
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
  for (const id of ["theo-study", "before"]) {
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
      for (const action of id === "theo-study" ? actions : ["run"])
        await observePlayback(player, id, facing, action);
    }
  }
  await context.close();
  assert.equal(playback.length, 10);
  assert.equal(editorFrames.length, 88);
  assert.equal(exports.length, 6);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(forbidden, []);
  assert.deepEqual(
    await hashes(),
    initialHashes,
    "Runtime sources changed during capture",
  );
  assert.deepEqual(
    await inputHash(),
    inputHashes,
    "Prepared/source inputs changed during capture",
  );
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        phase,
        source:
          "Actual Skin Studio library imports, controls, project/CharacterPack downloads. Old Theo and Rose goldens remain exact; new source-relative clothing and one project-local run clip are verified. Studio closed before independent consumer.",
        sourceFiles: initialHashes,
        preparedInputFiles: inputHashes,
        authoringClosedBeforeConsumer: true,
        exports,
        archives,
        roundtrips,
        itemRoundtrips,
        identityChecks,
        sourceParts,
        legacyChecks,
        importChecks,
        topDyeChecks,
        editorFrameCoverage:
          "Final study: every distinct pose in both directions (72); baseline/comparator: representative pose per action and direction (16). All six exported packs decode all 36 poses; independent playback observes final four actions and old running in both directions.",
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
          path: "/tmp/theo-pose-capture-failure.png",
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
