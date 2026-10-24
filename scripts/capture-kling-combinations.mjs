// Actual production wardrobe downloads; this script does not draw characters.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(
  root,
  process.env.KLING_GALLERY_DIR || "docs/kling-combination-gallery",
);
const temp = resolve(
  root,
  process.env.KLING_GALLERY_TEMP || ".review-tmp/kling-combination-gallery",
);
await mkdir(join(out, "actions"), { recursive: true });
await mkdir(join(out, "frames"), { recursive: true });
await mkdir(temp, { recursive: true });
assert(
  !existsSync(join(out, "capture.json")),
  "Choose a fresh output directory; preserve completed captures.",
);
const cases = JSON.parse(
  await readFile(
    join(root, "docs/kling-combination-gallery/cases.json"),
    "utf8",
  ),
);
const actions = ["idle", "walk", "run", "jump", "celebrate"];
const slots = {
  top: "Top",
  bottom: "Bottom",
  fullBody: "Dress / one-piece",
  shoes: "Shoes",
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const catalogBytes = await readFile(
  join(root, "docs/kling-wardrobe/catalog.json"),
);
const catalog = JSON.parse(catalogBytes);
const report = {
  format: "gathria-combination-gallery",
  version: 1,
  production: true,
  startedAt: new Date().toISOString(),
  implementationCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  catalogSha256: sha(catalogBytes),
  productionHtmlSha256: sha(await readFile(join(root, "dist/workbench.html"))),
  cases: [],
  downloads: [],
  errors: [],
  failedRequests: [],
  externalRequests: [],
};
report.sourceHashes = Object.fromEntries(
  await Promise.all(
    execFileSync(
      "git",
      [
        "ls-files",
        "-z",
        "src",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
      ],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean)
      .map(async (f) => [f, sha(await readFile(join(root, f)))]),
  ),
);
const server = await preview({
  root,
  preview: { host: "127.0.0.1", port: 5211, strictPort: true },
});
const origin = "http://127.0.0.1:5211";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const panel = (p) => p.locator("#wardrobe-panel");
const button = (p, name) => panel(p).getByRole("button", { name, exact: true });
async function ready(p, text) {
  await p.waitForFunction(
    (expected) => {
      const node = document.querySelector("#wardrobe-panel");
      return (
        node?.querySelector('[role="alert"]') ||
        (node
          ?.querySelector('[role="status"]')
          ?.textContent.includes(expected) &&
          node.querySelector(".wardrobe-editor")?.getAttribute("aria-busy") !==
            "true")
      );
    },
    text,
    { timeout: 180000 },
  );
  assert.deepEqual(await panel(p).getByRole("alert").allTextContents(), []);
  await expect(panel(p).getByRole("status")).toContainText(text);
}
async function choose(p, label, value, message) {
  const select = panel(p).getByLabel(label, { exact: true });
  if ((await select.inputValue()) !== value) {
    await select.selectOption(value);
    await ready(p, message);
  }
  await expect(select).toHaveValue(value);
}
async function pose(p, manifest, action, facing) {
  const stop = button(p, "Pause wardrobe animation");
  if (await stop.count()) await stop.click();
  await panel(p)
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption(action);
  await panel(p)
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption(facing);
  await panel(p).getByLabel("Wardrobe frame", { exact: true }).fill("0");
  await expect(panel(p).getByTestId("wardrobe-preview")).toHaveAttribute(
    "data-rendered-frame-id",
    String(manifest.animations[action].frames[0]),
  );
}
async function download(p, label, target, metadata) {
  assert(!existsSync(target), `Do not overwrite ${target}`);
  const event = p.waitForEvent("download", { timeout: 180000 });
  event.catch(() => {});
  await button(p, label).click();
  const d = await event;
  assert.equal(await d.failure(), null);
  await d.saveAs(target);
  const bytes = await readFile(target);
  assert(bytes.length > 0);
  const record = {
    file: rel(target),
    bytes: bytes.length,
    sha256: sha(bytes),
    ...metadata,
  };
  report.downloads.push(record);
  console.log(`Exported ${target.split("/").at(-1)}`);
  return { bytes, record };
}
let active;
const deadline = setTimeout(
  () => {
    console.error("Gallery capture exceeded its 30-minute bound.");
    void browser.close();
  },
  30 * 60 * 1000,
);
try {
  for (const c of cases) {
    console.log(`Preparing ${c.id}`);
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
      acceptDownloads: true,
    });
    context.on("page", (p) =>
      p.on("pageerror", (e) => report.errors.push(String(e))),
    );
    context.on("response", (r) => {
      if (r.status() >= 400)
        report.failedRequests.push({ url: r.url(), status: r.status() });
    });
    context.on("request", (r) => {
      if (/^https?:/.test(r.url()) && !r.url().startsWith(origin))
        report.externalRequests.push(r.url());
    });
    const p = await context.newPage();
    active = p;
    await p.goto(
      `${origin}/workbench.html?character=${c.character}&mode=wardrobe`,
    );
    await ready(p, "Original outfit.");
    await panel(p).getByLabel("Find an outfit", { exact: true }).fill(c.preset);
    await button(p, c.preset).click();
    await ready(p, `${c.preset} selected`);
    await button(p, "Clear outfit search").click();
    for (const [slot, value] of Object.entries(c.overrides))
      await choose(p, slots[slot], value, "Outfit updated");
    await choose(p, "Hairstyle", c.hair, "Appearance updated");
    await choose(p, "Hair color", c.color, "Appearance updated");
    await choose(p, "Face", c.face, "Appearance updated");
    const char = catalog.characters.find((x) => x.key === c.character);
    const expectedSelection = {
      ...char.presets.find((x) => x.name === c.preset).selection,
      ...c.overrides,
    };
    for (const [slot, value] of Object.entries(expectedSelection))
      await expect(
        panel(p).getByLabel(slots[slot], { exact: true }),
      ).toHaveValue(value || "");
    const pack = await download(
      p,
      "Export CharacterPack",
      join(temp, `${c.id}.character.zip`),
      { kind: "pack", id: c.id, temporary: true },
    );
    await ready(p, "CharacterPack exported");
    const manifest = JSON.parse(
      Buffer.from(unzipSync(pack.bytes)["manifest.json"]),
    );
    const record = {
      ...c,
      selection: expectedSelection,
      pack: pack.record.file,
      manifest,
      originalSourceSha256: sha(
        await readFile(join(root, char.sourceUrl.slice(1))),
      ),
      garmentHashes: Object.fromEntries(
        Object.values(expectedSelection)
          .filter(Boolean)
          .map((id) => [id, char.items.find((x) => x.id === id).sha256]),
      ),
      gifs: [],
    };
    for (const action of actions) {
      for (const facing of action === "run" ? ["right", "left"] : ["right"]) {
        await pose(p, manifest, action, facing);
        if (facing === "right") {
          await download(
            p,
            "Save current PNG",
            join(out, "frames", `${c.id}-${action}.png`),
            {
              kind: "png",
              id: c.id,
              action,
              facing,
              frameId: manifest.animations[action].frames[0],
            },
          );
          await ready(p, "Transparent frame saved");
        }
        const gif = await download(
          p,
          "Download action GIF",
          join(out, "actions", `${c.id}-${action}-${facing}.gif`),
          { kind: "gif", id: c.id, action, facing },
        );
        await ready(p, "Action GIF saved");
        const decoded = parseGIF(new Uint8Array(gif.bytes).buffer);
        const frames = decompressFrames(decoded, true),
          clip = manifest.animations[action];
        assert.equal(frames.length, clip.frames.length);
        const durations = frames.map((f) => f.delay);
        const expected = clip.frames.map(
          (_, i) =>
            (Math.round(((i + 1) * 100) / clip.fps) -
              Math.round((i * 100) / clip.fps)) *
            10,
        );
        assert.deepEqual(durations, expected);
        assert.equal(
          decoded.frames.some((f) => f.application?.id === "NETSCAPE2.0"),
          clip.loop,
        );
        record.gifs.push({
          ...gif.record,
          frames: frames.length,
          durationsMs: durations,
          loop: clip.loop,
        });
      }
    }
    report.cases.push(record);
    await writeFile(
      join(out, "capture-progress.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    await context.close();
    active = null;
    console.log(`Completed ${c.id}: five actions and mirrored run`);
  }
  for (const key of ["errors", "failedRequests", "externalRequests"])
    assert.deepEqual(report[key], []);
  report.finishedAt = new Date().toISOString();
  report.passed = true;
  await writeFile(
    join(out, "capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("All eight actual combination exports passed.");
} catch (e) {
  report.failure = String(e);
  await active
    ?.screenshot({ path: join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  await writeFile(
    join(out, "failed-capture.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  throw e;
} finally {
  clearTimeout(deadline);
  await browser.close();
  await server.close();
}
