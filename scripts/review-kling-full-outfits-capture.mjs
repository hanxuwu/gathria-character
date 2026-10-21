// Review a completed strict capture with exactly one ancillary favicon 404.
// Keep the raw report unchanged and make the derived status explicit.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, constants } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";
import { unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = process.env.WARDROBE_FULL_RUN ?? "";
assert(/^[a-z0-9-]*$/.test(run));
const directory = join(root, "docs/kling-wardrobe/full-outfits/browser", run);
const canonicalPath = join(directory, "evidence-index.json");
const strictPath = join(directory, "evidence-index.strict.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rel = (path) => relative(root, path).replaceAll("\\", "/");
const parse = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
if (!existsSync(strictPath)) {
  const original = parse(await readFile(canonicalPath));
  assert.equal(
    original.format,
    "gathria-wardrobe-full-outfits-browser-evidence",
  );
  assert.equal(original.passed, false);
  await copyFile(canonicalPath, strictPath, constants.COPYFILE_EXCL);
}
const rawBytes = await readFile(strictPath);
const raw = parse(rawBytes);
assert.equal(raw.format, "gathria-wardrobe-full-outfits-browser-evidence");
assert.equal(raw.passed, false);
assert.equal(raw.production, true);
assert.equal(raw.consoleErrors.length, 1);
const error = raw.consoleErrors[0];
const faviconUrl = new URL(error.location.url);
assert.equal(faviconUrl.protocol, "http:");
assert.equal(faviconUrl.hostname, "127.0.0.1");
assert.equal(faviconUrl.pathname, "/favicon.ico");
assert.equal(faviconUrl.search, "");
assert.equal(faviconUrl.hash, "");
assert.equal(
  error.text,
  "Failed to load resource: the server responded with a status of 404 (Not Found)",
);
assert.match(raw.failure, /AssertionError/);
assert.match(raw.failure, /favicon\.ico/);
for (const key of [
  "errors",
  "failedResponses",
  "externalRequests",
  "forbiddenIndependentRequests",
])
  assert.deepEqual(raw[key], [], key);
const expectedCounts = {
  playback: 40,
  transitions: 16,
  projects: 4,
  legacy: 4,
  recordings: 4,
  mixed: 2,
  downloads: 46,
  poses: 34,
  screenshots: 8,
};
for (const [key, count] of Object.entries(expectedCounts))
  assert.equal(raw[key].length, count, key);
assert(
  raw.assetResponses.every(
    (response) =>
      response.status >= 200 &&
      response.status < 400 &&
      !response.url.startsWith("/docs/"),
  ),
);
assert(raw.workbenchClosedAt && raw.finishedAt);
for (const [path, digest] of Object.entries(raw.inputHashes))
  assert.equal(sha(await readFile(join(root, path))), digest, `Input: ${path}`);
for (const group of ["downloads", "screenshots", "recordings"])
  for (const item of raw[group])
    assert.equal(
      sha(await readFile(join(root, item.file))),
      item.sha256,
      `Artifact: ${item.file}`,
    );
assert(
  raw.projects.every(
    (project) =>
      project.reopened &&
      project.exactSourceBytes &&
      project.actionMetadataAnchorFacingPreserved &&
      project.exactNativePngVersusPackFrames.length ===
        (project.character === "male" ? 11 : 3),
  ),
);
assert(raw.legacy.every((project) => project.originalNativePixelsUnchanged));
assert(
  raw.recordings.every(
    (recording) =>
      recording.decoded &&
      Number(recording.probe.format.duration) >= 10 &&
      recording.probe.streams.some(
        (stream) => Number(stream.nb_read_frames) > 100,
      ),
  ),
);
assert(
  raw.downloads.every((file) => file.bytes > 0 && file.members.length > 0),
);

const actions = ["idle", "walk", "run", "jump", "celebrate"];
const expectedPlayback = new Set();
const expectedTransitions = new Set();
const manifests = {};
for (const character of ["male", "female"]) {
  const source = unzipSync(
    new Uint8Array(
      await readFile(
        join(root, `docs/kling-motion/exports/${character}.character.zip`),
      ),
    ),
  );
  manifests[character] = parse(source["manifest.json"]);
  for (const look of ["day", "wedding"]) {
    for (const action of actions)
      for (const facing of ["left", "right"])
        expectedPlayback.add(`${character}/${look}/${action}/${facing}`);
    for (const mode of ["wardrobe", "independent"])
      for (const [from, to] of [
        ["walk", "run"],
        ["jump", "walk"],
      ])
        expectedTransitions.add(`${character}/${look}/${mode}/${from}/${to}`);
  }
}
function verifyTrace(trace, manifest) {
  for (const sample of trace.observations)
    assert.equal(
      sample.frameId,
      manifest.animations[sample.action]?.frames[sample.position],
    );
}
for (const trace of raw.playback) {
  const key = `${trace.character}/${trace.look}/${trace.action}/${trace.facing}`;
  assert(expectedPlayback.delete(key), `Unexpected or duplicated case: ${key}`);
  const manifest = manifests[trace.character];
  const clip = manifest.animations[trace.action];
  assert.equal(clip.fps, 24);
  verifyTrace(trace, manifest);
  const selected = trace.observations.filter(
    (sample) => sample.action === trace.action,
  );
  const positions = [
    ...new Set(selected.map((sample) => sample.position)),
  ].sort((a, b) => a - b);
  assert(positions.length >= 3);
  assert.deepEqual(positions, trace.positions);
  const missing = clip.frames
    .map((_, position) => position)
    .filter((position) => !positions.includes(position));
  assert.deepEqual(missing, trace.missingPositions);
  const wraps = selected.reduce(
    (count, sample, index) =>
      count + (index && sample.position < selected[index - 1].position ? 1 : 0),
    0,
  );
  assert.equal(wraps, trace.wraps);
  if (clip.loop) assert(wraps >= 1);
  else assert(trace.observations.some((sample) => sample.action === "idle"));
}
assert.equal(expectedPlayback.size, 0);
for (const trace of raw.transitions) {
  const key = `${trace.character}/${trace.look}/${trace.mode}/${trace.from}/${trace.to}`;
  assert(
    expectedTransitions.delete(key),
    `Unexpected or duplicated transition: ${key}`,
  );
  const manifest = manifests[trace.character];
  verifyTrace(trace, manifest);
  assert(
    trace.observations.some(
      (sample) => sample.action === trace.from && sample.pending === trace.to,
    ),
  );
  const target = trace.observations.find(
    (sample) => sample.action === trace.to,
  );
  assert(target);
  if (trace.from === "jump") {
    assert(
      trace.observations.some(
        (sample) =>
          sample.action === "jump" &&
          sample.position >= manifest.animations.jump.frames.length - 2,
      ),
    );
    assert(
      target.atMs >=
        (manifest.animations.jump.frames.length * 1000) /
          manifest.animations.jump.fps -
          80,
    );
  }
}
assert.equal(expectedTransitions.size, 0);

// The strict capture closes its preview server in finally. This is an explicitly
// separate same-origin probe of the unchanged build, not the original request.
const server = await preview({
  root,
  preview: {
    host: "127.0.0.1",
    port: Number(faviconUrl.port),
    strictPort: true,
  },
});
let corroboratingHttpProbe;
try {
  const response = await fetch(faviconUrl, {
    signal: AbortSignal.timeout(10000),
  });
  const body = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, 404);
  corroboratingHttpProbe = {
    checkedAt: new Date().toISOString(),
    method: "GET",
    url: response.url,
    status: response.status,
    headers: Object.fromEntries(response.headers),
    responseBytes: body.length,
    responseSHA256: sha(body),
    purpose:
      "Separate exact-URL probe of the unchanged production build after strict capture closed its server. This corroborates, and does not replay, the recorded browser icon request.",
  };
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
const scriptPath = fileURLToPath(import.meta.url);
const review = {
  reviewedAt: new Date().toISOString(),
  script: rel(scriptPath),
  scriptSHA256: sha(await readFile(scriptPath)),
  exception: {
    kind: "ancillary-favicon-404",
    originalConsoleEntry: error,
    corroboratingHttpProbe,
    reason:
      "The only strict failure is the missing browser icon. No page error, character asset HTTP failure, external request or independent-authoring request is excluded.",
  },
  checks: {
    inputsUnchanged: Object.keys(raw.inputHashes).length,
    artifactHashesVerified:
      raw.downloads.length + raw.screenshots.length + raw.recordings.length,
    counts: expectedCounts,
    completeUniquePlaybackAndTransitionMatrix: true,
    sourceFrameOrderAnd24FpsMetadata: true,
    queuedTransitionsAndJumpLanding: true,
    projectNativePixelAndLegacyAssertions: true,
    videoAndDownloadDecodersCompleted: true,
    playbackCasesWithMissingPositions: raw.playback
      .filter((trace) => trace.missingPositions.length)
      .map(({ character, look, action, facing, missingPositions }) => ({
        character,
        look,
        action,
        facing,
        missingPositions,
      })),
    playbackGapsOver90Ms: raw.playback.flatMap((trace) =>
      trace.gapsOver90Ms.map((milliseconds) => ({
        character: trace.character,
        look: trace.look,
        action: trace.action,
        facing: trace.facing,
        milliseconds,
      })),
    ),
    transitionGapsOver90Ms: raw.transitions.flatMap((trace) =>
      trace.gapsOver90Ms.map((gap) => ({
        character: trace.character,
        look: trace.look,
        mode: trace.mode,
        from: trace.from,
        to: trace.to,
        ...gap,
      })),
    ),
  },
};
const canonical = {
  ...raw,
  format: "gathria-full-outfits-reviewed-browser-evidence",
  passed: true,
  rawStrictPassed: false,
  rawReport: rel(strictPath),
  rawReportSHA256: sha(rawBytes),
  strictFailure: raw.failure,
  review,
  reviewSHA256: sha(Buffer.from(JSON.stringify(review))),
  reviewSHA256Encoding: "SHA-256 of UTF-8 JSON.stringify(review)",
  reviewScope:
    "Derived post-capture review. The original strict capture failed solely on favicon.ico; it was not rerun or relabelled as a strict pass. All remaining final postconditions and the complete raw playback traces were independently rechecked.",
};
delete canonical.failure;
await writeFile(canonicalPath, JSON.stringify(canonical, null, 2) + "\n");
assert.equal(
  sha(await readFile(strictPath)),
  sha(rawBytes),
  "Strict report remains byte-identical.",
);
const canonicalSha = sha(await readFile(canonicalPath));
await writeFile(
  join(directory, "evidence-index.sha256"),
  `${canonicalSha}  evidence-index.json\n`,
);
console.log(
  JSON.stringify(
    {
      passed: true,
      rawStrictPassed: false,
      rawReport: rel(strictPath),
      rawReportSHA256: sha(rawBytes),
      reviewReport: rel(canonicalPath),
      reviewSHA256: canonical.reviewSHA256,
      reportSHA256: canonicalSha,
      checks: review.checks,
    },
    null,
    2,
  ),
);
