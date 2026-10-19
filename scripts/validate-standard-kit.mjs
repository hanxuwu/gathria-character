/** Offline acceptance contract for the calibrated eight-look kit.
 * Uses the real archive importer and renderer. This is numerical validation;
 * actual Studio exports and visual review are recorded separately. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = new URL("../", import.meta.url);
const cwd = fileURLToPath(root);
const baselineCommit = "0a0fc061d6024a444b7d0a5bc377b4d39e48153c";
const baselinePath = "docs/theo-ankle-follow/final/theo-ankle-follow.rig.zip";
const preparedPath = "artwork/standard-kit/prepared/projects/";
const outputPath = "docs/standard-kit/contract-validation.json";
const ids = ["short", "sweep"].flatMap((hair) =>
  ["teal", "ochre"].flatMap((top) =>
    ["boots", "sneakers"].map((shoes) => `${hair}-${top}-${shoes}`),
  ),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const jsonHash = (value) => hash(JSON.stringify(canonical(value)));
const decode = (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8"));
const startedAt = new Date().toISOString();
const report = {
  format: "gathria-standard-kit-validation",
  version: 1,
  startedAt,
  scope:
    "Numerical source-contract and renderer checks; not a substitute for actual exported PNG/GIF review or independent-player checks.",
  baseline: { commit: baselineCommit, project: baselinePath },
  expectedProjects: ids,
  sourceFreeze: {},
  projects: [],
  crossCombination: [],
  failures: [],
};
let server, browser;
try {
  // Historical source files remain immutable. New kit-only assets/scripts/docs
  // are allowed, but adding a runtime file is outside this asset-only batch.
  const protectedPaths = ["src", "artwork", "docs/theo-ankle-follow/final"];
  const changes = execFileSync(
    "git",
    ["diff", "--name-status", baselineCommit, "--", ...protectedPaths],
    { cwd, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((line) => !/^A\tartwork\/standard-kit\//.test(line));
  const newRuntime = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "src"],
    { cwd, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.deepEqual(changes, [], "Historical runtime/artwork changed");
  assert.deepEqual(newRuntime, [], "Unexpected untracked runtime additions");
  report.sourceFreeze = { baselineCommit, protectedPaths, unchanged: true };

  const baselineBytes = await readFile(new URL(baselinePath, root));
  const baselineArchive = unzipSync(baselineBytes);
  const baselineProject = decode(baselineArchive["project.json"]);
  const baselineSkin = decode(baselineArchive["skin.json"]);
  report.baseline = {
    ...report.baseline,
    archiveSha256: hash(baselineBytes),
    rigSha256: jsonHash(baselineProject.rig),
    chainsSha256: jsonHash(baselineSkin.bindings.chains),
    motionsSha256: jsonHash(baselineProject.motions),
    chains: baselineSkin.bindings.chains,
    clips: Object.fromEntries(
      Object.entries(baselineProject.motions.clips).map(([action, clip]) => [
        action,
        {
          keys: clip.keys.length,
          fps: clip.fps,
          loop: clip.loop,
          sequence: clip.sequence,
        },
      ]),
    ),
  };
  const inputs = [];
  for (const id of ids) {
    const file = `${preparedPath}${id}.rig.zip`;
    const bytes = await readFile(new URL(file, root));
    const files = unzipSync(bytes);
    const metadata = decode(files["project.json"]);
    const skin = decode(files["skin.json"]);
    assert.deepEqual(metadata.rig, baselineProject.rig, `${id}: rig drift`);
    assert.deepEqual(
      metadata.motions,
      baselineProject.motions,
      `${id}: motion drift`,
    );
    assert.deepEqual(
      skin.bindings.chains,
      baselineSkin.bindings.chains,
      `${id}: shared anatomical chain drift`,
    );
    assert.equal(skin.version, 4, `${id}: requires shin-following footwear`);
    assert.deepEqual(metadata.rig.frame, { width: 192, height: 256 });
    assert.deepEqual(metadata.rig.anchor, [96, 240]);
    assert.deepEqual(
      metadata.rig.bones.find((bone) => bone.id === "head").from,
      [96, 118],
    );
    inputs.push({ id, file, sha256: hash(bytes), bytes: bytes.length });
  }

  const port = Number(process.env.STANDARD_KIT_VALIDATION_PORT || 5213);
  server = await createServer({
    root: cwd,
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/skin-studio.html`);
  const headRegistrationPath =
    "artwork/standard-kit/prepared/head-registration.json";
  const headRegistrationBytes = await readFile(
    new URL(headRegistrationPath, root),
  );
  const headRegistration = decode(headRegistrationBytes);
  const headSources = [];
  for (const id of ["short", "sweep"]) {
    const path = `artwork/standard-kit/prepared/identities/${id}.identity.zip`;
    headSources.push({
      path,
      sha256: hash(await readFile(new URL(path, root))),
    });
  }
  for (const record of [headRegistration.source, headRegistration.baseline]) {
    const bytes = await readFile(new URL(record.path, root));
    assert.equal(
      hash(bytes),
      record.sha256,
      `${record.path}: stale source hash`,
    );
    headSources.push({ path: record.path, sha256: record.sha256 });
  }
  for (const record of [...headRegistration.faces, ...headRegistration.hairs])
    for (const field of ["path", "mask"]) {
      const path = `artwork/standard-kit/prepared/${record[field]}`;
      const bytes = await readFile(new URL(path, root));
      assert.equal(
        hash(bytes),
        record[`${field}Sha256`],
        `${path}: stale prepared hash`,
      );
      headSources.push({ path, sha256: record[`${field}Sha256`] });
    }
  report.headSourceComposition = await page.evaluate(async (registration) => {
    const { decodeAttachment } = await import("/src/skeletal/skin-io.ts");
    const { importWardrobeIdentity } = await import(
      "/src/skeletal/identity-io.ts"
    );
    const { decodeWardrobeItemPart } = await import(
      "/src/skeletal/wardrobe-items.ts"
    );
    const base = "/artwork/standard-kit/prepared/";
    const check = (value, message) => {
      if (!value) throw Error(message);
    };
    const canonical = (value) =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
            )
          : value;
    const digest = async (bytes) =>
      [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    const png = async (path) => {
      const decoded = await decodeAttachment(
        await (await fetch(base + path)).blob(),
      );
      check(!decoded.thresholdedPixels, `${path}: normalized alpha`);
      return decoded.pixels;
    };
    const faces = {},
      hairs = {},
      identities = {},
      results = [];
    for (const record of registration.faces)
      faces[record.expression] = {
        pixels: await png(record.path),
        mask: await png(record.mask),
      };
    for (const record of registration.hairs) {
      hairs[record.id] = {
        pixels: await png(record.path),
        mask: await png(record.mask),
      };
      identities[record.id] = await importWardrobeIdentity(
        await (
          await fetch(base + `identities/${record.id}.identity.zip`)
        ).blob(),
      );
    }
    check(
      JSON.stringify(identities.short.jaw) ===
        JSON.stringify(identities.sweep.jaw),
      "Hairstyles changed jaw geometry",
    );
    for (const [hairId, hair] of Object.entries(hairs))
      for (const [expression, face] of Object.entries(faces)) {
        const part = identities[hairId].parts.find(
          (part) => part.slot === `head-${expression}`,
        );
        const raw = decodeWardrobeItemPart(part.data);
        let visibleFace = 0,
          coveredFace = 0;
        for (let p = 0; p < 192 * 256; p++) {
          const i = p * 4,
            j = p * 5;
          const foreground = hair.pixels[i + 3] !== 0;
          const layer = foreground ? hair : face;
          for (let channel = 0; channel < 4; channel++)
            check(
              raw[j + channel] === layer.pixels[i + channel],
              `${hairId}/${expression}: head differs from shared face + registered hair at ${p}`,
            );
          check(
            raw[j + 4] === layer.mask[i],
            `${hairId}/${expression}: mask composition differs at ${p}`,
          );
          for (const source of [face, hair]) {
            check(
              source.pixels[i + 3] === source.mask[i + 3],
              `${hairId}/${expression}: source artwork/mask alpha differs at ${p}`,
            );
            check(
              source.mask[i + 1] === 0 && source.mask[i + 2] === 0,
              `${hairId}/${expression}: source mask green/blue is not zero at ${p}`,
            );
          }
          check(
            !face.pixels[i + 3] || [0, 1].includes(face.mask[i]),
            `${expression}: shared face contains foreign material at ${p}`,
          );
          check(
            !hair.pixels[i + 3] || [0, 2].includes(hair.mask[i]),
            `${hairId}: isolated hair contains foreign material at ${p}`,
          );
          if (face.pixels[i + 3]) {
            if (foreground) coveredFace++;
            else visibleFace++;
          }
        }
        check(
          visibleFace > 0,
          `${hairId}/${expression}: no visible shared face`,
        );
        const declared = registration.checks.find(
          (value) => value.id === hairId && value.expression === expression,
        );
        check(
          declared.sharedFaceRetained === visibleFace &&
            declared.coveredFacePixels === coveredFace,
          `${hairId}/${expression}: stale recorded face coverage`,
        );
        results.push({
          hair: hairId,
          expression,
          visibleFace,
          coveredFace,
          exactRGBAAndMaterialRecomposition: true,
        });
      }
    const commonVisibleFace = [];
    for (const [expression, face] of Object.entries(faces)) {
      const declared = registration.checks.find(
        (value) => value.expression === expression && !value.id,
      );
      const protectedFace = await png(declared.protectedVisibleFace);
      let pixels = 0;
      for (let p = 0; p < 192 * 256; p++) {
        const retained =
          face.pixels[p * 4 + 3] &&
          !hairs.short.pixels[p * 4 + 3] &&
          !hairs.sweep.pixels[p * 4 + 3];
        if (retained) pixels++;
        for (let channel = 0; channel < 4; channel++)
          check(
            protectedFace[p * 4 + channel] === (retained ? 255 : 0),
            `${expression}: protected visible face PNG is stale at ${p}`,
          );
      }
      check(
        pixels > 0 && declared.commonVisiblePixels === pixels,
        `${expression}: stale common visible face count`,
      );
      commonVisibleFace.push({ expression, pixels });
    }
    const identityReferences = [];
    for (const [hair, identity] of Object.entries(identities)) {
      const metadata = {
        ...identity,
        parts: identity.parts.map(({ data, ...part }) => part),
      };
      identityReferences.push({
        hair,
        id: identity.id,
        metadataSha256: await digest(
          new TextEncoder().encode(JSON.stringify(canonical(metadata))),
        ),
        parts: await Promise.all(
          identity.parts.map(async (part) => ({
            slot: part.slot,
            decodedSha256: await digest(decodeWardrobeItemPart(part.data)),
          })),
        ),
      });
    }
    const eyeCoverage = [];
    const contains = ([x, y], polygon) => {
      let inside = false;
      for (
        let edge = 0, previous = polygon.length - 1;
        edge < polygon.length;
        previous = edge++
      ) {
        const [ax, ay] = polygon[edge],
          [bx, by] = polygon[previous];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
          inside = !inside;
      }
      return inside;
    };
    for (const record of registration.checks.filter(
      (value) => value.protectedEyes,
    )) {
      const definition = record.protectedEyes;
      let pixels = 0,
        overlap = 0;
      for (let y = 1; y < 255; y++)
        for (let x = 1; x < 191; x++) {
          const source = [0, 1].map((axis) =>
            Math.floor(
              definition.sourceNeck[axis] +
                ([x, y][axis] + 0.5 - definition.targetNeck[axis]) /
                  definition.scale[axis],
            ),
          );
          if (
            !definition.sourcePolygons.some((polygon) =>
              contains(source, polygon),
            )
          )
            continue;
          pixels++;
          if (hairs[record.id].pixels[(y * 192 + x) * 4 + 3]) overlap++;
        }
      check(
        pixels > 0 &&
          pixels === definition.pixels &&
          overlap === 0 &&
          definition.overlapPixels === 0,
        `${record.id}: hair covers protected eye region or coverage record is stale`,
      );
      eyeCoverage.push({
        hair: record.id,
        protectedPixels: pixels,
        overlapPixels: overlap,
      });
    }
    check(
      eyeCoverage.length === 2,
      "Both hairstyles need protected eye regions",
    );
    return {
      results,
      commonVisibleFace,
      identityReferences,
      eyeCoverage,
      note: "One immutable source face per expression, compiled with either registered hair. Forehead occlusion can differ; separate expression source drawings are not claimed pixel-identical to each other.",
    };
  }, headRegistration);
  report.headSourceComposition.registration = {
    path: headRegistrationPath,
    sha256: hash(headRegistrationBytes),
  };
  report.headSourceComposition.sourceFiles = headSources;
  for (const input of inputs) {
    console.log(`Checking shared-body contract: ${input.id}`);
    const result = await page.evaluate(
      async ({ input, baselinePath, identityReferences }) => {
        const { importProject } = await import("/src/skeletal/skin-io.ts");
        const { prepareRig } = await import("/src/skeletal/renderer.ts");
        const { unzlibSync } = await import(
          "/node_modules/.vite/deps/fflate.js"
        );
        const W = 192,
          H = 256;
        const check = (condition, message) => {
          if (!condition) throw Error(`${input.id}: ${message}`);
        };
        const canonical = (value) =>
          Array.isArray(value)
            ? value.map(canonical)
            : value && typeof value === "object"
              ? Object.fromEntries(
                  Object.keys(value)
                    .sort()
                    .map((key) => [key, canonical(value[key])]),
                )
              : value;
        const same = (a, b) =>
          JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
        const digest = async (bytes) =>
          [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
        const project = await importProject(
          await (await fetch(`/${input.file}`)).blob(),
        );
        const baseline = await importProject(
          await (await fetch(`/${baselinePath}`)).blob(),
        );
        const rig = prepareRig(project.rig, project.skin, project.motions);
        const baseRig = prepareRig(
          baseline.rig,
          baseline.skin,
          baseline.motions,
        );
        check(
          project.wardrobeIdentities?.length === 2,
          "expected both kit identities embedded",
        );
        for (const reference of identityReferences) {
          const identity = project.wardrobeIdentities.find(
            (value) => value.id === reference.id,
          );
          check(
            Boolean(identity),
            `missing validated identity ${reference.id}`,
          );
          const metadata = {
            ...identity,
            parts: identity.parts.map(({ data, ...part }) => part),
          };
          check(
            (await digest(
              new TextEncoder().encode(JSON.stringify(canonical(metadata))),
            )) === reference.metadataSha256,
            `embedded identity ${reference.id} differs from validated source metadata`,
          );
          for (const part of identity.parts) {
            const raw = unzlibSync(
              Uint8Array.from(atob(part.data), (value) => value.charCodeAt(0)),
            );
            check(
              (await digest(raw)) ===
                reference.parts.find((value) => value.slot === part.slot)
                  ?.decodedSha256,
              `embedded identity ${reference.id}/${part.slot} differs from validated shared face/hair`,
            );
          }
        }
        const scan = (pixels, label) => {
          check(pixels.length === W * H * 4, `${label}: wrong RGBA dimensions`);
          let count = 0,
            minX = W,
            minY = H,
            maxX = -1,
            maxY = -1;
          for (let p = 0; p < W * H; p++) {
            const i = p * 4,
              a = pixels[i + 3];
            check(a === 0 || a === 255, `${label}: partial alpha at ${p}`);
            if (!a) {
              check(
                pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 0,
                `${label}: nonzero hidden RGB at ${p}`,
              );
              continue;
            }
            count++;
            const x = p % W,
              y = Math.floor(p / W);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
          check(count > 0, `${label}: empty pixels`);
          check(
            minX > 0 && minY > 0 && maxX < W - 1 && maxY < H - 1,
            `${label}: reaches frame edge ${[minX, minY, maxX, maxY]}`,
          );
          return { opaquePixels: count, bounds: [minX, minY, maxX, maxY] };
        };
        const slotHashes = {};
        const slots = [];
        for (const [slot, pixels] of Object.entries(project.skin.images)) {
          slots.push({ slot, ...scan(pixels, slot) });
          slotHashes[slot] = await digest(pixels);
        }
        const materials = [];
        for (const item of [
          ...(project.wardrobeItems ?? []),
          ...(project.wardrobeIdentities ?? []),
        ]) {
          const allowed =
            item.group === "top"
              ? [0, 1, 3]
              : item.group === "bottom"
                ? [0, 1, 4]
                : item.group === "shoes"
                  ? [0, 5]
                  : [0, 1, 2];
          for (const part of item.parts) {
            const raw = unzlibSync(
              Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0)),
            );
            const counts = {};
            check(
              raw.length === W * H * 5,
              `${item.id}/${part.slot}: material dimensions`,
            );
            for (let p = 0; p < W * H; p++) {
              const i = p * 5;
              if (!raw[i + 3]) continue;
              const material = raw[i + 4];
              check(
                allowed.includes(material),
                `${item.id}/${part.slot}: foreign material ${material} at ${p}`,
              );
              counts[material] = (counts[material] ?? 0) + 1;
            }
            materials.push({
              id: item.id,
              slot: part.slot,
              materialCounts: counts,
            });
          }
        }
        const frames = [];
        let maxRunLengthError = 0,
          maxRunShoeAngleError = 0,
          maxRunAnkleError = 0,
          maxRunSupportError = 0;
        for (const [action, clip] of Object.entries(project.motions.clips)) {
          for (let index = 0; index < clip.keys.length; index++) {
            const inspection = rig.inspect(action, index, "neutral");
            const baseInspection = baseRig.inspect(action, index, "neutral");
            check(
              same(inspection.bodyBones, baseInspection.bodyBones),
              `${action}/${index}: body pose drift`,
            );
            for (const limb of inspection.limbs) {
              const source = project.skin.metadata.bindings.chains[limb.id];
              const expected = baseInspection.limbs.find(
                (value) => value.id === limb.id,
              );
              if (action !== "run" || limb.id.endsWith("Arm"))
                check(
                  same(limb.bones, expected.bones),
                  `${action}/${index}/${limb.id}: pose drift`,
                );
              if (action === "run")
                for (let segment = 0; segment < 2; segment++) {
                  const length = (points) =>
                    Math.hypot(
                      points[segment + 1][0] - points[segment][0],
                      points[segment + 1][1] - points[segment][1],
                    );
                  const error = Math.abs(length(source) - length(limb.bones));
                  check(
                    error < 1e-6,
                    `${action}/${index}/${limb.id}: stretched bone ${error}`,
                  );
                  maxRunLengthError = Math.max(maxRunLengthError, error);
                }
            }
            for (const shoe of inspection.shoes ?? []) {
              const limb = inspection.limbs.find(
                (value) => value.id === shoe.chain,
              );
              const knee = limb.bones[1],
                ankle = limb.bones[2];
              const sourceAngle = Math.atan2(
                shoe.sourceAnkle[1] - shoe.sourceShin[1],
                shoe.sourceAnkle[0] - shoe.sourceShin[0],
              );
              const posedAngle = Math.atan2(
                ankle[1] - knee[1],
                ankle[0] - knee[0],
              );
              const angleError = Math.abs(
                Math.atan2(
                  Math.sin(shoe.rotation + sourceAngle - posedAngle),
                  Math.cos(shoe.rotation + sourceAngle - posedAngle),
                ),
              );
              const [a, b, c, d, e, f] = shoe.matrix;
              const mapped = [
                a * shoe.sourceAnkle[0] + c * shoe.sourceAnkle[1] + e,
                b * shoe.sourceAnkle[0] + d * shoe.sourceAnkle[1] + f,
              ];
              const ankleError = Math.hypot(
                mapped[0] - ankle[0],
                mapped[1] - ankle[1],
              );
              const supportError = Math.abs(shoe.supportError);
              check(
                angleError < 1e-6 && ankleError < 1e-6 && supportError <= 1,
                `${action}/${index}/${shoe.chain}: shoe does not follow shin/support`,
              );
              maxRunShoeAngleError = Math.max(maxRunShoeAngleError, angleError);
              maxRunAnkleError = Math.max(maxRunAnkleError, ankleError);
              maxRunSupportError = Math.max(maxRunSupportError, supportError);
            }
            const expressions = [];
            for (const expression of ["neutral", "gentle", "joyful"]) {
              const first = rig.frame(action, index, expression);
              const second = rig.frame(action, index, expression);
              check(
                first.every((v, i) => v === second[i]),
                `${action}/${index}/${expression}: nondeterministic pixels`,
              );
              expressions.push({
                expression,
                ...scan(first, `${action}/${index}/${expression}`),
                sha256: await digest(first),
              });
            }
            frames.push({
              action,
              index,
              expressions,
              sourceSlots: inspection.limbs.map(
                ({ id, sourceSlots, variant }) => ({
                  id,
                  sourceSlots,
                  variant,
                }),
              ),
              shoes: inspection.shoes ?? [],
            });
          }
        }
        return {
          ...input,
          skinVersion: project.skin.metadata.version,
          selected: project.wardrobe,
          slots,
          slotHashes,
          materials,
          frames,
          frameExpressionChecks: frames.length * 3,
          maxRunLengthError,
          maxRunShoeAngleError,
          maxRunAnkleError,
          maxRunSupportError,
          note: "Native right-facing renderer checked. Actual mirrored browser/export playback is checked by the separate evidence workflow. Neutral run bone lengths are strict; historical idle/walk/joyful arm offsets are retained.",
        };
      },
      {
        input,
        baselinePath,
        identityReferences: report.headSourceComposition.identityReferences,
      },
    );
    report.projects.push(result);
  }
  // Clothes cannot silently replace the face/hair; shoe choices cannot alter
  // trousers; hair cannot replace limbs. Compare decoded RGBA, not ZIP bytes.
  for (const a of report.projects)
    for (const b of report.projects) {
      if (a.id >= b.id) continue;
      const [hairA, topA, shoesA] = a.id.split("-");
      const [hairB, topB, shoesB] = b.id.split("-");
      const invariantSlots = Object.keys(a.slotHashes).filter((slot) =>
        /^(head-|back-hair$)/.test(slot)
          ? hairA === hairB
          : /^(torso$|.*arm)/.test(slot)
            ? topA === topB
            : /shoe/.test(slot)
              ? shoesA === shoesB
              : true,
      );
      for (const slot of invariantSlots)
        assert.equal(
          a.slotHashes[slot],
          b.slotHashes[slot],
          `${a.id}/${b.id}: hidden ${slot} replacement`,
        );
      report.crossCombination.push({
        a: a.id,
        b: b.id,
        unchangedSlots: invariantSlots,
      });
    }
  for (const [field, expectedCount, token] of [
    ["identity", 2, 0],
    ["top", 2, 1],
    ["bottom", 1, null],
    ["shoes", 2, 2],
  ]) {
    const choices = new Map();
    for (const project of report.projects) {
      const key = token === null ? "shared" : project.id.split("-")[token];
      if (choices.has(key))
        assert.equal(
          project.selected[field],
          choices.get(key),
          `${project.id}: inconsistent ${field} selection`,
        );
      else choices.set(key, project.selected[field]);
    }
    assert.equal(
      new Set(choices.values()).size,
      expectedCount,
      `Expected ${expectedCount} distinct ${field} choices`,
    );
  }
  for (const [firstId, secondId, slot] of [
    ["short-teal-boots", "sweep-teal-boots", "head-neutral"],
    ["short-teal-boots", "short-ochre-boots", "torso"],
    ["short-teal-boots", "short-teal-sneakers", "near-shoe"],
  ])
    assert.notEqual(
      report.projects.find((project) => project.id === firstId).slotHashes[
        slot
      ],
      report.projects.find((project) => project.id === secondId).slotHashes[
        slot
      ],
      `${firstId}/${secondId}: advertised variant has identical ${slot} pixels`,
    );
  report.summary = {
    projects: report.projects.length,
    sourceKeys: report.projects.reduce(
      (sum, project) => sum + project.frames.length,
      0,
    ),
    sourceKeyExpressions: report.projects.reduce(
      (sum, project) => sum + project.frameExpressionChecks,
      0,
    ),
    deterministicComparisons: report.projects.reduce(
      (sum, project) => sum + project.frameExpressionChecks,
      0,
    ),
    runShoeDiagnostics: report.projects.reduce(
      (sum, project) =>
        sum +
        project.frames.reduce((count, frame) => count + frame.shoes.length, 0),
      0,
    ),
    crossCombinationPairs: report.crossCombination.length,
    exactHeadRecompositions: report.headSourceComposition.results.length,
  };
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failures.push(error.stack ?? String(error));
  process.exitCode = 1;
  console.error(error);
} finally {
  await browser?.close();
  await server?.close();
  report.completedAt = new Date().toISOString();
  await mkdir(new URL("./", new URL(outputPath, root)), { recursive: true });
  await writeFile(
    new URL(outputPath, root),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(`${report.passed ? "PASS" : "FAIL"}: ${outputPath}`);
}
