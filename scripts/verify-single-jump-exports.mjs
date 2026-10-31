// Independently validate actual browser downloads. This verifier deliberately
// imports neither the gameplay controller nor wardrobe/image implementation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import { parseGIF, decompressFrames } from "gifuct-js";

assert(process.argv[2], "Pass exports.json from the actual UI download test.");
const input = resolve(process.argv[2]);
const rows = JSON.parse(await readFile(input, "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const sources = {
  male: {
    original:
      "ae589b93e234d17427b6680290a9b46df7d5fcd58f97446ed9fe314296d612d1",
    side: "7322f38e39f321fb2eb54afe33bdad456bff1bd2d9739358c278971a51bc5d42",
  },
  female: {
    original:
      "90a7d2a227910a399dabab805ac1a335240684c06d8d8eb57e88f236a5cbad23",
    side: "ee6d20ac1b6c973043a28bc7b0508cf4f3b1ea4f373424b0de75d88d724f955d",
  },
};

// Independently reconstruct the documented review sequence from declarations:
// full run cycle, next reviewed takeoff boundary, reviewed jump prefix, one
// full run cycle at the landing exit. V1 retains its complete jump; V2 resumes
// running after contact/rebound, before the standing recovery. Side V3 adds a
// second reviewed takeoff boundary. Side V4 adds phase-matched source lead-ins
// at three evenly spaced boundaries. Side V5 adds two source recovery poses
// before its running entry. Every revision keeps native 24 FPS.
function assertKnownRoutes(profile) {
  const prefix = `kling-${profile.characterId}-${profile.view}-single-jump-`;
  const original = profile.view === "original";
  const revision = Number(profile.id.slice(prefix.length).replace(/^v/, ""));
  assert(
    profile.id === `${prefix}v${revision}` &&
      (original ? [1, 2] : [1, 2, 3, 4, 5]).includes(revision),
    `Unknown reviewed motion profile: ${profile.id}`,
  );
  const male = profile.characterId === "male";
  const takeoffs = original
    ? [5, 13]
    : revision >= 4
      ? male
        ? [4, 10, 16]
        : [1, 7, 13]
      : revision === 3
        ? male
          ? [9, 16]
          : [6, 13]
        : [male ? 16 : 13];
  const complete = {
    from: "jump",
    to: "run",
    exit: original ? 39 : 28,
    entry: original ? 4 : male ? 11 : 8,
  };
  const early = {
    from: "jump",
    to: "run",
    exit: original ? 30 : revision === 5 ? 23 : 27,
    entry: original ? 4 : revision === 5 ? (male ? 14 : 11) : male ? 16 : 13,
    ...(revision === 5 ? { leadIn: male ? [63, 62] : [58, 57] } : {}),
  };
  const routes = (from, to) =>
    profile.routes
      .filter((route) => route.from === from && route.to === to)
      .sort((a, b) => a.exit - b.exit);
  assert.deepEqual(
    routes("run", "jump"),
    takeoffs.map((exit, index) => ({
      from: "run",
      to: "jump",
      exit,
      entry: 0,
      ...(revision >= 4
        ? {
            leadIn: (male
              ? [[60, 61, 62], [59, 60, 61, 62], [62]]
              : [[55, 56, 57], [54, 55, 56, 57], [57]])[index],
          }
        : {}),
    })),
    "Run takeoff routes differ from the reviewed native frames",
  );
  assert.deepEqual(
    routes("jump", "run"),
    revision >= 2 ? [early, complete] : [complete],
    "Landing routes differ from the reviewed revision boundaries",
  );
  return revision;
}

function expectedFlow(profile) {
  assertKnownRoutes(profile);
  const run = profile.actions.run,
    jump = profile.actions.jump;
  assert.equal(run.fps, jump.fps);
  const exits = profile.routes.filter(
    (r) => r.from === "run" && r.to === "jump",
  );
  assert(exits.length);
  const takeoff = exits.reduce((a, b) => (a.exit < b.exit ? a : b));
  const landing = profile.routes.filter(
    (r) => r.from === "jump" && r.to === "run",
  );
  const firstLanding = landing.reduce((a, b) => (a.exit < b.exit ? a : b));
  assert.equal(takeoff.entry, 0);
  assert(takeoff.exit >= 0 && takeoff.exit <= run.frames.length);
  assert(firstLanding.exit > 0 && firstLanding.exit <= jump.frames.length);
  const recovery = Array.from(
    { length: run.frames.length },
    (_, i) => run.frames[(firstLanding.entry + i) % run.frames.length],
  );
  return {
    fps: run.fps,
    frames: [
      ...run.frames,
      ...run.frames.slice(0, takeoff.exit),
      ...(takeoff.leadIn ?? []),
      ...jump.frames.slice(0, firstLanding.exit),
      ...(firstLanding.leadIn ?? []),
      ...recovery,
    ],
    phases: {
      runBefore: run.frames.length + takeoff.exit,
      leadIn: takeoff.leadIn?.length ?? 0,
      jump: firstLanding.exit,
      landingLeadIn: firstLanding.leadIn?.length ?? 0,
      runAfter: recovery.length,
    },
    takeoff,
    landing: firstLanding,
  };
}

const independentlyDecode = String.raw`
import hashlib,io,json,sys,zipfile
import numpy as np
from PIL import Image
row=json.loads(sys.argv[1]);z=zipfile.ZipFile(row['pack']);assert z.testzip() is None
m=json.loads(z.read('manifest.json'));frames={f['id']:f for f in m['frames']}
pages=[]
for p in [m['spritesheet']]+m.get('additionalSheets',[]):
 image=Image.open(io.BytesIO(z.read(p['file'])));image.load();assert image.mode=='RGBA';pages.append(image)
sha=lambda b:hashlib.sha256(b).hexdigest()
def native(fid):
 f=frames[fid];return np.array(pages[f.get('page',0)].crop((f['x'],f['y'],f['x']+f['width'],f['y']+f['height'])))
results=[]
for sequence in row['sequences']:
 a=Image.open(sequence['paths']['right']);b=Image.open(sequence['paths']['left']);palette=np.array(a.getpalette(),np.int32).reshape(-1,3)
 assert a.n_frames==b.n_frames==len(sequence['frames']);hashes=[]
 for position,fid in enumerate(sequence['frames']):
  source=native(fid);h,w=source.shape[:2];assert w%2==h%2==0
  rgba=source.astype(float);alpha=rgba[:,:,3:4]/255;rgb=rgba[:,:,:3]*alpha+np.array([238,233,223])*(1-alpha)
  total=rgb[0::2,0::2]+rgb[0::2,1::2];total=total+rgb[1::2,0::2];total=total+rgb[1::2,1::2]
  compact=np.floor(total/4+.5).astype(np.int32);flat=compact.reshape(-1,3)
  # gifenc's rgb565 cache uses the first RGB value in each bin. Reproduce that
  # documented palette mapping independently with NumPy, including tie order.
  keys=((flat[:,0]<<8)&0xf800)|((flat[:,1]<<2)&0x03e0)|(flat[:,2]>>3)
  _,first,inverse=np.unique(keys,return_index=True,return_inverse=True);colors=flat[first];nearest=np.empty(len(colors),np.int32)
  for start in range(0,len(colors),2048):
   delta=colors[start:start+2048,None,:]-palette[None,:,:];distance=np.sum(delta*delta,axis=2)
   nearest[start:start+2048]=len(palette)-1-np.argmin(distance[:,::-1],axis=1)
  expected=palette[nearest[inverse]].reshape(h//2,w//2,3).astype(np.uint8)
  a.seek(position);right=np.array(a.convert('RGB'));b.seek(position);left=np.array(b.convert('RGB'))
  assert np.array_equal(right,expected),f"GIF source pixels/order differ: {sequence['name']}/{position}/native{fid}"
  assert np.array_equal(left,right[:,::-1]),f"GIF left mirror differs: {sequence['name']}/{position}"
  hashes.append(sha(right.tobytes()))
 results.append({'name':sequence['name'],'framesChecked':len(hashes),'nativeFrameIds':sequence['frames'],'exactQuantizedPackPixels':True,'leftIsExactMirror':True,'rgbSha256':hashes})
print(json.dumps(results))
`;

const report = {
  format: "gathria-single-jump-export-audit",
  version: 1,
  passed: false,
  results: [],
};
for (const row of rows) {
  const actualBytes = await readFile(row.pack),
    files = unzipSync(actualBytes);
  const baselineBytes = await readFile(row.baseline),
    baseline = unzipSync(baselineBytes);
  const manifest = json(files["manifest.json"]),
    config = json(files["character.json"]);
  const oldManifest = json(baseline["manifest.json"]),
    oldConfig = json(baseline["character.json"]);
  const profile = config.sourceMetadata.gameplayMotion;
  assert.equal(profile.format, "gathria-gameplay-motion");
  assert.equal(profile.version, 1);
  assert.equal(profile.characterId, row.character);
  assert.equal(profile.view, row.view);
  assert.equal(profile.sourceSha256, sources[row.character][row.view]);
  assert.equal(profile.jumpReturn, "previous-locomotion");
  assert.deepEqual(manifest.animations, profile.actions);
  assert.deepEqual(
    manifest.frames,
    oldManifest.frames,
    "Atlas frame identities or rectangles changed",
  );
  for (const key of [
    "anchor",
    "scale",
    "facing",
    "spritesheet",
    "additionalSheets",
  ])
    assert.deepEqual(manifest[key], oldManifest[key], `${key} changed`);
  assert.deepEqual(
    config.derivation.frames,
    oldConfig.derivation.frames,
    "Source frame provenance changed",
  );
  assert.equal(
    config.sourceMetadata.wardrobe.sourcePackSha256,
    profile.sourceSha256,
  );
  const atlasFiles = Object.keys(files)
    .filter((key) => key.endsWith(".png"))
    .sort();
  assert.deepEqual(
    atlasFiles,
    Object.keys(baseline)
      .filter((key) => key.endsWith(".png"))
      .sort(),
  );
  const atlas = atlasFiles.map((file) => {
    assert(
      Buffer.from(files[file]).equals(Buffer.from(baseline[file])),
      `Native atlas pixels/encoding changed: ${file}`,
    );
    return { file, bytes: files[file].length, sha256: sha(files[file]) };
  });
  const start =
    row.view === "original" ? 83 : row.character === "male" ? 63 : 58;
  const count = row.view === "original" ? 39 : 28;
  assert.deepEqual(manifest.animations.jump, {
    frames: Array.from({ length: count }, (_, i) => start + i),
    fps: 24,
    loop: false,
  });
  for (const [action, clip] of Object.entries(oldManifest.animations))
    if (action !== "jump")
      assert.deepEqual(
        manifest.animations[action],
        clip,
        `${action} cadence/selection changed`,
      );
  const flow = expectedFlow(profile);
  const sequences = [
    {
      name: "jump",
      frames: manifest.animations.jump.frames,
      fps: 24,
      paths: row.gifs.jump,
    },
    {
      name: "run-jump-run",
      frames: flow.frames,
      fps: flow.fps,
      paths: row.gifs.flow,
    },
  ];
  const gifFiles = [];
  for (const sequence of sequences) {
    for (const facing of ["right", "left"]) {
      const bytes = await readFile(sequence.paths[facing]);
      const parsed = parseGIF(new Uint8Array(bytes).buffer),
        frames = decompressFrames(parsed, true);
      assert.deepEqual(
        [parsed.lsd.width, parsed.lsd.height],
        [
          manifest.spritesheet.frameWidth / 2,
          manifest.spritesheet.frameHeight / 2,
        ],
      );
      assert.equal(
        frames.length,
        sequence.frames.length,
        `${sequence.name} frame count differs from declared route`,
      );
      const delays = sequence.frames.map(
        (_, i) =>
          (Math.round(((i + 1) * 100) / sequence.fps) -
            Math.round((i * 100) / sequence.fps)) *
          10,
      );
      assert.deepEqual(
        frames.map((frame) => frame.delay),
        delays,
      );
      assert.equal(
        bytes.includes(Buffer.from("NETSCAPE2.0")),
        false,
        "One-shot review must not repeat itself",
      );
      gifFiles.push({
        name: sequence.name,
        facing,
        file: sequence.paths[facing],
        sha256: sha(bytes),
        frames: frames.length,
        durationMs: delays.reduce((sum, delay) => sum + delay, 0),
        delaysMs: delays,
      });
    }
  }
  const pixels = JSON.parse(
    execFileSync(
      "python",
      ["-c", independentlyDecode, JSON.stringify({ ...row, sequences })],
      {
        encoding: "utf8",
        timeout: 300_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    ),
  );
  report.results.push({
    character: row.character,
    view: row.view,
    profileId: profile.id,
    packSha256: sha(actualBytes),
    baselinePackSha256: sha(baselineBytes),
    sourceSha256: profile.sourceSha256,
    nativeFrameCount: manifest.frames.length,
    nativeAtlasBytesUnchanged: true,
    anchorsAndDimensionsUnchanged: true,
    otherActionsAndFpsUnchanged: true,
    singleJumpNativeFrames: manifest.animations.jump.frames,
    flow: { ...flow, frames: undefined },
    atlas,
    gifFiles,
    pixels,
  });
}
report.passed = true;
await writeFile(
  resolve(dirname(input), "pixel-verification.json"),
  JSON.stringify(report, null, 2) + "\n",
);
process.stdout.write(
  JSON.stringify({
    passed: true,
    packs: report.results.length,
    nativeFramesUnchanged: report.results.reduce(
      (n, row) => n + row.nativeFrameCount,
      0,
    ),
    gifs: report.results.reduce((n, row) => n + row.gifFiles.length, 0),
    gifFramesChecked: report.results.reduce(
      (n, row) =>
        n + row.pixels.reduce((total, p) => total + p.framesChecked * 2, 0),
      0,
    ),
  }) + "\n",
);
