// Copy final browser downloads without rewriting their pixels or archive bytes.
// Presentation GIFs/PNGs are produced separately by build-matched-hair-review.
// Editable source-bearing ZIPs are recorded by digest instead of duplicated.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

let input = resolve("/tmp/kling-hair-match/exports");
let output = resolve("docs/matched-hair/review");
let verifyOnly = false;
for (let i = 2; i < process.argv.length; i++) {
  const option = process.argv[i];
  if (option === "--verify-only") verifyOnly = true;
  else if (option === "--input" && process.argv[i + 1])
    input = resolve(process.argv[++i]);
  else if (option === "--output" && process.argv[i + 1])
    output = resolve(process.argv[++i]);
  else throw Error(`Unknown or incomplete option: ${option}`);
}
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
const writeJson = async (path, data) =>
  writeFile(path, JSON.stringify(data, null, 2) + "\n");
const sourcePath = (path) => {
  const absolute = resolve(path);
  assert(
    absolute.startsWith(input + sep),
    `Evidence must come from the browser output directory: ${path}`,
  );
  return absolute;
};
const files = [];
const seen = new Set();
async function copyActual(path, folder, role) {
  const source = sourcePath(path);
  const target = resolve(output, folder, basename(source));
  assert(target.startsWith(output + sep));
  const name = relative(output, target);
  assert(!seen.has(name), `Duplicate evidence target ${name}`);
  seen.add(name);
  await mkdir(resolve(output, folder), { recursive: true });
  const before = await digest(source);
  await copyFile(source, target);
  assert.equal(await digest(target), before, `Copied bytes differ: ${name}`);
  assert.equal(await digest(source), before, `Source changed during copy: ${name}`);
  files.push({
    file: name,
    source: relative(input, source),
    role,
    bytes: (await stat(target)).size,
    sha256: before,
  });
}
async function archiveRecord(folder, name, role = "browser-download") {
  const path = sourcePath(resolve(input, folder, name));
  return {
    file: name,
    source: relative(input, path),
    role,
    bytes: (await stat(path)).size,
    sha256: await digest(path),
  };
}

