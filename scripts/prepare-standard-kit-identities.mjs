/** Offline shared-face / interchangeable-hair authoring. No runtime changes. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const target = new URL("artwork/standard-kit/prepared/", root);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const paths = {
  source: "artwork/standard-kit/source/head-hair.png",
  baseline: "docs/theo-ankle-follow/final/theo-ankle-follow.rig.zip",
};
const inputs = {};
for (const [key, path] of Object.entries(paths)) {
  const bytes = await readFile(new URL(path, root));
  inputs[key] = { path, sha256: hash(bytes), data: bytes.toString("base64") };
}
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 5218, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5218/skin-studio.html");
  const result = await page.evaluate(async (inputs) => {
    const { importProject, encodeAttachmentPng } = await import(
      "/src/skeletal/skin-io.ts"
    );
    const { exportWardrobeIdentity, importWardrobeIdentity } = await import(
      "/src/skeletal/identity-io.ts"
    );
    const { validateWardrobeIdentity, defaultCustomWardrobeRecipe } =
      await import("/src/skeletal/identities.ts");
    const { applyWardrobe } = await import("/src/skeletal/wardrobe.ts");
    const { prepareRig } = await import("/src/skeletal/renderer.ts");
    const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
    const W = 192,
      H = 256,
      outputs = {},
      checks = [];
    const from64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    function b64(bytes) {
      let out = "";
      for (let i = 0; i < bytes.length; i += 8192)
        out += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(out);
    }
    const baseline = await importProject(
      new Blob([from64(inputs.baseline.data)]),
    );
    const image = new Image();
    image.src = "data:image/png;base64," + inputs.source.data;
    await image.decode();
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = image.width;
    sourceCanvas.height = image.height;
    const sourceCtx = sourceCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    sourceCtx.drawImage(image, 0, 0);
    const source = sourceCtx.getImageData(0, 0, image.width, image.height).data;
    const palette = { skin: "#f6bc8d", hair: "#75462c" };
    const metadata = {
      format: "gathria-standard-kit-head-registration",
      version: 1,
      canvas: [W, H],
      targetNeck: [96, 118],
      alphaThreshold: 192,
      source: {
        path: inputs.source.path,
        sha256: inputs.source.sha256,
        size: [image.width, image.height],
      },
      baseline: { path: inputs.baseline.path, sha256: inputs.baseline.sha256 },
      palette,
      composition:
        "registered hair over immutable shared face; no rear-hair attachment",
      faces: [],
      hairs: [],
      checks,
      limitations: [
        "The three expressions are separate generated drawings, registered by the short neck; small facial contour and light differences remain. Both hairstyles use exactly the same face for a given expression.",
        "Hair is precomposed offline into IdentityPack V1. This batch does not add a runtime hair slot or an arbitrary hairstyle fitting algorithm.",
      ],
    };
    async function save(name, rgba) {
      outputs[name] = Array.from(await encodeAttachmentPng(rgba));
    }
    function maskOf(rgba, materials) {
      const mask = new Uint8ClampedArray(W * H * 4);
      for (let p = 0; p < W * H; p++)
        if (rgba[p * 4 + 3]) mask.set([materials[p], 0, 0, 255], p * 4);
      return mask;
    }
    function packed(rgba, materials) {
      const bytes = new Uint8Array(W * H * 5);
      for (let p = 0; p < W * H; p++) {
        bytes.set(rgba.subarray(p * 4, p * 4 + 4), p * 5);
        bytes[p * 5 + 4] = materials[p];
      }
      return b64(zlibSync(bytes));
    }
    const expressions = ["neutral", "gentle", "joyful"],
      faces = {};
    for (const [e, expression] of expressions.entries()) {
      const sourceNeck = [285 + e * 475, 448],
        scale = [0.27, 0.27],
        box = [100 + e * 475, 65, 480 + e * 475, 465];
      const rgba = new Uint8ClampedArray(W * H * 4),
        materials = new Uint8Array(W * H);
      let excludedNapePixels = 0;
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const sx = Math.floor(sourceNeck[0] + (x + 0.5 - 96) / scale[0]),
            sy = Math.floor(sourceNeck[1] + (y + 0.5 - 118) / scale[1]);
          if (sx < box[0] || sx >= box[2] || sy < box[1] || sy >= box[3])
            continue;
          const i = (sy * image.width + sx) * 4;
          if (source[i + 3] < 192) continue;
          const rx = sx - e * 475;
          // The source accidentally includes a narrow hair nape behind the ear.
          // This anatomical boundary excludes that area without classifying skin
          // shadows by color or allowing hair to become part of the shared face.
          if (sy >= 375 && sy <= 412 && rx < 215 + (sy - 375) * 1.08) {
            excludedNapePixels++;
            continue;
          }
          const [r, g, b] = source.subarray(i, i + 3),
            p = y * W + x;
          let material = 1;
          const feature =
            (rx >= 250 && rx <= 465 && sy >= 220 && sy <= 343) ||
            (rx >= 330 && rx <= 430 && sy >= 350 && sy <= 404);
          if (r < 62 && g < 53 && b < 48) material = 0;
          if (
            feature &&
            ((r < 180 && g < 125) ||
              (g > r * 0.92 && b > g * 0.87) ||
              (e === 2 && sy > 350 && r > g * 1.5))
          )
            material = 0;
          rgba.set([r, g, b, 255], p * 4);
          materials[p] = material;
        }
      const path = `identities/shared-face/${expression}.png`,
        mask = `identities/shared-face/${expression}.mask.png`;
      await save(path, rgba);
      await save(mask, maskOf(rgba, materials));
      faces[expression] = { rgba, materials };
      metadata.faces.push({
        expression,
        path,
        mask,
        sourceBox: box,
        sourceNeck,
        scale,
        targetNeck: [96, 118],
        excludedNapePixels,
      });
    }
    const hairSpecs = {
      short: {
        sourceBox: [190, 490, 750, 960],
        sourceEar: [350, 850],
        targetEar: [66.57, 83.14],
        scale: [0.235, 0.23],
        crownClearance: { maxY: 4, fade: [14, 65] },
        farOpeningWarp: { maxX: 7, xBand: [112, 144], yBand: [48, 72] },
        name: "Standard kit — tousled crop",
      },
      sweep: {
        sourceBox: [850, 500, 1400, 970],
        sourceEar: [1000, 850],
        targetEar: [66.57, 86.14],
        scale: [0.25, 0.245],
        crownClearance: { maxY: 1, fade: [14, 65] },
        farOpeningWarp: { maxX: 4, xBand: [112, 144], yBand: [48, 72] },
        frontOpeningLift: {
          maxY: 5,
          xBand: [79, 91],
          rightFade: [110, 124],
          yBand: [43, 66],
        },
        name: "Standard kit — side sweep",
      },
    };
    const hairs = {},
      identities = [],
      diagnosticFrames = [];
    for (const [id, spec] of Object.entries(hairSpecs)) {
      const rgba = new Uint8ClampedArray(W * H * 4),
        materials = new Uint8Array(W * H);
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const smooth = (v, a, b) => {
            const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
            return t * t * (3 - 2 * t);
          };
          // The independently generated wig opening is narrower than the shared
          // skull. A smooth local registration warp moves its far temple locks
          // outward; no facial feature pixels are erased or repainted.
          const warp = spec.farOpeningWarp;
          let hairX = x + 0.5,
            hairY = y + 0.5;
          for (let iteration = 0; iteration < 8; iteration++) {
            hairX =
              x +
              0.5 -
              warp.maxX *
                smooth(hairX, ...warp.xBand) *
                smooth(hairY, ...warp.yBand);
            const lift = spec.frontOpeningLift,
              crown = spec.crownClearance;
            hairY =
              y +
              0.5 +
              (lift
                ? lift.maxY *
                  smooth(hairX, ...lift.xBand) *
                  (1 - smooth(hairX, ...lift.rightFade)) *
                  smooth(hairY, ...lift.yBand)
                : 0) -
              crown.maxY * (1 - smooth(hairY, ...crown.fade));
          }
          const sx = Math.floor(
              spec.sourceEar[0] + (hairX - spec.targetEar[0]) / spec.scale[0],
            ),
            sy = Math.floor(
              spec.sourceEar[1] + (hairY - spec.targetEar[1]) / spec.scale[1],
            );
          const box = spec.sourceBox;
          if (sx < box[0] || sx >= box[2] || sy < box[1] || sy >= box[3])
            continue;
          const i = (sy * image.width + sx) * 4;
          if (source[i + 3] < 192) continue;
          const p = y * W + x,
            [r, g, b] = source.subarray(i, i + 3);
          rgba.set([r, g, b, 255], p * 4);
          materials[p] = r < 52 && g < 43 && b < 36 ? 0 : 2;
        }
      hairs[id] = { rgba, materials };
      const path = `identities/${id}/hair.png`,
        mask = `identities/${id}/hair.mask.png`;
      await save(path, rgba);
      await save(mask, maskOf(rgba, materials));
      metadata.hairs.push({ id, path, mask, ...spec, palette });
      const parts = [];
      for (const expression of expressions) {
        const face = faces[expression],
          composite = face.rgba.slice(),
          own = face.materials.slice();
        let sharedFaceRetained = 0,
          coveredFacePixels = 0;
        for (let p = 0; p < W * H; p++) {
          if (rgba[p * 4 + 3]) {
            composite.set(rgba.subarray(p * 4, p * 4 + 4), p * 4);
            own[p] = materials[p];
            if (face.rgba[p * 4 + 3]) coveredFacePixels++;
          } else if (face.rgba[p * 4 + 3]) sharedFaceRetained++;
        }
        const slot = `head-${expression}`;
        await save(`identities/${id}/slots/${slot}.png`, composite);
        await save(
          `identities/${id}/masks/${slot}.png`,
          maskOf(composite, own),
        );
        parts.push({
          slot,
          data: packed(composite, own),
          palette,
          preserveWarmSkin: true,
          sourceLayerId: `standard-kit-${id}:${slot}`,
        });
        checks.push({
          id,
          expression,
          sharedFaceRetained,
          coveredFacePixels,
          compositionExact: true,
        });
      }
      const identity = validateWardrobeIdentity({
        format: "gathria-character-identity",
        version: 1,
        rigId: baseline.rig.id,
        id: `custom-standard-${id}`,
        name: spec.name,
        provenance:
          "OpenAI image generation during development, 2026-10-19. Original shared bald expression heads and separate hair caps: artwork/standard-kit/source/head-hair.png and prompt. Offline registration in scripts/prepare-standard-kit-identities.mjs: immutable shared face per expression, anatomical nape exclusion, separate spatial hair ownership, alpha>=192, nearest-neighbor mapping to neck(96,118), smooth local hair-only face-opening registration, hair-over-face composition. Both hairstyles retain exactly the same exposed face pixels; no runtime generation or new identity format.",
        frame: { width: W, height: H },
        anchor: [96, 240],
        neck: [96, 118],
        jaw: { center: [111, 78], start: 80, scale: 1, length: 1 },
        hairSway: 0,
        palette,
        sourceAppearance: {
          ...baseline.skin.metadata.sourceAppearance,
          name: spec.name,
          skinTone: palette.skin,
          hairColor: palette.hair,
          hairstyle: "crop",
        },
        parts,
      });
      const zip = await exportWardrobeIdentity(identity),
        reopened = await importWardrobeIdentity(zip);
      if (JSON.stringify(identity) !== JSON.stringify(reopened))
        throw Error("Identity roundtrip differs");
      outputs[`identities/${id}.identity.zip`] = Array.from(
        new Uint8Array(await zip.arrayBuffer()),
      );
      identities.push(identity);
      const recipe = {
        ...defaultCustomWardrobeRecipe(identity),
        top: baseline.wardrobe.top,
        bottom: baseline.wardrobe.bottom,
        shoes: baseline.wardrobe.shoes,
        colors: {
          ...baseline.wardrobe.colors,
          skin: palette.skin,
          hair: palette.hair,
        },
      };
      const project = applyWardrobe(
        { ...structuredClone(baseline), wardrobeIdentities: [identity] },
        recipe,
      );
      const renderer = prepareRig(project.rig, project.skin, project.motions);
      const poseBounds = [];
      for (const action of ["idle", "walk", "run", "jump"]) {
        for (
          let key = 0;
          key < project.motions.clips[action].keys.length;
          key++
        ) {
          for (const expression of expressions) {
            const frame = renderer.frame(action, key, expression),
              bounds = [W, H, -1, -1];
            let opaquePixels = 0;
            for (let p = 0; p < W * H; p++) {
              const alpha = frame[p * 4 + 3];
              if (alpha !== 0 && alpha !== 255)
                throw Error("Nonbinary pose alpha");
              if (!alpha) continue;
              opaquePixels++;
              const x = p % W,
                y = Math.floor(p / W);
              bounds[0] = Math.min(bounds[0], x);
              bounds[1] = Math.min(bounds[1], y);
              bounds[2] = Math.max(bounds[2], x);
              bounds[3] = Math.max(bounds[3], y);
            }
            if (
              !opaquePixels ||
              bounds[0] < 1 ||
              bounds[1] < 1 ||
              bounds[2] > W - 2 ||
              bounds[3] > H - 2
            )
              throw Error(
                `${id} ${action} key${key} ${expression} lacks transparent margin: ${JSON.stringify(bounds)}`,
              );
            poseBounds.push({ action, key, expression, bounds, opaquePixels });
          }
        }
      }
      checks.push({
        id,
        actualPoseBoundaryChecks: poseBounds.length,
        minimumTopMargin: Math.min(...poseBounds.map((p) => p.bounds[1])),
        poses: poseBounds,
      });
      for (const expression of expressions) {
        const frame = renderer.frame("idle", 0, expression);
        diagnosticFrames.push(frame);
        await save(`diagnostics/head-${id}-${expression}-actual.png`, frame);
      }
    }
    for (const expression of expressions) {
      const face = faces[expression];
      let commonVisiblePixels = 0;
      const protectedFace = new Uint8ClampedArray(W * H * 4);
      for (let p = 0; p < W * H; p++)
        if (
          face.rgba[p * 4 + 3] &&
          !hairs.short.rgba[p * 4 + 3] &&
          !hairs.sweep.rgba[p * 4 + 3]
        ) {
          commonVisiblePixels++;
          protectedFace.set([255, 255, 255, 255], p * 4);
        }
      const protectedVisibleFace = `identities/shared-face/${expression}.protected.png`;
      await save(protectedVisibleFace, protectedFace);
      checks.push({
        expression,
        sharedFaceInBothHairVariants: true,
        commonVisiblePixels,
        protectedVisibleFace,
      });
    }
    const eyePolygons = [
      [
        [260, 289],
        [278, 278],
        [309, 275],
        [334, 288],
        [338, 307],
        [332, 330],
        [317, 339],
        [287, 339],
        [268, 324],
      ],
      [
        [411, 287],
        [426, 278],
        [441, 280],
        [449, 291],
        [447, 322],
        [437, 337],
        [419, 338],
        [409, 326],
      ],
    ];
    function inside(x, y, polygon) {
      let hit = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [ax, ay] = polygon[i],
          [bx, by] = polygon[j];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
          hit = !hit;
      }
      return hit;
    }
    for (const [id, hair] of Object.entries(hairs)) {
      const overlaps = [],
        protectedEyePixels = [];
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const sx = Math.floor(285 + (x + 0.5 - 96) / 0.27),
            sy = Math.floor(448 + (y + 0.5 - 118) / 0.27);
          if (eyePolygons.some((poly) => inside(sx, sy, poly))) {
            protectedEyePixels.push([x, y]);
            if (hair.rgba[(y * W + x) * 4 + 3]) overlaps.push([x, y]);
          }
        }
      if (overlaps.length)
        throw Error(
          `${id} hair covers protected eyes: ${JSON.stringify(overlaps)}`,
        );
      checks.push({
        id,
        protectedEyes: {
          sourcePolygons: eyePolygons,
          sourceExpression: "neutral",
          sourceNeck: [285, 448],
          scale: [0.27, 0.27],
          targetNeck: [96, 118],
          pixels: protectedEyePixels.length,
          overlapPixels: overlaps.length,
        },
      });
    }
    for (const scale of [1, 2]) {
      const board = document.createElement("canvas");
      board.width = W * 3 * scale;
      board.height = H * 2 * scale;
      const ctx = board.getContext("2d");
      ctx.fillStyle = "#f5efe3";
      ctx.fillRect(0, 0, board.width, board.height);
      ctx.imageSmoothingEnabled = false;
      for (const [i, frame] of diagnosticFrames.entries()) {
        const cell = document.createElement("canvas");
        cell.width = W;
        cell.height = H;
        cell.getContext("2d").putImageData(new ImageData(frame, W, H), 0, 0);
        ctx.drawImage(
          cell,
          (i % 3) * W * scale,
          Math.floor(i / 3) * H * scale,
          W * scale,
          H * scale,
        );
      }
      outputs[`diagnostics/head-assembled-${scale}x.png`] = Array.from(
        from64(board.toDataURL("image/png").split(",")[1]),
      );
    }
    return { outputs, metadata };
  }, inputs);
  for (const [path, data] of Object.entries(result.outputs)) {
    const file = new URL(path, target);
    await mkdir(new URL(".", file), { recursive: true });
    await writeFile(file, new Uint8Array(data));
  }
  for (const record of [...result.metadata.faces, ...result.metadata.hairs])
    for (const key of ["path", "mask"])
      record[key + "Sha256"] = hash(
        await readFile(new URL(record[key], target)),
      );
  await writeFile(
    new URL("head-registration.json", target),
    JSON.stringify(result.metadata, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      outputs: Object.keys(result.outputs).length,
      checks: result.metadata.checks,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
