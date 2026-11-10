#!/usr/bin/env node
/** Actual renderer before/after evidence for the three cloth-only refits. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { build } from "esbuild";

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    out: { type: "string", default: "docs/wardrobe-finish/side" },
    temporary: { type: "string", default: "/tmp/wardrobe-finish/side/actual" },
  },
});
assert(
  values.baseline,
  "--baseline is required (the frozen, hash-bound previous ZIPs)",
);
const root = process.cwd(),
  out = resolve(values.out),
  temp = resolve(values.temporary);
const bytes = async (p) => new Uint8Array(await readFile(resolve(root, p)));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const reportBytes = await readFile(resolve(out, "repair-report.json"));
const report = JSON.parse(reportBytes);
const recipe = JSON.parse(
  await readFile("artwork/wardrobe-coverage/side/recipe.json", "utf8"),
);
const server = await createServer({ root, server: { middlewareMode: true } });
await mkdir(resolve(out, "review"), { recursive: true });
await mkdir(temp, { recursive: true });
try {
  const { createWardrobeProject, selectWardrobeGarment } =
    await server.ssrLoadModule("/src/wardrobe/project.ts");
  const { createWardrobeCompositor } = await server.ssrLoadModule(
    "/src/wardrobe/compositor.ts",
  );
  const { resolveGameplayMotion } = await server.ssrLoadModule(
    "/src/core/gameplay-motion.ts",
  );
  const { encodeSourceRgbaPng } = await server.ssrLoadModule(
    "/src/core/baked-source.ts",
  );
  const bundle = await build({
    entryPoints: ["src/wardrobe/action-gif.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { exportWardrobeActionGif } = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].contents).toString("base64")
  );
  const records = [];
  for (let i = 0; i < report.items.length; i += 2) {
    const items = report.items.slice(i, i + 2);
    assert.deepEqual(
      items.map((x) => x.slot),
      ["top", "bottom"],
    );
    const entry = recipe.items.find((x) => x.id === items[0].id);
    const source = await bytes(entry.source),
      registration = await bytes(entry.registration);
    const current = await Promise.all(items.map((x) => bytes(x.path)));
    const previous = await Promise.all(
      items.map((x) => bytes(resolve(values.baseline, x.id + ".zip"))),
    );
    items.forEach((x, j) => {
      assert.equal(sha(current[j]), x.afterSha256);
      assert.equal(sha(previous[j]), x.beforeSha256);
    });
    const make = async (banks) => {
      let p = await createWardrobeProject(source, registration, banks);
      for (const x of p.items)
        p = selectWardrobeGarment(p, x.manifest.slot, x.manifest.id);
      return createWardrobeCompositor(p);
    };
    const before = await make(previous),
      after = await make(current);
    const motion = resolveGameplayMotion(after.sourceManifest, sha(source), {
      characterId: after.sourceCharacterId,
    });
    const changes = [];
    for (const f of after.sourceManifest.frames) {
      const a = before.renderFrame(f.id),
        b = after.renderFrame(f.id);
      if (sha(a.pixels) !== sha(b.pixels)) changes.push(f.id);
      if (![21, 38, 39].includes(f.id))
        assert.equal(
          sha(a.pixels),
          sha(b.pixels),
          "Unreviewed native pose changed",
        );
      assert.equal(
        sha(before.renderSourceFrame(f.id).pixels),
        sha(after.renderSourceFrame(f.id).pixels),
      );
    }
    assert.deepEqual(changes, [21, 38, 39]);
    const label = items[0].id.replace(/-(top|blouse)(-bound)?-v1$/, "");
    const gifs = [];
    if (i === 0 || i === 4 || i === 12) {
      const compare = {
        manifest: after.manifest,
        sourceCharacterId: after.sourceCharacterId,
        renderFrame: (id) => after.renderFrame(id),
        renderSourceFrame: (id) => before.renderFrame(id),
      };
      for (const action of ["walk", "run"])
        for (const facing of ["right", "left"]) {
          const gif = await exportWardrobeActionGif(compare, action, facing, {
            gameplayMotion: motion,
            comparison: true,
            referenceLabel: "PINNED",
          });
          const file = `review/${label}-${action}-${facing}.gif`;
          await writeFile(resolve(out, file), gif);
          gifs.push({
            file,
            sha256: sha(gif),
            action,
            facing,
            frames: motion.actions[action].frames,
            fps: motion.actions[action].fps,
            loop: motion.actions[action].loop,
          });
        }
    }
    if (i === 0)
      for (const fid of [19, 20, 21, 22, 23, 36, 37, 38, 39, 40])
        for (const [name, frame] of [
          ["source", after.renderSourceFrame(fid)],
          ["before", before.renderFrame(fid)],
          ["after", after.renderFrame(fid)],
        ])
          await writeFile(
            resolve(temp, `${fid}-${name}.png`),
            encodeSourceRgbaPng(frame),
          );
    records.push({
      items: items.map((x) => ({
        path: x.path,
        beforeSha256: x.beforeSha256,
        afterSha256: x.afterSha256,
      })),
      nativeFrames: after.sourceManifest.frames.length,
      changedFrames: changes,
      sourceAllFramesExact: true,
      outsideReviewedPosesExact: true,
      protectedPixelsCheckedByRuntime: true,
      gifs,
    });
    before.dispose();
    after.dispose();
    console.log(label, "all native frames and protected pixels checked");
  }
  await writeFile(
    resolve(out, "runtime.json"),
    JSON.stringify(
      {
        format: "gathria-side-temporal-runtime-review",
        version: 1,
        repairReportSha256: sha(reportBytes),
        nativeReviewDirectory: temp,
        interpretation:
          "PINNED is the frozen previous outfit; CURRENT is the corrected outfit. Both use the identical source action, timing and scale. Visual quality still requires watching the GIFs.",
        results: records,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await server.close();
}
