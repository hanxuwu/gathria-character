// Build corresponding material variants from each view's own immutable clothes.
// Uses the existing browser authoring/compositor APIs; never fits source pixels
// or moves geometry across views. No runtime AI or new anatomy is introduced.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { unzipSync } from "fflate";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const output = resolve(root, "docs/dual-view-wardrobe/assets");
const provenance = resolve(root, "artwork/dual-view-wardrobe");
const checkOnly = process.argv.includes("--check");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const palettes = [
  { id: "sea", name: "海盐日常", top: [80, 139, 158], bottom: [139, 117, 88] },
  {
    id: "apricot",
    name: "杏桃日常",
    top: [204, 135, 120],
    bottom: [75, 104, 128],
  },
];
const wardrobe = JSON.parse(
  await readFile(resolve(root, "docs/kling-wardrobe/catalog.json"), "utf8"),
);
const specifications = [];
for (const character of ["male", "female"]) {
  const entry = wardrobe.characters.find(
    (candidate) => candidate.key === character,
  );
  const originals = ["teal-top", "ochre-shorts"].map((id) =>
    entry.items.find((item) => item.id === id),
  );
  specifications.push({
    character,
    view: "original",
    sourceUrl: entry.sourceUrl,
    registrationUrl: entry.registrationUrl,
    seeds: originals.map((item, index) => ({
      id: item.id,
      slot: index === 0 ? "top" : "bottom",
      url: item.url,
      sha256: item.sha256,
      sourceRgb: index === 0 ? [84, 130, 135] : [197, 137, 61],
    })),
  });
  const sidePalette = palettes.find(
    (palette) => palette.id === (character === "male" ? "sea" : "apricot"),
  );
  specifications.push({
    character,
    view: "side",
    sourceUrl: `/docs/kling-side-workspace/assets/${character}.source.zip`,
    registrationUrl: `/docs/kling-side-workspace/assets/${character}.registration.json`,
    seeds: ["top", "bottom"].map((slot) => ({
      slot,
      url: `/docs/kling-side-workspace/assets/${character}-${slot}.garment.zip`,
      sourceRgb: sidePalette[slot],
    })),
  });
}

// Verify the bank's actual registration, not a name or gender assumption.
for (const spec of specifications) {
  const source = await readFile(resolve(root, spec.sourceUrl.slice(1)));
  const registration = await readFile(
    resolve(root, spec.registrationUrl.slice(1)),
  );
  spec.sourceSha256 = hash(source);
  spec.registrationSha256 = hash(registration);
  for (const seed of spec.seeds) {
    const bytes = await readFile(resolve(root, seed.url.slice(1)));
    if (seed.sha256) assert.equal(hash(bytes), seed.sha256);
    seed.sha256 = hash(bytes);
    const manifest = JSON.parse(
      Buffer.from(unzipSync(bytes)["manifest.json"]).toString(),
    );
    seed.id = manifest.id;
    assert.equal(manifest.sourceSha256, spec.sourceSha256);
    assert.equal(manifest.registrationSha256, spec.registrationSha256);
    assert.equal(manifest.slot, seed.slot);
  }
}
await mkdir(output, { recursive: true });
await mkdir(resolve(provenance, "native-previews"), { recursive: true });
await mkdir(resolve(provenance, "reports"), { recursive: true });

