import { expect, test } from "@playwright/test";
import { installWardrobeFixture } from "./wardrobe-fixture";

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
    page.getByRole("link", { name: "编辑人物", exact: true }).nth(0),
  ).toHaveAttribute("href", "/workbench.html?character=male");
  await expect(
    page.getByRole("link", { name: "编辑人物", exact: true }).nth(1),
  ).toHaveAttribute("href", "/workbench.html?character=female");
  expect(archiveRequests).toEqual([]);
  for (const character of ["male", "female"])
    await expect(
      page.locator(`.library-character--${character}`).getByRole("link"),
    ).toHaveCount(1);
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
    page.locator('iframe[title="Sprite action workspace"]'),
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
  await page.getByRole("tab", { name: "Sprite actions" }).click();
  await expect(
    page.getByText("Original Kling sprite frames.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('iframe[title="Sprite action workspace"]'),
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
    .frameLocator('iframe[title="Sprite action workspace"]')
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
    page.getByRole("link", { name: "Open source player separately" }),
  ).toHaveAttribute("href", "/player.html?kling=female");
  await expect(page).toHaveURL(/character=female/);
  await page.getByRole("tab", { name: "Female skeleton" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Kling female · skeleton candidate",
      exact: true,
    }),
  ).toBeVisible();
  const femaleRig = page.frameLocator('iframe[data-character="female"]');
  await expect(femaleRig.getByRole("status")).toContainText(
    "Loaded: Kling female",
  );
  await expect(page.locator('iframe[data-character="male"]')).toHaveCount(0);
  await page.getByRole("tab", { name: "Sprite actions" }).click();
  await expect(
    page.getByRole("heading", { name: "Kling female", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('iframe[title="Sprite action workspace"]'),
  ).toHaveAttribute("src", "/player.html?kling=male&embedded=1&authoring=1");
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
    page
      .locator(".library-character--male")
      .getByRole("link", { name: "编辑人物", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({ status: 503, body: "Unavailable for keyboard test" }),
  );
  await page
    .locator(".library-character--male")
    .getByRole("link", { name: "编辑人物", exact: true })
    .click();
  await page.getByRole("tab", { name: "Male skeleton" }).click();
  await expect(page).toHaveURL(/workbench\.html\?character=male&mode=rig/);
  const rigTab = page.getByRole("tab", { name: "Male skeleton" });
  await rigTab.focus();
  await rigTab.press("Home");
  await expect(page.getByRole("tab", { name: "Sprite actions" })).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Sprite actions" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Sprite actions" }).press("End");
  await expect(rigTab).toBeFocused();
  await expect(rigTab).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("female library entry and character changes retain separate male and female joint edits", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      body: "Original playback is checked separately",
    }),
  );
  await page.goto("/");
  await page
    .locator(".library-character--female")
    .getByRole("link", { name: "编辑人物", exact: true })
    .click();
  await page.getByRole("tab", { name: "Female skeleton" }).click();
  await expect(page).toHaveURL(/character=female&mode=rig/);
  await expect(
    page.getByRole("tab", { name: "Female skeleton" }),
  ).toHaveAttribute("aria-selected", "true");
  const female = page.frameLocator('iframe[data-character="female"]');
  await expect(female.getByRole("status")).toContainText(
    "Loaded: Kling female",
  );
  await female
    .getByLabel("Review pose", { exact: true })
    .selectOption("celebrate");
  const femaleUpper = female.getByLabel("Upper rotation (degrees)", {
    exact: true,
  });
  const originalAngle = await femaleUpper.inputValue();
  const editedAngle = String(Number(originalAngle) - 5);
  await femaleUpper.fill(editedAngle);
  await female.getByRole("button", { name: "Apply joint angles" }).click();
  const femaleCanvas = female.locator("#native-posed-canvas");
  const femalePixels = await femaleCanvas.evaluate(
    (canvas: HTMLCanvasElement) => canvas.toDataURL(),
  );
  await page.getByRole("tab", { name: "Sprite actions" }).click();
  const playerBody = page
    .frameLocator('iframe[title="Sprite action workspace"]')
    .locator("body");
  await expect(playerBody).toBeVisible();
  await playerBody.evaluate(() =>
    window.parent.postMessage(
      {
        type: "gathria:prepared-character",
        characterId: "male",
        name: "Kling male",
      },
      window.location.origin,
    ),
  );
  await page.getByRole("tab", { name: "Male skeleton", exact: true }).click();
  const male = page.frameLocator('iframe[data-character="male"]');
  await expect(male.getByRole("status")).toContainText("Loaded: Kling male");
  await expect(page.locator('iframe[data-character="female"]')).toBeHidden();
  await expect(page.locator('iframe[data-character="male"]')).toBeVisible();
  await male
    .getByLabel("Review pose", { exact: true })
    .selectOption("run-flight");
  await male.getByLabel("Bones", { exact: true }).check();
  await page.getByRole("tab", { name: "Sprite actions" }).click();
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
  await page.getByRole("tab", { name: "Female skeleton", exact: true }).click();
  await expect(page.locator('iframe[data-character="male"]')).toBeHidden();
  await expect(female.getByLabel("Review pose", { exact: true })).toHaveValue(
    "celebrate",
  );
  await expect(femaleUpper).toHaveValue(editedAngle);
  expect(
    await femaleCanvas.evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL(),
    ),
  ).toBe(femalePixels);
  await female.getByRole("button", { name: "Undo pose edit" }).click();
  await expect(femaleUpper).toHaveValue(originalAngle);
  await page.getByRole("tab", { name: "Sprite actions" }).click();
  await playerBody.evaluate(() =>
    window.parent.postMessage(
      {
        type: "gathria:prepared-character",
        characterId: "male",
        name: "Kling male",
      },
      window.location.origin,
    ),
  );
  await page.getByRole("tab", { name: "Male skeleton", exact: true }).click();
  await expect(male.getByLabel("Review pose", { exact: true })).toHaveValue(
    "run-flight",
  );
  await expect(male.getByLabel("Bones", { exact: true })).toBeChecked();
});

