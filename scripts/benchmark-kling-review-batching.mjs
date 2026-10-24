// Real registered female day/wedding benchmark. Paired mode replays the rejected trial in an isolated worktree.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
const root = process.cwd(),
  label = process.env.KLING_REVIEW_BENCH_LABEL || "after";
assert(/^[a-z0-9-]+$/.test(label));
const out = resolve(root, "docs/kling-repair-handoff/performance");
await mkdir(out, { recursive: true });
const output = resolve(out, `${label}.json`);
assert(!existsSync(output), "Preserve completed benchmarks.");
const paired = process.env.KLING_REVIEW_BENCH_PAIRED === "1";
const baselineCommit = "8578df1b19f8f943b43fdcd1d3b33c31ee44c1b9";
const baselineFiles = new Map(
  ["review-analysis", "review-sheets"].map((name) => [
    resolve(root, `src/wardrobe/${name}.ts`) + "?bench-old",
    execFileSync("git", ["show", `${baselineCommit}:src/wardrobe/${name}.ts`], {
      cwd: root,
      encoding: "utf8",
    }),
  ]),
);
const sourceFiles = [
  "src/wardrobe/review-sheets.ts",
  "src/wardrobe/review-analysis.ts",
  "src/wardrobe/compositor.ts",
  "src/wardrobe/garment-pages.ts",
  "src/appearance/render.ts",
];
const inputHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (file) => [
      file,
      createHash("sha256")
        .update(await readFile(resolve(root, file)))
        .digest("hex"),
    ]),
  ),
);
if (paired)
  assert(
    await Promise.all(
      ["review-analysis", "review-sheets"].map(
        async (name) =>
          (await readFile(resolve(root, `src/wardrobe/${name}.ts`), "utf8")) !==
          baselineFiles.get(
            resolve(root, `src/wardrobe/${name}.ts`) + "?bench-old",
          ),
      ),
    ).then((changed) => changed.some(Boolean)),
    "The rejected trial is not applied. See the performance README; use an isolated worktree.",
  );
