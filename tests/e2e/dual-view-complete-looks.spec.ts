import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";
import { readPortableCharacterPackArchive } from "../../src/core/pack";

test.describe.configure({ mode: "parallel" });
const evidence =
  process.env.GATHRIA_REVIEW_EXPORT_ROOT ?? "/tmp/paired-polish/exports";
const baselineDirectory = process.env.GATHRIA_REVIEW_EXPORT_ROOT
  ? `${evidence}/baseline`
  : "/tmp/paired-polish/baseline";
type View = "original" | "side";
const views: View[] = ["original", "side"];
const stage = (page: Page) => page.getByTestId("dual-stage");
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function expectBytes(actual: Uint8Array) {
  return {
    toEqual(expected: Uint8Array) {
      const a = Buffer.from(actual),
        b = Buffer.from(expected);
      expect(
        a.equals(b),
        `Binary mismatch: ${a.length}/${sha(a)} versus ${b.length}/${sha(b)}`,
      ).toBe(true);
    },
  };
}
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
async function view(page: Page, v: View) {
  await page
    .getByTestId("workbench-source")
    .selectOption(v === "side" ? "side-view" : "original");
  await ready(page);
  await expect(stage(page)).toHaveAttribute("data-view", v);
}
async function pose(
  page: Page,
  action: string,
  position = 3,
  facing = "right",
) {
  await pause(page);
  await page.getByTestId("dual-action").selectOption(action);
  await page.getByTestId("dual-frame").fill(position === 0 ? "1" : "0");
  await page.getByTestId("dual-frame").fill(String(position));
  await page.getByTestId("dual-facing").selectOption(facing);
  await expect(stage(page)).toHaveAttribute("data-action", action);
  await expect(stage(page)).toHaveAttribute(
    "data-frame-position",
    String(position),
  );
  await expect(stage(page)).toHaveAttribute("data-facing", facing);
}
async function choose(page: Page, id: string, value: string) {
  await page.getByTestId(id).selectOption(value);
  await ready(page);
  await expect(page.getByTestId(id)).toHaveValue(value);
}
async function download(page: Page, control: Locator, path: string) {
  const waiting = page.waitForEvent("download", { timeout: 180_000 });
  await control.click();
  const result = await waiting;
  expect(await result.failure()).toBeNull();
  await result.saveAs(path);
  const bytes = await readFile(path);
  if (path.endsWith(".zip"))
    await writeFile(
      `${path}.receipt.json`,
      JSON.stringify(
        {
          path,
          filename: result.suggestedFilename(),
          bytes: bytes.length,
          sha256: sha(bytes),
          provenance: "Actual browser download",
        },
        null,
        2,
      ) + "\n",
    );
  return {
    path,
    bytes,
    filename: result.suggestedFilename(),
  };
}
async function exported(page: Page, kind: string, path: string) {
  const result = await download(page, page.getByTestId(`dual-${kind}`), path);
  await ready(page);
  return result;
}
async function appearanceCatalog(previous = false) {
  return JSON.parse(
    await readFile(
      `docs/${previous ? "matched-hair/assets/catalog" : "paired-polish/assets/appearance-catalog"}.json`,
      "utf8",
    ),
  );
}
function bundle(bytes: Uint8Array, character: string) {
  const files = unzipSync(bytes),
    manifest = json(files["manifest.json"]);
  expect(Object.keys(files).sort()).toEqual([
    "manifest.json",
    "original.wardrobe.zip",
    "side.wardrobe.zip",
  ]);
  expect(manifest.format).toBe("gathria-dual-view-wardrobe");
  expect(manifest.version).toBe(1);
  expect(manifest.character).toBe(character);
  const native: Record<
    string,
    { files: ReturnType<typeof unzipSync>; document: ReturnType<typeof json> }
  > = {};
  for (const v of views) {
    expect(sha(files[`${v}.wardrobe.zip`])).toBe(manifest.views[v].sha256);
    const content = unzipSync(files[`${v}.wardrobe.zip`]),
      document = json(content["document.json"]);
    expect(sha(content["source.character.zip"])).toBe(document.sourceSha256);
    expect(sha(content["registration.json"])).toBe(document.registrationSha256);
    if (document.appearance)
      expect(sha(content["appearance.zip"])).toBe(
        document.appearance.bankSha256,
      );
    native[v] = { files: content, document };
  }
  return { files, manifest, native };
}

