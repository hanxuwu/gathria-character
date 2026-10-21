import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { decodeSourceRgbaPng } from "../../src/core/baked-source";

test("native candidate keeps the source rest pose and saves real editable joint poses", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/skin-studio.html");
  await expect(page.getByRole("status")).toContainText("Loaded:");
  const canvas = page.locator("#native-posed-canvas");
  await expect(canvas).toHaveAttribute("width", "704");
  await expect(canvas).toHaveAttribute("height", "1056");
  const pixels = () =>
    canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  expect(await pixels()).toBe(
    await page
      .locator("#native-reference-canvas")
      .evaluate((element: HTMLCanvasElement) => element.toDataURL()),
  );
  await expect(
    page.getByRole("button", { name: "Apply joint angles" }),
  ).toBeDisabled();
  const pose = page.getByLabel("Review pose", { exact: true });
  for (const id of ["walk-contact", "run-flight", "celebrate"]) {
    await pose.selectOption(id);
    await expect(canvas).toHaveAttribute("data-pose", id);
  }
  await pose.selectOption("run-flight");
  const original = await pixels();
  const upper = page.getByLabel("Upper rotation (degrees)", { exact: true });
  await upper.fill(String(Number(await upper.inputValue()) + 8));
  await page.getByRole("button", { name: "Apply joint angles" }).click();
  await expect(page.getByRole("status")).toContainText("Pose updated");
  const edited = await pixels();
  expect(edited).not.toBe(original);
  const projectDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save native project", exact: true })
    .click();
  const projectPath = (await (await projectDownload).path())!;
  const files = unzipSync(new Uint8Array(await readFile(projectPath)));
  expect(
    Object.keys(files).filter((name) => name.startsWith("parts/")),
  ).toHaveLength(15);
  expect(files["reference.png"]).toBeTruthy();
  expect(JSON.parse(strFromU8(files["document.json"])).frame).toEqual({
    width: 704,
    height: 1056,
  });
  await page.getByRole("button", { name: "Undo pose edit" }).click();
  expect(await pixels()).toBe(original);
  await page
    .getByLabel("Native project ZIP", { exact: true })
    .setInputFiles(projectPath);
  await expect(page.getByRole("status")).toContainText(
    "Native project reopened",
  );
  await pose.selectOption("run-flight");
  expect(await pixels()).toBe(edited);
  await page.getByLabel("Native project ZIP", { exact: true }).setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("broken"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await pixels()).toBe(edited);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export pose PNG", exact: true })
    .click();
  const png = decodeSourceRgbaPng(
    new Uint8Array(await readFile((await (await download).path())!)),
  );
  expect([png.width, png.height]).toEqual([704, 1056]);
  expect(
    png.pixels.some(
      (alpha, index) => index % 4 === 3 && alpha > 0 && alpha < 255,
    ),
  ).toBe(true);
  const packDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export static CharacterPack", exact: true })
    .click();
  const pack = unzipSync(
    new Uint8Array(await readFile((await (await packDownload).path())!)),
  );
  const manifest = JSON.parse(strFromU8(pack["manifest.json"]));
  expect(manifest.schemaVersion).toBe(2);
  expect(Object.keys(manifest.animations)).toEqual([
    "idle",
    "walk",
    "run",
    "celebrate",
  ]);
  for (const animation of Object.values(manifest.animations) as Array<{
    frames: number[];
    fps: number;
    loop: boolean;
  }>) {
    expect(animation.frames).toHaveLength(1);
    expect(animation.fps).toBe(1);
    expect(animation.loop).toBe(false);
  }
  expect(strFromU8(pack["PROVENANCE.txt"])).toContain(
    "not completed animation cycles",
  );
  expect(errors).toEqual([]);
});

test("the visible male skeleton entry retains poses and old study URLs still open the native candidate", async ({
  page,
}) => {
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      body: "Original loading is tested independently",
    }),
  );
  await page.goto("/");
  await page
    .getByRole("link", { name: "Edit Kling male skeleton", exact: true })
    .click();
  const frame = page.frameLocator('iframe[title="Skeleton and motion editor"]');
  await expect(frame.getByRole("status")).toContainText("Loaded:");
  await frame
    .getByLabel("Review pose", { exact: true })
    .selectOption("celebrate");
  await frame.getByLabel("Bones", { exact: true }).check();
  await page
    .getByRole("tab", { name: "Original playback", exact: true })
    .click();
  await page.getByRole("tab", { name: "Male skeleton", exact: true }).click();
  await expect(frame.getByLabel("Review pose", { exact: true })).toHaveValue(
    "celebrate",
  );
  await expect(frame.getByLabel("Bones", { exact: true })).toBeChecked();
  await page.goto("/workbench.html?mode=rig&study=kling-male");
  await expect(
    page.locator('iframe[title="Skeleton and motion editor"]'),
  ).toHaveAttribute("src", "/skin-studio.html?embedded=1");
  await expect(frame.getByRole("status")).toContainText("Loaded:");
  await page.getByRole("tab", { name: "Original playback" }).click();
  await expect(page).not.toHaveURL(/mode=rig|study=kling-male/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Original playback" }),
  ).toHaveAttribute("aria-selected", "true");
});
