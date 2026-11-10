/** Fixed-camera evidence from the real wardrobe compositor and travel controller.
 * Bundle with esbuild --platform=node --format=esm, then run with --before-assets,
 * --after-assets, --out and optionally --frames-out. This does not edit assets.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { encodeSourceRgbaPng } from "../src/core/baked-source";
import {
  gameplayManifest,
  resolveGameplayMotion,
} from "../src/core/gameplay-motion";
import {
  advanceSidePlayback,
  createSideGameplayState,
  requestSidePlayback,
  sidePlaybackFrameId,
  type SideGameplayState,
} from "../src/side-view/gameplay";
import {
  addWardrobeAppearanceBank,
  createWardrobeProject,
  selectWardrobeAppearance,
  selectWardrobeGarment,
} from "../src/wardrobe/project";
import { createWardrobeCompositor } from "../src/wardrobe/compositor";
import { buildWardrobeRunJumpSequence } from "../src/wardrobe/action-flow-gif";
import { gifDelays } from "../src/wardrobe/action-gif";
import type { WardrobeSelection } from "../src/wardrobe/contract";

const { values } = parseArgs({
  options: {
    "before-assets": { type: "string" },
    "after-assets": { type: "string" },
    out: { type: "string" },
    "frames-out": { type: "string" },
  },
  strict: true,
});
for (const key of ["before-assets", "after-assets", "out"] as const)
  if (!values[key]) throw Error(`Missing --${key}`);
const out = resolve(values.out!);
const framesOut = resolve(values["frames-out"] ?? out + "/native");
mkdirSync(out, { recursive: true });
mkdirSync(framesOut, { recursive: true });
const read = (path: string) => new Uint8Array(readFileSync(path));
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const looks = ["original", "daily", "wedding"] as const;
const facings = ["right", "left"] as const;
const options = {
  mode: "travel" as const,
  walkSpeed: 300,
  runSpeed: 700,
  bounds: { min: -100000, max: 100000 },
};
type Sample = {
  tick: number;
  action: string;
  frameId: number;
  durationMs: number;
  elapsedMs: number;
  worldX: number;
  leadIn: SideGameplayState["leadIn"] | null;
};
const editions = [];
let baselineClock: {
  fps: number;
  jumpRequestTick: number;
  startTick: number;
} | null = null;
let baselineSamples: Record<string, Sample[]> | null = null;
for (const edition of ["before", "after"] as const) {
  const assets = resolve(values[`${edition}-assets`]!);
  const catalog = json(assets + "/catalog.json");
  const source = read(assets + "/male.source.zip");
  const registration = read(assets + "/male.registration.json");
  assert.equal(hash(source), catalog.sourceSha256);
  assert.equal(hash(registration), catalog.registrationSha256);
  const garmentNames = [
    "daily-top",
    "daily-bottom",
    "wedding-top",
    "wedding-bottom",
  ];
  let project = await createWardrobeProject(
    source,
    registration,
    garmentNames.map((name) => read(`${assets}/male-${name}.garment.zip`)),
  );
  project = await addWardrobeAppearanceBank(
    project,
    read(assets + "/male.appearance.zip"),
  );
  const profile = resolveGameplayMotion(
    project.archive.manifest,
    project.document.sourceSha256,
    project.archive.config,
  );
  assert(profile, `${edition} must resolve its own immutable gameplay profile`);
  assert.equal(profile.view, "side");
  const manifest = gameplayManifest(
    project.archive.manifest,
    profile,
    project.archive.config,
  );
  const sequence = buildWardrobeRunJumpSequence(profile);
  // A transition may remove a redundant stationary landing drawing. Compare
  // equal wall-clock windows beginning at the same shared contact pose rather
  // than normalizing each edition to its later recovery pose or frame count.
  const startTick = sequence.frames.findIndex((frame) => frame.frameId === 85);
  assert(
    startTick >= 0,
    "The review requires the shared source85 contact pose",
  );
  const clock = {
    fps: sequence.fps,
    jumpRequestTick: sequence.jumpRequestTick,
    startTick,
  };
  if (baselineClock)
    assert.deepEqual(
      clock,
      baselineClock,
      "Before/after contact windows must start at the same actual time and cadence",
    );
  else baselineClock = clock;
  const endTickExclusive = startTick + 10;
  assert(endTickExclusive <= sequence.frames.length);
  const samples: Record<string, Sample[]> = {};
  for (const facing of facings) {
    let state: SideGameplayState = {
      ...createSideGameplayState(),
      action: "run",
      facing,
    };
    const rows: Sample[] = [];
    for (const [tick, expected] of sequence.frames.entries()) {
      if (tick === sequence.jumpRequestTick) {
        state = requestSidePlayback(state, "jump", manifest, profile);
        state = advanceSidePlayback(state, 0, manifest, options, profile);
      }
      const frameId = sidePlaybackFrameId(state, manifest, profile);
      assert.equal(
        frameId,
        expected.frameId,
        `${edition}/${facing}/tick${tick}`,
      );
      assert.equal(state.action, expected.action);
      rows.push({
        tick,
        action: state.action,
        frameId,
        durationMs: expected.durationMs,
        elapsedMs: state.elapsedMs,
        worldX: state.worldX,
        leadIn: state.leadIn ?? null,
      });
      state = advanceSidePlayback(
        state,
        expected.durationMs,
        manifest,
        options,
        profile,
      );
    }
    samples[facing] = rows;
  }
  for (let tick = 0; tick < sequence.frames.length; tick++)
    assert(
      Math.abs(samples.right[tick].worldX + samples.left[tick].worldX) < 1e-7,
    );
  if (baselineSamples)
    for (const facing of facings)
      for (let tick = startTick; tick < endTickExclusive; tick++) {
        assert.equal(
          samples[facing][tick].durationMs,
          baselineSamples[facing][tick].durationMs,
        );
        assert(
          Math.abs(
            samples[facing][tick].worldX - baselineSamples[facing][tick].worldX,
          ) < 1e-7,
          "Before/after must use identical actual world travel at equal times",
        );
      }
  else baselineSamples = samples;
  const frames = [];
  for (const look of looks) {
    let selected = project;
    for (const slot of ["fullBody", "top", "bottom", "shoes"] as const)
      selected = selectWardrobeGarment(selected, slot, null);
    const preset = catalog.presets[look] as WardrobeSelection;
    for (const slot of ["top", "bottom", "shoes", "fullBody"] as const)
      if (preset[slot])
        selected = selectWardrobeGarment(selected, slot, preset[slot]);
    selected = selectWardrobeAppearance(selected, {
      hairId: look === "original" ? null : "side-part-matched-v1",
      faceId: null,
    });
    const renderer = await createWardrobeCompositor(selected);
    try {
      for (const row of samples.right.slice(startTick, endTickExclusive)) {
        const frame = renderer.renderFrame(row.frameId);
        assert.equal(
          frame.width,
          512,
          "This fixed-camera study expects native candidate width",
        );
        assert.equal(
          frame.height,
          768,
          "This fixed-camera study expects native candidate height",
        );
        const bytes = encodeSourceRgbaPng(frame);
        const filename = `${edition}-${look}-${row.tick}-${row.frameId}.png`;
        writeFileSync(resolve(framesOut, filename), bytes);
        frames.push({
          look,
          tick: row.tick,
          frameId: row.frameId,
          file: filename,
          pngSha256: hash(bytes),
          rgbaSha256: hash(frame.pixels),
          width: frame.width,
          height: frame.height,
        });
      }
    } finally {
      renderer.dispose();
    }
  }
  editions.push({
    edition,
    sourceSha256: catalog.sourceSha256,
    registrationSha256: catalog.registrationSha256,
    profileId: profile.id,
    anchor: manifest.anchor,
    sequence: {
      fps: sequence.fps,
      frames: sequence.frames.length,
      durationMs: sequence.durationMs,
      jumpRequestTick: sequence.jumpRequestTick,
      window: {
        startTick,
        endTickExclusive,
        gifDurationsMs: gifDelays(sequence.frames.length, sequence.fps).slice(
          startTick,
          endTickExclusive,
        ),
      },
    },
    samples,
    frames,
  });
  console.log(
    `Rendered ${edition}: ${frames.length} exact native PNGs, controller profile ${profile.id}`,
  );
}
const priorNativeFrames = new Map(
  editions[0].frames.map((frame) => [`${frame.look}/${frame.frameId}`, frame]),
);
let sharedNativeFrames = 0;
const changedSharedNativeFrames: Array<{ look: string; frameId: number }> = [];
for (const frame of editions[1].frames) {
  const prior = priorNativeFrames.get(`${frame.look}/${frame.frameId}`);
  if (!prior) continue;
  sharedNativeFrames++;
  if (prior.rgbaSha256 !== frame.rgbaSha256)
    changedSharedNativeFrames.push({
      look: frame.look,
      frameId: frame.frameId,
    });
}
const report = {
  format: "gathria-fixed-ground-landing-review",
  version: 1,
  source:
    "Actual WardrobeCompositor RGBA and advanceSidePlayback world coordinates",
  visualAcceptance: "pending",
  sourceAssetsModified: false,
  candidateChanged: editions[0].sourceSha256 !== editions[1].sourceSha256,
  sharedNativePoseComparison: {
    compared: sharedNativeFrames,
    changed: changedSharedNativeFrames,
    meaning:
      "Compare matching source frame IDs across editions, independent of which wall-clock tick displays them.",
  },
  options,
  camera: {
    mode: "fixed-per-window",
    origin:
      "A single constant world-origin offset chosen at the first reviewed tick; identical for before and after. No per-frame camera tracking or foot alignment.",
    groundY: "Source manifest anchor.y, not estimated shoe height.",
    displayScale: 0.5,
    left: "Exact horizontal mirror of native compositor output; world velocity sign changes through actual controller.",
  },
  nativeFramesDirectory: framesOut,
  editions,
};
writeFileSync(
  resolve(out, "fixed-ground-review.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(`Ground review data: ${resolve(out, "fixed-ground-review.json")}`);
