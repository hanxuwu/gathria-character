import { expect, test } from "@playwright/test";

test("library has three primary destinations, original previews and lazy character loading", async ({
  page,
}) => {
  const archiveRequests: string[] = [];
  page.on("request", (request) => {
    if (/\.zip(?:\?|$)/.test(request.url()))
      archiveRequests.push(request.url());
  });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("link")).toHaveCount(3);
  await expect(
    navigation.getByRole("link", { name: "Character library" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Your two original characters" }),
  ).toBeVisible();
  const images = page.locator(".library-character__art img");
  await expect(images).toHaveCount(2);
  for (const image of await images.all()) {
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) =>
            img.complete &&
            img.naturalWidth === 704 &&
            img.naturalHeight === 1056,
        ),
      )
      .toBe(true);
  }
  await expect(
    page.getByRole("link", { name: "Open character" }).nth(0),
  ).toHaveAttribute("href", "/workbench.html?character=male");
  await expect(
    page.getByRole("link", { name: "Open character" }).nth(1),
  ).toHaveAttribute("href", "/workbench.html?character=female");
  expect(archiveRequests).toEqual([]);
  const male = page.locator(".library-character--male");
  await expect(
    male.getByRole("link", { name: "Edit Kling male skeleton", exact: true }),
  ).toHaveAttribute("href", "/workbench.html?character=male&mode=rig");
  await expect(
    page
      .locator(".library-character--female")
      .getByText("Female skeleton editing is not available yet.", {
        exact: true,
      }),
  ).toBeVisible();
  await expect(
    page.locator(
      'a[href="/editor.html"], a[href="/rig-lab.html"], a[href="/mother-study.html"]',
    ),
  ).toHaveCount(0);
});

test("workbench keeps native joint edits and undo history alive across tabs", async ({
  page,
}) => {
  const archiveRequests: string[] = [];
  let originalPageLoads = 0;
  page.on("request", (request) => {
    if (/\.zip(?:\?|$)/.test(request.url()))
      archiveRequests.push(request.url());
    if (request.isNavigationRequest() && request.url().includes("player.html"))
      originalPageLoads++;
  });
  // The original packs are checked independently; a failed original load must
  // not disturb the live native skeleton session or its undo history.
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      body: "Unavailable for shell-isolation test",
    }),
  );
  await page.goto("/workbench.html?mode=rig");
  await expect(
    page.getByRole("tab", { name: "Male skeleton" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator('iframe[title="Original Kling playback"]'),
  ).toHaveCount(0);
  const studio = page.frameLocator(
    'iframe[title="Skeleton and motion editor"]',
  );
  await expect(studio.getByRole("status")).toContainText("Loaded:");
  expect(
    archiveRequests.filter((url) =>
      /\/(male|female)\.character\.zip/.test(url),
    ),
  ).toEqual([]);
  const pose = studio.getByLabel("Review pose", { exact: true });
  const upper = studio.getByLabel("Upper rotation (degrees)", { exact: true });
  const canvas = studio.locator("#native-posed-canvas");
  const pixels = () =>
    canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await pose.selectOption("run-flight");
  const before = await pixels();
  const originalAngle = await upper.inputValue();
  const editedAngle = String(Number(originalAngle) + 8);
  await upper.fill(editedAngle);
  await studio.getByRole("button", { name: "Apply joint angles" }).click();
  await expect(studio.getByRole("status")).toContainText("Pose updated");
  expect(await pixels()).not.toBe(before);
  await studio.getByLabel("Bones", { exact: true }).check();
  const withBones = await pixels();
  await page.getByRole("tab", { name: "Original playback" }).click();
  await expect(
    page.getByText("Original Kling artwork.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('iframe[title="Original Kling playback"]'),
  ).toHaveCount(1);
  await page.getByRole("tab", { name: "Male skeleton" }).click();
  await expect(pose).toHaveValue("run-flight");
  await expect(upper).toHaveValue(editedAngle);
  await expect(studio.getByLabel("Bones", { exact: true })).toBeChecked();
  expect(await pixels()).toBe(withBones);
  await studio.getByLabel("Bones", { exact: true }).uncheck();
  await studio.getByRole("button", { name: "Undo pose edit" }).click();
  await expect(upper).toHaveValue(originalAngle);
  expect(await pixels()).toBe(before);
  expect(originalPageLoads).toBe(1);
  await expect(
    page.locator('iframe[title="Skeleton and motion editor"]'),
  ).toHaveCount(1);
});

test("workbench follows trusted player selection without reloading the retained player", async ({
  page,
}) => {
  let originalPageLoads = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.url().includes("player.html"))
      originalPageLoads++;
  });
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      body: "Unavailable for selection message test",
    }),
  );
  await page.goto("/workbench.html?character=male");
  const playerBody = page
    .frameLocator('iframe[title="Original Kling playback"]')
    .locator("body");
  await expect(playerBody).toBeVisible();
  await page.evaluate(() =>
    window.postMessage(
      {
        type: "gathria:prepared-character",
        characterId: "female",
        name: "Untrusted sender",
      },
      window.location.origin,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Kling male", exact: true }),
  ).toBeVisible();
  await playerBody.evaluate(() =>
    window.parent.postMessage(
      {
        type: "gathria:prepared-character",
        characterId: "female",
        name: "Kling female",
      },
      window.location.origin,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Kling female", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open player separately" }),
  ).toHaveAttribute("href", "/player.html?kling=female");
  await expect(page).toHaveURL(/character=female/);
  await page.getByRole("tab", { name: "Male skeleton" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Kling male · skeleton candidate",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Female skeleton editing is not available yet/),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Original playback" }).click();
  await expect(
    page.getByRole("heading", { name: "Kling female", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('iframe[title="Original Kling playback"]'),
  ).toHaveAttribute("src", "/player.html?kling=male&embedded=1");
  await playerBody.evaluate(() =>
    window.parent.postMessage(
      {
        type: "gathria:prepared-character",
        characterId: null,
        name: "My imported pack",
      },
      window.location.origin,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "My imported pack", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Imported character pack.", { exact: true }),
  ).toBeVisible();
  expect(originalPageLoads).toBe(1);
});

test("mobile library and workbench navigation stay within the viewport and support keyboard tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Edit Kling male skeleton" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Edit Kling male skeleton" }).click();
  await expect(page).toHaveURL(/workbench\.html\?character=male&mode=rig/);
  const rigTab = page.getByRole("tab", { name: "Male skeleton" });
  await rigTab.focus();
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({ status: 503, body: "Unavailable for keyboard test" }),
  );
  await rigTab.press("Home");
  await expect(
    page.getByRole("tab", { name: "Original playback" }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Original playback" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Original playback" }).press("End");
  await expect(rigTab).toBeFocused();
  await expect(rigTab).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
