// Actual browser exports for the bounded five-sprint iteration; historical bank files remain immutable.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { unzipSync } from "fflate";
const root = fileURLToPath(new URL("../", import.meta.url));
const run = process.env.SPRINT_RUN || "final";
assert(/^[a-z0-9-]+$/.test(run));
const output = join(root, "docs/kling-sprints/evidence", run);
const temporary = join("/tmp/gathria-sprints", run);
await mkdir(output, { recursive: true });
await mkdir(temporary, { recursive: true });
assert(
  !existsSync(join(output, "evidence-index.json")),
  "Use a fresh SPRINT_RUN; retain prior evidence.",
);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const characters = process.env.VOLUME_CHARACTER
  ? [process.env.VOLUME_CHARACTER]
  : ["male", "female"];
assert(characters.every((c) => ["male", "female"].includes(c)));
const catalog = JSON.parse(
  await readFile(join(root, "docs/kling-wardrobe/catalog.json"), "utf8"),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const json = (b) => JSON.parse(Buffer.from(b).toString("utf8"));
const panel = (p) => p.locator("#wardrobe-panel");
const button = (p, name) => p.getByRole("button", { name, exact: true });
const canvas = (p) => panel(p).getByTestId("wardrobe-preview");
const title = (s) => s[0].toUpperCase() + s.slice(1);
const report = {
  format: "gathria-five-sprint-workflow",
  version: 1,
  run,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "New clothes on exact Kling source. Actual PNG/ZIP downloads, saved project reopen, five actions both directions in isolated player. Technical checks are not user visual acceptance.",
  inputs: {},
  downloads: [],
  screenshots: [],
  selections: [],
  reopened: [],
  packs: [],
  playback: [],
  legacyRoundtrips: [],
  mixes: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  externalRequests: [],
  forbiddenIndependentRequests: [],
};
const definitions = JSON.parse(
  await readFile(
    join(root, "artwork/kling-collection/source/volume-v1/looks.json"),
    "utf8",
  ),
);
const port = Number(process.env.SPRINT_PORT || 5195);
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
});
await server.listen();
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
  context.on("request", (request) => {
    const u = request.url();
    if (/^https?:/.test(u) && !u.startsWith(origin))
      report.externalRequests.push(u);
    if (
      independent &&
      /\/src\/(?:wardrobe|appearance|skeletal)\/|WardrobeEditor|SpriteActionEditor/.test(
        u,
      )
    )
      report.forbiddenIndependentRequests.push(u);
  });
  context.on("response", (r) => {
    if (r.status() >= 400)
      report.failedRequests.push({ url: r.url(), status: r.status() });
  });
}
async function ready(page, text) {
  console.log(`Waiting for: ${text}`);
  const started = performance.now();
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
  const errors = await panel(page).getByRole("alert").allTextContents();
  assert.deepEqual(errors, [], errors.join("\n"));
  await expect(panel(page).getByRole("status")).toContainText(text);
  report.preparationWaits ??= [];
  report.preparationWaits.push({
    expected: text,
    milliseconds: Math.round(performance.now() - started),
  });
}
async function idle(page) {
  await expect(page.locator('#wardrobe-panel [aria-busy="true"]')).toHaveCount(
    0,
    { timeout: 240000 },
  );
}
async function pause(page, independent = false) {
  const b = button(
    page,
    independent ? "Pause animation" : "Pause wardrobe animation",
  );
  if (await b.count()) await b.click();
}
async function pose(page, manifest, id, facing = "right") {
  await pause(page);
  const action = actions.find((a) =>
    manifest.animations[a].frames.includes(id),
  );
  assert(action);
  const position = manifest.animations[action].frames.indexOf(id);
  await panel(page)
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption(action);
  await panel(page)
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption(facing);
  await panel(page)
    .getByLabel("Wardrobe frame", { exact: true })
    .fill(String(position));
  await expect(canvas(page)).toHaveAttribute(
    "data-rendered-frame-id",
    String(id),
  );
  return { action, position, id, facing };
}
async function imageHash(locator) {
  return locator.evaluate(async (c) => {
    const bytes = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return {
      width: c.width,
      height: c.height,
      rgbaSha256: Array.from(digest, (n) =>
        n.toString(16).padStart(2, "0"),
      ).join(""),
    };
  });
}
async function screenshot(page, name) {
  const path = join(output, name);
  await page.screenshot({ path, fullPage: true });
  const b = await readFile(path);
  report.screenshots.push({ file: rel(path), bytes: b.length, sha256: sha(b) });
}
function decode(path, recursive = false) {
  return JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        String.raw`
import io,json,sys,zipfile,hashlib
from PIL import Image
rows=[]
def read(data,name,depth=0):
 assert data and depth<4
 r={'name':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 if name.endswith('.png'):
  im=Image.open(io.BytesIO(data));im.load();assert im.mode=='RGBA';r.update(size=list(im.size),alphaExtrema=list(im.getchannel('A').getextrema()),rgbaSha256=hashlib.sha256(im.tobytes()).hexdigest(),decoded=True)
 elif name.endswith('.json'):json.loads(data)
 rows.append(r)
 if name.endswith('.zip'):
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   assert z.testzip() is None
   for n in z.namelist():
    assert not n.startswith('/') and '..' not in n.split('/')
    if n.endswith('.zip') and sys.argv[2]!='1':continue
    read(z.read(n),name+'/'+n,depth+1)
read(open(sys.argv[1],'rb').read(),sys.argv[1].split('/')[-1]);print(json.dumps(rows))
`,
        path,
        recursive ? "1" : "0",
      ],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    ),
  );
}
async function download(page, name, filename, kind, scope = panel(page)) {
  const path = join(kind === "png" ? output : temporary, filename);
  assert(!existsSync(path));
  const pending = page.waitForEvent("download", { timeout: 300000 });
  await scope
    .getByRole("button", { name, exact: typeof name === "string" })
    .click();
  const d = await pending;
  await d.saveAs(path);
  assert.equal(await d.failure(), null);
  const bytes = await readFile(path);
  report.downloads.push({
    file: kind === "png" ? rel(path) : path,
    retainedInRepository: kind === "png",
    kind,
    bytes: bytes.length,
    sha256: sha(bytes),
    decoded: decode(path, kind === "project"),
  });
  console.log(`Downloaded ${filename} (${bytes.length} bytes)`);
  return {
    path,
    bytes,
    files: filename.endsWith(".zip") ? unzipSync(new Uint8Array(bytes)) : null,
  };
}
async function png(page, character, label, manifest, id = 0, facing = "right") {
  const p = await pose(page, manifest, id, facing);
  const d = await download(
    page,
    "Save current PNG",
    `${character}-${label}-${id}-${facing}.png`,
    "png",
  );
  return { ...d, ...p };
}
async function appearance(page, label, value) {
  const c = panel(page).getByLabel(label, { exact: true });
  if ((await c.inputValue()) === value) return;
  await c.selectOption(value);
  await ready(page, "Appearance updated");
}
function verifyPack(pack, source) {
  const m = json(pack.files["manifest.json"]);
  assert.deepEqual(m.animations, source.animations);
  assert.deepEqual(
    m.frames.map((f) => f.id),
    source.frames.map((f) => f.id),
  );
  assert.equal(m.spritesheet.frameWidth, 768);
  assert.equal(m.spritesheet.frameHeight, 1184);
  assert.deepEqual(m.anchor, {
    ...source.anchor,
    x: source.anchor.x + 32,
    y: source.anchor.y + 128,
  });
  return m;
}
async function play(page, pack, action, facing) {
  await pause(page, true);
  await button(page, title(action)).click();
  await button(page, title(facing)).click();
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
  await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
  await page.locator("#player-frame").fill("0");
  const clip = pack.manifest.animations[action],
    durationMs = Math.ceil(
      ((1000 * clip.frames.length) / clip.fps) * (clip.loop ? 2.1 : 1) + 250,
    );
  const observations = await page.evaluate(async (duration) => {
    const c = document.querySelector('[data-testid="consumer-canvas"]');
    const start = performance.now();
    let prev = "";
    const o = [];
    const sample = () => {
      const x = {
        action: c.dataset.action,
        frameId: Number(c.dataset.frameId),
        position: Number(c.dataset.framePosition),
        atMs: performance.now() - start,
      };
      const key = x.action + "/" + x.position;
      if (key !== prev) {
        o.push(x);
        prev = key;
      }
    };
    const observer = new MutationObserver(sample);
    observer.observe(c, { attributes: true });
    sample();
    document.querySelector('button[aria-label="Play animation"]').click();
    await new Promise((r) => setTimeout(r, duration));
    sample();
    observer.disconnect();
    document.querySelector('button[aria-label="Pause animation"]')?.click();
    return o;
  }, durationMs);
  for (const o of observations)
    assert.equal(
      o.frameId,
      pack.manifest.animations[o.action]?.frames[o.position],
    );
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
    character: pack.character,
    look: pack.look,
    action,
    facing,
    durationMs,
    wraps,
    observations,
    missingPositions: clip.frames
      .map((_, i) => i)
      .filter((i) => !positions.includes(i)),
  });
}

