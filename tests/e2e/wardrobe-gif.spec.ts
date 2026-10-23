import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { parseGIF, decompressFrames } from "gifuct-js";
import { installWardrobeFixture } from "./wardrobe-fixture";

test("downloads actual dressed actions in both directions and a one-shot GIF without changing the outfit", async ({
  page,
}) => {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Daily selected");
  const renders = [];
  for (const [action, facing] of [
    ["run", "right"],
    ["run", "left"],
    ["jump", "right"],
  ]) {
    await p.getByLabel("Wardrobe action", { exact: true }).selectOption(action);
    await p.getByLabel("Wardrobe facing", { exact: true }).selectOption(facing);
    const before = await p
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL());
    const pending = page.waitForEvent("download");
    await p
      .getByRole("button", { name: "Download action GIF", exact: true })
      .click();
    const d = await pending;
    expect(await d.failure()).toBeNull();
    expect(d.suggestedFilename()).toContain(`${action}-${facing}-half.gif`);
    const bytes = new Uint8Array(await readFile((await d.path())!));
    const parsed = parseGIF(bytes.buffer);
    const frames = decompressFrames(parsed, true);
    expect(parsed.lsd.width).toBe(4);
    expect(parsed.lsd.height).toBe(4);
    expect(frames.length).toBe(action === "run" ? 2 : 3);
    expect(frames.reduce((n, f) => n + f.delay, 0)).toBe(
      action === "run" ? 170 : 380,
    );
    expect(new TextDecoder().decode(bytes).includes("NETSCAPE2.0")).toBe(
      action === "run",
    );
    await expect(p.getByRole("status")).toContainText("Action GIF saved");
    expect(
      await p
        .getByTestId("wardrobe-preview")
        .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
    ).toBe(before);
    renders.push(frames);
  }
  for (let f = 0; f < 2; f++)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        expect(
          Array.from(
            renders[0][f].patch.slice((y * 4 + x) * 4, (y * 4 + x + 1) * 4),
          ),
        ).toEqual(
          Array.from(
            renders[1][f].patch.slice((y * 4 + 3 - x) * 4, (y * 4 + 4 - x) * 4),
          ),
        );
      }
});

test("canceling GIF preparation keeps the current outfit and emits no download", async ({
  page,
}) => {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/src/wardrobe/action-gif.ts", async (r) => {
    await gate;
    await r.continue();
  });
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await p
    .getByRole("button", { name: "Download action GIF", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Cancel preparation", exact: true })
    .click();
  release();
  await expect(p.getByRole("status")).toContainText("Preparation canceled");
  await expect(
    p.getByRole("button", { name: "Download action GIF", exact: true }),
  ).toBeEnabled();
  // A subsequent frame export proves the canceled task cannot overwrite status or export later.
  const pending = page.waitForEvent("download");
  await p
    .getByRole("button", { name: "Save current PNG", exact: true })
    .click();
  await pending;
  expect(downloads.every((n) => n.endsWith(".png"))).toBe(true);
});
