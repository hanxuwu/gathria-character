// Real compositor sweep of the inventory, including every declared preset.
// Pixel hashes and protection validation are technical evidence, not visual acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname, sep } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const { values } = parseArgs({
  options: {
    inventory: {
      type: "string",
      default: "docs/wardrobe-coverage/inventory.json",
    },
    out: { type: "string", default: "docs/wardrobe-coverage/runtime.json" },
    groups: { type: "string" },
  },
});
const read = async (path) => new Uint8Array(await readFile(path));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const local = (path) => {
  const result = resolve(root, path.replace(/^\//, ""));
  assert(result.startsWith(root + sep), "Asset path escaped repository");
  return result;
};
const inventory = JSON.parse(
  await readFile(resolve(root, values.inventory), "utf8"),
);
assert.equal(
  inventory.issues.length,
  0,
  "Regenerate a valid asset inventory first",
);
const requested = values.groups?.split(",");
const groups = requested
  ? inventory.groups.filter((g) => requested.includes(g.id))
  : inventory.groups;
assert(
  groups.length && (!requested || groups.length === new Set(requested).size),
);
const server = await createServer({ root, server: { middlewareMode: true } });
const records = [],
  seen = new Set();
let itemFrames = 0,
  presetFrames = 0;
try {
  const {
    createWardrobeProject,
    selectWardrobeGarment,
    exportWardrobeProject,
    importWardrobeProject,
  } = await server.ssrLoadModule("/src/wardrobe/project.ts");
  const { createWardrobeCompositor, validateWardrobeAppearance } =
    await server.ssrLoadModule("/src/wardrobe/compositor.ts");
  const cleared = { top: null, bottom: null, fullBody: null, shoes: null };
  const selected = (project, selection) => {
    for (const slot of Object.keys(cleared))
      project = selectWardrobeGarment(project, slot, null);
    for (const [slot, id] of Object.entries(selection))
      if (id) project = selectWardrobeGarment(project, slot, id);
    return project;
  };
  for (const group of groups) {
    const source = await read(local(group.sourceUrl)),
      registration = await read(local(group.registrationUrl));
    assert.equal(sha(source), group.sourceSha256);
    assert.equal(sha(registration), group.registrationSha256);
    const items = await Promise.all(
      group.items.map(async (item) => {
        const bytes = await read(local(item.url));
        assert.equal(
          sha(bytes),
          item.actualSha256,
          `${item.id}: stale inventory`,
        );
        return bytes;
      }),
    );
    // Match lazy UI loading. A whole catalog is larger than the supported
    // saved-project budget; only the selected banks belong in one project.
    const bytesById = new Map(
      group.items.map((item, i) => [item.id, items[i]]),
    );
    const frameIds = JSON.parse(
      new TextDecoder().decode(registration),
    ).frames.map((f) => f.frameId);
    const runs = [];
    for (const item of group.items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      runs.push({
        kind: "item",
        id: item.id,
        selection: { ...cleared, [item.slot]: item.id },
      });
    }
    for (const preset of group.presets)
      runs.push({ kind: "preset", id: preset.id, selection: preset.selection });
    const results = [];
    let lastProject;
    for (const run of runs) {
      const ids = [...new Set(Object.values(run.selection).filter(Boolean))];
      const banks = ids.map((id) => {
        assert(
          bytesById.has(id),
          `${group.id}: unknown selected garment ${id}`,
        );
        return bytesById.get(id);
      });
      lastProject = selected(
        await createWardrobeProject(source, registration, banks),
        run.selection,
      );
      const compositor = await createWardrobeCompositor(lastProject);
      try {
        const validation = await validateWardrobeAppearance(compositor);
        assert.equal(validation.frames, frameIds.length);
        const digest = createHash("sha256");
        for (const id of frameIds) {
          digest.update(String(id) + ":");
          digest.update(compositor.renderFrame(id).pixels);
        }
        results.push({
          ...run,
          frames: frameIds.length,
          rgbaSha256: digest.digest("hex"),
        });
        if (run.kind === "item") itemFrames += frameIds.length;
        else presetFrames += frameIds.length;
      } finally {
        compositor.dispose();
      }
    }
    const bytes = await exportWardrobeProject(lastProject);
    const reopened = await importWardrobeProject(bytes);
    assert.deepEqual(reopened.document, lastProject.document);
    assert.deepEqual(reopened.source, lastProject.source);
    assert.deepEqual(reopened.registrationBytes, lastProject.registrationBytes);
    assert.deepEqual(
      reopened.items.map((i) => i.sha256),
      lastProject.items.map((i) => i.sha256),
    );
    const before = await createWardrobeCompositor(lastProject),
      after = await createWardrobeCompositor(reopened);
    try {
      for (const id of [frameIds[0], frameIds.at(-1)])
        assert.deepEqual(after.renderFrame(id), before.renderFrame(id));
    } finally {
      before.dispose();
      after.dispose();
    }
    records.push({
      id: group.id,
      sourceSha256: group.sourceSha256,
      registrationSha256: group.registrationSha256,
      results,
      savedProjectReopenedWithExactEmbeddedAssets: true,
      reopenedEndpointFramesExact: true,
    });
    console.log(
      `${group.id}: ${results.length} configurations × ${frameIds.length} frames; save/reopen passed`,
    );
  }
  if (!requested) {
    assert.equal(seen.size, inventory.summary.uniqueActiveGarmentFiles);
    assert.equal(itemFrames, inventory.summary.uniqueGarmentFramePairs);
  }
  const report = {
    format: "gathria-wardrobe-coverage-runtime-review",
    version: 1,
    scope:
      "Real runtime reader/compositor, every scoped garment and declared preset, all native frames, per-group saved project reopening. This does not certify visual coverage or perceptual absence of clipping. See separate source-cloth and hand-contour review evidence.",
    inventorySha256: sha(await read(resolve(root, values.inventory))),
    codeSha256: Object.fromEntries(
      await Promise.all(
        [
          "src/wardrobe/contract.ts",
          "src/wardrobe/protection.ts",
          "src/wardrobe/compositor.ts",
          "src/wardrobe/neckline-permissions.ts",
          "src/wardrobe/project.ts",
        ].map(async (path) => [path, sha(await read(local(path)))]),
      ),
    ),
    summary: {
      groups: records.length,
      uniqueGarments: seen.size,
      garmentFrames: itemFrames,
      presetFrames,
    },
    groups: records,
  };
  const output = resolve(root, values.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary));
} finally {
  await server.close();
}
