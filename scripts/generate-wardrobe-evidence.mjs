// Evidence uses real Skin Studio controls and downloads. Modules only verify downloads.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const output = new URL("docs/wardrobe/", root);
const origin = `http://127.0.0.1:${Number(process.env.WARDROBE_PORT || 5186)}`;
const actions = ["idle", "walk", "run", "jump"];
const cropColors = {
  skin: "#E5AE87",
  top: "#527D9A",
  bottom: "#A37B56",
  shoes: "#594435",
};
const wavesColors = {
  skin: "#F5D3AE",
  top: "#C77973",
  bottom: "#705049",
  shoes: "#6D4B39",
};
const looks = [
  {
    id: "crop-denim",
    name: "Crop / denim, trousers and lace-ups",
    identity: "crop",
    top: "denim-jacket",
    bottom: "trousers",
    shoes: "boots",
    colors: cropColors,
  },
  {
    id: "crop-mixed",
    name: "Crop / soft top, skirt and lace-ups",
    identity: "crop",
    top: "soft-top",
    bottom: "short-skirt",
    shoes: "boots",
    colors: cropColors,
  },
  {
    id: "waves-soft",
    name: "Waves / soft top and skirt",
    identity: "waves",
    top: "soft-top",
    bottom: "short-skirt",
    shoes: "flats",
    colors: wavesColors,
  },
  {
    id: "waves-mixed",
    name: "Waves / denim, trousers and flats",
    identity: "waves",
    top: "denim-jacket",
    bottom: "trousers",
    shoes: "flats",
    colors: wavesColors,
  },
];
const playerIds = ["crop-mixed", "waves-mixed"];
const sourceFiles = [
  "src/skeletal/Studio.tsx",
  "src/skeletal/WardrobePanel.tsx",
  "src/skeletal/wardrobe-panel.css",
  "src/skeletal/types.ts",
  "src/skeletal/wardrobe-types.ts",
  "src/skeletal/wardrobe.ts",
  "src/skeletal/wardrobe-assets.generated.ts",
  "src/skeletal/builtins.ts",
  "src/skeletal/definition.ts",
  "src/skeletal/renderer.ts",
  "src/skeletal/bake.ts",
  "src/skeletal/skin-io.ts",
  "src/skeletal/playback.ts",
  "src/skeletal/MotionEditor.tsx",
  "src/skeletal/motion-edit.ts",
  "src/consumer/player.ts",
  "src/consumer/PackPlayer.tsx",
  "src/core/types.ts",
  "src/core/pack.ts",
  "scripts/prepare-wardrobe-assets.mjs",
  "scripts/generate-wardrobe-evidence.mjs",
  "scripts/render-wardrobe-review.py",
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
  identityChecks = [];
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
async function setLook(page, look) {
  for (const key of ["identity", "top", "bottom", "shoes"])
    await page
      .getByLabel(`Wardrobe ${key}`, { exact: true })
      .selectOption(look[key]);
  for (const [key, value] of Object.entries(look.colors))
    await page
      .getByLabel(`${key[0].toUpperCase() + key.slice(1)} color`, {
        exact: true,
      })
      .fill(value);
  const apply = page.getByRole("button", { name: "Apply colors", exact: true });
  if (await apply.isEnabled()) await apply.click();
  await page.getByLabel("Character name", { exact: true }).fill(look.name);
  await page.getByLabel("Expression", { exact: true }).selectOption("gentle");
  await page.getByLabel("Action", { exact: true }).selectOption("jump");
  await page.getByLabel("Facing", { exact: true }).selectOption("left");
  await painted(page);
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
  await studio
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
  let sharedRig, sharedMotions;
  const saved = new Map();
  for (const look of looks) {
    await setLook(studio, look);
    const project = await download(
      studio,
      "Save project ZIP",
      `${look.id}.rig.zip`,
    );
    const metadata = JSON.parse(
      Buffer.from(project["project.json"]).toString(),
    );
    const skin = JSON.parse(Buffer.from(project["skin.json"]).toString());
    assert(metadata.wardrobe, `${look.id}: wardrobe recipe missing`);
    for (const key of ["identity", "top", "bottom", "shoes"])
      assert.equal(metadata.wardrobe[key], look[key]);
    for (const [key, value] of Object.entries(look.colors))
      assert.equal(
        metadata.wardrobe.colors[key].toLowerCase(),
        value.toLowerCase(),
      );
    assert.equal(metadata.preview.animation, "jump");
    assert.equal(metadata.preview.facing, "left");
    assert.equal(metadata.motions.clips.jump.loop, false);
    if (sharedRig) {
      assert.deepEqual(metadata.rig, sharedRig);
      assert.deepEqual(metadata.motions, sharedMotions);
    }
    sharedRig = metadata.rig;
    sharedMotions = metadata.motions;
    const pack = await download(
      studio,
      "Export CharacterPack",
      `${look.id}.character.zip`,
      `${look.id}/`,
    );
    const manifest = JSON.parse(Buffer.from(pack["manifest.json"]).toString());
    assert.deepEqual(
      Object.keys(manifest.animations).sort(),
      [...actions].sort(),
    );
    assert.equal(manifest.frames.length, 36);
    assert.equal(manifest.animations.jump.loop, false);
    saved.set(look.id, { project, metadata, pack, manifest });
    const decoded = await studio.evaluate(
      async ({ id }) => {
        const { importProject } = await import("/src/skeletal/skin-io.ts");
        const { bakeProject } = await import("/src/skeletal/bake.ts");
        const { loadCharacterPack } = await import("/src/core/pack.ts");
        const project = await importProject(
          await (await fetch(`/docs/wardrobe/${id}.rig.zip`)).blob(),
        );
        const bake = bakeProject(project),
          pack = await loadCharacterPack(
            await (await fetch(`/docs/wardrobe/${id}.character.zip`)).blob(),
          );
        const canvas = document.createElement("canvas");
        canvas.width = bake.width;
        canvas.height = bake.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(pack.image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        return {
          pngDecodePixelEquality: pixels.every((v, i) => v === bake.pixels[i]),
          alpha: [...new Set(pixels.filter((_, i) => i % 4 === 3))].sort(),
        };
      },
      { id: look.id },
    );
    assert(decoded.pngDecodePixelEquality);
    assert.deepEqual(decoded.alpha, [0, 255]);
    exports.push({
      id: look.id,
      name: skin.name,
      recipe: metadata.wardrobe,
      ...decoded,
    });
    console.log(`UI wardrobe export: ${look.id}; same rig and four actions.`);
  }
  for (const [first, second] of [
    ["crop-denim", "crop-mixed"],
    ["waves-soft", "waves-mixed"],
  ]) {
    const a = saved.get(first),
      b = saved.get(second);
    for (const slot of [
      "head-neutral",
      "head-gentle",
      "head-joyful",
      "back-hair",
    ]) {
      const left = a.project[`slots/${slot}.png`],
        right = b.project[`slots/${slot}.png`];
      assert.equal(!!left, !!right);
      if (left)
        assert(
          await pixelEqual(studio, left, right),
          `${first}/${second}: ${slot} changed with clothing`,
        );
    }
    identityChecks.push({
      first,
      second,
      threeHeadAndBackHairPngPixelsEqual: true,
      rigAndMotionsEqual: true,
    });
  }
  for (const id of playerIds) {
    const look = looks.find((l) => l.id === id),
      prior = saved.get(id);
    await studio
      .getByLabel("Import project file", { exact: true })
      .setInputFiles(new URL(`${id}.rig.zip`, output).pathname);
    await studio
      .locator(".skin-notice[role=status]")
      .filter({ hasText: "project opened" })
      .waitFor();
    for (const key of ["identity", "top", "bottom", "shoes"])
      assert.equal(
        await studio
          .getByLabel(`Wardrobe ${key}`, { exact: true })
          .inputValue(),
        look[key],
      );
    for (const [key, value] of Object.entries(look.colors))
      assert.equal(
        (
          await studio
            .getByLabel(`${key[0].toUpperCase() + key.slice(1)} color`, {
              exact: true,
            })
            .inputValue()
        ).toLowerCase(),
        value.toLowerCase(),
      );
    assert.equal(
      await studio.getByLabel("Action", { exact: true }).inputValue(),
      "jump",
    );
    assert.equal(
      await studio.getByLabel("Facing", { exact: true }).inputValue(),
      "left",
    );
    const reopened = await download(
      studio,
      "Export CharacterPack",
      `${id}-reopened.character.zip`,
    );
    assert(
      await pixelEqual(
        studio,
        prior.pack["spritesheet.png"],
        reopened["spritesheet.png"],
      ),
    );
    assert.deepEqual(
      JSON.parse(Buffer.from(reopened["manifest.json"]).toString()),
      prior.manifest,
    );
    roundtrips.push({
      id,
      recipeControlsRestored: true,
      previewRestored: true,
      pngPixelsEqual: true,
      manifestEqual: true,
    });
    for (const expression of ["neutral", "joyful"]) {
      await studio
        .getByLabel("Expression", { exact: true })
        .selectOption(expression);
      await download(
        studio,
        "Export CharacterPack",
        `${id}-${expression}.character.zip`,
        `${id}-${expression}/`,
      );
    }
  }
  await studio
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(new URL("waves-mixed.rig.zip", output).pathname);
  await studio
    .locator(".skin-notice[role=status]")
    .filter({ hasText: "project opened" })
    .waitFor();
  const recolor = {
    skin: "#8B543D",
    top: "#699581",
    bottom: "#43556F",
    shoes: "#D3B38A",
  };
  for (const [key, value] of Object.entries(recolor))
    await studio
      .getByLabel(`${key[0].toUpperCase() + key.slice(1)} color`, {
        exact: true,
      })
      .fill(value);
  await studio
    .getByRole("button", { name: "Apply colors", exact: true })
    .click();
  await download(studio, "Save project ZIP", "waves-recolor.rig.zip");
  await download(
    studio,
    "Export CharacterPack",
    "waves-recolor.character.zip",
    "waves-recolor/",
  );
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  await studio.getByLabel("Facing", { exact: true }).selectOption("right");
  await studio.getByLabel("Zoom", { exact: true }).selectOption("2");
  await studio.getByLabel("Animation frame", { exact: true }).fill("5");
  await painted(studio);
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
  assert(mobileWidth.document <= mobileWidth.viewport);
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
  for (const id of playerIds) {
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
          async (canvas, { id, facing, action }) => {
            const manifest = await (
              await fetch(`/docs/wardrobe/${id}/manifest.json`)
            ).json();
            const sheet = await createImageBitmap(
              await (
                await fetch(`/docs/wardrobe/${id}/spritesheet.png`)
              ).blob(),
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
              nominalDurationMs: durationMs,
              finalPosition: position,
              once: !clip.loop,
              replayStartedAtFirstFrameAndCompleted,
              finalStatus:
                document.querySelector("#player-one-shot-note")?.textContent ??
                null,
            };
          },
          { id, facing, action },
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
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source:
          "Actual wardrobe UI selections and downloaded ZIPs. Verification modules inspect only downloaded artifacts. Review frames come exclusively from the exported PNGs.",
        sourceFiles: initialHashes,
        sharedRigAndMotionsEqualAcrossLooks: true,
        authoringClosedBeforeConsumer: true,
        mobileWidth,
        looks,
        exports,
        archives,
        identityChecks,
        roundtrips,
        recolor,
        motions: sharedMotions,
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
    `Captured ${archives.length} ZIPs and ${playback.length} independent playback cases.`,
  );
} finally {
  await browser.close();
  await server.close();
}
