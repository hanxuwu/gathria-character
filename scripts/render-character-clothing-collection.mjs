#!/usr/bin/env node
/** Current catalog snapshots rendered by the production wardrobe compositor. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const output = resolve(root, "docs/character-collection/clothing");
const inventoryPath = "docs/wardrobe-coverage/inventory.json";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const local = (path) => {
  const result = resolve(root, path.replace(/^\//, ""));
  assert(result.startsWith(root + sep), "Path escaped the repository");
  return result;
};
const read = async (path) => new Uint8Array(await readFile(local(path)));
const inventoryBytes = await read(inventoryPath);
const inventory = JSON.parse(new TextDecoder().decode(inventoryBytes));
assert.equal(inventory.issues.length, 0);
await mkdir(resolve(output, "native"), { recursive: true });
const codePaths = [
  "scripts/render-character-clothing-collection.mjs",
  "src/wardrobe/project.ts",
  "src/wardrobe/compositor.ts",
  "src/wardrobe/protection.ts",
  "src/wardrobe/neckline-permissions.ts",
  "src/core/baked-source.ts",
];
const manifest = {
  format: "gathria-current-clothing-collection",
  version: 1,
  artworkCommit: execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim(),
  inventoryPath,
  inventorySha256: sha(inventoryBytes),
  codeSha256: Object.fromEntries(await Promise.all(codePaths.map(async (p) => [p, sha(await read(p))]))),
  scope: "Every current runtime-selectable garment ZIP once, plus every declared preset in every current catalog group, including selectable earlier revisions and the male landing candidate. Each garment is worn alone over its original base clothes; preset clothing uses its exact declared selection. Original unmodified heads are used to compare clothing. This is a static inventory, not a full-motion visual acceptance or every possible mix.",
  rendering: "Production createWardrobeProject / selectWardrobeGarment / createWardrobeCompositor. Full original RGBA canvas, transparency, dimensions and color profile retained. No resize, recenter, redraw, retiming or appearance substitution. Two actual native poses: first idle frame and one-quarter of the native run sequence.",
  groups: inventory.groups.map((g) => ({
    id: g.id, family: g.family, character: g.character, view: g.view,
    catalog: g.catalog, sourceUrl: g.sourceUrl, registrationUrl: g.registrationUrl,
    sourceSha256: g.sourceSha256, registrationSha256: g.registrationSha256,
    nativeSize: g.nativeSize, actionNames: g.actionNames,
    garmentReferences: g.items.length, declaredPresets: g.presets.length,
    candidate: g.id.includes("landing-candidate"),
  })),
  entries: [],
  summary: {},
};
const writeManifest = async () => {
  manifest.summary = {
    groups: manifest.groups.length,
    uniqueGarments: manifest.entries.filter((e) => e.kind === "garment").length,
    presetEntries: manifest.entries.filter((e) => e.kind === "preset").length,
    entries: manifest.entries.length,
    uniqueRenderedSelections: rendered.size,
    nativePngs: new Set(manifest.entries.flatMap((e) => Object.values(e.frames).map((f) => f.file))).size,
  };
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
};
const server = await createServer({ root, server: { middlewareMode: true } });
const seen = new Set(), rendered = new Map();
const cleared = { top: null, bottom: null, fullBody: null, shoes: null };
try {
  const { createWardrobeProject, selectWardrobeGarment } = await server.ssrLoadModule("/src/wardrobe/project.ts");
  const { createWardrobeCompositor } = await server.ssrLoadModule("/src/wardrobe/compositor.ts");
  const { encodeSourceRgbaPng } = await server.ssrLoadModule("/src/core/baked-source.ts");
  for (const group of inventory.groups) {
    const source = await read(group.sourceUrl), registration = await read(group.registrationUrl);
    assert.equal(sha(source), group.sourceSha256);
    assert.equal(sha(registration), group.registrationSha256);
    const items = new Map();
    for (const item of group.items) {
      const bytes = await read(item.url);
      assert.equal(sha(bytes), item.actualSha256, `Stale inventory: ${item.url}`);
      items.set(item.id, { ...item, bytes });
    }
    const runs = [];
    for (const item of group.items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      runs.push({
        kind: "garment", id: item.id, name: item.name,
        slot: item.slot, assetUrl: item.url,
        groups: inventory.assets.find((a) => a.path === item.url).groups,
        selection: { ...cleared, [item.slot]: item.id },
      });
    }
    for (const preset of group.presets) runs.push({
      kind: "preset", id: preset.id, name: preset.name ?? preset.id,
      palette: preset.palette ?? null, groups: [group.id],
      selection: { ...cleared, ...preset.selection },
    });
    for (const run of runs) {
      const key = `${group.id}--${run.kind}--${run.id}`;
      assert(/^[a-z0-9-]+$/.test(key), `Unsafe file key ${key}`);
      const selected = Object.values(run.selection).filter(Boolean).map((id) => {
        assert(items.has(id), `Missing garment ${id}`);
        return items.get(id);
      });
      const garments = selected.map(({ id, url, actualSha256 }) => ({ id, url, sha256: actualSha256 }));
      const signature = sha(JSON.stringify({ source: group.sourceSha256, registration: group.registrationSha256, selection: run.selection, garments }));
      let frames = rendered.get(signature);
      if (!frames) {
        let project = await createWardrobeProject(source, registration, selected.map((i) => i.bytes));
        for (const [slot, id] of Object.entries(run.selection))
          if (id) project = selectWardrobeGarment(project, slot, id);
        assert.deepEqual(project.document.selection, run.selection);
        const compositor = await createWardrobeCompositor(project);
        frames = {};
        try {
          const animations = compositor.manifest.animations;
          const ids = {
            idle: animations.idle.frames[0],
            run: animations.run.frames[Math.floor(animations.run.frames.length / 4)],
          };
          for (const [action, frameId] of Object.entries(ids)) {
            const image = compositor.renderFrame(frameId);
            const bytes = encodeSourceRgbaPng(image);
            const file = `native/${key}--${action}.png`;
            await writeFile(resolve(output, file), bytes);
            frames[action] = { file, frameId, width: image.width, height: image.height, sha256: sha(bytes), rgbaSha256: sha(image.pixels) };
          }
        } finally { compositor.dispose(); }
        rendered.set(signature, frames);
      }
      manifest.entries.push({
        key, ...run, groupId: group.id, family: group.family,
        character: group.character, view: group.view,
        candidate: group.id.includes("landing-candidate"),
        sourceUrl: group.sourceUrl, sourceSha256: group.sourceSha256,
        registrationUrl: group.registrationUrl, registrationSha256: group.registrationSha256,
        garments, frames,
      });
      console.log(`${manifest.entries.length}: ${key}`);
    }
    await writeManifest();
    console.log(`Completed ${group.id}; ${rendered.size} unique rendered selections`);
  }
  assert.equal(seen.size, inventory.summary.uniqueActiveGarmentFiles);
  assert.equal(manifest.entries.filter((e) => e.kind === "preset").length, inventory.groups.reduce((n, g) => n + g.presets.length, 0));
  manifest.complete = true;
  await writeManifest();
  console.log(JSON.stringify(manifest.summary));
} finally { await server.close(); }
