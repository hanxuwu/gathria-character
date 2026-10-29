// Pair the recorded short-sleeve shirt / long-trouser paintings in each view.
// Never rescale a garment across views; retain native cut/ownership and source.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const palettes = [
  { id: "sea", name: "海盐蓝", top: [80, 139, 158], bottom: [139, 117, 88] },
  {
    id: "apricot",
    name: "暖杏色",
    top: [204, 135, 120],
    bottom: [75, 104, 128],
  },
];

export async function buildDualTailored({
  character,
  specifications,
  port = 5188,
  check = false,
  includeCotton = false,
  newDrawing = false,
  paintedCutOrigins,
}) {
  assert(
    !includeCotton,
    "Cross-registration cotton mixing is not supported; see rejected-binding audit. Keep each native registration intact.",
  );
  const output = resolve(root, `docs/dual-tailored/assets/${character}`);
  const art = resolve(root, `artwork/dual-tailored/${character}`);
  for (const directory of [
    output,
    art,
    resolve(art, "previews"),
    resolve(art, "reports"),
  ])
    await mkdir(directory, { recursive: true });
  async function save(path, bytes) {
    if (check)
      assert.deepEqual(
        new Uint8Array(await readFile(path)),
        new Uint8Array(bytes),
        `Reproduction mismatch: ${path}`,
      );
    else await writeFile(path, bytes);
  }
  for (const spec of specifications) {
    spec.character = character;
    spec.sourceSha256 = sha(
      await readFile(resolve(root, spec.sourceUrl.slice(1))),
    );
    const registration = await readFile(
      resolve(root, spec.registrationUrl.slice(1)),
    );
    spec.registrationSha256 = sha(registration);
    const parsed = JSON.parse(registration);
    spec.anchors = {
      format: "gathria-native-clothing-anchor-reference",
      version: 1,
      view: spec.view,
      sourceSha256: spec.sourceSha256,
      registrationSha256: spec.registrationSha256,
      frameWidth: parsed.frameWidth,
      frameHeight: parsed.frameHeight,
      note: "Exact existing registered estimates and confidence, not regenerated anatomy or guaranteed original skeletal joints. Cloth contact must be reviewed in each pose.",
      roles: {
        neck: "collar",
        nearShoulder: "near sleeve cap",
        farShoulder: "far sleeve cap",
        nearElbow: "near sleeve/forearm axis",
        farElbow: "far sleeve/forearm axis",
        nearWrist: "near hand contact",
        farWrist: "far hand contact",
        waistLeft: "waist seam left",
        waistRight: "waist seam right",
        nearHip: "near lower-garment root",
        farHip: "far lower-garment root",
        nearKnee: "near knee fold",
        farKnee: "far knee fold",
        nearAnkle: "near cuff/shoe contact",
        farAnkle: "far cuff/shoe contact",
      },
      frames: parsed.frames,
    };
    for (const seed of spec.seeds) {
      const bytes = await readFile(resolve(root, seed.url.slice(1)));
      const manifest = JSON.parse(
        Buffer.from(unzipSync(bytes)["manifest.json"]),
      );
      seed.id = manifest.id;
      seed.sha256 = sha(bytes);
      assert.equal(manifest.registrationSha256, spec.registrationSha256);
      assert.equal(manifest.sourceSha256, spec.sourceSha256);
    }
    spec.cotton = [];
  }

  const server = await createServer({
    root,
    server: { host: "127.0.0.1", port, strictPort: true },
    logLevel: "error",
  });
  let browser;
  const catalog = {
    format: "gathria-dual-tailored-character-assets",
    version: 1,
    character,
    collectionId: "tailored-day",
    palettes,
    representations: [],
  };
  const verification = {
    format: `gathria-dual-tailored-${character}-art-audit`,
    version: 1,
    newDrawing,
    reusedPaintedCuts: true,
    ...(paintedCutOrigins ? { paintedCutOrigins } : {}),
    algorithm: "owned-chromatic-ratio-v1",
    inputs: specifications.map(({ anchors, ...spec }) => spec),
    results: [],
  };
  try {
    await server.listen();
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    for (const spec of specifications) {
      const result = await page.evaluate(
        async ({ spec, palettes }) => {
          const {
            createWardrobeProject,
            selectWardrobeGarment,
            readWardrobeGarment,
          } = await import("/src/wardrobe/project.ts");
          const { createGarmentAuthoringSession } = await import(
            "/src/wardrobe/garment-authoring.ts"
          );
          const { createWardrobeCompositor } = await import(
            "/src/wardrobe/compositor.ts"
          );
          const { clothingPose } = await import("/src/wardrobe/recipe-kit.ts");
          const { decodeSourceRgbaPng, encodeSourceRgbaPngAsync } =
            await import("/src/core/baked-source.ts");
          const { sha256 } = await import("/src/core/sha256.ts");
          const fail = (yes, message) => {
            if (!yes) throw Error(message);
          };
          const equal = (a, b) =>
            a.length === b.length && a.every((v, i) => v === b[i]);
          const fetchBytes = async (url) => {
            const r = await fetch(url);
            fail(r.ok, url);
            return new Uint8Array(await r.arrayBuffer());
          };
          const b64 = (data) => {
            let s = "";
            for (let at = 0; at < data.length; at += 32768)
              s += String.fromCharCode(...data.subarray(at, at + 32768));
            return btoa(s);
          };
          const raw = (s) => Uint8Array.from(atob(s), (x) => x.charCodeAt(0));
          const source = await fetchBytes(spec.sourceUrl),
            registration = await fetchBytes(spec.registrationUrl);
          fail(
            (await sha256(source)) === spec.sourceSha256,
            "Source hash changed",
          );
          fail(
            (await sha256(registration)) === spec.registrationSha256,
            "Registration hash changed",
          );
          const seedBytes = await Promise.all(
            spec.seeds.map((item) => fetchBytes(item.url)),
          );
          let seedProject = await createWardrobeProject(
            source,
            registration,
            seedBytes,
          );
          for (const seed of spec.seeds)
            seedProject = selectWardrobeGarment(
              seedProject,
              seed.slot,
              seed.id,
            );
          const garments = [];
          for (const palette of palettes)
            for (const seed of spec.seeds) {
              const original = seedProject.items.find(
                (item) => item.manifest.id === seed.id,
              );
              fail(original.sha256 === seed.sha256, "Painted seed changed");
              const id = `dual-tailored-${spec.character}-${spec.view}-${palette.id}-${seed.slot}-v1`;
              const name = `${palette.name} · ${seed.label ?? (seed.slot === "top" ? "短袖休闲衬衫" : "休闲长裤")} · ${spec.view === "original" ? "原版" : "侧视"}`;
              const configuration = {
                id,
                name,
                material: {
                  sourceRgb: seed.sourceRgb,
                  targetRgb: palette[seed.slot],
                  tolerance: 0.5,
                },
              };
              const author = await createGarmentAuthoringSession(
                seedProject,
                seed.id,
              );
              let built;
              try {
                built = await author.build(configuration);
              } finally {
                author.dispose();
              }
              const item = await readWardrobeGarment(
                built.bytes,
                seedProject.registration,
                spec.registrationSha256,
              );
              fail(
                JSON.stringify(item.manifest.frames) ===
                  JSON.stringify(original.manifest.frames),
                "Native garment geometry changed",
              );
              let changedPixels = 0;
              for (let i = 0; i < item.pages.length; i++) {
                fail(
                  equal(item.pages[i].ownership, original.pages[i].ownership),
                  "Ownership bytes changed",
                );
                const a = decodeSourceRgbaPng(original.pages[i].patch),
                  b = decodeSourceRgbaPng(item.pages[i].patch),
                  own = decodeSourceRgbaPng(item.pages[i].ownership);
                fail(
                  a.width === b.width && a.height === b.height,
                  "Atlas geometry changed",
                );
                for (let at = 0; at < a.pixels.length; at += 4) {
                  fail(
                    a.pixels[at + 3] === b.pixels[at + 3],
                    "Garment alpha changed",
                  );
                  if (
                    a.pixels[at] !== b.pixels[at] ||
                    a.pixels[at + 1] !== b.pixels[at + 1] ||
                    a.pixels[at + 2] !== b.pixels[at + 2]
                  ) {
                    fail(
                      own.pixels[at + 3] === 255 && a.pixels[at + 3] > 0,
                      "Recolor escaped cloth",
                    );
                    changedPixels++;
                  }
                }
              }
              garments.push({
                id,
                name,
                slot: seed.slot,
                logicalId: seed.logicalId,
                palette: palette.id,
                bytes: b64(built.bytes),
                sha256: item.sha256,
                baseSha256: seed.sha256,
                report: {
                  configuration,
                  changedPixels,
                  nativeGeometryExact: true,
                  ownershipPngBytesExact: true,
                  garmentAlphaExact: true,
                  report: built.report,
                },
              });
            }
          const cottonBytes = await Promise.all(
            spec.cotton.map((item) => fetchBytes(item.url)),
          );
          let inventory = await createWardrobeProject(source, registration, [
            ...garments.map((item) => raw(item.bytes)),
            ...cottonBytes,
          ]);
          for (const item of spec.cotton)
            fail(
              inventory.items.find((x) => x.manifest.id === item.id)?.sha256 ===
                item.sha256,
              "Cotton changed",
            );
          const reports = [],
            previews = [];
          for (const palette of palettes)
            for (const topCut of [true, false])
              for (const bottomCut of [true, false]) {
                const selection = ["top", "bottom"].map((slot) => {
                  const cut = slot === "top" ? topCut : bottomCut;
                  const bank = cut ? garments : spec.cotton;
                  return bank.find(
                    (item) => item.slot === slot && item.palette === palette.id,
                  );
                });
                let project = inventory;
                for (const slot of ["top", "bottom"])
                  project = selectWardrobeGarment(project, slot, null);
                for (const item of selection.filter(Boolean))
                  project = selectWardrobeGarment(project, item.slot, item.id);
                const renderer = await createWardrobeCompositor(project);
                const report = {
                  view: spec.view,
                  palette: palette.id,
                  top: selection[0]?.logicalId ?? null,
                  bottom: selection[1]?.logicalId ?? null,
                  framesChecked: 0,
                  outsideOwnershipPixelsChecked: 0,
                  alphaChangedInsideGarment: 0,
                  protectedHeadHandsAcceptedByRuntime: true,
                  outsideOwnershipExact: true,
                };
                try {
                  for (const frame of project.registration.frames) {
                    const a = renderer.renderSourceFrame(frame.frameId),
                      b = renderer.renderFrame(frame.frameId);
                    fail(
                      a.width === b.width && a.height === b.height,
                      "Source canvas changed",
                    );
                    const masks = selection.filter(Boolean).map(
                      (s) =>
                        clothingPose(
                          project.items.find((i) => i.manifest.id === s.id),
                          frame.frameId,
                        ).mask.pixels,
                    );
                    for (let at = 0; at < a.pixels.length; at += 4) {
                      const own = masks.some((mask) => mask[at]);
                      if (a.pixels[at + 3] !== b.pixels[at + 3]) {
                        fail(own, "Unowned alpha changed");
                        report.alphaChangedInsideGarment++;
                      }
                      if (!own) {
                        for (let c = 0; c < 4; c++)
                          fail(
                            a.pixels[at + c] === b.pixels[at + c],
                            "Body outside cloth changed",
                          );
                        report.outsideOwnershipPixelsChecked++;
                      }
                    }
                    report.framesChecked++;
                  }
                  if (topCut && bottomCut) {
                    const ids = new Map();
                    for (const [action, clip] of Object.entries(
                      project.archive.manifest.animations,
                    )) {
                      const at =
                        action === "jump"
                          ? Math.floor(clip.frames.length / 2)
                          : action === "run"
                            ? Math.floor(clip.frames.length / 4)
                            : 0;
                      ids.set(clip.frames[at], action);
                    }
                    for (const fid of spec.view === "side"
                      ? [26, 67, 89, 91]
                      : [55, 102, 67])
                      if (
                        project.registration.frames.some(
                          (f) => f.frameId === fid,
                        )
                      )
                        ids.set(fid, "difficult");
                    for (const [fid, action] of ids) {
                      const bytes = await encodeSourceRgbaPngAsync(
                        renderer.renderFrame(fid),
                      );
                      previews.push({
                        file: `${spec.view}-${palette.id}-${action}-${fid}.png`,
                        bytes: b64(bytes),
                        sha256: await sha256(bytes),
                      });
                    }
                  }
                } finally {
                  renderer.dispose();
                }
                reports.push(report);
              }
          return {
            garments,
            reports,
            previews,
            frameWidth: inventory.registration.frameWidth,
            frameHeight: inventory.registration.frameHeight,
            frameCount: inventory.registration.frames.length,
            characterId: inventory.registration.characterId,
          };
        },
        { spec, palettes },
      );
      const representation = {
        character,
        view: spec.view,
        collectionId: "tailored-day",
        sourceUrl: spec.sourceUrl,
        registrationUrl: spec.registrationUrl,
        sourceSha256: spec.sourceSha256,
        registrationSha256: spec.registrationSha256,
        characterId: result.characterId,
        frameWidth: result.frameWidth,
        frameHeight: result.frameHeight,
        frameCount: result.frameCount,
        items: [...spec.cotton],
      };
      for (const garment of result.garments) {
        const bytes = Buffer.from(garment.bytes, "base64");
        assert.equal(sha(bytes), garment.sha256);
        const filename = `${garment.id}.garment.zip`;
        await save(resolve(output, filename), bytes);
        await save(
          resolve(art, "reports", `${garment.id}.json`),
          Buffer.from(json(garment.report)),
        );
        const { report, bytes: _, ...item } = garment;
        representation.items.push({
          ...item,
          bytes: bytes.length,
          url: `/docs/dual-tailored/assets/${character}/${filename}`,
        });
      }
      for (const preview of result.previews)
        await save(
          resolve(art, "previews", preview.file),
          Buffer.from(preview.bytes, "base64"),
        );
      await save(
        resolve(art, `${spec.view}-anchors.json`),
        Buffer.from(json(spec.anchors)),
      );
      catalog.representations.push(representation);
      verification.results.push(...result.reports);
      console.log(
        `${spec.view}: ${result.garments.length} new-cut banks, ${spec.cotton.length} compatible cotton banks, ${result.reports.reduce((n, r) => n + r.framesChecked, 0)} native mixed poses verified`,
      );
    }
    await save(resolve(output, "catalog.json"), Buffer.from(json(catalog)));
    await save(
      resolve(art, "verification.json"),
      Buffer.from(json(verification)),
    );
    console.log(
      check
        ? `Byte-exact ${character} reproduction passed.`
        : `${character} paired clothing variants ready.`,
    );
  } finally {
    await browser?.close();
    await server.close();
  }
}
