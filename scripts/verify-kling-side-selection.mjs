// Verify independently uploaded side-view candidates using the existing player.
// This script never changes artwork, timing, defaults, or application code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const phase = process.env.EVIDENCE_PHASE || "browser";
assert(/^[a-z0-9-]+$/.test(phase), "Use one safe evidence directory name.");
const output = join(root, "docs/kling-side-selection", phase);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const title = (value) => value[0].toUpperCase() + value.slice(1);
const button = (page, name) => page.getByRole("button", { name, exact: true });
const canvas = (page) => page.getByTestId("consumer-canvas");
const files = Object.fromEntries(
  await Promise.all(
    ["male", "female"].map(async (character) => {
      const path = join(
        root,
        `docs/kling-side-selection/exports/${character}.character.zip`,
      );
      assert(existsSync(path), `Build both candidate packs first: ${path}`);
      const bytes = await readFile(path);
      const entries = unzipSync(bytes);
      const manifest = JSON.parse(
        Buffer.from(entries["manifest.json"]).toString(),
      );
      const recipe = JSON.parse(
        Buffer.from(entries["character.json"]).toString(),
      );
      assert([2, 3].includes(manifest.schemaVersion));
      assert.equal(manifest.spritesheet.frameWidth, 512);
      assert.equal(manifest.spritesheet.frameHeight, 768);
      assert.equal(manifest.scale.pixelArt, false);
      assert.equal(manifest.capabilities.editableAppearance, false);
      assert.equal(manifest.facing.native, "right");
      assert.equal(manifest.facing.left, "mirror-x");
      assert.equal(manifest.animations.jump.loop, false);
      for (const action of actions) {
        const clip = manifest.animations[action];
        assert(clip, `${character} is missing ${action}.`);
        assert.equal(clip.fps, 24);
        assert(
          clip.frames.length > 1,
          `${character}/${action} needs actual motion.`,
        );
        assert(
          clip.frames.length / clip.fps <= 10,
          "Bound each verification clip.",
        );
      }
      return [character, { path, bytes, entries, manifest, recipe }];
    }),
  ),
);
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Preserve old evidence; use a fresh EVIDENCE_PHASE instead of overwriting.",
);
const temporary = await mkdtemp(join(tmpdir(), "kling-side-player-"));
const runtimePaths = execFileSync(
  "git",
  ["ls-files", "--", "src", "*.html", "vite.config.ts"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const runtimeHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      runtimePaths.map(async (p) => [p, sha(await readFile(join(root, p)))]),
    ),
  );
const report = {
  format: "gathria-kling-side-selection-browser-evidence",
  version: 1,
  passed: false,
  startedAt: new Date().toISOString(),
  scope:
    "Real player file uploads and unchanged UI downloads, fresh independent contexts, five actions in both directions at 1x playback speed. Loop checks require two adjacent fully observed cycles within four; one-shots must hold their final frame. Technical checks are not visual acceptance or proof of a seamless artistic transition.",
  runtimeInputHashes: await runtimeHashes(),
  candidatePacks: Object.entries(files).map(([character, input]) => ({
    character,
    sha256: sha(input.bytes),
    bytes: input.bytes.length,
    schemaVersion: input.manifest.schemaVersion,
    dimensions: [512, 768],
    anchor: input.manifest.anchor,
    animations: input.manifest.animations,
  })),
  importsAndExports: [],
  playbackCases: [],
  screenshots: [],
  mirrorChecks: [],
  pageErrors: [],
  failedRequests: [],
  externalRequests: [],
  forbiddenEditorRequests: [],
};
let browser;
let server;
let origin;
let error;

function monitor(context) {
  context.on("page", (page) => {
    page.on("pageerror", (e) => report.pageErrors.push(e.message));
    page.on("requestfailed", (request) =>
      report.failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText,
      }),
    );
  });
  context.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin))
      report.externalRequests.push(url);
    if (/SpriteActionEditor|\/src\/skeletal\/|\/workbench\.html/.test(url))
      report.forbiddenEditorRequests.push(url);
  });
}

