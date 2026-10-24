import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { installAppearanceFixture } from "./appearance-fixture";

async function open(page: Page) {
  await installAppearanceFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const panel = page.locator("#wardrobe-panel");
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await panel
    .getByRole("button", { name: "Open look review", exact: true })
    .click();
  const review = panel.getByRole("region", {
    name: "Look review workbench",
    exact: true,
  });
  await expect(
    review.getByRole("button", { name: "Export review notes", exact: true }),
  ).toBeEnabled();
  return { panel, review };
}
async function notes(page: Page) {
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export review notes", exact: true })
    .click();
  return JSON.parse(await readFile((await (await event).path())!, "utf8"));
}

test("review notes persist by exact look and reject a mismatched import without losing notes", async ({
  page,
}) => {
  const { panel, review } = await open(page);
  await panel
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("run");
  await panel
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption("left");
  await panel.getByLabel("Wardrobe frame", { exact: true }).fill("1");
  await review
    .getByLabel("Review region", { exact: true })
    .selectOption("hands");
  await review
    .getByLabel("Issue severity", { exact: true })
    .selectOption("problem");
  await review
    .getByLabel("Review note", { exact: true })
    .fill("Check sleeve ownership at the left wrist.");
  await review
    .getByRole("button", { name: "Add review issue", exact: true })
    .click();
  const original = await notes(page);
  expect(original.issues).toHaveLength(1);
  expect(original.issues[0]).toMatchObject({
    action: "run",
    frameId: 19,
    facing: "left",
    region: "hands",
    severity: "problem",
    status: "open",
  });
  await panel.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  await expect.poll(async () => (await notes(page)).issues.length).toBe(0);
  await panel
    .getByRole("button", { name: "Undo styling", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "Styling change undone",
  );
  expect((await notes(page)).issues).toEqual(original.issues);
  await review
    .getByRole("button", { name: "Resolve issue", exact: true })
    .click();
  expect((await notes(page)).issues[0].status).toBe("resolved");
  await review
    .getByRole("button", { name: "Reopen issue", exact: true })
    .click();
  await panel
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("idle");
  await review
    .getByRole("button", { name: "Go to issue", exact: true })
    .click();
  await expect(
    panel.getByLabel("Wardrobe action", { exact: true }),
  ).toHaveValue("run");
  await expect(
    panel.getByLabel("Wardrobe facing", { exact: true }),
  ).toHaveValue("left");
  await expect(panel.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    "1",
  );
  await page.reload();
  await expect(panel.getByRole("status")).toContainText("Original outfit.");
  await panel
    .getByRole("button", { name: "Open look review", exact: true })
    .click();
  await expect(
    review.getByRole("button", { name: "Export review notes", exact: true }),
  ).toBeEnabled();
  expect((await notes(page)).issues).toEqual(original.issues);
  const bad = structuredClone(original);
  bad.binding.lookSha256 = "0".repeat(64);
  await review
    .getByLabel("Review notes file", { exact: true })
    .setInputFiles({
      name: "wrong-look.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
  await expect(review.getByTestId("review-status")).toContainText(
    "Could not import review notes",
  );
  expect((await notes(page)).issues).toEqual(original.issues);
});

test("review scan, diagnostic views and bundle preserve actual frames and label changes as differences", async ({
  page,
}) => {
  const { panel, review } = await open(page);
  await panel.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Daily selected");
  await panel
    .getByRole("button", { name: "Pin current look", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText("Look pinned");
  await panel.getByRole("button", { name: "Wedding", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Wedding selected");
  await panel
    .getByLabel("Hairstyle", { exact: true })
    .selectOption("soft-crop");
  await expect(panel.getByRole("status")).toContainText("Appearance updated");
  await panel
    .getByLabel("Wardrobe action", { exact: true })
    .selectOption("run");
  const pixels = () =>
    panel
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const before = await pixels();
  for (const mode of ["split", "overlay", "difference"]) {
    await review.getByLabel("Review mode", { exact: true }).selectOption(mode);
    await expect(review.locator("canvas")).toHaveAttribute("data-mode", mode);
    expect(await pixels()).toBe(before);
  }
  await panel
    .getByLabel("Wardrobe facing", { exact: true })
    .selectOption("left");
  await expect(review.locator("canvas")).toHaveAttribute("data-facing", "left");
  await review
    .getByRole("button", { name: "Scan current action", exact: true })
    .click();
  await expect(
    review.getByRole("button", { name: "Review pose 19 at 2", exact: true }),
  ).toBeVisible();
  await review
    .getByRole("button", { name: "Review pose 19 at 2", exact: true })
    .click();
  await expect(panel.getByLabel("Wardrobe frame", { exact: true })).toHaveValue(
    "1",
  );
  await review
    .getByLabel("Review note", { exact: true })
    .fill("Review the cuff with the source pose retained.");
  await review
    .getByRole("button", { name: "Add review issue", exact: true })
    .click();
  const d = page.waitForEvent("download");
  await review
    .getByRole("button", { name: "Export review bundle", exact: true })
    .click();
  const zip = unzipSync(
    new Uint8Array(await readFile((await (await d).path())!)),
  );
  expect(Object.keys(zip).some((f) => f.endsWith(".png"))).toBe(true);
  const reportName = Object.keys(zip).find(
    (f) => f.includes("manifest") && f.endsWith(".json"),
  );
  expect(reportName).toBeTruthy();
  const report = JSON.parse(new TextDecoder().decode(zip[reportName!]));
  expect(report.format).toBe("gathria-look-review-bundle");
  expect(report.action).toBe("run");
  expect(report.facing).toBe("left");
  for (const entry of report.files) {
    expect(zip[entry.file].length).toBe(entry.bytes);
    expect(createHash("sha256").update(zip[entry.file]).digest("hex")).toBe(
      entry.sha256,
    );
  }
  const scan = JSON.parse(new TextDecoder().decode(zip["scan.json"]));
  expect(scan.rows.map((row: { frameId: number }) => row.frameId)).toEqual([
    7, 19,
  ]);
  expect(scan.seam).not.toBeNull();
  const savedNotes = JSON.parse(new TextDecoder().decode(zip["review.json"]));
  expect(savedNotes.binding).toEqual(report.current);
  expect(savedNotes.issues).toHaveLength(1);
  for (const [name, data] of Object.entries(zip)) {
    expect(data.length, name).toBeGreaterThan(0);
    if (name.endsWith(".png"))
      expect(Array.from(data.slice(0, 8))).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ]);
    createHash("sha256").update(data).digest("hex");
  }
});
