// Actual existing-player imports and downloads, then a fresh independent player.
// GIF/contact-sheet rendering is deliberately separate and reads these exports.
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const sourcePath = "artwork/kling-playback/prepared/kling-source.zip";
const output = new URL("docs/kling-playback/", root);
const browserOutput = new URL("browser/", output);
const exportOutput = new URL("exports/", output);
await mkdir(browserOutput, { recursive: true });
await mkdir(exportOutput, { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceBytes = await readFile(new URL(sourcePath, root));
const sourceFiles = unzipSync(sourceBytes);
const sourceManifest = JSON.parse(Buffer.from(sourceFiles["manifest.json"]));
const actions = ["idle", "walk", "run", "celebrate"];
const characters = sourceManifest.characters;
assert.deepEqual(characters, ["male", "female"]);
const title = (value) => value[0].toUpperCase() + value.slice(1);
const implementationPaths = [
  "src/consumer/PackPlayer.tsx",
  "src/consumer/player.ts",
  "src/consumer/player.css",
  "src/core/pack.ts",
  "src/core/pack-v2.ts",
  "src/core/baked-source.ts",
  "src/core/bounded-archive.ts",
  "src/core/types.ts",
  "scripts/generate-kling-evidence.mjs",
];
async function implementationHashes() {
  return Object.fromEntries(
    await Promise.all(
      implementationPaths.map(async (path) => [
        path,
        sha(await readFile(new URL(path, root))),
      ]),
    ),
  );
}
const report = {
  format: "gathria-kling-browser-evidence",
  version: 1,
  startedAt: new Date().toISOString(),
  sourcePath,
  sourceSha256: sha(sourceBytes),
  sourceCanvas: sourceManifest.canvas,
  implementationHashes: await implementationHashes(),
  checks: [],
  downloads: [],
  playback: [],
  screenshots: [],
  independentRequests: [],
  browserErrors: [],
  limitations: [
    "Technical playback and pixel checks do not imply owner visual approval.",
    "Canvas screenshots include browser compositing; exact RGBA fidelity is independently checked by decoding source and exported PNGs with Pillow.",
    "Shared clock preserves each performance's source frame order; it does not force matching male/female limb phases.",
  ],
};
const port = Number(process.env.KLING_EVIDENCE_PORT || 5183);
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const baseURL = `http://127.0.0.1:${port}`;
const manifests = {};
const log = (message) => console.log(new Date().toISOString(), message);
const timeout = 180_000;

function track(page, label) {
  page.on("pageerror", (error) =>
    report.browserErrors.push({ page: label, message: error.message }),
  );
}
async function ready(page, name) {
  await expect(page.getByRole("status")).toContainText(`Loaded: ${name}`, {
    timeout,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("#player-zip")).toBeEnabled();
}
async function pause(page) {
  const button = page.getByRole("button", {
    name: "Pause animation",
    exact: true,
  });
  if (await button.count()) await button.click();
}
async function scrub(page, action, index = 0, facing = "right") {
  await pause(page);
  await page.getByRole("button", { name: title(action), exact: true }).click();
  await page.getByRole("button", { name: title(facing), exact: true }).click();
  await page.locator("#player-frame").fill(String(index));
  await expect(page.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-frame-position",
    String(index),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function shot(page, name, selector = ".player-preview-panel") {
  const path = new URL(`${name}.png`, browserOutput);
  await page.locator(selector).screenshot({ path: fileURLToPath(path) });
  const bytes = await readFile(path);
  report.screenshots.push({
    path: `docs/kling-playback/browser/${name}.png`,
    sha256: sha(bytes),
    bytes: bytes.length,
    source: "Actual existing PackPlayer DOM/canvas screenshot",
  });
}

async function observeCycles(page, id, action, facing, manifest) {
  await scrub(page, action, 0, facing);
  const clip = manifest.animations[action];
  const durationMs = (1000 * clip.frames.length) / clip.fps;
  await page
    .getByRole("button", { name: "Play animation", exact: true })
    .click();
  const observed = await page.evaluate(
    async ({ durationMs }) => {
      const canvas = document.querySelector('[data-testid="consumer-canvas"]');
      const start = performance.now();
      const samples = [];
      let last = -1;
      return await new Promise((resolve) => {
        function sample(now) {
          const position = Number(canvas.getAttribute("data-frame-position"));
          if (position !== last) {
            samples.push({
              ms: Number((now - start).toFixed(3)),
              position,
              frameId: Number(canvas.getAttribute("data-frame-id")),
            });
            last = position;
          }
          if (now - start >= durationMs * 2.25 + 100) resolve(samples);
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
    },
    { durationMs },
  );
  await pause(page);
  assert(observed.length > 2, `${id}/${action}/${facing}: no moving playback`);
  assert(
    observed.every((entry) => entry.frameId === clip.frames[entry.position]),
  );
  const unique = [...new Set(observed.map((entry) => entry.position))];
  const wraps = observed
    .slice(1)
    .filter((entry, i) => entry.position < observed[i].position).length;
  assert(
    wraps >= 1,
    `${id}/${action}/${facing}: loop did not cross its boundary`,
  );
  assert(
    unique.length >= Math.ceil(clip.frames.length * 0.85),
    `${id}/${action}/${facing}: excessive observed frame loss`,
  );
  const cycleStarts = observed.filter((entry) => entry.position === 0);
  const observedCycleDurationsMs = cycleStarts
    .slice(1)
    .map((entry, i) => Number((entry.ms - cycleStarts[i].ms).toFixed(3)));
  // DOM frame-position updates are sampled on the next RAF. Exact selection at
  // boundaries is checked below using the same player frameAtTime implementation.
  report.playback.push({
    character: id,
    action,
    facing,
    context:
      "Fresh standalone player loaded only the UI-exported CharacterPack",
    fps: clip.fps,
    frameCount: clip.frames.length,
    durationMs,
    observedPositions: unique.length,
    observedWraps: wraps,
    observedCycleDurationsMs,
    samples: observed,
  });
}

try {
  const sourceContext = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 1,
  });
  const sourcePage = await sourceContext.newPage();
  track(sourcePage, "source import");
  await sourcePage.goto(`${baseURL}/player.html`);
  log(
    "Importing native original-video source archive through the existing player UI",
  );
  await sourcePage
    .locator("#player-zip")
    .setInputFiles(fileURLToPath(new URL(sourcePath, root)));
  const characterNames = Object.fromEntries(
    characters.map((id) => {
      const meta = JSON.parse(
        Buffer.from(sourceFiles[`characters/${id}/meta.json`]),
      );
      return [id, meta.name || id];
    }),
  );
  await ready(sourcePage, characterNames.male);
  await expect(
    sourcePage.getByRole("button", { name: "Jump", exact: true }),
  ).toBeDisabled();
  for (const id of characters) {
    log(`Exporting ${id} from actual source-import UI`);
    await sourcePage.locator("#player-character").selectOption(id);
    await ready(sourcePage, characterNames[id]);
    await sourcePage.locator("#player-zoom").selectOption("0.5");
    await scrub(sourcePage, "idle");
    await shot(sourcePage, `${id}-source-import`);
    const event = sourcePage.waitForEvent("download");
    await sourcePage
      .getByRole("button", {
        name: "Export selected CharacterPack",
        exact: true,
      })
      .click();
    const download = await event;
    const target = new URL(`${id}.character.zip`, exportOutput);
    await download.saveAs(fileURLToPath(target));
    const bytes = await readFile(target);
    assert(bytes.length > 0);
    const files = unzipSync(bytes);
    assert.deepEqual(
      Object.keys(files).sort(),
      [
        "INTEGRATION.md",
        "PROVENANCE.txt",
        "character.json",
        "manifest.json",
        "spritesheet.png",
      ].sort(),
    );
    const manifest = JSON.parse(Buffer.from(files["manifest.json"]));
    const recipe = JSON.parse(Buffer.from(files["character.json"]));
    assert.equal(manifest.schemaVersion, 2);
    assert.deepEqual(manifest.capabilities, {
      renderMode: "baked",
      editableAppearance: false,
    });
    assert.equal(manifest.spritesheet.frameWidth, sourceManifest.canvas.width);
    assert.equal(
      manifest.spritesheet.frameHeight,
      sourceManifest.canvas.height,
    );
    assert.equal(recipe.characterId, id);
    assert.equal(recipe.source.sha256, report.sourceSha256);
    assert.deepEqual(
      recipe.sourceMetadata.sourceDerivation,
      sourceManifest.derivation,
    );
    for (const action of actions) {
      const expected = sourceManifest.actions[`${action}_loop`];
      const clip = manifest.animations[action];
      assert.equal(clip.frames.length, expected.frames);
      assert.equal(clip.fps, expected.fps);
      assert.equal(clip.loop, true);
      const original = JSON.parse(
        Buffer.from(
          sourceFiles[`characters/${id}/actions/${action}_loop.json`],
        ),
      );
      assert.deepEqual(
        recipe.sourceMetadata.actions[action].frames.map((frame) => [
          frame.sourceFrame,
          frame.timeSeconds,
        ]),
        original.frames.map((frame) => [
          frame.source_video_frame,
          frame.source_time_s,
        ]),
      );
      assert(
        original.frames.every(
          (frame) =>
            frame.anchors.ground.x === manifest.anchor.x &&
            frame.anchors.ground.y === manifest.anchor.y,
        ),
      );
    }
    assert(!("jump" in manifest.animations));
    manifests[id] = manifest;
    report.downloads.push({
      character: id,
      path: `docs/kling-playback/exports/${id}.character.zip`,
      bytes: bytes.length,
      sha256: sha(bytes),
      nativeDimensions: [
        manifest.spritesheet.frameWidth,
        manifest.spritesheet.frameHeight,
      ],
      atlasDimensions: [
        manifest.spritesheet.width,
        manifest.spritesheet.height,
      ],
      source: "Actual Export selected CharacterPack button download",
    });
  }
  await sourcePage.locator("#player-character").selectOption("male");
  await ready(sourcePage, characterNames.male);
  await sourcePage
    .getByLabel("Compare both characters", { exact: true })
    .check();
  await expect(sourcePage.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-comparison",
    "true",
  );
  for (const action of actions) {
    await scrub(sourcePage, action);
    await shot(sourcePage, `pair-${action}`);
  }
  report.checks.push({
    check:
      "Source import, both identities, four actions, shared-clock comparison and native UI export",
    result: "passed",
  });
  await sourceContext.close();
  report.sourceContextClosedAt = new Date().toISOString();

  // Separate context prevents source-state, source atlas or local storage reuse.
  const independent = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 1,
  });
  const forbidden = [];
  independent.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(baseURL))
      report.independentRequests.push(new URL(url).pathname);
  });
  await independent.route(
    /\/(?:src\/(?:editor|skeletal|experiments)\/|src\/core\/(?:generator|illustrated-)|artwork\/kling-playback\/prepared\/)/,
    (route) => {
      forbidden.push(route.request().url());
      return route.abort();
    },
  );
  for (const id of characters) {
    log(`Independent exported-pack playback: ${id}`);
    const page = await independent.newPage();
    track(page, `independent ${id}`);
    await page.goto(`${baseURL}/player.html`);
    await page
      .locator("#player-zip")
      .setInputFiles(
        fileURLToPath(new URL(`${id}.character.zip`, exportOutput)),
      );
    await ready(page, manifests[id].name);
    await expect(page.locator("#player-character")).toHaveCount(0);
    await expect(page.getByTestId("consumer-canvas")).toHaveCSS(
      "image-rendering",
      "auto",
    );
    await page.locator("#player-zoom").selectOption("0.5");
    for (const action of actions) {
      for (const facing of ["right", "left"]) {
        await observeCycles(page, id, action, facing, manifests[id]);
      }
      await scrub(page, action);
      await shot(page, `${id}-independent-${action}`);
    }
    await page.locator("#player-zoom").selectOption("1");
    await scrub(page, "idle");
    await shot(page, `${id}-native-canvas`, '[data-testid="consumer-canvas"]');
    const exactTiming = await page.evaluate(
      async ({ manifest, actions }) => {
        const { frameAtTime } = await import("/src/consumer/player.ts");
        const rows = [];
        for (const action of actions) {
          const clip = manifest.animations[action];
          for (
            let sequence = 0;
            sequence < clip.frames.length * 3;
            sequence++
          ) {
            const elapsed = (sequence * 1000) / clip.fps + 0.00001;
            const actual = frameAtTime(manifest, action, elapsed).id;
            const expected = clip.frames[sequence % clip.frames.length];
            if (actual !== expected)
              throw Error(`${action}: incorrect time-to-frame mapping`);
          }
          rows.push({
            action,
            threeCyclesEntries: clip.frames.length * 3,
            exactFrameTiming: true,
          });
        }
        return rows;
      },
      { manifest: manifests[id], actions },
    );
    report.checks.push({
      character: id,
      check:
        "Exact timing through three cycles using the shared player selector",
      result: "passed",
      actions: exactTiming,
    });
    await page.close();
  }
  assert.deepEqual(forbidden, []);
  report.checks.push({
    check:
      "Source tab closed, fresh browser context, exported ZIPs alone, no editor/generator/source asset requests",
    result: "passed",
  });
  await independent.close();

  const legacyContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const legacy = await legacyContext.newPage();
  track(legacy, "legacy compatibility");
  await legacy.goto(`${baseURL}/player.html`);
  await legacy
    .locator("#player-zip")
    .setInputFiles(
      fileURLToPath(new URL("public/samples/mira.character.zip", root)),
    );
  await expect(legacy.getByRole("status")).toContainText("Loaded:");
  await expect(legacy.getByTestId("consumer-canvas")).toHaveCSS(
    "image-rendering",
    "pixelated",
  );
  await expect(
    legacy.getByRole("button", { name: "Celebrate", exact: true }),
  ).toHaveCount(0);
  await expect(
    legacy.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await scrub(legacy, "walk", 0, "left");
  await shot(legacy, "legacy-v1-player");
  report.checks.push({
    check:
      "Unmodified V1 Mira sample loads with legacy pixel display, idle/walk, missing run disabled, no celebrate mutation",
    result: "passed",
  });
  if (process.env.KLING_LEGACY_SOURCE) {
    log(
      "Checking original uploaded 384×576 external source archive compatibility",
    );
    const legacyBytes = await readFile(process.env.KLING_LEGACY_SOURCE);
    await legacy
      .locator("#player-zip")
      .setInputFiles(process.env.KLING_LEGACY_SOURCE);
    await expect(legacy.locator("#player-character")).toBeVisible({ timeout });
    await expect(legacy.locator("#player-zip")).toBeEnabled({ timeout });
    await expect(legacy.getByRole("alert")).toHaveCount(0);
    for (const id of characters) {
      await legacy.locator("#player-character").selectOption(id);
      await expect(legacy.locator("#player-zip")).toBeEnabled({ timeout });
      for (const action of actions) await scrub(legacy, action, 0, "right");
    }
    await shot(legacy, "original-384-source-compatibility");
    report.checks.push({
      check:
        "Original uploaded external 384×576 Unified archive imports both identities and all four actions",
      result: "passed",
      sha256: sha(legacyBytes),
      bytes: legacyBytes.length,
    });
  } else
    report.checks.push({
      check: "Original uploaded 384×576 external archive",
      result: "not run; set KLING_LEGACY_SOURCE to its path",
    });
  await legacyContext.close();
  assert.deepEqual(report.browserErrors, []);
} finally {
  await browser.close();
  await server.close();
  report.independentRequests = [...new Set(report.independentRequests)].sort();
  await writeFile(
    new URL("evidence-index.json", browserOutput),
    JSON.stringify(report, null, 2) + "\n",
  );
}

// Independent decoder: compares every channel including fractional alpha and
// zero-alpha RGB; Canvas screenshots cannot prove unpremultiplied RGBA equality.
log("Independently decoding all original PNGs and both UI-exported atlases");
const fidelity = JSON.parse(
  execFileSync(
    "python3",
    [
      "-c",
      String.raw`
import sys,json,zipfile,io,hashlib
from pathlib import Path
from PIL import Image
import numpy as np
root=Path(sys.argv[1]);source=zipfile.ZipFile(root/'artwork/kling-playback/prepared/kling-source.zip')
assert source.testzip() is None
out=[]
for identity in ['male','female']:
 path=root/'docs/kling-playback/exports'/f'{identity}.character.zip'
 archive=zipfile.ZipFile(path);assert archive.testzip() is None
 manifest=json.loads(archive.read('manifest.json'));recipe=json.loads(archive.read('character.json'))
 image=Image.open(io.BytesIO(archive.read('spritesheet.png')));image.load()
 assert image.mode=='RGBA' and image.size==(manifest['spritesheet']['width'],manifest['spritesheet']['height'])
 frames={frame['id']:frame for frame in manifest['frames']}
 rows=[]
 for action in ['idle','walk','run','celebrate']:
  source_clip=json.loads(source.read(f'characters/{identity}/actions/{action}_loop.json'))
  clip=manifest['animations'][action]
  assert len(clip['frames'])==len(source_clip['frames']) and clip['fps']==source_clip['fps']
  for index,frame_id in enumerate(clip['frames']):
   frame=frames[frame_id];original=source_clip['frames'][index]
   src=Image.open(io.BytesIO(source.read(f"characters/{identity}/{original['image']}")));src.load();assert src.mode=='RGBA'
   crop=image.crop((frame['x'],frame['y'],frame['x']+frame['width'],frame['y']+frame['height']))
   a=np.array(src);b=np.array(crop)
   assert a.shape==b.shape and np.array_equal(a,b),(identity,action,index,'RGBA mismatch')
   assert np.any(a[:,:,3]==0) and np.any(a[:,:,3]==255)
   rows.append({'action':action,'index':index,'atlasFrame':frame_id,'sourceFrame':original['source_video_frame'],'sourceTimeSeconds':original['source_time_s'],'rgbaSha256':hashlib.sha256(a.tobytes()).hexdigest(),'partialAlphaPixels':int(np.sum((a[:,:,3]>0)&(a[:,:,3]<255))),'pixelDifferenceCount':0})
 out.append({'character':identity,'zipCrc':'passed','pngDecoded':True,'atlasDimensions':list(image.size),'framesChecked':len(rows),'exactRgbaEquality':True,'frames':rows})
print(json.dumps(out))
`,
      fileURLToPath(root),
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  ).toString(),
);
report.pixelFidelity = fidelity;
assert.deepEqual(
  await implementationHashes(),
  report.implementationHashes,
  "Implementation changed during evidence capture; rerun against a stable revision.",
);
assert.equal(
  sha(await readFile(new URL(sourcePath, root))),
  report.sourceSha256,
  "Source extraction changed during evidence capture.",
);
report.finishedAt = new Date().toISOString();
report.checks.push({
  check:
    "Every exported PNG frame decoded with independent Pillow decoder and compared RGBA to extracted source",
  result: "passed",
  frames: fidelity.reduce((total, entry) => total + entry.framesChecked, 0),
});
await writeFile(
  new URL("evidence-index.json", browserOutput),
  JSON.stringify(report, null, 2) + "\n",
);
log(
  `Evidence complete: ${report.downloads.length} native packs, ${report.playback.length} independently observed loops, ${report.screenshots.length} browser screenshots`,
);
