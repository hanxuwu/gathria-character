import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";

// Cases use separate browser contexts and character-specific output folders.
test.describe.configure({ mode: "parallel" });

const evidence = "/tmp/dual-tailored";
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
  test(`${character}: tailored shirt or blouse and trousers or skirt preserve native actions and independent playback`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(900_000);
    const output = `${evidence}/${character}`;
    await mkdir(output, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `/workbench.html?mode=paired&character=${character}&view=original`,
    );
    await ready(page);
    await expect(stage(page)).toHaveAttribute("data-character", character);
    await expect(page.getByTestId("dual-palette")).toHaveValue(
      character === "male" ? "sea" : "apricot",
    );
    await expect(page.getByTestId("dual-outfit")).toHaveValue("cotton-day");
    await expect(page.getByTestId("dual-top")).toHaveValue("cotton-tank");
    await expect(page.getByTestId("dual-bottom")).toHaveValue("cotton-shorts");
    const topId = character === "male" ? "daily-shirt" : "daily-blouse";
    const bottomId = character === "male" ? "daily-trousers" : "daily-skirt";
    // Export the unchanged source through the application before dressing it.
    await page.getByTestId("dual-top").selectOption("");
    await ready(page);
    await page.getByTestId("dual-bottom").selectOption("");
    await ready(page);
    const baselines = {} as Record<
      View,
      {
        png: string;
        frameId: number;
        registrationSha256: string;
        sourceSha256: string;
        gifs: Record<string, string>;
      }
    >;
    for (const v of views) {
      await view(page, v);
      await pose(page, "run", 3, "right");
      const baselinePng = await exported(
        page,
        "export-png",
        `${output}/${v}-source-run-right.png`,
      );
      const baseline = {
        png: baselinePng.path,
        frameId: Number(await stage(page).getAttribute("data-frame-id")),
        registrationSha256: (await stage(page).getAttribute(
          "data-registration-sha",
        ))!,
        sourceSha256: (await stage(page).getAttribute("data-source-sha"))!,
        gifs: {} as Record<string, string>,
      };
      for (const action of ["run", "jump"]) {
        await pose(page, action, 0, "right");
        baseline.gifs[action] = (
          await exported(
            page,
            "export-gif",
            `${output}/${v}-source-${action}-right.gif`,
          )
        ).path;
      }
      baselines[v] = baseline;
    }
    await page.getByTestId("dual-outfit").selectOption("tailored-day");
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("tailored-day");
    await expect(page.getByTestId("dual-top")).toHaveValue(topId);
    await expect(page.getByTestId("dual-bottom")).toHaveValue(bottomId);
    const rows: Array<{
      character: string;
      view: View;
      project: string;
      pack: string;
      png: { right: string; left: string; frameId: number };
      gifs: Record<string, { right: string; left: string }>;
      baseline: (typeof baselines)[View];
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
      expect(document.sourceSha256).toBe(baselines[v].sourceSha256);
      if (v === "side")
        expect(document.registrationSha256).not.toBe(
          baselines[v].registrationSha256,
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
        baseline: baselines[v],
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
      outfitId: "tailored-day",
      paletteId: character === "male" ? "sea" : "apricot",
      topId,
      bottomId,
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
      ["scripts/verify-dual-tailored-exports.mjs", `${output}/exports.json`],
      { encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
    );
    expect(JSON.parse(independentAudit).passed).toBe(true);
  });
}

