// Production-browser regression for loading-only changes; no artwork is generated.
// Temporary downloads are verified against the existing fit-polish delivery, so
// byte-identical packs need not be committed a second time. Each run is immutable.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    assert(
      arg.startsWith("--") && arg.includes("="),
      "Use --key=value arguments.",
    );
    const split = arg.indexOf("=");
    return [arg.slice(2, split), arg.slice(split + 1)];
  }),
);
assert(args.build, "Pass --build=/absolute/production/output.");
const build = resolve(args.build);
const output = resolve(
  args.output ?? join(root, "docs/kling-wardrobe/loading-reuse/exports"),
);
const temporary = resolve(
  args.downloads ?? "/tmp/kling-loading-reuse/downloads",
);
const baseline = join(root, "docs/kling-wardrobe/fit-polish/exports");
const reportPath = join(output, "evidence.json");
for (const path of [reportPath, join(temporary, "male-day.character.zip")]) {
  try {
    await access(path);
    throw Error(`Preserve previous evidence: ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
await mkdir(output, { recursive: true });
await mkdir(temporary, { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).split(sep).join("/");
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const catalog = parse(
  await readFile(join(root, "docs/kling-wardrobe/catalog.json")),
);
const report = {
  format: "gathria-wardrobe-loading-export-regression",
  version: 1,
  startedAt: new Date().toISOString(),
  productionBuild: build,
  commitAtCapture: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  scope:
    "Four real production UI presets, save/reopen, unchanged raw atlas RGBA and metadata, mixed outfit PNGs, and five actions in both directions after closing the editor. No new artwork or visual acceptance is claimed.",
  limits:
    "Functional capture, not a performance benchmark. Frame observations report missed positions and scheduling gaps rather than assuming every display refresh was observed.",
  temporaryDownloads: temporary,
  harnessSha256: sha(await readFile(fileURLToPath(import.meta.url))),
  buildFiles: [],
  projects: [],
  packs: [],
  mixed: [],
  sessions: [],
  screenshots: [],
  playback: [],
  errors: [],
  forbiddenIndependentRequests: [],
  externalRequests: [],
  passed: false,
};
async function inventory(dir, parent = "") {
  const list = [];
  for (const item of await readdir(join(dir, parent), {
    withFileTypes: true,
  })) {
    const file = join(parent, item.name);
    if (item.isDirectory()) list.push(...(await inventory(dir, file)));
    else if (/\.(html|js|css)$/.test(file)) {
      const bytes = await readFile(join(dir, file));
      list.push({
        file: file.split(sep).join("/"),
        bytes: bytes.length,
        sha256: sha(bytes),
      });
    }
  }
  return list.sort((a, b) => a.file.localeCompare(b.file));
}
report.buildFiles = await inventory(build);
assert(report.buildFiles.some(({ file }) => file === "workbench.html"));
const persist = () =>
  writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".zip": "application/zip",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }
  const path = resolve(
    build,
    "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname),
  );
  if (!path.startsWith(build + sep)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const bytes = await readFile(path);
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Length": bytes.length,
    });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const panel = (page) => page.locator("#wardrobe-panel");
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: typeof name === "string" });
const cap = (value) => value[0].toUpperCase() + value.slice(1);
const labels = {
  top: "Top",
  bottom: "Bottom",
  fullBody: "Dress / one-piece",
  shoes: "Shoes",
};
function monitor(context, independent = false) {
  context.on("page", (page) => {
    page.on("pageerror", (error) =>
      report.errors.push({ kind: "pageerror", message: error.message }),
    );
    page.on("console", (message) => {
      if (message.type() === "error")
        report.errors.push({ kind: "console", message: message.text() });
    });
  });
  context.on("response", (response) => {
    if (response.status() >= 400)
      report.errors.push({
        kind: "http",
        url: response.url(),
        status: response.status(),
      });
  });
  context.on("requestfailed", (request) =>
    report.errors.push({
      kind: "requestfailed",
      url: request.url(),
      failure: request.failure(),
    }),
  );
  context.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin + "/"))
      report.externalRequests.push(url);
    if (
      independent &&
      /WardrobeEditor|SpriteActionEditor|skinStudio|\/src\/(wardrobe|skeletal)\//.test(
        url,
      )
    )
      report.forbiddenIndependentRequests.push(url);
  });
}
async function ready(page, text) {
  await page.waitForFunction(
    (text) => {
      const panel = document.querySelector("#wardrobe-panel");
      return (
        panel?.querySelector('[role="alert"]') ||
        (panel?.querySelector('[role="status"]')?.textContent.includes(text) &&
          panel
            ?.querySelector(".wardrobe-editor")
            ?.getAttribute("aria-busy") === "false")
      );
    },
    text,
    { timeout: 240000 },
  );
  assert.deepEqual(await panel(page).getByRole("alert").allTextContents(), []);
  await expect(panel(page).getByRole("status")).toContainText(text);
}
async function selection(page, expected) {
  for (const [slot, label] of Object.entries(labels))
    await expect(panel(page).getByLabel(label, { exact: true })).toHaveValue(
      expected[slot] ?? "",
    );
}
async function pose(page, mode, action, facing, position = 0) {
  const paused = button(
    page,
    mode === "wardrobe" ? "Pause wardrobe animation" : "Pause animation",
  );
  if (await paused.count()) await paused.click();
  if (mode === "wardrobe") {
    await panel(page)
      .getByLabel("Wardrobe action", { exact: true })
      .selectOption(action);
    await panel(page)
      .getByLabel("Wardrobe facing", { exact: true })
      .selectOption(facing);
    await panel(page)
      .getByLabel("Wardrobe frame", { exact: true })
      .fill(String(position));
  } else {
    await button(page, cap(action)).click();
    await button(page, cap(facing)).click();
    await expect(button(page, cap(facing))).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
    await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
    await page.locator("#player-frame").fill(String(position));
  }
  const canvas = page.getByTestId(
    mode === "wardrobe" ? "wardrobe-preview" : "consumer-canvas",
  );
  await expect(canvas).toHaveAttribute(
    mode === "wardrobe" ? "data-rendered-action" : "data-action",
    action,
  );
  await expect(canvas).toHaveAttribute("data-frame-position", String(position));
  if (mode === "wardrobe")
    await expect(canvas).toHaveAttribute("data-facing", facing);
  else
    await expect(canvas).toHaveAttribute(
      "aria-label",
      new RegExp(`facing ${facing},`),
    );
}
async function previewSnapshot(page) {
  return page.getByTestId("wardrobe-preview").evaluate(async (canvas) => {
    const rgba = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest("SHA-256", rgba);
    return {
      width: canvas.width,
      height: canvas.height,
      frameId: canvas.dataset.renderedFrameId,
      action: canvas.dataset.renderedAction,
      facing: canvas.dataset.facing,
      rgbaSha256: [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
    };
  });
}

async function download(page, label, name) {
  const pending = page.waitForEvent("download", { timeout: 240000 });
  await button(panel(page), label).click();
  const downloaded = await pending;
  const path = join(temporary, name);
  await downloaded.saveAs(path);
  assert.equal(await downloaded.failure(), null);
  const bytes = await readFile(path);
  assert(bytes.length > 0);
  return { path, bytes, sha256: sha(bytes) };
}
function python(source, ...args) {
  return JSON.parse(
    execFileSync("python3", ["-c", source, ...args], {
      encoding: "utf8",
      timeout: 240000,
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
}
function comparePacks(actual, expected) {
  return python(
    String.raw`
import hashlib,io,json,struct,sys,zipfile
from PIL import Image
sha=lambda b:hashlib.sha256(b).hexdigest()
def profiles(data):
 out=[];p=8
 while p<len(data):
  n=struct.unpack('>I',data[p:p+4])[0];typ=data[p+4:p+8]
  if typ in [b'sRGB',b'gAMA',b'cHRM',b'iCCP']:out.append((typ.decode(),sha(data[p:p+n+12])))
  p+=n+12
 return out
with zipfile.ZipFile(sys.argv[1]) as a,zipfile.ZipFile(sys.argv[2]) as b:
 assert a.testzip() is None and b.testzip() is None
 assert sorted(a.namelist())==sorted(b.namelist())
 m=json.loads(a.read('manifest.json'));assert m==json.loads(b.read('manifest.json'))
 assert json.loads(a.read('character.json'))==json.loads(b.read('character.json'))
 pages=[]
 for s in [m['spritesheet'],*m.get('additionalSheets',[])]:
  x=a.read(s['file']);y=b.read(s['file']);assert x and y
  ia=Image.open(io.BytesIO(x));ib=Image.open(io.BytesIO(y));ia.load();ib.load()
  assert ia.mode==ib.mode=='RGBA' and ia.size==ib.size==(s['width'],s['height'])
  pa=ia.tobytes();pb=ib.tobytes();assert pa==pb
  assert profiles(x)==profiles(y)
  pages.append({'file':s['file'],'width':ia.width,'height':ia.height,'rgbaBytes':len(pa),'rgbaSha256':sha(pa),'pngSha256':sha(x),'baselinePngSha256':sha(y),'profiles':profiles(x),'transparentPixels':pa[3::4].count(0),'partiallyTransparentPixels':len(pa)//4-pa[3::4].count(0)-pa[3::4].count(255),'rawRgbaEqual':True})
 for n in a.namelist():
  if not n.endswith('.png'):assert a.read(n)==b.read(n)
 print(json.dumps({'zipCrcChecked':True,'fullMetadataEqual':True,'frameCount':len(m['frames']),'animations':m['animations'],'anchor':m['anchor'],'pages':pages,'members':sorted(a.namelist())}))
`,
    actual,
    expected,
  );
}
function verifyProject(path, character, expected) {
  return python(
    String.raw`
import hashlib,io,json,sys,zipfile
root,path,character=sys.argv[1:4]; expected=json.loads(sys.argv[4]);sha=lambda b:hashlib.sha256(b).hexdigest()
catalog=json.load(open(root+'/docs/kling-wardrobe/catalog.json'))
entry=next(c for c in catalog['characters'] if c['key']==character)
with zipfile.ZipFile(path) as z:
 assert z.testzip() is None
 d=json.loads(z.read('document.json'));assert d['selection']==expected and d['preview']=={'action':'run','facing':'left'}
 for name,url,field in [('source.character.zip',entry['sourceUrl'],'sourceSha256'),('registration.json',entry['registrationUrl'],'registrationSha256')]:
  data=z.read(name);assert data==open(root+url,'rb').read() and sha(data)==d[field]
 for i,item in enumerate(d['items']):
  data=z.read('item-'+str(i)+'.zip');url=next(v['url'] for v in entry['items'] if v['id']==item['id'])
  assert data==open(root+url,'rb').read() and sha(data)==item['sha256']
  with zipfile.ZipFile(io.BytesIO(data)) as inner:assert inner.testzip() is None
 print(json.dumps({'zipCrcChecked':True,'sourceBytesEqual':True,'registrationBytesEqual':True,'garmentBytesEqual':True,'selection':d['selection'],'preview':d['preview'],'inventoryCount':len(d['items'])}))
`,
    root,
    path,
    character,
    JSON.stringify(expected),
  );
}
function comparePng(actual, expected) {
  return python(
    String.raw`
import hashlib,json,sys
from PIL import Image
x=Image.open(sys.argv[1]);y=Image.open(sys.argv[2]);x.load();y.load()
assert x.mode==y.mode=='RGBA' and x.size==y.size and x.tobytes()==y.tobytes()
print(json.dumps({'width':x.width,'height':x.height,'rgbaSha256':hashlib.sha256(x.tobytes()).hexdigest(),'rawRgbaEqual':True}))
`,
    actual,
    expected,
  );
}
async function screenshot(scope, name) {
  const path = join(output, name);
  await scope.screenshot({ path });
  const decoded = python(
    "from PIL import Image;import sys,json;im=Image.open(sys.argv[1]);im.load();assert im.width>0 and im.height>0;print(json.dumps({'width':im.width,'height':im.height,'decoded':True}))",
    path,
  );
  const bytes = await readFile(path);
  report.screenshots.push({
    file: rel(path),
    bytes: bytes.length,
    sha256: sha(bytes),
    ...decoded,
  });
}
async function observePlayback(
  page,
  character,
  look,
  manifest,
  action,
  facing,
) {
  await pose(page, "independent", action, facing);
  const clip = manifest.animations[action];
  const durationMs = Math.ceil(
    ((clip.frames.length * 1000) / clip.fps) * (clip.loop ? 2.1 : 1) + 200,
  );
  const observations = await page.evaluate(async (durationMs) => {
    const canvas = document.querySelector('[data-testid="consumer-canvas"]');
    const entries = [];
    let previous = "";
    const start = performance.now();
    const capture = () => {
      const next = {
        action: canvas.dataset.action,
        frameId: Number(canvas.dataset.frameId),
        position: Number(canvas.dataset.framePosition),
        elapsedMs: Number(canvas.dataset.elapsedMs),
        atMs: performance.now() - start,
      };
      const key = `${next.action}/${next.position}`;
      if (key !== previous) {
        entries.push(next);
        previous = key;
      }
    };
    const observer = new MutationObserver(capture);
    observer.observe(canvas, { attributes: true });
    capture();
    document.querySelector('button[aria-label="Play animation"]').click();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    capture();
    observer.disconnect();
    document.querySelector('button[aria-label="Pause animation"]')?.click();
    return entries;
  }, durationMs);
  for (const sample of observations)
    assert.equal(
      sample.frameId,
      manifest.animations[sample.action]?.frames[sample.position],
    );
  const selected = observations.filter((sample) => sample.action === action);
  const positions = [
    ...new Set(selected.map((sample) => sample.position)),
  ].sort((a, b) => a - b);
  const wraps = selected.reduce(
    (n, sample, i) =>
      n + (i > 0 && sample.position < selected[i - 1].position ? 1 : 0),
    0,
  );
  assert(positions.length >= 3, "Animation must advance beyond a still.");
  if (clip.loop) assert(wraps >= 1, "Loop must cross its final frame.");
  else
    assert(
      observations.some((sample) => sample.action === "idle"),
      "Jump must land and return to Idle.",
    );
  report.playback.push({
    character,
    look,
    action,
    facing,
    fps: clip.fps,
    loop: clip.loop,
    durationMs,
    wraps,
    positions,
    missingPositions: clip.frames
      .map((_, i) => i)
      .filter((i) => !positions.includes(i)),
    observations,
  });
}
async function auditMeasuredRevisits() {
  const path = resolve(
    args.benchmark ??
      join(root, "docs/kling-wardrobe/loading-reuse/browser-comparison.json"),
  );
  const bytes = await readFile(path);
  const benchmark = parse(bytes);
  assert.equal(
    benchmark.passed,
    true,
    "Finish isolated timings before functional capture.",
  );
  const revisits = [];
  for (const run of benchmark.runs) {
    const known = new Set(
      Object.values(benchmark.builds[run.label].assetPaths),
    );
    const first = run.looks.find((look) => look.look === "day");
    const revisit = run.looks.find((look) => look.look === "day-revisit");
    assert(first && revisit);
    const repeatedTransfers = run.resources.filter(
      (resource) =>
        known.has(resource.pathname) &&
        resource.start >= revisit.clickAt &&
        resource.start <= revisit.readyAt,
    );
    assert.deepEqual(
      repeatedTransfers,
      [],
      "Revisit must not fetch any catalog asset again.",
    );
    assert.deepEqual(
      revisit.preview,
      first.preview,
      "Revisited appearance differs from its first painted canvas.",
    );
    assert.deepEqual(revisit.selection, first.selection);
    revisits.push({
      label: run.label,
      round: run.round,
      character: run.character,
      examinedResourceCount: run.resources.length,
      knownCatalogPaths: known.size,
      clickAt: revisit.clickAt,
      readyAt: revisit.readyAt,
      catalogTransfers: repeatedTransfers,
      exactFirstUseCanvasAndSelection: true,
      preview: revisit.preview,
    });
  }
  assert.equal(revisits.length, 8);
  report.benchmarkRevisitAudit = {
    report: rel(path),
    sha256: sha(bytes),
    method:
      "Examines every recorded Resource Timing entry against every catalog asset path, independently of the benchmark's expected-transfer subset.",
    revisits,
  };
}

let browser;
try {
  await auditMeasuredRevisits();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  report.chromiumVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  context.setDefaultTimeout(30000);
  monitor(context);
  const page = await context.newPage();
  const packCases = [];
  const sessionSnapshots = {};
  for (const character of ["male", "female"]) {
    const entry = catalog.characters.find((entry) => entry.key === character);
    if (character === "male") {
      await page.goto(`${origin}/workbench.html?character=male&mode=wardrobe`);
    } else {
      await panel(page)
        .getByLabel("Wardrobe character", { exact: true })
        .selectOption(character);
    }
    await ready(page, "Original outfit.");
    for (const look of ["day", "wedding"]) {
      const preset = entry.presets.find((preset) => preset.id === look);
      console.log(`Actual UI: ${character} ${look}.`);
      await button(panel(page), preset.name).click();
      await ready(page, `${preset.name} selected`);
      await selection(page, preset.selection);
      await pose(page, "wardrobe", "idle", "right");
      await screenshot(
        page.locator(".wardrobe-editor"),
        `${character}-${look}-workbench.png`,
      );
      await pose(page, "wardrobe", "run", "left");
      const saved = await download(
        page,
        /Save wardrobe/,
        `${character}-${look}.wardrobe.zip`,
      );
      const checked = verifyProject(saved.path, character, preset.selection);
      await button(panel(page), "Original").click();
      await ready(page, "Original outfit selected");
      await panel(page)
        .getByLabel("Open wardrobe project file", { exact: true })
        .setInputFiles(saved.path);
      await ready(page, "Saved outfit and action settings restored");
      await selection(page, preset.selection);
      await expect(
        panel(page).getByLabel("Wardrobe action", { exact: true }),
      ).toHaveValue("run");
      await expect(
        panel(page).getByLabel("Wardrobe facing", { exact: true }),
      ).toHaveValue("left");
      report.projects.push({
        character,
        look,
        temporaryFile: saved.path,
        bytes: saved.bytes.length,
        sha256: saved.sha256,
        reopened: true,
        ...checked,
      });
      const exported = await download(
        page,
        "Export CharacterPack",
        `${character}-${look}.character.zip`,
      );
      const previous = join(baseline, `${character}-${look}.character.zip`);
      const audit = comparePacks(exported.path, previous);
      const oldBytes = await readFile(previous);
      report.packs.push({
        character,
        look,
        temporaryFile: exported.path,
        bytes: exported.bytes.length,
        sha256: exported.sha256,
        retainedBaselineFile: rel(previous),
        baselineSha256: sha(oldBytes),
        wholeZipEqual: exported.bytes.equals(oldBytes),
        ...audit,
      });
      const metadata = unzipSync(new Uint8Array(exported.bytes), {
        filter: ({ name }) => name === "manifest.json",
      });
      const manifest = parse(metadata["manifest.json"]);
      packCases.push({ character, look, path: exported.path, manifest });
      if (character === "male") {
        const other = entry.presets.find(
          (p) => p.id === (look === "day" ? "wedding" : "day"),
        );
        const mixed = {
          ...preset.selection,
          bottom: other.selection.bottom,
          shoes: look === "day" ? "brown-shoes" : null,
        };
        for (const slot of ["bottom", "shoes"]) {
          await panel(page)
            .getByLabel(labels[slot], { exact: true })
            .selectOption(mixed[slot] ?? "");
          await ready(page, "Outfit updated");
        }
        await selection(page, mixed);
        for (const frameId of [58, 74, 104]) {
          const [action, clip] = Object.entries(manifest.animations).find(
            ([, clip]) => clip.frames.includes(frameId),
          );
          await pose(
            page,
            "wardrobe",
            action,
            "right",
            clip.frames.indexOf(frameId),
          );
          const name = `male-${look}-mixed-frame-${frameId}.png`;
          const png = await download(page, "Save current PNG", name);
          report.mixed.push({
            character,
            look,
            frameId,
            selection: mixed,
            baselineFile: rel(join(baseline, name)),
            pngSha256: png.sha256,
            ...comparePng(png.path, join(baseline, name)),
          });
        }
      }
      await persist();
    }
    const wedding = entry.presets.find((preset) => preset.id === "wedding");
    await button(panel(page), wedding.name).click();
    await ready(page, `${wedding.name} selected`);
    await selection(page, wedding.selection);
    await pose(page, "wardrobe", "idle", "right");
    sessionSnapshots[character] = await previewSnapshot(page);
  }
  // Both original atlas pairs cannot remain in the bounded cache together.
  // Return to each existing session and prove eviction does not change the view.
  for (const character of ["male", "female"]) {
    await panel(page)
      .getByLabel("Wardrobe character", { exact: true })
      .selectOption(character);
    await ready(page, "Restored this character");
    const preset = catalog.characters
      .find((entry) => entry.key === character)
      .presets.find((p) => p.id === "wedding");
    await selection(page, preset.selection);
    await pose(page, "wardrobe", "idle", "right");
    const restored = await previewSnapshot(page);
    assert.deepEqual(restored, sessionSnapshots[character]);
    report.sessions.push({
      character,
      selection: preset.selection,
      preview: restored,
      exactRestoredCanvas: true,
    });
    await persist();
  }
  await context.close();
  report.editorClosedAt = new Date().toISOString();
  assert.equal(browser.contexts().length, 0);
  report.independentStartedAt = new Date().toISOString();
  for (const item of packCases) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
    });
    context.setDefaultTimeout(30000);
    monitor(context, true);
    const page = await context.newPage();
    await page.goto(`${origin}/player.html`);
    await page.locator("#player-zip").setInputFiles(item.path);
    await expect(page.getByRole("status")).toContainText("Loaded:", {
      timeout: 180000,
    });
    await expect(
      page.getByRole("region", { name: "Sprite action editor" }),
    ).toHaveCount(0);
    for (const action of ["idle", "walk", "run", "jump", "celebrate"])
      for (const facing of ["right", "left"]) {
        await observePlayback(
          page,
          item.character,
          item.look,
          item.manifest,
          action,
          facing,
        );
        await persist();
      }
    await pose(page, "independent", "run", "left", 4);
    await screenshot(
      page.locator(".player-preview-panel"),
      `${item.character}-${item.look}-independent.png`,
    );
    await context.close();
    await persist();
  }
  assert.equal(report.projects.length, 4);
  assert.equal(report.packs.length, 4);
  assert.equal(
    report.packs.reduce((n, pack) => n + pack.pages.length, 0),
    8,
  );
  assert.equal(report.sessions.length, 2);
  assert.equal(report.mixed.length, 6);
  assert.equal(report.screenshots.length, 8);
  assert.equal(report.playback.length, 40);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert.deepEqual(
    await inventory(build),
    report.buildFiles,
    "Production build changed during capture.",
  );
  report.passed = true;
  report.finishedAt = new Date().toISOString();
  await persist();
  console.log(
    `Verified 4 UI exports, 8 exact RGBA pages, 6 mixed PNGs and 40 standalone playback cases: ${reportPath}`,
  );
} catch (error) {
  report.failure = error.stack ?? String(error);
  report.finishedAt = new Date().toISOString();
  await persist();
  throw error;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
