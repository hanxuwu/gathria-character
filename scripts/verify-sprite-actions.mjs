// Actual UI edits and downloads; source sprite artwork is never changed.
import { createServer } from "vite";
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const phase = process.env.EVIDENCE_PHASE || "review";
assert(/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(phase));
const output = new URL(`docs/sprite-actions/${phase}/`, root);
await mkdir(output, { recursive: true });
assert.equal(
  (await readdir(output)).length,
  0,
  "Preserve prior evidence; use a fresh phase.",
);
const temporary = await mkdtemp(join(tmpdir(), "gathria-sprite-actions-"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
    "*.html",
    "vite.config.ts",
    "docs/kling-jump/exports/male.character.zip",
    "docs/kling-jump/exports/female.character.zip",
  ],
  { cwd: fileURLToPath(root), encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter((p) => p && existsSync(new URL(p, root)))
  .sort();
const hashes = async () =>
  Object.fromEntries(
    await Promise.all(
      inputs.map(async (p) => [p, sha(await readFile(new URL(p, root)))]),
    ),
  );
const report = {
  format: "gathria-sprite-action-evidence",
  version: 1,
  startedAt: new Date().toISOString(),
  phase,
  scope:
    "Metadata-only clip arrangement. Edited samples deliberately change timing/frame selection for workflow verification; they are not improved/approved animations.",
  inputHashes: await hashes(),
  downloads: [],
  characterCases: [],
  independentPlayback: [],
  screenshots: [],
  responsiveLayouts: [],
  errors: [],
  forbiddenIndependentRequests: [],
  externalRequests: [],
};
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
const button = (page, name) => page.getByRole("button", { name, exact: true });
const editor = (page) =>
  page.getByRole("region", { name: "Sprite action editor" });
async function screenshot(page, name, locator = page) {
  const path = new URL(name, output).pathname;
  await locator.screenshot({ path });
  report.screenshots.push({
    file: name,
    sha256: sha(await readFile(path)),
    source: "Actual browser display",
  });
}
async function download(page, label, name, retain = false) {
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await button(page, label).click();
  const path = retain ? new URL(name, output).pathname : join(temporary, name);
  await (await pending).saveAs(path);
  const bytes = new Uint8Array(await readFile(path));
  assert(bytes.length > 0);
  const decode = JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        `
import io,json,sys,zipfile
from PIL import Image
p=sys.argv[1]
records=[]
def check(data,prefix='',depth=0):
 assert depth<3
 with zipfile.ZipFile(io.BytesIO(data)) as z:
  assert z.testzip() is None
  for n in z.namelist():
   assert not n.startswith('/') and '..' not in n.split('/')
   b=z.read(n);assert b
   r={'file':prefix+n,'bytes':len(b)}
   if n.endswith('.png'):
    im=Image.open(io.BytesIO(b));im.load();r.update(decoded=True,dimensions=list(im.size),mode=im.mode)
    assert im.mode=='RGBA'
   if n.endswith('.json'):json.loads(b)
   records.append(r)
   if n.endswith('.zip'):check(b,prefix+n+'/',depth+1)
check(open(p,'rb').read())
print(json.dumps({'crcChecked':True,'members':records}))
`,
        path,
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    ),
  );
  report.downloads.push({
    file: name,
    bytes: bytes.length,
    sha256: sha(bytes),
    retained: retain,
    source: "Actual UI download",
    ...decode,
  });
  return { bytes, path };
}
async function apply(page, start, end, fps, loop) {
  await editor(page)
    .getByLabel("Start frame", { exact: true })
    .fill(String(start));
  await editor(page).getByLabel("End frame", { exact: true }).fill(String(end));
  await editor(page)
    .getByLabel("Action FPS", { exact: true })
    .fill(String(fps));
  await editor(page)
    .getByLabel("Loop action", { exact: true })
    .setChecked(loop);
  await button(page, "Apply action settings").click();
  await expect(page.locator(".player-timing")).toHaveText(
    `${fps} FPS · ${loop ? "LOOP" : "ONCE"}`,
  );
}
function comparePacks(original, actual, expectedAction) {
  const a = unzipSync(original),
    b = unzipSync(actual);
  const source = JSON.parse(Buffer.from(a["manifest.json"]).toString());
  const manifest = JSON.parse(Buffer.from(b["manifest.json"]).toString());
  assert.deepEqual(manifest.frames, source.frames);
  assert.deepEqual(manifest.anchor, source.anchor);
  assert.deepEqual(manifest.spritesheet, source.spritesheet);
  assert.deepEqual(manifest.additionalSheets, source.additionalSheets);
  assert.deepEqual(manifest.animations.run, expectedAction);
  const atlas = Object.keys(a)
    .filter((p) => p.endsWith(".png"))
    .map((file) => {
      assert.equal(sha(b[file]), sha(a[file]), file);
      return {
        file,
        bytes: a[file].length,
        originalSha256: sha(a[file]),
        exportedSha256: sha(b[file]),
        byteExact: true,
      };
    });
  for (const [name, clip] of Object.entries(source.animations))
    if (name !== "run") assert.deepEqual(manifest.animations[name], clip);
  return {
    manifest,
    atlas,
    recipe: JSON.parse(Buffer.from(b["character.json"]).toString()),
  };
}
async function independent(
  context,
  file,
  label,
  manifest,
  retainedScreenshot = true,
) {
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("request", (r) => {
    if (/SpriteActionEditor|sprite-actions\.ts|\/src\/skeletal\//.test(r.url()))
      report.forbiddenIndependentRequests.push(r.url());
  });
  await page.goto(`${origin}/player.html`);
  await page.locator("#player-zip").setInputFiles(file);
  await expect(page.getByRole("status")).toContainText("Loaded:", {
    timeout: 120000,
  });
  await expect(editor(page)).toHaveCount(0);
  await button(page, "Run").click();
  await expect(button(page, "Replay animation")).toBeVisible({
    timeout: 10000,
  });
  const canvas = page.getByTestId("consumer-canvas");
  for (const facing of ["Right", "Left"]) {
    await button(page, facing).click();
    await page.locator("#player-frame").fill("0");
    await expect(canvas).toHaveAttribute(
      "data-frame-id",
      String(manifest.animations.run.frames[0]),
    );
    const before = await canvas.evaluate((c) => c.toDataURL());
    await page
      .getByRole("button", { name: /^(Play|Replay) animation$/ })
      .click();
    await expect(button(page, "Replay animation")).toBeVisible({
      timeout: 10000,
    });
    await expect(canvas).toHaveAttribute(
      "data-frame-id",
      String(manifest.animations.run.frames.at(-1)),
    );
    await expect(canvas).toHaveAttribute(
      "aria-label",
      new RegExp(`run, facing ${facing.toLowerCase()}`),
    );
    const after = await canvas.evaluate((c) => c.toDataURL());
    if (manifest.animations.run.frames.length > 1)
      assert.notEqual(before, after);
    await page.waitForTimeout(120);
    assert.equal(await canvas.evaluate((c) => c.toDataURL()), after);
    report.independentPlayback.push({
      character: label,
      facing: facing.toLowerCase(),
      frames: manifest.animations.run.frames,
      fps: manifest.animations.run.fps,
      loop: false,
      stoppedAtLastFrame: true,
      finalFrameHeld: true,
      editorClosed: true,
    });
    if (retainedScreenshot)
      await screenshot(
        page,
        `${label}-independent-${facing.toLowerCase()}.png`,
        page.locator(".player-preview-panel"),
      );
  }
  await page.close();
}
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  context.on("request", (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && !url.startsWith(origin))
      report.externalRequests.push(url);
  });
  for (const character of ["male", "female"]) {
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    const original = new Uint8Array(
      await readFile(
        new URL(`docs/kling-jump/exports/${character}.character.zip`, root),
      ),
    );
    const old = JSON.parse(
      Buffer.from(unzipSync(original)["manifest.json"]).toString(),
    );
    await page.goto(`${origin}/player.html?kling=${character}&authoring=1`);
    await expect(
      editor(page).getByLabel("Start frame", { exact: true }),
    ).toBeEnabled({ timeout: 120000 });
    await button(page, "Run").click();
    await apply(page, 2, 6, 12, false);
    await page.locator("#player-frame").fill("0");
    await screenshot(page, `${character}-action-editor.png`, editor(page));
    await screenshot(
      page,
      `${character}-preview.png`,
      page.locator(".player-preview-panel"),
    );
    const project = await download(
      page,
      "Save action project",
      `${character}-edited.sprite-project.zip`,
    );
    const exported = await download(
      page,
      "Export edited CharacterPack",
      `${character}-edited.character.zip`,
    );
    const expected = {
      frames: old.animations.run.frames.slice(1, 6),
      fps: 12,
      loop: false,
    };
    const checked = comparePacks(original, exported.bytes, expected);
    await writeFile(
      new URL(`${character}-edited.manifest.json`, output),
      JSON.stringify(checked.manifest, null, 2) + "\n",
    );
    await writeFile(
      new URL(`${character}-edited.character.json`, output),
      JSON.stringify(checked.recipe, null, 2) + "\n",
    );
    const projectFiles = unzipSync(project.bytes);
    const embedded = Object.entries(projectFiles).find(([name]) =>
      name.endsWith(".zip"),
    );
    assert(embedded, "Project must carry original source pack");
    assert.equal(sha(embedded[1]), sha(original));
    const projectDocument = Object.entries(projectFiles).find(([name]) =>
      name.endsWith(".json"),
    );
    assert(projectDocument);
    await writeFile(
      new URL(`${character}-project-document.json`, output),
      projectDocument[1],
    );
    await button(page, "Reset action to source").click();
    await expect(page.locator(".player-timing")).toHaveText("24 FPS · LOOP");
    await page
      .getByLabel("Open action project", { exact: true })
      .setInputFiles(project.path);
    await button(page, "Run").click();
    await expect(page.locator(".player-timing")).toHaveText("12 FPS · ONCE");
    await expect(
      editor(page).getByLabel("Start frame", { exact: true }),
    ).toHaveValue("2");
    await expect(
      editor(page).getByLabel("End frame", { exact: true }),
    ).toHaveValue("6");
    await button(page, "Reset action to source").click();
    const reset = await download(
      page,
      "Export edited CharacterPack",
      `${character}-reset.character.zip`,
    );
    assert.equal(sha(reset.bytes), sha(original));
    await button(page, "Jump").click();
    await expect(page.locator(".player-timing")).toHaveText("24 FPS · ONCE");
    assert.equal(
      await page.locator("#player-frame").getAttribute("max"),
      String(old.animations.jump.frames.length - 1),
    );
    report.characterCases.push({
      character,
      sourcePackSha256: sha(original),
      sourceArchiveInSavedProjectUnchanged: true,
      editedRun: expected,
      allOtherActionsUnchanged: true,
      atlas: checked.atlas,
      frameRectsAndAnchorUnchanged: true,
      saveReopenRetainedSettings: true,
      resetExportByteExact: true,
      originalJumpPreserved: true,
      largeDownloadsRetained: false,
      retentionReason:
        "Avoid duplicate native atlases; hashes, settings, metadata, screenshots and reproducible browser script retained.",
    });
    await page.close();
    await independent(context, exported.path, character, checked.manifest);
    console.log(
      `Verified ${character}: metadata edits, immutable atlas bytes, save/reopen/reset, closed-editor playback.`,
    );
  }
  // Capture the real entry point and its embedded editor at both common sizes.
  const workbench = await context.newPage();
  workbench.on("pageerror", (e) => report.errors.push(e.message));
  await workbench.goto(`${origin}/workbench.html?character=male`);
  const embeddedEditor = workbench.frameLocator(
    'iframe[title="Sprite action workspace"]',
  );
  await expect(
    embeddedEditor.getByLabel("Start frame", { exact: true }),
  ).toBeEnabled({ timeout: 120000 });
  await embeddedEditor
    .getByRole("button", { name: "Run", exact: true })
    .click();
  await embeddedEditor.locator("#player-frame").fill("0");
  for (const [name, width, height] of [
    ["desktop", 1440, 1100],
    ["narrow", 390, 844],
  ]) {
    await workbench.setViewportSize({ width, height });
    await workbench.evaluate(() => window.scrollTo(0, 0));
    const frame = workbench
      .frames()
      .find((candidate) => candidate.url().includes("player.html"));
    assert(frame);
    await frame.evaluate(() => window.scrollTo(0, 0));
    await screenshot(workbench, `workbench-${name}.png`);
    // Cross-iframe element screenshots can include unrelated outer-page pixels
    // when the element is taller than the iframe. Capture the actual viewport
    // after normal scrolling instead; the direct player shots show full panels.
    await workbench
      .locator('iframe[title="Sprite action workspace"]')
      .evaluate((element) => {
        window.scrollTo(0, scrollY + element.getBoundingClientRect().top - 90);
      });
    await embeddedEditor
      .getByRole("region", { name: "Sprite action editor" })
      .evaluate((element) => {
        window.scrollTo(0, scrollY + element.getBoundingClientRect().top - 12);
      });
    await screenshot(workbench, `workbench-editor-${name}.png`);
    const shell = await workbench.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    const player = await frame.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    report.responsiveLayouts.push({
      name,
      shell,
      player,
      horizontalOverflow:
        shell.document > shell.viewport || player.document > player.viewport,
    });
  }
  await workbench.close();
  // A small actual imported V2 package demonstrates portability without another 29MB video atlas.
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  const small = new URL(
    "docs/kling-native-female/final/kling-female-native-stills.character.zip",
    root,
  );
  await page.goto(`${origin}/player.html?authoring=1`);
  await page.locator("#player-zip").setInputFiles(fileURLToPath(small));
  await expect(
    editor(page).getByLabel("Start frame", { exact: true }),
  ).toBeEnabled({ timeout: 120000 });
  await expect(button(page, "Jump")).toBeDisabled();
  await button(page, "Run").click();
  await apply(page, 1, 1, 2, false);
  await download(
    page,
    "Save action project",
    "imported-v2-stills.sprite-project.zip",
    true,
  );
  const sample = await download(
    page,
    "Export edited CharacterPack",
    "imported-v2-stills.character.zip",
    true,
  );
  const originalSmall = new Uint8Array(await readFile(small));
  const smallChecked = comparePacks(originalSmall, sample.bytes, {
    frames: [2],
    fps: 2,
    loop: false,
  });
  assert.equal(smallChecked.manifest.schemaVersion, 2);
  assert.equal(smallChecked.manifest.animations.jump, undefined);
  report.importedV2 = {
    source:
      "Existing female skeletal stills CharacterPack (small real package, not newly authored character animation)",
    missingJumpRemainsUnavailable: true,
    atlas: smallChecked.atlas,
    retainedSampleProjectAndPack: true,
  };
  await page.close();
  await independent(
    context,
    sample.path,
    "imported-v2-stills",
    smallChecked.manifest,
    false,
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.forbiddenIndependentRequests, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(
    await hashes(),
    report.inputHashes,
    "Runtime/source changed during evidence capture.",
  );
  const pngValidation = JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        `
from pathlib import Path
from PIL import Image
import sys,json
out=[]
for p in Path(sys.argv[1]).glob('*.png'):
 im=Image.open(p);im.load();out.append({'file':p.name,'dimensions':list(im.size),'decoded':True,'bytes':p.stat().st_size})
print(json.dumps(out))
`,
        fileURLToPath(output),
      ],
      { encoding: "utf8" },
    ),
  );
  report.pngValidation = pngValidation;
  report.passed = true;
  report.completedAt = new Date().toISOString();
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        screenshots: report.screenshots.length,
        downloadsValidated: report.downloads.length,
        independentCases: report.independentPlayback.length,
        output: fileURLToPath(output),
      },
      null,
      2,
    ),
  );
} catch (error) {
  report.passed = false;
  report.failure = String(error?.stack || error);
  await writeFile(
    new URL("evidence-index.json", output),
    JSON.stringify(report, null, 2) + "\n",
  );
  throw error;
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
