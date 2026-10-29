// Assemble only complete, source-bound collections. Artwork generation and
// all-pose native protection checks are performed by each character builder.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const partial = process.argv
  .find((arg) => arg.startsWith("--character="))
  ?.split("=")[1];
assert(
  !partial || ["male", "female"].includes(partial),
  "Unknown partial character",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (path) => readFile(resolve(root, path.replace(/^\//, "")));
const json = async (path) => JSON.parse(await read(path));
const cotton = await json("docs/dual-view-wardrobe/assets/catalog.json");
const representations = [];
for (const character of partial ? [partial] : ["male", "female"]) {
  const catalog = await json(
    `docs/dual-tailored/assets/${character}/catalog.json`,
  );
  assert.equal(catalog.representations.length, 2, "Both views are required");
  for (const view of ["original", "side"]) {
    const spec = catalog.representations.find((r) => r.view === view);
    assert(spec && spec.character === character, "Native identity mismatch");
    const legacy = cotton.representations.find(
      (r) => r.character === character && r.view === view,
    );
    assert.equal(spec.sourceSha256, legacy.sourceSha256, "Source art changed");
    assert.equal(sha(await read(spec.sourceUrl)), spec.sourceSha256);
    const registration = await read(spec.registrationUrl);
    assert.equal(sha(registration), spec.registrationSha256);
    const reg = JSON.parse(registration);
    assert.equal(reg.sourceSha256, spec.sourceSha256);
    assert.equal(reg.frameWidth, spec.frameWidth);
    assert.equal(reg.frameHeight, spec.frameHeight);
    assert.equal(reg.frames.length, spec.frameCount);
    const logical = {
      top: [character === "male" ? "daily-shirt" : "daily-blouse"],
      bottom: [character === "male" ? "daily-trousers" : "daily-skirt"],
    };
    assert.equal(
      spec.items.length,
      4,
      "Two complete palettes required; stock source pieces remain selectable without a garment",
    );
    assert.equal(new Set(spec.items.map((i) => i.id)).size, 4);
    for (const [slot, choices] of Object.entries(logical)) {
      for (const logicalId of choices) {
        for (const palette of ["sea", "apricot"]) {
          const matches = spec.items.filter(
            (i) =>
              i.slot === slot &&
              i.logicalId === logicalId &&
              i.palette === palette,
          );
          assert.equal(
            matches.length,
            1,
            `Missing or ambiguous ${character}/${view}/${logicalId}/${palette}`,
          );
          const item = matches[0];
          const bytes = await read(item.url);
          assert.equal(bytes.length, item.bytes);
          assert.equal(sha(bytes), item.sha256);
          const manifest = JSON.parse(
            Buffer.from(unzipSync(bytes)["manifest.json"]),
          );
          assert.equal(manifest.id, item.id);
          assert.equal(manifest.slot, slot);
          assert.equal(manifest.sourceSha256, spec.sourceSha256);
          assert.equal(manifest.registrationSha256, spec.registrationSha256);
          assert.equal(manifest.frameWidth, spec.frameWidth);
          assert.equal(manifest.frameHeight, spec.frameHeight);
          assert.deepEqual(
            manifest.frames.map((f) => f.frameId).sort((a, b) => a - b),
            reg.frames.map((f) => f.frameId).sort((a, b) => a - b),
          );
        }
      }
    }
    representations.push(spec);
  }
}
const catalog = {
  format: "gathria-dual-view-clothing-catalog",
  version: 1,
  collection: "tailored-day",
  representations,
};
const file = resolve(root, "docs/dual-tailored/assets/catalog.json");
const bytes = Buffer.from(JSON.stringify(catalog, null, 2) + "\n");
if (check)
  assert.deepEqual(await readFile(file), bytes, "Aggregate catalog differs");
else await writeFile(file, bytes);
console.log(
  `${check ? "Verified" : "Assembled"} ${representations.length} native representations / ${representations.reduce((n, r) => n + r.items.length, 0)} material entries${partial ? " (partial development collection)" : ""}.`,
);