test("an embedded cross-import updates the outer identity without replacing either retained session", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.route(/\/(male|female)\.character\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 503,
      body: "Original playback is tested separately",
    }),
  );
  await page.goto("/workbench.html?character=female&mode=rig");
  const female = page.frameLocator('iframe[data-character="female"]');
  await expect(female.getByRole("status")).toContainText(
    "Loaded: Kling female",
  );
  await female
    .getByLabel("Review pose", { exact: true })
    .selectOption("celebrate");
  const femaleUpper = female.getByLabel("Upper rotation (degrees)", {
    exact: true,
  });
  const editedAngle = String(Number(await femaleUpper.inputValue()) - 5);
  await femaleUpper.fill(editedAngle);
  await female.getByRole("button", { name: "Apply joint angles" }).click();
  await page.getByRole("tab", { name: "Sprite actions" }).click();
  const player = page
    .frameLocator('iframe[title="Sprite action workspace"]')
    .locator("body");
  await expect(player).toBeVisible();
  await player.evaluate(() =>
    window.parent.postMessage(
      {
        type: "gathria:prepared-character",
        characterId: "male",
        name: "Kling male",
      },
      window.location.origin,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Kling male", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Male skeleton", exact: true }).click();
  const maleSession = page.frameLocator('iframe[data-character="male"]');
  await expect(maleSession.getByRole("status")).toContainText(
    "Loaded: Kling male",
  );
  // Neither the top-level window nor the original-player iframe may spoof a
  // native project's identity. Only its own retained rig iframe is trusted.
  await page.evaluate(() =>
    window.postMessage(
      { type: "gathria:native-study-project-loaded", characterId: "female" },
      window.location.origin,
    ),
  );
  await player.evaluate(() =>
    window.parent.postMessage(
      { type: "gathria:native-study-project-loaded", characterId: "female" },
      window.location.origin,
    ),
  );
  await expect(
    page.getByRole("heading", {
      name: "Kling male · skeleton candidate",
      exact: true,
    }),
  ).toBeVisible();
  await maleSession
    .getByLabel("Native project ZIP", { exact: true })
    .setInputFiles("artwork/kling-native-female/prepared/project.zip");
  await expect(maleSession.getByRole("status")).toContainText(
    "Native project reopened",
  );
  await expect(
    page.getByRole("heading", {
      name: "Kling female · skeleton candidate",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Female skeleton", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("link", {
      name: "Open female skeleton separately",
      exact: true,
    }),
  ).toHaveAttribute("href", "/skin-studio.html?character=female");
  await expect(page.locator('iframe[data-character="male"]')).toHaveAttribute(
    "src",
    "/skin-studio.html?character=male&embedded=1",
  );
  await expect(page.locator('iframe[data-character="male"]')).toHaveAttribute(
    "data-loaded-character",
    "female",
  );
  await expect(page).toHaveURL(/character=female/);
  await maleSession
    .getByLabel("Review pose", { exact: true })
    .selectOption("run-flight");
  await page.getByRole("tab", { name: "Sprite actions" }).click();
  await player.evaluate(() =>
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
  await page.getByRole("tab", { name: "Female skeleton", exact: true }).click();
  await expect(femaleUpper).toHaveValue(editedAngle);
  await expect(female.getByLabel("Review pose", { exact: true })).toHaveValue(
    "celebrate",
  );
  await expect(
    female.getByRole("button", { name: "Undo pose edit" }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: "Sprite actions" }).click();
  await player.evaluate(() =>
    window.parent.postMessage(
      {
        type: "gathria:prepared-character",
        characterId: "male",
        name: "Kling male",
      },
      window.location.origin,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Kling male", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Female skeleton", exact: true }).click();
  await expect(
    maleSession.getByLabel("Review pose", { exact: true }),
  ).toHaveValue("run-flight");
  await expect(
    maleSession.getByRole("heading", {
      name: "Kling female, built from the original.",
      exact: true,
    }),
  ).toBeVisible();
  // A legitimate late load from a hidden player may update that player's
  // retained identity, but cannot switch the currently edited rig session.
  await player.evaluate(() =>
    window.parent.postMessage(
      {
        type: "gathria:prepared-character",
        characterId: "female",
        name: "Kling female",
      },
      window.location.origin,
    ),
  );
  // Observe after the queued cross-frame message reaches the host.
  await page.waitForTimeout(100);
  await expect(page.locator('iframe[data-character="male"]')).toBeVisible();
  await expect(page.locator('iframe[data-character="female"]')).toBeHidden();
  await expect(
    maleSession.getByLabel("Review pose", { exact: true }),
  ).toHaveValue("run-flight");
});

test("first opening the skeleton follows the visible wardrobe character", async ({
  page,
}) => {
  await installWardrobeFixture(page);
  await page.goto("/workbench.html?character=male&mode=wardrobe");
  const wardrobe = page.locator("#wardrobe-panel");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await wardrobe
    .getByLabel("Wardrobe character", { exact: true })
    .selectOption("female");
  await expect(wardrobe.getByRole("status")).toContainText("Original outfit.");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("female");
  await page.getByRole("tab", { name: /skeleton$/, exact: false }).click();
  const female = page.frameLocator('iframe[data-character="female"]');
  await expect(female.getByRole("status")).toContainText(
    "Loaded: Kling female",
  );
  await expect(page.locator('iframe[data-character="male"]')).toHaveCount(0);
  await expect(page).toHaveURL(/character=female/);
  await page.getByRole("tab", { name: "Wardrobe", exact: true }).click();
  await expect(
    wardrobe.getByLabel("Wardrobe character", { exact: true }),
  ).toHaveValue("female");
});
