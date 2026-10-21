// Audit actual fit-polish UI downloads; never generate replacement artwork.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, relative, sep } from "node:path";
import { createServer } from "vite";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const option = process.argv.find((arg) => arg.startsWith("--run="));
const run = option?.slice(6) ?? process.env.WARDROBE_FIT_RUN ?? "";
assert(/^[a-z0-9-]*$/.test(run), "Use a simple capture run identifier.");
const directory = resolve(root, "docs/kling-wardrobe/fit-polish");
const exportsDirectory = resolve(directory, "exports", run);
const outputDirectory = resolve(directory, "verification", run);
const evidenceConfig = JSON.parse(
  await readFile(
    resolve(root, "scripts/kling-fit-polish-evidence-config.json"),
    "utf8",
  ),
);
const baseline = evidenceConfig.baselineCommit;
assert(
  !existsSync(resolve(outputDirectory, "exports.json")),
  "Choose a new WARDROBE_FIT_RUN; preserve the previous export audit.",
);
const sha = (data) => createHash("sha256").update(data).digest("hex");
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
  assert(data.length > 0, `Empty delivery file: ${path}`);
  return {
    file: relative(root, path).split(sep).join("/"),
    bytes: data.length,
    sha256: sha(data),
  };
};
const report = {
  format: "gathria-kling-fit-polish-export-verification",
  version: 1,
  startedAt: new Date().toISOString(),
  captureRun: run,
  baselineCommit: baseline,
  scope:
    "Four actual UI CharacterPack/project downloads, every decoded RGBA atlas pixel, current source-bound protection, native PNG and mixed-outfit exports. Technical verification is separate from visual acceptance.",
  preservedFiles: [],
  exports: [],
  nativePngs: [],
  mixedPngs: [],
  legacyPngs: [],
};

