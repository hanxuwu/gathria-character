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
const recheckRun = process.env.EAR_EDGE_RECHECK_RUN;
if (recheckRun) assert(/^[a-z0-9-]+$/.test(recheckRun));
const run = process.env.EAR_EDGE_RUN || (quick ? "quick" : "final");
assert(/^[a-z0-9-]+$/.test(run));
const output = join(
  root,
  "docs/kling-appearance/ear-edge-review/evidence",
  run,
);
await mkdir(join(output, "exports"), { recursive: true });
await mkdir(join(output, "png"), { recursive: true });
assert(
  !existsSync(join(output, "evidence-index.json")),
  "Use a new EAR_EDGE_RUN; previous evidence is retained.",
);
const production = process.env.EAR_EDGE_PRODUCTION === "1";
const port = Number(process.env.EAR_EDGE_PORT || 5181);
const catalog = JSON.parse(
  await readFile(join(root, "docs/kling-wardrobe/catalog.json"), "utf8"),
);
const characters = process.env.EAR_EDGE_CHARACTER
  ? [process.env.EAR_EDGE_CHARACTER]
  : ["male", "female"];
const styles = ["soft-crop", "soft-bob"];
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const quickFrames = process.env.EAR_EDGE_FRAMES
  ? process.env.EAR_EDGE_FRAMES.split(",").map(Number)
  : [0, 51, 86, 87, 88, 104, 105, 107, 109];
