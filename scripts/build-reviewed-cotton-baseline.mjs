// Rebuild the original real UI cotton download, retaining its published SHA.
// Current UI structure is only a recipe: every embedded source/registration and
// garment is read from the immutable pre-coverage main commit, then the complete
// archive must match the historical receipt before it may be used by a test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { readCoverageBaseline } from "./coverage-review-baseline.mjs";
const [character, input, output] = process.argv.slice(2);
assert(["male", "female"].includes(character) && input && output);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const parse = (b) => JSON.parse(Buffer.from(b).toString("utf8"));
const historical = (path) => readCoverageBaseline(path, process.cwd());
const catalog = parse(
  historical("docs/dual-view-wardrobe/assets/catalog.json"),
);
const envelope = unzipSync(await readFile(input));
const manifest = parse(envelope["manifest.json"]);
assert.equal(manifest.character, character);
assert.equal(manifest.version, 1);
assert.equal(manifest.selection.outfitId, "cotton-day");
const options = { level: 6, mtime: new Date(2020, 0, 1, 0, 0, 0) };
const files = {};
for (const view of ["original", "side"]) {
  const spec = catalog.representations.find(
    (r) => r.character === character && r.view === view,
  );
  const native = unzipSync(envelope[view + ".wardrobe.zip"]);
  const doc = parse(native["document.json"]);
  const source = historical(spec.sourceUrl.replace(/^\//, ""));
  const registration = historical(spec.registrationUrl.replace(/^\//, ""));
  assert.equal(sha(source), spec.sourceSha256);
  assert.equal(sha(registration), spec.registrationSha256);
  assert.equal(doc.sourceSha256, spec.sourceSha256);
  assert.equal(doc.registrationSha256, spec.registrationSha256);
  const items = doc.items.map((item) => {
    const ref = spec.items.find((i) => i.id === item.id);
    assert(ref);
    const bytes = historical(ref.url.replace(/^\//, ""));
    assert.equal(sha(bytes), ref.sha256);
    return { id: item.id, sha256: sha(bytes), bytes };
  });
  doc.items = items.map(({ id, sha256 }) => ({ id, sha256 }));
  const inner = {
    "document.json": strToU8(JSON.stringify(doc, null, 2)),
    "source.character.zip": [source, { level: 0 }],
    "registration.json": registration,
  };
  items.forEach(
    (item, i) => (inner[`item-${i}.zip`] = [item.bytes, { level: 0 }]),
  );
  const bytes = zipSync(inner, options);
  manifest.views[view].sha256 = sha(bytes);
  files[view + ".wardrobe.zip"] = [bytes, { level: 0 }];
}
files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
const bytes = zipSync(files, options);
const receipts = parse(
  historical(
    `docs/dual-view-wardrobe/review/${character}/editable-archive-checksums.json`,
  ),
);
const expected = receipts.archives.find((r) => r.file === "both-views.zip");
assert.equal(
  sha(bytes),
  expected.sha256,
  "Historical cotton archive must retain its original published hash",
);
assert.equal(bytes.length, expected.bytes);
await writeFile(output, bytes);
console.log(
  JSON.stringify({
    character,
    sha256: sha(bytes),
    bytes: bytes.length,
    output,
  }),
);
