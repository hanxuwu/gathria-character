// Actual browser bakes and decoded CharacterPacks; then a separate consumer.
// No Spine software, interchange format, runtime, or third-party rig code.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const iteration = process.env.SKELETAL_ITERATION;
if (iteration && !/^[a-zA-Z0-9_-]+$/.test(iteration))
  throw Error("Invalid SKELETAL_ITERATION.");
const root = new URL("../", import.meta.url);
const relative = `docs/skeletal-rig/${iteration ? `iterations/${iteration}/` : ""}`;
const output = new URL(relative, root);
const port = Number(process.env.SKELETAL_PORT || 5178);
const origin = `http://127.0.0.1:${port}`;
const sourceFiles = [
  "src/experiments/denim-rig/project.ts",
  "src/experiments/denim-rig/rig.ts",
  "src/experiments/denim-rig/mesh.ts",
  "src/experiments/denim-rig/bake.ts",
  "src/core/everyday-presets.ts",
  "src/core/running-rig-v3.ts",
  "src/core/running-leg-parts.ts",
  "src/core/running-arm-parts.ts",
  "src/core/generator-motion-v3.ts",
  "src/core/polished-rig.ts",
  "src/core/polished-assets.generated.ts",
  "src/core/generator-v6.ts",
  "src/core/pack.ts",
  "src/consumer/player.ts",
  "src/consumer/PackPlayer.tsx",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function hashes() {
  return Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (path) => [
        path,
        sha256(await readFile(new URL(path, root))),
      ]),
    ),
  );
}
const initialHashes = await hashes();
const frozen = JSON.parse(
  await readFile(
    new URL("docs/run-connections/before/frozen-source-hashes.json", root),
    "utf8",
  ),
);
for (const [path, digest] of Object.entries(frozen.frozenFiles))
  assert.equal(
    sha256(await readFile(new URL(path, root))),
    digest,
    `${path}: historical source changed`,
  );
