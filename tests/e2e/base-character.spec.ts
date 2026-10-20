import { expect, test } from "@playwright/test";

test("base-model entry is reversible and keeps all four editable actions", async ({
  page,
}) => {
  await page.goto("/skin-studio.html");
  const name = page.getByLabel("Character name", { exact: true });
  await name.fill("Keep my current work");
  await name.press("Tab");
  await page
    .getByRole("button", { name: "Open base model", exact: true })
    .click();
  await expect(page.getByText(/Base model opened\./)).toBeVisible();
  await expect(name).toHaveValue("Base character study");
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(name).toHaveValue("Keep my current work");
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  await expect(name).toHaveValue("Base character study");
  const poses = new Set<string>();
  for (const action of ["idle", "walk", "run", "jump"]) {
    await page.getByLabel("Action", { exact: true }).selectOption(action);
    await page
      .getByLabel("Animation frame", { exact: true })
      .fill(action === "idle" ? "0" : "5");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    poses.add(
      await page
        .locator("#skin-posed-canvas")
        .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
    );
  }
  expect(poses.size).toBe(4);
  await page.getByLabel("Bones", { exact: true }).check();
  await expect(page.getByLabel("Bones", { exact: true })).toBeChecked();
});

test("failed base-model download preserves the open project", async ({
  page,
}) => {
  await page.goto("/skin-studio.html");
  const name = page.getByLabel("Character name", { exact: true });
  await name.fill("Keep this name");
  await name.press("Tab");
  await page.route(/base-character\.rig.*\.zip(?:\?.*)?$/, (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page
    .getByRole("button", { name: "Open base model", exact: true })
    .click();
  await expect(
    page.getByText("The base model could not be loaded.", { exact: true }),
  ).toBeVisible();
  await expect(name).toHaveValue("Keep this name");
});
