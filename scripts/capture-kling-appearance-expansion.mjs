// Actual UI downloads for the append-only Kling hairstyle expansion.
// Old projects are opened unchanged for before PNGs; no synthetic renderer or fixture.
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
const baselineOnly = process.argv.includes("--baseline-only");
const uiOnly = process.argv.includes("--ui-only");
assert(!(baselineOnly && uiOnly));
const run =
  process.env.EXPANSION_RUN ||
  (baselineOnly ? "baseline" : uiOnly ? "post-thumbnail-ui" : "final");
assert(/^[a-z0-9-]+$/.test(run));
const output = join(
  root,
  "docs/kling-appearance/expansion-review/evidence",
  run,
);
const temporary = join("/tmp/gathria-appearance-expansion", run);
await mkdir(output, { recursive: true });
await mkdir(temporary, { recursive: true });
assert(
  !existsSync(join(output, "evidence-index.json")),
  "Use a new EXPANSION_RUN; prior evidence is retained.",
);
const characters = process.env.EXPANSION_CHARACTER
  ? [process.env.EXPANSION_CHARACTER]
  : ["male", "female"];
assert(characters.every((c) => ["male", "female"].includes(c)));
const port = Number(process.env.EXPANSION_PORT || 5194);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const newStyleIds = { male: "side-part", female: "tucked-bun" };
const legacyPaths = {
  male: "/tmp/gathria-ear-overlap/final/male-day.wardrobe.zip",
  female:
    "/tmp/gathria-appearance-stability/final-female-hand-fix/female-day.wardrobe.zip",
};
const catalog = JSON.parse(
  await readFile(join(root, "docs/kling-wardrobe/catalog.json"), "utf8"),
);
const baseline = JSON.parse(
  await readFile(
    join(root, "docs/kling-appearance/expansion-review/baseline-inputs.json"),
    "utf8",
  ),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const json = (b) => JSON.parse(Buffer.from(b).toString("utf8"));
const panel = (p) => p.locator("#wardrobe-panel");
const button = (p, name) => p.getByRole("button", { name, exact: true });
const canvas = (p) => panel(p).getByTestId("wardrobe-preview");
const title = (s) => s[0].toUpperCase() + s.slice(1);
const report = {
  format: "gathria-appearance-expansion-workflow",
  version: 1,
  run,
  baselineOnly,
  uiOnly,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope: baselineOnly
    ? "Fresh actual PNG exports from retained embedded baseline banks, two old styles per character; no new pack."
    : uiOnly
      ? "Final real thumbnail image loading and desktop/mobile display only; no export or playback re-run."
      : "Real current bank, three-style lineup, both faces and three colors, two outfits, five actions/both directions, saved project reopen and isolated exported CharacterPack playback. Technical evidence is not user visual approval.",
  inputs: {},
  downloads: [],
  screenshots: [],
  selections: [],
  reopened: [],
  packs: [],
  playback: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  externalRequests: [],
  forbiddenIndependentRequests: [],
};
for (const character of characters) {
  const paths = [
    `docs/kling-motion/exports/${character}.character.zip`,
    baselineOnly
      ? legacyPaths[character]
      : `docs/kling-appearance/banks/${character}.zip`,
  ];
  for (const path of paths)
    report.inputs[path] = sha(
      await readFile(path.startsWith("/") ? path : join(root, path)),
    );
}
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
function actualFrames(source) {
  const present = new Set(source.frames.map((f) => f.id));
  const representative = Object.fromEntries(
    actions.map((action) => {
      const ids = source.animations[action].frames;
      const preferred = { idle: 0, walk: 35, run: 55, jump: 86, celebrate: 78 }[
        action
      ];
      return [
        action,
        ids.includes(preferred) ? preferred : ids[Math.floor(ids.length / 2)],
      ];
    }),
  );
  return {
    representative,
    details: [0, 51, 55, 62, 66, 75, 78, 79, 80, 86, 87, 104].filter((id) =>
      present.has(id),
    ),
  };
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (const character of characters) {
    const entry = catalog.characters.find((c) => c.key === character);
    const sourceBytes = await readFile(join(root, entry.sourceUrl.slice(1)));
    const source = json(
      unzipSync(new Uint8Array(sourceBytes))["manifest.json"],
    );
    const chosen = actualFrames(source);
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
    if (baselineOnly) {
      const bytes = await readFile(legacyPaths[character]);
      const files = unzipSync(new Uint8Array(bytes));
      assert.equal(
        sha(files["appearance.zip"]),
        baseline.characters[character].bankSha256,
      );
      await panel(page)
        .getByLabel("Open wardrobe project file", { exact: true })
        .setInputFiles(legacyPaths[character]);
      await ready(page, "Saved outfit and action settings restored");
      await outfit(page, "Original");
      await appearance(page, "Face", "");
      await appearance(page, "Hair color", "chestnut");
      for (const style of baseline.characters[character].styles.filter(
        (s) => s.slot === "hair",
      )) {
        await appearance(page, "Hairstyle", style.id);
        await png(
          page,
          character,
          `lineup-${style.id}`,
          source,
          source.animations.idle.frames[0],
        );
      }
      report.selections.push({
        character,
        embeddedProject: legacyPaths[character],
        projectSha256: sha(bytes),
        bankSha256: sha(files["appearance.zip"]),
        faceId: null,
        hairColor: "chestnut",
        outfit: "Original",
        frameId: source.animations.idle.frames[0],
      });
      await context.close();
      await persist();
      continue;
    }
    const bankBytes = await readFile(
      join(root, `docs/kling-appearance/banks/${character}.zip`),
    );
    const bank = json(unzipSync(new Uint8Array(bankBytes))["manifest.json"]);
    const bankSha = sha(bankBytes);
    assert.equal(bankSha, entry.appearanceRevision.bankSha256);
    const hairs = bank.styles.filter((s) => s.slot === "hair");
    const fresh = hairs.find((s) => s.id === newStyleIds[character]);
    assert(fresh, "Wait until the accepted new hairstyle bank is ready");
    assert.equal(hairs.length, 3);
    assert(
      !baseline.characters[character].styles.some((s) => s.id === fresh.id),
    );
    await expect(button(page, `Choose ${fresh.name}`)).toBeVisible({
      timeout: 30000,
    });
    // First visit exposes the new style before any old style is loaded.
    await chooseHair(page, fresh);
    if (uiOnly) {
      const thumbnailImages = [];
      for (const style of hairs) {
        const img = button(page, `Choose ${style.name}`).locator("img");
        await expect(img).toHaveCount(1);
        await expect
          .poll(() => img.evaluate((im) => im.complete && im.naturalWidth > 0))
          .toBe(true);
        const path = `src/appearance/previews/${character}-${style.id}.png`;
        report.inputs[path] = sha(await readFile(join(root, path)));
        thumbnailImages.push({
          styleId: style.id,
          file: path,
          ...(await img.evaluate((im) => ({
            src: im.getAttribute("src"),
            naturalWidth: im.naturalWidth,
            naturalHeight: im.naturalHeight,
            complete: im.complete,
          }))),
        });
      }
      await appearance(page, "Face", "gentle");
      await outfit(page, "Everyday");
      await pose(page, source, source.animations.idle.frames[0], "right");
      await screenshot(page, `${character}-final-desktop.png`);
      await page.setViewportSize({ width: 390, height: 844 });
      await screenshot(page, `${character}-final-mobile.png`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false);
      report.selections.push({
        character,
        bankSha256: bankSha,
        newStyleId: fresh.id,
        thumbnailImages,
        mobileHorizontalOverflow: overflow,
      });
      await context.close();
      await persist();
      continue;
    }

    await appearance(page, "Face", "");
    await chooseColor(page, "chestnut");
    await appearance(page, "Hairstyle", "");
    await png(
      page,
      character,
      "lineup-original",
      source,
      source.animations.idle.frames[0],
    );
    for (const style of hairs) {
      await chooseHair(page, style);
      await png(
        page,
        character,
        `lineup-${style.id}`,
        source,
        source.animations.idle.frames[0],
      );
    }
    await chooseHair(page, fresh);
    report.selections.push({
      character,
      bankId: bank.id,
      bankSha256: bankSha,
      newStyleId: fresh.id,
      newStyleName: fresh.name,
      lineup: {
        frameId: source.animations.idle.frames[0],
        faceId: null,
        hairColor: "chestnut",
        outfit: "Original",
        styles: hairs.map((s) => s.id),
      },
      actualFrames: chosen,
    });
    await screenshot(page, `${character}-new-style-controls.png`);
    for (const color of ["chestnut", "espresso", "copper"]) {
      await chooseColor(page, color);
      for (const face of ["", "gentle"]) {
        await appearance(page, "Face", face);
        for (const id of [
          ...new Set([
            source.animations.idle.frames[0],
            chosen.representative.jump,
          ]),
        ])
          await png(
            page,
            character,
            `palette-${color}-${face || "original"}`,
            source,
            id,
          );
      }
    }
    await chooseColor(page, "chestnut");
    await appearance(page, "Face", "gentle");
    const mirrors = {};
    for (const look of ["everyday", "wedding"]) {
      await outfit(page, title(look));
      for (const [action, id] of Object.entries(chosen.representative)) {
        for (const facing of ["right", "left"]) {
          const d = await png(
            page,
            character,
            `${look}-${action}`,
            source,
            id,
            facing,
          );
          if (action === "run") {
            mirrors[look] ??= { frameId: id };
            mirrors[look][facing] = rel(d.path);
          }
        }
      }
      for (const id of chosen.details.filter(
        (id) => !Object.values(chosen.representative).includes(id),
      ))
        await png(page, character, `${look}-detail`, source, id);
      await screenshot(page, `${character}-${look}-workbench.png`);
    }
    await outfit(page, "Everyday");
    const focus = chosen.representative.run;
    await pose(page, source, focus, "left");
    const beforeSave = await imageHash(canvas(page));
    const project = await download(
      page,
      /Save wardrobe/,
      `${character}-new-style.wardrobe.zip`,
      "project",
    );
    const doc = json(project.files["document.json"]);
    assert.equal(sha(project.files["appearance.zip"]), bankSha);
    assert.equal(sha(project.files["source.character.zip"]), sha(sourceBytes));
    assert.equal(doc.appearance.hairId, fresh.id);
    assert.equal(doc.appearance.faceId, "gentle");
    assert.equal(doc.appearance.hairColor, "chestnut");
    assert.deepEqual(doc.preview, { action: "run", facing: "left" });
    await panel(page)
      .getByLabel("Open wardrobe project file", { exact: true })
      .setInputFiles(project.path);
    await ready(page, "Saved outfit and action settings restored");
    for (const [label, value] of [
      ["Hairstyle", fresh.id],
      ["Face", "gentle"],
      ["Hair color", "chestnut"],
      ["Wardrobe action", "run"],
      ["Wardrobe facing", "left"],
    ])
      await expect(panel(page).getByLabel(label, { exact: true })).toHaveValue(
        value,
      );
    await pose(page, source, focus, "left");
    assert.deepEqual(await imageHash(canvas(page)), beforeSave);
    report.reopened.push({
      character,
      project: project.path,
      projectSha256: sha(project.bytes),
      appearance: doc.appearance,
      selection: doc.selection,
      preview: doc.preview,
      focusFrame: focus,
      rgbaBeforeAndAfter: beforeSave,
      exactReopen: true,
      sourceBytesUnchanged: true,
    });
    const pack = await download(
      page,
      "Export CharacterPack",
      `${character}-new-style.character.zip`,
      "pack",
    );
    const manifest = verifyPack(pack, source);
    const retained = join(output, `${character}-new-style.character.zip`);
    await copyFile(pack.path, retained);
    report.packs.push({
      character,
      look: "everyday",
      file: rel(retained),
      capturedPath: pack.path,
      projectPath: project.path,
      projectSha256: sha(project.bytes),
      sha256: sha(pack.bytes),
      retainedSha256: sha(await readFile(retained)),
      manifest,
      selection: doc.selection,
      appearance: doc.appearance,
      mirrorPairs: mirrors,
      originalAnimationsPreserved: true,
      sourcePixelScaleUnchanged: true,
      retainedInRepository: true,
    });
    await screenshot(page, `${character}-reopened-workbench.png`);
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, `${character}-mobile.png`);
    report.selections.at(-1).mobileHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    await context.close();
    await persist();
  }
  report.editorsClosedAt = new Date().toISOString();
  await persist();
  for (const pack of report.packs) {
    console.log(`Independent playback: ${pack.character} new style…`);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
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
    await page.locator("#player-zip").setInputFiles(pack.capturedPath);
    await expect(page.getByRole("status")).toContainText("Loaded:", {
      timeout: 240000,
    });
    for (const action of actions)
      for (const facing of ["right", "left"])
        await play(page, pack, action, facing);
    await pause(page, true);
    await button(page, "Jump").click();
    await button(page, "Right").click();
    await page.locator("#player-frame").fill("3");
    await screenshot(page, `${pack.character}-independent-player.png`);
    await context.close();
    await persist();
  }
  for (const [path, hash] of Object.entries(report.inputs))
    assert.equal(
      sha(await readFile(path.startsWith("/") ? path : join(root, path))),
      hash,
    );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(
    report.consoleErrors.filter(
      (row) => !String(row.location?.url).endsWith("/favicon.ico"),
    ),
    [],
  );
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert.deepEqual(
    report.failedRequests.filter(
      (r) => new URL(r.url).pathname != "/favicon.ico",
    ),
    [],
  );
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  report.observationLimits =
    "Canvas positions observed at 1x; missing positions, if any, remain recorded. Native CharacterPack timings are exact; preview GIF uses cumulative centisecond rounding.";
  await persist();
  console.log(
    JSON.stringify({
      passed: true,
      downloads: report.downloads.length,
      packs: report.packs.length,
      playback: report.playback.length,
      index: rel(join(output, "evidence-index.json")),
    }),
  );
} catch (error) {
  report.passed = false;
  report.failure = error.stack || String(error);
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
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