// This recipe reproduces the previous actual UI download byte-for-byte, with
// source/assets reused from their immutable repository paths.
async function previousAppearanceProject(
  _bytes: Uint8Array,
  character: string,
) {
  const path = `${baselineDirectory}/${character}.zip`;
  execFileSync("node", [
    "scripts/build-paired-polish-baseline.mjs",
    character,
    path,
  ]);
  return readFile(path);
}

for (const character of ["male", "female"] as const) {
  test(`${character}: complete paired look exports every native action and plays independently`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(900_000);
    const output = `${evidence}/${character}`;
    await mkdir(output, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const catalog = await appearanceCatalog();
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    // This regression retains the published source clocks and byte-exact exports.
    await page.getByTestId("dual-motion-mode").selectOption("source");
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue("source");
    await expect(page.getByTestId("dual-hair")).toHaveValue("");
    await expect(page.getByTestId("dual-face")).toHaveValue("");
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    const completeOutfit = await page.getByTestId("dual-outfit").inputValue();
    expect(completeOutfit).toBe("polished-day");
    await page.getByTestId("dual-reset-appearance").click();
    await ready(page);
    const baselines: Partial<
      Record<View, { png: string; pack: string; frameId: number }>
    > = {};
    for (const v of views) {
      await view(page, v);
      await pose(page, "run");
      baselines[v] = {
        png: (
          await exported(
            page,
            "export-png",
            `${output}/${v}-clothing-only-run-right.png`,
          )
        ).path,
        pack: (
          await exported(
            page,
            "export-pack",
            `${output}/${v}-clothing-only.character.zip`,
          )
        ).path,
        frameId: Number(await stage(page).getAttribute("data-frame-id")),
      };
    }
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue(completeOutfit);
    await expect(page.getByTestId("dual-hair")).toHaveValue("daily-hair");
    await expect(page.getByTestId("dual-face")).toHaveValue("gentle");
    await previousAppearanceProject(new Uint8Array(), character);
    const rows = [];
    for (const v of views) {
      const spec = catalog.representations.find(
        (r: { character: string; view: string }) =>
          r.character === character && r.view === v,
      );
      expect(spec).toBeTruthy();
      await view(page, v);
      await expect(page.getByTestId("dual-hair")).toHaveValue("daily-hair");
      await expect(page.getByTestId("dual-face")).toHaveValue("gentle");
      await expect(page.getByTestId("dual-hair-color")).toHaveValue("chestnut");
      await pose(page, "run");
      const frameId = Number(await stage(page).getAttribute("data-frame-id"));
      const right = await exported(
        page,
        "export-png",
        `${output}/${v}-run-right.png`,
      );
      await choose(page, "dual-facing", "left");
      const left = await exported(
        page,
        "export-png",
        `${output}/${v}-run-left.png`,
      );
      const image = decodeSourceRgbaPng(right.bytes),
        flipped = decodeSourceRgbaPng(left.bytes);
      expect([image.width, image.height]).toEqual([
        spec.frameWidth + spec.padding.left + spec.padding.right,
        spec.frameHeight + spec.padding.top + spec.padding.bottom,
      ]);
      expect([flipped.width, flipped.height]).toEqual([
        image.width,
        image.height,
      ]);
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
          const a = (y * image.width + x) * 4,
            b = (y * image.width + image.width - x - 1) * 4;
          for (let c = 0; c < 4; c++)
            if (image.pixels[a + c] !== flipped.pixels[b + c])
              throw Error(`Appearance PNG mirror differs ${x},${y},${c}`);
        }
      expect(image.pixels.some((value, i) => i % 4 === 3 && value === 0)).toBe(
        true,
      );
      await choose(page, "dual-facing", "right");
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
      if (v === "original")
        expectBytes(pack.bytes).toEqual(
          await readFile(
            `docs/matched-hair/review/${character}/original.character.zip`,
          ),
        );
      const nativeFiles = unzipSync(native.bytes),
        doc = json(nativeFiles["document.json"]);
      expect(doc.version).toBe(2);
      expect(doc.appearance).toEqual({
        bankSha256: spec.bankSha256,
        hairId: spec.hairId,
        faceId: spec.faceId,
        hairColor: "chestnut",
      });
      expect(sha(nativeFiles["appearance.zip"])).toBe(spec.bankSha256);
      const source = readPortableCharacterPackArchive(
          nativeFiles["source.character.zip"],
        ),
        final = readPortableCharacterPackArchive(pack.bytes);
      expect(final.manifest.frames.map((f) => f.id)).toEqual(
        source.manifest.frames.map((f) => f.id),
      );
      expect(final.manifest.animations).toEqual(source.manifest.animations);
      expect(final.config.derivation.frames).toEqual(
        source.config.derivation.frames,
      );
      expect(final.manifest.scale).toEqual(source.manifest.scale);
      expect(final.manifest.anchor).toEqual({
        ...source.manifest.anchor,
        x: source.manifest.anchor.x + spec.padding.left,
        y: source.manifest.anchor.y + spec.padding.top,
      });
      const row = {
        character,
        view: v,
        project: native.path,
        pack: pack.path,
        baseline: baselines[v],
        previousPack: `docs/dual-tailored/review/${character}/${v}.character.zip`,
        referencePair: `${baselineDirectory}/${character}.zip`,
        referenceCompletePack: `docs/matched-hair/review/${character}/${v}.character.zip`,
        referenceAppearanceBank: (await appearanceCatalog(true)).representations
          .find(
            (r: { character: string; view: string }) =>
              r.character === character && r.view === v,
          )
          .url.slice(1),
        ...(v === "side"
          ? { neckBinding: `artwork/matched-hair/${character}-binding.json` }
          : {}),
        png: { right: right.path, left: left.path, frameId },
        gifs: {} as Record<string, { right: string; left: string }>,
      };
      for (const action of ["walk", "run", "jump"]) {
        row.gifs[action] = { right: "", left: "" };
        for (const facing of action === "walk"
          ? (["right"] as const)
          : (["right", "left"] as const)) {
          await pose(page, action, 0, facing);
          row.gifs[action][facing] = (
            await exported(
              page,
              "export-gif",
              `${output}/${v}-${action}-${facing}.gif`,
            )
          ).path;
        }
      }
      if (v === "side") {
        expect(final.manifest.animations.celebrate).toBeUndefined();
        await expect(
          page.getByTestId("dual-action").locator('option[value="celebrate"]'),
        ).toHaveJSProperty("disabled", true);
      }
      await pose(page, "run");
      await page.screenshot({
        path: `${output}/${v}-workspace.png`,
        fullPage: true,
      });
      rows.push(row);
    }
    await view(page, "original");
    await choose(page, "dual-hair", "");
    await expect(page.getByTestId("dual-face")).toHaveValue("gentle");
    await page.getByTestId("dual-reset-appearance").click();
    await ready(page);
    expectBytes(
      (
        await exported(
          page,
          "export-png",
          `${output}/original-appearance-reset.png`,
        )
      ).bytes,
    ).toEqual(await readFile(baselines.original!.png));
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    expectBytes(
      (
        await exported(
          page,
          "export-png",
          `${output}/original-complete-restored.png`,
        )
      ).bytes,
    ).toEqual(await readFile(rows[0].png.right));
    const paired = await exported(
      page,
      "save-project",
      `${output}/both-views.zip`,
    );
    const saved = bundle(paired.bytes, character);
    for (const v of views)
      expect(saved.native[v].document.appearance.hairColor).toBe("chestnut");
    await page.close();
    const independent = [];
    for (const row of rows) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 1000 },
      });
      const forbidden: string[] = [];
      context.on("request", (request) => {
        if (
          /\/src\/(?:wardrobe|appearance|side-view|skeletal)\/|\/src\/workspace\/Workbench\.tsx|\/workbench\.html/.test(
            request.url(),
          )
        )
          forbidden.push(request.url());
      });
      const player = await context.newPage();
      try {
        await player.goto("http://127.0.0.1:5175/player.html");
        await player.locator("#player-zip").setInputFiles(row.pack);
        const pack = await readFile(row.pack),
          manifest = readPortableCharacterPackArchive(pack).manifest;
        await expect(player.locator(".player-status")).toHaveText(
          `Loaded: ${manifest.name}`,
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
          path: `${output}/${row.view}-independent.png`,
          fullPage: true,
        });
        const reexport = await download(
          player,
          player.getByRole("button", {
            name: "Export selected CharacterPack",
            exact: true,
          }),
          `${output}/${row.view}-reexport.zip`,
        );
        expectBytes(reexport.bytes).toEqual(pack);
        await rm(reexport.path);
        expect(forbidden).toEqual([]);
        independent.push({
          view: row.view,
          editorClosed: page.isClosed(),
          newBrowserContext: true,
          exactReexport: true,
          forbiddenRequests: forbidden,
        });
      } finally {
        await context.close();
      }
    }
    expect(errors).toEqual([]);
    await writeFile(
      `${output}/exports.json`,
      JSON.stringify(rows, null, 2) + "\n",
    );
    await writeFile(
      `${output}/independent.json`,
      JSON.stringify(independent, null, 2) + "\n",
    );
    const audit = execFileSync(
      "node",
      ["scripts/verify-paired-polish-exports.mjs", `${output}/exports.json`],
      { encoding: "utf8", timeout: 360_000, maxBuffer: 8 * 1024 * 1024 },
    );
    expect(JSON.parse(audit).passed).toBe(true);
  });

  test(`${character}: paired appearance is atomic, independently resettable and reopens with mixed clothes offline`, async ({
    page,
  }) => {
    test.setTimeout(750_000);
    const output = `${evidence}/${character}-roundtrip`;
    await mkdir(output, { recursive: true });
    const catalog = await appearanceCatalog();
    await page.goto(`/workbench.html?mode=paired&character=${character}`);
    await ready(page);
    // This regression retains the published source clocks and byte-exact exports.
    await page.getByTestId("dual-motion-mode").selectOption("source");
    await expect(page.getByTestId("dual-motion-mode")).toHaveValue("source");
    await choose(page, "dual-outfit", "tailored-day");
    const baseline = {} as Record<View, Buffer>;
    for (const v of views) {
      await view(page, v);
      await pose(page, "run");
      baseline[v] = (
        await exported(
          page,
          "export-png",
          `${output}/${v}-before-appearance.png`,
        )
      ).bytes;
    }
    const legacy = await exported(
      page,
      "save-project",
      `${output}/legacy-clothing-only.zip`,
    );
    const parsedLegacy = bundle(legacy.bytes, character);
    for (const v of views)
      expect(parsedLegacy.native[v].document.version).toBe(1);
    const side = catalog.representations.find(
      (r: { character: string; view: string }) =>
        r.character === character && r.view === "side",
    );
    const blocked = (url: URL) =>
      url.pathname === side.url && !url.searchParams.has("import");
    let blockedRequests = 0;
    await page.route(blocked, (route) => {
      blockedRequests++;
      return route.fulfill({
        status: 503,
        body: "reviewed side appearance unavailable",
      });
    });
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    expect(blockedRequests).toBeGreaterThan(0);
    await expect(page.getByTestId("dual-hair")).toHaveValue("");
    await expect(page.getByTestId("dual-outfit")).toHaveValue("tailored-day");
    await expect(
      page.getByTestId("dual-wardrobe").getByRole("alert"),
    ).toBeVisible();
    for (const v of views) {
      await view(page, v);
      expectBytes(
        (
          await exported(
            page,
            "export-png",
            `${output}/${v}-failed-appearance.png`,
          )
        ).bytes,
      ).toEqual(baseline[v]);
    }
    expectBytes(
      (
        await exported(
          page,
          "save-project",
          `${output}/after-failed-appearance.zip`,
        )
      ).bytes,
    ).toEqual(legacy.bytes);
    await page.unroute(blocked);
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("polished-day");
    await choose(page, "dual-hair-color", "espresso");
    await choose(
      page,
      "dual-palette",
      character === "male" ? "apricot" : "sea",
    );
    await choose(page, "dual-bottom", "");
    const mixed = {} as Record<View, Buffer>;
    for (const v of views) {
      await view(page, v);
      await pose(
        page,
        v === "original" ? "celebrate" : "jump",
        v === "original" ? 5 : 24,
        v === "original" ? "left" : "right",
      );
      mixed[v] = (
        await exported(page, "export-png", `${output}/${v}-mixed.png`)
      ).bytes;
    }
    const saved = await exported(
      page,
      "save-project",
      `${output}/complete-mixed.zip`,
    );
    const parsed = bundle(saved.bytes, character);
    expect(parsed.manifest.selection.bottomId).toBeNull();
    for (const v of views) {
      expect(parsed.native[v].document.appearance.hairColor).toBe("espresso");
      expect(parsed.native[v].document.selection.bottom).toBeNull();
    }
    // Copper is a material option, not a recolor of the face or source body.
    await choose(page, "dual-hair-color", "copper");
    const copper = await exported(
      page,
      "export-png",
      `${output}/side-copper.png`,
    );
    expect(copper.bytes.equals(mixed.side)).toBe(false);
    await choose(page, "dual-hair-color", "espresso");
    expectBytes(
      (
        await exported(
          page,
          "export-png",
          `${output}/side-espresso-restored.png`,
        )
      ).bytes,
    ).toEqual(mixed.side);
    const damaged = {
      ...parsed.files,
      "side.wardrobe.zip": new Uint8Array(parsed.files["side.wardrobe.zip"]),
    };
    damaged["side.wardrobe.zip"][100] ^= 1;
    const damagedPath = `${output}/damaged.zip`;
    await writeFile(damagedPath, zipSync(damaged));
    await page.getByTestId("dual-project-input").setInputFiles(damagedPath);
    await ready(page);
    await expect(
      page.getByTestId("dual-wardrobe").getByRole("alert"),
    ).toBeVisible();
    expectBytes(
      (
        await exported(
          page,
          "export-png",
          `${output}/after-rejected-project.png`,
        )
      ).bytes,
    ).toEqual(mixed.side);
    await choose(page, "dual-top", "");
    await choose(
      page,
      "dual-bottom",
      character === "male" ? "daily-trousers" : "daily-skirt",
    );
    const reverse = {} as Record<View, Buffer>;
    for (const v of views) {
      await view(page, v);
      reverse[v] = (
        await exported(page, "export-png", `${output}/${v}-reverse-mixed.png`)
      ).bytes;
    }
    const savedReverse = await exported(
      page,
      "save-project",
      `${output}/source-top-new-bottom.zip`,
    );
    await page.reload();
    await ready(page);
    const blockedAssets: string[] = [];
    const appearanceAssetRequest = (url: URL) =>
      /^\/docs\/(?:dual-looks|matched-hair|paired-polish)\/assets\//.test(
        url.pathname,
      ) &&
      url.pathname.endsWith(".zip") &&
      !url.searchParams.has("import");
    await page.route(appearanceAssetRequest, (route) => {
      blockedAssets.push(route.request().url());
      return route.abort();
    });
    await page.getByTestId("dual-project-input").setInputFiles(saved.path);
    await ready(page);
    for (const v of views) {
      await view(page, v);
      await expect(page.getByTestId("dual-hair")).toHaveValue("daily-hair");
      await expect(page.getByTestId("dual-face")).toHaveValue("gentle");
      await expect(page.getByTestId("dual-hair-color")).toHaveValue("espresso");
      await expect(stage(page)).toHaveAttribute(
        "data-action",
        v === "original" ? "celebrate" : "jump",
      );
      expectBytes(
        (await exported(page, "export-png", `${output}/${v}-reopened.png`))
          .bytes,
      ).toEqual(mixed[v]);
    }
    const resaved = await exported(
      page,
      "save-project",
      `${output}/complete-mixed-resaved.zip`,
    );
    expectBytes(resaved.bytes).toEqual(saved.bytes);
    expect(blockedAssets).toEqual([]);
    await page
      .getByTestId("dual-project-input")
      .setInputFiles(savedReverse.path);
    await ready(page);
    for (const v of views) {
      await view(page, v);
      await expect(page.getByTestId("dual-top")).toHaveValue("");
      await expect(page.getByTestId("dual-bottom")).toHaveValue(
        character === "male" ? "daily-trousers" : "daily-skirt",
      );
      expectBytes(
        (
          await exported(
            page,
            "export-png",
            `${output}/${v}-reverse-reopened.png`,
          )
        ).bytes,
      ).toEqual(reverse[v]);
    }
    expectBytes(
      (
        await exported(
          page,
          "save-project",
          `${output}/source-top-new-bottom-resaved.zip`,
        )
      ).bytes,
    ).toEqual(savedReverse.bytes);
    expect(blockedAssets).toEqual([]);
    await page.getByTestId("dual-project-input").setInputFiles(legacy.path);
    await ready(page);
    for (const v of views) {
      await view(page, v);
      await expect(page.getByTestId("dual-hair")).toHaveValue("");
      await expect(page.getByTestId("dual-face")).toHaveValue("");
      expectBytes(
        (
          await exported(
            page,
            "export-png",
            `${output}/${v}-legacy-reopened.png`,
          )
        ).bytes,
      ).toEqual(baseline[v]);
    }
    const legacyResaved = await exported(
      page,
      "save-project",
      `${output}/legacy-resaved.zip`,
    );
    expectBytes(legacyResaved.bytes).toEqual(legacy.bytes);
    const previousAppearance = await previousAppearanceProject(
        saved.bytes,
        character,
      ),
      previousAppearancePath = `${output}/previous-appearance-v2.zip`;
    await writeFile(previousAppearancePath, previousAppearance);
    await page
      .getByTestId("dual-project-input")
      .setInputFiles(previousAppearancePath);
    await ready(page);
    for (const v of views) {
      await view(page, v);
      expectBytes(
        (
          await exported(
            page,
            "export-png",
            `${output}/${v}-previous-appearance-reopened.png`,
          )
        ).bytes,
      ).toEqual(
        await readFile(
          `docs/matched-hair/review/${character}/${v}-run-right.png`,
        ),
      );
    }
    await view(page, "original");
    expectBytes(
      (
        await exported(
          page,
          "save-project",
          `${output}/previous-appearance-v2-resaved.zip`,
        )
      ).bytes,
    ).toEqual(previousAppearance);
    expect(blockedAssets).toEqual([]);
    await page.unroute(appearanceAssetRequest);
    // Revising registration and clothes requires the explicit full-look action.
    // Opening the old project above must never perform that upgrade silently.
    await page.getByTestId("dual-complete-look").click();
    await ready(page);
    await expect(page.getByTestId("dual-outfit")).toHaveValue("polished-day");
    for (const v of views) {
      await view(page, v);
      await pose(page, "run");
      await exported(
        page,
        "export-png",
        `${output}/${v}-explicit-complete-upgrade.png`,
      );
    }
    await page.getByTestId("dual-project-input").setInputFiles(saved.path);
    await ready(page);
    await choose(page, "dual-hair", "");
    await expect(page.getByTestId("dual-face")).toHaveValue("gentle");
    await choose(page, "dual-face", "");
    await expect(page.getByTestId("dual-top")).toHaveValue(
      character === "male" ? "daily-shirt" : "daily-blouse",
    );
    await expect(page.getByTestId("dual-bottom")).toHaveValue("");
    await choose(page, "dual-hair", "daily-hair");
    await choose(page, "dual-face", "gentle");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
    // Keep the editable accepted mixed project. Duplicate validation downloads
    // have checksum receipts; removing them avoids gigabytes of repeated source ZIPs.
    for (const name of [
      "after-failed-appearance.zip",
      "complete-mixed-resaved.zip",
      "source-top-new-bottom-resaved.zip",
      "legacy-resaved.zip",
      "previous-appearance-v2.zip",
      "previous-appearance-v2-resaved.zip",
      "damaged.zip",
      "legacy-clothing-only.zip",
      "source-top-new-bottom.zip",
    ])
      await rm(`${output}/${name}`, { force: true });
    await writeFile(
      `${output}/roundtrip.json`,
      JSON.stringify(
        {
          character,
          failedSideAppearancePreservesBoth: true,
          blockedSideAppearanceRequests: blockedRequests,
          corruptProjectPreservesAccepted: true,
          mixedClothesAppearanceReopensExact: true,
          reverseMixedClothesAppearanceReopensExact: true,
          offlineAppearanceFetches: blockedAssets,
          pairedZipByteExact: true,
          legacyClothingV1ByteExact: true,
          previousAppearanceV2ByteExact: true,
          previousAppearancePixelsExact: true,
          completeUpgradeRequiresExplicitChoice: true,
          independentHairAndFaceReset: true,
          hairColorsChecked: ["chestnut", "espresso", "copper"],
          mobileWidth: 390,
        },
        null,
        2,
      ) + "\n",
    );
  });
}
