import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import type { BakedCharacterPackManifest } from "../../src/core/types";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const canvas = (page: Page) => page.getByTestId("consumer-canvas");
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function pause(page: Page) {
  if (await button(page, "Pause animation").count())
    await button(page, "Pause animation").click();
}
async function controlled(page: Page, url: string) {
  await page.clock.install({ time: new Date("2026-10-21T11:00:00Z") });
  await page.goto(url);
  await expect(page.getByTestId("motion-study-note")).toBeVisible({
    timeout: 120000,
  });
  await page.clock.pauseAt(new Date("2026-10-21T12:00:00Z"));
  await pause(page);
}

for (const character of ["male", "female"] as const) {
  test(`${character}: reviewed requests retain full jumps, pause safely and export independently`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const bytes = new Uint8Array(
      await readFile(`docs/kling-motion/exports/${character}.character.zip`),
    );
    const manifest: BakedCharacterPackManifest = JSON.parse(
      Buffer.from(unzipSync(bytes)["manifest.json"]).toString(),
    );
    expect(manifest.animations.jump!.frames).toHaveLength(39);
    expect(manifest.animations.jump!.loop).toBe(false);
    await controlled(page, `/player.html?kling=${character}&variant=motion`);
    await expect(
      page.getByLabel("Wait for a matching pose", { exact: true }),
    ).toBeChecked();
    await expect(canvas(page)).toHaveAttribute("data-motion-flow", "true");
    await expect(
      page.getByRole("link", { name: "Open continuous-hop keyframes V1" }),
    ).toHaveAttribute(
      "href",
      `/player.html?kling=${character}&variant=keyframes`,
    );
    for (const direction of ["Right", "Left"]) {
      await pause(page);
      await button(page, direction).click();
      await button(page, "Jump").click();
      await page.locator("#player-frame").fill("10");
      await expect(canvas(page)).toHaveAttribute("data-frame-position", "10");
      await button(page, "Play animation").click();
      await page.clock.runFor(17);
      await button(page, "Run").click();
      await button(page, "Walk").click();
      await expect(page.getByTestId("motion-pending")).toContainText(
        "Next: walk",
      );
      await page.clock.runFor(100);
      await expect(canvas(page)).toHaveAttribute("data-action", "jump");
      await expect(canvas(page)).toHaveAttribute("data-pending-action", "walk");
      await pause(page);
      const frozen = await canvas(page).getAttribute("data-elapsed-ms");
      await page.clock.runFor(2000);
      await expect(canvas(page)).toHaveAttribute("data-elapsed-ms", frozen!);
      await expect(page.getByTestId("motion-pending")).toContainText(
        "Next: walk",
      );
      await button(page, "Play animation").click();
      await page.clock.runFor(1200);
      await expect(canvas(page)).toHaveAttribute("data-action", "walk");
      await expect(page.getByTestId("motion-pending")).toHaveText(
        "No action waiting.",
      );
      await expect(canvas(page)).toHaveAttribute(
        "aria-label",
        new RegExp(`walk, facing ${direction.toLowerCase()}`),
      );
    }
    await pause(page);
    await button(page, "Jump").click();
    await button(page, "Play animation").click();
    await page.clock.runFor(1700);
    await expect(canvas(page)).toHaveAttribute("data-action", "idle");
    await expect(button(page, "Pause animation")).toBeVisible();
    // Direct playback remains available as an honest comparison and holds the last jump frame.
    await page
      .getByLabel("Wait for a matching pose", { exact: true })
      .uncheck();
    await button(page, "Jump").click();
    await page.clock.runFor(1700);
    await expect(button(page, "Replay animation")).toBeVisible();
    await expect(canvas(page)).toHaveAttribute(
      "data-frame-id",
      String(manifest.animations.jump!.frames.at(-1)),
    );

    const pending = page.waitForEvent("download");
    await button(page, "Export selected CharacterPack").click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(
      `${character}-motion.character.zip`,
    );
    const exported = info.outputPath(`${character}-motion.character.zip`);
    await download.saveAs(exported);
    expect(digest(await readFile(exported))).toBe(digest(bytes));
    // Playwright's clock is shared by pages in this context. Restore real time
    // before verifying ordinary independent playback in a fresh page.
    await page.clock.resume();
    await page.close();
    const independent = await context.newPage();
    independent.on("pageerror", (error) => errors.push(error.message));
    const requests: string[] = [];
    independent.on("request", (request) => requests.push(request.url()));
    await independent.goto("/player.html");
    await independent.locator("#player-zip").setInputFiles(exported);
    await expect(independent.getByTestId("motion-study-note")).toBeVisible({
      timeout: 120000,
    });
    await expect(
      independent.getByLabel("Wait for a matching pose", { exact: true }),
    ).toBeChecked();
    await expect(canvas(independent)).toHaveAttribute(
      "data-motion-flow",
      "true",
    );
    await pause(independent);
    await button(independent, "Jump").click();
    await button(independent, "Play animation").click();
    await expect(canvas(independent)).toHaveAttribute("data-action", "idle", {
      timeout: 5000,
    });
    expect(
      requests.some((url) => /SpriteActionEditor|\/src\/skeletal\//.test(url)),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
}

test("requests cancel/reset/scrub, while comparison and authoring stay immediate", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.goto("/workbench.html?character=female");
  await expect(
    page.getByRole("link", { name: "Review motion & transitions" }),
  ).toHaveAttribute("href", "/player.html?kling=female&variant=motion");
  await expect(
    page.getByRole("link", { name: "Review keyframe loops" }),
  ).toBeVisible();
  await controlled(page, "/player.html?kling=male&variant=motion&embedded=1");
  await button(page, "Jump").click();
  await button(page, "Play animation").click();
  await page.clock.runFor(300);
  await button(page, "Run").click();
  await button(page, "Jump").click();
  await expect(page.getByTestId("motion-pending")).toHaveText(
    "No action waiting.",
  );
  await button(page, "Run").click();
  await page.evaluate(() =>
    window.postMessage(
      { type: "gathria-workbench-visibility", active: false },
      window.location.origin,
    ),
  );
  const hiddenTime = await canvas(page).getAttribute("data-elapsed-ms");
  await page.clock.runFor(2000);
  await expect(canvas(page)).toHaveAttribute("data-elapsed-ms", hiddenTime!);
  await expect(page.getByTestId("motion-pending")).toContainText("Next: run");
  await page.evaluate(() =>
    window.postMessage(
      { type: "gathria-workbench-visibility", active: true },
      window.location.origin,
    ),
  );
  await page.locator("#player-frame").fill("12");
  await expect(page.getByTestId("motion-pending")).toHaveText(
    "No action waiting.",
  );
  await button(page, "Walk").click();
  await expect(canvas(page)).toHaveAttribute("data-action", "walk");
  await button(page, "Play animation").click();
  await button(page, "Jump").click();
  await button(page, "Reset").click();
  await expect(canvas(page)).toHaveAttribute("data-action", "idle");
  await expect(page.getByTestId("motion-pending")).toHaveText(
    "No action waiting.",
  );
  await page.getByLabel("Compare both characters", { exact: true }).check();
  await expect(canvas(page)).toHaveAttribute("data-comparison", "true", {
    timeout: 120000,
  });
  await expect(
    page.getByLabel("Wait for a matching pose", { exact: true }),
  ).toBeDisabled();
  await expect(canvas(page)).toHaveAttribute("data-motion-flow", "false");
  await button(page, "Run").click();
  await expect(canvas(page)).toHaveAttribute("data-action", "run");

  await page.clock.resume();
  await page.goto("/player.html?kling=female&variant=motion&authoring=1");
  const editor = page.getByRole("region", { name: "Sprite action editor" });
  await expect(editor.getByLabel("Action FPS", { exact: true })).toBeEnabled({
    timeout: 120000,
  });
  await expect(page.getByTestId("motion-flow-controls")).toContainText(
    "off while authoring",
  );
  await button(page, "Run").click();
  await editor.getByLabel("Action FPS", { exact: true }).fill("12");
  await button(page, "Apply action settings").click();
  await expect(page.getByTestId("motion-flow-controls")).toContainText(
    "no longer match",
  );
  const downloading = page.waitForEvent("download");
  await button(page, "Export edited CharacterPack").click();
  const file = info.outputPath("edited-motion.character.zip");
  await (await downloading).saveAs(file);
  await page.goto("/player.html");
  await page.locator("#player-zip").setInputFiles(file);
  await expect(page.getByTestId("motion-flow-controls")).toContainText(
    "no longer match",
    { timeout: 120000 },
  );
  await expect(
    page.getByLabel("Wait for a matching pose", { exact: true }),
  ).toBeDisabled();
  await expect(canvas(page)).toHaveAttribute("data-motion-flow", "false");
});
