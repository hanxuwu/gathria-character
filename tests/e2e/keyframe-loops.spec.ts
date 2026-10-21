import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import type {
  BakedCharacterPackManifest,
  PortableAnimationName,
} from "../../src/core/types";

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const actions: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];

async function wraps(
  page: Page,
  manifest: BakedCharacterPackManifest,
  action: PortableAnimationName,
  facing: "right" | "left",
) {
  const clip = manifest.animations[action]!;
  expect(clip.loop).toBe(true);
  expect(clip.frames.length).toBeGreaterThan(1);
  await button(page, action[0].toUpperCase() + action.slice(1)).click();
  await button(page, facing === "right" ? "Right" : "Left").click();
  const canvas = page.getByTestId("consumer-canvas");
  await page.locator("#player-frame").fill(String(clip.frames.length - 1));
  await expect(canvas).toHaveAttribute(
    "data-frame-position",
    String(clip.frames.length - 1),
  );
  await expect(canvas).toHaveAttribute(
    "data-frame-id",
    String(clip.frames.at(-1)),
  );
  await expect(page.locator(".player-timing")).toHaveText(
    `${clip.fps} FPS · LOOP`,
  );
  await button(page, "Play animation").click();
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-frame-position")))
    .toBeLessThan(clip.frames.length - 1);
  await button(page, "Pause animation").click();
  const observed = await canvas.evaluate((element) => ({
    position: Number(element.dataset.framePosition),
    id: Number(element.dataset.frameId),
    label: element.getAttribute("aria-label"),
  }));
  expect(observed.id).toBe(clip.frames[observed.position]);
  expect(observed.label).toContain(`${action}, facing ${facing}`);
  await expect(button(page, "Replay animation")).toHaveCount(0);
}

for (const character of ["male", "female"] as const) {
  test(`${character} keyframe candidate loops all five actions and exports independently`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    const source = new Uint8Array(
      await readFile(`docs/kling-keyframes/exports/${character}.character.zip`),
    );
    const manifest: BakedCharacterPackManifest = JSON.parse(
      Buffer.from(unzipSync(source)["manifest.json"]).toString(),
    );
    await page.goto(`/player.html?kling=${character}&variant=keyframes`);
    await expect(page.getByTestId("keyframe-study-note")).toBeVisible({
      timeout: 60000,
    });
    await expect(page.getByTestId("keyframe-study-note")).toContainText(
      "lands in a crouch",
    );
    await expect(
      page.getByRole("link", { name: "Open original playback" }),
    ).toHaveAttribute("href", `/player.html?kling=${character}`);
    await expect(
      page.getByRole("region", { name: "Sprite action editor" }),
    ).toHaveCount(0);
    for (const action of actions)
      for (const facing of ["right", "left"] as const)
        await wraps(page, manifest, action, facing);

    expect(requests.some((url) => url.includes("/kling-jump/exports/"))).toBe(
      false,
    );
    const pending = page.waitForEvent("download");
    await button(page, "Export selected CharacterPack").click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(
      `${character}-keyframes.character.zip`,
    );
    const path = info.outputPath(`${character}-keyframes.character.zip`);
    await download.saveAs(path);
    expect(sha(await readFile(path))).toBe(sha(source));
    await page.close();

    const independent = await context.newPage();
    independent.on("pageerror", (error) => errors.push(error.message));
    const independentRequests: string[] = [];
    independent.on("request", (request) =>
      independentRequests.push(request.url()),
    );
    await independent.goto("/player.html");
    await independent.locator("#player-zip").setInputFiles(path);
    await expect(independent.getByTestId("keyframe-study-note")).toBeVisible({
      timeout: 60000,
    });
    for (const facing of ["right", "left"] as const)
      await wraps(independent, manifest, "jump", facing);
    expect(
      independentRequests.some((url) =>
        /SpriteActionEditor|\/src\/skeletal\//.test(url),
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
}

test("keyframe review is explicit, retains its variant on character changes, and leaves the original jump one-shot", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/workbench.html?character=female");
  await expect(
    page.getByRole("link", { name: "Review keyframe loops" }),
  ).toHaveAttribute("href", "/player.html?kling=female&variant=keyframes");
  await expect(
    page.getByRole("tab", { name: "Sprite actions" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.goto("/player.html?kling=male&variant=keyframes");
  await expect(page.getByTestId("keyframe-study-note")).toBeVisible({
    timeout: 60000,
  });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.getByLabel("Character", { exact: true }).selectOption("female");
  await expect(
    page.getByRole("link", { name: "Open original playback" }),
  ).toHaveAttribute("href", "/player.html?kling=female", { timeout: 60000 });
  expect(
    requests.some((url) => url.includes("kling-keyframes/exports/female")),
  ).toBe(true);
  expect(requests.some((url) => url.includes("/kling-jump/exports/"))).toBe(
    false,
  );
  await button(page, "Jump").click();
  await expect(page.locator(".player-timing")).toContainText("LOOP");
  await page.getByRole("link", { name: "Open original playback" }).click();
  await expect(page.getByRole("status")).toContainText("Loaded:", {
    timeout: 60000,
  });
  await expect(page.getByTestId("keyframe-study-note")).toHaveCount(0);
  await button(page, "Jump").click();
  await expect(page.locator(".player-timing")).toHaveText("24 FPS · ONCE");
  await expect(page.locator("#player-frame")).toHaveAttribute("max", "38");
});
