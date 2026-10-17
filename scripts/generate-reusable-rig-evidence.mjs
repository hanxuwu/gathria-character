// Actual browser exports from portable skins and authoring projects. No artwork
// generation service is used; independent playback consumes only baked packs.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const iteration = process.env.REUSABLE_ITERATION;
assert(!iteration || /^[a-zA-Z0-9_-]+$/.test(iteration), "Invalid iteration");
const fast = process.env.REVIEW_FAST === "1";
const root = new URL("../", import.meta.url);
const relative = `docs/reusable-rig/${iteration ? `iterations/${iteration}/` : ""}`;
const output = new URL(relative, root);
const port = Number(process.env.REUSABLE_PORT || 5182);
const origin = `http://127.0.0.1:${port}`;
const ids = ["denim-daytrip", "coral-afternoon"];
const sourceFiles = [
  "src/skeletal/types.ts",
  "src/skeletal/definition.ts",
  "src/skeletal/builtins.ts",
  "src/skeletal/renderer.ts",
  "src/skeletal/bake.ts",
  "src/skeletal/skin-io.ts",
  "src/skeletal/Studio.tsx",
  "src/skeletal/studio.css",
  "src/experiments/denim-rig/mesh.ts",
  "src/core/illustrated-canvas.ts",
  "src/core/generator-motion-v3.ts",
  "src/core/running-rig-v3.ts",
  "src/core/running-arm-parts.ts",
  "src/core/running-leg-parts.ts",
  "src/core/polished-rig.ts",
  "src/core/polished-assets.generated.ts",
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
  const studio = await context.newPage();
  await studio.goto(origin + "/skin-studio.html");
  const result = await studio.evaluate(async (ids) => {
    const { createBuiltinSkin, createAuthoringProject } = await import(
      "/src/skeletal/builtins.ts"
    );
    const { createRigDefinition, createMotionLibrary } = await import(
      "/src/skeletal/definition.ts"
    );
    const { prepareRig } = await import("/src/skeletal/renderer.ts");
    const { bakeProject, createBakedPack } = await import(
      "/src/skeletal/bake.ts"
    );
    const {
      exportSkinPack,
      importSkinPack,
      exportProject,
      importProject,
      exportTemplate,
    } = await import("/src/skeletal/skin-io.ts");
    const { generateMotionV3 } = await import(
      "/src/core/generator-motion-v3.ts"
    );
    const { createCharacterPack, loadCharacterPack } = await import(
      "/src/core/pack.ts"
    );
    const { unzipSync, zipSync, strFromU8, strToU8 } = await import(
      "/node_modules/fflate/esm/browser.js"
    );
    const assert = (value, message) => {
      if (!value) throw Error(message);
    };
    const equal = (a, b) =>
      a.length === b.length && a.every((value, i) => value === b[i]);
    const canonical = (value) =>
      JSON.stringify(value, (_, item) =>
        item && !Array.isArray(item) && typeof item === "object"
          ? Object.fromEntries(
              Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
            )
          : item,
      );
    async function base64(blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(binary);
    }
    async function exportPack(id, project, generated, baseline = false) {
      const blob = baseline
        ? await createCharacterPack(
            project.skin.metadata.sourceAppearance,
            generated,
          )
        : await createBakedPack(project);
      const pack = await loadCharacterPack(blob);
      const canvas = document.createElement("canvas");
      canvas.width = generated.width;
      canvas.height = generated.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(pack.image, 0, 0);
      const decoded = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      assert(
        equal(decoded, generated.pixels),
        `${id}: decoded PNG differs from generated pixels`,
      );
      const alpha = new Set();
      for (let i = 3; i < decoded.length; i += 4) alpha.add(decoded[i]);
      assert(alpha.has(0) && alpha.has(255), `${id}: transparency missing`);
      return {
        id,
        generator: generated.manifest.generator,
        pngDecodePixelEquality: true,
        alphaValues: [...alpha].sort((a, b) => a - b),
        bytesBase64: await base64(blob),
      };
    }
    const sharedRig = createRigDefinition(),
      sharedMotions = createMotionLibrary();
    const skins = [],
      exports = [];
    for (const id of ids) {
      const original = createBuiltinSkin(id),
        skinZip = await exportSkinPack(original);
      // Fresh decoding drops all in-memory source-bank object identity.
      const skin = await importSkinPack(
        new Blob([await skinZip.arrayBuffer()], { type: "application/zip" }),
      );
      assert(
        canonical(original.metadata) === canonical(skin.metadata),
        `${id}: skin metadata roundtrip differs`,
      );
      for (const slot of original.metadata.slots)
        assert(
          equal(original.images[slot], skin.images[slot]),
          `${id}/${slot}: PNG slot roundtrip differs`,
        );
      const project = createAuthoringProject(skin);
      assert(
        JSON.stringify(project.rig) === JSON.stringify(sharedRig),
        `${id}: changed shared skeleton`,
      );
      assert(
        JSON.stringify(project.motions) === JSON.stringify(sharedMotions),
        `${id}: changed shared motions`,
      );
      const generated = bakeProject(project),
        baseline = generateMotionV3(skin.metadata.sourceAppearance);
      const projectZip = await exportProject(project),
        reopened = await importProject(
          new Blob([await projectZip.arrayBuffer()], {
            type: "application/zip",
          }),
        );
      const again = bakeProject(reopened);
      assert(
        equal(generated.pixels, again.pixels),
        `${id}: authoring ZIP roundtrip changed bake`,
      );
      assert(
        JSON.stringify(generated.manifest) === JSON.stringify(again.manifest),
        `${id}: authoring ZIP changed manifest`,
      );
      const template = await exportTemplate(skin);
      exports.push(await exportPack(id, project, generated));
      exports.push(await exportPack(`${id}/baseline`, project, baseline, true));
      const expressionFrames = [];
      for (const expression of ["neutral", "gentle", "joyful"]) {
        const p = structuredClone(project);
        p.preview.expression = expression;
        const baked = bakeProject(p);
        exports.push(
          await exportPack(`${id}/expressions/${expression}`, p, baked),
        );
        expressionFrames.push({
          expression,
          generator: baked.manifest.generator,
        });
      }
      const rig = prepareRig(project.rig, project.skin, project.motions);
      const inspection = Array.from({ length: 12 }, (_, key) => ({
        key,
        ...rig.inspect("run", key),
      }));
      skins.push({
        id,
        name: skin.metadata.name,
        skinZipBase64: await base64(skinZip),
        projectZipBase64: await base64(projectZip),
        templateZipBase64: await base64(template),
        metadata: skin.metadata,
        inspection,
        expressionFrames,
        skinRoundTripPixelEquality: true,
        projectRoundTripPixelEquality: true,
      });
    }
    // Asset-only regression fixture: a custom ID and one actual replacement PNG.
    // This is deliberately a technical color fixture, not newly drawn character art.
    const base = createBuiltinSkin(ids[0]),
      archive = await exportSkinPack(base);
    const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const metadataName = Object.keys(entries).find(
      (name) =>
        name.endsWith(".json") &&
        (() => {
          try {
            return (
              JSON.parse(strFromU8(entries[name])).format ===
              "gathria-skin-pack"
            );
          } catch {
            return false;
          }
        })(),
    );
    assert(metadataName, "Skin archive metadata not found");
    const metadata = JSON.parse(strFromU8(entries[metadataName]));
    metadata.id = "import-regression-fixture";
    metadata.name = "Import regression fixture";
    metadata.provenance +=
      "\nTechnical PNG replacement fixture for portable-skin verification; not new artwork.";
    entries[metadataName] = strToU8(JSON.stringify(metadata, null, 2));
    const torsoName = Object.keys(entries).find((name) =>
      /(^|\/)torso\.png$/.test(name),
    );
    assert(torsoName, "Torso PNG not found");
    const bitmap = await createImageBitmap(
      new Blob([entries[torsoName]], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = ctx.getImageData(0, 0, 192, 256);
    let changedPixels = 0;
    for (let p = 0; p < rgba.data.length; p += 4)
      if (rgba.data[p + 3]) {
        const red = rgba.data[p];
        rgba.data[p] = rgba.data[p + 2];
        rgba.data[p + 2] = red;
        if (rgba.data[p] !== red) changedPixels++;
      }
    assert(
      changedPixels > 100,
      "Technical replacement changed too few torso pixels",
    );
    ctx.putImageData(rgba, 0, 0);
    const replacement = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    entries[torsoName] = new Uint8Array(await replacement.arrayBuffer());
    const fixture = await importSkinPack(
      new Blob([zipSync(entries)], { type: "application/zip" }),
    );
    assert(
      Object.keys(base.images)
        .filter((slot) => slot !== "torso")
        .every((slot) => equal(base.images[slot], fixture.images[slot])),
      "Technical fixture unexpectedly changed another slot",
    );
    const fixtureProject = createAuthoringProject(fixture),
      originalProject = createAuthoringProject(base);
    assert(
      JSON.stringify(fixtureProject.rig) ===
        JSON.stringify(originalProject.rig),
      "Fixture changed rig",
    );
    assert(
      JSON.stringify(fixtureProject.motions) ===
        JSON.stringify(originalProject.motions),
      "Fixture changed motion library",
    );
    const fixtureBake = bakeProject(fixtureProject),
      originalBake = bakeProject(originalProject);
    const changedFrames = [];
    for (const frame of fixtureBake.manifest.frames) {
      let differences = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 192; x++) {
          const p = ((frame.y + y) * fixtureBake.width + frame.x + x) * 4;
          if (
            fixtureBake.pixels[p] !== originalBake.pixels[p] ||
            fixtureBake.pixels[p + 1] !== originalBake.pixels[p + 1] ||
            fixtureBake.pixels[p + 2] !== originalBake.pixels[p + 2]
          )
            differences++;
        }
      assert(
        differences > 0,
        `Asset-only replacement not visible in frame ${frame.id}`,
      );
      changedFrames.push({ frame: frame.id, differingPixels: differences });
    }
    return {
      sharedRig,
      sharedMotions,
      skins,
      exports,
      assetOnlyImport: {
        skinId: fixture.metadata.id,
        name: fixture.metadata.name,
        changedSourcePixels: changedPixels,
        changedSlot: "torso",
        allOtherSlotPixelsEqual: Object.keys(base.images)
          .filter((slot) => slot !== "torso")
          .every((slot) => equal(base.images[slot], fixture.images[slot])),
        unchangedRig: true,
        unchangedMotions: true,
        changedFrames,
        label: "Technical PNG import regression fixture, not new artwork.",
      },
    };
  }, ids);
  await writeFile(
    new URL("shared-rig.json", output),
    JSON.stringify(result.sharedRig, null, 2) + "\n",
  );
  await writeFile(
    new URL("shared-motions.json", output),
    JSON.stringify(result.sharedMotions, null, 2) + "\n",
  );
  for (const skin of result.skins) {
    for (const [key, extension] of [
      ["skinZipBase64", "skin"],
      ["projectZipBase64", "rig"],
      ["templateZipBase64", "template"],
    ]) {
      const bytes = Buffer.from(skin[key], "base64");
      const entries = unzipSync(bytes);
      assert(Object.keys(entries).length > 0);
      const file = `${skin.id}.${extension}.zip`;
      await writeFile(new URL(file, output), bytes);
      skin[extension + "Archive"] = {
        file,
        bytes: bytes.length,
        sha256: sha256(bytes),
        members: Object.fromEntries(
          Object.entries(entries).map(([name, data]) => {
            assert(data.length, `${file}/${name}: empty`);
            return [name, { bytes: data.length, sha256: sha256(data) }];
          }),
        ),
      };
      if (extension === "skin" || extension === "template") {
        const directory = new URL(`${skin.id}/${extension}/`, output);
        for (const [name, value] of Object.entries(entries)) {
          assert(
            !name.includes("..") && !name.startsWith("/"),
            "Unsafe archive name",
          );
          const path = new URL(name, directory);
          await mkdir(new URL("./", path), { recursive: true });
          await writeFile(path, value);
        }
      }
      delete skin[key];
    }
    await writeFile(
      new URL(`${skin.id}/rig-inspection.json`, output),
      JSON.stringify({
        format: "gathria-rig-inspection",
        version: 1,
        frames: skin.inspection,
      }) + "\n",
    );
    delete skin.inspection;
  }
  const requiredFiles = [
    "INTEGRATION.md",
    "PROVENANCE.txt",
    "character.json",
    "manifest.json",
    "spritesheet.png",
  ].sort();
  for (const item of result.exports) {
    const bytes = Buffer.from(item.bytesBase64, "base64"),
      entries = unzipSync(bytes);
    assert.deepEqual(Object.keys(entries).sort(), requiredFiles);
    const directory = new URL(`${item.id}/`, output);
    await mkdir(directory, { recursive: true });
    // Expressions are evidence PNGs rather than six extra downloadable archives.
    if (!item.id.includes("/expressions/"))
      await writeFile(new URL(`${item.id}.character.zip`, output), bytes);
    const members = {};
    for (const [name, value] of Object.entries(entries)) {
      assert(value.length > 0);
      await writeFile(new URL(name, directory), value);
      members[name] = { bytes: value.length, sha256: sha256(value) };
    }
    item.zipSha256 = sha256(bytes);
    item.members = members;
    delete item.bytesBase64;
  }
  await studio
    .getByLabel("Example skin", { exact: true })
    .selectOption("coral-afternoon");
  await studio.getByLabel("Bones", { exact: true }).check();
  await studio.getByLabel("Mesh", { exact: true }).check();
  await studio.getByLabel("Animation frame", { exact: true }).fill("5");
  await studio.screenshot({
    path: new URL("skin-studio.png", output).pathname,
    fullPage: true,
  });
  console.log(
    `Exported both portable skins, source projects, templates and actual baked packs to ${relative}.`,
  );
  await studio.close();
  assert.equal(context.pages().length, 0);
  const playback = [];
  if (!fast) {
    const player = await context.newPage();
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
        .locator('input[type=file][accept=".zip,application/zip"]')
        .setInputFiles(new URL(`${id}.character.zip`, output).pathname);
      await player
        .getByText(
          `Loaded: ${result.skins.find((skin) => skin.id === id).name}`,
          { exact: true },
        )
        .waitFor();
      await player
        .getByText(result.exports.find((item) => item.id === id).generator, {
          exact: true,
        })
        .waitFor();
      await player.locator("#player-zoom").selectOption("1");
      for (const animation of ["idle", "walk", "run"])
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
            async (canvas, { path, id, animation, facing }) => {
              const manifest = await (
                await fetch(`/${path}${id}/manifest.json`)
              ).json();
              const sheet = await createImageBitmap(
                await (await fetch(`/${path}${id}/spritesheet.png`)).blob(),
              );
              const clip = manifest.animations[animation],
                expected = new Map();
              const originX = Math.round(canvas.width / 2),
                top = Math.floor((canvas.height - 256) / 2),
                anchorY = top + manifest.anchor.y;
              for (const id of new Set(clip.frames)) {
                const frame = manifest.frames.find((f) => f.id === id),
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
                const pixels = ctx.getImageData(
                  originX - 96,
                  top,
                  192,
                  256,
                ).data;
                const matches = [...expected]
                  .filter(([, p]) => p.every((value, i) => value === pixels[i]))
                  .map(([id]) => id);
                if (!matches.length)
                  throw Error(
                    `${id}/${animation}/${facing}: live pixels differ from PNG`,
                  );
                const frameId = Number(
                  canvas.getAttribute("aria-label").match(/frame (\d+)$/)[1],
                );
                if (matches.includes(frameId)) {
                  seen.add(frameId);
                  if (frameId !== previous) {
                    transitions.push({
                      frame: frameId,
                      ms: Math.round(performance.now() - start),
                    });
                    previous = frameId;
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
            { path: relative, id, animation, facing },
          );
          assert.deepEqual(
            observed.pixelVerifiedFrames,
            observed.expectedFrames,
            `${id}/${animation}/${facing}: incomplete playback`,
          );
          const sequence = observed.sequence.filter(
            (value, i, values) => i === 0 || value !== values[i - 1],
          );
          if (sequence.at(-1) === sequence[0]) sequence.pop();
          for (let i = 1; i < observed.transitions.length; i++)
            assert.equal(
              observed.transitions[i].frame,
              sequence[
                (sequence.indexOf(observed.transitions[i - 1].frame) + 1) %
                  sequence.length
              ],
              `${id}/${animation}/${facing}: skipped/out-of-order frame`,
            );
          playback.push({
            id,
            animation,
            facing,
            fullNativeFramePixelEquality: true,
            ...observed,
          });
          console.log(
            `Independent player: ${id}/${animation}/${facing}, ${observed.pixelVerifiedFrames.length} decoded PNG-matched frames.`,
          );
        }
      await player.locator("#player-zoom").selectOption("2");
      await player.screenshot({
        path: new URL(`${id}/independent-player.png`, output).pathname,
        fullPage: true,
      });
    }
  }
  await context.close();
  assert.deepEqual(errors, [], "Browser errors");
  assert.deepEqual(external, [], "Unexpected external requests");
  assert.deepEqual(
    forbidden,
    [],
    "Consumer imported authoring/generator modules",
  );
  assert.deepEqual(
    await hashes(),
    initialHashes,
    "Sources changed during capture; rerun once edits finish.",
  );
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source:
          "Actual browser skin export/fresh PNG import -> authoring ZIP reopen -> shared renderer bake -> CharacterPack PNG decode equality; authoring closed -> independent consumer.",
        iteration: iteration || null,
        fastPreviewOnly: fast,
        sourceFiles: initialHashes,
        historicalSourceFilesVerified: Object.keys(frozen.frozenFiles).length,
        sharedRig: "shared-rig.json",
        sharedMotions: "shared-motions.json",
        skins: result.skins,
        exports: result.exports,
        assetOnlyImport: result.assetOnlyImport,
        consumerOpenedAfterAuthoringClosed: !fast,
        livePixelRegion:
          "Full native 192 x 256 including feet; expected buffer reproduces only consumer guide.",
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
    `Saved ${relative}; ${playback.length} independent playback cases.`,
  );
} finally {
  await browser.close();
  await server.close();
}
