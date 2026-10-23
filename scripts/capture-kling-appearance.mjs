// Actual wardrobe UI downloads, followed by playback after the editor is closed.
// No synthetic artwork, generated illustrations, or screenshots relabelled PNGs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";
import { unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const quick = process.argv.includes("--quick");
const run = process.env.APPEARANCE_RUN || (quick ? "quick" : "final");
assert(/^[a-z0-9-]+$/.test(run));
const output = join(root, "docs/kling-appearance/review/evidence", run);
await mkdir(join(output, "exports"), { recursive: true });
await mkdir(join(output, "png"), { recursive: true });
assert(
  !existsSync(join(output, "evidence-index.json")),
  "Use a new APPEARANCE_RUN; previous evidence is retained.",
);
const production = process.env.APPEARANCE_PRODUCTION === "1";
const port = Number(process.env.APPEARANCE_PORT || 5176);
const catalog = JSON.parse(
  await readFile(join(root, "docs/kling-wardrobe/catalog.json"), "utf8"),
);
const characters = process.env.APPEARANCE_CHARACTER
  ? [process.env.APPEARANCE_CHARACTER]
  : ["male", "female"];
const styles = ["soft-crop", "soft-bob"];
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const quickFrames = process.env.APPEARANCE_QUICK_FRAMES
  ? process.env.APPEARANCE_QUICK_FRAMES.split(",").map(Number)
  : [0, 24, 51, 58, 64, 67, 75, 83, 89, 95, 104, 112];
assert(quickFrames.length > 0 && quickFrames.every(Number.isInteger));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const json = (b) => JSON.parse(Buffer.from(b).toString("utf8"));
const button = (p, name) => p.getByRole("button", { name, exact: true });
const editor = (p) => p.locator("#wardrobe-panel");
const nativeCanvas = (p) => editor(p).getByTestId("wardrobe-preview");
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);
const report = {
  format: "gathria-kling-appearance-browser-evidence",
  version: 1,
  quick,
  production,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "Real catalog assets selected and downloaded through the existing wardrobe controls. Original pixels, facial source expressions and action timing are separately checked. Functional success is not user visual approval.",
  inputHashes: {},
  downloads: [],
  screenshots: [],
  selections: [],
  projects: [],
  packs: [],
  playback: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  externalRequests: [],
  forbiddenIndependentRequests: [],
};
for (const path of [
  "docs/kling-wardrobe/catalog.json",
  ...characters.flatMap((c) => [
    `docs/kling-motion/exports/${c}.character.zip`,
    `docs/kling-appearance/banks/${c}.zip`,
    c === "male"
      ? "docs/kling-wardrobe/registration/male-full-outfits-v1.json"
      : "docs/kling-wardrobe/registration/female.json",
  ]),
])
  report.inputHashes[path] = sha(await readFile(join(root, path)));
const server = production
  ? await preview({
      root,
      preview: { host: "127.0.0.1", port, strictPort: true },
    })
  : await createServer({
      root,
      server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
    });
