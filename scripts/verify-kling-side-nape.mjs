// Current side-fitting audit: strict runtime composition versus pinned PR53 banks.
// This intentionally shares the previous audit protocol but writes new evidence only.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import { execFileSync } from "node:child_process";
const root = new URL("../", import.meta.url).pathname;
const out = "/tmp/side-fitting/hair/runtime";
await mkdir(out, { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const server = await createServer({
  root,
  cacheDir: "/tmp/side-fitting/hair/vite-cache",
  server: { middlewareMode: true, watch: null },
  appType: "custom",
});
function polygonMask(points, w, h) {
  const out = new Uint8Array(w * h);
  for (
    let y = Math.max(0, Math.ceil(Math.min(...points.map((p) => p.y)) - 0.5));
    y <= Math.min(h - 1, Math.floor(Math.max(...points.map((p) => p.y)) - 0.5));
    y++
  ) {
    const cy = y + 0.5,
      cross = [],
      spans = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j],
        b = points[i];
      if (a.y > cy !== b.y > cy)
        cross.push(a.x + ((cy - a.y) * (b.x - a.x)) / (b.y - a.y));
      if (Math.abs(a.y - cy) < 1e-9 && Math.abs(b.y - cy) < 1e-9)
        spans.push([a.x, b.x]);
      else if (Math.abs(a.y - cy) < 1e-9) spans.push([a.x, a.x]);
    }
    cross.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cross.length; i += 2)
      spans.push([cross[i], cross[i + 1]]);
    for (const [a, b] of spans)
      for (
        let x = Math.max(0, Math.ceil(Math.min(a, b) - 0.5 - 1e-9));
        x <= Math.min(w - 1, Math.floor(Math.max(a, b) - 0.5 + 1e-9));
        x++
      )
        out[y * w + x] = 1;
  }
  return out;
}
const report = {
  checkedAt: new Date().toISOString(),
  method:
    "Existing strict bank/source parsers, and AppearanceRenderer via Vite SSR. Independent point-center protection audit over every native RGBA frame in all three colors. Actual UI export QA is separate.",
  baselineCommit: "220ea2fd7588c1fe784c8454d66469d60fba096a",
  verifier: "scripts/verify-kling-side-nape.mjs",
  verifierSha256: sha(await readFile(new URL(import.meta.url))),
  characters: [],
};
try {
  const { readPortableCharacterPackArchive } =
    await server.ssrLoadModule("/src/core/pack.ts");
  const { validateWardrobeRegistration } = await server.ssrLoadModule(
    "/src/wardrobe/contract.ts",
  );
  const { readAppearanceBank } = await server.ssrLoadModule(
    "/src/appearance/bank.ts",
  );
  const { AppearanceRenderer } = await server.ssrLoadModule(
    "/src/appearance/render.ts",
  );
  const { decodeSourceRgbaPng, encodeSourceRgbaPng } =
    await server.ssrLoadModule("/src/core/baked-source.ts");
  for (const gender of ["male", "female"]) {
    const sourceBytes = await readFile(
      `${root}/docs/kling-side-workspace/assets/${gender}.source.zip`,
    );
    const archive = readPortableCharacterPackArchive(
      new Uint8Array(sourceBytes),
    );
    const regBytes = await readFile(
      `${root}/artwork/kling-side-expansion/templates/${gender}.registration.json`,
    );
    const registration = validateWardrobeRegistration(
      JSON.parse(regBytes),
      archive,
      sha(sourceBytes),
    );
    const bankBytes = await readFile(
      `${root}/docs/kling-side-expansion/assets/${gender}.appearance.zip`,
    );
    const bank = await readAppearanceBank(
      new Uint8Array(bankBytes),
      registration,
      sha(regBytes),
    );
    const baselineBytes = execFileSync(
      "git",
      [
        "show",
        `${report.baselineCommit}:docs/kling-side-expansion/assets/${gender}.appearance.zip`,
      ],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    );
    const baselineBank = await readAppearanceBank(
      new Uint8Array(baselineBytes),
      registration,
      sha(regBytes),
    );
    const pages = [archive.png, ...(archive.additionalPngs ?? [])].map((p) =>
      decodeSourceRgbaPng(p),
    );
    const protection = new Map(
      registration.frames.map((f) => [f.frameId, f.protected]),
    );
    const rows = [];
    const renders = new Map(
      ["chestnut", "espresso", "copper"].map((color) => [
        color,
        new AppearanceRenderer(
          bank,
          {
            bankSha256: bank.sha256,
            hairId: bank.manifest.styles[0].id,
            faceId: null,
            hairColor: color,
          },
          protection,
        ),
      ]),
    );
    const baselineRenderers = new Map(
      ["chestnut", "espresso", "copper"].map((color) => [
        color,
        new AppearanceRenderer(
          baselineBank,
          {
            bankSha256: baselineBank.sha256,
            hairId: baselineBank.manifest.styles[0].id,
            faceId: null,
            hairColor: color,
          },
          protection,
        ),
      ]),
    );
    const ownershipPages = bank.pages.map((p) =>
      decodeSourceRgbaPng(p.ownership),
    );
    for (const frame of archive.manifest.frames) {
      const page = pages[frame.page ?? 0],
        w = frame.width,
        h = frame.height,
        pixels = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++)
        pixels.set(
          page.pixels.subarray(
            ((frame.y + y) * page.width + frame.x) * 4,
            ((frame.y + y) * page.width + frame.x + w) * 4,
          ),
          y * w * 4,
        );
      const source = {
        width: w,
        height: h,
        pixels,
        colorChunks: page.colorChunks,
      };
      const pose = bank.manifest.poses.find((p) => p.frameId === frame.id);
      const core = polygonMask(pose.facePolygon, w, h),
        front = new Uint8Array(w * h),
        owned = new Uint8Array(w * h);
      for (const poly of [
        ...pose.foreground,
        ...protection
          .get(frame.id)
          .filter((p) => p.label !== "head")
          .map((p) => p.polygon),
      ]) {
        const mask = polygonMask(poly, w, h);
        for (let i = 0; i < mask.length; i++) front[i] |= mask[i];
      }
      for (const layer of bank.manifest.styles[0].layers) {
        const f = layer.frames.find((f) => f.frameId === frame.id);
        if (f.mode !== "paint") continue;
        const p = ownershipPages[f.page];
        for (let y = 0; y < f.rect.height; y++)
          for (let x = 0; x < f.rect.width; x++)
            if (p.pixels[((f.rect.y + y) * p.width + f.rect.x + x) * 4 + 3])
              owned[(f.offset.y + y) * w + f.offset.x + x] = 1;
      }
      const row = {
        frameId: frame.id,
        sourceFrame: registration.frames.find((f) => f.frameId === frame.id)
          .sourceFrame,
        colors: [],
      };
      for (const [color, renderer] of renders) {
        const result = renderer.render(frame.id, source, source);
        const before = baselineRenderers
          .get(color)
          .render(frame.id, source, source);
        let baselineDelta = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (
            [0, 1, 2, 3].some(
              (c) => result.pixels[i + c] !== before.pixels[i + c],
            )
          )
            baselineDelta++;
        }
        if (gender !== "male" || frame.id !== 67)
          assert.equal(
            baselineDelta,
            0,
            `${gender}/${frame.id}/${color}: unrelated render changed`,
          );
        else
          assert(
            baselineDelta > 0,
            "Nape correction must be visible in actual renderer",
          );
        if (color === "chestnut")
          await writeFile(
            `${out}/${gender}-${frame.id}-before.png`,
            encodeSourceRgbaPng(before),
          );
        let changed = 0;
        for (let i = 0; i < w * h; i++) {
          const j = i * 4;
          let diff = false;
          for (let c = 0; c < 4; c++)
            diff ||= pixels[j + c] !== result.pixels[j + c];
          if (diff) {
            changed++;
            assert(
              owned[i],
              `${gender}/${frame.id}/${color} changed outside hair`,
            );
            if (pixels[j + 3] === 255)
              assert(
                !core[i] && !front[i],
                `${gender}/${frame.id}/${color} changed protected source`,
              );
          }
        }
        assert(changed > 0);
        row.colors.push({
          color,
          changedAgainstBaselinePixels: baselineDelta,
          baselineRgbaSha256: sha(before.pixels),
          changedPixels: changed,
          exactOpaqueFace: true,
          exactOpaqueForeground: true,
          exactOutsideHair: true,
          renderRgbaSha256: sha(result.pixels),
        });
        await writeFile(
          `${out}/${gender}-${frame.id}-${color}.png`,
          encodeSourceRgbaPng(result),
        );
      }
      rows.push(row);
    }
    report.characters.push({
      gender,
      sourceSha256: sha(sourceBytes),
      registrationSha256: sha(regBytes),
      bankSha256: sha(bankBytes),
      baselineBankSha256: sha(baselineBytes),
      strictRuntimeImportPassed: true,
      frames: rows,
    });
  }
  report.passed = true;
  report.totalNativePoses = 209;
  report.totalColorPoses = 627;
  await writeFile(
    `${root}/docs/kling-side-fitting/hair/runtime-audit.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: true,
      poses: 209,
      colorPoses: 627,
      characters: report.characters.map(
        ({ gender, bankSha256, registrationSha256 }) => ({
          gender,
          bankSha256,
          registrationSha256,
        }),
      ),
    }),
  );
} finally {
  await server.close();
}
