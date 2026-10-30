// Independently decode actual UI exports. No compositor/authoring code is used.
// node scripts/verify-dual-tailored-exports.mjs /tmp/.../exports.json
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";

const input = resolve(process.argv[2] ?? "");
assert(process.argv[2], "Pass the actual UI export index JSON.");
const rows = JSON.parse(await readFile(input, "utf8"));
const catalog = JSON.parse(
  await readFile("docs/dual-tailored/assets/catalog.json", "utf8"),
);
assert(Array.isArray(rows) && rows.length > 0);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));

const independent = String.raw`
import hashlib,io,json,math,sys,zipfile
import numpy as np
from PIL import Image
sha=lambda b:hashlib.sha256(b).hexdigest()
def zopen(p):
 z=zipfile.ZipFile(p);assert z.testzip() is None;return z
def pack(z):
 m=json.loads(z.read('manifest.json'));r=json.loads(z.read('character.json'));pages=[]
 for s in [m['spritesheet']]+m.get('additionalSheets',[]):
  im=Image.open(io.BytesIO(z.read(s['file'])));im.load();assert im.mode=='RGBA';pages.append(im)
 return m,r,pages
def crop(p,f):return np.array(p[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])))
def poly(points,w,h):
 out=np.zeros((h,w),bool)
 for y in range(max(0,math.ceil(min(p['y'] for p in points)-.5)),min(h-1,math.floor(max(p['y'] for p in points)-.5))+1):
  cy=y+.5;crossings=[];spans=[]
  for a,b in zip(points[-1:]+points[:-1],points):
   if (a['y']>cy)!=(b['y']>cy):crossings.append(a['x']+(cy-a['y'])*(b['x']-a['x'])/(b['y']-a['y']))
   if abs(a['y']-cy)<1e-9 and abs(b['y']-cy)<1e-9:spans.append((a['x'],b['x']))
   elif abs(a['y']-cy)<1e-9:spans.append((a['x'],a['x']))
  crossings.sort();spans+=list(zip(crossings[::2],crossings[1::2]))
  for a,b in spans:
   lo=max(0,math.ceil(min(a,b)-.5-1e-9));hi=min(w-1,math.floor(max(a,b)-.5+1e-9))
   if lo<=hi:out[y,lo:hi+1]=True
 return out
necklinebytes=open('artwork/kling-mask-workbench/female-neckline-cloth-v1.json','rb').read()
assert sha(necklinebytes)=='9a24590ab1434480c822a577379de7d92479ee1871e44e11d688ab9ef1d5185c'
neckline=json.loads(necklinebytes);necklineframes={f['frameId']:f['runs'] for f in neckline['frames']}
row=json.loads(sys.argv[1]);project=zopen(row['project']);doc=json.loads(project.read('document.json'));regbytes=project.read('registration.json');reg=json.loads(regbytes)
sourcebytes=project.read('source.character.zip');assert sha(sourcebytes)==doc['sourceSha256']==reg['sourceSha256'];assert sha(regbytes)==doc['registrationSha256']
assert not doc.get('appearance',{}).get('hairId') and not doc.get('appearance',{}).get('faceId'),'Clothing-only proof requires original hair/face'
sm,sr,sp=pack(zopen(io.BytesIO(sourcebytes)));dm,dr,dp=pack(zopen(row['pack']))
for key in ('frames','animations','anchor','facing','scale','spritesheet','additionalSheets'):assert sm.get(key)==dm.get(key),key
assert sr['derivation']['frames']==dr['derivation']['frames']
assert dr['sourceMetadata']['wardrobe']['sourcePackSha256']==doc['sourceSha256']
assert dr['sourceMetadata']['wardrobe']['registrationSha256']==doc['registrationSha256']
assert dr['sourceMetadata']['wardrobe']['selection']==doc['selection']
registered={f['frameId']:f for f in reg['frames']};assert set(registered)=={f['id'] for f in sm['frames']}
hand_review={};hand_review_sha=None
if row['character']=='female' and row['view']=='original':
 review_bytes=open('artwork/dual-tailored/female/source/hand-foreground-v1.json','rb').read()
 hand_review_sha=sha(review_bytes);review=json.loads(review_bytes)
 authoring=json.load(open('artwork/dual-tailored/female/prepared/guard-review/final-repair-audit.json'))
 assert authoring['handForegroundReviewSha256']==hand_review_sha,'Hand trace does not match accepted authoring audit'
 assert review['sourceSha256']==doc['sourceSha256'],'Hand trace source mismatch'
 for name,digest in authoring['sha256'].items():
  assert sha(open('docs/dual-tailored/assets/female/'+name,'rb').read())==digest,'Hand audit seed/registration binding mismatch'
 hand_review={int(fid):points for fid,points in review['foregroundHand'].items()}
 assert set(hand_review)=={37,38,41,43,44,45,46,47},'Unexpected hand repair scope'
 assert sha(regbytes)==authoring['sha256']['original-tailored-v1.registration.json']
selected={v for v in doc['selection'].values() if v};garments={}
for i,item in enumerate(doc['items']):
 b=project.read('item-'+str(i)+'.zip');assert sha(b)==item['sha256'];z=zopen(io.BytesIO(b));m=json.loads(z.read('manifest.json'))
 assert m['id']==item['id'] and m['sourceSha256']==doc['sourceSha256'] and m['registrationSha256']==doc['registrationSha256']
 if m.get('necklinePermissionProfile'):
  assert m['version']==3 and m['slot'] in ('top','fullBody')
  assert m['necklinePermissionProfile']=='female-neckline-cloth-v1'
  assert m['sourceSha256']==neckline['sourceSha256'] and m['registrationSha256']==neckline['registrationSha256']
 for review in m.get('handProtectionReviews',[]):
  assert m['version'] in (2,3) and m['slot'] in ('top','fullBody')
  assert review['label'] in ('nearHand','farHand') and review['frameId'] in registered
  canonical=next(r for r in registered[review['frameId']]['protected'] if r['label']==review['label'])
  originalmask=poly(canonical['polygon'],reg['frameWidth'],reg['frameHeight'])
  reviewedmask=poly(review['polygon'],reg['frameWidth'],reg['frameHeight'])
  assert reviewedmask.any() and not np.any(reviewedmask&~originalmask),'Review escapes canonical protection'
 assert len(m['frames'])==len(sm['frames']) and {f['frameId'] for f in m['frames']}==set(registered)
 if m['id'] in selected:
  pages=[(Image.open(io.BytesIO(z.read(p['file']))).convert('RGBA'),Image.open(io.BytesIO(z.read(p['maskFile']))).convert('RGBA')) for p in m['pages']]
  garments[m['slot']]=(m,{f['frameId']:f for f in m['frames']},pages)
assert {m[0]['id'] for m in garments.values()}==selected
assert set(garments)=={'top','bottom'}
results=[];changed_total=0;alpha_total=0;reviewed_hands=[]
for f in sm['frames']:
 fid=f['id'];before=crop(sp,f);after=crop(dp,f);h,w=before.shape[:2]
 changed=np.any(before!=after,axis=2);owned=np.zeros((h,w),bool);expected=before.copy();coverage={};protected={}
 for slot in ['shoes','bottom','top','fullBody']:
  if slot not in garments:continue
  m,frames,pages=garments[slot];g=frames[fid];r,o=g['rect'],g['offset'];box=(r['x'],r['y'],r['x']+r['width'],r['y']+r['height'])
  patch=np.array(pages[g['page']][0].crop(box));mask=np.array(pages[g['page']][1].crop(box))[:,:,3]
  assert np.isin(mask,[0,255]).all();assert 0<=o['x']<=w-r['width'] and 0<=o['y']<=h-r['height']
  area=np.s_[o['y']:o['y']+r['height'],o['x']:o['x']+r['width']];own=mask==255
  ownmask=np.zeros((h,w),bool);ownmask[area]=own
  ownchange=np.zeros((h,w),bool);ownchange[area]=own&np.any(before[area]!=patch,axis=2)
  for region in registered[fid]['protected']:
   review=next((r for r in m.get('handProtectionReviews',[]) if r['frameId']==fid and r['label']==region['label']),None)
   regionmask=poly((review or region)['polygon'],w,h)&(before[:,:,3]>0)
   permitted=0
   if region['label']=='head' and m.get('necklinePermissionProfile'):
    for run in necklineframes.get(fid,[]):
     permitted+=int(regionmask[run['y'],run['x0']:run['x1']+1].sum())
     regionmask[run['y'],run['x0']:run['x1']+1]=False
   assert not np.any(ownmask&regionmask),f"Ownership overlaps protected {slot}/{region['label']} at {fid}"
   assert not np.any(ownchange&regionmask),f"Protected {slot}/{region['label']} changed {fid}"
   protected[slot+':'+region['label']]={'pixels':int(regionmask.sum()),'reviewedHand':review is not None,'approvedNecklineClothPixels':permitted}
  expected[area][own]=patch[own];owned[area]|=own;coverage[slot]=int(own.sum())
 assert np.array_equal(after,expected),f'Authored garment RGBA differs {fid}'
 assert not np.any(changed&~owned),f'Outside ownership changed {fid}'
 alpha_changed=after[:,:,3]!=before[:,:,3]
 assert not np.any(alpha_changed&~owned),f'New silhouette extends beyond declared ownership {fid}'
 assert protected.get('top:head',{}).get('pixels',0)>0
 if fid in hand_review:
  hand=poly([{'x':x,'y':y} for x,y in hand_review[fid]],w,h)&(before[:,:,3]>0)
  assert hand.any(),f'Empty reviewed hand region {fid}'
  assert not np.any(owned&hand),f'Garment still owns reviewed source hand pixels {fid}'
  assert np.array_equal(after[hand],before[hand]),f'Reviewed source hand RGBA changed {fid}'
  reviewed_hands.append({'frameId':fid,'reviewedSourceHandPixels':int(hand.sum()),'exactSourceRgba':True,'garmentOwnedHandPixels':0})
 alpha_total+=int(alpha_changed.sum())
 changed_total+=int(changed.sum())
 if fid==row['baseline']['frameId']:
  baseline=np.array(Image.open(row['baseline']['png']).convert('RGBA'))
  assert np.array_equal(baseline,before),'UI original baseline is not exact original source'

 if fid==row['png']['frameId']:
  right=np.array(Image.open(row['png']['right']).convert('RGBA'));left=np.array(Image.open(row['png']['left']).convert('RGBA'))
  assert np.array_equal(right,after),'Native right PNG differs from pack'
  assert np.array_equal(left,after[:,::-1]),'Native left PNG is not exact mirror'
 results.append({'frameId':fid,'changedPixels':int(changed.sum()),'ownershipPixels':coverage,'protectedSourcePixels':protected,'changedSilhouettePixels':int(alpha_changed.sum())})
assert changed_total>0
frames={f['id']:f for f in dm['frames']};gif_results=[]
for action,paths in row['gifs'].items():
 right=Image.open(paths['right']);left=Image.open(paths['left']);palette=np.array(right.getpalette(),np.int32).reshape(-1,3);clip=dm['animations'][action]
 assert right.n_frames==left.n_frames==len(clip['frames']);hashes=[]
 for position,fid in enumerate(clip['frames']):
  source=crop(dp,frames[fid]);h,w=source.shape[:2];assert w%2==h%2==0
  rgba=source.astype(np.float64);alpha=rgba[:,:,3:4]/255;matte=np.array([238,233,223]);rgb=rgba[:,:,:3]*alpha+matte*(1-alpha)
  total=rgb[0::2,0::2]+rgb[0::2,1::2];total=total+rgb[1::2,0::2];total=total+rgb[1::2,1::2];compact=np.floor(total/4+.5).astype(np.int32);flat=compact.reshape(-1,3)
  keys=((flat[:,0]<<8)&0xf800)|((flat[:,1]<<2)&0x03e0)|(flat[:,2]>>3)
  unique,first,inverse=np.unique(keys,return_index=True,return_inverse=True)
  colors=flat[first];nearest=np.empty(len(colors),np.int32)
  for start in range(0,len(colors),2048):
   delta=colors[start:start+2048,None,:]-palette[None,:,:];distance=np.sum(delta*delta,axis=2);nearest[start:start+2048]=len(palette)-1-np.argmin(distance[:,::-1],axis=1)
  expected=palette[nearest[inverse]].reshape(h//2,w//2,3).astype(np.uint8)
  right.seek(position);left.seek(position);actual=np.array(right.convert('RGB'));mirrored=np.array(left.convert('RGB'))
  assert np.array_equal(actual,expected),f'GIF pixels/frame order differ {action}/{position}/{fid}'
  assert np.array_equal(mirrored,actual[:,::-1]),f'GIF mirror differs {action}/{position}'
  hashes.append(sha(actual.tobytes()))
 gif_results.append({'action':action,'frames':len(hashes),'exactQuantizedPackPixelsAndOrder':True,'exactLeftMirror':True,'frameRgbHashes':hashes})
assert {r['frameId'] for r in reviewed_hands}==set(hand_review)
print(json.dumps({'framesChecked':len(results),'sourceSha256':doc['sourceSha256'],'registrationSha256':doc['registrationSha256'],'changedClothingPixels':changed_total,'exactOutsideOwnershipRgba':True,'exactProtectedRegionsRgba':True,'exactOutsideOwnershipAlpha':True,'changedSilhouettePixels':alpha_total,'exactAuthoredGarmentRgba':True,'exactNativePngAndMirror':True,'handForegroundReviewSha256':hand_review_sha,'reviewedSourceHands':reviewed_hands,'frames':results,'gifs':gif_results}))
`;

