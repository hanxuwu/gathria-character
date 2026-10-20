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
  await page
    .getByText("Advanced tools & earlier versions", { exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: /Classic character editor/ }),
  ).toHaveAttribute("href", "/editor.html");
  await expect(
    page.getByRole("link", { name: /Rig laboratory/ }),
  ).toHaveAttribute("href", "/rig-lab.html");
});

test("workbench keeps the real skeletal editor and undo history alive across tabs", async ({
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
  // The original pack's own import/playback is covered by native loader tests.
  // Fail it quickly here to exercise isolation of a live, edited skeleton session.
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      body: "Unavailable for shell-isolation test",
    }),
  );
  await page.goto("/workbench.html?mode=rig");
  await expect(
    page.getByRole("tab", { name: "Skeleton & motion" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.locator('iframe[title="Original Kling playback"]'),
  ).toHaveCount(0);
  expect(archiveRequests.filter((url) => /kling/.test(url))).toEqual([]);
  const studio = page.frameLocator(
    'iframe[title="Skeleton and motion editor"]',
  );
  const name = studio.getByLabel("Character name", { exact: true });
  await name.fill("My retained skeleton project");
  await name.press("Tab");
  await studio.getByLabel("Bones", { exact: true }).check();
  await studio.getByLabel("Action", { exact: true }).selectOption("run");
  const before = await studio
    .locator("#skin-posed-canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole("tab", { name: "Original playback" }).click();
  await expect(
    page.getByText("Original Kling artwork.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('iframe[title="Original Kling playback"]'),
  ).toHaveCount(1);
  await page.getByRole("tab", { name: "Skeleton & motion" }).click();
  await expect(name).toHaveValue("My retained skeleton project");
  await expect(studio.getByLabel("Bones", { exact: true })).toBeChecked();
  await expect(studio.getByLabel("Action", { exact: true })).toHaveValue("run");
  await expect
    .poll(() =>
      studio
        .locator("#skin-posed-canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    )
    .toBe(before);
  await studio.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(name).not.toHaveValue("My retained skeleton project");
  await studio.getByRole("button", { name: "Redo edit", exact: true }).click();
  await expect(name).toHaveValue("My retained skeleton project");
  const canvas = studio.locator("#skin-posed-canvas");
  const stoppedFrame = await canvas.getAttribute("data-frame");
  await studio.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => canvas.getAttribute("data-frame"))
    .not.toBe(stoppedFrame);
  await page.getByRole("tab", { name: "Original playback" }).click();
  const hiddenFrames = await canvas.evaluate(async (element) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const before = element.getAttribute("data-frame");
    await new Promise((resolve) => setTimeout(resolve, 250));
    return [before, element.getAttribute("data-frame")];
  });
  expect(hiddenFrames[0]).toBe(hiddenFrames[1]);
  await page.getByRole("tab", { name: "Skeleton & motion" }).click();
  await expect(
    studio.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => canvas.getAttribute("data-frame"))
    .not.toBe(hiddenFrames[1]);
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
    page.getByRole("link", { name: "Open skeleton workspace" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Open skeleton workspace" }).click();
  await expect(page).toHaveURL(/workbench\.html\?mode=rig/);
  const rigTab = page.getByRole("tab", { name: "Skeleton & motion" });
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