assert(quickFrames.length > 0 && quickFrames.every(Number.isInteger));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const json = (b) => JSON.parse(Buffer.from(b).toString("utf8"));
const button = (p, name) => p.getByRole("button", { name, exact: true });
const editor = (p) => p.locator("#wardrobe-panel");
const nativeCanvas = (p) => editor(p).getByTestId("wardrobe-preview");
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);
const report = {
  format: "gathria-kling-ear-edge-browser-evidence",
  version: 1,
  quick,
  production,
  startedAt: new Date().toISOString(),
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "Hair/ear-edge revision: old embedded-bank V2 projects and fresh catalog sessions produce the before/after PNGs. New V2 projects are saved/reopened in /tmp with hashes recorded; four actual baked packs are retained. Original source pixels and timing are checked independently. No visual approval is inferred from functional checks.",
  inputHashes: {},
  downloads: [],
  screenshots: [],
  selections: [],
  projects: [],
  legacyProjects: [],
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
    `docs/kling-appearance/review/evidence/final-${c}/exports/${c}-day.wardrobe.zip`,
    `docs/kling-appearance/review/evidence/final-${c}/exports/${c}-day.character.zip`,
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
  const path =
    kind === "project"
      ? join("/tmp/gathria-ear-edge-projects", run, name)
      : join(output, kind === "png" ? "png" : "exports", name);
  if (kind === "project")
    await mkdir(join("/tmp/gathria-ear-edge-projects", run), {
      recursive: true,
    });
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
    file: kind === "project" ? path : rel(path),
    retainedInRepository: kind !== "project",
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
if (recheckRun) {
  const priorPath = join(
    root,
    "docs/kling-appearance/ear-edge-review/evidence",
    recheckRun,
    "evidence-index.json",
  );
  const priorBytes = await readFile(priorPath);
  const prior = json(priorBytes);
  assert(prior.passed);
  report.playbackRecheckOf = { file: rel(priorPath), sha256: sha(priorBytes) };
  report.recheckRequests = prior.playback
    .filter((p) => p.missingPositions.length)
    .map((p) => ({
      character: p.character,
      style: p.look,
      action: p.action,
      facing: p.facing,
      previousMissingPositions: p.missingPositions,
    }));
  report.packs = prior.packs.filter((p) =>
    report.recheckRequests.some(
      (r) => r.character === p.character && r.style === p.style,
    ),
  );
  report.warmupPlayback = [];
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  if (!recheckRun)
    for (const character of characters) {
      const entry = catalog.characters.find((c) => c.key === character);
      assert(entry);
      const original = unzipSync(
        new Uint8Array(await readFile(join(root, entry.sourceUrl.slice(1)))),
      );
      const manifest = json(original["manifest.json"]);
      const legacyPath = join(
        root,
        `docs/kling-appearance/review/evidence/final-${character}/exports/${character}-day.wardrobe.zip`,
      );
      const legacyBytes = await readFile(legacyPath);
      const legacyFiles = unzipSync(new Uint8Array(legacyBytes));
      const legacyDoc = json(legacyFiles["document.json"]);
      const legacyAppearanceSha = sha(legacyFiles["appearance.zip"]);
      const newBankSha = sha(
        await readFile(
          join(root, `docs/kling-appearance/banks/${character}.zip`),
        ),
      );
      if (!quick)
        assert.notEqual(
          newBankSha,
          legacyAppearanceSha,
          "Fix bank must differ from reviewed baseline.",
        );
      for (const phase of ["before", "after"]) {
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
        if (phase === "before") {
          await editor(page)
            .getByLabel("Open wardrobe project file", { exact: true })
            .setInputFiles(legacyPath);
          await ready(page, "Saved outfit and action settings restored");
        } else {
          const preset = entry.presets.find((p) => p.id === "day");
          await button(page, preset.name).click();
          await ready(page, `${preset.name} selected`);
        }
        for (const style of styles) {
          await selectAppearance(page, "Hairstyle", style);
          await selectAppearance(page, "Face", "gentle");
          await selectAppearance(page, "Hair color", "chestnut");
          for (const fid of quickFrames) {
            if (!manifest.frames.some((f) => f.id === fid)) continue;
            const current = await png(
              page,
              character,
              `${phase}-${style}`,
              manifest,
              fid,
            );
            if (
              phase === "before" &&
              style === legacyDoc.appearance.hairId &&
              fid === 104
            ) {
              const baseline = join(
                root,
                `docs/kling-appearance/review/evidence/final-${character}/png/${character}-day-104-right.png`,
              );
              const checked = JSON.parse(
                execFileSync(
                  "python",
                  [
                    "-c",
                    String.raw`
import json,sys,hashlib
from PIL import Image
images=[Image.open(p).convert('RGBA') for p in sys.argv[1:]]
assert images[0].size==images[1].size and images[0].tobytes()==images[1].tobytes()
print(json.dumps({'rgbaSha256':hashlib.sha256(images[0].tobytes()).hexdigest(),'size':list(images[0].size),'exact':True}))
`,
                    baseline,
                    current.path,
                  ],
                  { encoding: "utf8" },
                ),
              );
              report.legacyProjects.push({
                character,
                file: rel(legacyPath),
                sha256: sha(legacyBytes),
                embeddedAppearanceSha: legacyAppearanceSha,
                baselinePng: rel(baseline),
                reopenedPng: rel(current.path),
                ...checked,
              });
            }
          }
          if (phase === "before" || quick) continue;
          await png(page, character, `after-${style}`, manifest, 86, "left");
          await selectAppearance(page, "Hair color", "espresso");
          await png(page, character, `after-${style}-espresso`, manifest, 86);
          await selectAppearance(page, "Hair color", "chestnut");
          if (style === (character === "male" ? "soft-crop" : "soft-bob")) {
            await pose(page, manifest, 86, "left");
            const saved = await download(
              page,
              /Save wardrobe/,
              `${character}-${style}.wardrobe.zip`,
              "project",
              { character, style, phase },
            );
            const doc = json(saved.files["document.json"]);
            assert.equal(doc.version, 2);
            assert.equal(doc.appearance.hairId, style);
            assert.equal(sha(saved.files["appearance.zip"]), newBankSha);
            await editor(page)
              .getByLabel("Open wardrobe project file", { exact: true })
              .setInputFiles(saved.path);
            await ready(page, "Saved outfit and action settings restored");
            await expect(
              editor(page).getByLabel("Hairstyle", { exact: true }),
            ).toHaveValue(style);
            await expect(
              editor(page).getByLabel("Wardrobe facing", { exact: true }),
            ).toHaveValue("left");
            report.projects.push({
              character,
              style,
              file: saved.path,
              retainedInRepository: false,
              sha256: sha(saved.bytes),
              embeddedAppearanceSha: newBankSha,
              reopened: true,
              appearance: doc.appearance,
              preview: doc.preview,
            });
          }
          const pack = await download(
            page,
            "Export CharacterPack",
            `${character}-${style}.character.zip`,
            "pack",
            { character, style, phase },
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
          report.packs.push({
            character,
            style,
            look: style,
            file: rel(pack.path),
            manifest: pm,
            originalAnimationsPreserved: true,
            sourcePixelScaleUnchanged: true,
          });
          await pose(page, manifest, 86);
          await screenshot(page, `${character}-${style}-workbench.png`);
          await persist();
        }
        await context.close();
      }
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
        for (const facing of ["right", "left"]) {
          if (
            recheckRun &&
            !report.recheckRequests.some(
              (r) =>
                r.character === pack.character &&
                r.style === pack.style &&
                r.action === action &&
                r.facing === facing,
            )
          )
            continue;
          if (recheckRun) {
            await play(
              page,
              pack.manifest,
              pack.character,
              pack.style,
              action,
              facing,
            );
            report.warmupPlayback.push({
              ...report.playback.pop(),
              reason:
                "One observed warmup after loading the independent pack; retained separately from targeted recheck.",
            });
          }
          await play(
            page,
            pack.manifest,
            pack.character,
            pack.style,
            action,
            facing,
          );
        }
      await button(page, "Jump").click();
      await button(page, "Right").click();
      await page.locator("#player-frame").fill("3");
      await screenshot(page, `${pack.character}-${pack.style}-independent.png`);
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
  assert.deepEqual(
    report.failedRequests.filter(
      (r) => new URL(r.url).pathname != "/favicon.ico",
    ),
    [],
  );
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  report.observationLimits =
    "MutationObserver checks published frame positions, not each engine tick. Missing positions and scheduling gaps are recorded. GIF visual review remains separate from technical playback checks.";
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
