// Publish the reviewed side hairstyles while retaining original-view assets.
// Usage: node scripts/assemble-matched-hair-catalog.mjs [--check]
// Requires Python 3 + Pillow for an independent lossless face-patch comparison.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
assert(
  args.every((arg) => arg === "--check"),
  "Usage: node scripts/assemble-matched-hair-catalog.mjs [--check]",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const manifestOf = (bytes) =>
  json(
    unzipSync(bytes, { filter: (file) => file.name === "manifest.json" })[
      "manifest.json"
    ],
  );
const read = (path) => readFile(resolve(root, path.replace(/^\//, "")));
const without = (object, keys) =>
  Object.fromEntries(
    Object.entries(object).filter(([key]) => !keys.includes(key)),
  );
const ids = (rows, key = "frameId") => rows.map((row) => row[key]);
const expectedHair = {
  male: "side-part-matched-v1",
  female: "soft-bob-matched-v1",
};

// This compares decoded crops, not compressed PNG or atlas positions. Repacking
// is allowed; every original face pixel, ownership value and offset must survive.
const compareFaces = String.raw`
import io,json,sys,zipfile
from PIL import Image
def opened(path):
 z=zipfile.ZipFile(path); assert z.testzip() is None
 m=json.loads(z.read('manifest.json'))
 pages=[(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA'),Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA')) for p in m['pages']]
 return m,pages
a,ap=opened(sys.argv[1]);b,bp=opened(sys.argv[2])
old={s['id']:s for s in a['styles'] if s['slot']=='face'}
new={s['id']:s for s in b['styles'] if s['slot']=='face'}
assert old.keys()==new.keys()=={'gentle-side-v1'}
paint=0
for sid,style in old.items():
 ns=new[sid]
 assert {k:v for k,v in style.items() if k!='layers'}=={k:v for k,v in ns.items() if k!='layers'}
 assert len(style['layers'])==len(ns['layers'])
 for layer,nl in zip(style['layers'],ns['layers']):
  assert layer['role']==nl['role']=='face'
  assert len(layer['frames'])==len(nl['frames'])
  for f,nf in zip(layer['frames'],nl['frames']):
   assert {k:v for k,v in f.items() if k not in ['page','rect']}=={k:v for k,v in nf.items() if k not in ['page','rect']}
   if f['mode']!='paint':continue
   def crop(pages,entry,kind):
    r=entry['rect']; return pages[entry['page']][kind].crop((r['x'],r['y'],r['x']+r['width'],r['y']+r['height']))
   for kind in [0,1]:
    p=crop(ap,f,kind);q=crop(bp,nf,kind)
    assert p.size==q.size and p.tobytes()==q.tobytes(),f'Changed face patch {f["frameId"]}/{kind}'
   paint+=1
print(json.dumps({'faceFrames':len(old['gentle-side-v1']['layers'][0]['frames']),'paintFramesExact':paint}))
`;

const baseline = json(await read("docs/dual-looks/assets/catalog.json"));
assert.equal(baseline.format, "gathria-dual-looks-assets");
assert.equal(baseline.version, 1);
assert.equal(baseline.representations.length, 4);
assert.deepEqual(
  new Set(baseline.representations.map((r) => `${r.character}/${r.view}`)),
  new Set(["male/original", "male/side", "female/original", "female/side"]),
);
const representations = [];
const checks = [];
for (const entry of baseline.representations) {
  const priorBytes = await read(entry.url);
  assert.equal(
    sha(priorBytes),
    entry.bankSha256,
    `Changed prior bank: ${entry.url}`,
  );
  assert.equal(priorBytes.length, entry.bytes);
  if (entry.view === "original") {
    // Preserve the entire entry, including the existing bank URL. No duplicate
    // original bank is written, and the original selection is not migrated.
    representations.push(entry);
    continue;
  }
  const character = entry.character;
  const url = `/docs/matched-hair/assets/${character}-side.appearance.zip`;
  const bytes = await read(url);
  const manifest = manifestOf(bytes);
  const prior = manifestOf(priorBytes);
  const binding = json(
    await read(`artwork/matched-hair/${character}-binding.json`),
  );
  const registrationBytes = await read(entry.registrationUrl);
  const registration = json(registrationBytes);
  const sourceBytes = await read(entry.sourceUrl);
  const source = manifestOf(sourceBytes);
  const hairRegistration = json(
    await read(
      `artwork/kling-side-expansion/hair/${character}-head-registration.json`,
    ),
  );
  assert.equal(bytes.length, binding.bytes);
  assert(bytes.length > 0 && bytes.length <= 64 * 1024 * 1024);
  assert.equal(sha(bytes), binding.bankSha256);
  assert.equal(binding.oldBankSha256, entry.bankSha256);
  assert.notEqual(
    binding.bankSha256,
    entry.bankSha256,
    "Rejected side hair must not be republished",
  );
  assert.equal(manifest.format, "gathria-sprite-appearance-bank");
  assert.equal(manifest.version, 1);
  assert.equal(manifest.id, `matched-hair-${character}-side-v1`);
  assert.equal(manifest.id, binding.bankId);
  assert.equal(binding.character, character);
  assert.equal(binding.view, "side");
  assert.equal(binding.hairId, expectedHair[character]);
  assert.equal(binding.faceId, entry.faceId);
  for (const key of [
    "sourceSha256",
    "registrationSha256",
    "frameWidth",
    "frameHeight",
    "padding",
  ]) {
    assert.deepEqual(manifest[key], entry[key], `${character}: changed ${key}`);
  }
  assert.deepEqual(
    without(manifest, ["id", "name", "poses", "pages", "styles", "provenance"]),
    without(prior, ["id", "name", "poses", "pages", "styles", "provenance"]),
  );
  assert.equal(sha(sourceBytes), manifest.sourceSha256);
  assert.equal(sha(registrationBytes), manifest.registrationSha256);
  for (const audit of [binding, registration, hairRegistration])
    assert.equal(audit.sourceSha256, manifest.sourceSha256);
  for (const audit of [binding, hairRegistration])
    assert.equal(audit.registrationSha256, manifest.registrationSha256);
  assert.equal(
    sha(await read(binding.extraction.source)),
    binding.extraction.sha256,
    "Donor changed after bank preparation",
  );
  assert.equal(manifest.poses.length, entry.frameCount);
  assert.equal(binding.frameCount, entry.frameCount);
  const frameIds = ids(manifest.poses);
  assert.equal(new Set(frameIds).size, frameIds.length);
  for (const expected of [
    ids(prior.poses),
    ids(registration.frames),
    ids(source.frames, "id"),
    ids(binding.frameProof),
    ids(hairRegistration.frames),
  ])
    assert.deepEqual(frameIds, expected);
  for (let i = 0; i < manifest.poses.length; i++) {
    const pose = manifest.poses[i],
      old = prior.poses[i],
      proof = binding.frameProof[i];
    assert.deepEqual(
      without(pose, ["hairBounds", "foreground"]),
      without(old, ["hairBounds", "foreground"]),
      `Changed native head geometry ${character}/${pose.frameId}`,
    );
    assert.deepEqual(pose.foreground, [
      ...old.foreground,
      proof.neckForeground,
    ]);
    assert.deepEqual(pose.hairBounds, proof.hairBounds);
    assert.equal(pose.sourceFrame, registration.frames[i].sourceFrame);
    assert.equal(pose.sourceFrame, proof.sourceFrame);
    for (const key of ["headTransform", "featureTransform"])
      assert.deepEqual(proof[key], hairRegistration.frames[i][key]);
    for (const key of [
      "faceChangedPixels",
      "neckChangedPixels",
      "outsideHairChangedPixels",
    ])
      assert.equal(proof[key], 0);
  }
  assert.deepEqual(
    manifest.styles.map((s) => [s.id, s.slot]),
    [
      [binding.hairId, "hair"],
      [entry.faceId, "face"],
    ],
  );
  assert.deepEqual(
    manifest.styles[0].layers.map((l) => l.role),
    ["hair-back", "hair-front"],
  );
  for (const style of manifest.styles)
    for (const layer of style.layers)
      assert.deepEqual(ids(layer.frames), frameIds);
  const faceCheck = json(
    execFileSync(
      "python3",
      [
        "-c",
        compareFaces,
        resolve(root, entry.url.slice(1)),
        resolve(root, url.slice(1)),
      ],
      { maxBuffer: 1024 * 1024 },
    ),
  );
  representations.push({
    ...entry,
    url,
    bankId: manifest.id,
    bankSha256: sha(bytes),
    bytes: bytes.length,
    hairId: binding.hairId,
  });
  checks.push({ character, frameCount: frameIds.length, ...faceCheck });
}
const output = resolve(root, "docs/matched-hair/assets/catalog.json");
const serialized = Buffer.from(
  `${JSON.stringify({ ...baseline, representations })}\n`,
);
if (args.includes("--check")) {
  assert(
    serialized.equals(await readFile(output)),
    "Matched hairstyle catalog is stale; rerun without --check.",
  );
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, serialized);
}
console.log(
  JSON.stringify({
    catalog: "docs/matched-hair/assets/catalog.json",
    mode: args.includes("--check") ? "check" : "write",
    originalEntriesExact: true,
    checks,
  }),
);
