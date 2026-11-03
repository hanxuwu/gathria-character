// Publish a separate reviewed look. Old catalogs and saved archives are inputs,
// never migration targets. Rebinding below is offline and preserves every PNG.
// node scripts/assemble-paired-polish-catalog.mjs [--check]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, unzipSync, zipSync } from "fflate";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
assert(process.argv.slice(2).every((arg) => arg === "--check"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const encoded = (value) => JSON.stringify(value, null, 2) + "\n";
const local = (path) => resolve(root, path.replace(/^\//, ""));
const read = (path) => readFile(local(path));
async function save(path, bytes) {
  if (check) assert.deepEqual(await read(path), Buffer.from(bytes), path);
  else {
    await mkdir(dirname(local(path)), { recursive: true });
    await writeFile(local(path), bytes);
  }
}
const omit = (value, keys) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
const manifest = (bytes) => parse(unzipSync(bytes)["manifest.json"]);
// Independent crop audit. Atlas placement/compression may change; source-native
// pixels may change only in the released frame-95 near-hand mask area.
const auditHair = String.raw`
import io,json,sys,zipfile
import numpy as np
from PIL import Image
def opened(path):
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  m=json.loads(z.read('manifest.json'))
  p=[(np.array(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA')),np.array(Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA'))) for p in m['pages']]
 return m,p
def polygon(points,w,h):
 yy,xx=np.indices((h,w),dtype=float);xx+=.5;yy+=.5
 inside=np.zeros((h,w),bool);boundary=inside.copy()
 for i,b in enumerate(points):
  a=points[i-1]
  cross=(xx-a['x'])*(b['y']-a['y'])-(yy-a['y'])*(b['x']-a['x'])
  boundary|=(abs(cross)<1e-9)&(xx>=min(a['x'],b['x']))&(xx<=max(a['x'],b['x']))&(yy>=min(a['y'],b['y']))&(yy<=max(a['y'],b['y']))
  if b['y']!=a['y']:inside^=((a['y']>yy)!=(b['y']>yy))&(xx<(b['x']-a['x'])*(yy-a['y'])/(b['y']-a['y'])+a['x'])
 return inside|boundary
def skip(obj,keys):return {k:v for k,v in obj.items() if k not in keys}
def crop(p,f,kind):
 r=f['rect'];return p[f['page']][kind][r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
a,ap=opened(sys.argv[1]);b,bp=opened(sys.argv[2])
old=json.load(open(sys.argv[3]));new=json.load(open(sys.argv[4]))
def hand(reg):return next(p['polygon'] for f in reg['frames'] if f['frameId']==95 for p in f['protected'] if p['label']=='nearHand')
allowed=polygon(hand(old),old['frameWidth'],old['frameHeight'])&~polygon(hand(new),new['frameWidth'],new['frameHeight'])
assert a['poses']==b['poses'] and a['padding']==b['padding']
assert len(a['styles'])==len(b['styles'])
exact=0;changed=[]
for style,ns in zip(a['styles'],b['styles']):
 assert skip(style,['layers'])==skip(ns,['layers'])
 assert len(style['layers'])==len(ns['layers'])
 for layer,nl in zip(style['layers'],ns['layers']):
  assert skip(layer,['frames'])==skip(nl,['frames'])
  assert len(layer['frames'])==len(nl['frames'])
  for f,nf in zip(layer['frames'],nl['frames']):
   assert skip(f,['page','rect'])==skip(nf,['page','rect'])
   if f['mode']!='paint':continue
   for kind in [0,1]:
    p=crop(ap,f,kind);q=crop(bp,nf,kind);assert p.shape==q.shape
    diff=np.any(p!=q,axis=2)
    if not diff.any():exact+=1;continue
    assert style['slot']=='hair' and f['frameId']==95
    ys,xs=np.where(diff);xs+=f['offset']['x'];ys+=f['offset']['y']
    assert np.all((xs>=0)&(xs<allowed.shape[1])&(ys>=0)&(ys<allowed.shape[0]))
    assert allowed[ys,xs].all(),'Changed hair pixels outside reviewed released hand-mask area'
    changed.append({'frameId':95,'role':layer['role'],'kind':'rgba' if kind==0 else 'ownership','changedPixels':int(diff.sum())})
assert len(changed)==4 and {r['role'] for r in changed}=={'hair-front','hair-back'}
print(json.dumps({'exactDecodedCrops':exact,'releasedMaskPixels':int(allowed.sum()),'changes':changed,'allFaceEntriesExact':True,'allOtherHairFramesExact':True,'appearancePosesExact':True}))
`;
const tailored = parse(await read("docs/dual-tailored/assets/catalog.json"));
const complete = parse(await read("docs/dual-looks-cloth/assets/catalog.json"));
const headBaseline = parse(await read("docs/matched-hair/assets/catalog.json"));
const corrected = parse(
  await read("artwork/paired-polish/clothing/audit.json"),
);
assert.equal(
  corrected.items.length,
  4,
  "Need both reviewed tops in both palettes",
);

const registrationUrl = "/artwork/paired-polish/female-side.registration.json";
const registrationBytes = await read(registrationUrl);
assert(
  registrationBytes.length <= 1024 * 1024,
  "Reviewed registration exceeds the runtime delivery limit (1 MiB). Use compact JSON; do not raise the loader limit.",
);
const registrationSha256 = sha(registrationBytes);
const registration = parse(registrationBytes);
const oldRegistration = parse(
  await read("artwork/kling-side-expansion/templates/female.registration.json"),
);
assert.deepEqual(
  omit(registration, ["frames"]),
  omit(oldRegistration, ["frames"]),
);
assert.equal(registration.frames.length, oldRegistration.frames.length);
for (const [i, frame] of registration.frames.entries()) {
  const old = oldRegistration.frames[i];
  if (frame.frameId !== 95) assert.deepEqual(frame, old);
  else {
    assert.deepEqual(omit(frame, ["protected"]), omit(old, ["protected"]));
    assert.equal(frame.protected.length, old.protected.length);
    let changed = 0;
    for (const [j, region] of frame.protected.entries()) {
      if (JSON.stringify(region) === JSON.stringify(old.protected[j])) continue;
      assert.equal(region.label, "nearHand");
      assert.deepEqual(
        omit(region, ["polygon"]),
        omit(old.protected[j], ["polygon"]),
      );
      changed++;
    }
    assert.equal(changed, 1, "Only frame 95 near-hand attribution may change");
  }
}

const bindings = [];
async function verifiedItem(item) {
  const bytes = await read(item.url);
  assert.equal(sha(bytes), item.sha256, item.url);
  assert.equal(bytes.length, item.bytes, item.url);
  assert.equal(manifest(bytes).id, item.id, item.url);
  return bytes;
}
async function rebound(item, row) {
  const input = await verifiedItem(item);
  const files = unzipSync(input);
  const before = parse(files["manifest.json"]);
  assert.equal(before.registrationSha256, row.registrationSha256);
  assert.equal(before.sourceSha256, row.sourceSha256);
  const id = `polished-female-side-${item.palette}-${item.slot}-bound-v1`;
  const after = {
    ...before,
    id,
    registrationSha256,
    provenance: `${before.provenance}\nReviewed frame 95 hand-attribution registration. Garment patches, ownership, offsets and frame coverage are unchanged by this offline binding.`,
  };
  files["manifest.json"] = strToU8(encoded(after));
  const bytes = zipSync(files, {
    level: 9,
    mtime: new Date("2024-01-01T00:00:00Z"),
  });
  const result = unzipSync(bytes);
  for (const [name, png] of Object.entries(unzipSync(input)))
    if (name !== "manifest.json") assert.deepEqual(result[name], png, name);
  assert.deepEqual(
    omit(after, ["id", "registrationSha256", "provenance"]),
    omit(before, ["id", "registrationSha256", "provenance"]),
  );
  const url = `/docs/paired-polish/assets/female/${id}.garment.zip`;
  await save(url, bytes);
  bindings.push({
    from: item.url,
    fromSha256: item.sha256,
    to: url,
    toSha256: sha(bytes),
    registrationSha256,
    unchangedFiles: Object.entries(result)
      .filter(([name]) => name !== "manifest.json")
      .map(([name, data]) => ({ name, sha256: sha(data), bytes: data.length })),
    exactFrameMetadata: true,
  });
  return { ...item, id, url, sha256: sha(bytes), bytes: bytes.length };
}

const representations = [];
for (const character of ["male", "female"]) {
  const baseline = character === "male" ? tailored : complete;
  for (const view of ["original", "side"]) {
    const row = baseline.representations.find(
      (r) => r.character === character && r.view === view,
    );
    assert(row, `${character}/${view}`);
    if (view === "original") {
      // Reuse exact URLs and bank hashes: never repackage unchanged original art.
      representations.push({ ...row, collectionId: "polished-day" });
      continue;
    }
    const items = [];
    for (const old of row.items) {
      let item = old;
      if (old.slot === "top") {
        const matches = corrected.items.filter(
          (i) =>
            i.character === character &&
            i.palette === old.palette &&
            i.slot === old.slot,
        );
        assert.equal(matches.length, 1);
        const correctedItem = matches[0];
        assert.equal(correctedItem.baselineUrl, old.url);
        assert.equal(correctedItem.baselineSha256, old.sha256);
        const {
          character: _character,
          baselineUrl: _url,
          baselineSha256: _sha,
          ...metadata
        } = correctedItem;
        item = { ...old, ...metadata };
        await verifiedItem(item);
      }
      items.push(character === "female" ? await rebound(item, row) : item);
    }
    representations.push({
      ...row,
      collectionId: "polished-day",
      ...(character === "female"
        ? { registrationUrl, registrationSha256 }
        : {}),
      items,
    });
  }
}
for (const row of representations) {
  const nativeRegistration = await read(row.registrationUrl);
  assert(nativeRegistration.length <= 1024 * 1024, row.registrationUrl);
  assert.equal(sha(nativeRegistration), row.registrationSha256);
  assert.equal(sha(await read(row.sourceUrl)), row.sourceSha256);
  for (const item of row.items) {
    const bank = manifest(await verifiedItem(item));
    assert.equal(bank.sourceSha256, row.sourceSha256);
    assert.equal(bank.registrationSha256, row.registrationSha256);
    assert.equal(bank.characterId, row.characterId);
    assert.equal(bank.frameWidth, row.frameWidth);
    assert.equal(bank.frameHeight, row.frameHeight);
    assert.equal(bank.frames.length, row.frameCount);
    assert.equal(bank.slot, item.slot);
  }
}
await save(
  "docs/paired-polish/assets/catalog.json",
  encoded({
    format: "gathria-paired-polish-clothing-assets",
    version: 1,
    collectionId: "polished-day",
    note: "Separate seam and hand-attribution review. Original-view assets and earlier collections remain byte-exact. Female side banks use an explicitly reviewed registration; no runtime rebinding.",
    representations,
  }),
);

const headRepresentations = [];
let headPixelProof;
for (const row of headBaseline.representations) {
  if (row.character !== "female" || row.view !== "side") {
    headRepresentations.push(row);
    continue;
  }
  const url = "/docs/paired-polish/assets/female/side.appearance.zip";
  const bytes = await read(url);
  const beforeFiles = unzipSync(await read(row.url));
  const files = unzipSync(bytes);
  const before = parse(beforeFiles["manifest.json"]);
  const after = parse(files["manifest.json"]);
  assert.equal(after.sourceSha256, row.sourceSha256);
  assert.equal(after.registrationSha256, registrationSha256);
  assert.deepEqual(
    omit(after, [
      "id",
      "name",
      "registrationSha256",
      "provenance",
      "pages",
      "styles",
    ]),
    omit(before, [
      "id",
      "name",
      "registrationSha256",
      "provenance",
      "pages",
      "styles",
    ]),
  );
  assert.deepEqual(after.padding, before.padding);
  assert.deepEqual(after.poses, before.poses);
  headPixelProof = JSON.parse(
    execFileSync(
      "python",
      [
        "-c",
        auditHair,
        local(row.url),
        local(url),
        local(
          "artwork/kling-side-expansion/templates/female.registration.json",
        ),
        local(registrationUrl),
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    ),
  );
  headRepresentations.push({
    ...row,
    url,
    registrationUrl,
    registrationSha256,
    bankId: after.id,
    bankSha256: sha(bytes),
    bytes: bytes.length,
  });
}
await save(
  "docs/paired-polish/assets/appearance-catalog.json",
  encoded({
    format: headBaseline.format,
    version: headBaseline.version,
    representations: headRepresentations,
  }),
);
await save(
  "artwork/paired-polish/catalog-binding-proof.json",
  encoded({
    format: "gathria-paired-polish-offline-binding-proof",
    version: 1,
    registrationSha256,
    registrationChanges: [{ frameId: 95, label: "nearHand", field: "polygon" }],
    appearanceChanges: [
      {
        character: "female",
        frameId: 95,
        field: "hair-front/back within released nearHand mask",
      },
    ],
    headPixelProof,
    bindings,
  }),
);
console.log(
  `${check ? "Verified" : "Assembled"} polished-day: four native views; ${bindings.length} exact-image offline bindings.`,
);
