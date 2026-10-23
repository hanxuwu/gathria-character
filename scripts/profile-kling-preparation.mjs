// Diagnostic development-only instrumentation; no profiling hooks ship in the app.
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const root = process.cwd(),
  out = "docs/kling-polish/performance";
await mkdir(out, { recursive: true });
const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5214, strictPort: true, hmr: false },
  plugins: [
    {
      name: "diagnose-decoded-working-set",
      enforce: "pre",
      transform(code, id) {
        if (!id.endsWith("/src/wardrobe/garment-pages.ts")) return;
        return code
          .replace(
            "  const p = decodeSourceRgbaPng(patch, dimensions),",
            "  const started = performance.now();\n  const p = decodeSourceRgbaPng(patch, dimensions),",
          )
          .replace(
            "  return { patch: p, ownership: alpha };",
            "  (globalThis as any).__decodes ??= [];\n  (globalThis as any).__decodes.push({width: p.width, height: p.height, ms: performance.now()-started});\n  return { patch: p, ownership: alpha };",
          );
      },
    },
  ],
});
await server.listen();
let browser;
const ready = async (page, text) => {
  await page.waitForFunction(
    (t) =>
      document.querySelector('#wardrobe-panel [role="alert"]') ||
      (!document.querySelector('#wardrobe-panel [aria-busy="true"]') &&
        document
          .querySelector('#wardrobe-panel [role="status"]')
          ?.textContent.includes(t)),
    text,
    { timeout: 240000 },
  );
  assert.deepEqual(
    await page.locator('#wardrobe-panel [role="alert"]').allTextContents(),
    [],
  );
};
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(240000);
  await page.goto(
    "http://127.0.0.1:5214/workbench.html?character=female&mode=wardrobe",
  );
  await ready(page, "Original outfit.");
  await page.getByRole("button", { name: "Everyday", exact: true }).click();
  await ready(page, "Everyday selected");
  await page.evaluate(() => {
    globalThis.__decodes = [];
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  await cdp.send("Profiler.start");
  const start = performance.now();
  await page
    .getByLabel("Hairstyle", { exact: true })
    .selectOption("ribbon-pony");
  await ready(page, "Appearance updated");
  const duration = performance.now() - start;
  const { profile } = await cdp.send("Profiler.stop");
  const decodes = await page.evaluate(() => globalThis.__decodes);
  await writeFile(`${out}/female-before.cpuprofile`, JSON.stringify(profile));
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const funcs = new Map();
  (profile.samples ?? []).forEach((id, i) => {
    const n = byId.get(id);
    const f =
      n.callFrame.functionName +
      " " +
      n.callFrame.url.split("/").slice(-2).join("/");
    funcs.set(f, (funcs.get(f) || 0) + (profile.timeDeltas[i] || 0));
  });
  const report = {
    developmentProfile: true,
    character: "female",
    action: "first-hair",
    durationMs: duration,
    decodes,
    totalDecodeMs: decodes.reduce((a, b) => a + b.ms, 0),
    selfTime: Object.fromEntries(
      [...funcs].sort((a, b) => b[1] - a[1]).slice(0, 35),
    ),
  };
  await writeFile(
    `${out}/profile-summary.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
