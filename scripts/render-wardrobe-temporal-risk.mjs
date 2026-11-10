#!/usr/bin/env node
/** Actual compositor witnesses for the highest temporal candidates, never a visual pass. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { createServer } from "vite";
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const { values } = parseArgs({
  options: {
    directory: { type: "string", default: "docs/wardrobe-finish/mixed" },
    temporary: {
      type: "string",
      default: "/tmp/wardrobe-finish/mixed/temporal-witnesses",
    },
  },
});
const out = resolve(root, values.directory),
  temp = resolve(values.temporary);
await mkdir(temp, { recursive: true });
const read = async (p) => new Uint8Array(await readFile(resolve(root, p)));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const report = JSON.parse(
  await readFile(resolve(out, "temporal.json"), "utf8"),
);
const plan = JSON.parse(await readFile(resolve(out, "plan.json"), "utf8"));
const groups = new Map(plan.groups.map((g) => [g.id, g]));
const garmentMap = new Map(report.garments.map((g) => [g.path, g]));
const candidates = report.garments
  .flatMap((garment) =>
    garment.edges.map((edge) => ({
      ...edge,
      assetPath: garment.path,
      garmentId: garment.id,
      group: garment.groups.find((id) => groups.has(id)),
    })),
  )
  .sort(
    (a, b) =>
      b.triageScore - a.triageScore ||
      a.assetPath.localeCompare(b.assetPath, "en") ||
      a.action.localeCompare(b.action, "en") ||
      a.fromPosition - b.fromPosition,
  );
const cases = [];
for (const character of ["male", "female"])
  for (const view of ["original", "side"]) {
    const ranked = candidates.filter((edge) => {
      const group = groups.get(edge.group);
      return group.character === character && group.view === view;
    });
    const gameplay = ranked.find((edge) => edge.clipSet === "gameplay");
    assert(gameplay, `${character}/${view}: no actual gameplay witness`);
    const other = ranked.find(
      (edge) =>
        edge.action !== gameplay.action ||
        edge.fromFrameId !== gameplay.fromFrameId ||
        edge.toFrameId !== gameplay.toFrameId,
    );
    assert(other, `${character}/${view}: no distinct second witness`);
    for (const edge of [gameplay, other])
      cases.push({ group: groups.get(edge.group), edge });
  }
const server = await createServer({ root, server: { middlewareMode: true } });
try {
  const { createWardrobeProject, selectWardrobeGarment } =
    await server.ssrLoadModule("/src/wardrobe/project.ts");
  const { createWardrobeCompositor } = await server.ssrLoadModule(
    "/src/wardrobe/compositor.ts",
  );
  const { encodeSourceRgbaPng } = await server.ssrLoadModule(
    "/src/core/baked-source.ts",
  );
  const rows = [];
  for (let i = 0; i < cases.length; i++) {
    const { group, edge } = cases[i],
      garment = garmentMap.get(edge.assetPath),
      bank = await read(edge.assetPath);
    assert.equal(sha(bank), garment.sha256);
    let project = await createWardrobeProject(
      await read(group.sourceUrl),
      await read(group.registrationUrl),
      [bank],
    );
    for (const item of project.items)
      project = selectWardrobeGarment(
        project,
        item.manifest.slot,
        item.manifest.id,
      );
    const renderer = await createWardrobeCompositor(project);
    const dir = resolve(temp, String(i));
    await mkdir(dir, { recursive: true });
    const frames = [];
    for (const id of [edge.fromFrameId, edge.toFrameId]) {
      const source = renderer.renderSourceFrame(id),
        current = renderer.renderFrame(id);
      await writeFile(
        resolve(dir, `${id}-source.png`),
        encodeSourceRgbaPng(source),
      );
      await writeFile(
        resolve(dir, `${id}-current.png`),
        encodeSourceRgbaPng(current),
      );
      frames.push({
        frameId: id,
        sourceRgbaSha256: sha(source.pixels),
        currentRgbaSha256: sha(current.pixels),
        nativeBounds: garment.frameStatistics[id].visibleBounds,
      });
    }
    renderer.dispose();
    rows.push({
      index: i,
      group: group.id,
      character: group.character,
      view: group.view,
      edge,
      garmentSha256: garment.sha256,
      frames,
      localPngDirectory: dir,
      interpretation:
        "Standalone garment over its own source, not a complete outfit. Compare both native poses to the same source motion. Triage score alone is not a defect.",
    });
    console.log(
      `${group.character}/${group.view}: ${edge.garmentId} ${edge.fromFrameId}->${edge.toFrameId}`,
    );
  }
  await writeFile(
    resolve(out, "temporal-witnesses.json"),
    JSON.stringify(
      {
        format: "gathria-wardrobe-temporal-witnesses",
        version: 1,
        selection:
          "For each character/view: highest-risk actual gameplay pair, then highest-risk distinct remaining pair including retained native source clips. Duplicate palettes of the same frame pair do not consume both slots.",
        temporalReportSha256: sha(
          await readFile(resolve(out, "temporal.json")),
        ),
        results: rows,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await server.close();
}