const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 5186, strictPort: true },
  logLevel: "error",
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5186/");
  const catalog = {
    format: "gathria-dual-view-clothing-catalog",
    version: 1,
    palettes,
    defaults: { male: "sea", female: "apricot" },
    representations: [],
  };
  const audit = {
    format: "gathria-dual-view-material-audit",
    version: 1,
    algorithm: "owned-chromatic-ratio-v1",
    sourceInputs: specifications,
    garments: [],
    looks: [],
    generatedArtwork: false,
  };
  async function save(path, bytes) {
    if (checkOnly)
      assert.deepEqual(
        new Uint8Array(await readFile(path)),
        new Uint8Array(bytes),
        `Reproduction mismatch: ${path}`,
      );
    else await writeFile(path, bytes);
  }
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
        const { decodeSourceRgbaPng, encodeSourceRgbaPngAsync } = await import(
          "/src/core/baked-source.ts"
        );
        const { sha256 } = await import("/src/core/sha256.ts");
        const { zipSync, unzipSync, strToU8 } = await import(
          "/node_modules/.vite/deps/fflate.js"
        );
        const fail = (condition, message) => {
          if (!condition) throw new Error(message);
        };
        const sameBytes = (left, right) =>
          left.length === right.length &&
          left.every((value, index) => value === right[index]);
        const bytes = async (url) => {
          const response = await fetch(url);
          fail(response.ok, `Cannot load ${url}`);
          return new Uint8Array(await response.arrayBuffer());
        };
        const base64 = (data) => {
          let value = "";
          for (let at = 0; at < data.length; at += 32768)
            value += String.fromCharCode(...data.subarray(at, at + 32768));
          return btoa(value);
        };
        const source = await bytes(spec.sourceUrl);
        const registration = await bytes(spec.registrationUrl);
        const seeds = await Promise.all(
          spec.seeds.map((seed) => bytes(seed.url)),
        );
        fail(
          (await sha256(source)) === spec.sourceSha256,
          "Source changed during build",
        );
        fail(
          (await sha256(registration)) === spec.registrationSha256,
          "Registration changed during build",
        );
        let baseProject = await createWardrobeProject(
          source,
          registration,
          seeds,
        );
        for (const seed of spec.seeds)
          baseProject = selectWardrobeGarment(baseProject, seed.slot, seed.id);
        const garments = [];
        for (const palette of palettes) {
          for (const seed of spec.seeds) {
            const base = baseProject.items.find(
              (item) => item.manifest.id === seed.id,
            );
            fail(
              base && base.sha256 === seed.sha256,
              "Seed changed during build",
            );
            const id = `dual-${spec.character}-${spec.view}-${palette.id}-${seed.slot}-v1`;
            const name = `${palette.name} · ${seed.slot === "top" ? "棉背心" : "棉短裤"} · ${spec.view === "original" ? "原版" : "侧视"}`;
            const configuration = {
              id,
              name,
              material: {
                sourceRgb: seed.sourceRgb,
                targetRgb: palette[seed.slot],
                tolerance: 0.5,
              },
            };
            const identity = sameBytes(seed.sourceRgb, palette[seed.slot]);
            let output,
              authoringReport = null;
            if (identity) {
              const entries = unzipSync(base.bytes);
              const manifest = structuredClone(base.manifest);
              manifest.id = id;
              manifest.name = name;
              manifest.provenance += ` Dual-view identity material alias; base SHA256 ${base.sha256}. This exact palette already exists in this view. Atlas pixels, ownership, alpha, registration, source and timing are unchanged; only asset identity/name/provenance are new.`;
              entries["manifest.json"] = strToU8(
                JSON.stringify(manifest, null, 2) + "\n",
              );
              output = zipSync(entries, {
                level: 6,
                mtime: new Date("2020-01-01T00:00:00Z"),
              });
            } else {
              const author = await createGarmentAuthoringSession(
                baseProject,
                seed.id,
              );
              try {
                const built = await author.build(configuration);
                output = built.bytes;
                authoringReport = built.report;
              } finally {
                author.dispose();
              }
            }
            const item = await readWardrobeGarment(
              output,
              baseProject.registration,
              baseProject.document.registrationSha256,
            );
            fail(
              item.manifest.sourceSha256 === spec.sourceSha256,
              "Output source mismatch",
            );
            fail(
              item.manifest.registrationSha256 === spec.registrationSha256,
              "Output registration mismatch",
            );
            fail(
              JSON.stringify(item.manifest.frames) ===
                JSON.stringify(base.manifest.frames),
              "Output changed geometry",
            );
            const pages = [];
            let changedPixels = 0;
            for (let index = 0; index < item.pages.length; index++) {
              fail(
                sameBytes(
                  item.pages[index].ownership,
                  base.pages[index].ownership,
                ),
                "Ownership bytes changed",
              );
              const before = decodeSourceRgbaPng(base.pages[index].patch);
              const after = decodeSourceRgbaPng(item.pages[index].patch);
              const ownership = decodeSourceRgbaPng(
                base.pages[index].ownership,
              );
              fail(
                before.width === after.width && before.height === after.height,
                "Atlas size changed",
              );
              let changed = 0;
              for (let at = 0; at < before.pixels.length; at += 4) {
                fail(
                  before.pixels[at + 3] === after.pixels[at + 3],
                  "Alpha changed",
                );
                const rgbChanged =
                  before.pixels[at] !== after.pixels[at] ||
                  before.pixels[at + 1] !== after.pixels[at + 1] ||
                  before.pixels[at + 2] !== after.pixels[at + 2];
                if (rgbChanged) {
                  fail(
                    ownership.pixels[at + 3] === 255 &&
                      before.pixels[at + 3] > 0,
                    "Unowned/transparent pixel changed",
                  );
                  changed++;
                }
              }
              if (identity)
                fail(changed === 0, "Identity alias changed artwork");
              changedPixels += changed;
              pages.push({
                index,
                changedPixels: changed,
                alphaExact: true,
                ownershipBytesExact: true,
                outsideOwnershipExact: true,
              });
            }
            garments.push({
              id,
              name,
              slot: seed.slot,
              palette: palette.id,
              bytes: base64(output),
              sha256: item.sha256,
              baseSha256: base.sha256,
              report: {
                id,
                identityAlias: identity,
                configuration,
                changedPixels,
                pages,
                frameGeometryExact: true,
                authoringReport,
              },
            });
          }
        }
        const looks = [],
          previews = [];
        for (const palette of palettes) {
          const chosen = garments.filter(
            (garment) => garment.palette === palette.id,
          );
          const data = chosen.map((garment) =>
            Uint8Array.from(atob(garment.bytes), (character) =>
              character.charCodeAt(0),
            ),
          );
          let project = await createWardrobeProject(source, registration, data);
          for (const garment of chosen)
            project = selectWardrobeGarment(project, garment.slot, garment.id);
          const renderer = await createWardrobeCompositor(project);
          try {
            let outsideProtectedPixelChecks = 0;
            for (const frame of project.registration.frames) {
              const original = renderer.renderSourceFrame(frame.frameId);
              const dressed = renderer.renderFrame(frame.frameId); // also enforces every protected head/hand region
              const masks = project.items.map(
                (item) => clothingPose(item, frame.frameId).mask.pixels,
              );
              fail(
                original.width === dressed.width &&
                  original.height === dressed.height,
                "Canvas resized",
              );
              for (let at = 0; at < original.pixels.length; at += 4) {
                fail(
                  original.pixels[at + 3] === dressed.pixels[at + 3],
                  "Composed alpha changed",
                );
                if (masks.some((mask) => mask[at])) continue;
                for (let channel = 0; channel < 4; channel++)
                  fail(
                    original.pixels[at + channel] ===
                      dressed.pixels[at + channel],
                    "Unowned body pixel changed",
                  );
                outsideProtectedPixelChecks++;
              }
            }
            const shots = [];
            for (const [action, clip] of Object.entries(
              project.archive.manifest.animations,
            )) {
              const index =
                action === "jump"
                  ? Math.floor(clip.frames.length / 2)
                  : action === "run"
                    ? Math.floor(clip.frames.length / 4)
                    : 0;
              const frameId = clip.frames[index];
              const image = renderer.renderFrame(frameId);
              const png = await encodeSourceRgbaPngAsync(image);
              const file = `${spec.character}-${spec.view}-${palette.id}-${action}-${frameId}.png`;
              previews.push({ file, bytes: base64(png) });
              shots.push({ action, frameId, file, sha256: await sha256(png) });
            }
            looks.push({
              character: spec.character,
              view: spec.view,
              palette: palette.id,
              framesChecked: project.registration.frames.length,
              outsideProtectedPixelChecks,
              sourceBodyOutsideOwnershipExact: true,
              alphaExact: true,
              protectedRegionsAcceptedByRuntime: true,
              shots,
            });
          } finally {
            renderer.dispose();
          }
        }
        return {
          garments,
          looks,
          previews,
          frameWidth: baseProject.registration.frameWidth,
          frameHeight: baseProject.registration.frameHeight,
          frameCount: baseProject.registration.frames.length,
          characterId: baseProject.registration.characterId,
        };
      },
      { spec, palettes },
    );
    const representation = {
      character: spec.character,
      view: spec.view,
      sourceUrl: spec.sourceUrl,
      registrationUrl: spec.registrationUrl,
      sourceSha256: spec.sourceSha256,
      registrationSha256: spec.registrationSha256,
      characterId: result.characterId,
      frameWidth: result.frameWidth,
      frameHeight: result.frameHeight,
      frameCount: result.frameCount,
      items: [],
    };
    for (const garment of result.garments) {
      const bytes = Buffer.from(garment.bytes, "base64");
      assert.equal(hash(bytes), garment.sha256);
      const filename = `${garment.id}.garment.zip`;
      await save(resolve(output, filename), bytes);
      await save(
        resolve(provenance, "reports", `${garment.id}.json`),
        Buffer.from(json(garment.report)),
      );
      representation.items.push({
        id: garment.id,
        slot: garment.slot,
        palette: garment.palette,
        name: garment.name,
        url: `/docs/dual-view-wardrobe/assets/${filename}`,
        sha256: garment.sha256,
        bytes: bytes.length,
        baseSha256: garment.baseSha256,
      });
      audit.garments.push({
        id: garment.id,
        sha256: garment.sha256,
        bytes: bytes.length,
        identityAlias: garment.report.identityAlias,
        changedPixels: garment.report.changedPixels,
        frameGeometryExact: true,
        alphaExact: true,
        ownershipBytesExact: true,
        outsideOwnershipExact: true,
      });
    }
    for (const preview of result.previews)
      await save(
        resolve(provenance, "native-previews", preview.file),
        Buffer.from(preview.bytes, "base64"),
      );
    catalog.representations.push(representation);
    audit.looks.push(...result.looks);
    process.stdout.write(
      `${checkOnly ? "Verified" : "Built"} ${spec.character}/${spec.view}: ${result.garments.length} banks, ${result.frameCount} poses × 2 palettes\n`,
    );
  }
  await save(resolve(output, "catalog.json"), Buffer.from(json(catalog)));
  await save(
    resolve(provenance, "verification.json"),
    Buffer.from(json(audit)),
  );
  process.stdout.write(
    `${checkOnly ? "Deterministic reproduction passed" : "Generation complete"}: 16 banks, 8 native looks; shoes/body remain original.\n`,
  );
} finally {
  await browser?.close();
  await server.close();
}
