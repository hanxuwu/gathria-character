import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const original = JSON.parse(
  await readFile("docs/dual-tailored/assets/catalog.json", "utf8"),
);
const revised = JSON.parse(
  await readFile("docs/dual-looks-cloth/assets/female/catalog.json", "utf8"),
);
const oldSide = original.representations.find(
  (row) => row.character === "female" && row.view === "side",
);
const side = revised.representations.find(
  (row) => row.character === "female" && row.view === "side",
);
assert(side && oldSide && revised.representations.length === 1);
for (const key of [
  "sourceSha256",
  "registrationSha256",
  "frameWidth",
  "frameHeight",
  "frameCount",
])
  assert.equal(side[key], oldSide[key], `New cloth changed ${key}`);
assert.equal(side.items.length, 4);
for (const item of side.items) {
  const before = oldSide.items.find(
    (entry) =>
      entry.logicalId === item.logicalId &&
      entry.palette === item.palette &&
      entry.slot === item.slot,
  );
  assert(before, "New cut lost its logical palette/slot pairing");
  const bytes = await readFile(item.url.slice(1));
  assert.equal(bytes.length, item.bytes);
  assert.equal(sha(bytes), item.sha256);
  const files = unzipSync(bytes),
    manifest = JSON.parse(Buffer.from(files["manifest.json"]));
  assert.equal(manifest.id, item.id);
  assert.equal(manifest.sourceSha256, side.sourceSha256);
  assert.equal(manifest.registrationSha256, side.registrationSha256);
  assert.equal(manifest.frames.length, side.frameCount);
  if (item.slot === "top") {
    const oldFiles = unzipSync(await readFile(before.url.slice(1)));
    for (const name of Object.keys(oldFiles).filter((name) =>
      name.endsWith(".png"),
    ))
      assert.deepEqual(
        files[name],
        oldFiles[name],
        "The reviewed collection must keep blouse pixels/masks exact",
      );
  }
}
const catalog = {
  format: "gathria-dual-complete-clothing-assets",
  version: 1,
  collectionId: "complete-day",
  baselineCatalogSha256: sha(
    await readFile("docs/dual-tailored/assets/catalog.json"),
  ),
  note: "Female-only skirt ownership revision. Original-view garments reuse the exact previous URLs/hashes; the separate tailored-day collection and its saved projects remain unchanged.",
  representations: [
    {
      ...original.representations.find(
        (row) => row.character === "female" && row.view === "original",
      ),
      collectionId: "complete-day",
    },
    { ...side, collectionId: "complete-day" },
  ],
};
assert.equal(catalog.representations[0].character, "female");
const path = "docs/dual-looks-cloth/assets/catalog.json";
const content = JSON.stringify(catalog, null, 2) + "\n";
if (process.argv.includes("--check"))
  assert.equal(await readFile(path, "utf8"), content);
else {
  await mkdir("docs/dual-looks-cloth/assets", { recursive: true });
  await writeFile(path, content);
}
console.log(
  `${process.argv.includes("--check") ? "Verified" : "Assembled"} two female native views; original cloth and side blouse bytes unchanged.`,
);