if (!production) await server.listen();
const origin = `http://127.0.0.1:${port}`;
let browser, activePage;
const persist = () =>
  writeFile(
    join(output, "evidence-index.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
function watch(context, independent = false) {
  context.on("page", (page) => {
    page.on("pageerror", (e) => report.errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error")
        report.consoleErrors.push({ text: m.text(), location: m.location() });
    });
  });
  context.on("request", (r) => {
    const url = r.url();
    if (/^https?:/.test(url) && !url.startsWith(origin))
      report.externalRequests.push(url);
    if (
      independent &&
      /\/src\/(?:wardrobe|appearance|skeletal)\/|WardrobeEditor|SpriteActionEditor/.test(
        url,
      )
    )
      report.forbiddenIndependentRequests.push(url);
  });
  context.on("response", (r) => {
    if (r.status() >= 400)
      report.failedRequests.push({ url: r.url(), status: r.status() });
  });
}
async function ready(page, text) {
  await page.waitForFunction(
    (expected) => {
      const panel = document.querySelector("#wardrobe-panel");
      return (
        panel?.querySelector('[role="alert"]') ||
        (panel
          ?.querySelector('[role="status"]')
          ?.textContent.includes(expected) &&
          !panel.querySelector('[aria-busy="true"]'))
      );
    },
    text,
    { timeout: 240000 },
  );
  const alerts = await editor(page).getByRole("alert").allTextContents();
  assert.deepEqual(alerts, [], alerts.join("\n"));
  await expect(editor(page).getByRole("status")).toContainText(text);
}
async function selectAppearance(page, field, value) {
  const control = editor(page).getByLabel(field, { exact: true });
  if ((await control.inputValue()) === value) return;
  await control.selectOption(value);
  await ready(page, "Appearance updated");
}
function decoded(path, recursive = true) {
  return JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        String.raw`
import sys,io,json,zipfile
from PIL import Image
rows=[]
def check(data,name,depth=0):
 assert data and depth<4
 row={'name':name,'bytes':len(data)}
 if name.endswith('.png'):
  im=Image.open(io.BytesIO(data));im.load();assert im.mode=='RGBA';row.update(dimensions=list(im.size),alphaExtrema=list(im.getchannel('A').getextrema()),decoded=True)
 if name.endswith('.json'):json.loads(data)
 rows.append(row)
 if name.endswith('.zip'):
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   assert z.testzip() is None
   for n in z.namelist():
    assert not n.startswith('/') and '..' not in n.split('/')
    if n.endswith('.zip') and sys.argv[2]!='1':continue
    check(z.read(n),name+'/'+n,depth+1)
check(open(sys.argv[1],'rb').read(),sys.argv[1].split('/')[-1])
print(json.dumps(rows))
`,
        path,
        recursive ? "1" : "0",
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    ),
  );
}
async function download(page, label, name, kind, metadata = {}) {
  const path = join(output, kind === "png" ? "png" : "exports", name);
  assert(!existsSync(path));
  const pending = page.waitForEvent("download", { timeout: 300000 });
  await editor(page)
    .getByRole("button", { name: label, exact: typeof label === "string" })
    .click();
  const d = await pending;
  await d.saveAs(path);
  assert.equal(await d.failure(), null);
  const bytes = await readFile(path);
  assert(bytes.length);
  report.downloads.push({
    file: rel(path),
    sha256: sha(bytes),
    bytes: bytes.length,
    kind,
    ...metadata,
    decoded: decoded(path, kind === "project"),
  });
  console.log(`Downloaded ${name} (${bytes.length} bytes)`);
  return {
    path,
    bytes,
    files: name.endsWith(".zip") ? unzipSync(new Uint8Array(bytes)) : null,
  };
}
async function pause(page, mode = "wardrobe") {
  const control = button(
    page,
    mode === "wardrobe" ? "Pause wardrobe animation" : "Pause animation",
  );
  if (await control.count()) await control.click();
}
async function pose(page, manifest, frameId, facing = "right") {
  await pause(page);
  const action = actions.find((a) =>
    manifest.animations[a].frames.includes(frameId),
  );
  assert(action);
  const position = manifest.animations[action].frames.indexOf(frameId);
  await editor(page)
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption(action);
  await editor(page)
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption(facing);
  await editor(page)
    .getByLabel("Wardrobe frame", { exact: true })
    .fill(String(position));
  await expect(nativeCanvas(page)).toHaveAttribute(
    "data-rendered-frame-id",
    String(frameId),
  );
  return { action, position, frameId, facing };
}
async function png(
  page,
  character,
  label,
  manifest,
  frameId = 0,
  facing = "right",
) {
  const meta = await pose(page, manifest, frameId, facing);
  return download(
    page,
    "Save current PNG",
    `${character}-${label}-${frameId}-${facing}.png`,
    "png",
    { character, label, ...meta },
  );
}
async function screenshot(page, name) {
  const path = join(output, name);
  await page.screenshot({ path, fullPage: true });
  const b = await readFile(path);
  report.screenshots.push({ file: rel(path), bytes: b.length, sha256: sha(b) });
}
async function play(page, manifest, character, look, action, facing) {
  await pause(page, "independent");
  await button(page, capitalize(action)).click();
  await button(page, capitalize(facing)).click();
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
  await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
  await page.locator("#player-frame").fill("0");
  const clip = manifest.animations[action];
  const durationMs = Math.ceil(
    ((1000 * clip.frames.length) / clip.fps) * (clip.loop ? 2.1 : 1) + 220,
  );
  const observations = await page.evaluate(async (durationMs) => {
    const canvas = document.querySelector('[data-testid="consumer-canvas"]');
    let previous = "";
    const observations = [];
    const start = performance.now();
    function sample() {
      const o = {
        action: canvas.dataset.action,
        frameId: Number(canvas.dataset.frameId),
        position: Number(canvas.dataset.framePosition),
        atMs: performance.now() - start,
      };
      const key = o.action + "/" + o.position;
      if (key !== previous) {
        observations.push(o);
        previous = key;
      }
    }
    const observer = new MutationObserver(sample);
    observer.observe(canvas, { attributes: true });
    sample();
    document.querySelector('button[aria-label="Play animation"]').click();
    await new Promise((r) => setTimeout(r, durationMs));
    sample();
    observer.disconnect();
    document.querySelector('button[aria-label="Pause animation"]')?.click();
    return observations;
  }, durationMs);
  for (const o of observations)
    assert.equal(o.frameId, manifest.animations[o.action]?.frames[o.position]);
  const selected = observations.filter((o) => o.action === action);
  const positions = [...new Set(selected.map((o) => o.position))];
  assert(positions.length >= Math.min(3, clip.frames.length));
  const wraps = selected.reduce(
    (n, o, i) => n + (i && o.position < selected[i - 1].position ? 1 : 0),
    0,
  );
  if (clip.loop) assert(wraps >= 1);
  else assert(observations.some((o) => o.action === "idle"));
  report.playback.push({
    character,
    look,
    action,
    facing,
    observations,
    wraps,
    durationMs,
    missingPositions: clip.frames
      .map((_, i) => i)
      .filter((i) => !positions.includes(i)),
    gapsOver90Ms: observations.flatMap((o, i) =>
      i && o.atMs - observations[i - 1].atMs > 90
        ? [o.atMs - observations[i - 1].atMs]
        : [],
    ),
  });
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (const character of characters) {
    const entry = catalog.characters.find((c) => c.key === character);
    assert(entry);
    const original = unzipSync(
      new Uint8Array(await readFile(join(root, entry.sourceUrl.slice(1)))),
    );
    const manifest = json(original["manifest.json"]);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
    });
    watch(context);
    const page = await context.newPage();
    activePage = page;
    await page.goto(
      `${origin}/workbench.html?character=${character}&mode=wardrobe`,
    );
    await ready(page, "Original outfit.");
    await pause(page);
    if (quick) {
      for (const style of styles) {
        await selectAppearance(page, "Hairstyle", style);
        await selectAppearance(page, "Face", "gentle");
        for (const fid of quickFrames)
          if (manifest.frames.some((f) => f.id === fid))
            await png(page, character, style, manifest, fid);
      }
      await screenshot(page, `${character}-quick-workbench.png`);
      await context.close();
      continue;
    }
    await png(page, character, "original", manifest);
    for (const style of styles) {
      await selectAppearance(page, "Hairstyle", style);
      await selectAppearance(page, "Face", "");
      await png(page, character, `${style}-original-face`, manifest);
      await selectAppearance(page, "Face", "gentle");
      await png(page, character, `${style}-gentle`, manifest);
      for (const color of ["espresso", "copper"]) {
        await selectAppearance(page, "Hair color", color);
        await png(page, character, `${style}-${color}`, manifest);
      }
      await selectAppearance(page, "Hair color", "chestnut");
    }
    await selectAppearance(
      page,
      "Hairstyle",
      character === "male" ? "soft-crop" : "soft-bob",
    );
    for (const look of ["day", "wedding"]) {
      const preset = entry.presets.find((p) => p.id === look);
      await button(page, preset.name).click();
      await ready(page, `${preset.name} selected`);
      await editor(page)
        .getByLabel("Compare original", { exact: true })
        .check();
      for (const fid of [0, 51, 58, 67, 89, 95, 104])
        if (manifest.frames.some((f) => f.id === fid))
          await png(page, character, look, manifest, fid);
      await png(page, character, look, manifest, 51, "left");
      await screenshot(page, `${character}-${look}-workbench.png`);
      const saved = await download(
        page,
        /Save wardrobe/,
        `${character}-${look}.wardrobe.zip`,
        "project",
        { character, look },
      );
      const doc = json(saved.files["document.json"]);
      assert.equal(doc.version, 2);
      assert.equal(doc.appearance.faceId, "gentle");
      await editor(page)
        .getByLabel("Open wardrobe project file", { exact: true })
        .setInputFiles(saved.path);
      await ready(page, "Saved outfit and action settings restored");
      await expect(
        editor(page).getByLabel("Hairstyle", { exact: true }),
      ).toHaveValue(character === "male" ? "soft-crop" : "soft-bob");
      await expect(
        editor(page).getByLabel("Face", { exact: true }),
      ).toHaveValue("gentle");
      await expect(
        editor(page).getByLabel("Wardrobe facing", { exact: true }),
      ).toHaveValue("left");
      const pack = await download(
        page,
        "Export CharacterPack",
        `${character}-${look}.character.zip`,
        "pack",
        { character, look },
      );
      const pm = json(pack.files["manifest.json"]);
      assert.deepEqual(pm.animations, manifest.animations);
      assert.deepEqual(
        pm.frames.map((f) => f.id),
        manifest.frames.map((f) => f.id),
      );
      assert.equal(pm.spritesheet.frameWidth, 768);
      assert.equal(pm.spritesheet.frameHeight, 1184);
      assert.equal(pm.anchor.x, manifest.anchor.x + 32);
      assert.equal(pm.anchor.y, manifest.anchor.y + 128);
      report.projects.push({
        character,
        look,
        file: rel(saved.path),
        reopened: true,
        appearance: doc.appearance,
        preview: doc.preview,
      });
      report.packs.push({
        character,
        look,
        file: rel(pack.path),
        manifest: pm,
        originalAnimationsPreserved: true,
        sourcePixelScaleUnchanged: true,
      });
      await persist();
    }
    await context.close();
  }
  report.workbenchClosedAt = new Date().toISOString();
  await persist();
  if (!quick)
    for (const pack of report.packs) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
        deviceScaleFactor: 1,
      });
      watch(context, true);
      const page = await context.newPage();
      activePage = page;
      await page.route(
        /\/src\/(?:wardrobe|appearance|skeletal)\/|WardrobeEditor|SpriteActionEditor/,
        (r) => {
          report.forbiddenIndependentRequests.push(r.request().url());
          return r.abort();
        },
      );
      await page.goto(`${origin}/player.html`);
      await page.locator("#player-zip").setInputFiles(join(root, pack.file));
      await expect(page.getByRole("status")).toContainText("Loaded:", {
        timeout: 240000,
      });
      for (const action of actions)
        for (const facing of ["right", "left"])
          await play(
            page,
            pack.manifest,
            pack.character,
            pack.look,
            action,
            facing,
          );
      await button(page, "Run").click();
      await button(page, "Right").click();
      await page.locator("#player-frame").fill("7");
      await screenshot(page, `${pack.character}-${pack.look}-independent.png`);
      await context.close();
      await persist();
    }
  for (const [path, hash] of Object.entries(report.inputHashes))
    assert.equal(
      sha(await readFile(join(root, path))),
      hash,
      `Input changed: ${path}`,
    );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  const failures = report.failedRequests.filter(
    (r) => new URL(r.url).pathname !== "/favicon.ico",
  );
  assert.deepEqual(failures, []);
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  report.observationLimits =
    "MutationObserver observes actual published bitmap metadata, not every engine tick. Missing positions and scheduling gaps are reported; visual loop quality requires review of decoded exported frames.";
  await persist();
  console.log(
    JSON.stringify({
      passed: true,
      quick,
      downloads: report.downloads.length,
      packs: report.packs.length,
      playback: report.playback.length,
      report: rel(join(output, "evidence-index.json")),
    }),
  );
} catch (e) {
  report.passed = false;
  report.failure = e.stack || String(e);
  report.finishedAt = new Date().toISOString();
  if (activePage && !activePage.isClosed()) {
    report.alerts = await activePage
      .getByRole("alert")
      .allTextContents()
      .catch(() => []);
    await activePage
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  }
  await persist();
  throw e;
} finally {
  await browser?.close();
  if (production) await new Promise((r) => server.httpServer.close(r));
  else await server.close();
}
