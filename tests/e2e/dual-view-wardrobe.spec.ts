import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";

const evidence =
  process.env.GATHRIA_DUAL_WARDROBE_EVIDENCE ?? "/tmp/dual-view-wardrobe";
type View = "original" | "side";
const views: View[] = ["original", "side"];
const stage = (page: Page) => page.getByTestId("dual-stage");
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (bytes: Uint8Array) =>
  JSON.parse(Buffer.from(bytes).toString("utf8"));

async function ready(page: Page) {
  await expect(page.getByTestId("dual-wardrobe")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 180_000 },
  );
  await expect(stage(page)).toBeVisible();
}
async function pause(page: Page) {
  if ((await stage(page).getAttribute("data-paused")) === "false")
    await page.getByTestId("dual-play-pause").click();
  await expect(stage(page)).toHaveAttribute("data-paused", "true");
}
async function view(page: Page, value: View) {
  await page
    .getByTestId("workbench-source")
    .selectOption(value === "side" ? "side-view" : "original");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-view", value);
  await expect(page).toHaveURL(/mode=paired/);
}
async function pose(
  page: Page,
  action: string,
  position = 3,
  facing = "right",
) {
  await pause(page);
  await page.getByTestId("dual-action").selectOption(action);
  await expect(stage(page)).toHaveAttribute("data-action", action);
  await page.getByTestId("dual-frame").fill(position === 0 ? "1" : "0");
  await page.getByTestId("dual-frame").fill(String(position));
  await page.getByTestId("dual-facing").selectOption(facing);
  await expect(stage(page)).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
  await expect(stage(page)).toHaveAttribute("data-facing", facing);
}
async function download(page: Page, control: Locator, path: string) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await control.click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  await result.saveAs(path);
  return {
    path,
    bytes: await readFile(path),
    filename: result.suggestedFilename(),
  };
}
async function exported(page: Page, kind: string, path: string) {
  const result = await download(page, page.getByTestId(`dual-${kind}`), path);
  await ready(page);
  return result;
}

function inspectBundle(bytes: Uint8Array, character: string) {
  const files = unzipSync(bytes);
  expect(Object.keys(files).sort()).toEqual([
    "manifest.json",
    "original.wardrobe.zip",
    "side.wardrobe.zip",
  ]);
  const manifest = json(files["manifest.json"]);
  expect(manifest.format).toBe("gathria-dual-view-wardrobe");
  expect(manifest.version).toBe(1);
  expect(manifest.character).toBe(character);
  const documents: Record<string, ReturnType<typeof json>> = {};
  for (const v of views) {
    const ref = manifest.views[v],
      zip = files[`${v}.wardrobe.zip`];
    expect(ref.file).toBe(`${v}.wardrobe.zip`);
    expect(ref.sha256).toBe(sha(zip));
    const native = unzipSync(zip),
      doc = json(native["document.json"]);
    expect(doc.sourceSha256).toBe(ref.sourceSha256);
    expect(doc.registrationSha256).toBe(ref.registrationSha256);
    expect(sha(native["source.character.zip"])).toBe(ref.sourceSha256);
    expect(sha(native["registration.json"])).toBe(ref.registrationSha256);
    const archive = readPortableCharacterPackArchive(
      native["source.character.zip"],
    );
    expect(archive.config.characterId).toBe(
      `kling-${character}-${v === "original" ? "motion-v1" : "side-workspace-v1"}`,
    );
    expect([ref.frameWidth, ref.frameHeight]).toEqual(
      v === "original" ? [704, 1056] : [512, 768],
    );
    documents[v] = doc;
  }
  expect(manifest.views.original.sourceSha256).not.toBe(
    manifest.views.side.sourceSha256,
  );
  expect(manifest.views.original.registrationSha256).not.toBe(
    manifest.views.side.registrationSha256,
  );
  return { files, manifest, documents };
}

