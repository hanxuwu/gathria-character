// Independent validation of the real fit-v2 UI downloads. No artwork is made here.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative, sep } from "node:path";
import { createServer } from "vite";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const directory = resolve(root, "docs/kling-wardrobe/fit-v2");
const baseline = "151b4bb34ecc9d50e473620f39e32d5c3bc0f5dc";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = async (path) => new Uint8Array(await readFile(path));
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const pathFor = (url) => {
  assert(url.startsWith("/") && !url.startsWith("//"));
  const path = resolve(root, `.${url}`);
  assert(path.startsWith(root + sep));
  return path;
};
const describe = async (path) => {
  const data = await bytes(path);
  return {
    file: relative(root, path).split(sep).join("/"),
    bytes: data.length,
    sha256: sha(data),
  };
};
const report = {
  format: "gathria-kling-wardrobe-fit-v2-export-verification",
  version: 1,
  startedAt: new Date().toISOString(),
  scope:
    "Actual UI CharacterPack/project downloads, every RGBA atlas pixel, all source poses and protected identity pixels. Passing technical checks is not visual acceptance.",
  baselineCommit: baseline,
  preservedFiles: [],
  exports: [],
};

// Keep the already-reviewed releases recoverable, including original and v1 packs.
const tracked = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", baseline],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n");
const preserved = tracked.filter(
  (path) =>
    (path.startsWith("docs/kling-wardrobe/garments/") &&
      path.endsWith(".zip")) ||
    (path.startsWith("docs/kling-wardrobe/exports/") &&
      path.endsWith(".zip")) ||
    (path.startsWith("docs/kling-motion/exports/") &&
      path.endsWith(".character.zip")) ||
    (path.startsWith("docs/kling-wardrobe/templates/") &&
      path.endsWith(".zip")) ||
    (path.startsWith("docs/kling-wardrobe/registration/") &&
      path.endsWith(".json")),
);
assert(
  preserved.length >= 26,
  "Expected all legacy garments, exports, source packs and authoring references.",
);
for (const path of preserved) {
  const old = execFileSync("git", ["show", `${baseline}:${path}`], {
    cwd: root,
    maxBuffer: 128 * 1024 * 1024,
  });
  const current = await describe(resolve(root, path));
  assert.equal(
    current.sha256,
    sha(old),
    `Previously delivered file changed: ${path}`,
  );
  report.preservedFiles.push(current);
}

