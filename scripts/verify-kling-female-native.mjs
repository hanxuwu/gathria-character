// Real native-study UI downloads; four static poses, never animation cycles.
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const phase = process.env.EVIDENCE_PHASE || "final";
assert(
  ["initial", "final"].includes(phase) ||
    /^iterations\/[a-z0-9-]+$/.test(phase),
);
const quick = process.env.EVIDENCE_QUICK === "1";
const outputPath = `docs/kling-native-female/${phase}/`;
const output = new URL(outputPath, root);
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Preserve previous evidence; use a new phase.",
);
const temp = await mkdtemp(join(tmpdir(), "gathria-native-study-"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const inputs = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
    "*.html",
    "vite.config.ts",
    "artwork/kling-native-female",
  ],
  { cwd: fileURLToPath(root), encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter((file) => existsSync(new URL(file, root)))
  .sort();
const hashes = async () =>
  Object.fromEntries(
    await Promise.all(
      inputs.map(async (p) => [p, sha(await readFile(new URL(p, root)))]),
    ),
  );
const poses = [
  ["standing", "Standing", "idle"],
  ["walk-contact", "Walk contact", "walk"],
  ["run-flight", "Run flight", "run"],
  ["celebrate", "Celebrate", "celebrate"],
];
const report = {
  format: "gathria-female-native-study-evidence",
  version: 1,
  phase,
  quick,
  startedAt: new Date().toISOString(),
  scope:
    "Four female native static skeletal pose studies; no completed animation cycles or user visual acceptance claimed.",
  inputHashes: await hashes(),
  downloads: [],
  decodedPngs: [],
  editorPoses: [],
  archives: [],
  independentPlayback: [],
  errors: [],
  externalRequests: [],
  forbiddenEditorRequests: [],
};
const log = (value) => console.log(new Date().toISOString(), value);
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
const painted = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
async function download(page, label, file, destination = output) {
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: label, exact: true }).click();
  await (await pending).saveAs(new URL(file, destination).pathname);
  await expect(
    page.getByRole("button", { name: label, exact: true }),
  ).toBeEnabled({ timeout: 120000 });
  const bytes = await readFile(new URL(file, destination));
  assert(bytes.length);
  report.downloads.push({
    file,
    bytes: bytes.length,
    sha256: sha(bytes),
    source: "Actual application UI download",
    retained: destination === output,
  });
  return bytes;
}
async function rawPng(page, file, expected) {
  const result = await page.evaluate(
    async ({ path, expected }) => {
      const { decodeSourceRgbaPng } = await import("/src/core/baked-source.ts");
      const bytes = new Uint8Array(await (await fetch(path)).arrayBuffer());
      const image = decodeSourceRgbaPng(bytes, expected);
      const digest = await crypto.subtle.digest("SHA-256", image.pixels);
      const alpha = new Set();
      let transparent = 0,
        partial = 0,
        visible = 0;
      for (let i = 3; i < image.pixels.length; i += 4) {
        const a = image.pixels[i];
        alpha.add(a);
        if (!a) transparent++;
        else if (a < 255) partial++;
        if (a) visible++;
      }
      return {
        width: image.width,
        height: image.height,
        rgbaSha256: [...new Uint8Array(digest)]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join(""),
        transparent,
        partial,
        visible,
        alphaLevels: alpha.size,
      };
    },
    { path: `/${outputPath}${file}`, expected },
  );
  assert(
    result.visible > 0 && result.transparent > 0 && result.partial > 0,
    `Empty/opaque/binary-alpha PNG: ${file}`,
  );
  report.decodedPngs.push({ file, ...result });
  return result;
}
async function matchesDisplayed(page, file) {
  return page.locator("#native-posed-canvas").evaluate(async (canvas, path) => {
    const { decodeSourceRgbaPng } = await import("/src/core/baked-source.ts");
    const image = decodeSourceRgbaPng(
      new Uint8Array(await (await fetch(path)).arrayBuffer()),
      { width: 704, height: 1056 },
    );
    const expected = document.createElement("canvas");
    expected.width = image.width;
    expected.height = image.height;
    expected
      .getContext("2d")
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(image.pixels),
          image.width,
          image.height,
        ),
        0,
        0,
      );
    const wanted = expected
      .getContext("2d")
      .getImageData(0, 0, image.width, image.height).data;
    const actual = canvas
      .getContext("2d")
      .getImageData(0, 0, image.width, image.height).data;
    return {
      exactCanvasMatch: actual.every((v, i) => v === wanted[i]),
      note: "Both expected and actual pass through the same browser Canvas premultiplication; raw PNG checks are separate.",
    };
  }, `/${outputPath}${file}`);
}
async function inspectArchive(bytes, file, extract) {
  const entries = unzipSync(bytes);
  const members = {};
  for (const [name, data] of Object.entries(entries)) {
    assert(
      data.length && !name.startsWith("/") && !name.split("/").includes(".."),
    );
    members[name] = { bytes: data.length, sha256: sha(data) };
    if (name.endsWith(".json")) JSON.parse(Buffer.from(data).toString());
    if (extract) {
      const target = new URL(`${extract}/${name}`, output);
      await mkdir(new URL("./", target), { recursive: true });
      await writeFile(target, data);
    }
  }
  report.archives.push({ file, sha256: sha(bytes), members });
  return entries;
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) => report.errors.push(error.message)),
  );
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith(origin + "/")) {
      report.externalRequests.push(url);
      return route.abort();
    }
    return route.continue();
  });
  const library = await context.newPage();
  await library.goto(`${origin}/`);
  const femaleEntry = library.getByRole("link", {
    name: "Edit Kling female skeleton",
    exact: true,
  });
  await expect(femaleEntry).toBeVisible();
  await expect(femaleEntry).toHaveAttribute(
    "href",
    "/workbench.html?character=female&mode=rig",
  );
  await library.screenshot({
    path: new URL("library-female-entry.png", output).pathname,
    fullPage: true,
  });
  await femaleEntry.click();
  await expect(
    library.getByRole("tab", { name: "Female skeleton", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const femaleFrame = library.frameLocator('iframe[src*="character=female"]');
  await expect(femaleFrame.getByRole("status")).toContainText("Kling female", {
    timeout: 120000,
  });
  await library.screenshot({
    path: new URL("workbench-female-skeleton.png", output).pathname,
    fullPage: true,
  });
  report.visibleEntry = {
    label: "Edit Kling female skeleton",
    url: "/workbench.html?character=female&mode=rig",
    loadedFemale: true,
  };
  await library.close();
  const candidate = await context.newPage();
  await candidate.goto(`${origin}/skin-studio.html?character=female`);
  await expect(candidate.getByRole("status")).toContainText("Loaded:", {
    timeout: 120000,
  });
  await expect(candidate.getByRole("alert")).toHaveCount(0);
  await candidate
    .getByLabel("Display zoom", { exact: true })
    .selectOption("0.5");
  await writeFile(
    new URL("reference.png", output),
    await readFile(
      new URL("artwork/kling-native-female/prepared/reference.png", root),
    ),
  );
  const pngs = {};
  for (const facing of ["right", "left"]) {
    await candidate
      .getByLabel("Direction", { exact: true })
      .selectOption(facing);
    for (const [id] of poses) {
      await candidate
        .getByLabel("Review pose", { exact: true })
        .selectOption(id);
      await expect(candidate.locator("#native-posed-canvas")).toHaveAttribute(
        "data-pose",
        id,
      );
      await painted(candidate);
      const file = `${id}-${facing}-1x.png`;
      pngs[`${id}-${facing}`] = await download(
        candidate,
        "Export pose PNG",
        file,
      );
      const raw = await rawPng(candidate, file, { width: 704, height: 1056 });
      const display = await matchesDisplayed(candidate, file);
      assert(
        display.exactCanvasMatch,
        `${id}/${facing} display/export mismatch`,
      );
      report.editorPoses.push({
        pose: id,
        facing,
        exportedPng: file,
        ...raw,
        ...display,
      });
      if (facing === "right") {
        await candidate.screenshot({
          path: new URL(`ui-${id}.png`, output).pathname,
          fullPage: true,
        });
        await candidate.getByLabel("Bones", { exact: true }).check();
        await painted(candidate);
        const data = await candidate
          .locator("#native-posed-canvas")
          .evaluate((canvas) => canvas.toDataURL("image/png"));
        await writeFile(
          new URL(`${id}-bones-right.png`, output),
          Buffer.from(data.split(",")[1], "base64"),
        );
        await candidate.getByLabel("Bones", { exact: true }).uncheck();
      }
    }
  }
  log(
    "Downloaded eight actual native static pose PNGs and actual canvas overlays.",
  );
  await candidate
    .getByLabel("Direction", { exact: true })
    .selectOption("right");
  await candidate
    .getByLabel("Review pose", { exact: true })
    .selectOption("standing");
  const projectBytes = await download(
    candidate,
    "Save native project",
    "kling-female-native-study.project.zip",
  );
  const projectFiles = await inspectArchive(
    projectBytes,
    "kling-female-native-study.project.zip",
    "project",
  );
  const doc = JSON.parse(Buffer.from(projectFiles["document.json"]).toString());
  assert.equal(doc.characterId, "kling-female-native-study");
  assert.equal(doc.parts.length, 15);
  assert.equal(doc.poses.length, 4);
  assert.deepEqual(doc.frame, { width: 704, height: 1056 });
  assert.equal(
    sha(projectFiles["reference.png"]),
    sha(await readFile(new URL("reference.png", output))),
  );
  report.nativeProject = {
    parts: doc.parts.length,
    poses: doc.poses.length,
    referenceSha256: sha(projectFiles["reference.png"]),
    sourceReferenceUnchanged: true,
  };
  if (quick) {
    report.inputHashesAfter = await hashes();
    report.inputsUnchanged =
      JSON.stringify(report.inputHashes) ===
      JSON.stringify(report.inputHashesAfter);
    report.passed = report.errors.length === 0;
    log(
      "Quick initial capture complete; full save/reopen/player workflow deferred to final capture.",
    );
  } else {
    const packBytes = await download(
      candidate,
      "Export static CharacterPack",
      "kling-female-native-stills.character.zip",
    );
    const packFiles = await inspectArchive(
      packBytes,
      "kling-female-native-stills.character.zip",
      "character-pack",
    );
    const manifest = JSON.parse(
      Buffer.from(packFiles["manifest.json"]).toString(),
    );
    const recipe = JSON.parse(
      Buffer.from(packFiles["character.json"]).toString(),
    );
    assert.equal(recipe.characterId, "kling-female-native-study");
    assert.match(manifest.name, /female/);
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.frames.length, 4);
    assert.equal(manifest.scale.pixelArt, false);
    assert.deepEqual(Object.keys(manifest.animations).sort(), [
      "celebrate",
      "idle",
      "run",
      "walk",
    ]);
    for (const [index, [, , action]] of poses.entries())
      assert.deepEqual(manifest.animations[action], {
        frames: [index],
        fps: 1,
        loop: false,
      });
    assert(!manifest.animations.jump);
    assert.equal(
      recipe.source.sha256,
      sha(projectBytes),
      "Portable pack source hash must identify the separately saved editable project exactly.",
    );
    report.characterPack = {
      schemaVersion: 2,
      dimensions: [manifest.spritesheet.width, manifest.spritesheet.height],
      animations: manifest.animations,
      anchor: manifest.anchor,
      source:
        "Actual native study UI export; four static holds, not source-video animation.",
    };
    report.rawPixelChecks = await candidate.evaluate(async (path) => {
      const { decodeSourceRgbaPng } = await import("/src/core/baked-source.ts");
      const decode = async (file, width = 704) =>
        decodeSourceRgbaPng(
          new Uint8Array(await (await fetch(`${path}${file}`)).arrayBuffer()),
          { width, height: 1056 },
        );
      const reference = await decode("reference.png");
      const atlas = await decode("character-pack/spritesheet.png", 2816);
      const checks = [];
      for (const [index, id] of [
        "standing",
        "walk-contact",
        "run-flight",
        "celebrate",
      ].entries()) {
        const right = await decode(`${id}-right-1x.png`),
          left = await decode(`${id}-left-1x.png`);
        let atlasDifferentChannels = 0,
          mirrorDifferentChannels = 0;
        for (let y = 0; y < 1056; y++)
          for (let x = 0; x < 704; x++)
            for (let c = 0; c < 4; c++) {
              const n = (y * 704 + x) * 4 + c;
              if (
                right.pixels[n] !==
                atlas.pixels[(y * 2816 + index * 704 + x) * 4 + c]
              )
                atlasDifferentChannels++;
              if (left.pixels[n] !== right.pixels[(y * 704 + 703 - x) * 4 + c])
                mirrorDifferentChannels++;
            }
        checks.push({
          pose: id,
          atlasDifferentChannels,
          mirrorDifferentChannels,
        });
      }
      const standing = await decode("standing-right-1x.png");
      let restDifferentChannels = 0;
      for (let i = 0; i < reference.pixels.length; i++)
        if (reference.pixels[i] !== standing.pixels[i]) restDifferentChannels++;
      return { restDifferentChannels, poses: checks };
    }, `/${outputPath}`);
    assert.equal(
      report.rawPixelChecks.restDifferentChannels,
      0,
      "Standing actual export must retain reference RGBA exactly.",
    );
    assert(
      report.rawPixelChecks.poses.every(
        (p) =>
          p.atlasDifferentChannels === 0 && p.mirrorDifferentChannels === 0,
      ),
    );

    // Reopen baseline, then exercise a real edit/save/reopen/undo-reset path.
    await candidate
      .getByLabel("Native project ZIP", { exact: true })
      .setInputFiles(
        new URL("kling-female-native-study.project.zip", output).pathname,
      );
    await expect(candidate.getByRole("status")).toContainText(
      "Native project reopened",
      { timeout: 120000 },
    );
    await candidate
      .getByLabel("Review pose", { exact: true })
      .selectOption("run-flight");
    await painted(candidate);
    assert(
      (await matchesDisplayed(candidate, "run-flight-right-1x.png"))
        .exactCanvasMatch,
    );
    await candidate.getByLabel("Limb", { exact: true }).selectOption("nearArm");
    const upper = candidate.getByLabel("Upper rotation (degrees)", {
      exact: true,
    });
    const before = Number(await upper.inputValue());
    await upper.fill(String(before + 5));
    await candidate
      .getByRole("button", { name: "Apply joint angles", exact: true })
      .click();
    await expect(candidate.getByRole("status")).toContainText("Pose updated");
    await painted(candidate);
    const editedBefore = await candidate
      .locator("#native-posed-canvas")
      .evaluate((canvas) => canvas.toDataURL());
    assert(
      !(await matchesDisplayed(candidate, "run-flight-right-1x.png"))
        .exactCanvasMatch,
    );
    await candidate
      .getByRole("button", { name: "Undo pose edit", exact: true })
      .click();
    await painted(candidate);
    assert(
      (await matchesDisplayed(candidate, "run-flight-right-1x.png"))
        .exactCanvasMatch,
    );
    await upper.fill(String(before + 5));
    await candidate
      .getByRole("button", { name: "Apply joint angles", exact: true })
      .click();
    await candidate
      .getByRole("button", { name: "Reset this pose", exact: true })
      .click();
    await painted(candidate);
    assert(
      (await matchesDisplayed(candidate, "run-flight-right-1x.png"))
        .exactCanvasMatch,
    );
    await upper.fill(String(before + 5));
    await candidate
      .getByRole("button", { name: "Apply joint angles", exact: true })
      .click();
    await painted(candidate);
    assert.equal(
      await candidate
        .locator("#native-posed-canvas")
        .evaluate((canvas) => canvas.toDataURL()),
      editedBefore,
    );
    const temporary = new URL(`file://${temp}/`);
    await download(
      candidate,
      "Save native project",
      "edited.project.zip",
      temporary,
    );
    await candidate
      .getByLabel("Native project ZIP", { exact: true })
      .setInputFiles(join(temp, "edited.project.zip"));
    await expect(candidate.getByRole("status")).toContainText(
      "Native project reopened",
      { timeout: 120000 },
    );
    await candidate
      .getByLabel("Review pose", { exact: true })
      .selectOption("run-flight");
    await painted(candidate);
    assert.equal(
      await candidate
        .locator("#native-posed-canvas")
        .evaluate((canvas) => canvas.toDataURL()),
      editedBefore,
    );
    await candidate
      .getByLabel("Native project ZIP", { exact: true })
      .setInputFiles(
        new URL("kling-female-native-study.project.zip", output).pathname,
      );
    await expect(candidate.getByRole("status")).toContainText(
      "Native project reopened",
      { timeout: 120000 },
    );
    await candidate
      .getByLabel("Review pose", { exact: true })
      .selectOption("run-flight");
    await painted(candidate);
    assert(
      (await matchesDisplayed(candidate, "run-flight-right-1x.png"))
        .exactCanvasMatch,
    );
    report.projectSaveReopen = {
      baselineMatches: true,
      poseEditChangesActualRender: true,
      editedProjectReopensExactly: true,
      undoRestoresBaseline: true,
      resetRestoresBaseline: true,
      baselineRestored: true,
    };
    await candidate.close();
    assert.equal(context.pages().length, 0);
    report.editorClosedBeforeIndependentPlayer = true;

    const player = await context.newPage();
    await player.route(
      /\/src\/(skeletal\/|experiments\/|editor\/|core\/(generator|running-rig|cohesive|polished|harmonized|illustrated|expressive))/,
      (route) => {
        report.forbiddenEditorRequests.push(route.request().url());
        return route.abort();
      },
    );
    await player.goto(`${origin}/player.html`);
    await player
      .locator("#player-zip")
      .setInputFiles(
        new URL("kling-female-native-stills.character.zip", output).pathname,
      );
    await expect(player.getByRole("status")).toContainText(
      `Loaded: ${manifest.name}`,
      { timeout: 120000 },
    );
    await player.locator("#player-zoom").selectOption("1");
    await expect(
      player.getByRole("button", { name: "Jump", exact: true }),
    ).toBeDisabled();
    for (const facing of ["right", "left"]) {
      await player
        .getByRole("button", {
          name: facing === "right" ? "Right" : "Left",
          exact: true,
        })
        .click();
      for (const [index, [id, , action]] of poses.entries()) {
        await player
          .getByRole("button", {
            name: action[0].toUpperCase() + action.slice(1),
            exact: true,
          })
          .click();
        await expect(player.getByTestId("consumer-canvas")).toHaveAttribute(
          "data-frame-id",
          String(index),
        );
        await painted(player);
        const comparison = await player.getByTestId("consumer-canvas").evaluate(
          async (canvas, input) => {
            const image = await createImageBitmap(
              new Blob([new Uint8Array(input.bytes)], { type: "image/png" }),
            );
            const expected = document.createElement("canvas");
            expected.width = canvas.width;
            expected.height = canvas.height;
            const ctx = expected.getContext("2d");
            const x = Math.round(canvas.width / 2),
              top = Math.floor((canvas.height - 1056) / 2),
              y = top + input.anchor[1];
            ctx.strokeStyle = "#c7c4d1";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.moveTo(24, y + 0.5);
            ctx.lineTo(canvas.width - 24, y + 0.5);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.drawImage(image, x - input.anchor[0], top);
            ctx.strokeStyle = "#7762d6";
            ctx.beginPath();
            ctx.moveTo(x - 5, y + 0.5);
            ctx.lineTo(x + 5, y + 0.5);
            ctx.moveTo(x + 0.5, y - 5);
            ctx.lineTo(x + 0.5, y + 5);
            ctx.stroke();
            const actual = canvas
              .getContext("2d")
              .getImageData(0, 0, canvas.width, canvas.height).data;
            const wanted = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            let differingChannels = 0;
            for (let i = 0; i < actual.length; i++)
              if (actual[i] !== wanted[i]) differingChannels++;
            image.close();
            return { differingChannels, exact: differingChannels === 0 };
          },
          {
            bytes: [...pngs[`${id}-${facing}`]],
            anchor: [manifest.anchor.x, manifest.anchor.y],
          },
        );
        assert(
          comparison.exact,
          `${action}/${facing}: consumer differs from actual exported pose`,
        );
        await expect(
          player.getByRole("button", { name: "Replay animation", exact: true }),
        ).toBeVisible({ timeout: 5000 });
        await expect(player.getByTestId("consumer-canvas")).toHaveAttribute(
          "data-frame-id",
          String(index),
        );
        await expect(player.getByTestId("consumer-canvas")).toHaveAttribute(
          "data-frame-position",
          "0",
        );
        report.independentPlayback.push({
          pose: id,
          action,
          facing,
          frameId: index,
          staticHoldEnded: true,
          ...comparison,
        });
      }
    }
    await player.locator("#player-zoom").selectOption("0.5");
    await player.screenshot({
      path: new URL("independent-player.png", output).pathname,
      fullPage: true,
    });
    assert.equal(report.forbiddenEditorRequests.length, 0);
    assert.equal(report.externalRequests.length, 0);
    assert.equal(report.errors.length, 0);
    report.inputHashesAfter = await hashes();
    const changedInputs = Object.keys(report.inputHashes).filter(
      (file) => report.inputHashes[file] !== report.inputHashesAfter[file],
    );
    assert.equal(
      changedInputs.length,
      0,
      `Runtime/source assets changed during capture; use a fresh phase. Changed: ${changedInputs.join(", ")}`,
    );
    report.inputsUnchanged = true;
    report.passed = true;
    log(
      "Native study save/reopen and closed-editor independent static playback verified.",
    );
  }
} catch (error) {
  report.passed = false;
  report.failure = error.stack || String(error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser?.close();
  await server.close();
  await rm(temp, { recursive: true, force: true });
}
