// Structural preparation checks complement, but do not replace, exported visual review.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = new URL("../", import.meta.url);
const phase = process.env.EVIDENCE_PHASE || "final";
assert(/^[a-z0-9-]+$/.test(phase), "EVIDENCE_PHASE must be a simple name");
const output = new URL(`docs/generated-traveler/${phase}/`, root);
const preparedPath = "artwork/generated-traveler/prepared/";
const prepared = new URL(preparedPath, root);
const baseline =
  process.env.FRESH_BASELINE_REF || "51c708ac847814a92fbe7186bb7713382bbf69f5";
const port = Number(process.env.FRESH_CHECK_PORT || 5193);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const inputNames = [
  "traveler.skin.zip",
  "traveler.rig.zip",
  "traveler-top.wardrobe.zip",
  "traveler-bottom.wardrobe.zip",
  "traveler-shoes.wardrobe.zip",
];
const sourcePaths = git("ls-tree", "-r", "--name-only", baseline, "src")
  .toString()
  .trim()
  .split("\n")
  .filter(
    (path) =>
      /^src\/core\/generator(?:-[a-z0-9-]+)?\.ts$/.test(path) ||
      /^src\/core\/.*\.generated\.ts$/.test(path) ||
      [
        "src/core/illustrated-canvas.ts",
        "src/skeletal/renderer.ts",
        "src/skeletal/definition.ts",
        "src/skeletal/builtins.ts",
        "src/skeletal/wardrobe-assets.generated.ts",
        "src/experiments/denim-rig/mesh.ts",
      ].includes(path),
  );
const sourceHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      sourcePaths.map(async (path) => [
        path,
        hash(await readFile(new URL(path, root))),
      ]),
    ),
  );
const inputHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      inputNames.map(async (name) => [
        name,
        hash(await readFile(new URL(name, prepared))),
      ]),
    ),
  );