await mkdir(output, { recursive: true });
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
  forbidden = [];
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
  const lab = await context.newPage();
  await lab.goto(origin + "/rig-lab.html");
  const result = await lab.evaluate(async () => {
    const { createDefaultProject, parseRigProject } = await import(
      "/src/experiments/denim-rig/project.ts"
    );
    const { baselineCharacter, bakeRigProject, createRigPack } = await import(
      "/src/experiments/denim-rig/bake.ts"
    );
    const { createCharacterPack, loadCharacterPack } = await import(
      "/src/core/pack.ts"
    );
    const { prepareSkeletalRig } = await import(
      "/src/experiments/denim-rig/rig.ts"
    );
    const project = createDefaultProject();
    const baseline = baselineCharacter(),
      candidate = bakeRigProject(project);
    const reopened = parseRigProject(JSON.parse(JSON.stringify(project)));
    const again = bakeRigProject(reopened);
    if (candidate.pixels.some((v, i) => v !== again.pixels[i]))
      throw Error("Recipe round trip changed baked pixels.");
    if (
      candidate.pixels
        .subarray(0, candidate.width * 512 * 4)
        .some((v, i) => v !== baseline.pixels[i])
    )
      throw Error("Experiment changed baseline idle/walk rows.");
    for (const frame of candidate.manifest.frames.filter((f) => f.id >= 12)) {
      for (let y = 0; y < 110; y++) {
        const offset = ((frame.y + y) * candidate.width + frame.x) * 4;
        for (let i = 0; i < 192 * 4; i++)
          if (candidate.pixels[offset + i] !== baseline.pixels[offset + i])
            throw Error(`Run frame ${frame.id}: head/neck region changed.`);
      }
    }
    const rig = prepareSkeletalRig(project);
    const inspection = Array.from({ length: 12 }, (_, key) => ({
      key,
      ...rig.inspect(key),
    }));
    const output = [];
    for (const [id, generated] of [
      ["baseline", baseline],
      ["experimental", candidate],
    ]) {
      const archive =
        id === "baseline"
          ? await createCharacterPack(project.config, generated)
          : await createRigPack(project, generated);
      const pack = await loadCharacterPack(archive);
      const canvas = document.createElement("canvas");
      canvas.width = generated.width;
      canvas.height = generated.height;
      const context = canvas.getContext("2d");
      context.drawImage(pack.image, 0, 0);
      const decoded = context.getImageData(
        0,
        0,
        generated.width,
        generated.height,
      ).data;
      if (decoded.some((v, i) => v !== generated.pixels[i]))
        throw Error(`${id}: decoded PNG differs from generated RGBA.`);
      const alpha = new Set();
      for (let i = 3; i < decoded.length; i += 4) alpha.add(decoded[i]);
      if (!alpha.has(0) || !alpha.has(255))
        throw Error(`${id}: missing transparent/opaque pixels.`);
      const bytes = new Uint8Array(await archive.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      output.push({
        id,
        generator: generated.manifest.generator,
        pngDecodePixelEquality: true,
        alphaValues: [...alpha].sort((a, b) => a - b),
        bytesBase64: btoa(binary),
      });
    }
    return {
      project,
      inspection,
      exports: output,
      recipeRoundTripPixelEquality: true,
      idleWalkPixelEquality: true,
      runHeadNeckPixelEquality: true,
    };
  });
  await writeFile(
    new URL("project.json", output),
    JSON.stringify(result.project, null, 2) + "\n",
  );
  await writeFile(
    new URL("rig-inspection.json", output),
    JSON.stringify({
      format: "gathria-skeletal-inspection",
      schemaVersion: 1,
      sourceRevision: result.project.sourceRevision,
      note: "Actual native pose vertices, triangle indices, rest coordinates and weights; inner bend overlap is allowed and resolved in deterministic painter order.",
      limbAttachmentOrder: [
        "far-arm",
        "far-leg",
        "near-leg",
        "hips",
        "torso",
        "near-arm",
        "head",
      ],
      frames: result.inspection,
    }) + "\n",
  );
  const requiredFiles = [
    "INTEGRATION.md",
    "PROVENANCE.txt",
    "character.json",
    "manifest.json",
    "spritesheet.png",
  ].sort();
  for (const item of result.exports) {
    const bytes = Buffer.from(item.bytesBase64, "base64");
    const entries = unzipSync(bytes);
    assert.deepEqual(Object.keys(entries).sort(), requiredFiles);
    const directory = new URL(`${item.id}/`, output);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL(`${item.id}.character.zip`, output), bytes);
    const members = {};
    for (const [name, value] of Object.entries(entries)) {
      assert(value.length > 0, `${item.id}/${name} is empty`);
      await writeFile(new URL(name, directory), value);
      members[name] = { bytes: value.length, sha256: sha256(value) };
    }
    item.zipSha256 = sha256(bytes);
    item.members = members;
    delete item.bytesBase64;
  }
  await lab.locator("#mesh-preview").waitFor();
  await lab.getByLabel("Show bones", { exact: true }).check();
  await lab.getByLabel("Show mesh", { exact: true }).check();
  await lab.getByLabel("Preview scale", { exact: true }).selectOption("2");
  await lab.locator("#frame-slider").fill("5");
  await lab.screenshot({
    path: new URL("authoring-lab.png", output).pathname,
    fullPage: true,
  });
  // Close every authoring page before launching the independent consumer.
  await lab.close();
  assert.equal(context.pages().length, 0);
  const player = await context.newPage();
  await player.route(
    /\/src\/(experiments\/|editor\/|core\/(generator|running-rig|cohesive|polished|harmonized|illustrated|expressive))/,
    (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    },
  );
  await player.goto(origin + "/player.html");
  await player
    .locator('input[type=file][accept=".zip,application/zip"]')
    .setInputFiles(new URL("experimental.character.zip", output).pathname);
  await player
    .getByText("gathria-denim-skeletal-v1", { exact: true })
    .waitFor();
  await player.locator("#player-zoom").selectOption("1");
  const playback = [];
  for (const animation of ["idle", "walk", "run"]) {
    for (const facing of ["right", "left"]) {
      await player
        .getByRole("button", {
          name: animation[0].toUpperCase() + animation.slice(1),
          exact: true,
        })
        .click();
      await player
        .getByRole("button", {
          name: facing === "left" ? "Left" : "Right",
          exact: true,
        })
        .click();
      const observed = await player.getByTestId("consumer-canvas").evaluate(
        async (canvas, { path, animation, facing }) => {
          const manifest = await (
            await fetch(`/${path}experimental/manifest.json`)
          ).json();
          const sheet = await createImageBitmap(
            await (await fetch(`/${path}experimental/spritesheet.png`)).blob(),
          );
          const clip = manifest.animations[animation];
          const expected = new Map();
          const originX = Math.round(canvas.width / 2),
            top = Math.floor((canvas.height - 256) / 2),
            anchorY = top + manifest.anchor.y;
          for (const id of new Set(clip.frames)) {
            const frame = manifest.frames.find((f) => f.id === id);
            const reference = document.createElement("canvas");
            reference.width = canvas.width;
            reference.height = canvas.height;
            const ctx = reference.getContext("2d");
            // Reproduce only the consumer's visible guide; artwork comes solely from ZIP PNG.
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
              id,
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
            const matches = [...expected]
              .filter(([, p]) => p.every((value, i) => value === pixels[i]))
              .map(([id]) => id);
            if (!matches.length)
              throw Error(
                `${animation}/${facing}: live pixels differ from pack, including feet.`,
              );
            const id = Number(
              canvas.getAttribute("aria-label").match(/frame (\d+)$/)[1],
            );
            if (matches.includes(id)) {
              seen.add(id);
              if (id !== previous) {
                transitions.push({
                  frame: id,
                  ms: Math.round(performance.now() - start),
                });
                previous = id;
              }
            }
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
          return {
            expectedFrames: [...new Set(clip.frames)].sort((a, b) => a - b),
            pixelVerifiedFrames: [...seen].sort((a, b) => a - b),
            transitions,
            nominalLoopMs: loopMs,
            fps: clip.fps,
            sequence: clip.frames,
          };
        },
        { path: relative, animation, facing },
      );
      assert.deepEqual(
        observed.pixelVerifiedFrames,
        observed.expectedFrames,
        `${animation}/${facing}: incomplete playback`,
      );
      const distinctSequence = observed.sequence.filter(
        (id, i, sequence) => i === 0 || id !== sequence[i - 1],
      );
      if (distinctSequence.at(-1) === distinctSequence[0])
        distinctSequence.pop();
      for (let i = 1; i < observed.transitions.length; i++) {
        const prior = observed.transitions[i - 1].frame,
          current = observed.transitions[i].frame;
        assert.equal(
          current,
          distinctSequence[
            (distinctSequence.indexOf(prior) + 1) % distinctSequence.length
          ],
          `${animation}/${facing}: skipped/out-of-order frame`,
        );
      }
      playback.push({
        animation,
        facing,
        fullNativeFramePixelEquality: true,
        ...observed,
      });
      console.log(
        `Independent player: ${animation}/${facing}, ${observed.pixelVerifiedFrames.length} PNG-matched frames.`,
      );
    }
  }
  await player.locator("#player-zoom").selectOption("2");
  await player.screenshot({
    path: new URL("independent-player.png", output).pathname,
    fullPage: true,
  });
  await context.close();
  assert.deepEqual(errors, [], "Browser errors");
  assert.deepEqual(
    external,
    [],
    "Unexpected external/network model dependency",
  );
  assert.deepEqual(
    forbidden,
    [],
    "Consumer imported authoring/generator modules",
  );
  assert.deepEqual(
    await hashes(),
    initialHashes,
    "Sources changed during capture; rerun after edits finish.",
  );
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        sourceRevision: result.project.sourceRevision,
        source:
          "rig-lab browser modules -> baselineCharacter/bakeRigProject -> actual CharacterPack ZIP -> decoded PNG equality; close lab -> independent player",
        iteration: iteration || null,
        sourceFiles: initialHashes,
        historicalSourceFilesVerified: Object.keys(frozen.frozenFiles).length,
        project: "project.json",
        exports: result.exports,
        recipeRoundTripPixelEquality: result.recipeRoundTripPixelEquality,
        idleWalkPixelEquality: result.idleWalkPixelEquality,
        runHeadNeckPixelEquality: result.runHeadNeckPixelEquality,
        consumerOpenedAfterAuthoringClosed: true,
        livePixelRegion:
          "Full native 192 x 256 frame, including shoes; visible consumer attachment guides reproduced in expected buffer.",
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
    `Saved ${relative}: two actual packs, six independent playback cases, source hashes.`,
  );
} finally {
  await browser.close();
  await server.close();
}
