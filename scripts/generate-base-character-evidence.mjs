// Actual UI downloads and independent PNG playback; observation helpers follow
// the standard-kit evidence harness, with one base model and explicit phases.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url),
  phase = process.env.EVIDENCE_PHASE || "final";
assert(phase === "final" || /^iterations\/[a-z0-9-]+$/.test(phase));
const outputPath = `docs/base-character/${phase}/`,
  output = new URL(outputPath, root);
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Keep old evidence; choose a fresh EVIDENCE_PHASE.",
);
const actions = ["idle", "walk", "run", "jump"],
  mainIds = ["base-character"];
const archives = [],
  exports = [],
  playback = [],
  editorFrames = [],
  sourceParts = [];
const sha = (b) => createHash("sha256").update(b).digest("hex");
const metadata = (entries, name) =>
  JSON.parse(Buffer.from(entries[name]).toString());
const log = (...v) => console.log(new Date().toISOString(), ...v);
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

const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 960 },
    }),
    errors = [],
    forbidden = [];
  context.on("page", (page) =>
    page.on("pageerror", (e) => errors.push(e.message)),
  );
  const studio = await context.newPage();
  await studio.goto(origin + "/skin-studio.html");
  await studio
    .getByRole("button", { name: "Open base model", exact: true })
    .click();
  await studio.getByText(/Base model opened\./).waitFor();
  assert.equal(
    await studio.getByLabel("Character name", { exact: true }).inputValue(),
    "Base character study",
  );
  const exported = await capture(studio, "base-character", true);
  if (phase !== "final") {
    await writeFile(
      new URL("evidence-index.json", output),
      JSON.stringify(
        { phase, archives, exports, editorDownloaded: true },
        null,
        2,
      ) + "\n",
    );
  } else {
    await checkEditorFrames(studio, "base-character");
    await sourceInspection(studio, exported, "base-character");
    // Record three actual expressions and all four overlay poses.
    await studio.getByLabel("Zoom", { exact: true }).selectOption("2");
    await studio.getByLabel("Action", { exact: true }).selectOption("idle");
    await studio.getByLabel("Animation frame", { exact: true }).fill("0");
    for (const expression of ["neutral", "gentle", "joyful"]) {
      await studio
        .getByLabel("Expression", { exact: true })
        .selectOption(expression);
      await canvasPng(
        studio,
        "#skin-posed-canvas",
        `expressions/${expression}.png`,
      );
    }
    await studio
      .getByLabel("Expression", { exact: true })
      .selectOption("neutral");
    await studio.getByLabel("Bones", { exact: true }).check();
    for (const action of actions) {
      await studio.getByLabel("Action", { exact: true }).selectOption(action);
      await studio
        .getByLabel("Animation frame", { exact: true })
        .fill(action === "idle" ? "0" : "5");
      await canvasPng(studio, "#skin-posed-canvas", `bones/${action}-2x.png`);
    }
    await studio.getByLabel("Bones", { exact: true }).uncheck();
    // Reopen the downloaded project and compare a fresh export to its original pixels.
    await openProject(
      studio,
      new URL("base-character.rig.zip", output).pathname,
    );
    const reopened = await download(
      studio,
      "Export CharacterPack",
      "reopened.character.zip",
    );
    assert(
      await pixelEqual(
        studio,
        reopened["spritesheet.png"],
        exported.pack["spritesheet.png"],
      ),
    );
    // Actual UI source-relative recoloring; retain its portable result for review.
    for (const [label, value] of [
      ["Skin", "#9a674b"],
      ["Top", "#739b9c"],
      ["Bottom", "#795d69"],
    ])
      await studio.getByLabel(label + " color", { exact: true }).fill(value);
    await studio
      .getByRole("button", { name: "Apply colors", exact: true })
      .click();
    await painted(studio);
    await studio.getByLabel("Action", { exact: true }).selectOption("run");
    await studio.getByLabel("Animation frame", { exact: true }).fill("4");
    await canvasPng(studio, "#skin-posed-canvas", "recolor-run-2x.png");
    await download(
      studio,
      "Export CharacterPack",
      "recolor.character.zip",
      "recolor/",
    );
    await studio.close();
    assert.equal(context.pages().length, 0);
    const player = await context.newPage();
    await player.route(
      /\/src\/(skeletal\/|experiments\/|editor\/|core\/(generator|running-rig|cohesive|polished|harmonized|illustrated|expressive))/,
      (route) => {
        forbidden.push(route.request().url());
        return route.abort();
      },
    );
    await player.goto(origin + "/player.html");
    await player
      .locator("#player-zip")
      .setInputFiles(new URL("base-character.character.zip", output).pathname);
    await player
      .getByText("Loaded: Base character study", { exact: true })
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
        await observePlayback(player, "base-character", facing, action);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
    assert.equal(editorFrames.length, 72);
    assert.equal(playback.length, 8);
    await writeFile(
      new URL("evidence-index.json", output),
      JSON.stringify(
        {
          executedAt: new Date().toISOString(),
          phase,
          archives,
          exports,
          editorFrames,
          sourceParts,
          playback,
          roundtripPixelsExact: true,
          editorClosedBeforePlayer: true,
          blockedGeneratorRequests: forbidden,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
  }
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
