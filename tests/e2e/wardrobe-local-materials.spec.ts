import { expect, test } from "@playwright/test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { installWardrobeFixture } from "./wardrobe-fixture";
import { createHash } from "node:crypto";

test("saved catalog clothing restores from exact local bytes with its downloads blocked", async ({
  page,
}) => {
  const f = await installWardrobeFixture(page);
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({
      json: {
        version: 1,
        characters: [f.male, f.female].map((c) => ({
          ...c.entry,
          items: c.items.map(({ id, name, slot, url, bytes }) => ({
            id,
            name,
            slot,
            url,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          })),
        })),
      },
    }),
  );
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Daily selected");
  const before = await p
    .getByTestId("wardrobe-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await p.getByLabel("Look name").fill("Locally retained");
  await p.getByRole("button", { name: "Save look", exact: true }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "artwork saved in this browser",
  );
  let downloads = 0;
  for (const item of f.male.items)
    await page.route("**" + item.url, (r) => {
      downloads++;
      return r.abort();
    });
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Apply look Locally retained" }).click();
  await expect(p.getByRole("status")).toContainText(
    "Locally retained restored",
  );
  expect(downloads).toBe(0);
  expect(
    await p
      .getByTestId("wardrobe-preview")
      .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
  ).toBe(before);
});

test("cleanup frees only deleted looks, keeping both characters, open materials and older entries", async ({
  page,
  context,
}) => {
  await installWardrobeFixture(page);
  const other = await context.newPage();
  await installWardrobeFixture(other);
  const save = async (tab: typeof page, character: string, name: string) => {
    await tab.goto(`/workbench.html?character=${character}&mode=wardrobe`);
    const p = tab.locator("#wardrobe-panel");
    await expect(p.getByRole("status")).toContainText("Original outfit.");
    await p.getByRole("button", { name: "Daily", exact: true }).click();
    await expect(p.getByRole("status")).toContainText("Daily selected");
    await p.getByLabel("Look name").fill(name);
    await p.getByRole("button", { name: "Save look", exact: true }).click();
    await expect(p.locator(".wardrobe-named-looks")).toContainText(
      "artwork saved in this browser",
    );
  };
  await save(page, "male", "Remove male");
  await save(other, "female", "Keep female");
  const p = page.locator("#wardrobe-panel");
  // Older entries do not opt into the new cross-tab locking contract.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("gathria-look-materials-v1", 1);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction("materials", "readwrite");
          tx.objectStore("materials").put({
            key: "garment:" + "e".repeat(64),
            kind: "garment",
            hash: "e".repeat(64),
            data: new Blob(["old"]),
            size: 3,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  await p.getByRole("button", { name: "Delete look Remove male" }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "removed from saved looks",
  );
  await p
    .locator("summary")
    .filter({ hasText: "Artwork stored in this browser" })
    .click();
  await expect(
    p.getByRole("button", { name: "Remove unused artwork" }),
  ).toBeDisabled();
  // Reload releases the open male outfit, so only its deleted recipe is unused.
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p
    .locator("summary")
    .filter({ hasText: "Artwork stored in this browser" })
    .click();
  await expect(
    p.getByRole("button", { name: "Remove unused artwork" }),
  ).toBeEnabled();
  await p.getByRole("button", { name: "Remove unused artwork" }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "Saved looks and the open wardrobe are kept",
  );
  await other.reload();
  const q = other.locator("#wardrobe-panel");
  await expect(q.getByRole("status")).toContainText("Original outfit.");
  await q.getByRole("button", { name: "Apply look Keep female" }).click();
  await expect(q.getByRole("status")).toContainText("Keep female restored");
  const keys = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open("gathria-look-materials-v1", 1);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction("materials", "readonly"),
            r = tx.objectStore("materials").getAllKeys();
          r.onsuccess = () => {
            db.close();
            resolve(r.result.map(String));
          };
        };
      }),
  );
  expect(keys).toContain("garment:" + "e".repeat(64));
  expect(keys.length).toBeGreaterThan(1);
  await other.close();
});

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

test("a concurrent save holds cleanup until artwork and its recipe are both retained", async ({
  page,
  context,
}) => {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const p = page.locator("#wardrobe-panel");
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(p.getByRole("status")).toContainText("Daily selected");
  await p.getByLabel("Look name").fill("Concurrent look");
  await p.getByRole("button", { name: "Save look", exact: true }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "artwork saved in this browser",
  );
  await p.getByRole("button", { name: "Delete look Concurrent look" }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "removed from saved looks",
  );
  const cleaner = await context.newPage();
  await installWardrobeFixture(cleaner);
  await cleaner.goto("/workbench.html?character=female&mode=wardrobe");
  const q = cleaner.locator("#wardrobe-panel");
  await expect(q.getByRole("status")).toContainText("Original outfit.");
  await q
    .locator("summary")
    .filter({ hasText: "Artwork stored in this browser" })
    .click();
  await expect(
    q.getByRole("button", { name: "Remove unused artwork" }),
  ).toBeEnabled();
  // Hold the browser's named write lock to queue a real save before cleanup.
  await page.evaluate(async () => {
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    void navigator.locks.request(
      "gathria-look-materials-write-v1",
      () =>
        new Promise<void>((release) => {
          Object.assign(window, { releaseArtworkWrite: release });
          entered();
        }),
    );
    await ready;
  });
  await p.getByRole("button", { name: "Save look", exact: true }).click();
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "Saving this look",
  );
  await q.getByRole("button", { name: "Remove unused artwork" }).click();
  await page.evaluate(() =>
    (
      window as unknown as { releaseArtworkWrite: () => void }
    ).releaseArtworkWrite(),
  );
  await expect(p.locator(".wardrobe-named-looks")).toContainText(
    "artwork saved in this browser",
  );
  await expect(q.locator(".wardrobe-named-looks")).toContainText(
    "Removed 0 unused artwork files",
  );
  await page.reload();
  await expect(p.getByRole("status")).toContainText("Original outfit.");
  await p.getByRole("button", { name: "Apply look Concurrent look" }).click();
  await expect(p.getByRole("status")).toContainText("Concurrent look restored");
  await cleaner.close();
});
