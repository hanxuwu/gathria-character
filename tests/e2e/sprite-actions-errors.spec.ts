import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

test("derived metadata errors retain the accepted action project and playback", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const files = unzipSync(
    new Uint8Array(
      await readFile(
        "docs/kling-native-female/final/kling-female-native-stills.character.zip",
      ),
    ),
  );
  const recipe = JSON.parse(strFromU8(files["character.json"]));
  // This is a valid source recipe. Appending the truthful editing provenance
  // makes a derived recipe exceed its limit, after the action fields validate.
  recipe.provenance = "P".repeat(32768);
  files["character.json"] = strToU8(JSON.stringify(recipe));
  const source = zipSync(files, { level: 0 });
  await page.goto("/player.html?authoring=1");
  await page.locator("#player-zip").setInputFiles({
    name: "near-limit.character.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(source),
  });
  const editor = page.getByRole("region", { name: "Sprite action editor" });
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await expect(editor.getByLabel("Start frame", { exact: true })).toBeEnabled({
    timeout: 60000,
  });
  await button("Run").click();
  await expect(page.locator(".player-timing")).toHaveText("1 FPS · ONCE");
  await editor.getByLabel("Action FPS", { exact: true }).fill("2");
  await editor.getByLabel("Loop action", { exact: true }).check();
  await button("Apply action settings").click();
  await expect(editor.getByRole("alert")).toContainText(
    "character.json.provenance must be nonempty text of at most 32768 characters",
  );
  await expect(page.locator(".player-timing")).toHaveText("1 FPS · ONCE");
  await expect(page.getByTestId("sprite-edit-state")).toHaveText(
    "Source settings",
  );
  await expect(button("Undo action edit")).toBeDisabled();
  await expect(page.getByTestId("consumer-canvas")).toBeVisible();
  await button("Discard unapplied changes").click();
  await expect(editor.getByLabel("Action FPS", { exact: true })).toHaveValue(
    "1",
  );
  await expect(
    editor.getByLabel("Loop action", { exact: true }),
  ).not.toBeChecked();

  // Persistence must contain the accepted settings, not the rejected draft.
  const savedDownload = page.waitForEvent("download");
  await button("Save action project").click();
  const savedPath = info.outputPath("accepted.sprite-project.zip");
  await (await savedDownload).saveAs(savedPath);
  const project = unzipSync(new Uint8Array(await readFile(savedPath)));
  const document = JSON.parse(strFromU8(project["document.json"]));
  expect(document.actions.run).toEqual({
    start: 0,
    end: 0,
    fps: 1,
    loop: false,
  });
  expect(project["original.character.zip"]).toEqual(source);

  // A valid project document can fail only when its derived recipe is built.
  // Opening it must leave the existing session usable, just like failed apply.
  document.actions.run.fps = 2;
  project["document.json"] = strToU8(JSON.stringify(document));
  await page.getByLabel("Open action project", { exact: true }).setInputFiles({
    name: "overflow.sprite-project.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipSync(project, { level: 0 })),
  });
  await expect(editor.getByRole("alert")).toContainText(
    "character.json.provenance",
  );
  await expect(editor.getByLabel("Action FPS", { exact: true })).toBeEnabled();
  await expect(editor.getByLabel("Action FPS", { exact: true })).toHaveValue(
    "1",
  );
  await expect(page.locator(".player-timing")).toHaveText("1 FPS · ONCE");
  await expect(page.getByTestId("sprite-edit-state")).toHaveText(
    "Source settings",
  );
  await expect(button("Undo action edit")).toBeDisabled();
  await button("Walk").click();
  await expect(page.getByTestId("consumer-canvas")).toHaveAttribute(
    "data-frame-id",
    "1",
  );
  expect(errors).toEqual([]);
});