async function pause(page) {
  const active = button(page, "Pause animation");
  if (await active.count()) await active.click();
}

async function screenshot(page, file) {
  const path = join(output, file);
  await page.locator(".player-preview-panel").screenshot({ path });
  report.screenshots.push({
    file,
    sha256: sha(await readFile(path)),
    source: "Actual player UI",
  });
}

async function openPack(context, path, name) {
  const page = await context.newPage();
  await page.goto(`${origin}/player.html`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.locator("#player-zip").setInputFiles(path);
  await expect(page.locator(".player-status")).toHaveText(`Loaded: ${name}`, {
    timeout: 60000,
  });
  await expect(page.locator(".player-error")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Sprite action editor" }),
  ).toHaveCount(0);
  await pause(page);
  await page.getByLabel("Playback speed", { exact: true }).selectOption("1");
  await page.getByLabel("Display scale", { exact: true }).selectOption("0.5");
  return page;
}

async function downloadPack(page, filename) {
  const pending = page.waitForEvent("download", { timeout: 15000 });
  await button(page, "Export selected CharacterPack").click();
  const path = join(temporary, filename);
  await (await pending).saveAs(path);
  return { path, bytes: await readFile(path) };
}

function inspectDecodedPack(path) {
  return JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        `import hashlib,io,json,sys,zipfile
from PIL import Image
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 m=json.loads(z.read('manifest.json')); c=json.loads(z.read('character.json'))
 sheets=[m['spritesheet']]+m.get('additionalSheets',[])
 pages=[]; members=[]; checks=[]
 for name in z.namelist():
  b=z.read(name);assert b
  members.append({'file':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
 for s in sheets:
  im=Image.open(io.BytesIO(z.read(s['file'])));im.load()
  assert im.mode=='RGBA' and list(im.size)==[s['width'],s['height']]
  pages.append(im)
 for f in m['frames']:
  im=pages[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height']))
  a=im.getchannel('A');assert a.getbbox() and a.getextrema()==(0,255)
  assert not a.crop((0,0,im.width,1)).getbbox()
  assert not a.crop((0,im.height-1,im.width,im.height)).getbbox()
  assert not a.crop((0,0,1,im.height)).getbbox()
  assert not a.crop((im.width-1,0,im.width,im.height)).getbbox()
  checks.append({'frameId':f['id'],'rgbaSha256':hashlib.sha256(im.tobytes()).hexdigest(),'alphaBounds':list(a.getbbox())})
 assert {f['id'] for f in m['frames']}=={f['frameId'] for f in c['derivation']['frames']}
 print(json.dumps({'crcChecked':True,'pngsDecoded':len(pages),'members':members,'frames':checks}))
`,
        path,
      ],
      { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
    ),
  );
}