for (const character of ["male", "female"] as const) {
  test(`${character}: new garments mixed with original clothing roundtrip while legacy pair bytes and failed-input state stay exact`, async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const output = `${evidence}/${character}-roundtrip`;
    await mkdir(output, { recursive: true });
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    const legacyPng: Partial<Record<View, Uint8Array>> = {};
    const legacyRegistrations: Partial<Record<View, string>> = {};
    for (const v of views) {
      await view(page, v);
      await pose(page, "run", 3, "right");
      legacyPng[v] = (
        await exported(page, "export-png", `${output}/${v}-cotton.png`)
      ).bytes;
      legacyRegistrations[v] = (await stage(page).getAttribute(
        "data-registration-sha",
      ))!;
    }
    await view(page, "original");
    const legacy = await exported(
      page,
      "save-project",
      `${output}/legacy-cotton.zip`,
    );
    const publishedLegacy = JSON.parse(
      await readFile(
        `docs/dual-view-wardrobe/review/${character}/editable-archive-checksums.json`,
        "utf8",
      ),
    );
    const legacyHash = publishedLegacy.archives.find(
      (row: { file: string }) => row.file === "both-views.zip",
    ).sha256;
    expect(sha(legacy.bytes)).toBe(legacyHash);
    inspectBundle(legacy.bytes, character);

    // Fail a side garment fetch after starting a collection change; the old
    // pair remains accepted in both native views and is still exportable.
    const catalog = JSON.parse(
      await readFile("docs/dual-tailored/assets/catalog.json", "utf8"),
    );
    const sideSpecification = catalog.representations.find(
      (row: { character: string; view: string }) =>
        row.character === character && row.view === "side",
    );
    const blockedAsset = sideSpecification.items.find(
      (row: { logicalId: string; palette: string }) =>
        row.logicalId ===
          (character === "male" ? "daily-trousers" : "daily-skirt") &&
        row.palette === (character === "male" ? "sea" : "apricot"),
    );
    const blockedPattern = `**${blockedAsset.url}`;
    await page.route(blockedPattern, (route) =>
      route.fulfill({ status: 503, body: "test unavailable garment" }),
    );
    await page.getByTestId("dual-outfit").selectOption("tailored-day");
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("cotton-day");
    await expect(
      page.getByTestId("dual-wardrobe").getByRole("alert"),
    ).toBeVisible();
    for (const v of views) {
      await view(page, v);
      expect(
        (await exported(page, "export-png", `${output}/${v}-failed-load.png`))
          .bytes,
      ).toEqual(legacyPng[v]);
    }
    await page.unroute(blockedPattern);

    await page.getByTestId("dual-outfit").selectOption("tailored-day");
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("tailored-day");
    await expect(stage(page)).toHaveAttribute("data-action", "run");
    await expect(stage(page)).toHaveAttribute("data-frame-position", "3");
    expect(await stage(page).getAttribute("data-registration-sha")).not.toBe(
      legacyRegistrations.side,
    );
    const topId = character === "male" ? "daily-shirt" : "daily-blouse";
    const bottomId = character === "male" ? "daily-trousers" : "daily-skirt";
    const palette = character === "male" ? "apricot" : "sea";
    await page.getByTestId("dual-palette").selectOption(palette);
    await ready(page);
    await page.getByTestId("dual-bottom").selectOption("");
    await ready(page);
    const mixedA: Partial<Record<View, Uint8Array>> = {};
    for (const v of views) {
      await view(page, v);
      await expect(page.getByTestId("dual-top")).toHaveValue(topId);
      await expect(page.getByTestId("dual-bottom")).toHaveValue("");
      await pose(
        page,
        v === "original" ? "celebrate" : "jump",
        v === "original" ? 5 : 24,
        v === "original" ? "left" : "right",
      );
      mixedA[v] = (
        await exported(
          page,
          "export-png",
          `${output}/${v}-new-top-source-bottom.png`,
        )
      ).bytes;
    }
    const savedA = await exported(
      page,
      "save-project",
      `${output}/new-top-source-bottom.zip`,
    );
    const parsedA = inspectBundle(savedA.bytes, character);
    expect(parsedA.manifest.selection).toEqual({
      outfitId: "tailored-day",
      paletteId: palette,
      topId,
      bottomId: null,
    });

    await page.getByTestId("dual-top").selectOption("");
    await ready(page);
    await page.getByTestId("dual-bottom").selectOption(bottomId);
    await ready(page);
    const mixedB: Partial<Record<View, Uint8Array>> = {};
    for (const v of views) {
      await view(page, v);
      await expect(page.getByTestId("dual-palette")).toHaveValue(palette);
      mixedB[v] = (
        await exported(
          page,
          "export-png",
          `${output}/${v}-source-top-new-bottom.png`,
        )
      ).bytes;
    }
    const savedB = await exported(
      page,
      "save-project",
      `${output}/source-top-new-bottom.zip`,
    );
    const accepted = inspectBundle(savedB.bytes, character);
    expect(accepted.manifest.selection).toEqual({
      outfitId: "tailored-day",
      paletteId: palette,
      topId: null,
      bottomId,
    });
    const mislabelled = {
      ...accepted.files,
      "manifest.json": Buffer.from(
        JSON.stringify({
          ...accepted.manifest,
          selection: {
            ...accepted.manifest.selection,
            bottomId: "cotton-shorts",
          },
        }),
      ),
    };
    const mislabelledPath = `${output}/unsupported-cotton-label.zip`;
    await writeFile(mislabelledPath, zipSync(mislabelled));
    await page.getByTestId("dual-project-input").setInputFiles(mislabelledPath);
    await ready(page);
    await expect(
      page.getByTestId("dual-wardrobe").getByRole("alert"),
    ).toBeVisible();
    expect(
      (
        await exported(
          page,
          "export-png",
          `${output}/after-unsupported-cotton.png`,
        )
      ).bytes,
    ).toEqual(mixedB.side);
    const damaged = {
      ...accepted.files,
      "side.wardrobe.zip": new Uint8Array(accepted.files["side.wardrobe.zip"]),
    };
    damaged["side.wardrobe.zip"][100] ^= 1;
    const damagedPath = `${output}/damaged-tailored.zip`;
    await writeFile(damagedPath, zipSync(damaged));
    await page.getByTestId("dual-project-input").setInputFiles(damagedPath);
    await ready(page);
    await expect(
      page.getByTestId("dual-wardrobe").getByRole("alert"),
    ).toContainText("checksum");
    expect(
      (await exported(page, "export-png", `${output}/after-rejected-input.png`))
        .bytes,
    ).toEqual(mixedB.side);

    await page.reload();
    await ready(page);
    await page.getByTestId("dual-project-input").setInputFiles(savedA.path);
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("tailored-day");
    for (const v of views) {
      await view(page, v);
      await expect(stage(page)).toHaveAttribute(
        "data-action",
        v === "original" ? "celebrate" : "jump",
      );
      await expect(stage(page)).toHaveAttribute(
        "data-frame-position",
        v === "original" ? "5" : "24",
      );
      expect(
        (
          await exported(
            page,
            "export-png",
            `${output}/${v}-mixed-reopened.png`,
          )
        ).bytes,
      ).toEqual(mixedA[v]);
    }
    await page.getByTestId("dual-project-input").setInputFiles(legacy.path);
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("cotton-day");
    for (const v of views) {
      await view(page, v);
      expect(await stage(page).getAttribute("data-registration-sha")).toBe(
        legacyRegistrations[v],
      );
      expect(
        (
          await exported(
            page,
            "export-png",
            `${output}/${v}-cotton-reopened.png`,
          )
        ).bytes,
      ).toEqual(legacyPng[v]);
    }
    await view(page, "original");
    const resavedLegacy = await exported(
      page,
      "save-project",
      `${output}/legacy-cotton-resaved.zip`,
    );
    expect(sha(resavedLegacy.bytes)).toBe(legacyHash);
    await page.getByTestId("dual-project-input").setInputFiles(savedB.path);
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("tailored-day");
    await expect(page.getByTestId("dual-top")).toHaveValue("");
    await expect(page.getByTestId("dual-bottom")).toHaveValue(bottomId);
    for (const v of views) {
      await view(page, v);
      expect(
        (
          await exported(
            page,
            "export-png",
            `${output}/${v}-reverse-mixed-reopened.png`,
          )
        ).bytes,
      ).toEqual(mixedB[v]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
    await writeFile(
      `${output}/roundtrip.json`,
      JSON.stringify(
        {
          character,
          legacySha256: legacyHash,
          byteExactLegacy: true,
          rejectedMissingSideAssetPreservesBoth: true,
          rejectedDamagedProjectPreservesBoth: true,
          rejectedUnsupportedCottonLabel: true,
          mixedNewTopSourceBottomReopenedExact: true,
          mixedSourceTopNewBottomReopenedExact: true,
          originalAndSidePreviewRestored: true,
          mobileWidth: 390,
        },
        null,
        2,
      ) + "\n",
    );
  });
}
