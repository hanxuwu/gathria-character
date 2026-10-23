import { expect, test } from "@playwright/test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { installWardrobeFixture } from "./wardrobe-fixture";

test("custom artwork survives refresh; corrupted stored bytes cannot replace the open outfit", async ({
  page,
}) => {
  const f = await installWardrobeFixture(page);
  const files = unzipSync(f.male.items[0].bytes);
  const m = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
  m.id = "custom-day";
  m.name = "Custom day";
  files["manifest.json"] = strToU8(JSON.stringify(m));
  const bytes = zipSync(files);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p
    .getByLabel("Import registered clothing file", { exact: true })
    .setInputFiles({
      name: "custom.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    });
  await expect(p.getByRole("status")).toContainText("Clothing added");
  await p.getByLabel("Top", { exact: true }).selectOption("custom-day");
  await expect(p.getByRole("status")).toContainText("Outfit updated");
  const before = await p
    .getByTestId("wardrobe-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await p.getByLabel("Look name").fill("Custom keeps its art");
  await p.getByRole("button", { name: "Save look", exact: true }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "artwork saved in this browser",
  );
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p
    .getByRole("button", { name: "Apply look Custom keeps its art" })
    .click();
  await expect(p.getByRole("status")).toContainText(
    "Custom keeps its art restored",
  );
  expect(
    await p
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(before);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("gathria-look-materials-v1", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result,
            tx = db.transaction("materials", "readwrite"),
            store = tx.objectStore("materials");
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            const row = c.value;
            row.data = new Blob([new Uint8Array(row.size)]);
            c.update(row);
            c.continue();
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p
    .getByRole("button", { name: "Apply look Custom keeps its art" })
    .click();
  await expect(p.getByRole("alert")).toContainText("Stored artwork is damaged");
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue("");
});

test("storage failure leaves recipes intact and offers the portable backup", async ({
  page,
}) => {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Daily selected");
  await page.evaluate(() =>
    Object.defineProperty(window, "indexedDB", { value: undefined }),
  );
  await p.getByLabel("Look name").fill("Must not be partial");
  await p.getByRole("button", { name: "Save look", exact: true }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "Local artwork storage is unavailable",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("gathria-kling-named-looks-v1"),
    ),
  ).toBeNull();
  await expect(p.getByLabel("Top", { exact: true })).toHaveValue("male-top");
});