const report = {
  format: "gathria-dual-tailored-export-audit",
  version: 1,
  passed: false,
  results: [],
};
for (const row of rows) {
  assert(["male", "female"].includes(row.character));
  assert(["original", "side"].includes(row.view));
  const pack = await readFile(row.pack),
    project = await readFile(row.project);
  const archive = unzipSync(pack),
    manifest = parse(archive["manifest.json"]);
  const native = unzipSync(project),
    document = parse(native["document.json"]);
  const specification = catalog.representations.find(
    (candidate) =>
      candidate.character === row.character && candidate.view === row.view,
  );
  assert(specification, "Missing reviewed catalog representation");
  assert.equal(document.sourceSha256, specification.sourceSha256);
  assert.equal(document.registrationSha256, specification.registrationSha256);
  assert.deepEqual(
    [manifest.spritesheet.frameWidth, manifest.spritesheet.frameHeight],
    [specification.frameWidth, specification.frameHeight],
  );
  for (const [slot, logicalId] of [
    ["top", row.character === "male" ? "daily-shirt" : "daily-blouse"],
    ["bottom", row.character === "male" ? "daily-trousers" : "daily-skirt"],
  ]) {
    const expected = specification.items.find(
      (item) =>
        item.logicalId === logicalId &&
        item.palette === (row.character === "male" ? "sea" : "apricot"),
    );
    assert(expected, "Missing reviewed material variant");
    assert.equal(document.selection[slot], expected.id);
    const index = document.items.findIndex((item) => item.id === expected.id);
    assert(index >= 0);
    assert.equal(sha(native[`item-${index}.zip`]), expected.sha256);
  }
  const gifs = [];
  for (const [action, paths] of Object.entries(row.gifs)) {
    const clip = manifest.animations[action];
    assert(clip);
    for (const facing of ["right", "left"]) {
      const bytes = await readFile(paths[facing]);
      const parsed = parseGIF(new Uint8Array(bytes).buffer);
      const frames = decompressFrames(parsed, true);
      assert.deepEqual(
        [parsed.lsd.width, parsed.lsd.height],
        [
          manifest.spritesheet.frameWidth / 2,
          manifest.spritesheet.frameHeight / 2,
        ],
      );
      assert.equal(frames.length, clip.frames.length);
      const delays = clip.frames.map(
        (_, i) =>
          (Math.round(((i + 1) * 100) / clip.fps) -
            Math.round((i * 100) / clip.fps)) *
          10,
      );
      assert.deepEqual(
        frames.map((frame) => frame.delay),
        delays,
      );
      assert.equal(bytes.includes(Buffer.from("NETSCAPE2.0")), clip.loop);
      gifs.push({
        action,
        facing,
        frames: frames.length,
        delaysMs: delays,
        sha256: sha(bytes),
      });
    }
  }
  const pixelResult = JSON.parse(
    execFileSync("python", ["-c", independent, JSON.stringify(row)], {
      encoding: "utf8",
      timeout: 240_000,
      maxBuffer: 8 * 1024 * 1024,
    }),
  );
  report.results.push({
    character: row.character,
    view: row.view,
    projectSha256: sha(project),
    exactReviewedCatalogBinding: true,
    packSha256: sha(pack),
    ...pixelResult,
    gifFiles: gifs,
  });
}
report.passed = true;
const output = resolve(dirname(input), "pixel-verification.json");
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
process.stdout.write(
  JSON.stringify({
    passed: true,
    views: rows.length,
    frames: report.results.reduce((sum, row) => sum + row.framesChecked, 0),
    gifs: report.results.reduce((sum, row) => sum + row.gifFiles.length, 0),
    output,
  }) + "\n",
);
