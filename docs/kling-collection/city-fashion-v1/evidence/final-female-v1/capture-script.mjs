// Configured capture provenance: {"engine":"scripts/capture-kling-warm-date-collection.mjs","engineSha256":"71aa9db4f7dc04b81d06c11f20bff364a2d30afd0b6fb4096093c3bc349ccc10","launcherSha256":"c2d1e151b49fde5fbc33c2bd23e98ea04cac1eb0aaa01df2b8e39d61ad48a59d","configurationSha256":"7492a5e2fd1b7ec1c905d81391cb233df3787f3249051d31e07a8b30ea0a07bb"}
// Six styled looks exported through the production UI, reopened, then played
// in isolated consumer contexts. No fixture assets and no duplicate retained ZIPs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, expect } from "file:///workspace/gathria-character/node_modules/@playwright/test/index.mjs";
import { unzipSync } from "file:///workspace/gathria-character/node_modules/fflate/esm/index.mjs";
import { parseGIF, decompressFrames } from "file:///workspace/gathria-character/node_modules/gifuct-js/lib/index.js";
import { preview } from "file:///workspace/gathria-character/node_modules/vite/dist/node/index.js";

const { values: args } = parseArgs({
  options: {
    plan: { type: "boolean", default: false },
    run: { type: "string", default: "final-v1" },
    port: { type: "string", default: "5240" },
    origin: { type: "string" },
    character: { type: "string" },
    look: { type: "string" },
    "retain-projects": { type: "boolean", default: false },
  },
});
const root = "/workspace/gathria-character/";
assert(/^[a-z0-9][a-z0-9-]{0,63}$/.test(args.run));
assert(!args.character || ["male", "female"].includes(args.character));
const definitionsPath = join(
  root,
  "artwork/kling-collection/source/city-fashion-v1/looks.json",
);
const definitionsBytes = await readFile(definitionsPath);
const definitions = JSON.parse(definitionsBytes).filter(
  (d) =>
    (!args.character || d.character === args.character) &&
    (!args.look || d.id === args.look),
);
assert(definitions.length > 0 && definitions.length <= 6);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const output = join(
  root,
  "docs/kling-collection/city-fashion-v1/evidence",
  args.run,
);
const temporary = join("/tmp/gathria-city-fashion-collection", args.run);
const port = Number(args.port);
assert(Number.isSafeInteger(port) && port > 1024 && port < 65536);
const origin = args.origin || `http://127.0.0.1:${port}`;
assert(
  /^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/.test(origin),
  "Use an explicit local production preview origin.",
);
const plan = {
  looks: definitions,
  actions,
  facings: ["right", "left"],
  retained: {
    packs: definitions.length,
    pngs: definitions.length * 6,
    mixPngs: definitions.length,
    gifs: definitions.length * 3,
    screenshots: definitions.length * 2,
    projects: args["retain-projects"] ? definitions.length : 0,
  },
  temporary:
    "One saved wardrobe ZIP at a time; reopened and deleted unless --retain-projects is requested.",
  expectedStorageMiB: {
    sixPacksAndPngs: "280–340",
    actualGifs: "10–50",
    temporaryPeak: "80–140",
    sixGarmentBanksAdditional: "30–60",
  },
  server: {
    kind: "vite-production-preview",
    origin,
    externallyStarted: Boolean(args.origin),
  },
  output,
};
if (args.plan) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
assert(!existsSync(output), `Preserve existing evidence: ${output}`);
assert(!existsSync(temporary), `Use a fresh temporary run: ${temporary}`);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const member = (bytes, name) => {
  const files = unzipSync(new Uint8Array(bytes), {
    filter: (f) => f.name === name,
  });
  assert(files[name], `Missing ZIP member ${name}`);
  return files[name];
};
const catalogPath = join(root, "docs/kling-wardrobe/catalog.json");
const catalogBytes = await readFile(catalogPath);
const catalog = json(catalogBytes);
const expectedAssets = new Map([
  [
    "/docs/kling-wardrobe/catalog.json",
    { bytes: catalogBytes.length, sha256: sha(catalogBytes) },
  ],
]);
const entries = new Map();
for (const character of new Set(definitions.map((d) => d.character))) {
  const entry = catalog.characters.find((e) => e.key === character);
  assert(entry);
  const looks = definitions.filter((d) => d.character === character);
  const assetUrls = new Set([entry.sourceUrl, entry.registrationUrl]);
  for (const look of looks) {
    const preset = entry.presets.find((p) => p.id === look.id);
    assert(preset, `Publish ${look.id} before capture.`);
    assert.equal(preset.name, look.name);
    assert.deepEqual(preset.selection, look.selection);
    for (const id of Object.values(look.selection).filter(Boolean)) {
      const item = entry.items.find((i) => i.id === id);
      assert(item);
      assetUrls.add(item.url);
    }
    const alternate =
      look.id === "city-ink" ? "navy-shorts" :
      look.character === "male"
        ? look.selection.bottom === "navy-suit-trousers-v1"
          ? "ochre-chinos-v1"
          : "navy-suit-trousers-v1"
        : "brown-shoes";
    assetUrls.add(entry.items.find((item) => item.id === alternate).url);
    const library = entry.appearanceLibraries.find((b) =>
      b.styles.some((s) => s.slot === "hair" && s.id === look.hair),
    );
    assetUrls.add(library ? library.url : entry.appearanceBankUrl);
  }
  for (const url of assetUrls) {
    const bytes = await readFile(join(root, url.slice(1)));
    const item = entry.items.find((i) => i.url === url);
    const bank = entry.appearanceLibraries.find((b) => b.url === url);
    if (item || bank) assert.equal(sha(bytes), (item || bank).sha256);
    expectedAssets.set(url, { bytes: bytes.length, sha256: sha(bytes) });
  }
  const source = json(
    member(
      await readFile(join(root, entry.sourceUrl.slice(1))),
      "manifest.json",
    ),
  );
  entries.set(character, { entry, source });
}
// Production emits hashed /assets URLs. Bind each to its exact logical input
// bytes before opening a browser, so stale builds fail without writing evidence.
const builtFiles = await readdir(join(root, "dist/assets"));
const productionAssets = new Map();
for (const [logicalUrl, expected] of expectedAssets) {
  const name = basename(logicalUrl),
    extension = extname(name);
  const stem = name.slice(0, -extension.length),
    matches = [];
  for (const file of builtFiles.filter(
    (f) => f.startsWith(stem + "-") && f.endsWith(extension),
  )) {
    const path = join(root, "dist/assets", file);
    if (
      (await stat(path)).size === expected.bytes &&
      sha(await readFile(path)) === expected.sha256
    )
      matches.push("/assets/" + file);
  }
  assert(
    matches.length > 0,
    `Build the current asset before capture: ${logicalUrl}`,
  );
  for (const path of matches) {
    const prior = productionAssets.get(path);
    productionAssets.set(path, {
      ...expected,
      logicalUrls: [...(prior?.logicalUrls || []), logicalUrl],
    });
  }
}
const compiledJsSha256 = {};
for (const file of builtFiles)
  if (file.endsWith(".js"))
    compiledJsSha256[`/assets/${file}`] = sha(
      await readFile(join(root, "dist/assets", file)),
    );