async function main() {
  const browser = await json(
    resolve(directory, "browser", run, "evidence-index.json"),
  );
  assert.equal(
    browser.passed,
    true,
    "The actual browser capture must finish successfully first.",
  );
  report.browserEvidence = await describe(
    resolve(directory, "browser", run, "evidence-index.json"),
  );
  assert.equal(
    browser.production,
    true,
    "Final review requires the production build.",
  );
  assert.equal(browser.format, "gathria-wardrobe-fit-polish-browser-evidence");
  assert.equal(
    browser.rawStrictPassed,
    undefined,
    "A fit-polish capture must pass strictly; no prior exception review substitutes for it.",
  );
  assert.deepEqual(browser.faviconHarness, {
    urlPath: "/favicon.ico",
    status: 204,
    reason:
      "Only the optional browser icon request is fulfilled by this harness; no application request or error is suppressed.",
  });
  for (const key of [
    "errors",
    "consoleErrors",
    "failedResponses",
    "externalRequests",
    "forbiddenIndependentRequests",
  ])
    assert.deepEqual(browser[key], []);
  const expectedPoses =
    2 *
    Object.values(evidenceConfig.reviewedFrames).reduce(
      (n, ids) => n + ids.length,
      0,
    );
  for (const [key, count] of Object.entries({
    playback: 40,
    transitions: 16,
    projects: 4,
    legacy: 4,
    recordings: 4,
    mixed: 2,
    downloads: expectedPoses + 18,
    poses: expectedPoses + 6,
    screenshots: 8,
  }))
    assert.equal(browser[key].length, count, `Browser matrix ${key}`);
  const uniquePlayback = new Set(
    browser.playback.map(
      (p) => `${p.character}/${p.look}/${p.action}/${p.facing}`,
    ),
  );
  assert.equal(uniquePlayback.size, 40);
  for (const [path, digest] of Object.entries(browser.inputHashes))
    assert.equal(
      sha(await bytes(resolve(root, path))),
      digest,
      `Capture input changed: ${path}`,
    );
  for (const group of ["downloads", "screenshots", "recordings"])
    for (const item of browser[group])
      assert.equal(
        sha(await bytes(resolve(root, item.file))),
        item.sha256,
        `Capture artifact changed: ${item.file}`,
      );
  assert(
    browser.assetResponses.every(
      (r) => r.status >= 200 && r.status < 400 && !r.url.startsWith("/docs/"),
    ),
  );
  const before = await json(resolve(directory, "baseline.json"));
  assert.equal(before.baselineCommit, baseline);
  for (const file of before.files) {
    const current = await describe(resolve(root, file.file));
    assert.equal(current.bytes, file.bytes);
    assert.equal(
      current.sha256,
      file.sha256,
      `Before image changed: ${file.file}`,
    );
  }
  report.historicalBaseline = await describe(
    resolve(directory, "baseline.json"),
  );
  if (browser.resumedIndependent) {
    const resume = browser.resumedIndependent;
    const failedBytes = await bytes(
      resolve(root, resume.preservedFailureReport),
    );
    assert.equal(sha(failedBytes), resume.preservedFailureSha256);
    const failed = JSON.parse(Buffer.from(failedBytes));
    assert.equal(failed.passed, false);
    assert(
      failed.failure.startsWith(
        "browserContext.newPage: Executable doesn't exist at ",
      ) && failed.failure.includes("ffmpeg-1013/ffmpeg-linux"),
    );
    assert.equal(failed.playback.length, 0);
    assert.equal(failed.recordings.length, 0);
    assert.equal(failed.transitions.length, 8);
    assert.equal(failed.screenshots.length, 4);
    assert.equal(failed.downloads.length, 38);
    for (const key of ["downloads", "poses", "projects", "legacy", "mixed"])
      assert.deepEqual(
        browser[key],
        failed[key],
        `Completed authoring evidence changed on resume: ${key}`,
      );
    assert.deepEqual(browser.transitions.slice(0, 8), failed.transitions);
    assert.deepEqual(browser.screenshots.slice(0, 4), failed.screenshots);
    assert.equal(browser.startedAt, failed.startedAt);
    assert.equal(browser.workbenchClosedAt, failed.workbenchClosedAt);
    assert.equal(browser.commitAtCapture, failed.commitAtCapture);
    assert(
      new Date(browser.independentStartedAt) >= new Date(resume.startedAt),
    );
    for (const key of [
      "errors",
      "consoleErrors",
      "failedResponses",
      "externalRequests",
      "forbiddenIndependentRequests",
    ])
      assert.deepEqual(failed[key], []);
    assert.equal(
      sha(await bytes(resolve(root, resume.preservedOriginalScript))),
      resume.preservedOriginalScriptSha256,
    );
    assert.equal(
      resume.preservedOriginalScriptSha256,
      failed.inputHashes[resume.resumedScript],
    );
    assert.equal(
      sha(await bytes(resolve(root, resume.resumedScript))),
      resume.resumedScriptSha256,
    );
    assert.equal(
      resume.resumedScriptSha256,
      browser.inputHashes[resume.resumedScript],
    );
    for (const [path, digest] of Object.entries(failed.inputHashes))
      if (path !== resume.resumedScript)
        assert.equal(
          browser.inputHashes[path],
          digest,
          `Frozen authoring input changed on continuation: ${path}`,
        );
    report.browserEvidence.resumedIndependent = {
      ...resume,
      preservedFailureVerified: true,
      completedAuthoringFieldsUnchanged: true,
      independentPlaybackCapturedInFreshBrowser: true,
    };
  }
  // New profiles live at new paths. No historical registration, template,
  // garment, source pack or already delivered project may be rewritten.
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
      (path.startsWith("docs/kling-wardrobe/fit-v2/exports/") &&
        path.endsWith(".zip")) ||
      /^docs\/kling-wardrobe\/full-outfits\/exports\/[^/]+\.zip$/.test(path) ||
      (path.startsWith("docs/kling-motion/exports/") &&
        path.endsWith(".character.zip")) ||
      (path.startsWith("docs/kling-wardrobe/templates/") &&
        path.endsWith(".zip")) ||
      (path.startsWith("docs/kling-wardrobe/registration/") &&
        path.endsWith(".json")),
  );
  assert(
    preserved.length >= 30,
    "Expected preserved delivered assets and both source packs.",
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
  const vite = await createServer({ root, server: { middlewareMode: true } });
  try {
    const { importWardrobeProject, selectWardrobeGarment, addWardrobeGarment } =
      await vite.ssrLoadModule("/src/wardrobe/project.ts");
    const { createWardrobeCompositor, validateWardrobeAppearance } =
      await vite.ssrLoadModule("/src/wardrobe/compositor.ts");
    const { decodeSourceRgbaPng } = await vite.ssrLoadModule(
      "/src/core/baked-source.ts",
    );
    const { readPortableCharacterPackArchive } =
      await vite.ssrLoadModule("/src/core/pack.ts");
    for (const character of ["male", "female"]) {
      const entry = catalog.characters.find((value) => value.key === character);
      assert(entry);
      const originalBytes = await bytes(pathFor(entry.sourceUrl));
      const registrationBytes = await bytes(pathFor(entry.registrationUrl));
      const original = readPortableCharacterPackArchive(originalBytes);
      for (const look of ["day", "wedding"]) {
        const stem = resolve(exportsDirectory, `${character}-${look}`);
        const pack = readPortableCharacterPackArchive(
          await bytes(`${stem}.character.zip`),
        );
        const saved = await importWardrobeProject(
          await bytes(`${stem}.wardrobe.zip`),
        );
        const preset = entry.presets.find((value) => value.id === look);
        assert(preset);
        assert.deepEqual(saved.document.selection, preset.selection);
        assert.deepEqual(saved.document.preview, {
          action: "run",
          facing: "left",
        });
        assert.deepEqual(
          saved.source,
          originalBytes,
          "Saved project changed the approved source.",
        );
        assert.deepEqual(
          saved.registrationBytes,
          registrationBytes,
          "Saved project differs from the explicitly selected current registration.",
        );
        for (const item of saved.items) {
          const catalogItem = entry.items.find(
            (value) => value.id === item.manifest.id,
          );
          assert(
            catalogItem,
            `Saved current item absent from catalog: ${item.manifest.id}`,
          );
          assert.equal(item.sha256, sha(await bytes(pathFor(catalogItem.url))));
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
            `${character}/${look}: source ${field} changed.`,
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
              `${character}/${look} atlas ${index} differs from saved-project composition.`,
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
          const poses = browser.poses.filter(
            (pose) =>
              pose.character === character && pose.look === look && !pose.mixed,
          );
          assert.equal(
            poses.length,
            evidenceConfig.reviewedFrames[character].length,
          );
          for (const pose of poses) {
            const path = resolve(root, pose.file);
            const native = decodeSourceRgbaPng(await bytes(path)),
              expected = renderer.renderFrame(pose.frameId);
            assert.equal(native.width, expected.width);
            assert.equal(native.height, expected.height);
            assert.equal(
              sha(native.pixels),
              sha(expected.pixels),
              `Native UI PNG mismatch: ${pose.file}`,
            );
            report.nativePngs.push({
              ...(await describe(path)),
              character,
              look,
              frameId: pose.frameId,
              rgbaSha256: sha(native.pixels),
              exactPackAndProjectPixels: true,
            });
          }
        } finally {
          renderer.dispose();
        }
        report.exports.push({
          character,
          look,
          pack: await describe(`${stem}.character.zip`),
          project: await describe(`${stem}.wardrobe.zip`),
          sourceEmbeddedExact: true,
          currentRegistrationExact: true,
          sourceMetadataExact: true,
          sourcePoses: original.manifest.frames.length,
          selection: preset.selection,
          pages,
        });
        if (character === "male") {
          const mixing = browser.mixed.find(
            (value) => value.character === character && value.look === look,
          );
          assert(mixing);
          let mixed = saved;
          // The UI explicitly imports later catalog selections; saved projects
          // embed only items loaded before saving. Reproduce that import here
          // without changing the real exported project or its selection.
          for (const id of Object.values(mixing.selection)) {
            if (
              id === null ||
              mixed.items.some((item) => item.manifest.id === id)
            )
              continue;
            const item = entry.items.find((item) => item.id === id);
            assert(item, `Mixed garment missing from current catalog: ${id}`);
            mixed = await addWardrobeGarment(
              mixed,
              await bytes(pathFor(item.url)),
            );
          }
          for (const [slot, id] of Object.entries(mixing.selection))
            mixed = selectWardrobeGarment(mixed, slot, id);
          assert.deepEqual(mixed.document.selection, mixing.selection);
          const mixedRenderer = await createWardrobeCompositor(mixed);
          try {
            await validateWardrobeAppearance(mixedRenderer);
            const poses = browser.poses.filter(
              (pose) =>
                pose.character === character &&
                pose.look === `${look}-mixed` &&
                pose.mixed,
            );
            assert.equal(poses.length, 3);
            for (const pose of poses) {
              const path = resolve(root, pose.file),
                native = decodeSourceRgbaPng(await bytes(path)),
                expected = mixedRenderer.renderFrame(pose.frameId);
              assert.equal(native.width, expected.width);
              assert.equal(native.height, expected.height);
              assert.equal(
                sha(native.pixels),
                sha(expected.pixels),
                `Mixed native UI PNG mismatch: ${pose.file}`,
              );
              report.mixedPngs.push({
                ...(await describe(path)),
                character,
                look,
                frameId: pose.frameId,
                selection: mixing.selection,
                rgbaSha256: sha(native.pixels),
                exactProjectPixels: true,
              });
            }
          } finally {
            mixedRenderer.dispose();
          }
        }
        console.log(
          `${character}-${look}: actual exported atlas RGBA exactly matches saved-project composition.`,
        );
      }
    }
    for (const legacy of browser.legacy) {
      const output = decodeSourceRgbaPng(
        await bytes(resolve(root, legacy.file)),
      );
      const previous = decodeSourceRgbaPng(
        await bytes(resolve(root, legacy.reference)),
      );
      assert.equal(output.width, previous.width);
      assert.equal(output.height, previous.height);
      assert.equal(
        sha(output.pixels),
        sha(previous.pixels),
        `Historical saved project changed: ${legacy.file}`,
      );
      report.legacyPngs.push({
        ...(await describe(resolve(root, legacy.file))),
        character: legacy.character,
        look: legacy.look,
        reference: legacy.reference,
        rgbaSha256: sha(output.pixels),
        previousPixelsExact: true,
      });
    }
    assert.equal(report.legacyPngs.length, 4);
  } finally {
    await vite.close();
  }

  // Independent Pillow decoding uses the current source-bound authoring kit.
  // Its hand contour is versioned: old overbroad thigh protection is retained
  // only inside old projects, never silently applied to this new profile.
  const pixelCheck = String.raw`
from pathlib import Path
from io import BytesIO
import hashlib,json,sys,zipfile
import numpy as np
from PIL import Image
root=Path(sys.argv[1]);directory=Path(sys.argv[2]);sys.path.insert(0,str(root/'scripts'))
from kling_wardrobe_common import protected_mask
catalog=json.loads((root/'docs/kling-wardrobe/catalog.json').read_text())
def digest(data):return hashlib.sha256(data).hexdigest()
def read_pack(data):
 with zipfile.ZipFile(BytesIO(data)) as z:
  assert z.testzip() is None
  m=json.loads(z.read('manifest.json'))
  pages=[np.asarray(Image.open(BytesIO(z.read(p['file']))).convert('RGBA')) for p in [m['spritesheet'],*m.get('additionalSheets',[])]]
  frames={f['id']:pages[f.get('page',0)][f['y']:f['y']+f['height'],f['x']:f['x']+f['width']] for f in m['frames']}
 return m,frames
def garment_frame(path,fid):
 with zipfile.ZipFile(path) as z:
  m=json.loads(z.read('manifest.json'));f=next(f for f in m['frames'] if f['frameId']==fid);p=m['pages'][f['page']]
  patch=np.asarray(Image.open(BytesIO(z.read(p['file']))).convert('RGBA'))
  owned=np.asarray(Image.open(BytesIO(z.read(p['maskFile']))).convert('RGBA'))[:,:,3]==255
  def at(x,y):
   lx,ly=x-f['offset']['x'],y-f['offset']['y']
   if not (0<=lx<f['rect']['width'] and 0<=ly<f['rect']['height']):return False,None
   xx,yy=lx+f['rect']['x'],ly+f['rect']['y']
   return bool(owned[yy,xx]),patch[yy,xx]
  return at
def pack_frame(path,fid):
 with zipfile.ZipFile(path) as z:
  m=json.loads(z.read('manifest.json'));f=next(f for f in m['frames'] if f['id']==fid)
  p=[m['spritesheet'],*m.get('additionalSheets',[])][f.get('page',0)]
  im=Image.open(BytesIO(z.read(p['file']))).convert('RGBA')
  return np.asarray(im.crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])))
result=[]
for character in ['male','female']:
 entry=next(e for e in catalog['characters'] if e['key']==character)
 kit_path=root/entry['templateUrl'].lstrip('/')
 source_data=(root/entry['sourceUrl'].lstrip('/')).read_bytes()
 with zipfile.ZipFile(kit_path) as kit:
  assert kit.testzip() is None
  inventory=json.loads(kit.read('inventory.json'))
  for item in inventory['files']:
   data=kit.read(item['file']);assert len(data)==item['bytes'] and digest(data)==item['sha256']
  assert kit.read('source.character.zip')==source_data
  assert kit.read('registration.json')==(root/entry['registrationUrl'].lstrip('/')).read_bytes()
  manifest,source=read_pack(source_data)
  for look in ['day','wedding']:
   stem=directory/f'{character}-{look}'
   with zipfile.ZipFile(str(stem)+'.wardrobe.zip') as project:
    assert project.testzip() is None
    for name in project.namelist():
     if name.endswith('.zip'):
      with zipfile.ZipFile(BytesIO(project.read(name))) as nested:
       assert nested.testzip() is None
       for file in nested.namelist():
        if file.endswith('.png'):
         im=Image.open(BytesIO(nested.read(file)));im.load();assert im.width>0 and im.height>0
   actual_manifest,actual=read_pack(Path(str(stem)+'.character.zip').read_bytes())
   assert actual_manifest['frames']==manifest['frames'] and actual.keys()==source.keys()
   frames=[];probes=[];semantic_corrections=[]
   for fid,base in source.items():
    out=actual[fid]
    regions={name:np.asarray(Image.open(BytesIO(kit.read(f'masks/{fid:03d}/{name}.png'))))>0 for name in ['tank','shorts','head','nearHand','farHand','shoes']}
    protected=(regions['head']|regions['nearHand']|regions['farHand'])&(base[:,:,3]>0)
    changed=np.any(base!=out,axis=2)
    if character=='male' and look=='wedding' and fid==54:
     # Four reviewed shoe pixels were also tagged nearHand in the old semantic
     # kit. Keep the assets unchanged; bind this audit-only ownership correction
     # to exact coordinates/source values and independently verified old shoes.
     known=[(202,780,[255,0,255,9]),(206,800,[206,153,148,255]),(207,800,[202,149,144,255]),(206,801,[206,153,148,255])]
     reg=json.loads(kit.read('registration.json'));guide=next(g for g in reg['frames'] if g['frameId']==fid);registered=protected_mask(guide)
     old_shoes=garment_frame(root/'docs/kling-wardrobe/garments/male/brown-shoes.zip',fid)
     old_pack=pack_frame(root/'docs/kling-wardrobe/full-outfits/exports/male-wedding.character.zip',fid)
     selected=next(p for p in entry['presets'] if p['id']=='wedding')['selection']
     top_bottom=[garment_frame(root/item['url'].lstrip('/'),fid) for item in entry['items'] if item['id'] in [selected['top'],selected['bottom']]]
     assert len(top_bottom)==2
     for x,y,rgba in known:
      assert base[y,x].tolist()==rgba,(fid,x,y,'reviewed source pixel changed')
      assert regions['nearHand'][y,x] and regions['shoes'][y,x] and not regions['head'][y,x] and not regions['farHand'][y,x]
      assert not registered[y,x],(fid,x,y,'actual registered protection cannot be excluded')
      assert all(not garment(x,y)[0] for garment in top_bottom),(fid,x,y,'new top/bottom cannot own reviewed shoe pixel')
      owns,shoe_rgba=old_shoes(x,y);assert owns
      assert np.array_equal(out[y,x],shoe_rgba) and np.array_equal(out[y,x],old_pack[y,x]),(fid,x,y,'not exact standalone old shoe and old pack result')
      protected[y,x]=False
      semantic_corrections.append({'frameId':fid,'x':x,'y':y,'source':rgba,'actual':out[y,x].tolist(),'reason':'Reviewed rear shoe/edge pixel, duplicated in nearHand and shoes semantic masks; not inside registered protection.','oldShoeAndOldPackExact':True,'newTopBottomOwns':False})
    count=int((changed&protected).sum())
    assert count==0,(character,look,fid,'protected head/hand pixels changed',count)
    # Antialiased fringe may be cleaned by a new cloth outline, but opaque
    # original clothing cannot leave an empty interior hole.
    coverage=(regions['tank']|regions['shorts'])&(base[:,:,3]>=128)
    holes=int((coverage&(out[:,:,3]==0)).sum())
    assert holes==0,(character,look,fid,'transparent opaque-clothing holes',holes)
    assert (out[:,:,3]==0).any() and (out[:,:,3]>0).any()
    assert not out[0,:,3].any() and not out[-1,:,3].any() and not out[:,0,3].any() and not out[:,-1,3].any(),(character,look,fid,'clipped frame margin')
    if character=='female' and look=='day' and fid==89:
     for x,y in [(291,742),(335,754)]:
      pixel=out[y,x];luma=float(np.dot(pixel[:3],[.2126,.7152,.0722]))
      assert pixel[3]==255 and luma>110,(look,fid,x,y,'old tank ink at cloth seam',pixel.tolist())
      probes.append({'frameId':fid,'x':x,'y':y,'rgba':pixel.tolist(),'luminance':round(luma,3),'minimumLuminance':110})
    frames.append({'frameId':fid,'protectedOpaquePixels':int(protected.sum()),'changedProtectedPixels':count,'originalOpaqueClothingPixels':int(coverage.sum()),'transparentCoverageHoles':holes,'rgbaSha256':digest(out.tobytes())})
   result.append({'character':character,'look':look,'templateSha256':digest(kit_path.read_bytes()),'inventoryFilesVerified':len(inventory['files']),'sourceAndRegistrationEmbeddedExact':True,'frames':frames,'seamRegressionProbes':probes,'reviewedSemanticOwnershipCorrections':semantic_corrections,'allPngsDecoded':True,'allZipCrcsValid':True,'protectedHeadHandsExact':True,'noOpaqueClothingCoverageHoles':True,'transparentFrameMargins':True})
print(json.dumps({'outfits':result}))
`;
  report.sourcePixelChecks = JSON.parse(
    execFileSync("python3", ["-c", pixelCheck, root, exportsDirectory], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  report.completedAt = new Date().toISOString();
  report.passed = true;
}
await mkdir(outputDirectory, { recursive: true });
try {
  await main();
} catch (error) {
  report.passed = false;
  report.failure = error.stack ?? String(error);
  report.completedAt = new Date().toISOString();
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(outputDirectory, "exports.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (!report.passed) console.error(report.failure);
else
  console.log(
    JSON.stringify({
      passed: true,
      outfits: report.exports.length,
      sourcePoses: report.exports.map((outfit) => outfit.sourcePoses),
      nativePngs: report.nativePngs.length,
      mixedPngs: report.mixedPngs.length,
      legacyFilesPreserved: report.preservedFiles.length,
    }),
  );
