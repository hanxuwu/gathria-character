/** Offline registration of newly generated art. No runtime API/model calls.
 * Deliberate part regions, binary alpha and nearest pixel sampling; this is not
 * an automatic illustration splitter. Raw model outputs are retained intact. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const phase = process.env.PREPARE_PHASE || "final";
if (!["phase-1", "final"].includes(phase))
  throw Error("Unknown preparation phase");
const out = new URL("artwork/generated-traveler/prepared/", root);
await mkdir(out, { recursive: true });
const sources = {};
for (const file of [
  "maple-sheet.png",
  "torso-backplate-draft.png",
  "torso-backplate.png",
]) {
  const b = await readFile(
    new URL("artwork/generated-traveler/source/" + file, root),
  );
  sources[file] = {
    data: b.toString("base64"),
    sha256: createHash("sha256").update(b).digest("hex"),
  };
}
const server = await createServer({
  server: { host: "127.0.0.1", port: 5191, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5191/skin-studio.html");
  const result = await page.evaluate(
    async ({ sources, phase }) => {
      const { exportSkinPack, exportProject, encodeAttachmentPng } =
        await import("/src/skeletal/skin-io.ts");
      const { createAuthoringProject } = await import(
        "/src/skeletal/builtins.ts"
      );
      const { exportWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
      const W = 192,
        H = 256,
        images = {},
        stats = [],
        decoded = {};
      for (const [file, src] of Object.entries(sources)) {
        const im = new Image();
        im.src = "data:image/png;base64," + src.data;
        await im.decode();
        const c = document.createElement("canvas");
        c.width = im.width;
        c.height = im.height;
        c.getContext("2d").drawImage(im, 0, 0);
        decoded[file] = {
          width: c.width,
          height: c.height,
          data: c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
        };
      }
      // Regions are deliberately measured from the retained 1254x1254 model sheet.
      const regions = {
        "head-neutral": [305, 110, 630, 432],
        "head-gentle": [631, 110, 943, 432],
        "head-joyful": [944, 110, 1254, 432],
        torso: [25, 594, 307, 873],
        nearArm: [382, 584, 552, 902],
        farArm: [724, 584, 891, 903],
        hips: [965, 632, 1245, 868],
        nearLeg: [45, 902, 240, 1237],
        farLeg: [422, 908, 570, 1235],
        "near-shoe": [652, 1019, 928, 1230],
        "far-shoe": [1003, 1035, 1245, 1230],
      };
      function cut(id, box, target, file = "maple-sheet.png") {
        const source = decoded[file],
          [x0, y0, x1, y1] = box,
          ww = x1 - x0,
          hh = y1 - y0;
        const mask = new Uint8Array(ww * hh);
        let partial = 0;
        for (let y = 0; y < hh; y++)
          for (let x = 0; x < ww; x++) {
            const a = source.data[((y + y0) * source.width + x + x0) * 4 + 3];
            mask[y * ww + x] = a >= 192 ? 1 : 0;
            if (a > 0 && a < 255) partial++;
          }
        // Largest connected object within EACH named part region, never across a whole character.
        const seen = new Uint8Array(mask.length);
        let largest = [];
        for (let p = 0; p < mask.length; p++)
          if (mask[p] && !seen[p]) {
            const group = [p];
            seen[p] = 1;
            for (let n = 0; n < group.length; n++) {
              const a = group[n],
                x = a % ww,
                y = Math.floor(a / ww);
              for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ]) {
                const xx = x + dx,
                  yy = y + dy,
                  j = yy * ww + xx;
                if (
                  xx >= 0 &&
                  xx < ww &&
                  yy >= 0 &&
                  yy < hh &&
                  mask[j] &&
                  !seen[j]
                ) {
                  seen[j] = 1;
                  group.push(j);
                }
              }
            }
            if (group.length > largest.length) largest = group;
          }
        const owned = new Set(largest);
        let l = ww,
          t = hh,
          r = 0,
          b = 0;
        for (const p of largest) {
          l = Math.min(l, p % ww);
          r = Math.max(r, p % ww);
          t = Math.min(t, Math.floor(p / ww));
          b = Math.max(b, Math.floor(p / ww));
        }
        const pixels = new Uint8ClampedArray(W * H * 4),
          [tx, ty, tw, th] = target;
        for (let y = 0; y < th; y++)
          for (let x = 0; x < tw; x++) {
            const sx = l + Math.floor(((x + 0.5) * (r - l + 1)) / tw),
              sy = t + Math.floor(((y + 0.5) * (b - t + 1)) / th);
            if (!owned.has(sy * ww + sx)) continue;
            const si = ((sy + y0) * source.width + sx + x0) * 4,
              p = ((y + ty) * W + x + tx) * 4;
            pixels.set(source.data.subarray(si, si + 3), p);
            pixels[p + 3] = 255;
          }
        stats.push({
          id,
          file,
          region: box,
          sourceBounds: [x0 + l, y0 + t, x0 + r + 1, y0 + b + 1],
          target,
          alphaThreshold: 192,
          partialSourcePixels: partial,
        });
        return pixels;
      }
      images["head-neutral"] = cut(
        "head-neutral",
        regions["head-neutral"],
        [42, 9, 118, 111],
      );
      images["head-gentle"] = cut(
        "head-gentle",
        regions["head-gentle"],
        [42, 9, 118, 111],
      );
      images["head-joyful"] = cut(
        "head-joyful",
        regions["head-joyful"],
        [42, 9, 118, 111],
      );
      images.torso =
        phase === "phase-1"
          ? cut("torso", regions.torso, [65, 113, 68, 62])
          : cut(
              "torso",
              [0, 0, 1349, 1166],
              [72, 112, 59, 63],
              "torso-backplate.png",
            );
      images.hips = cut(
        "hips",
        regions.hips,
        phase === "phase-1" ? [70, 165, 52, 25] : [75, 165, 47, 25],
      );
      // The model's pelvis tile contains short trouser legs. They belong to the
      // moving thighs, not the rigid waistband. Keep only the waist/crotch bridge;
      // overlap is covered by the complete leg source, never by a colored patch.
      if (phase === "final")
        for (let y = 176; y < H; y++)
          for (let x = 0; x < W; x++) {
            // Retain a tapered crotch bridge, not the tile's two rigid shorts cuffs.
            if (y > 183 || x < 85 + (y - 176) || x > 113 - (y - 176))
              images.hips.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
          }
      const arms = {
        near: cut("nearArm", regions.nearArm, [56, 114, 29, 69]),
        far: cut("farArm", regions.farArm, [118, 115, 25, 68]),
      };
      const legs = {
        near: cut("nearLeg", regions.nearLeg, [64, 167, 34, 65]),
        far: cut("farLeg", regions.farLeg, [97, 167, 27, 65]),
      };
      // Open tube rims are model-sheet presentation, not exterior leg contours.
      // Remove the five rows above the hip; the pelvis supplies that hidden area.
      if (phase === "final")
        for (const pixels of Object.values(legs))
          pixels.fill(0, 0, 172 * W * 4);
      function half(pixels, y0, y1) {
        const a = pixels.slice();
        for (let y = 0; y < H; y++)
          if (y < y0 || y > y1) a.fill(0, y * W * 4, (y + 1) * W * 4);
        return a;
      }
      for (const side of ["near", "far"]) {
        images[side + "-upper-arm"] = half(arms[side], 0, 154);
        images[side + "-forearm"] = half(arms[side], 146, 255);
        images[side + "-thigh"] = half(legs[side], 0, 202);
        images[side + "-shin"] = half(legs[side], 194, 255);
      }
      images["near-shoe"] = cut(
        "near-shoe",
        regions["near-shoe"],
        [61, 218, 31, 22],
      );
      images["far-shoe"] = cut(
        "far-shoe",
        regions["far-shoe"],
        [99, 219, 29, 21],
      );
      const project = createAuthoringProject();
      project.skin = {
        metadata: {
          ...project.skin.metadata,
          id: "maple-traveler-" + phase,
          name: "Maple traveler",
          slots: Object.keys(images),
          provenance:
            "Original Maple character and isolated parts created with OpenAI image generation during development, 2026-10-17. Technical registration: scripts/prepare-generated-traveler.mjs; source artwork/prompts retained at artwork/generated-traveler/source. Phase " +
            phase +
            ". Shared project-owned skeleton/motions; no Spine/runtime model calls. See docs/GENERATED_CHARACTER_REVIEW.md. SourceAppearance is only legacy playback metadata, not this identity.",
          bindings: {
            chains: {
              nearArm: [
                [77, 122],
                [67, 150],
                [65, 172],
              ],
              farArm: [
                [126, 123],
                [131, 150],
                [136, 172],
              ],
              nearLeg: [
                [86, 172],
                [79, 198],
                [74, 227],
              ],
              farLeg: [
                [110, 172],
                [110, 198],
                [110, 227],
              ],
            },
            offsets: {},
            mesh: { blendRadius: 6, volume: 0.65, preserveAnkleOverlap: true },
            jaw: { center: [114, 98], start: 91, scale: 1, length: 1 },
            hairSway: 0,
            garmentSway: 0,
          },
        },
        images,
      };
      project.preview = {
        animation: "run",
        facing: "right",
        expression: "neutral",
      };
      const outputs = {};
      const materialPolygons = {
        nearHand: [
          [53, 184],
          [53, 168],
          [60, 163],
          [63, 159],
          [69, 160],
          [71, 164],
          [78, 168],
          [78, 184],
        ],
        farHand: [
          [124, 185],
          [124, 168],
          [130, 164],
          [133, 162],
          [137, 161],
          [141, 163],
          [148, 169],
          [148, 185],
        ],
        nearCuff: [
          [57, 152],
          [62, 150],
          [68, 150],
          [74, 153],
          [75, 164],
          [69, 164],
          [63, 162],
          [56, 165],
        ],
        farCuff: [
          [123, 158],
          [128, 156],
          [133, 154],
          [140, 155],
          [143, 165],
          [136, 166],
          [127, 168],
        ],
      };
      function inside(x, y, points) {
        let hit = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i],
            [xj, yj] = points[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            hit = !hit;
        }
        return hit;
      }
      async function blob(name, b) {
        outputs[name] = Array.from(new Uint8Array(await b.arrayBuffer()));
      }
      for (const [slot, rgba] of Object.entries(images))
        outputs["slots/" + slot + ".png"] = Array.from(
          await encodeAttachmentPng(rgba),
        );
      await blob("traveler.skin.zip", await exportSkinPack(project.skin));
      await blob("traveler.rig.zip", await exportProject(project));
      for (const group of ["top", "bottom", "shoes"]) {
        const slots =
          group === "top"
            ? [
                "torso",
                "near-upper-arm",
                "near-forearm",
                "far-upper-arm",
                "far-forearm",
              ]
            : group === "bottom"
              ? ["hips", "near-thigh", "near-shin", "far-thigh", "far-shin"]
              : ["near-shoe", "far-shoe"];
        const parts = slots.map((slot) => {
          const rgba = images[slot],
            data = new Uint8Array(W * H * 5);
          for (let p = 0; p < W * H; p++) {
            const i = p * 4,
              j = p * 5;
            if (!rgba[i + 3]) continue;
            data.set(rgba.subarray(i, i + 4), j);
            const [r, g, b] = rgba.subarray(i, i + 3),
              y = Math.floor(p / W),
              x = p % W;
            let material = group === "top" ? 3 : group === "bottom" ? 4 : 5;
            // Offline source-specific masks: cuffs and hem fixed; hands below measured cuff boundary.
            if (group === "top") {
              if (
                phase === "final" &&
                slot.includes("forearm") &&
                inside(
                  x,
                  y,
                  materialPolygons[
                    slot.startsWith("near") ? "nearHand" : "farHand"
                  ],
                )
              )
                material = 1;
              else if (
                phase === "final" &&
                slot.includes("forearm") &&
                inside(
                  x,
                  y,
                  materialPolygons[
                    slot.startsWith("near") ? "nearCuff" : "farCuff"
                  ],
                )
              )
                // The bounded cuff polygon includes the orange fold just above
                // the ribbing. Keep that source cloth in the recolorable sleeve;
                // cream trim/shadows remain fixed. This does not remove pixels.
                material = r > 100 && r > g * 1.45 && g > b * 1.15 ? 3 : 0;
              else if (
                phase === "phase-1" &&
                slot.includes("forearm") &&
                y >= 168
              )
                material = 1;
              else if (r > g * 1.03 && g > b * 1.12 && g > 155 && b > 90)
                material = 0;
              if (
                phase === "phase-1" &&
                slot === "torso" &&
                y < 119 &&
                r > g * 1.1 &&
                g > b * 1.1 &&
                r > 140
              )
                material = 1;
            }
            data[j + 4] = material;
          }
          let binary = "";
          const packed = zlibSync(data);
          for (let i = 0; i < packed.length; i += 8192)
            binary += String.fromCharCode(...packed.subarray(i, i + 8192));
          return {
            slot,
            data: btoa(binary),
            palette: {
              skin: "#F2BE93",
              upper: "#C66632",
              lower: "#3E5B5C",
              shoe: "#875134",
            },
            preserveWarmSkin: false,
            sourceLayerId: "generated-maple:" + slot,
          };
        });
        const base = {
          format: "gathria-wardrobe-item",
          version: 1,
          rigId: project.rig.id,
          id: "custom-maple-" + group,
          name:
            "Maple " +
            {
              top: "knit sweater",
              bottom: "teal trousers",
              shoes: "leather boots",
            }[group],
          provenance: project.skin.metadata.provenance,
          group,
          parts,
        };
        const c = project.skin.metadata.bindings.chains;
        const item =
          group === "top"
            ? { ...base, chains: { nearArm: c.nearArm, farArm: c.farArm } }
            : group === "bottom"
              ? { ...base, chains: { nearLeg: c.nearLeg, farLeg: c.farLeg } }
              : { ...base, ankles: { near: c.nearLeg[2], far: c.farLeg[2] } };
        await blob(
          "traveler-" + group + ".wardrobe.zip",
          await exportWardrobeItem(item),
        );
      }
      // Technical renderer checks are supplementary. Review evidence is captured via UI exports.
      const renderer = prepareRig(project.rig, project.skin, project.motions);
      for (const action of ["idle", "walk", "run", "jump"])
        for (let k = 0; k < project.motions.clips[action].keys.length; k++) {
          const rgba = renderer.frame(action, k, "neutral");
          outputs["diagnostics/" + action + "-" + k + ".png"] = Array.from(
            await encodeAttachmentPng(rgba),
          );
        }
      return {
        outputs,
        stats,
        materialPolygons,
        metadata: project.skin.metadata,
      };
    },
    { sources, phase },
  );
  for (const [file, bytes] of Object.entries(result.outputs)) {
    const path = new URL(file, out);
    await mkdir(new URL("./", path), { recursive: true });
    await writeFile(path, new Uint8Array(bytes));
  }
  const record = {
    phase,
    sources: Object.fromEntries(
      Object.entries(sources).map(([f, v]) => [f, v.sha256]),
    ),
    parts: result.stats,
    materialPolygons: result.materialPolygons,
    metadata: result.metadata,
  };
  await writeFile(
    new URL("registration.json", out),
    JSON.stringify(record, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      phase,
      files: Object.keys(result.outputs).length,
      sourceHashes: record.sources,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
