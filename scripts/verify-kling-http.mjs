// Run after npm run build. Uses real HTTP on a non-loopback interface, not an API mock.
import assert from "node:assert/strict";
import { networkInterfaces } from "node:os";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { preview } from "vite";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";

const address = Object.values(networkInterfaces())
  .flat()
  .find((ip) => ip?.family === "IPv4" && !ip.internal)?.address;
assert(
  address,
  "A non-loopback IPv4 interface is required to test an insecure HTTP context.",
);
const output = "docs/kling-playback/http-fix";
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "kling-http-"));
const server = await preview({
  preview: { host: "0.0.0.0", port: 5187, strictPort: true },
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
});
const url = `http://${address}:5187/player.html`;
const report = {
  testedAt: new Date().toISOString(),
  context: null,
  characters: [],
  browserErrors: [],
};
const source = await readFile(
  "artwork/kling-playback/prepared/kling-source.zip",
);
const sourceHash = createHash("sha256").update(source).digest("hex");
const track = (page) =>
  page.on("pageerror", (error) => report.browserErrors.push(error.message));
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  track(page);
  await page.goto(url);
  report.context = await page.evaluate(() => ({
    secure: isSecureContext,
    subtleAvailable: !!globalThis.crypto?.subtle,
  }));
  assert.deepEqual(report.context, { secure: false, subtleAvailable: false });
  const start = performance.now();
  // Keep this historical four-action regression explicit as the sample evolves.
  await page
    .locator("#player-zip")
    .setInputFiles("artwork/kling-playback/prepared/kling-source.zip");
  await expect(page.getByRole("status")).toContainText("Loaded:", {
    timeout: 180000,
  });
  report.initialLoadSeconds = (performance.now() - start) / 1000;
  for (const id of ["male", "female"]) {
    await page.getByLabel("Character", { exact: true }).selectOption(id);
    await expect(page.getByLabel("Character", { exact: true })).toBeEnabled({
      timeout: 180000,
    });
    await expect(page.getByRole("alert")).toHaveCount(0);
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Export selected CharacterPack",
        exact: true,
      })
      .click();
    const download = await pending;
    const path = join(temporary, `${id}.zip`);
    await download.saveAs(path);
    const actual = unzipSync(await readFile(path));
    const baseline = unzipSync(
      await readFile(`docs/kling-playback/exports/${id}.character.zip`),
    );
    // Byte-identical PNGs prove all native RGBA, dimensions and alpha are unchanged.
    assert.deepEqual(actual["spritesheet.png"], baseline["spritesheet.png"]);
    for (const file of ["manifest.json", "character.json"]) {
      assert.deepEqual(
        JSON.parse(new TextDecoder().decode(actual[file])),
        JSON.parse(new TextDecoder().decode(baseline[file])),
      );
    }
    assert.equal(
      JSON.parse(new TextDecoder().decode(actual["character.json"])).source
        .sha256,
      sourceHash,
    );
    report.characters.push({
      id,
      sourceSha256: sourceHash,
      baselinePngAndMetadataExact: true,
      independentPlayback: [],
    });
    console.log(
      `${id}: HTTP source import and exported PNG/metadata match baseline`,
    );
  }
  await context.close();
  for (const item of report.characters) {
    const independent = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const player = await independent.newPage();
    track(player);
    await player.goto(url);
    await player
      .locator("#player-zip")
      .setInputFiles(join(temporary, `${item.id}.zip`));
    await expect(player.getByRole("status")).toContainText("Loaded:", {
      timeout: 60000,
    });
    const canvas = player.getByTestId("consumer-canvas");
    for (const action of ["Idle", "Walk", "Run", "Celebrate"]) {
      await player.getByRole("button", { name: action, exact: true }).click();
      for (const direction of ["Left", "Right"]) {
        await player
          .getByRole("button", { name: direction, exact: true })
          .click();
        await expect(canvas).toHaveAttribute(
          "aria-label",
          new RegExp(
            `${action.toLowerCase()}, facing ${direction.toLowerCase()}`,
          ),
        );
        const first = await canvas.getAttribute("data-frame-position");
        await expect
          .poll(() => canvas.getAttribute("data-frame-position"))
          .not.toBe(first);
        item.independentPlayback.push(`${action}/${direction}`);
      }
    }
    await player
      .getByRole("button", { name: "Pause animation", exact: true })
      .click();
    await player
      .locator(".player-preview-panel")
      .screenshot({ path: `${output}/${item.id}-http-player.png` });
    await independent.close();
  }
  assert.deepEqual(report.browserErrors, []);
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "PASS: native HTTP imports, exact exports, 16 independent playback combinations, no browser errors",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