assert(Object.keys(compiledJsSha256).length > 0);
const productionHtmlSha256 = Object.fromEntries(
  await Promise.all(
    ["/workbench.html", "/player.html"].map(async (url) => [
      url,
      sha(await readFile(join(root, "dist", url.slice(1)))),
    ]),
  ),
);
const verifierPython =
  process.env.KLING_PYTHON || "/tmp/kling-polish-venv/bin/python";
assert(
  existsSync(verifierPython),
  "Set KLING_PYTHON to the prepared NumPy/Pillow interpreter.",
);
assert(
  existsSync(join(root, "scripts/verify-kling-city-fashion.py")),
  "Prepare the independent composition verifier before capture.",
);
await mkdir(output, { recursive: true });
await mkdir(temporary, { recursive: true });
const scriptBytes = await readFile(fileURLToPath(import.meta.url));
await writeFile(join(output, "capture-script.mjs"), scriptBytes, { flag: "wx" });
await writeFile(join(output, "looks.json"), definitionsBytes, { flag: "wx" });
const report = {
  format: "gathria-city-fashion-collection-workflow",
  version: 1,
  run: args.run,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  worktreeStatusAtCapture: execFileSync("git", ["status", "--short"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  server: plan.server,
  production: true,
  plan,
  scope:
    "Actual production UI PNG, wardrobe and CharacterPack downloads. Styled projects reopen exactly. Independent player checks five actions in both directions. Technical checks do not constitute visual acceptance.",
  catalogSha256: sha(catalogBytes),
  definitionsSha256: sha(definitionsBytes),
  scriptSha256: sha(scriptBytes),
  scriptSnapshot: rel(join(output, "capture-script.mjs")),
  definitionsSnapshot: rel(join(output, "looks.json")),
  compiledJsSha256,
  productionHtmlSha256,
  productionAssets: Object.fromEntries(productionAssets),
  expectedAssets: Object.fromEntries(expectedAssets),
  assetResponses: [],
  scriptResponses: [],
  htmlResponses: [],
  downloads: [],
  gifs: [],
  screenshots: [],
  reopened: [],
  packs: [],
  playback: [],
  compositionAudits: [],
  mixes: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  externalRequests: [],
  independentEditorRequests: [],
  retainedBytes: 0,
  passed: false,
};
const persist = () =>
  writeFile(
    join(output, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
const panel = (page) => page.locator("#wardrobe-panel");
const button = (page, name) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
const canvas = (page) => panel(page).getByTestId("wardrobe-preview");
const title = (value) => value[0].toUpperCase() + value.slice(1);
const forbiddenEditorModule =
  /\/src\/(?:wardrobe|appearance|skeletal)\/|WardrobeEditor|SpriteActionEditor|action-gif|\/assets\/workbench-[^/]+\.js/;
let server, browser, activePage;
async function diskCheck(additionalBytes = 0) {
  const disk = await statfs(output);
  assert(
    disk.bavail * disk.bsize >= 128 * 1024 ** 2 + additionalBytes,
    "Insufficient disk reserve for the next actual download.",
  );
}
async function watchedContext(independent = false) {
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (independent && forbiddenEditorModule.test(request.url())) {
      report.independentEditorRequests.push(request.url());
      await route.abort();
      return;
    }
    const expected = productionAssets.get(url.pathname);
    const compiled =
      request.resourceType() === "script"
        ? compiledJsSha256[url.pathname]
        : null;
    const html = productionHtmlSha256[url.pathname];
    assert(
      request.resourceType() !== "script" || compiled,
      `Unpinned production JavaScript: ${request.url()}`,
    );
    if (!expected && !compiled && !html) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const bytes = await response.body();
    assert.equal(response.status(), 200, request.url());
    if (compiled) {
      assert.equal(
        sha(bytes),
        compiled,
        `Production JavaScript differs: ${url.pathname}`,
      );
      report.scriptResponses.push({
        url: request.url(),
        sha256: compiled,
        independent,
      });
    } else if (html) {
      assert.equal(
        sha(bytes),
        html,
        `Production HTML differs: ${url.pathname}`,
      );
      report.htmlResponses.push({
        url: request.url(),
        sha256: html,
        independent,
      });
    } else {
      assert.deepEqual(
        { bytes: bytes.length, sha256: sha(bytes) },
        { bytes: expected.bytes, sha256: expected.sha256 },
        `Browser asset differs: ${url.pathname}`,
      );
      report.assetResponses.push({ url: request.url(), ...expected });
    }
    await route.fulfill({ response, body: bytes });
    await response.dispose();
  });
  context.on("page", (page) => {
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.location().url.endsWith("/favicon.ico"))
        report.consoleErrors.push({ text: m.text(), location: m.location() });
    });
    page.on("request", (r) => {
      if (/^https?:/.test(r.url()) && !r.url().startsWith(origin + "/"))
        report.externalRequests.push(r.url());
      if (r.resourceType() === "script")
        assert(
          !r.url().includes("/src/"),
          "Development module in production capture.",
        );
    });
    page.on("response", (r) => {
      if (r.status() >= 400 && !r.url().endsWith("/favicon.ico"))
        report.failedRequests.push({ url: r.url(), status: r.status() });
    });
  });
  return { context };
}
async function ready(page, text) {
  await page.waitForFunction(
    (expected) => {
      const p = document.querySelector("#wardrobe-panel");
      return (
        p?.querySelector('[role="alert"]') ||
        (p?.querySelector('[role="status"]')?.textContent.includes(expected) &&
          !p.querySelector('[aria-busy="true"]'))
      );
    },
    text,
    { timeout: 240000 },
  );
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
  await expect(panel(page).getByRole("status")).toContainText(text);
}
async function pause(page, independent = false) {
  const control = button(
    page,
    independent ? "Pause animation" : "Pause wardrobe animation",
  );
  if (await control.count()) await control.click();
}
async function pose(page, source, frameId, facing = "right") {
  await pause(page);
  const action = actions.find((a) =>
    source.animations[a].frames.includes(frameId),
  );
  assert(action, `Unknown source pose ${frameId}`);
  const position = source.animations[action].frames.indexOf(frameId);
  for (const [label, value] of [
    ["Wardrobe action", action],
    ["Wardrobe facing", facing],
  ])
    await panel(page).getByLabel(label, { exact: true }).selectOption(value);
  await panel(page)
    .getByLabel("Wardrobe frame", { exact: true })
    .fill(String(position));
  await expect(canvas(page)).toHaveAttribute("data-rendered-action", action);
  await expect(canvas(page)).toHaveAttribute(
    "data-rendered-frame-id",
    String(frameId),
  );
  await expect(canvas(page)).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
  return { action, position, frameId, facing };
}
async function imageHash(locator) {
  return locator.evaluate(async (c) => {
    const pixels = c
      .getContext("2d")
      .getImageData(0, 0, c.width, c.height).data;
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", pixels),
    );
    return {
      width: c.width,
      height: c.height,
      rgbaSha256: Array.from(digest, (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    };
  });
}
async function appearance(page, label, value) {
  const control = panel(page).getByLabel(label, { exact: true });
  if ((await control.inputValue()) === value) return;
  await control.selectOption(value);
  await ready(page, "Appearance updated");
  await expect(control).toHaveValue(value);
}
async function download(page, label, filename, kind) {
  const retained = kind !== "project" || args["retain-projects"];
  const path = join(retained ? output : temporary, filename);
  assert(!existsSync(path), `Preserve ${path}`);
  await diskCheck(kind.endsWith("png") ? 2 * 1024 ** 2 : 160 * 1024 ** 2);
  const pending = page.waitForEvent("download", { timeout: 300000 });
  await panel(page)
    .getByRole("button", { name: label, exact: typeof label === "string" })
    .click();
  const actual = await pending;
  await actual.saveAs(path);
  assert.equal(await actual.failure(), null);
  await actual.delete();
  const bytes = await readFile(path);
  const row = {
    file: retained ? rel(path) : path,
    retainedInRepository: retained,
    kind,
    bytes: bytes.length,
    sha256: sha(bytes),
  };
  report.downloads.push(row);
  if (retained) report.retainedBytes += bytes.length;
  console.log(`Downloaded ${filename}: ${bytes.length} bytes`);
  return { path, bytes, row };
}
async function png(
  page,
  look,
  source,
  frameId,
  facing = "right",
  variant = "styled",
) {
  const selected = await pose(page, source, frameId, facing);
  const expected = await imageHash(canvas(page));
  const downloaded = await download(
    page,
    "Save current PNG",
    `${look.character}-${look.id}${variant === "mix" ? "-mix" : ""}-${frameId}-${facing}.png`,
    variant === "mix" ? "mix-png" : "png",
  );
  const decoded = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", pixels),
    );
    return {
      width: c.width,
      height: c.height,
      rgbaSha256: Array.from(digest, (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    };
  }, downloaded.bytes.toString("base64"));
  assert.deepEqual(
    decoded,
    expected,
    "Downloaded PNG must reproduce the actual displayed frame.",
  );
  Object.assign(downloaded.row, selected, {
    look: look.id,
    character: look.character,
    decoded,
    variant,
  });
  return downloaded.row;
}
async function mixAndRestore(page, look, source, frameId) {
  await pose(page, source, frameId);
  const original = await imageHash(canvas(page));
  const slot = look.character === "male" || look.id === "city-ink" ? "bottom" : "shoes";
  const label = look.character === "male" || look.id === "city-ink" ? "Bottom" : "Shoes";
  const from = look.selection[slot] || "";
  const to =
    look.id === "city-ink" ? "navy-shorts" :
    look.character === "male"
      ? from === "navy-suit-trousers-v1"
        ? "ochre-chinos-v1"
        : "navy-suit-trousers-v1"
      : from
        ? ""
        : "brown-shoes";
  const control = panel(page).getByLabel(label, { exact: true });
  await control.selectOption(to);
  await ready(page, "Outfit updated.");
  await expect(control).toHaveValue(to);
  const downloaded = await png(page, look, source, frameId, "right", "mix");
  assert.notDeepEqual(
    downloaded.decoded,
    original,
    "Alternative piece should change the actual rendered frame.",
  );
  downloaded.selection = { ...look.selection, [slot]: to || null };
  await control.selectOption(from);
  await ready(page, "Outfit updated.");
  await expect(control).toHaveValue(from);
  await pose(page, source, frameId);
  assert.deepEqual(
    await imageHash(canvas(page)),
    original,
    "Restoring the selected piece must restore exact RGBA.",
  );
  for (const [name, value] of [
    ["Hairstyle", look.hair],
    ["Hair color", look.color],
    ["Face", look.face],
  ])
    await expect(panel(page).getByLabel(name, { exact: true })).toHaveValue(
      value ?? "",
    );
  report.mixes.push({
    character: look.character,
    look: look.id,
    slot,
    from: from || null,
    to: to || null,
    frameId,
    facing: "right",
    png: downloaded.file,
    pngSha256: downloaded.sha256,
    original,
    exactRgbaAfterRestore: true,
    appearancePreserved: true,
  });
}
async function screenshot(page, filename) {
  const path = join(output, filename);
  assert(!existsSync(path));
  await page.screenshot({ path, fullPage: true });
  const bytes = await readFile(path);
  report.screenshots.push({
    file: rel(path),
    bytes: bytes.length,
    sha256: sha(bytes),
  });
  report.retainedBytes += bytes.length;
}
async function gifs(page, look, source) {
  for (const [action, facing] of [
    ["run", "right"],
    ["run", "left"],
    ["jump", "right"],
  ]) {
    const clip = source.animations[action];
    await pose(page, source, clip.frames[0], facing);
    const before = await imageHash(canvas(page));
    const downloaded = await download(
      page,
      "Download action GIF",
      `${look.character}-${look.id}-${action}-${facing}.gif`,
      "gif",
    );
    await ready(page, "Action GIF saved");
    const parsed = parseGIF(new Uint8Array(downloaded.bytes).buffer);
    const frames = decompressFrames(parsed, true);
    assert.equal(frames.length, clip.frames.length);
    const delaysMs = clip.frames.map(
      (_, i) =>
        (Math.round(((i + 1) * 100) / clip.fps) -
          Math.round((i * 100) / clip.fps)) *
        10,
    );
    assert.deepEqual(
      frames.map((f) => f.delay),
      delaysMs,
    );
    assert.equal(
      parsed.frames.some((f) => f.application?.id === "NETSCAPE2.0"),
      clip.loop,
    );
    assert.equal(parsed.lsd.width, Math.ceil(before.width / 2));
    assert.equal(parsed.lsd.height, Math.ceil(before.height / 2));
    assert.deepEqual(await imageHash(canvas(page)), before);
    const row = {
      ...downloaded.row,
      character: look.character,
      look: look.id,
      action,
      facing,
      appearance: {
        hairId: look.hair,
        faceId: look.face,
        hairColor: look.color,
      },
      sourceSchedule: clip,
      width: parsed.lsd.width,
      height: parsed.lsd.height,
      frames: frames.length,
      delaysMs,
      loop: clip.loop,
      matteAndHalfSize: true,
    };
    Object.assign(downloaded.row, row);
    report.gifs.push(row);
  }
}
async function playback(pack) {
  const { context } = await watchedContext(true);
  const page = await context.newPage();
  activePage = page;
  await page.goto(origin + "/player.html");
  await page.locator("#player-zip").setInputFiles(join(root, pack.file));
  await expect(page.getByRole("status")).toContainText("Loaded:", {
    timeout: 240000,
  });
  await expect(page.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-motion-flow",
    "true",
  );
  for (const action of actions)
    for (const facing of ["right", "left"]) {
      await pause(page, true);
      await button(page, title(action)).click();
      await button(page, title(facing)).click();
      await page
        .getByLabel("Playback speed", { exact: true })
        .selectOption("1");
      await page
        .getByLabel("Display scale", { exact: true })
        .selectOption("0.5");
      await page.locator("#player-frame").fill("0");
      const clip = pack.manifest.animations[action];
      const durationMs = Math.ceil(
        ((1000 * clip.frames.length) / clip.fps) * (clip.loop ? 2.2 : 1) + 350,
      );
      const observed = await page.evaluate(async (duration) => {
        const c = document.querySelector('[data-testid="consumer-canvas"]'),
          observations = [];
        const started = performance.now();
        let previous = "";
        const sample = () => {
          const key = c.dataset.action + "/" + c.dataset.framePosition;
          if (key !== previous)
            observations.push({
              action: c.dataset.action,
              position: Number(c.dataset.framePosition),
              frameId: Number(c.dataset.frameId),
              atMs: performance.now() - started,
            });
          previous = key;
        };
        const observer = new MutationObserver(sample);
        observer.observe(c, { attributes: true });
        sample();
        document.querySelector('[aria-label="Play animation"]').click();
        await new Promise((resolve) => setTimeout(resolve, duration));
        sample();
        observer.disconnect();
        document.querySelector('[aria-label="Pause animation"]')?.click();
        return observations;
      }, durationMs);
      for (const o of observed)
        assert.equal(
          o.frameId,
          pack.manifest.animations[o.action]?.frames[o.position],
        );
      const selected = observed.filter((o) => o.action === action);
      assert(
        new Set(selected.map((o) => o.position)).size >=
          Math.min(3, clip.frames.length),
      );
      const wraps = selected.filter(
        (o, i) => i && o.position < selected[i - 1].position,
      ).length;
      if (clip.loop) assert(wraps > 0, `${pack.look}/${action} did not loop`);
      else
        assert(
          observed.some((o) => o.action === "idle"),
          `${pack.look}/${action} did not return to idle`,
        );
      report.playback.push({
        character: pack.character,
        look: pack.look,
        action,
        facing,
        durationMs,
        wraps,
        observed,
        missingPositions: clip.frames
          .map((_, i) => i)
          .filter((i) => !selected.some((o) => o.position === i)),
      });
    }
  await screenshot(
    page,
    `${pack.character}-${pack.look}-independent-player.png`,
  );
  await context.close();
  await persist();
}
try {
  await diskCheck(160 * 1024 ** 2);
  if (!args.origin)
    server = await preview({
      root,
      preview: { host: "127.0.0.1", port, strictPort: true },
    });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  for (const look of definitions) {
    const { entry, source } = entries.get(look.character);
    const { context } = await watchedContext();
    const page = await context.newPage();
    activePage = page;
    await page.goto(
      `${origin}/workbench.html?character=${look.character}&mode=wardrobe`,
    );
    await ready(page, "Original outfit.");
    await pause(page);
    await panel(page)
      .getByLabel("Find an outfit", { exact: true })
      .fill(look.name);
    await button(page, look.name).click();
    await ready(page, look.name + " selected");
    // Clothes-only presets keep the original appearance until explicit styling.
    await expect(
      panel(page).getByLabel("Hairstyle", { exact: true }),
    ).toHaveValue("");
    await expect(panel(page).getByLabel("Face", { exact: true })).toHaveValue(
      "",
    );
    await appearance(page, "Hairstyle", look.hair);
    await appearance(page, "Hair color", look.color);
    await appearance(page, "Face", look.face ?? "");
    const representatives = Object.fromEntries(
      actions.map((action) => {
        const ids = source.animations[action].frames;
        const preferred = {
          idle: 0,
          walk: 35,
          run: 55,
          jump: 86,
          celebrate: 78,
        }[action];
        return [
          action,
          ids.includes(preferred) ? preferred : ids[Math.floor(ids.length / 2)],
        ];
      }),
    );
    await mixAndRestore(page, look, source, representatives.run);
    for (const frameId of Object.values(representatives))
      await png(page, look, source, frameId);
    await png(page, look, source, representatives.run, "left");
    await gifs(page, look, source);
    await pose(page, source, representatives.run, "left");
    const before = await imageHash(canvas(page));
    const project = await download(
      page,
      /Save wardrobe/,
      `${look.character}-${look.id}.wardrobe.zip`,
      "project",
    );
    const doc = json(member(project.bytes, "document.json"));
    assert.deepEqual(doc.selection, look.selection);
    assert.deepEqual(
      {
        hairId: doc.appearance.hairId,
        faceId: doc.appearance.faceId,
        hairColor: doc.appearance.hairColor,
      },
      { hairId: look.hair, faceId: look.face, hairColor: look.color },
    );
    const library = entry.appearanceLibraries.find((b) =>
      b.styles.some((s) => s.slot === "hair" && s.id === look.hair),
    );
    assert.equal(
      doc.appearance.bankSha256,
      library?.sha256 || entry.appearanceRevision.bankSha256,
    );
    assert.deepEqual(doc.preview, { action: "run", facing: "left" });
    assert.equal(
      sha(member(project.bytes, "source.character.zip")),
      expectedAssets.get(entry.sourceUrl).sha256,
    );
    await panel(page)
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(project.path);
    await ready(page, "Saved outfit and action settings restored");
    await expect(
      panel(page).getByLabel("Wardrobe action", { exact: true }),
    ).toHaveValue("run");
    await expect(
      panel(page).getByLabel("Wardrobe facing", { exact: true }),
    ).toHaveValue("left");
    await pose(page, source, representatives.run, "left");
    assert.deepEqual(await imageHash(canvas(page)), before);
    report.reopened.push({
      character: look.character,
      look: look.id,
      project: project.row.file,
      retainedInRepository: project.row.retainedInRepository,
      sha256: project.row.sha256,
      exactRgbaAfterReopen: true,
      rgba: before,
      selection: doc.selection,
      appearance: doc.appearance,
      preview: doc.preview,
    });
    const pack = await download(
      page,
      "Export CharacterPack",
      `${look.character}-${look.id}.character.zip`,
      "pack",
    );
    const manifest = json(member(pack.bytes, "manifest.json"));
    assert.deepEqual(manifest.animations, source.animations);
    assert.deepEqual(
      manifest.frames.map((f) => f.id),
      source.frames.map((f) => f.id),
    );
    assert.equal(manifest.spritesheet.frameWidth, 768);
    assert.equal(manifest.spritesheet.frameHeight, 1184);
    assert.deepEqual(manifest.anchor, {
      ...source.anchor,
      x: source.anchor.x + 32,
      y: source.anchor.y + 128,
    });
    report.packs.push({
      character: look.character,
      look: look.id,
      name: look.name,
      file: pack.row.file,
      bytes: pack.row.bytes,
      sha256: pack.row.sha256,
      projectSha256: project.row.sha256,
      manifest,
      selection: doc.selection,
      appearance: doc.appearance,
      representatives,
    });
    const auditPath = join(
      output,
      `${look.character}-${look.id}-composition-audit.json`,
    );
    execFileSync(
      verifierPython,
      [
        join(root, "scripts/verify-kling-city-fashion.py"),
        "--project",
        project.path,
        "--pack",
        pack.path,
        "--look",
        look.id,
        "--output",
        auditPath,
      ],
      { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
    );
    const auditBytes = await readFile(auditPath);
    const audit = {
      character: look.character,
      look: look.id,
      file: rel(auditPath),
      sha256: sha(auditBytes),
      bytes: auditBytes.length,
      projectSha256: project.row.sha256,
      packSha256: pack.row.sha256,
    };
    report.compositionAudits.push(audit);
    report.packs.at(-1).compositionAudit = audit;
    report.retainedBytes += auditBytes.length;
    await pose(page, source, representatives.idle);
    await screenshot(page, `${look.character}-${look.id}-workbench.png`);
    await context.close();
    if (!args["retain-projects"]) {
      await rm(project.path);
      project.row.deletedAfterExactReopen = true;
    }
    await persist();
  }
  report.editorsClosedAt = new Date().toISOString();
  await persist();
  for (const pack of report.packs) await playback(pack);
  for (const [url, expected] of expectedAssets) {
    assert.equal(
      sha(await readFile(join(root, url.slice(1)))),
      expected.sha256,
      `Input changed: ${url}`,
    );
    assert(
      report.assetResponses.some((r) => r.logicalUrls.includes(url)),
      `No actual browser response for ${url}`,
    );
  }
  for (const [url, expected] of Object.entries(compiledJsSha256))
    assert.equal(
      sha(await readFile(join(root, "dist", url.slice(1)))),
      expected,
    );
  for (const [url, expected] of Object.entries(productionHtmlSha256))
    assert.equal(
      sha(await readFile(join(root, "dist", url.slice(1)))),
      expected,
    );
  for (const field of [
    "errors",
    "consoleErrors",
    "failedRequests",
    "externalRequests",
    "independentEditorRequests",
  ])
    assert.deepEqual(report[field], [], field);
  assert(report.scriptResponses.some((r) => r.independent));
  assert(report.scriptResponses.some((r) => !r.independent));
  assert.equal(report.packs.length, definitions.length);
  assert.equal(report.playback.length, definitions.length * 10);
  assert.equal(report.reopened.length, definitions.length);
  assert.equal(report.compositionAudits.length, definitions.length);
  assert.equal(report.gifs.length, definitions.length * 3);
  assert.equal(report.mixes.length, definitions.length);
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack || error);
  if (activePage && !activePage.isClosed()) {
    report.alerts = await activePage
      .getByRole("alert")
      .allTextContents()
      .catch(() => []);
    await activePage
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  }
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await persist();
  await browser?.close();
  if (server)
    await new Promise((resolve, reject) =>
      server.httpServer.close((e) => (e ? reject(e) : resolve())),
    );
}
console.log(
  JSON.stringify(
    {
      passed: report.passed,
      packs: report.packs.length,
      playback: report.playback.length,
      pngs: report.downloads.filter((d) => d.kind === "png").length,
      retainedMiB: report.retainedBytes / 1024 ** 2,
      report: rel(join(output, "evidence-index.json")),
    },
    null,
    2,
  ),
);
