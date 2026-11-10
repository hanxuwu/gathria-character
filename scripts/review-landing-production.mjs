// Actual workbench downloads. These checks establish working delivery, not visual approval.
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import assert from "node:assert/strict";

const root = process.cwd();
const out = resolve(process.argv[2] ?? "docs/kling-landing-production/review");
const travelOnly = process.argv.includes("--travel-only");
const mixOnly = process.argv.includes("--mix-only");
await mkdir(out, { recursive: true });
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5193, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const side = () =>
  page.locator('[data-testid="side-session"][data-active="true"]');
const stage = () => side().getByTestId("side-stage");
const ready = async () => {
  await expect(side().getByTestId("side-playground")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180000 },
  );
  await expect(side().getByRole("alert")).toHaveCount(0);
};
const artifacts = [];
async function download(testId, filename) {
  const waiting = page.waitForEvent("download", { timeout: 180000 });
  await side().getByTestId(testId).click();
  const item = await waiting;
  assert.equal(await item.failure(), null);
  await item.saveAs(resolve(out, filename));
  await ready();
  const bytes = await readFile(resolve(out, filename));
  artifacts.push({
    filename,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    uiButton: testId,
  });
  return bytes;
}
const snapshots = [];
async function recordTravel(look) {
  await side().getByTestId("side-mode-travel").click();
  await side().getByTestId("side-run-speed").fill("700");
  await stage().scrollIntoViewIfNeeded();
  await stage().evaluate((canvas) => {
    const chunks = [];
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    window.__landingRecording = { recorder, stream, chunks };
    recorder.start();
  });
  await side().getByTestId("side-preview-run-jump").click();
  await expect(stage()).toHaveAttribute("data-flow", "run-jump-run");
  await expect(stage()).toHaveAttribute("data-paused", "false");
  await expect(stage()).toHaveAttribute("data-paused", "true", {
    timeout: 15000,
  });
  const recorded = await stage().evaluate(async (canvas) => {
    const { recorder, stream, chunks } = window.__landingRecording;
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
    stream.getTracks().forEach((track) => track.stop());
    const bytes = new Uint8Array(
      await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
    );
    let text = "";
    for (let i = 0; i < bytes.length; i += 8192)
      text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return {
      base64: btoa(text),
      worldX: canvas.dataset.position,
      action: canvas.dataset.action,
      paused: canvas.dataset.paused,
    };
  });
  await writeFile(
    resolve(out, `${look}-actual-travel.webm`),
    Buffer.from(recorded.base64, "base64"),
  );
  snapshots.push({
    look,
    recording: `${look}-actual-travel.webm`,
    runSpeed: 700,
    action: recorded.action,
    paused: recorded.paused,
    worldX: recorded.worldX,
  });
  assert.ok(
    Number(recorded.worldX) > 0,
    "Travel must advance the world position",
  );
  await side().getByTestId("side-mode-in-place").click();
}
try {
  await page.goto(
    "http://127.0.0.1:5193/workbench.html?character=male&mode=side-view&collection=landing-candidate",
  );
  await ready();
  await side().getByTestId("side-inspect-landing-107").click();
  for (const look of mixOnly ? [] : ["original", "daily", "wedding"]) {
    await side().getByTestId(`side-look-${look}`).click();
    await ready();
    await side()
      .getByTestId("side-hair")
      .selectOption(look === "original" ? "" : "side-part-matched-v1");
    await ready();
    if (travelOnly) {
      await recordTravel(look);
      continue;
    }
    for (const facing of ["right", "left"]) {
      await side().getByTestId(`side-facing-${facing}`).click();
      for (const frameId of [107, 108]) {
        await side().getByTestId(`side-inspect-landing-${frameId}`).click();
        await expect(stage()).toHaveAttribute("data-frame-id", String(frameId));
        await expect(stage()).toHaveAttribute("data-paused", "true");
        await download("side-export-png", `${look}-${frameId}-${facing}.png`);
        await stage().screenshot({
          path: resolve(out, `${look}-${frameId}-${facing}-stage.png`),
        });
      }
      const gif = await download(
        "side-export-run-jump-gif",
        `${look}-run-jump-run-${facing}.gif`,
      );
      assert.equal(gif.subarray(0, 6).toString(), "GIF89a");
    }
    await side().getByTestId("side-facing-right").click();
    await side().getByTestId("side-inspect-landing-107").click();
    const saved = await download("side-save-project", `${look}.wardrobe.zip`);
    const document = JSON.parse(
      Buffer.from(unzipSync(saved)["document.json"]).toString(),
    );
    assert.equal(document.preview.playback.state.paused, true);
    await side().getByTestId("side-action-idle").click();
    await side()
      .getByTestId("side-project-input")
      .setInputFiles(resolve(out, `${look}.wardrobe.zip`));
    await ready();
    await expect(stage()).toHaveAttribute("data-frame-id", "107");
    await expect(stage()).toHaveAttribute("data-paused", "true");
    snapshots.push({
      look,
      reopenedFrameId: 107,
      paused: true,
      selection: JSON.parse(await stage().getAttribute("data-selection")),
    });
    await download("side-export-pack", `${look}.character.zip`);
    await page.screenshot({
      path: resolve(out, `${look}-workbench.png`),
      fullPage: true,
    });
    await recordTravel(look);
    console.log(`Exported and reopened ${look}`);
  }
  if (mixOnly)
    for (const [top, bottom] of [
      ["daily", "wedding"],
      ["wedding", "daily"],
    ]) {
      const label = `mixed-${top}-top-${bottom}-bottom`;
      await side()
        .getByTestId("side-top")
        .selectOption(`landing-male-${top}-top-v1`);
      await ready();
      await side()
        .getByTestId("side-bottom")
        .selectOption(`landing-male-${bottom}-bottom-v1`);
      await ready();
      await side()
        .getByTestId("side-hair")
        .selectOption("side-part-matched-v1");
      await ready();
      await side().getByTestId("side-inspect-landing-108").click();
      await expect(stage()).toHaveAttribute("data-frame-id", "108");
      const selection = await stage().getAttribute("data-selection");
      await download("side-export-png", `${label}-108.png`);
      await download("side-export-run-jump-gif", `${label}.gif`);
      await download("side-save-project", `${label}.wardrobe.zip`);
      await side().getByTestId("side-look-original").click();
      await ready();
      await side()
        .getByTestId("side-project-input")
        .setInputFiles(resolve(out, `${label}.wardrobe.zip`));
      await ready();
      await expect(stage()).toHaveAttribute("data-frame-id", "108");
      await expect(stage()).toHaveAttribute("data-selection", selection);
      await stage().screenshot({ path: resolve(out, `${label}-stage.png`) });
      snapshots.push({
        look: label,
        selection: JSON.parse(selection),
        reopenedFrameId: 108,
        paused: true,
      });
      console.log(`Mixed and reopened ${label}`);
    }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(
      out,
      mixOnly
        ? "actual-mixed-review.json"
        : travelOnly
          ? "actual-travel-review.json"
          : "actual-workbench-review.json",
    ),
    JSON.stringify(
      {
        format: "gathria-landing-workbench-review",
        version: 1,
        visualAcceptance: "pending",
        source: "Actual UI buttons and saved project imports",
        originalDefaultsUnchanged: true,
        facesRepainted: false,
        snapshots,
        artifacts,
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
  await server.close();
}
