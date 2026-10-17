// Evidence uses real Skin Studio controls and downloads. Modules only verify downloads.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8 } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const output = new URL("docs/wardrobe-items/", root);
const origin = `http://127.0.0.1:${Number(process.env.WARDROBE_ITEM_PORT || 5187)}`;
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
  "scripts/generate-wardrobe-item-evidence.mjs",
  "scripts/render-wardrobe-item-review.py",
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
const itemRoundtrips = [];
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
async function archive(file, entries) {
  const bytes = zipSync(entries, { level: 6 });
  await writeFile(new URL(file, output), bytes);
  const members = Object.fromEntries(
    Object.entries(entries).map(([name, data]) => [
      name,
      { bytes: data.length, sha256: sha(data) },
    ]),
  );
  archives.push({ file, bytes: bytes.length, sha256: sha(bytes), members });
}
async function importItem(page, filename, group, id) {
  await page
    .getByLabel("Import clothing ZIP file", { exact: true })
    .setInputFiles(new URL(filename, output).pathname);
  await page
    .getByLabel(`Wardrobe ${group}`, { exact: true })
    .locator(`option[value="${id}"]`)
    .waitFor({ state: "attached" });
  assert.equal(
    await page.getByLabel(`Wardrobe ${group}`, { exact: true }).inputValue(),
    id,
  );
}
async function authorPatch(page, entries) {
  const result = await page.evaluate(
    async ({ artwork, mask }) => {
      async function decode(bytes) {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        image.close();
        return {
          canvas,
          ctx,
          data: ctx.getImageData(0, 0, canvas.width, canvas.height),
        };
      }
      const art = await decode(artwork),
        semantic = await decode(mask);
      // A deliberately small registered source edit: a stitched flower badge on
      // the jacket panel. It changes pixels and semantic ownership, not geometry.
      const badge = [
        "..oooooo..",
        ".o......o.",
        "o...pp...o",
        "o..pppp..o",
        "o...pp...o",
        "o.ppyypp.o",
        "o.ppyypp.o",
        "o...gg...o",
        "o..ggg...o",
        "o...g....o",
        ".o......o.",
        "..oooooo..",
      ];
      const colors = {
        o: [128, 91, 61],
        ".": [239, 214, 165],
        p: [234, 166, 132],
        y: [176, 119, 62],
        g: [111, 136, 82],
      };
      let edited = 0;
      for (let y = 0; y < badge.length; y++)
        for (let x = 0; x < badge[y].length; x++) {
          const offset = ((138 + y) * 192 + 81 + x) * 4;
          if (!art.data.data[offset + 3] || semantic.data.data[offset] !== 3)
            continue;
          art.data.data.set([...colors[badge[y][x]], 255], offset);
          semantic.data.data.set([0, 0, 0, 255], offset);
          edited++;
        }
      art.ctx.putImageData(art.data, 0, 0);
      semantic.ctx.putImageData(semantic.data, 0, 0);
      return {
        art: art.canvas.toDataURL().split(",")[1],
        mask: semantic.canvas.toDataURL().split(",")[1],
        edited,
      };
    },
    {
      artwork: [...entries["artwork/torso.png"]],
      mask: [...entries["masks/torso.png"]],
    },
  );
  assert(result.edited > 40);
  entries["artwork/torso.png"] = Buffer.from(result.art, "base64");
  entries["masks/torso.png"] = Buffer.from(result.mask, "base64");
  return result.edited;
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
  const checked = await page.evaluate(async (id) => {
    const { importProject } = await import("/src/skeletal/skin-io.ts");
    const { bakeProject } = await import("/src/skeletal/bake.ts");
    const { loadCharacterPack } = await import("/src/core/pack.ts");
    const project = await importProject(
      await (await fetch(`/docs/wardrobe-items/${id}.rig.zip`)).blob(),
    );
    const bake = bakeProject(project);
    const loaded = await loadCharacterPack(
      await (await fetch(`/docs/wardrobe-items/${id}.character.zip`)).blob(),
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
  }, id);
  assert(checked.pngDecodePixelEquality);
  assert.deepEqual(checked.alpha, [0, 255]);
  exports.push({ id, name: skin.name, recipe: metadata.wardrobe, ...checked });
  console.log(`Actual UI export ${id}: all 36 baked PNG poses match.`);
  return { project, metadata, pack, manifest };
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
  const legacyChecks = [];
  for (const id of ["crop-mixed", "waves-mixed"]) {
    await studio
      .getByLabel("Import project file", { exact: true })
      .setInputFiles(new URL(`docs/wardrobe/${id}.rig.zip`, root).pathname);
    await studio
      .locator(".skin-notice[role=status]")
      .filter({ hasText: "project opened" })
      .waitFor();
    const current = await download(
      studio,
      "Export CharacterPack",
      `legacy-${id}.character.zip`,
    );
    const previous = unzipSync(
      await readFile(new URL(`docs/wardrobe/${id}.character.zip`, root)),
    );
    assert.deepEqual(
      JSON.parse(Buffer.from(current["manifest.json"]).toString()),
      JSON.parse(Buffer.from(previous["manifest.json"]).toString()),
    );
    assert(
      await pixelEqual(
        studio,
        current["spritesheet.png"],
        previous["spritesheet.png"],
      ),
    );
    legacyChecks.push({
      id,
      version1ProjectReopened: true,
      all36FramePixelsExact: true,
      manifestExact: true,
      previousProjectSha256: sha(
        await readFile(new URL(`docs/wardrobe/${id}.rig.zip`, root)),
      ),
      previousPackSha256: sha(
        await readFile(new URL(`docs/wardrobe/${id}.character.zip`, root)),
      ),
    });
  }
  await studio.reload();
  await studio
    .getByRole("button", { name: "Open wardrobe", exact: true })
    .click();
  await studio.getByLabel("Expression", { exact: true }).selectOption("gentle");
  const baseline = await capture(studio, "crop-baseline");
  await studio
    .getByLabel("Item template group", { exact: true })
    .selectOption("top");
  const top = await download(
    studio,
    "Download item template",
    "denim-top-template.wardrobe.zip",
  );
  const item = JSON.parse(Buffer.from(top["item.json"]).toString());
  item.id = "custom-embroidered-denim";
  item.name = "Embroidered denim";
  item.provenance =
    "Derived from the application-exported Denim jacket template, using frozen V6 registered artwork. Added a 10 by 12 pixel embroidered flower badge to the torso at (81,138), clipped to existing upper-material pixels. Badge pixels are fixed material 0; mask alpha, slot extents and joints unchanged. Authored locally by scripts/generate-wardrobe-item-evidence.mjs. No image generation API used.";
  const editedPixels = await authorPatch(studio, top);
  top["item.json"] = strToU8(JSON.stringify(item, null, 2) + "\n");
  await archive("embroidered-denim.wardrobe.zip", top);
  await importItem(studio, "embroidered-denim.wardrobe.zip", "top", item.id);
  const importedTop = await download(
    studio,
    `Save ${item.name}`,
    "embroidered-denim-reexported.wardrobe.zip",
  );
  assert.deepEqual(
    JSON.parse(Buffer.from(importedTop["item.json"]).toString()),
    item,
  );
  for (const filename of Object.keys(top).filter((name) =>
    name.endsWith(".png"),
  ))
    assert(
      await pixelEqual(studio, top[filename], importedTop[filename]),
      filename,
    );
  itemRoundtrips.push({
    group: "top",
    id: item.id,
    editedPixels,
    metadataEqual: true,
    artworkAndMasksDecodedPixelsEqual: true,
  });
  const crop = await capture(studio, "crop-custom");
  for (const slot of ["head-neutral", "head-gentle", "head-joyful"])
    assert(
      await pixelEqual(
        studio,
        baseline.project[`slots/${slot}.png`],
        crop.project[`slots/${slot}.png`],
      ),
    );
  assert.deepEqual(crop.metadata.rig, baseline.metadata.rig);
  assert.deepEqual(crop.metadata.motions, baseline.metadata.motions);
  identityChecks.push({
    first: "crop-baseline",
    second: "crop-custom",
    headsExact: true,
    rigAndMotionsExact: true,
  });
  for (const [group, id, name] of [
    ["bottom", "custom-template-trousers", "Registered trousers"],
    ["shoes", "custom-template-laceups", "Registered lace-ups"],
  ]) {
    await studio
      .getByLabel("Item template group", { exact: true })
      .selectOption(group);
    const files = await download(
      studio,
      "Download item template",
      `${group}-template.wardrobe.zip`,
    );
    const metadata = JSON.parse(Buffer.from(files["item.json"]).toString());
    metadata.id = id;
    metadata.name = name;
    metadata.provenance =
      "Unmodified registered V6 template pixels and material masks, renamed to verify reusable clothing item portability. No new artwork and no image generation API.";
    files["item.json"] = strToU8(JSON.stringify(metadata, null, 2) + "\n");
    await archive(`${group}-registered.wardrobe.zip`, files);
    await importItem(studio, `${group}-registered.wardrobe.zip`, group, id);
    const reexport = await download(
      studio,
      `Save ${name}`,
      `${group}-reexported.wardrobe.zip`,
    );
    assert.deepEqual(
      JSON.parse(Buffer.from(reexport["item.json"]).toString()),
      metadata,
    );
    for (const filename of Object.keys(files).filter((name) =>
      name.endsWith(".png"),
    ))
      assert(
        await pixelEqual(studio, files[filename], reexport[filename]),
        filename,
      );
    itemRoundtrips.push({
      group,
      id,
      unchangedTemplatePixels: true,
      metadataEqual: true,
      artworkAndMasksDecodedPixelsEqual: true,
    });
  }
  await studio
    .getByLabel("Wardrobe identity", { exact: true })
    .selectOption("waves");
  await studio.getByLabel("Top color", { exact: true }).fill("#75967e");
  await studio.getByLabel("Skin color", { exact: true }).fill("#8f5b40");
  await studio
    .getByRole("button", { name: "Apply colors", exact: true })
    .click();
  await studio.getByLabel("Action", { exact: true }).selectOption("jump");
  await studio.getByLabel("Facing", { exact: true }).selectOption("left");
  const waves = await capture(studio, "waves-custom");
  assert.equal(waves.metadata.wardrobe.version, 2);
  assert.equal(waves.metadata.wardrobe.top, item.id);
  assert.equal(
    JSON.parse(Buffer.from(waves.project["wardrobe.json"]).toString()).items
      .length,
    3,
  );
  await studio.reload();
  await studio
    .getByLabel("Import project file", { exact: true })
    .setInputFiles(new URL("waves-custom.rig.zip", output).pathname);
  await studio
    .getByLabel("Wardrobe top", { exact: true })
    .locator(`option[value="${item.id}"]`)
    .waitFor({ state: "attached" });
  assert.equal(
    await studio.getByLabel("Wardrobe identity", { exact: true }).inputValue(),
    "waves",
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
    "waves-custom-reopened.character.zip",
  );
  assert.deepEqual(
    JSON.parse(Buffer.from(reopened["manifest.json"]).toString()),
    waves.manifest,
  );
  assert(
    await pixelEqual(
      studio,
      reopened["spritesheet.png"],
      waves.pack["spritesheet.png"],
    ),
  );
  roundtrips.push({
    id: "waves-custom",
    freshPage: true,
    libraryItems: 3,
    selectedCustomItemsRestored: true,
    previewRestored: true,
    pngPixelsEqual: true,
    manifestEqual: true,
  });
  await studio.getByLabel("Expression", { exact: true }).selectOption("joyful");
  await capture(studio, "waves-joyful");
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  await studio.getByLabel("Facing", { exact: true }).selectOption("right");
  await studio.getByLabel("Zoom", { exact: true }).selectOption("2");
  await studio.getByLabel("Animation frame", { exact: true }).fill("5");
  await painted(studio);
  await studio.screenshot({
    path: new URL("studio-workflow.png", output).pathname,
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
  for (const id of ["waves-custom"]) {
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
              await fetch(`/docs/wardrobe-items/${id}/manifest.json`)
            ).json();
            const sheet = await createImageBitmap(
              await (
                await fetch(`/docs/wardrobe-items/${id}/spritesheet.png`)
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
          "Real wardrobe controls, template downloads, explicit registered PNG/mask authoring, item reimport and project/CharacterPack downloads. All review pixels come from actual exported CharacterPacks.",
        sourceFiles: initialHashes,
        authoringClosedBeforeConsumer: true,
        exports,
        archives,
        roundtrips,
        itemRoundtrips,
        identityChecks,
        legacyChecks,
        mobileWidth,
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
    `Captured ${archives.length} archives and ${playback.length} full-cycle independent playback checks.`,
  );
} finally {
  await browser.close();
  await server.close();
}