for (const character of ["male", "female"] as const) {
  test(`${character}: shared cotton outfit keeps each native view and exports all actions independently`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(600_000);
    const output = `${evidence}/${character}`;
    await mkdir(output, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `/workbench.html?mode=paired&character=${character}&view=original`,
    );
    await ready(page);
    // This regression compares published source animations and legacy ZIPs.
    await page.getByTestId("dual-motion-mode").selectOption("source");
    await ready(page);
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue("source");
    await expect(stage(page)).toHaveAttribute("data-character", character);
    await expect(page.getByTestId("dual-palette")).toHaveValue(
      character === "male" ? "sea" : "apricot",
    );
    await expect(page.getByTestId("dual-top")).toHaveValue("cotton-tank");
    await expect(page.getByTestId("dual-bottom")).toHaveValue("cotton-shorts");
    const rows: Array<{
      character: string;
      view: View;
      project: string;
      pack: string;
      png: { right: string; left: string; frameId: number };
      gifs: Record<string, { right: string; left: string }>;
    }> = [];
    const packs = [];
    for (const v of views) {
      await view(page, v);
      await pose(page, "run");
      const frameId = Number(await stage(page).getAttribute("data-frame-id"));
      const right = await exported(
        page,
        "export-png",
        `${output}/${v}-run-right.png`,
      );
      await page.getByTestId("dual-facing").selectOption("left");
      await expect(stage(page)).toHaveAttribute("data-facing", "left");
      const left = await exported(
        page,
        "export-png",
        `${output}/${v}-run-left.png`,
      );
      const png = decodeSourceRgbaPng(right.bytes),
        mirrored = decodeSourceRgbaPng(left.bytes);
      expect([png.width, png.height]).toEqual(
        v === "original" ? [704, 1056] : [512, 768],
      );
      expect([mirrored.width, mirrored.height]).toEqual([
        png.width,
        png.height,
      ]);
      for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++) {
          const a = (y * png.width + x) * 4,
            b = (y * png.width + png.width - x - 1) * 4;
          for (let c = 0; c < 4; c++)
            if (png.pixels[a + c] !== mirrored.pixels[b + c])
              throw Error(`PNG mirror differs at ${x},${y},${c}`);
        }
      expect(
        png.pixels.some((value, index) => index % 4 === 3 && value === 0),
      ).toBe(true);
      expect(
        png.pixels.some((value, index) => index % 4 === 3 && value === 255),
      ).toBe(true);
      const native = await exported(
        page,
        "export-native-project",
        `${output}/${v}.wardrobe.zip`,
      );
      const pack = await exported(
        page,
        "export-pack",
        `${output}/${v}.character.zip`,
      );
      const nativeFiles = unzipSync(native.bytes),
        document = json(nativeFiles["document.json"]);
      const source = readPortableCharacterPackArchive(
        nativeFiles["source.character.zip"],
      );
      const archive = readPortableCharacterPackArchive(pack.bytes);
      expect(archive.manifest.frames).toEqual(source.manifest.frames);
      expect(archive.manifest.animations).toEqual(source.manifest.animations);
      expect(archive.manifest.anchor).toEqual(source.manifest.anchor);
      expect(archive.manifest.scale).toEqual(source.manifest.scale);
      expect(archive.config.derivation.frames).toEqual(
        source.config.derivation.frames,
      );
      expect(await stage(page).getAttribute("data-source-sha")).toBe(
        document.sourceSha256,
      );
      expect(await stage(page).getAttribute("data-registration-sha")).toBe(
        document.registrationSha256,
      );
      expect(archive.manifest.frames).toHaveLength(
        v === "side"
          ? character === "male"
            ? 107
            : 102
          : character === "male"
            ? 88
            : 96,
      );
      for (const [name, data] of Object.entries(unzipSync(pack.bytes)))
        if (name.endsWith(".png")) {
          const image = decodeSourceRgbaPng(data);
          expect(image.pixels.length).toBe(image.width * image.height * 4);
        }
      const row = {
        character,
        view: v,
        project: native.path,
        pack: pack.path,
        png: { right: right.path, left: left.path, frameId },
        gifs: {} as Record<string, { right: string; left: string }>,
      };
      for (const action of [
        "idle",
        "walk",
        "run",
        "jump",
        ...(v === "original" ? ["celebrate"] : []),
      ]) {
        row.gifs[action] = { right: "", left: "" };
        for (const facing of ["right", "left"] as const) {
          await pose(page, action, 0, facing);
          const gif = await exported(
            page,
            "export-gif",
            `${output}/${v}-${action}-${facing}.gif`,
          );
          row.gifs[action][facing] = gif.path;
        }
      }
      if (v === "side") {
        await expect(
          page.getByTestId("dual-action").locator('option[value="celebrate"]'),
        ).toHaveJSProperty("disabled", true);
        expect(archive.manifest.animations.celebrate).toBeUndefined();
      }
      await pose(page, "run", 3, "right");
      await page.screenshot({
        path: `${output}/${v}-workspace.png`,
        fullPage: true,
      });
      rows.push(row);
      packs.push({ ...pack, view: v, manifest: archive.manifest });
    }
    // The native frame positions and accepted bytes survive a full view roundtrip.
    await view(page, "original");
    await pause(page);
    await expect(stage(page)).toHaveAttribute("data-action", "run");
    await expect(stage(page)).toHaveAttribute("data-frame-position", "3");
    const returned = await exported(
      page,
      "export-png",
      `${output}/original-returned.png`,
    );
    expect(returned.bytes).toEqual(await readFile(rows[0].png.right));
    const bundle = await exported(
      page,
      "save-project",
      `${output}/both-views.zip`,
    );
    const parsed = inspectBundle(bundle.bytes, character);
    expect(parsed.manifest.selection).toEqual({
      outfitId: "cotton-day",
      paletteId: character === "male" ? "sea" : "apricot",
      topId: "cotton-tank",
      bottomId: "cotton-shorts",
    });
    expect(parsed.manifest.activeView).toBe("original");
    expect(parsed.manifest.previews.original).toEqual({
      action: "run",
      facing: "right",
      position: 3,
    });
    expect(parsed.manifest.previews.side).toEqual({
      action: "run",
      facing: "right",
      position: 3,
    });
    await page.close();
    const independentRows = [];
    for (const pack of packs) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 1000 },
      });
      const forbidden: string[] = [];
      context.on("request", (request) => {
        if (
          /\/src\/(?:wardrobe|side-view|skeletal)\/|\/src\/workspace\/Workbench\.tsx|\/workbench\.html/.test(
            request.url(),
          )
        )
          forbidden.push(request.url());
      });
      const player = await context.newPage();
      try {
        await player.goto("http://127.0.0.1:5175/player.html");
        await player.locator("#player-zip").setInputFiles(pack.path);
        await expect(player.locator(".player-status")).toHaveText(
          `Loaded: ${pack.manifest.name}`,
          { timeout: 180_000 },
        );
        await player.getByRole("button", { name: "Run", exact: true }).click();
        const canvas = player.getByTestId("consumer-canvas");
        await expect(canvas).toHaveAttribute("data-action", "run");
        const first = await canvas.getAttribute("data-frame-position");
        await expect
          .poll(() => canvas.getAttribute("data-frame-position"))
          .not.toBe(first);
        await player.getByRole("button", { name: "Left", exact: true }).click();
        await expect(
          player.getByRole("button", { name: "Left", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await player.screenshot({
          path: `${output}/${pack.view}-independent.png`,
          fullPage: true,
        });
        const reexport = await download(
          player,
          player.getByRole("button", {
            name: "Export selected CharacterPack",
            exact: true,
          }),
          `${output}/${pack.view}-reexport.zip`,
        );
        expect(reexport.bytes).toEqual(pack.bytes);
        expect(forbidden).toEqual([]);
        independentRows.push({
          view: pack.view,
          workbenchClosed: page.isClosed(),
          newBrowserContext: true,
          byteExactReexport: true,
          forbiddenRequests: forbidden,
        });
      } finally {
        await context.close();
      }
    }
    expect(errors).toEqual([]);
    await writeFile(`${output}/exports.json`, JSON.stringify(rows, null, 2));
    await writeFile(
      `${output}/independent.json`,
      JSON.stringify(independentRows, null, 2),
    );
    const independentAudit = execFileSync(
      "node",
      ["scripts/verify-dual-view-wardrobe.mjs", `${output}/exports.json`],
      { encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
    );
    expect(JSON.parse(independentAudit).passed).toBe(true);
  });
}