const catalog = await json(resolve(root, "docs/kling-wardrobe/catalog.json"));
const entry = catalog.characters.find((value) => value.key === "female");
assert(entry);
const originalBytes = await bytes(pathFor(entry.sourceUrl));
const registrationBytes = await bytes(pathFor(entry.registrationUrl));
const vite = await createServer({ root, server: { middlewareMode: true } });
try {
  const { importWardrobeProject } = await vite.ssrLoadModule(
    "/src/wardrobe/project.ts",
  );
  const { createWardrobeCompositor, validateWardrobeAppearance } =
    await vite.ssrLoadModule("/src/wardrobe/compositor.ts");
  const { decodeSourceRgbaPng } = await vite.ssrLoadModule(
    "/src/core/baked-source.ts",
  );
  const { readPortableCharacterPackArchive } =
    await vite.ssrLoadModule("/src/core/pack.ts");
  const original = readPortableCharacterPackArchive(originalBytes);
  for (const look of ["day", "wedding"]) {
    const stem = resolve(directory, `exports/female-${look}`);
    const pack = readPortableCharacterPackArchive(
      await bytes(`${stem}.character.zip`),
    );
    const saved = await importWardrobeProject(
      await bytes(`${stem}.wardrobe.zip`),
    );
    const preset = entry.presets.find((value) => value.id === look);
    assert(preset.selection.fullBody.endsWith("-v2"));
    assert.deepEqual(saved.document.selection, preset.selection);
    assert.deepEqual(
      saved.source,
      originalBytes,
      "Saved project changed the approved source.",
    );
    assert.deepEqual(
      saved.registrationBytes,
      registrationBytes,
      "Saved project changed the registered anchors.",
    );
    for (const item of saved.items) {
      const catalogItem = entry.items.find(
        (value) => value.id === item.manifest.id,
      );
      // Reopened v1 projects can retain unselected legacy garments alongside
      // their explicitly imported v2 replacements. Check those exact archives
      // against the frozen release rather than rejecting valid saved work.
      const legacyPath = `docs/kling-wardrobe/garments/female/${item.manifest.id}.zip`;
      const legacy = report.preservedFiles.find(
        (file) => file.file === legacyPath,
      );
      assert(
        catalogItem || legacy,
        `Saved item is absent from both reviewed catalog and frozen releases: ${item.manifest.id}`,
      );
      assert.equal(
        item.sha256,
        catalogItem
          ? sha(await bytes(pathFor(catalogItem.url)))
          : legacy.sha256,
      );
    }
    for (const field of [
      "schemaVersion",
      "frames",
      "animations",
      "anchor",
      "facing",
      "scale",
      "capabilities",
    ])
      assert.deepEqual(
        pack.manifest[field],
        original.manifest[field],
        `Changed source ${field}.`,
      );
    assert.deepEqual(pack.config.source, original.config.source);
    assert.deepEqual(
      pack.config.derivation.frames,
      original.config.derivation.frames,
    );
    assert.deepEqual(
      pack.config.sourceMetadata?.motionFlow,
      original.config.sourceMetadata?.motionFlow,
    );
    assert.deepEqual(
      pack.config.sourceMetadata?.wardrobe?.selection,
      preset.selection,
    );
    assert.equal(
      pack.config.sourceMetadata?.wardrobe?.sourcePackSha256,
      sha(originalBytes),
    );
    const renderer = await createWardrobeCompositor(saved);
    const pages = [];
    try {
      await validateWardrobeAppearance(renderer);
      for (const [index, png] of [
        pack.png,
        ...(pack.additionalPngs ?? []),
      ].entries()) {
        const decoded = decodeSourceRgbaPng(png),
          expected = renderer.renderPage(index);
        assert.equal(decoded.width, expected.width);
        assert.equal(decoded.height, expected.height);
        assert.deepEqual(decoded.colorChunks, expected.colorChunks);
        assert.equal(
          sha(decoded.pixels),
          sha(expected.pixels),
          `${look} atlas ${index} differs from saved-project composition.`,
        );
        pages.push({
          page: index,
          width: decoded.width,
          height: decoded.height,
          pngSha256: sha(png),
          rgbaSha256: sha(decoded.pixels),
          fullPagePixelsExact: true,
        });
      }
    } finally {
      renderer.dispose();
    }
    report.exports.push({
      look,
      pack: await describe(`${stem}.character.zip`),
      project: await describe(`${stem}.wardrobe.zip`),
      sourceEmbeddedExact: true,
      registrationExact: true,
      sourceMetadataExact: true,
      selection: preset.selection,
      pages,
    });
    console.log(
      `female-${look}: actual exported atlas pixels exactly match saved-project composition.`,
    );
  }
} finally {
  await vite.close();
}