const server = await createServer({
  plugins: [
    {
      name: "immutable-review-benchmark-baseline",
      enforce: "pre",
      transform(code, id) {
        if (baselineFiles.has(id)) return baselineFiles.get(id);
      },
    },
  ],
  root,
  appType: "custom",
  server: { host: "127.0.0.1", port: 5212, strictPort: true, hmr: false },
});
server.middlewares.use((req, res, next) => {
  if (req.url === "/bench") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><title>Review batching benchmark</title>");
  } else next();
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--disable-dev-shm-usage"],
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.exposeFunction("benchProgress", (m) => console.log(m));
try {
  await page.goto("http://127.0.0.1:5212/bench");
  const report = await Promise.race([
    page.evaluate(async (paired) => {
      const P = await import("/src/wardrobe/project.ts"),
        C = await import("/src/wardrobe/compositor.ts");
      const { createLookComparison } = await import(
        "/src/wardrobe/look-comparison.ts"
      );
      const { scanReviewAction } = await import(
        "/src/wardrobe/review-analysis.ts"
      );
      const { buildReviewContactSheets } = await import(
        "/src/wardrobe/review-sheets.ts"
      );
      const oldScan = (
        await import("/src/wardrobe/review-analysis.ts?bench-old")
      ).scanReviewAction;
      const oldSheets = (
        await import("/src/wardrobe/review-sheets.ts?bench-old")
      ).buildReviewContactSheets;
      const fetchBytes = async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw Error(url);
        return new Uint8Array(await r.arrayBuffer());
      };
      const catalog = await (
        await fetch("/docs/kling-wardrobe/catalog.json")
      ).json();
      const ch = catalog.characters.find((c) => c.key === "female");
      const ids = ["coral-daydress-v8", "ivory-wedding-dress-v8"];
      const source = await fetchBytes(ch.sourceUrl),
        reg = await fetchBytes(ch.registrationUrl);
      let project = await P.createWardrobeProject(
        source,
        reg,
        await Promise.all(
          ids.map((id) => fetchBytes(ch.items.find((i) => i.id === id).url)),
        ),
      );
      const bank = ch.appearanceLibraries.find((b) =>
        b.styles.some((s) => s.id === "ribbon-pony"),
      );
      project = await P.addWardrobeAppearanceBank(
        project,
        await fetchBytes(bank.url),
      );
      project = P.selectWardrobeAppearance(project, {
        hairId: "ribbon-pony",
        faceId: null,
        hairColor: "chestnut",
      });
      const day = P.selectWardrobeGarment(project, "fullBody", ids[0]),
        wedding = P.selectWardrobeGarment(project, "fullBody", ids[1]);
      const a = await C.createWardrobeCompositor(day),
        b = await C.createWardrobeCompositor(wedding);
      await window.benchProgress("Real source and both looks prepared.");
      const original = createLookComparison(a, b, day, wedding);
      async function measure(variant) {
        const scanFn = variant === "before" ? oldScan : scanReviewAction;
        const sheetFn =
          variant === "before" ? oldSheets : buildReviewContactSheets;
        const counts = { reference: 0, current: 0 },
          renderMs = { reference: 0, current: 0 },
          sequence = [];
        const compare = {
          ...original,
          renderSourceFrame: (id) => {
            const t = performance.now();
            const f = original.renderSourceFrame(id);
            counts.reference++;
            renderMs.reference += performance.now() - t;
            sequence.push("reference");
            return f;
          },
          renderFrame: (id) => {
            const t = performance.now();
            const f = original.renderFrame(id);
            counts.current++;
            renderMs.current += performance.now() - t;
            sequence.push("current");
            return f;
          },
        };
        const started = performance.now();
        const scan = await scanFn(compare, "run", {
          onProgress: (n, total) => {
            if (n % 4 === 0) window.benchProgress(`scan ${n}/${total}`);
          },
        });
        const scanMs = performance.now() - started;
        const sheetStart = performance.now();
        const sheets = await sheetFn(compare, "run", "right", {
          referenceLabel: "PINNED",
          onProgress: (n, t) => window.benchProgress(`sheet ${n}/${t}`),
        });
        const sheetsMs = performance.now() - sheetStart;
        const hash = async (bytes) =>
          [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        const pages = [];
        for (const p of sheets)
          pages.push({
            page: p.page,
            width: p.width,
            height: p.height,
            rows: p.rows,
            bytes: p.png.length,
            sha256: await hash(p.png),
          });
        return {
          variant,
          character: "female",
          action: "run",
          facing: "right",
          sourceSha256: project.document.sourceSha256,
          registrationSha256: project.document.registrationSha256,
          appearanceSha256: project.appearanceBank.sha256,
          garments: project.items.map((i) => ({
            id: i.manifest.id,
            sha256: i.sha256,
          })),
          scanMs,
          sheetsMs,
          totalMs: scanMs + sheetsMs,
          counts,
          renderMs,
          lookSwitches: sequence.slice(1).filter((s, i) => s !== sequence[i])
            .length,
          scan,
          pages,
        };
      }
      const runs = [];
      for (const variant of paired
        ? ["before", "after", "after", "before"]
        : ["after"]) {
        await window.benchProgress(`Starting ${variant}`);
        runs.push(await measure(variant));
      }
      a.dispose();
      b.dispose();
      return paired ? { runs } : runs[0];
    }, paired),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(Error("Benchmark exceeded 8-minute bound.")),
        480000,
      ),
    ),
  ]);
  assert.deepEqual(errors, []);
  report.errors = errors;
  report.baselineCommit = baselineCommit;
  if (paired) {
    for (const run of report.runs) {
      assert.deepEqual(run.pages, report.runs[0].pages);
      assert.deepEqual(run.scan, report.runs[0].scan);
    }
    report.allOutputsIdentical = true;
  }
  report.label = label;
  report.recordedAt = new Date().toISOString();
  report.sourceHashes = inputHashes;
  for (const file of sourceFiles)
    assert.equal(
      createHash("sha256")
        .update(await readFile(resolve(root, file)))
        .digest("hex"),
      inputHashes[file],
      `Benchmark input changed during measurement: ${file}`,
    );
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      label,
      pairedRuns: report.runs?.map(
        ({ variant, scanMs, sheetsMs, totalMs, lookSwitches }) => ({
          variant,
          scanMs,
          sheetsMs,
          totalMs,
          lookSwitches,
        }),
      ),
      scanMs: report.scanMs,
      sheetsMs: report.sheetsMs,
      renderMs: report.renderMs,
      lookSwitches: report.lookSwitches,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
process.exit(0);