if (!verifyOnly) {
  await mkdir(output, { recursive: true });
  for (const character of ["male", "female"]) {
    const rows = await json(resolve(input, character, "exports.json"));
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.view).sort(),
      ["original", "side"],
    );
    const audit = await json(
      resolve(input, character, "pixel-verification.json"),
    );
    assert.equal(audit.passed, true, "Independent pixel audit is not complete");
    const independent = await json(
      resolve(input, character, "independent.json"),
    );
    assert.equal(independent.length, 2);
    for (const record of independent) {
      assert.equal(record.editorClosed, true);
      assert.equal(record.newBrowserContext, true);
      assert.equal(record.exactReexport, true);
      assert.deepEqual(record.forbiddenRequests, []);
    }
    for (const row of rows) {
      assert.equal(row.character, character);
      assert.deepEqual(
        Object.keys(row.gifs).sort(),
        (row.view === "original"
          ? ["idle", "walk", "run", "jump", "celebrate"]
          : ["idle", "walk", "run", "jump"]
        ).sort(),
      );
      await copyActual(row.pack, character, "native-characterpack");
      for (const path of [row.png.right, row.png.left])
        await copyActual(path, character, "native-transparent-png");
      await copyActual(row.baseline.png, character, "clothing-only-control-png");
      for (const paths of Object.values(row.gifs))
        for (const facing of ["right", "left"])
          await copyActual(paths[facing], character, "native-action-gif");
      for (const state of ["workspace", "independent"])
        await copyActual(
          resolve(input, character, `${row.view}-${state}.png`),
          character,
          "browser-screenshot",
        );
    }
    for (const name of ["pixel-verification.json", "independent.json"])
      await copyActual(resolve(input, character, name), character, "audit-json");
    const archives = [];
    for (const name of [
      "original.wardrobe.zip",
      "side.wardrobe.zip",
      "both-views.zip",
      "original-clothing-only.character.zip",
      "side-clothing-only.character.zip",
      "original-reexport.zip",
      "side-reexport.zip",
    ])
      archives.push(await archiveRecord(character, name));
    await writeJson(
      resolve(output, character, "editable-archive-checksums.json"),
      {
        note: "These browser-saved editable/control/reexport ZIPs were tested without duplicating their embedded source archives in this review. Final standalone CharacterPacks are included separately.",
        archives,
      },
    );

    const roundtripFolder = `${character}-roundtrip`;
    const roundtrip = await json(
      resolve(input, roundtripFolder, "roundtrip.json"),
    );
    for (const key of [
      "failedSideAppearancePreservesBoth",
      "corruptProjectPreservesAccepted",
      "mixedClothesAppearanceReopensExact",
      "reverseMixedClothesAppearanceReopensExact",
      "pairedZipByteExact",
      "legacyClothingV1ByteExact",
      "previousAppearanceV2ByteExact",
      "previousAppearancePixelsExact",
      "appearanceUpgradeRequiresExplicitChoice",
      "independentHairAndFaceReset",
    ])
      assert.equal(roundtrip[key], true, `Roundtrip incomplete: ${key}`);
    assert(roundtrip.blockedSideAppearanceRequests >= 1);
    assert.deepEqual(roundtrip.offlineAppearanceFetches, []);
    for (const view of ["original", "side"])
      for (const state of [
        "before-appearance",
        "failed-appearance",
        "mixed",
        "reopened",
        "reverse-mixed",
        "reverse-reopened",
        "legacy-reopened",
        "previous-appearance-reopened",
        "explicit-appearance-upgrade",
      ])
        await copyActual(
          resolve(input, roundtripFolder, `${view}-${state}.png`),
          roundtripFolder,
          "native-roundtrip-png",
        );
    for (const name of [
      "side-copper.png",
      "side-espresso-restored.png",
      "after-rejected-project.png",
      "mobile.png",
      "roundtrip.json",
    ])
      await copyActual(
        resolve(input, roundtripFolder, name),
        roundtripFolder,
        name.endsWith(".json") ? "audit-json" : "roundtrip-evidence",
      );
    const roundtripArchives = [];
    for (const name of [
      "legacy-clothing-only.zip",
      "after-failed-appearance.zip",
      "complete-mixed.zip",
      "complete-mixed-resaved.zip",
      "source-top-new-bottom.zip",
      "source-top-new-bottom-resaved.zip",
      "legacy-resaved.zip",
      "previous-appearance-v2.zip",
      "previous-appearance-v2-resaved.zip",
    ])
      roundtripArchives.push(
        await archiveRecord(
          roundtripFolder,
          name,
          name === "previous-appearance-v2.zip"
            ? "constructed-legacy-fixture-with-exact-previous-banks"
            : "browser-download",
        ),
      );
    await writeJson(
      resolve(output, roundtripFolder, "editable-archive-checksums.json"),
      {
        note: "Byte-exact save/reopen and fault-preservation evidence. The previous-appearance input is an explicitly identified compatibility fixture; its resaved counterpart is an actual browser download. Invalid damaged test inputs are not delivered as usable projects.",
        archives: roundtripArchives,
      },
    );
  }
  assert.equal(files.filter((f) => f.role === "native-characterpack").length, 4);
  assert.equal(files.filter((f) => f.role === "native-action-gif").length, 36);
  await writeJson(resolve(output, "actual-downloads.json"), {
    format: "gathria-matched-hair-actual-downloads",
    version: 1,
    nativeFilesCopiedByteExactly: true,
    files,
  });
}

const decode = String.raw`
import hashlib,io,json,sys,zipfile
from pathlib import Path
from PIL import Image
root=Path(sys.argv[1]);manifest=json.loads((root/'actual-downloads.json').read_text());files=[]
for entry in manifest['files']:
 p=root/entry['file'];assert p.stat().st_size==entry['bytes'];assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256'],'Changed actual download '+str(p)
for p in sorted(root.rglob('*')):
 if not p.is_file() or p.suffix.lower() not in ['.png','.gif','.zip']:continue
 raw=p.read_bytes();entry={'file':str(p.relative_to(root)),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 if p.suffix.lower()=='.zip':
  z=zipfile.ZipFile(io.BytesIO(raw));assert z.testzip() is None;entry['members']=len(z.namelist());images=0
  for name in z.namelist():
   if name.endswith('.json'):json.loads(z.read(name))
   elif name.endswith('.png'):
    im=Image.open(io.BytesIO(z.read(name)));im.load();assert im.mode=='RGBA';images+=1
  entry['decodedRgbaPngMembers']=images
 else:
  im=Image.open(io.BytesIO(raw));entry.update(width=im.width,height=im.height,frames=im.n_frames);ms=0
  for i in range(im.n_frames):im.seek(i);im.load();ms+=im.info.get('duration',0)
  if p.suffix.lower()=='.gif':entry.update(durationMs=ms,loop=im.info.get('loop'))
 files.append(entry)
(root/'checks').mkdir(exist_ok=True)
result={'format':'gathria-matched-hair-review-integrity','version':1,'passed':True,'nativeDownloadsByteExact':True,'files':files}
(root/'checks/review-integrity.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'media':len(files),'png':sum(f['file'].endswith('.png') for f in files),'gif':sum(f['file'].endswith('.gif') for f in files),'zip':sum(f['file'].endswith('.zip') for f in files),'totalMediaBytes':sum(f['bytes'] for f in files)}))
`;
execFileSync("python", ["-c", decode, output], {
  stdio: "inherit",
  timeout: 240_000,
});