await mkdir(output, { recursive: true });
const report = {
  format: "gathria-fresh-character-preparation-checks",
  version: 1,
  status: "running",
  phase,
  baseline: git("rev-parse", baseline).toString().trim(),
  scope:
    "Imported source ZIPs and locally rendered shared-rig frames. Actual Studio downloads, independent player and visual review are separate evidence.",
  diagnosticPolicy:
    "Opaque components use eight-neighbor connectivity; one-pixel transparent holes require four opaque cardinal neighbors. Counts are diagnostic only: disconnected accents, intentional gaps and occlusion can be valid. No connectivity count is an aesthetic pass/fail or triggers a pixel edit.",
  protectedSources: {},
  inputs: {},
  cases: [],
  browserErrors: [],
};
let server, browser;
try {
  const initialSources = await sourceHashes();
  for (const path of sourcePaths) {
    const expected = hash(git("show", `${baseline}:${path}`));
    report.protectedSources[path] = expected;
    assert.equal(
      initialSources[path],
      expected,
      `${path} changed from baseline`,
    );
  }
  assert(
    sourcePaths.length >= 20,
    "Missing preserved renderer/source coverage",
  );
  report.inputs = await inputHashes();
  server = await createServer({
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => report.browserErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/player.html`);
  await page.evaluate(async (preparedPath) => {
    const { importSkinPack, importProject, validateSkin } = await import(
      "/src/skeletal/skin-io.ts"
    );
    const { importWardrobeItem } = await import(
      "/src/skeletal/wardrobe-item-io.ts"
    );
    const { decodeWardrobeItemPart } = await import(
      "/src/skeletal/wardrobe-items.ts"
    );
    const { prepareRig } = await import("/src/skeletal/renderer.ts");
    const { createRigDefinition, createMotionLibrary } = await import(
      "/src/skeletal/definition.ts"
    );
    const { assembleWardrobe, defaultWardrobeRecipe } = await import(
      "/src/skeletal/wardrobe.ts"
    );
    const W = 192,
      H = 256,
      actions = ["idle", "walk", "run", "jump"];
    const check = (condition, message) => {
      if (!condition) throw Error(message);
    };
    const equal = (left, right) =>
      left.length === right.length &&
      left.every((value, index) => value === right[index]);
    const canonical = (value) =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
            )
          : value;
    const sameMetadata = (left, right) =>
      JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
    const sha = async (bytes) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    async function load(name) {
      const response = await fetch(`/${preparedPath}${name}`);
      check(response.ok, `Missing prepared file ${name}`);
      return response.blob();
    }
    function geometry(pixels, label) {
      check(pixels.length === W * H * 4, `${label}: invalid dimensions`);
      let visible = 0,
        left = W,
        top = H,
        right = -1,
        bottom = -1;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const alpha = pixels[(y * W + x) * 4 + 3];
          check(alpha === 0 || alpha === 255, `${label}: partial alpha`);
          if (!alpha) continue;
          visible++;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      check(visible > 0 && visible < W * H, `${label}: empty or opaque frame`);
      check(
        left > 0 && top > 0 && right < W - 1 && bottom < H - 1,
        `${label}: artwork reaches frame boundary [${left},${top},${right},${bottom}]`,
      );
      const seen = new Uint8Array(W * H),
        stack = new Int32Array(W * H),
        components = [];
      for (let start = 0; start < W * H; start++) {
        if (seen[start] || !pixels[start * 4 + 3]) continue;
        let count = 0,
          pending = 1;
        stack[0] = start;
        seen[start] = 1;
        while (pending) {
          const current = stack[--pending];
          count++;
          const x = current % W,
            y = Math.floor(current / W);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx,
                ny = y + dy,
                next = ny * W + nx;
              if (
                nx < 0 ||
                nx >= W ||
                ny < 0 ||
                ny >= H ||
                seen[next] ||
                !pixels[next * 4 + 3]
              )
                continue;
              seen[next] = 1;
              stack[pending++] = next;
            }
        }
        components.push(count);
      }
      components.sort((a, b) => b - a);
      let onePixelHoles = 0;
      const holeSamples = [];
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const p = y * W + x;
          if (
            !pixels[p * 4 + 3] &&
            [p - 1, p + 1, p - W, p + W].every(
              (neighbor) => pixels[neighbor * 4 + 3],
            )
          ) {
            onePixelHoles++;
            if (holeSamples.length < 12) holeSamples.push([x, y]);
          }
        }
      return {
        visiblePixels: visible,
        bounds: [left, top, right, bottom],
        opaqueComponents: components.length,
        smallerComponentPixels: components.slice(1).reduce((a, b) => a + b, 0),
        smallerComponentSizes: components.slice(1),
        onePixelHoles,
        holeSamples,
      };
    }
    const skin = await importSkinPack(await load("traveler.skin.zip"));
    const project = await importProject(await load("traveler.rig.zip"));
    check(
      skin.metadata.slots.length === 15,
      "Expected fifteen new source slots",
    );
    check(
      sameMetadata(skin.metadata, project.skin.metadata),
      "Skin and project metadata differ",
    );
    const sourceSlots = {};
    for (const slot of skin.metadata.slots) {
      check(
        equal(skin.images[slot], project.skin.images[slot]),
        `${slot}: skin/project pixels differ`,
      );
      sourceSlots[slot] = {
        ...geometry(skin.images[slot], `source/${slot}`),
        sha256: await sha(skin.images[slot]),
      };
    }
    check(
      sameMetadata(project.rig, createRigDefinition()),
      "New character changes the shared rig definition",
    );
    check(
      sameMetadata(project.motions, createMotionLibrary()),
      "New character changes the shared motion library",
    );
    const items = [];
    const sourceItems = [];
    const sourceCuffOwnership = [];
    for (const group of ["top", "bottom", "shoes"]) {
      const item = await importWardrobeItem(
        await load(`traveler-${group}.wardrobe.zip`),
      );
      check(item.group === group, `Unexpected group in ${group} item`);
      const parts = [];
      for (const part of item.parts) {
        const raw = decodeWardrobeItemPart(part.data),
          rgba = skin.images[part.slot],
          materials = {};
        check(rgba, `Item refers to absent source ${part.slot}`);
        for (let pixel = 0; pixel < W * H; pixel++) {
          const p = pixel * 5,
            target = pixel * 4;
          for (let channel = 0; channel < 4; channel++)
            check(
              raw[p + channel] === rgba[target + channel],
              `${group}/${part.slot}: garment differs from generated skin source`,
            );
          if (raw[p + 3])
            materials[raw[p + 4]] = (materials[raw[p + 4]] || 0) + 1;
        }
        // This regression follows the reviewed traveler source only. These
        // bounded cuff folds are sweater fabric, while the adjacent cream cuff
        // remains fixed and the hand follows skin recoloring. It is not a
        // global RGB ownership rule for imported artwork or the runtime.
        if (
          group === "top" &&
          ["near-forearm", "far-forearm"].includes(part.slot)
        ) {
          const bounds =
            part.slot === "near-forearm"
              ? [57, 150, 74, 156]
              : [126, 155, 139, 159];
          const cuff = {
            slot: part.slot,
            bounds,
            orangeFoldPixels: 0,
            incorrectlyFixedFoldPixels: 0,
            samples: [],
          };
          for (let y = bounds[1]; y <= bounds[3]; y++)
            for (let x = bounds[0]; x <= bounds[2]; x++) {
              const p = (y * W + x) * 5;
              const [red, green, blue, alpha, material] = raw.subarray(
                p,
                p + 5,
              );
              if (
                alpha &&
                red > 130 &&
                green > 40 &&
                red > 1.55 * green &&
                green > 1.3 * blue
              ) {
                cuff.orangeFoldPixels++;
                if (material === 0) cuff.incorrectlyFixedFoldPixels++;
              }
            }
          check(
            cuff.orangeFoldPixels > 0,
            `${part.slot}: reviewed orange cuff fold is missing`,
          );
          check(
            cuff.incorrectlyFixedFoldPixels === 0,
            `${part.slot}: sweater cuff fold is incorrectly fixed-color`,
          );
          if (part.slot === "near-forearm")
            for (const [label, x, y, material] of [
              ["hand skin", 65, 165, 1],
              ["cream cuff", 67, 156, 0],
              ["sweater sleeve fold", 64, 151, 3],
            ]) {
              const p = (y * W + x) * 5;
              check(
                raw[p + 3] === 255 && raw[p + 4] === material,
                `${part.slot}: ${label} at (${x},${y}) must own material ${material}`,
              );
              cuff.samples.push({
                label,
                point: [x, y],
                rgba: [...raw.subarray(p, p + 4)],
                material,
              });
            }
          sourceCuffOwnership.push(cuff);
        }
        parts.push({ slot: part.slot, materialPixels: materials });
      }
      items.push(item);
      sourceItems.push({ id: item.id, group, parts });
    }
    async function renderCase({
      name,
      identity,
      groups,
      palette,
      expressions,
    }) {
      let selected = project;
      if (identity) {
        const recipe = {
          ...defaultWardrobeRecipe(identity),
          version: 2,
          colors: palette,
        };
        for (const group of groups)
          recipe[group] = items.find((item) => item.group === group).id;
        selected = {
          ...project,
          skin: assembleWardrobe(recipe, name, items),
        };
      }
      validateSkin(selected.skin);
      const first = prepareRig(selected.rig, selected.skin, selected.motions),
        second = prepareRig(selected.rig, selected.skin, selected.motions);
      const frames = [];
      for (const expression of expressions)
        for (const action of actions) {
          const clip = selected.motions.clips[action];
          check(clip && clip.keys.length, `Missing ${action}`);
          check(clip.fps > 0 && clip.fps <= 60, `${action}: invalid FPS`);
          check(
            clip.loop === (action !== "jump"),
            `${action}: wrong loop behavior`,
          );
          check(
            clip.sequence.every(
              (key) =>
                Number.isInteger(key) && key >= 0 && key < clip.keys.length,
            ),
            `${action}: invalid sequence`,
          );
          for (let key = 0; key < clip.keys.length; key++) {
            const pixels = first.frame(action, key, expression),
              repeated = second.frame(action, key, expression);
            check(
              equal(pixels, repeated),
              `${name}/${action}/${key}: nondeterminism`,
            );
            frames.push({
              action,
              expression,
              key,
              ...geometry(pixels, `${name}/${expression}/${action}/${key}`),
              sha256: await sha(pixels),
            });
          }
        }
      return {
        name,
        identity: identity || "generated-traveler",
        groups: groups || ["full-generated-skin"],
        palette: palette || "authored-source-pixels",
        expressions,
        frameCount: frames.length,
        independentRendererComparison: true,
        binaryAlphaAndTransparentBoundary: true,
        frames,
      };
    }
    globalThis.freshPreparationChecks = {
      sourceSlots,
      sourceItems,
      sourceCuffOwnership,
      renderCase,
      motions: Object.fromEntries(
        actions.map((action) => {
          const clip = project.motions.clips[action];
          return [
            action,
            {
              keys: clip.keys.length,
              sequence: clip.sequence,
              fps: clip.fps,
              loop: clip.loop,
            },
          ];
        }),
      ),
    };
  }, preparedPath);
  Object.assign(
    report,
    await page.evaluate(() => {
      const { sourceSlots, sourceItems, sourceCuffOwnership, motions } =
        globalThis.freshPreparationChecks;
      return { sourceSlots, sourceItems, sourceCuffOwnership, motions };
    }),
  );
  const expressions = ["neutral", "gentle", "joyful"];
  const palettes = {
    warm: {
      skin: "#edbb96",
      top: "#b88b5c",
      bottom: "#414856",
      shoes: "#665043",
    },
    deepSage: {
      skin: "#835342",
      top: "#7e9f92",
      bottom: "#2f4858",
      shoes: "#754b39",
    },
  };
  const cases = [{ name: "generated-traveler", expressions }];
  for (const identity of ["crop", "waves"]) {
    for (const [paletteName, palette] of Object.entries(palettes))
      cases.push({
        name: `${identity}-all-generated-${paletteName}`,
        identity,
        groups: ["top", "bottom", "shoes"],
        palette,
        expressions,
      });
    for (const group of ["top", "bottom", "shoes"])
      cases.push({
        name: `${identity}-generated-${group}-with-builtins`,
        identity,
        groups: [group],
        palette: palettes.warm,
        expressions: ["gentle"],
      });
  }
  for (const testCase of cases) {
    const checked = await page.evaluate(
      (testCase) => globalThis.freshPreparationChecks.renderCase(testCase),
      testCase,
    );
    report.cases.push(checked);
    console.log(
      `${checked.name}: ${checked.frameCount} unique frames checked twice`,
    );
  }
  assert.deepEqual(
    await inputHashes(),
    report.inputs,
    "Prepared inputs changed during checks",
  );
  assert.deepEqual(
    await sourceHashes(),
    initialSources,
    "Protected runtime changed during checks",
  );
  assert.deepEqual(report.browserErrors, [], "Browser script errors");
  report.uniqueFrames = report.cases.reduce(
    (sum, item) => sum + item.frameCount,
    0,
  );
  report.renderInvocations = report.uniqueFrames * 2;
  report.status = "passed";
  console.log(
    `PASS: ${report.uniqueFrames} unique frames, ${report.renderInvocations} render invocations, ${sourcePaths.length} preserved source files. Connectivity findings remain visual-review diagnostics.`,
  );
} catch (error) {
  report.status = "failed";
  report.failure = error.stack || String(error);
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  await browser?.close();
  await server?.close();
  await writeFile(
    new URL("preparation-checks.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
}
