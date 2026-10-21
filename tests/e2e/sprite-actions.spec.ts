import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";

const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const editor = (page: Page) =>
  page.getByRole("region", { name: "Sprite action editor" });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

async function download(
  page: Page,
  name: string,
  info: TestInfo,
  file: string,
) {
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await button(page, name).click();
  const output = info.outputPath(file);
  await (await pending).saveAs(output);
  return { path: output, bytes: new Uint8Array(await readFile(output)) };
}
async function open(page: Page, character: "male" | "female") {
  await page.goto(`/player.html?kling=${character}&authoring=1`);
  await expect(editor(page)).toBeVisible({ timeout: 120000 });
  await expect(
    editor(page).getByLabel("Start frame", { exact: true }),
  ).toBeEnabled({ timeout: 120000 });
}
async function apply(
  page: Page,
  start: number,
  end: number,
  fps: number,
  loop: boolean,
) {
  const panel = editor(page);
  await panel.getByLabel("Start frame", { exact: true }).fill(String(start));
  await panel.getByLabel("End frame", { exact: true }).fill(String(end));
  await panel.getByLabel("Action FPS", { exact: true }).fill(String(fps));
  await panel.getByLabel("Loop action", { exact: true }).setChecked(loop);
  await button(page, "Apply action settings").click();
  await expect(page.locator(".player-timing")).toHaveText(
    `${fps} FPS · ${loop ? "LOOP" : "ONCE"}`,
  );
}

