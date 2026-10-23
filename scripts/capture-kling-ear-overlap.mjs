// Focused male ear-overlap review: actual downloads and isolated playback.
// Derived from the previously validated stability harness; historical evidence is not overwritten.
// Synthetic test fixtures are not used by this evidence script.
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
const run = process.env.EAR_OVERLAP_RUN || "final";
const focusFrame = Number(process.env.EAR_OVERLAP_FOCUS_FRAME || 55);
const detailFrames = [
  ...new Set(
    (process.env.EAR_OVERLAP_DETAIL_FRAMES || "0,51,55,57,62,66,86,87")
      .split(",")
      .map(Number),
  ),
];
assert(Number.isInteger(focusFrame) && detailFrames.every(Number.isInteger));
assert(/^[a-z0-9-]+$/.test(run));
const output = join(
  root,
  "docs/kling-appearance/ear-overlap-review/evidence",
  run,
);
const temporary = join("/tmp/gathria-ear-overlap", run);
await mkdir(output, { recursive: true });
await mkdir(temporary, { recursive: true });
assert(
  !existsSync(join(output, "evidence-index.json")),
  "Use a new EAR_OVERLAP_RUN to retain previous evidence.",
);
const port = Number(process.env.EAR_OVERLAP_PORT || 5194);
const characters = ["male"];
const actions = ["idle", "walk", "run", "jump", "celebrate"];
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
let report = {
  format: "gathria-ear-overlap-workflow",
  version: 1,
  run,
  focusFrame,
  detailFrames,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "Actual preceding content-v3 male project, explicit preview/cancel/save-copy/reopen, everyday crop and wedding bob, real exported PNGs/CharacterPacks, and independent playback after closing the editor. Technical checks are not visual approval.",
  inputs: {},
  downloads: [],
  screenshots: [],
  upgrades: [],
  selections: [],
  packs: [],
  playback: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  externalRequests: [],
  forbiddenIndependentRequests: [],
};
for (const character of characters) {
  for (const path of [
    rel(
      join(
        "/tmp/gathria-ear-overlap/baseline",
        `${character}-day.wardrobe.zip`,
      ),
    ),
    `docs/kling-appearance/banks/${character}.zip`,
    `docs/kling-motion/exports/${character}.character.zip`,
  ]) {
    const actual = sha(await readFile(join(root, path)));
    report.inputs[path] = actual;
  }
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
async function png(
  page,
  character,
  label,
  manifest,
  id = focusFrame,
  facing = "right",
) {
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
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (const character of characters) {
    console.log(
      `Opening actual ${character} assets and the saved old project…`,
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
    });
    watch(context);
    const page = await context.newPage();
    activePage = page;
    const entry = catalog.characters.find((c) => c.key === character);
    const source = json(
      unzipSync(
        new Uint8Array(await readFile(join(root, entry.sourceUrl.slice(1)))),
      )["manifest.json"],
    );
    const legacyPath = join(
      root,
      rel(
        join(
          "/tmp/gathria-ear-overlap/baseline",
          `${character}-day.wardrobe.zip`,
        ),
      ),
    );
    const legacyFiles = unzipSync(new Uint8Array(await readFile(legacyPath)));
    const legacyDoc = json(legacyFiles["document.json"]);
    const bankSha = sha(
      await readFile(
        join(root, `docs/kling-appearance/banks/${character}.zip`),
      ),
    );
    await page.goto(
      `${origin}/workbench.html?character=${character}&mode=wardrobe`,
    );
    await ready(page, "Original outfit.");
    await pause(page);
    const defaultStyle = legacyDoc.appearance.hairId;
    assert.notEqual(
      sha(legacyFiles["appearance.zip"]),
      bankSha,
      "Wait for the accepted revised male bank before exporting",
    );
    const focusAction = actions.find((a) =>
      source.animations[a].frames.includes(focusFrame),
    );
    assert(focusAction);
    {
      await panel(page)
        .getByLabel("Open wardrobe project file", { exact: true })
        .setInputFiles(legacyPath);
      await ready(page, "Saved outfit and action settings restored");
      await pose(page, source, focusFrame, "left");
      const original = await imageHash(canvas(page));
      const before = await png(
        page,
        character,
        "old-project",
        source,
        focusFrame,
        "left",
      );
      const upgrade = {
        character,
        legacyProject: rel(legacyPath),
        oldBankSha: sha(legacyFiles["appearance.zip"]),
        currentBankSha: bankSha,
        previewPose: {
          action: focusAction,
          frameId: focusFrame,
          position: source.animations[focusAction].frames.indexOf(focusFrame),
          facing: "left",
        },
        oldCanvas: original,
      };
      console.log(`Checking ${character} same-pose preview and cancellation…`);
      await button(page, "Preview updated appearance").click();
      const dialog = page.getByRole("dialog", {
        name: "Preview updated appearance",
        exact: true,
      });
      await expect(dialog).toBeVisible({ timeout: 240000 });
      await expect(
        dialog.getByTestId("appearance-update-after"),
      ).toHaveAttribute("width", "768", { timeout: 240000 });
      await expect(
        dialog.getByLabel("Update preview action", { exact: true }),
      ).toHaveValue(focusAction);
      await expect(
        dialog.getByLabel("Update preview facing", { exact: true }),
      ).toHaveValue("left");
      await expect(
        dialog.getByLabel("Update preview frame", { exact: true }),
      ).toHaveValue(String(upgrade.previewPose.position));
      const previewBefore = await imageHash(
          dialog.getByTestId("appearance-update-before"),
        ),
        previewAfter = await imageHash(
          dialog.getByTestId("appearance-update-after"),
        );
      assert.deepEqual(previewBefore, original);
      assert.notEqual(previewAfter.rgbaSha256, original.rgbaSha256);
      upgrade.previewBefore = previewBefore;
      upgrade.previewAfter = previewAfter;
      await screenshot(page, `${character}-update-preview.png`);
      await dialog
        .getByRole("button", { name: "Cancel preview", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      assert.deepEqual(await imageHash(canvas(page)), original);
      upgrade.cancelPreservesOriginalPixels = true;
      await button(page, "Preview updated appearance").click();
      await expect(
        dialog.getByTestId("appearance-update-after"),
      ).toHaveAttribute("width", "768", { timeout: 240000 });
      const copy = await download(
        page,
        "Save updated copy",
        `${character}-updated-copy.wardrobe.zip`,
        "project",
        dialog,
      );
      await idle(page);
      if (await dialog.count())
        await dialog
          .getByRole("button", { name: "Cancel preview", exact: true })
          .click();
      assert.deepEqual(await imageHash(canvas(page)), original);
      upgrade.saveKeepsOriginalSessionPixels = true;
      const copiedDoc = json(copy.files["document.json"]);
      assert.equal(copiedDoc.version, 2);
      assert.equal(sha(copy.files["appearance.zip"]), bankSha);
      assert.deepEqual(copiedDoc.selection, legacyDoc.selection);
      assert.deepEqual(copiedDoc.items, legacyDoc.items);
      assert.deepEqual(copiedDoc.preview, {
        action: focusAction,
        facing: "left",
      });
      assert.deepEqual(
        {
          ...copiedDoc.appearance,
          bankSha256: legacyDoc.appearance.bankSha256,
        },
        legacyDoc.appearance,
      );
      assert.deepEqual(
        copy.files["source.character.zip"],
        legacyFiles["source.character.zip"],
      );
      assert.deepEqual(
        copy.files["registration.json"],
        legacyFiles["registration.json"],
      );
      for (const file of Object.keys(legacyFiles).filter((f) =>
        /^item-/.test(f),
      ))
        assert.deepEqual(copy.files[file], legacyFiles[file]);
      upgrade.savedCopy = {
        file: copy.path,
        retainedInRepository: false,
        sha256: sha(copy.bytes),
        document: copiedDoc,
        sourceAndGarmentBytesUnchanged: true,
      };
      await panel(page)
        .getByLabel("Open wardrobe project file", { exact: true })
        .setInputFiles(copy.path);
      await ready(page, "Saved outfit and action settings restored");
      await expect(
        panel(page).getByLabel("Wardrobe action", { exact: true }),
      ).toHaveValue(focusAction);
      await expect(
        panel(page).getByLabel("Wardrobe facing", { exact: true }),
      ).toHaveValue("left");
      await pose(page, source, focusFrame, "left");
      assert.deepEqual(await imageHash(canvas(page)), previewAfter);
      upgrade.reopenedCopyPixelsMatchPreview = true;
      await expect(button(page, "Preview updated appearance")).toHaveCount(0);
      report.upgrades.push(upgrade);
      await png(page, character, "updated-copy", source, focusFrame, "left");
      for (const frame of detailFrames)
        await png(page, character, `detail-${defaultStyle}`, source, frame);
      // Exercise actual thumbnail/swatch controls, then restore the preserved daily look.
      const alternate = defaultStyle === "soft-crop" ? "Soft bob" : "Soft crop";
      await button(page, `Choose ${alternate}`).click();
      await ready(page, "Appearance updated");
      const alternateId =
        defaultStyle === "soft-crop" ? "soft-bob" : "soft-crop";
      for (const frame of detailFrames)
        await png(page, character, `detail-${alternateId}`, source, frame);
      await button(page, "Use Copper").click();
      await ready(page, "Appearance updated");
      await png(page, character, "alternate-copper", source, focusFrame);
      await button(
        page,
        `Choose ${defaultStyle === "soft-crop" ? "Soft crop" : "Soft bob"}`,
      ).click();
      await ready(page, "Appearance updated");
      await button(page, "Use Chestnut").click();
      await ready(page, "Appearance updated");
      await screenshot(page, `${character}-appearance-controls-desktop.png`);
    }
    for (const look of ["day", "wedding"]) {
      console.log(`Exporting and reopening ${character} ${look}…`);
      if (look === "wedding") {
        await button(page, "Wedding").click();
        await ready(page, "Wedding selected");
        await appearance(
          page,
          "Hairstyle",
          character === "male" ? "soft-bob" : "soft-crop",
        );
        await appearance(
          page,
          "Hair color",
          character === "male" ? "espresso" : "copper",
        );
      }
      await appearance(page, "Face", "gentle");
      await pose(page, source, focusFrame, "left");
      const project = await download(
        page,
        /Save wardrobe/,
        `${character}-${look}.wardrobe.zip`,
        "project",
      );
      const d = json(project.files["document.json"]);
      await panel(page)
        .getByLabel("Open wardrobe project file", { exact: true })
        .setInputFiles(project.path);
      await ready(page, "Saved outfit and action settings restored");
      assert.equal(sha(project.files["appearance.zip"]), bankSha);
      await expect(
        panel(page).getByLabel("Hairstyle", { exact: true }),
      ).toHaveValue(d.appearance.hairId);
      await expect(
        panel(page).getByLabel("Hair color", { exact: true }),
      ).toHaveValue(d.appearance.hairColor);
      const left = await png(page, character, look, source, focusFrame, "left");
      const right = await png(
        page,
        character,
        look,
        source,
        focusFrame,
        "right",
      );
      await png(page, character, look, source, 104, "right");
      const pack = await download(
        page,
        "Export CharacterPack",
        `${character}-${look}.character.zip`,
        "pack",
      );
      const manifest = verifyPack(pack, source);
      let retained;
      {
        retained = join(output, `${character}-${look}.character.zip`);
        await copyFile(pack.path, retained);
      }
      report.packs.push({
        character,
        look,
        file: retained ? rel(retained) : null,
        capturedPath: pack.path,
        projectPath: project.path,
        projectSha256: sha(project.bytes),
        sha256: sha(pack.bytes),
        retainedSha256: retained ? sha(await readFile(retained)) : null,
        baselinePack: `/tmp/gathria-ear-overlap/baseline/${character}-${look}.character.zip`,
        manifest,
        selection: d.selection,
        appearance: d.appearance,
        mirrorPair: { left: rel(left.path), right: rel(right.path) },
        originalAnimationsPreserved: true,
        sourcePixelScaleUnchanged: true,
        retainedInRepository: true,
      });
      await screenshot(page, `${character}-${look}-workbench.png`);
      await persist();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, `${character}-appearance-controls-mobile.png`);
    await context.close();
  }
  report.editorsClosedAt = new Date().toISOString();
  await persist();
  for (const pack of report.packs) {
    console.log(`Independent playback: ${pack.character} ${pack.look}…`);
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
    await screenshot(page, `${pack.character}-${pack.look}-independent.png`);
    await context.close();
    await persist();
  }
  for (const [path, hash] of Object.entries(report.inputs))
    assert.equal(sha(await readFile(join(root, path))), hash);
  assert.deepEqual(report.errors, []);
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
    "Playback observes published canvas frame positions at 1x. Any missed positions remain in the report; it does not prove every browser paint occurred. Native CharacterPack timing is independently preserved; GIF rounds to centiseconds.";
  await persist();
  console.log(
    JSON.stringify({
      passed: true,
      downloads: report.downloads.length,
      packs: report.packs.length,
      playback: report.playback.length,
      report: rel(join(output, "evidence-index.json")),
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