async function chooseHair(page, style) {
  const control = panel(page).getByLabel("Hairstyle", { exact: true });
  if ((await control.inputValue()) === style.id) return;
  await button(page, `Choose ${style.name}`).click();
  await ready(page, "Appearance updated");
  await expect(control).toHaveValue(style.id);
}
async function chooseColor(page, color) {
  const control = panel(page).getByLabel("Hair color", { exact: true });
  if ((await control.inputValue()) === color) return;
  await button(page, `Use ${title(color)}`).click();
  await ready(page, "Appearance updated");
  await expect(control).toHaveValue(color);
}
async function outfit(page, name) {
  await button(page, name).click();
  await ready(
    page,
    `${name === "Original" ? "Original outfit" : name} selected`,
  );
  await pause(page);
}

async function capture(page, character, look, source, final = false) {
  for (const fid of [0, 55, 62, 86])
    await png(page, character, look, source, fid);
  await png(page, character, look, source, 55, "left");
  const saved = await download(
    page,
    /Save wardrobe/,
    `${character}-${look}.wardrobe.zip`,
    "project",
  );
  const doc = json(saved.files["document.json"]);
  await writeFile(
    join(output, `${character}-${look}-recipe.json`),
    JSON.stringify(doc, null, 2) + "\n",
  );
  const before = await imageHash(canvas(page));
  await panel(page)
    .getByLabel("Open wardrobe project file", { exact: true })
    .setInputFiles(saved.path);
  await ready(page, "Saved outfit and action settings restored");
  await pose(page, source, 55, "left");
  assert.deepEqual(await imageHash(canvas(page)), before);
  report.reopened.push({
    character,
    look,
    project: saved.path,
    exactRgbaAfterReopen: true,
    preview: doc.preview,
  });
  if (final) {
    const name = `Review ${look}`;
    await panel(page).getByLabel("Look name").fill(name);
    await button(page, "Save look").click();
    await page.reload();
    await ready(page, "Original outfit.");
    await button(page, `Apply look ${name}`).click();
    await ready(page, `${name} restored`);
    await expect(
      panel(page).getByLabel("Wardrobe action", { exact: true }),
    ).toHaveValue("run");
    await expect(
      panel(page).getByLabel("Wardrobe facing", { exact: true }),
    ).toHaveValue("left");
    await pose(page, source, 55, "left");
    assert.deepEqual(await imageHash(canvas(page)), before);
    report.namedLooks ??= [];
    report.namedLooks.push({
      character,
      look,
      reloadRestoredExactPixels: true,
      restoredAction: "run",
      restoredFacing: "left",
    });
    await panel(page)
      .getByLabel("Inspect connections", { exact: true })
      .check();
    await panel(page)
      .getByLabel("Inspection area", { exact: true })
      .selectOption(look.includes("ivory") ? "waist" : "head");
    await download(
      page,
      "Save comparison PNG",
      `${character}-${look}-connection-inspector.png`,
      "png",
    );
    await screenshot(page, `${character}-${look}-workbench.png`);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      "Mobile document overflow",
    );
    await screenshot(page, `${character}-${look}-mobile.png`);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const pack = await download(
    page,
    "Export CharacterPack",
    `${character}-${look}.character.zip`,
    "pack",
  );
  const manifest = verifyPack(pack, source);
  const retained = join(output, `${character}-${look}.character.zip`);
  await copyFile(pack.path, retained);
  report.packs.push({
    character,
    look,
    final,
    file: rel(retained),
    capturedPath: retained,
    project: saved.path,
    manifest,
    sha256: sha(pack.bytes),
  });
  await persist();
  return saved;
}

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  const cases = process.env.SPRINT_CASE
    ? [process.env.SPRINT_CASE]
    : ["pony", "ivory", "oat"];
  for (const study of cases) {
    assert(["pony", "ivory", "oat"].includes(study));
    const character = study === "oat" ? "male" : "female";
    const resume =
      process.env.SPRINT_BASELINE ??
      (study === "pony" ? process.env.SPRINT_PONY_BASELINE : null);
    if (resume) assert(/^[a-z0-9-]+$/.test(resume));
    const resumedProject = resume
      ? join(
          "/tmp/gathria-sprints",
          resume,
          `female-${study}-before.wardrobe.zip`,
        )
      : null;
    if (resumedProject)
      report.inputs[resumedProject] = sha(await readFile(resumedProject));
    const entry = catalog.characters.find((c) => c.key === character);
    const sourceBytes = await readFile(join(root, entry.sourceUrl.slice(1)));
    const source = json(
      unzipSync(new Uint8Array(sourceBytes))["manifest.json"],
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    watch(context);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    activePage = page;
    if (study === "pony" && !resume) {
      // Open the exact preceding release, using its real library bytes, to save
      // a historical project. Then return to the current unmodified catalog.
      const old = await readFile(
        join(root, "docs/kling-appearance/banks/volume/female-ribbon-pony.zip"),
      );
      const m = json(unzipSync(new Uint8Array(old))["manifest.json"]);
      const historical = structuredClone(catalog);
      const bank = historical.characters
        .find((c) => c.key === "female")
        .appearanceLibraries.find((b) =>
          b.styles.some((s) => s.id === "ribbon-pony"),
        );
      Object.assign(bank, {
        url: "/docs/kling-appearance/banks/volume/female-ribbon-pony.zip",
        sha256: sha(old),
        bankId: m.id,
      });
      delete bank.previousBankSha256s;
      report.historicalPonyBank = {
        sha256: sha(old),
        bankId: m.id,
        url: bank.url,
      };
      await page.route("**/docs/kling-wardrobe/catalog.json", (r) =>
        r.fulfill({ json: historical }),
      );
    }
    await page.goto(
      `${origin}/workbench.html?character=${character}&mode=wardrobe`,
    );
    await ready(page, "Original outfit.");
    if (!resume)
      await outfit(
        page,
        study === "pony"
          ? "Honey garden"
          : study === "ivory"
            ? "Ivory celebration"
            : "Oat weekend",
      );
    if (!resume)
      await appearance(
        page,
        "Hairstyle",
        study === "pony"
          ? "ribbon-pony"
          : study === "ivory"
            ? "braided-crown"
            : "airy-tousle",
      );
    if (study === "oat") await capture(page, character, "oat", source, true);
    else {
      const before = resumedProject
        ? { path: resumedProject }
        : await capture(page, character, `${study}-before`, source);
      if (study === "pony") {
        await page.unroute("**/docs/kling-wardrobe/catalog.json");
        await page.reload();
        await ready(page, "Original outfit.");
        await panel(page)
          .getByLabel("Open wardrobe project file", { exact: true })
          .setInputFiles(before.path);
        await ready(page, "Saved outfit and action settings restored");
        await button(page, "Preview updated appearance").click();
        await expect(page.getByRole("dialog")).toBeVisible({ timeout: 240000 });
        const updated = await download(
          page,
          "Save updated copy",
          "pony-updated.wardrobe.zip",
          "project",
          page.getByRole("dialog"),
        );
        await page
          .getByRole("button", { name: "Close update preview", exact: true })
          .click();
        await panel(page)
          .getByLabel("Open wardrobe project file", { exact: true })
          .setInputFiles(updated.path);
        await ready(page, "Saved outfit and action settings restored");
      } else {
        if (resumedProject) {
          await panel(page)
            .getByLabel("Open wardrobe project file", { exact: true })
            .setInputFiles(resumedProject);
          await ready(page, "Saved outfit and action settings restored");
        }
        await outfit(page, "Ivory refined");
      }
      await capture(page, character, `${study}-after`, source, true);
    }
    await context.close();
    await persist();
  }
  report.editorsClosedAt = new Date().toISOString();
  for (const pack of report.packs.filter((p) => p.final)) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    watch(context, true);
    const page = await context.newPage();
    activePage = page;
    await page.route(
      /\/src\/(?:wardrobe|appearance|skeletal)\/|WardrobeEditor|SpriteActionEditor/,
      (r) => r.abort(),
    );
    await page.goto(`${origin}/player.html`);
    await page.locator("#player-zip").setInputFiles(pack.capturedPath);
    await expect(page.getByRole("status")).toContainText("Loaded:", {
      timeout: 240000,
    });
    for (const action of actions)
      for (const facing of ["right", "left"])
        await play(page, pack, action, facing);
    await screenshot(
      page,
      `${pack.character}-${pack.look}-independent-player.png`,
    );
    await context.close();
    await persist();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert.deepEqual(
    report.failedRequests.filter((r) => !r.url.endsWith("favicon.ico")),
    [],
  );
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await persist();
  console.log("Sprint browser evidence passed");
} catch (e) {
  report.failure = String(e);
  await persist();
  if (activePage && !activePage.isClosed())
    await activePage
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
  throw e;
} finally {
  await browser?.close();
  await server.close();
}