for (const character of ["male", "female"] as const) {
  test(`${character}: action edits preserve source pixels through save, reopen and independent playback`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const source = new Uint8Array(
      await readFile(`docs/kling-jump/exports/${character}.character.zip`),
    );
    const original = unzipSync(source);
    const originalManifest = JSON.parse(
      Buffer.from(original["manifest.json"]).toString(),
    );
    await open(page, character);
    await button(page, "Run").click();
    await apply(page, 2, 6, 12, false);
    if (character === "male") {
      // Unapplied fields must not be silently discarded by character changes.
      await editor(page).getByLabel("Start frame", { exact: true }).fill("3");
      await expect(
        page.getByLabel("Character", { exact: true }),
      ).toBeDisabled();
      await button(page, "Discard unapplied changes").click();
      await expect(
        editor(page).getByLabel("Start frame", { exact: true }),
      ).toHaveValue("2");
      await expect(page.getByLabel("Character", { exact: true })).toBeEnabled();
      // Each character keeps its own edits; selecting another never copies them.
      await page
        .getByLabel("Character", { exact: true })
        .selectOption("female");
      await expect(
        editor(page).getByLabel("Start frame", { exact: true }),
      ).toBeEnabled({ timeout: 120000 });
      await button(page, "Run").click();
      await expect(page.locator(".player-timing")).toHaveText("24 FPS · LOOP");
      await page.getByLabel("Character", { exact: true }).selectOption("male");
      await expect(page.locator(".player-timing")).toHaveText("12 FPS · ONCE", {
        timeout: 120000,
      });
      await expect(
        editor(page).getByLabel("Start frame", { exact: true }),
      ).toHaveValue("2");
      await expect(
        editor(page).getByLabel("End frame", { exact: true }),
      ).toHaveValue("6");
    }
    const canvas = page.getByTestId("consumer-canvas");
    await page.locator("#player-frame").fill("0");
    await expect(canvas).toHaveAttribute(
      "data-frame-id",
      String(originalManifest.animations.run.frames[1]),
    );
    await button(page, "Next frame").click();
    await expect(canvas).toHaveAttribute("data-frame-position", "1");
    await button(page, "Previous frame").click();
    await expect(canvas).toHaveAttribute("data-frame-position", "0");
    await expect(page.getByTestId("sprite-first-frame")).toBeVisible();
    await expect(page.getByTestId("sprite-last-frame")).toBeVisible();
    const saved = await download(
      page,
      "Save action project",
      info,
      `${character}.sprite-project.zip`,
    );
    const exported = await download(
      page,
      "Export edited CharacterPack",
      info,
      `${character}.character.zip`,
    );
    const pack = unzipSync(exported.bytes);
    const manifest = JSON.parse(Buffer.from(pack["manifest.json"]).toString());
    expect(manifest.animations.run).toEqual({
      frames: originalManifest.animations.run.frames.slice(1, 6),
      fps: 12,
      loop: false,
    });
    expect(manifest.frames).toEqual(originalManifest.frames);
    expect(manifest.anchor).toEqual(originalManifest.anchor);
    for (const name of Object.keys(original).filter((name) =>
      name.endsWith(".png"),
    ))
      expect(digest(pack[name]), name).toBe(digest(original[name]));
    await button(page, "Reset action to source").click();
    await expect(page.locator(".player-timing")).toHaveText("24 FPS · LOOP");
    await page
      .getByLabel("Open action project", { exact: true })
      .setInputFiles(saved.path);
    // Source loading resets the current action to Idle, then the editor restores
    // this ZIP's saved settings. Wait for that completed state before choosing
    // Run; a click during the import's transient enabled state can be discarded.
    await expect(editor(page).getByRole("status")).toContainText(
      "Restored this source’s action edits.",
      { timeout: 120000 },
    );
    await expect(
      editor(page).getByLabel("Start frame", { exact: true }),
    ).toBeEnabled({ timeout: 120000 });
    await button(page, "Run").click();
    await expect(page.locator(".player-timing")).toHaveText("12 FPS · ONCE");
    await expect(
      editor(page).getByLabel("Start frame", { exact: true }),
    ).toHaveValue("2");
    await expect(
      editor(page).getByLabel("End frame", { exact: true }),
    ).toHaveValue("6");
    // Failed project import must retain the current character and authored settings.
    await page
      .getByLabel("Open action project", { exact: true })
      .setInputFiles({
        name: "broken.zip",
        mimeType: "application/zip",
        buffer: Buffer.from("invalid"),
      });
    await expect(editor(page).getByRole("alert")).toBeVisible();
    await expect(page.locator(".player-timing")).toHaveText("12 FPS · ONCE");
    await page.close();
    const independent = await context.newPage();
    const forbidden: string[] = [];
    independent.on("request", (request) => {
      if (
        /SpriteActionEditor|sprite-actions\.ts|\/src\/skeletal\//.test(
          request.url(),
        )
      )
        forbidden.push(request.url());
    });
    independent.on("pageerror", (error) => errors.push(error.message));
    await independent.goto("/player.html");
    await independent.locator("#player-zip").setInputFiles(exported.path);
    await expect(independent.getByRole("status")).toContainText("Loaded:", {
      timeout: 120000,
    });
    await button(independent, "Run").click();
    await expect(button(independent, "Replay animation")).toBeVisible({
      timeout: 10000,
    });
    await expect(independent.getByTestId("consumer-canvas")).toHaveAttribute(
      "data-frame-id",
      String(manifest.animations.run.frames.at(-1)),
    );
    for (const direction of ["Left", "Right"]) {
      await button(independent, direction).click();
      await button(independent, "Replay clip").click();
      await expect(independent.getByTestId("consumer-canvas")).toHaveAttribute(
        "aria-label",
        new RegExp(`run, facing ${direction.toLowerCase()}`),
      );
      await expect(button(independent, "Replay animation")).toBeVisible({
        timeout: 10000,
      });
    }
    expect(forbidden).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("invalid ranges preserve edits; reset restores the original jump and byte-exact export", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await open(page, "female");
  await button(page, "Jump").click();
  await expect(page.locator(".player-timing")).toHaveText("24 FPS · ONCE");
  await apply(page, 4, 12, 10, true);
  await button(page, "Undo action edit").click();
  await expect(page.locator(".player-timing")).toHaveText("24 FPS · ONCE");
  await apply(page, 4, 12, 10, true);
  await editor(page).getByLabel("Start frame", { exact: true }).fill("30");
  await editor(page).getByLabel("End frame", { exact: true }).fill("2");
  await button(page, "Apply action settings").click();
  await expect(editor(page).getByRole("alert")).toBeVisible();
  await expect(page.locator(".player-timing")).toHaveText("10 FPS · LOOP");
  await button(page, "Reset action to source").click();
  await expect(page.locator(".player-timing")).toHaveText("24 FPS · ONCE");
  const restored = await download(
    page,
    "Export edited CharacterPack",
    info,
    "restored.character.zip",
  );
  expect(digest(restored.bytes)).toBe(
    digest(await readFile("docs/kling-jump/exports/female.character.zip")),
  );
});

test("an imported V2 pack can be arranged without inventing missing actions", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/player.html?authoring=1");
  await page
    .locator("#player-zip")
    .setInputFiles(
      "docs/kling-native-female/final/kling-female-native-stills.character.zip",
    );
  await expect(editor(page)).toBeVisible({ timeout: 60000 });
  await expect(
    editor(page).getByLabel("Start frame", { exact: true }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(button(page, "Jump")).toBeDisabled();
  await button(page, "Run").click();
  await apply(page, 1, 1, 2, true);
  const exported = await download(
    page,
    "Export edited CharacterPack",
    info,
    "imported-v2.character.zip",
  );
  const files = unzipSync(exported.bytes);
  const manifest = JSON.parse(Buffer.from(files["manifest.json"]).toString());
  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.animations.jump).toBeUndefined();
  expect(manifest.animations.run).toEqual({ frames: [2], fps: 2, loop: true });
  const source = unzipSync(
    new Uint8Array(
      await readFile(
        "docs/kling-native-female/final/kling-female-native-stills.character.zip",
      ),
    ),
  );
  expect(digest(files["spritesheet.png"])).toBe(
    digest(source["spritesheet.png"]),
  );
});