test("mixed shared choices reopen atomically and a damaged embedded view leaves the current pair intact", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const output = `${evidence}/roundtrip`;
  await mkdir(output, { recursive: true });
  await page.goto("/workbench.html?mode=paired&character=female&view=original");
  await ready(page);
  // The legacy archive contract deliberately retains the complete source clips.
  await page.getByTestId("dual-motion-mode").selectOption("source");
  await ready(page);
  await expect(page.getByTestId("dual-motion-mode")).toHaveValue("source");
  await page.getByTestId("dual-palette").selectOption("sea");
  await ready(page);
  await page.getByTestId("dual-bottom").selectOption("");
  await ready(page);
  await pose(page, "celebrate", 5, "left");
  const original = await exported(
    page,
    "export-png",
    `${output}/original-mixed.png`,
  );
  await view(page, "side");
  await expect(page.getByTestId("dual-palette")).toHaveValue("sea");
  await expect(page.getByTestId("dual-bottom")).toHaveValue("");
  await expect(
    page.getByTestId("dual-action").locator('option[value="celebrate"]'),
  ).toHaveJSProperty("disabled", true);
  await pose(page, "walk", 6, "right");
  const side = await exported(page, "export-png", `${output}/side-mixed.png`);
  const saved = await exported(
    page,
    "save-project",
    `${output}/mixed-pair.zip`,
  );
  const accepted = inspectBundle(saved.bytes, "female");
  expect(accepted.manifest.activeView).toBe("side");
  expect(accepted.manifest.selection).toEqual({
    outfitId: "cotton-day",
    paletteId: "sea",
    topId: "cotton-tank",
    bottomId: null,
  });
  for (const v of views)
    expect(accepted.documents[v].selection.bottom).toBeNull();
  const damaged = {
    ...accepted.files,
    "side.wardrobe.zip": new Uint8Array(accepted.files["side.wardrobe.zip"]),
  };
  damaged["side.wardrobe.zip"][100] ^= 1;
  await page.getByTestId("dual-project-input").setInputFiles({
    name: "damaged-pair.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(damaged)),
  });
  await ready(page);
  await expect(
    page.getByTestId("dual-wardrobe").getByRole("alert"),
  ).toContainText("checksum");
  const preserved = await exported(
    page,
    "export-png",
    `${output}/after-rejected-input.png`,
  );
  expect(preserved.bytes).toEqual(side.bytes);
  await page.reload();
  await ready(page);
  await page.getByTestId("dual-project-input").setInputFiles(saved.path);
  await ready(page);
  await expect(page.getByTestId("workbench-source")).toHaveValue("side-view");
  await expect(stage(page)).toHaveAttribute("data-view", "side");
  await expect(page.getByTestId("dual-palette")).toHaveValue("sea");
  await expect(page.getByTestId("dual-bottom")).toHaveValue("");
  await pause(page);
  await expect(stage(page)).toHaveAttribute("data-action", "walk");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "6");
  expect(
    (await exported(page, "export-png", `${output}/side-reopened.png`)).bytes,
  ).toEqual(side.bytes);
  await view(page, "original");
  await pause(page);
  await expect(stage(page)).toHaveAttribute("data-action", "celebrate");
  await expect(stage(page)).toHaveAttribute("data-frame-position", "5");
  await expect(stage(page)).toHaveAttribute("data-facing", "left");
  expect(
    (await exported(page, "export-png", `${output}/original-reopened.png`))
      .bytes,
  ).toEqual(original.bytes);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
});