// Authoring masks are lossless grayscale PNGs. Pillow handles their native mode;
// it also independently decodes every exported PNG and ZIP CRC in this pass.
const maskCheck = String.raw`
from pathlib import Path
from io import BytesIO
import hashlib,json,sys,zipfile
import numpy as np
from PIL import Image
root=Path(sys.argv[1]); directory=root/'docs/kling-wardrobe/fit-v2'
def digest(data):return hashlib.sha256(data).hexdigest()
def read_pack(data):
 with zipfile.ZipFile(BytesIO(data)) as z:
  assert z.testzip() is None
  m=json.loads(z.read('manifest.json'))
  pages=[np.asarray(Image.open(BytesIO(z.read(p['file']))).convert('RGBA')) for p in [m['spritesheet'],*m.get('additionalSheets',[])]]
  frames={f['id']:pages[f.get('page',0)][f['y']:f['y']+f['height'],f['x']:f['x']+f['width']] for f in m['frames']}
 return m,frames
kit_path=root/'docs/kling-wardrobe/templates/female.wardrobe-template.zip'
with zipfile.ZipFile(kit_path) as kit:
 assert kit.testzip() is None
 inventory=json.loads(kit.read('inventory.json'))
 for item in inventory['files']:
  data=kit.read(item['file']);assert len(data)==item['bytes'] and digest(data)==item['sha256']
 source_data=(root/'docs/kling-motion/exports/female.character.zip').read_bytes()
 assert kit.read('source.character.zip')==source_data
 assert kit.read('registration.json')==(root/'docs/kling-wardrobe/registration/female.json').read_bytes()
 manifest,source=read_pack(source_data)
 masks={}
 for fid in source:
  regions={name:np.asarray(Image.open(BytesIO(kit.read(f'masks/{fid:03d}/{name}.png'))))>0 for name in ['tank','shorts','head','nearHand','farHand']}
  masks[fid]=regions
 result=[]
 for look in ['day','wedding']:
  actual_manifest,actual=read_pack((directory/f'exports/female-{look}.character.zip').read_bytes())
  assert actual_manifest['frames']==manifest['frames'] and actual.keys()==source.keys()
  frames=[]; seam_probes=[]
  for fid,base in source.items():
   out=actual[fid];regions=masks[fid]
   protected=(regions['head']|regions['nearHand']|regions['farHand'])&(base[:,:,3]>0)
   changed=np.any(base!=out,axis=2)
   count=int((changed&protected).sum())
   assert count==0,(look,fid,'head/hand source pixels changed',count)
   coverage=(regions['tank']|regions['shorts'])&(base[:,:,3]>0)
   holes=int((coverage&(out[:,:,3]==0)).sum())
   assert holes==0,(look,fid,'transparent holes replacing original clothing',holes)
   assert (out[:,:,3]==0).any(),(look,fid,'transparent background lost')
   assert not out[0,:,3].any() and not out[-1,:,3].any() and not out[:,0,3].any() and not out[:,-1,3].any(),(look,fid,'clipped frame edge')
   if look=='day' and fid==89:
    # Confirm the actual exported repair at two observed dark-ink speckles.
    # Opaque source ink previously survived where bilinear alpha became254.
    for x,y in [(291,742),(335,754)]:
     pixel=out[y,x];luma=float(np.dot(pixel[:3],[.2126,.7152,.0722]))
     assert pixel[3]==255 and luma>110,(look,fid,x,y,'old tank ink survived the cloth seam',pixel.tolist())
     seam_probes.append({'frameId':fid,'x':x,'y':y,'rgba':pixel.tolist(),'luminance':round(luma,3),'minimumLuminance':110})
   frames.append({'frameId':fid,'protectedOpaquePixels':int(protected.sum()),'changedProtectedPixels':count,'originalClothingPixels':int(coverage.sum()),'transparentCoverageHoles':holes,'rgbaSha256':digest(out.tobytes())})
  result.append({'look':look,'frames':frames,'seamRegressionProbes':seam_probes,'allMasksDecoded':True,'protectedHeadHandsExact':True,'noOldClothingCoverageHoles':True,'transparentFrameMargins':True})
 print(json.dumps({'templateSha256':digest(kit_path.read_bytes()),'inventoryFilesVerified':len(inventory['files']),'sourceAndRegistrationEmbeddedExact':True,'outfits':result}))
`;
report.sourcePixelChecks = JSON.parse(
  execFileSync("python3", ["-c", maskCheck, root], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }),
);
report.completedAt = new Date().toISOString();
report.passed = true;
await writeFile(
  resolve(directory, "verification-exports.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    passed: true,
    outfits: report.exports.length,
    sourcePoses: report.sourcePixelChecks.outfits.map(
      (look) => look.frames.length,
    ),
    legacyFilesPreserved: report.preservedFiles.length,
  }),
);
