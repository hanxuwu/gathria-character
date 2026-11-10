#!/usr/bin/env node
/** Deterministic risk-factor mix review, using the actual project/compositor/exporter. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";
import { build } from "esbuild";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const { values } = parseArgs({
  options: {
    inventory: {
      type: "string",
      default: "docs/wardrobe-coverage/inventory.json",
    },
    out: { type: "string", default: "docs/wardrobe-finish/mixed" },
    temporary: { type: "string", default: "/tmp/wardrobe-finish/mixed" },
    groups: { type: "string" },
    "plan-only": { type: "boolean", default: false },
    "skip-exports": { type: "boolean", default: false },
  },
});
const out = resolve(root, values.out),
  temp = resolve(values.temporary);
await mkdir(out, { recursive: true });
await mkdir(temp, { recursive: true });
const bytes = async (p) =>
  new Uint8Array(await readFile(resolve(root, p.replace(/^\//, ""))));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const json = async (p, v) => writeFile(p, JSON.stringify(v, null, 2) + "\n");
const inv = JSON.parse(await readFile(resolve(root, values.inventory), "utf8"));
assert.equal(inv.issues.length, 0, "Refresh a valid inventory first");
const sourceFiles = [
  "src/wardrobe/project.ts",
  "src/wardrobe/compositor.ts",
  "src/wardrobe/contract.ts",
  "src/wardrobe/protection.ts",
  "src/wardrobe/neckline-permissions.ts",
  "src/wardrobe/action-gif.ts",
  "src/core/gameplay-motion.ts",
];
const codeSha256 = Object.fromEntries(
  await Promise.all(sourceFiles.map(async (p) => [p, sha(await bytes(p))])),
);
const requested = values.groups?.split(",");
const groups = inv.groups.filter((g) => !requested || requested.includes(g.id));
if (requested) assert.equal(groups.length, new Set(requested).size);
const server = await createServer({ root, server: { middlewareMode: true } });
const cleared = { top: null, bottom: null, fullBody: null, shoes: null };
const bottomShape = (item) =>
  /shorts|短裤/.test(item.id + " " + (item.name ?? ""))
    ? "shorts"
    : /skirt|短裙|裙摆/.test(item.id + " " + (item.name ?? ""))
      ? "skirt"
      : /trouser|chino|长裤|landing-male-(daily|wedding)-bottom/.test(
            item.id + " " + (item.name ?? ""),
          )
        ? "trousers"
        : "source-cut";
const exportGroups = new Set([
  "original-male",
  "original-female",
  "side-tailored-male",
  "side-tailored-female",
  "side-landing-candidate-male",
  "dual-tailored-day-male-side",
  "dual-tailored-day-female-side",
]);
const selected = (project, selection, select) => {
  for (const slot of Object.keys(cleared))
    project = select(project, slot, null);
  for (const [slot, id] of Object.entries(selection))
    if (id) project = select(project, slot, id);
  return project;
};
try {
  const {
    createWardrobeProject,
    selectWardrobeGarment,
    exportWardrobeProject,
    importWardrobeProject,
  } = await server.ssrLoadModule("/src/wardrobe/project.ts");
  const { createWardrobeCompositor, exportWardrobeCharacterPack } =
    await server.ssrLoadModule("/src/wardrobe/compositor.ts");
  const { resolveGameplayMotion } = await server.ssrLoadModule(
    "/src/core/gameplay-motion.ts",
  );
  const { readPortableCharacterPackArchive } =
    await server.ssrLoadModule("/src/core/pack.ts");
  const { encodeSourceRgbaPng, decodeSourceRgbaPng } =
    await server.ssrLoadModule("/src/core/baked-source.ts");
  const gifModule = await build({
    entryPoints: [resolve(root, "src/wardrobe/action-gif.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { exportWardrobeActionGif, compactGifFrame } = await import(
    `data:text/javascript;base64,${Buffer.from(gifModule.outputFiles[0].contents).toString("base64")}`
  );
  const plan = {
    format: "gathria-mixed-outfit-review-plan",
    version: 1,
    generatorSha256: sha(
      await bytes("scripts/review-wardrobe-mixed-finish.mjs"),
    ),
    inventorySha256: sha(await bytes(values.inventory)),
    codeSha256,
    scope:
      "All built-in groups. Top ID × bottom silhouette is covered; groups with at most 2 tops include every top × bottom ID. Dress/shoe pairs are included where available. Appearance styles and arbitrary external assets are outside this mix matrix.",
    groups: [],
  };
  const results = [];
  let rendered = 0;
  let duplicates = 0;
  const seen = new Map();
  for (const group of groups) {
    const source = await bytes(group.sourceUrl),
      registration = await bytes(group.registrationUrl);
    assert.equal(sha(source), group.sourceSha256);
    assert.equal(sha(registration), group.registrationSha256);
    const bare = await createWardrobeProject(source, registration, []);
    const motion = resolveGameplayMotion(
      bare.archive.manifest,
      bare.document.sourceSha256,
      bare.archive.config,
    );
    assert(motion, `${group.id}: explicit gameplay actions required`);
    const tops = group.items
      .filter((i) => i.slot === "top")
      .sort((a, b) => a.id.localeCompare(b.id, "en"));
    const bottoms = group.items
      .filter((i) => i.slot === "bottom")
      .sort((a, b) => a.id.localeCompare(b.id, "en"));
    const dresses = group.items
      .filter((i) => i.slot === "fullBody")
      .sort((a, b) => a.id.localeCompare(b.id, "en"));
    const shoes = group.items
      .filter((i) => i.slot === "shoes")
      .sort((a, b) => a.id.localeCompare(b.id, "en"));
    const families = [...new Set(bottoms.map((i) => bottomShape(i)))].sort();
    let mixes = [];
    for (let index = 0; index < tops.length; index++) {
      const top = tops[index];
      const selectedBottoms =
        tops.length <= 2
          ? bottoms
          : families.map((f) => {
              const eligible = bottoms.filter((i) => bottomShape(i) === f);
              return eligible[index % eligible.length];
            });
      for (const bottom of selectedBottoms)
        mixes.push({
          id: `${top.id}--${bottom.id}`,
          selection: { ...cleared, top: top.id, bottom: bottom.id },
          reason:
            tops.length <= 2
              ? "exhaustive top/bottom ID pair"
              : "top ID × bottom silhouette; palette alternates deterministically",
          factors: {
            top: top.id,
            bottom: bottom.id,
            bottomShape: bottomShape(bottom),
            shoes: null,
          },
        });
    }
    for (const dress of dresses)
      for (const shoe of shoes.length ? shoes : [null])
        mixes.push({
          id: `${dress.id}--${shoe?.id ?? "source-shoes"}`,
          selection: {
            ...cleared,
            fullBody: dress.id,
            shoes: shoe?.id ?? null,
          },
          reason: "full-body dress with independent shoes",
          factors: { fullBody: dress.id, shoes: shoe?.id ?? null },
        });
    if (shoes.length && tops.length && bottoms.length) {
      const top = tops.at(-1),
        bottom = bottoms.at(-1);
      for (const shoe of shoes)
        mixes.push({
          id: `${top.id}--${bottom.id}--${shoe.id}`,
          selection: {
            ...cleared,
            top: top.id,
            bottom: bottom.id,
            shoes: shoe.id,
          },
          reason: "trouser/skirt hem with independent shoe edge",
          factors: {
            top: top.id,
            bottom: bottom.id,
            bottomShape: bottomShape(bottom),
            shoes: shoe.id,
          },
        });
    }
    const allPairs = tops.flatMap((top) =>
      bottoms.map((bottom) => `${top.id} + ${bottom.id}`),
    );
    const coveredPairs = new Set(
      mixes
        .filter((m) => m.selection.top && m.selection.bottom)
        .map((m) => `${m.selection.top} + ${m.selection.bottom}`),
    );
    const entry = {
      id: group.id,
      character: group.character,
      view: group.view,
      sourceUrl: group.sourceUrl,
      registrationUrl: group.registrationUrl,
      sourceSha256: group.sourceSha256,
      registrationSha256: group.registrationSha256,
      motionProfile: motion.id,
      actions: motion.actions,
      coverage: {
        availableTopBottomIdPairs: allPairs.length,
        selectedTopBottomIdPairs: coveredPairs.size,
        unselectedTopBottomIdPairs: allPairs.filter(
          (p) => !coveredPairs.has(p),
        ),
        topSilhouettePairs: tops.length * families.length,
        coveredTopSilhouettePairs: new Set(
          mixes
            .filter((m) => m.factors.top)
            .map((m) => m.factors.top + " + " + m.factors.bottomShape),
        ).size,
        facings: ["right", "left"],
      },
      cases: mixes,
    };
    plan.groups.push(entry);
    if (values["plan-only"]) continue;
    const itemMap = new Map(group.items.map((i) => [i.id, i]));
    let reviewIndex = mixes.findIndex((m) =>
      /navy-suit-jacket-v6|plum-pintuck|landing-male-wedding-top/.test(
        m.selection.top ?? "",
      ),
    );
    if (reviewIndex < 0) reviewIndex = Math.max(0, mixes.length - 1);
    for (let mi = 0; mi < mixes.length; mi++) {
      const mix = mixes[mi];
      const ids = Object.values(mix.selection).filter(Boolean);
      const selectedItems = ids.map((id) => itemMap.get(id));
      const key = JSON.stringify([
        group.sourceSha256,
        group.registrationSha256,
        ...selectedItems.map((i) => [i.slot, i.actualSha256]).sort(),
      ]);
      if (seen.has(key)) {
        duplicates++;
        results.push({
          group: group.id,
          caseId: mix.id,
          aliasOf: seen.get(key),
          exactSelectedAssetHashes: selectedItems.map((i) => i.actualSha256),
        });
        continue;
      }
      seen.set(key, `${group.id}/${mix.id}`);
      const banks = await Promise.all(
        selectedItems.map(async (i) => {
          const b = await bytes(i.url);
          assert.equal(sha(b), i.actualSha256, `${i.id}: stale inventory`);
          return b;
        }),
      );
      const project = selected(
        await createWardrobeProject(source, registration, banks),
        mix.selection,
        selectWardrobeGarment,
      );
      const renderer = await createWardrobeCompositor(project);
      const hashes = [],
        digest = createHash("sha256");
      const review = exportGroups.has(group.id) && mi === reviewIndex;
      const folder = resolve(temp, group.id, mix.id);
      if (review) await mkdir(folder, { recursive: true });
      for (const f of renderer.sourceManifest.frames) {
        const image = renderer.renderFrame(f.id);
        const hash = sha(image.pixels);
        hashes.push({ frameId: f.id, sha256: hash });
        digest.update(String(f.id) + ":");
        digest.update(image.pixels);
        rendered++;
        if (review) {
          await writeFile(
            resolve(folder, `${f.id}.png`),
            encodeSourceRgbaPng(image),
          );
          await writeFile(
            resolve(folder, `${f.id}-source.png`),
            encodeSourceRgbaPng(renderer.renderSourceFrame(f.id)),
          );
        }
      }
      const record = {
        group: group.id,
        caseId: mix.id,
        selection: mix.selection,
        selectedItems: selectedItems.map((i) => ({
          id: i.id,
          path: i.url,
          sha256: i.actualSha256,
        })),
        nativeFrames: hashes.length,
        rgbaSha256: digest.digest("hex"),
        frameHashes: hashes,
        protectionRulesCheckedOnEveryRender: true,
        visualAcceptance: "unreviewed",
      };
      if (review && !values["skip-exports"]) {
        const saved = await exportWardrobeProject(project);
        const reopened = await importWardrobeProject(saved);
        assert.deepEqual(reopened.document, project.document);
        assert.deepEqual(reopened.source, project.source);
        assert.deepEqual(reopened.registrationBytes, project.registrationBytes);
        const reopenRenderer = await createWardrobeCompositor(reopened);
        for (const h of hashes)
          assert.equal(
            sha(reopenRenderer.renderFrame(h.frameId).pixels),
            h.sha256,
            "reopened pixel mismatch",
          );
        reopenRenderer.dispose();
        const baked = await exportWardrobeCharacterPack(project, {
          gameplayMotion: motion,
        });
        const independent = readPortableCharacterPackArchive(baked);
        assert.deepEqual(independent.manifest.animations, motion.actions);
        const pages = [
          decodeSourceRgbaPng(independent.png),
          ...(independent.additionalPngs ?? []).map((p) =>
            decodeSourceRgbaPng(p),
          ),
        ];
        for (const f of independent.manifest.frames) {
          const p = pages[f.page ?? 0],
            rgba = new Uint8Array(f.width * f.height * 4);
          for (let y = 0; y < f.height; y++)
            rgba.set(
              p.pixels.subarray(
                ((y + f.y) * p.width + f.x) * 4,
                ((y + f.y) * p.width + f.x + f.width) * 4,
              ),
              y * f.width * 4,
            );
          assert.equal(
            sha(rgba),
            hashes.find((h) => h.frameId === f.id)?.sha256,
            "independent baked pixel mismatch",
          );
        }
        await writeFile(resolve(folder, "project.wardrobe.zip"), saved);
        await writeFile(resolve(folder, "export.character.zip"), baked);
        record.roundTrip = {
          savedProjectAllNativeFramesExact: true,
          sourceAndRegistrationExact: true,
          independentExportAllNativeFramesExact: true,
          sourceGameplayTimingExact: true,
          savedProjectSha256: sha(saved),
          exportedPackSha256: sha(baked),
          artifactsLocalOnly: folder,
        };
        record.gifs = [];
        await mkdir(resolve(out, "review"), { recursive: true });
        for (const action of ["run", "jump"])
          for (const facing of ["right", "left"]) {
            const gif = await exportWardrobeActionGif(
              renderer,
              action,
              facing,
              { gameplayMotion: motion, comparison: true },
            );
            const file = `${group.id}-${action}-${facing}.gif`;
            await writeFile(resolve(out, "review", file), gif);
            record.gifs.push({
              file: `review/${file}`,
              sha256: sha(gif),
              sourceFrames: motion.actions[action].frames,
              fps: motion.actions[action].fps,
              loop: motion.actions[action].loop,
            });
          }
        // Actual display helper both facings must preserve the same colors and exact reflection.
        const sample = renderer.renderFrame(motion.actions.run.frames[0]);
        const right = compactGifFrame(sample, "right"),
          left = compactGifFrame(sample, "left");
        for (let y = 0; y < right.height; y++)
          for (let x = 0; x < right.width; x++) {
            const a = (y * right.width + x) * 4,
              b = (y * right.width + right.width - 1 - x) * 4;
            for (let c = 0; c < 4; c++)
              assert.equal(left.pixels[a + c], right.pixels[b + c]);
          }
        record.bothFacingsExactMirrors = true;
        await json(resolve(folder, "actions.json"), motion.actions);
        await json(resolve(folder, "review.json"), record);
      }
      renderer.dispose();
      results.push(record);
      console.log(
        `${group.id}: ${mi + 1}/${mixes.length} (${hashes.length} native frames)${review ? " + review exports" : ""}`,
      );
    }
  }
  plan.summary = {
    groups: plan.groups.length,
    plannedCases: plan.groups.reduce((n, g) => n + g.cases.length, 0),
    topBottomIdPairs: plan.groups.reduce(
      (n, g) => n + g.coverage.availableTopBottomIdPairs,
      0,
    ),
    selectedTopBottomIdPairs: plan.groups.reduce(
      (n, g) => n + g.coverage.selectedTopBottomIdPairs,
      0,
    ),
    unselectedTopBottomIdPairs: plan.groups.reduce(
      (n, g) => n + g.coverage.unselectedTopBottomIdPairs.length,
      0,
    ),
    topSilhouettePairs: plan.groups.reduce(
      (n, g) => n + g.coverage.topSilhouettePairs,
      0,
    ),
    coveredTopSilhouettePairs: plan.groups.reduce(
      (n, g) => n + g.coverage.coveredTopSilhouettePairs,
      0,
    ),
  };
  assert.equal(
    plan.summary.topSilhouettePairs,
    plan.summary.coveredTopSilhouettePairs,
  );
  for (const [p, h] of Object.entries(codeSha256))
    assert.equal(
      sha(await bytes(p)),
      h,
      `${p}: renderer changed during review; rerun against stable code`,
    );
  for (const g of groups) {
    assert.equal(sha(await bytes(g.sourceUrl)), g.sourceSha256);
    assert.equal(sha(await bytes(g.registrationUrl)), g.registrationSha256);
    for (const i of g.items)
      assert.equal(
        sha(await bytes(i.url)),
        i.actualSha256,
        `${i.id}: asset changed during review`,
      );
  }
  await json(resolve(out, "plan.json"), plan);
  if (!values["plan-only"])
    await json(resolve(out, "runtime.json"), {
      format: "gathria-mixed-outfit-runtime-review",
      version: 1,
      planSha256: sha(await readFile(resolve(out, "plan.json"))),
      summary: {
        plannedCases: results.length,
        uniqueRenderedCases: seen.size,
        duplicateCasesReused: duplicates,
        nativeFrames: rendered,
        roundTripCases: results.filter((r) => r.roundTrip).length,
      },
      interpretation:
        "Full native frame rendering validates source bindings and protected pixels. It does not establish natural cloth shape or absence of visible source clothing. All plan cases are rendered; visual closeups, source-comparison GIFs, save/reopen and standalone export are representative. Facing mirrors use the production display/export helper.",
      results,
    });
  console.log(JSON.stringify(plan.summary));
} finally {
  await server.close();
}