async function prepareAction(page, action, facing, clip) {
  await pause(page);
  await button(page, title(action)).click();
  await button(page, title(facing)).click();
  // Choosing an action after a completed one-shot intentionally starts playback.
  // Pause after that transition, then change the range value before resetting:
  // filling its existing value (0) does not reliably fire React's onChange.
  await pause(page);
  const scrubber = page.locator("#player-frame");
  await scrubber.fill("1");
  await expect(canvas(page)).toHaveAttribute("data-frame-position", "1");
  await scrubber.fill("0");
  await expect(button(page, "Play animation")).toBeVisible();
  await expect(button(page, "Pause animation")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-frame-position", "0");
  await expect(canvas(page)).toHaveAttribute(
    "data-frame-id",
    String(clip.frames[0]),
  );
  await expect(canvas(page)).toHaveAttribute(
    "aria-label",
    new RegExp(`${action}, facing ${facing}`),
  );
  await expect(page.locator(".player-timing")).toHaveText(
    `${clip.fps} FPS · ${clip.loop ? "LOOP" : "ONCE"}`,
  );
  await expect(page.getByLabel("Playback speed", { exact: true })).toHaveValue(
    "1",
  );
  await expect(page.getByLabel("Display scale", { exact: true })).toHaveValue(
    "0.5",
  );
}

async function beginObservation(page) {
  await page.evaluate(() => {
    const c = document.querySelector('[data-testid="consumer-canvas"]');
    window.__sideObserver?.disconnect();
    const state = {
      entries: [],
      wraps: 0,
      last: -1,
      started: performance.now(),
    };
    window.__sideObservation = state;
    const observe = () => {
      const position = Number(c.dataset.framePosition);
      if (position === state.last) return;
      if (state.last >= 0 && position < state.last) state.wraps++;
      state.last = position;
      state.entries.push({
        position,
        frameId: Number(c.dataset.frameId),
        page: Number(c.dataset.framePage),
        action: c.dataset.action,
        engineMs: Number(c.dataset.elapsedMs),
        wallMs: performance.now() - state.started,
        cycle: state.wraps,
      });
    };
    window.__sideObserver = new MutationObserver(observe);
    window.__sideObserver.observe(c, {
      attributes: true,
      attributeFilter: ["data-frame-position", "data-frame-id"],
    });
    observe();
  });
  await button(page, "Play animation").click();
}

async function stopObservation(page) {
  await pause(page);
  return page.evaluate(() => {
    window.__sideObserver.disconnect();
    return window.__sideObservation;
  });
}

function verifyObservedEntries(observation, action, clip, manifest) {
  const ids = new Map(manifest.frames.map((frame) => [frame.id, frame]));
  for (const entry of observation.entries) {
    assert.equal(entry.action, action);
    assert.equal(entry.frameId, clip.frames[entry.position]);
    assert.equal(entry.page, ids.get(entry.frameId).page ?? 0);
    const tick = Math.floor((Math.max(0, entry.engineMs) * clip.fps) / 1000);
    assert.equal(
      entry.position,
      clip.loop
        ? tick % clip.frames.length
        : Math.min(tick, clip.frames.length - 1),
    );
  }
}

async function captureCanvas(page, filename) {
  const value = await canvas(page).evaluate((c) => ({
    png: c.toDataURL("image/png"),
    width: c.width,
    height: c.height,
  }));
  await writeFile(
    join(output, filename),
    Buffer.from(value.png.split(",")[1], "base64"),
  );
  return {
    file: filename,
    width: value.width,
    height: value.height,
    sha256: sha(await readFile(join(output, filename))),
  };
}

async function verifyAction(page, character, action, facing, manifest) {
  const clip = manifest.animations[action];
  await prepareAction(page, action, facing, clip);
  const firstCanvas = await captureCanvas(
    page,
    `${character}-${action}-${facing}-first.png`,
  );
  const expectedMs = (clip.frames.length * 1000) / clip.fps;
  await beginObservation(page);
  let detail;
  if (clip.loop) {
    await page.waitForFunction(
      () => window.__sideObservation.wraps >= 4,
      null,
      { timeout: Math.ceil(expectedMs * 4 + 8000) },
    );
    const observation = await stopObservation(page);
    verifyObservedEntries(observation, action, clip, manifest);
    const coverage = Array.from({ length: 4 }, (_, cycle) => ({
      cycle,
      observedPositions: observation.entries
        .filter((entry) => entry.cycle === cycle)
        .map((entry) => entry.position),
    }));
    const complete = (cycle) =>
      cycle.observedPositions.length === clip.frames.length &&
      cycle.observedPositions.every((position, i) => position === i);
    const pair = coverage.findIndex(
      (cycle, i) => i < 3 && complete(cycle) && complete(coverage[i + 1]),
    );
    assert(
      pair >= 0,
      `${character}/${action}/${facing}: two adjacent fully observed cycles required within four.`,
    );
    const boundaries = observation.entries.filter(
      (entry) => entry.position === 0 && entry.cycle > 0,
    );
    const periods = boundaries
      .slice(1)
      .map((entry, i) => entry.wallMs - boundaries[i].wallMs);
    assert(periods.length >= 2);
    for (const period of periods)
      assert(
        Math.abs(period - expectedMs) < 150,
        `${character}/${action}/${facing}: 1x loop clock mismatch.`,
      );
    detail = {
      loop: true,
      expectedDurationMs: expectedMs,
      observedCycleDurationsMs: periods,
      reviewedCycles: [pair, pair + 1],
      coverage,
      observation,
    };
  } else {
    await expect(button(page, "Replay animation")).toBeVisible({
      timeout: Math.ceil(expectedMs + 8000),
    });
    const observation = await stopObservation(page);
    verifyObservedEntries(observation, action, clip, manifest);
    assert.equal(observation.wraps, 0);
    assert.deepEqual(
      observation.entries.map((entry) => entry.position),
      Array.from({ length: clip.frames.length }, (_, i) => i),
      `${character}/${action}/${facing}: every one-shot tick must be observed.`,
    );
    await expect(canvas(page)).toHaveAttribute(
      "data-frame-id",
      String(clip.frames.at(-1)),
    );
    await expect(canvas(page)).toHaveAttribute(
      "data-frame-position",
      String(clip.frames.length - 1),
    );
    await expect(page.locator("#player-one-shot-note")).toContainText(
      "Holding the final frame",
    );
    const held = await canvas(page).evaluate((c) => ({
      png: c.toDataURL("image/png"),
      elapsed: Number(c.dataset.elapsedMs),
    }));
    assert(held.elapsed >= expectedMs && held.elapsed < expectedMs + 250);
    await page.waitForTimeout(250);
    assert.equal(
      await canvas(page).evaluate((c) => c.toDataURL("image/png")),
      held.png,
      "Completed one-shot must retain its last pixels.",
    );
    detail = {
      loop: false,
      expectedDurationMs: expectedMs,
      finalEngineMs: held.elapsed,
      heldFinalFrameForMs: 250,
      everyTickObserved: true,
      observation,
    };
  }
  report.playbackCases.push({
    character,
    action,
    facing,
    playbackSpeed: 1,
    displayScale: 0.5,
    fps: clip.fps,
    ticks: clip.frames.length,
    firstCanvas,
    ...detail,
  });
  console.log(
    `Verified ${character}/${action}/${facing}: ${clip.frames.length} ticks at original ${clip.fps} fps.`,
  );
}

function verifyMirrors(character, manifest) {
  const path = join(temporary, `${character}-mirror-input.json`);
  return writeFile(
    path,
    JSON.stringify({
      output,
      character,
      actions,
      anchor: manifest.anchor,
      frameHeight: manifest.spritesheet.frameHeight,
    }),
  ).then(() =>
    JSON.parse(
      execFileSync(
        "python",
        [
          "-c",
          `import json,sys,numpy as np
from PIL import Image
from pathlib import Path
r=json.load(open(sys.argv[1]));root=Path(r['output']);records=[]
for action in r['actions']:
 a=np.array(Image.open(root/f"{r['character']}-{action}-right-first.png").convert('RGBA'))
 b=np.array(Image.open(root/f"{r['character']}-{action}-left-first.png").convert('RGBA'))
 assert a.shape==b.shape
 h,w=a.shape[:2];axis=int(w/2+0.5);end=int((h-r['frameHeight']*.5)//2+r['anchor']['y']*.5)-8
 # Ignore the player's horizontal ground guide and anchor cross, not character pixels above them.
 xs=np.arange(w);mx=2*axis-xs-1;valid=(mx>=0)&(mx<w)
 aa=a[:end,mx[valid]].astype(int);bb=b[:end,xs[valid]].astype(int)
 delta=np.abs(aa-bb);assert int(delta.max())<=2, f'{action}: left/right bitmap mismatch'
 assert np.any(aa[:,:,3]>0)
 records.append({'action':action,'checkedRows':end,'maxChannelDifference':int(delta.max()),'meanChannelDifference':float(delta.mean()),'mirrorAxis':axis,'note':'Actual paused UI canvases; anchor/ground-guide rows excluded. Smooth canvas rounding tolerance <=2 channel values.'})
print(json.dumps(records))`,
          path,
        ],
        { encoding: "utf8", timeout: 15000 },
      ),
    ),
  );
}

try {
  server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 0, hmr: false },
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  for (const [character, input] of Object.entries(files)) {
    const firstContext = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    monitor(firstContext);
    const first = await openPack(firstContext, input.path, input.manifest.name);
    await prepareAction(first, "idle", "right", input.manifest.animations.idle);
    const uploadedCanvas = await captureCanvas(
      first,
      `${character}-uploaded-idle-first.png`,
    );
    await screenshot(first, `${character}-uploaded.png`);
    const exported = await downloadPack(first, `${character}-ui.character.zip`);
    assert.equal(
      sha(exported.bytes),
      sha(input.bytes),
      "Actual UI export must preserve the uploaded ZIP byte-for-byte.",
    );
    const exportedFiles = unzipSync(exported.bytes);
    assert.deepEqual(
      JSON.parse(Buffer.from(exportedFiles["manifest.json"]).toString()),
      input.manifest,
    );
    assert.deepEqual(
      JSON.parse(Buffer.from(exportedFiles["character.json"]).toString()),
      input.recipe,
    );
    const decodedExport = inspectDecodedPack(exported.path);
    await firstContext.close();

    // The first context is gone. Only the downloaded ZIP enters this new player.
    const independentContext = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
    });
    monitor(independentContext);
    const independent = await openPack(
      independentContext,
      exported.path,
      input.manifest.name,
    );
    await prepareAction(
      independent,
      "idle",
      "right",
      input.manifest.animations.idle,
    );
    const reopenedCanvas = await captureCanvas(
      independent,
      `${character}-reopened-idle-first.png`,
    );
    assert.equal(
      reopenedCanvas.sha256,
      uploadedCanvas.sha256,
      "Fresh player reimport must display identical pixels for the same paused pose.",
    );
    for (const action of actions)
      for (const facing of ["right", "left"])
        await verifyAction(
          independent,
          character,
          action,
          facing,
          input.manifest,
        );
    report.mirrorChecks.push({
      character,
      actions: await verifyMirrors(character, input.manifest),
    });
    await prepareAction(
      independent,
      "run",
      "right",
      input.manifest.animations.run,
    );
    await screenshot(independent, `${character}-independent-player.png`);
    const finalExport = await downloadPack(
      independent,
      `${character}-reopened.character.zip`,
    );
    assert.equal(sha(finalExport.bytes), sha(input.bytes));
    report.importsAndExports.push({
      character,
      inputSha256: sha(input.bytes),
      uiDownloadSha256: sha(exported.bytes),
      reopenedDownloadSha256: sha(finalExport.bytes),
      firstContextClosedBeforeReimport: true,
      editorOpened: false,
      metadataExact: true,
      archiveBytesExact: true,
      pausedCanvasPixelsExact: true,
      uploadedCanvas,
      reopenedCanvas,
      decodedExport,
    });
    await independentContext.close();
  }
  assert.equal(report.playbackCases.length, 20);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.forbiddenEditorRequests, []);
  assert.deepEqual(
    await runtimeHashes(),
    report.runtimeInputHashes,
    "Application code changed during evidence capture.",
  );
  report.passed = true;
} catch (cause) {
  error = cause;
  report.failure =
    cause instanceof Error
      ? { message: cause.message, stack: cause.stack }
      : { message: String(cause) };
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(
    join(output, "evidence-index.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser?.close();
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
}
if (error) throw error;
console.log(
  `Passed ${report.playbackCases.length} independent action/direction cases. Evidence: ${output}`,
);
