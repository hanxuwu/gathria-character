/** Offline, source-specific Theo pose study. All visible character geometry is
 * registered from the complete standing master before assigning part ownership.
 * Sources stay immutable; PNG thresholding/sampling happens only in this script. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const output = new URL("artwork/theo-pose-study/prepared/", root);
const inputs = {
  master: "artwork/theo-pose-study/source/complete-pose-model.png",
  helper: "artwork/theo-pose-study/source/hidden-parts-expressions.png",
  baseline: "artwork/reference-pair/prepared/theo.rig.zip",
};
const digest = (b) => createHash("sha256").update(b).digest("hex");
const sources = {};
for (const [name, path] of Object.entries(inputs)) {
  const bytes = await readFile(new URL(path, root));
  sources[name] = {
    path,
    sha256: digest(bytes),
    data: bytes.toString("base64"),
  };
}
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/skin-studio.html`,
  );
  const result = await page.evaluate(
    async ({ sources }) => {
      const { encodeAttachmentPng, importProject, exportProject } =
        await import("/src/skeletal/skin-io.ts");
      const { exportWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { exportWardrobeIdentity } = await import(
        "/src/skeletal/identity-io.ts"
      );
      const { validateWardrobeIdentity, defaultCustomWardrobeRecipe } =
        await import("/src/skeletal/identities.ts");
      const { applyWardrobe } = await import("/src/skeletal/wardrobe.ts");
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
      const from64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const b64 = (bytes) => {
        let s = "";
        for (let i = 0; i < bytes.length; i += 8192)
          s += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(s);
      };
      const blob = async (name, b) =>
        (outputs[name] = Array.from(new Uint8Array(await b.arrayBuffer())));
      const W = 192,
        H = 256,
        outputs = {},
        records = [];
      const decoded = {};
      for (const key of ["master", "helper"]) {
        if (!sources[key]) continue;
        const im = new Image();
        im.src = "data:image/png;base64," + sources[key].data;
        await im.decode();
        const c = document.createElement("canvas");
        c.width = im.width;
        c.height = im.height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(im, 0, 0);
        decoded[key] = {
          width: c.width,
          height: c.height,
          data: ctx.getImageData(0, 0, c.width, c.height).data,
        };
      }
      const scale = 121 / 250,
        neck = [260, 246],
        targetNeck = [96, 118];
      const point = ([x, y]) => [
        Math.round(targetNeck[0] + (x - neck[0]) * scale),
        Math.round(targetNeck[1] + (y - neck[1]) * scale),
      ];
      const inside = (x, y, poly) => {
        let hit = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i],
            [xj, yj] = poly[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            hit = !hit;
        }
        return hit;
      };
      function registered(
        id,
        key,
        box,
        polygon = null,
        sourceNeck = neck,
        s = scale,
      ) {
        const a = decoded[key],
          out = new Uint8ClampedArray(W * H * 4);
        let count = 0;
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const sx = Math.round(sourceNeck[0] + (x - targetNeck[0]) / s),
              sy = Math.round(sourceNeck[1] + (y - targetNeck[1]) / s);
            if (
              sx < box[0] ||
              sx >= box[2] ||
              sy < box[1] ||
              sy >= box[3] ||
              (polygon && !inside(sx + 0.5, sy + 0.5, polygon))
            )
              continue;
            const p = (sy * a.width + sx) * 4;
            if (a.data[p + 3] < 192) continue;
            out.set(a.data.subarray(p, p + 3), (y * W + x) * 4);
            out[(y * W + x) * 4 + 3] = 255;
            count++;
          }
        records.push({
          id,
          source: sources[key].path,
          box,
          polygon,
          sourceNeck,
          scale: s,
          targetNeck,
          threshold: 192,
          pixels: count,
        });
        return out;
      }
      const master = registered("standing-master", "master", [0, 0, 512, 512]);
      outputs["diagnostics/master-native.png"] = Array.from(
        await encodeAttachmentPng(master),
      );
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const context = canvas.getContext("2d");
      const tiny = document.createElement("canvas");
      tiny.width = W;
      tiny.height = H;
      tiny.getContext("2d").putImageData(new ImageData(master, W, H), 0, 0);
      context.imageSmoothingEnabled = false;
      context.drawImage(tiny, 0, 0, W * 2, H * 2);
      outputs["diagnostics/master-2x.png"] = Array.from(
        new Uint8Array(
          await (
            await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
          ).arrayBuffer(),
        ),
      );
      const images = {},
        materials = {};
      const polygons = {
        head: [
          [0, 0],
          [512, 0],
          [512, 219],
          [336, 219],
          [328, 229],
          [313, 238],
          [293, 244],
          [278, 246],
          [275, 251],
          [249, 251],
          [231, 239],
          [207, 239],
          [200, 233],
          [0, 233],
        ],
        torso: [
          [216, 238],
          [232, 233],
          [260, 246],
          [286, 244],
          [310, 245],
          [322, 256],
          [321, 285],
          [325, 331],
          [328, 357],
          [320, 378],
          [296, 375],
          [273, 353],
          [257, 357],
          [244, 372],
          [215, 384],
          [188, 380],
          [190, 349],
          [201, 314],
          [215, 287],
        ],
        hips: [
          [206, 349],
          [313, 349],
          [315, 390],
          [258, 401],
          [207, 391],
        ],
        nearArm: [
          [196, 240],
          [218, 246],
          [215, 283],
          [197, 326],
          [198, 353],
          [204, 373],
          [194, 390],
          [153, 392],
          [142, 377],
          [140, 349],
          [147, 311],
          [157, 280],
          [170, 260],
          [179, 250],
          [186, 245],
        ],
        farArm: [
          [311, 258],
          [325, 264],
          [340, 300],
          [357, 343],
          [356, 351],
          [367, 366],
          [362, 384],
          [349, 392],
          [329, 389],
          [324, 373],
          [324, 354],
          [318, 328],
          [309, 297],
        ],
        nearLeg: [
          [206, 366],
          [262, 366],
          [259, 405],
          [242, 431],
          [235, 463],
          [218, 472],
          [169, 467],
          [171, 444],
          [184, 403],
        ],
        farLeg: [
          [260, 365],
          [316, 367],
          [321, 415],
          [323, 450],
          [326, 465],
          [252, 467],
          [254, 423],
        ],
        "near-shoe": [
          [166, 463],
          [175, 456],
          [191, 452],
          [211, 454],
          [226, 463],
          [236, 478],
          [234, 491],
          [223, 497],
          [158, 497],
          [158, 476],
        ],
        "far-shoe": [
          [254, 461],
          [274, 456],
          [291, 449],
          [304, 454],
          [321, 456],
          [343, 466],
          [351, 475],
          [350, 491],
          [251, 496],
          [251, 475],
        ],
      };
      for (const [id, poly] of Object.entries(polygons))
        images[id] = registered(id, "master", [0, 0, 512, 512], poly);
      const sourceAnchor = (sourcePoint, targetPoint, s) => [
        sourcePoint[0] + (96 - targetPoint[0]) / s,
        sourcePoint[1] + (118 - targetPoint[1]) / s,
      ];
      const helperTorso = registered(
        "hidden-torso",
        "helper",
        [50, 120, 450, 465],
        null,
        sourceAnchor([266, 154], [99, 120], 0.213),
        0.213,
      );
      const hiddenTorso = [
        [68, 127],
        [83, 122],
        [102, 123],
        [127, 128],
        [133, 170],
        [124, 182],
        [71, 181],
        [65, 166],
      ];
      let torsoHiddenPixels = 0,
        misownedHandPixels = 0;
      for (let p = 0; p < W * H; p++) {
        const x = p % W,
          y = Math.floor(p / W),
          [r, g, b, a] = images.torso.subarray(p * 4, p * 4 + 4);
        if (
          a &&
          (inside(x + 0.5, y + 0.5, [
            [61, 169],
            [67, 170],
            [69, 179],
            [64, 188],
          ]) ||
            inside(x + 0.5, y + 0.5, [
              [127, 168],
              [144, 168],
              [147, 176],
              [145, 185],
              [135, 190],
              [128, 187],
            ]))
        ) {
          images.torso.fill(0, p * 4, p * 4 + 4);
          misownedHandPixels++;
        }
        if (
          !images.torso[p * 4 + 3] &&
          inside(x + 0.5, y + 0.5, hiddenTorso) &&
          (x < 83 || x > 123) &&
          y < 173 &&
          helperTorso[p * 4 + 3]
        ) {
          images.torso.set(helperTorso.subarray(p * 4, p * 4 + 4), p * 4);
          torsoHiddenPixels++;
        }
      }
      records.push({
        id: "hidden-torso-ownership",
        targetPolygon: hiddenTorso,
        torsoHiddenPixels,
        misownedHandPixels,
        rule: "Helper contributes only originally occluded torso fill. Visible master pixels retained. Skin hand fringe excluded from coat.",
      });
      const helperPelvis = registered(
        "hidden-pelvis",
        "helper",
        [1150, 270, 1480, 475],
        null,
        sourceAnchor([1320, 340], [96, 178], 0.16),
        0.16,
      );
      let pelvisHiddenPixels = 0;
      for (let p = 0; p < W * H; p++) {
        const x = p % W,
          y = Math.floor(p / W);
        if (
          !images.hips[p * 4 + 3] &&
          y >= 174 &&
          y <= 190 &&
          x >= 76 &&
          x <= 120 &&
          helperPelvis[p * 4 + 3]
        ) {
          images.hips.set(helperPelvis.subarray(p * 4, p * 4 + 4), p * 4);
          pelvisHiddenPixels++;
        }
      }
      records.push({
        id: "hidden-pelvis-ownership",
        bounds: [76, 174, 121, 191],
        pelvisHiddenPixels,
        rule: "Only compact occluded bridge; no generated static shorts silhouette retained.",
      });
      const base = await importProject(
        new Blob([from64(sources.baseline.data)]),
      );
      const chains = {
        nearArm: [
          [190, 269],
          [172, 318],
          [174, 363],
        ],
        farArm: [
          [315, 269],
          [335, 316],
          [341, 365],
        ],
        nearLeg: [
          [239, 379],
          [208, 417],
          [198, 461],
        ],
        farLeg: [
          [274, 379],
          [288, 418],
          [291, 460],
        ],
      };
      const bindings = Object.fromEntries(
        Object.entries(chains).map(([k, v]) => [k, v.map(point)]),
      );
      const half = (a, y0, y1) => {
        const out = a.slice();
        for (let y = 0; y < H; y++)
          if (y < y0 || y > y1) out.fill(0, y * W * 4, (y + 1) * W * 4);
        return out;
      };
      for (const side of ["near", "far"]) {
        const arm = images[side + "Arm"],
          leg = images[side + "Leg"];
        let duplicateCoatPixels = 0;
        for (let p = 0; p < W * H; p++) {
          const y = Math.floor(p / W);
          if (
            y >= 174 &&
            y <= 186 &&
            leg[p * 4 + 3] &&
            images.torso[p * 4 + 3]
          ) {
            if (helperPelvis[p * 4 + 3])
              leg.set(helperPelvis.subarray(p * 4, p * 4 + 4), p * 4);
            else leg.fill(0, p * 4, p * 4 + 4);
            duplicateCoatPixels++;
          }
        }
        records.push({
          id: side + "-thigh-coat-ownership",
          duplicateCoatPixels,
          rule: "Visible coat belongs only to torso. Replace its occluded duplicate in the upper trouser leg with original hidden pelvis cloth or transparency; never swing a second coat hem with the knee.",
        });
        const elbow = bindings[side + "Arm"][1][1],
          knee = bindings[side + "Leg"][1][1];
        images[side + "-upper-arm"] = half(arm, 0, elbow + 5);
        images[side + "-forearm"] = half(arm, elbow - 5, 255);
        images[side + "-thigh"] = half(leg, 0, knee + 5);
        images[side + "-shin"] = half(leg, knee - 5, 255);
        delete images[side + "Arm"];
        delete images[side + "Leg"];
      }
      images["head-gentle"] = images.head.slice();
      images["head-neutral"] = registered(
        "head-neutral",
        "helper",
        [0, 520, 440, 950],
        null,
        [232, 916],
        0.318,
      );
      images["head-joyful"] = registered(
        "head-joyful",
        "helper",
        [440, 520, 850, 950],
        null,
        [639, 916],
        0.318,
      );
      delete images.head;
      // The far master shoe ends two source-sampled pixels above the near sole.
      // Register that attachment two pixels lower before packing, keeping a common
      // authored239px sole and preserving exact source colors through fitShoe.
      const shoe = images["far-shoe"].slice();
      images["far-shoe"].fill(0);
      images["far-shoe"].set(shoe.subarray(0, (H - 2) * W * 4), 2 * W * 4);
      records.push({
        id: "far-shoe-ground-registration",
        translation: [0, 2],
        sole: 239,
        rule: "Two-pixel vertical registration only; no rescaling or repainting.",
      });
      const masterFace = [
        [282, 114],
        [314, 125],
        [330, 151],
        [343, 169],
        [342, 211],
        [323, 230],
        [297, 240],
        [271, 241],
        [273, 252],
        [249, 251],
        [233, 237],
        [221, 236],
        [215, 225],
        [207, 226],
        [187, 222],
        [177, 207],
        [177, 190],
        [186, 177],
        [201, 177],
        [212, 189],
        [221, 198],
        [222, 172],
        [236, 157],
        [260, 146],
      ];
      const helperFace = [
        [305, 724],
        [338, 744],
        [350, 779],
        [359, 817],
        [358, 852],
        [343, 875],
        [310, 886],
        [272, 896],
        [264, 924],
        [232, 924],
        [192, 906],
        [183, 890],
        [186, 873],
        [163, 876],
        [137, 866],
        [120, 845],
        [121, 819],
        [135, 799],
        [153, 798],
        [173, 813],
        [187, 832],
        [189, 801],
        [207, 783],
        [231, 770],
        [265, 756],
      ];
      const faceRegions = {
        gentle: masterFace.map(point),
        neutral: helperFace.map(([x, y]) => [
          96 + (x - 232) * 0.318,
          118 + (y - 916) * 0.318,
        ]),
        joyful: helperFace.map(([x, y]) => [
          96 + (x + 407 - 639) * 0.318,
          118 + (y - 916) * 0.318,
        ]),
      };
      const palette = {
        skin: "#f1bd90",
        hair: "#714b34",
        upper: "#373b4b",
        lower: "#373b4b",
        shoe: "#875934",
      };
      function encodePart(slot, id) {
        const rgba = images[slot],
          packed = new Uint8Array(W * H * 5),
          mask = new Uint8ClampedArray(W * H * 4);
        for (let p = 0; p < W * H; p++) {
          const [r, g, b, a] = rgba.subarray(p * 4, p * 4 + 4);
          if (!a) continue;
          const x = p % W,
            y = Math.floor(p / W);
          let m = slot.startsWith("head")
            ? 2
            : slot.includes("shoe")
              ? 5
              : slot.includes("thigh") ||
                  slot.includes("shin") ||
                  slot === "hips"
                ? 4
                : 3;
          if (slot.startsWith("head")) {
            const face = inside(x + 0.5, y + 0.5, faceRegions[slot.slice(5)]);
            if (face && r > 145 && g > 80 && r > g * 1.12 && g > b * 1.08)
              m = 1;
            if (
              face &&
              y > 72 &&
              ((x > 82 && x < 115) || (x > 124 && x < 143)) &&
              y < 97 &&
              (r < 130 || (g > r * 0.95 && b > g * 0.92))
            )
              m = 0;
            if (face && y > 100 && y < 118 && x > 94 && r > g * 1.5) m = 0;
          } else if (slot.includes("arm")) {
            if (y > 163 && r > g * 1.13 && g > b * 1.1 && r > 90) m = 1;
            if (g > 150 && b > 130 && r < g * 1.1) m = 0;
          } else if (slot === "torso") {
            if (r > g * 1.1 || g > 90) m = 0;
          }
          if (r < 48 && g < 44 && b < 42) m = 0;
          packed.set(rgba.subarray(p * 4, p * 4 + 4), p * 5);
          packed[p * 5 + 4] = m;
          mask[p * 4] = m;
          mask[p * 4 + 3] = 255;
        }
        materials[slot] = mask;
        return {
          slot,
          data: b64(zlibSync(packed)),
          palette: slot.startsWith("head")
            ? { skin: palette.skin, hair: palette.hair }
            : palette,
          preserveWarmSkin: true,
          sourceLayerId: id + ":" + slot,
        };
      }
      const identity = validateWardrobeIdentity({
        format: "gathria-character-identity",
        version: 1,
        rigId: base.rig.id,
        id: "custom-theo-study",
        name: "Theo pose study",
        provenance:
          "Development image-generation complete-pose-model.png, original source identity and unchanged uniform source registration. Study preparation in scripts/prepare-theo-pose-study.mjs. No runtime generation.",
        frame: { width: W, height: H },
        anchor: [96, 240],
        neck: [96, 118],
        jaw: { center: [96, 94], start: 89, scale: 1, length: 1 },
        hairSway: 0,
        palette: { skin: palette.skin, hair: palette.hair },
        sourceAppearance: {
          ...base.skin.metadata.sourceAppearance,
          name: "Theo pose study",
          skinTone: palette.skin,
          hairColor: palette.hair,
        },
        parts: ["neutral", "gentle", "joyful"].map((e) =>
          encodePart("head-" + e, "theo-study"),
        ),
      });
      const items = [];
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
        const item = {
          format: "gathria-wardrobe-item",
          version: 3,
          colorModel: "source-relative-v1",
          rigId: base.rig.id,
          id: "custom-theo-study-" + group,
          name: "Theo study " + group,
          provenance:
            "Visible complete standing master source, uniform registration and explicit original-part polygons. Parts are not independently stretched into old proportions.",
          group,
          parts: slots.map((slot) => encodePart(slot, "theo-study")),
          ...(group === "top"
            ? { chains: { nearArm: bindings.nearArm, farArm: bindings.farArm } }
            : group === "bottom"
              ? {
                  chains: {
                    nearLeg: bindings.nearLeg,
                    farLeg: bindings.farLeg,
                  },
                }
              : {
                  ankles: {
                    near: bindings.nearLeg[2],
                    far: bindings.farLeg[2],
                  },
                }),
        };
        items.push(item);
        await blob(
          "theo-study-" + group + ".wardrobe.zip",
          await exportWardrobeItem(item),
        );
      }
      await blob(
        "theo-study.identity.zip",
        await exportWardrobeIdentity(identity),
      );
      const recipe = {
        ...defaultCustomWardrobeRecipe(identity),
        top: items[0].id,
        bottom: items[1].id,
        shoes: items[2].id,
        colors: {
          skin: palette.skin,
          hair: palette.hair,
          top: palette.upper,
          bottom: palette.lower,
          shoes: palette.shoe,
        },
      };
      const project = applyWardrobe(
        { ...base, wardrobeIdentities: [identity], wardrobeItems: items },
        recipe,
      );
      project.motions = structuredClone(base.motions);
      project.motions.id = "theo-master-study-basic-actions-1";
      for (const k of project.motions.clips.jump.keys)
        k.rootY = Math.max(-2, k.rootY ?? 0);
      const oldRun = structuredClone(project);
      await blob("theo-study-old-run.rig.zip", await exportProject(oldRun));
      const run = project.motions.clips.run,
        footX = [23, 8, -9, -20, -26, -26, -24, -10, 6, 20, 26, 26],
        footLift = [0, 0, 0, 6, 15, 24, 28, 14, 14, 10, 11, 8],
        bodyBob = [5, 7, 5, 2, 0, 3],
        angles = [
          -1.1, -0.8, -0.45, -0.1, 0.25, 0.45, 0.55, 0.25, -0.1, -0.45, -0.8,
          -1.0,
        ];
      run.keys = run.keys.map((key, i) => ({
        ...key,
        footX: footX[i],
        footLift: footLift[i],
        bodyBob: bodyBob[i % 6],
        armAngle: angles[i],
        lean: 0.14,
      }));
      await blob("theo-study.rig.zip", await exportProject(project));
      const oldRenderer = prepareRig(oldRun.rig, oldRun.skin, oldRun.motions);
      for (let i = 0; i < 12; i++)
        outputs[`diagnostics/old-run/run-${i}.png`] = Array.from(
          await encodeAttachmentPng(oldRenderer.frame("run", i, "gentle")),
        );
      for (const [slot, rgba] of Object.entries(images)) {
        outputs["theo-study/slots/" + slot + ".png"] = Array.from(
          await encodeAttachmentPng(rgba),
        );
        outputs["theo-study/masks/" + slot + ".png"] = Array.from(
          await encodeAttachmentPng(materials[slot]),
        );
      }
      const renderer = prepareRig(project.rig, project.skin, project.motions);
      for (const action of ["idle", "walk", "run", "jump"])
        for (let i = 0; i < project.motions.clips[action].keys.length; i++)
          outputs[`diagnostics/assembled/${action}-${i}.png`] = Array.from(
            await encodeAttachmentPng(renderer.frame(action, i, "gentle")),
          );
      const checks = [];
      for (const e of ["neutral", "gentle", "joyful"]) {
        outputs["diagnostics/expressions/" + e + ".png"] = Array.from(
          await encodeAttachmentPng(renderer.frame("idle", 0, e)),
        );
        for (const action of ["idle", "walk", "run", "jump"])
          for (let i = 0; i < project.motions.clips[action].keys.length; i++) {
            const rgba = renderer.frame(action, i, e);
            let left = W,
              top = H,
              right = -1,
              bottom = -1;
            for (let p = 0; p < W * H; p++)
              if (rgba[p * 4 + 3]) {
                left = Math.min(left, p % W);
                right = Math.max(right, p % W);
                top = Math.min(top, Math.floor(p / W));
                bottom = Math.max(bottom, Math.floor(p / W));
              }
            checks.push({
              expression: e,
              action,
              key: i,
              bounds: [left, top, right + 1, bottom + 1],
            });
            if (left === 0 || top === 0 || right === W - 1 || bottom === H - 1)
              throw Error(
                `Frame boundary ${e}/${action}/${i}: ${left},${top},${right},${bottom}`,
              );
          }
      }
      const recolored = applyWardrobe(project, {
        ...recipe,
        colors: {
          ...recipe.colors,
          skin: "#8d5a43",
          hair: "#c6ae73",
          top: "#46796c",
          bottom: "#68604f",
          shoes: "#624534",
        },
      });
      const rr = prepareRig(recolored.rig, recolored.skin, recolored.motions);
      for (const e of ["neutral", "gentle", "joyful"])
        outputs["diagnostics/expressions/recolor-" + e + ".png"] = Array.from(
          await encodeAttachmentPng(rr.frame("idle", 0, e)),
        );
      for (const [slot, rgba] of Object.entries(images)) {
        const actual = project.skin.images[slot];
        let changed = 0;
        for (let p = 0; p < rgba.length; p++)
          if (rgba[p] !== actual[p]) changed++;
        checks.push({ slot, sourceChannelDifferences: changed });
      }

      const originalHips = structuredClone(project);
      originalHips.skin.metadata.bindings.chains.nearLeg[0] = [78, 182];
      originalHips.skin.metadata.bindings.chains.farLeg[0] = [111, 182];
      const originalHipRenderer = prepareRig(
        originalHips.rig,
        originalHips.skin,
        originalHips.motions,
      );
      const beforeStanding = originalHipRenderer.frame("idle", 0, "gentle"),
        afterStanding = renderer.frame("idle", 0, "gentle");
      let standingDifferences = 0;
      for (let i = 0; i < beforeStanding.length; i++)
        standingDifferences += +(beforeStanding[i] !== afterStanding[i]);
      if (standingDifferences)
        throw Error(
          "Hip annotation changed standing pixels " + standingDifferences,
        );
      checks.push({
        hipAnnotationRestRgbaDifferences: standingDifferences,
        priorHipPoints: [
          [78, 182],
          [111, 182],
        ],
        newHipPoints: [bindings.nearLeg[0], bindings.farLeg[0]],
      });
      for (const e of ["neutral", "gentle", "joyful"]) {
        const mask = materials["head-" + e];
        let minSkinY = 256,
          skin = 0;
        for (let p = 0; p < W * H; p++)
          if (mask[p * 4 + 3] && mask[p * 4] === 1) {
            minSkinY = Math.min(minSkinY, Math.floor(p / W));
            skin++;
          }
        if (minSkinY < 50)
          throw Error("Head hair assigned to skin " + e + " " + minSkinY);
        checks.push({ expression: e, skinMaskTop: minSkinY, skinPixels: skin });
      }
      async function sheet(name, frames, cols = 6, zoom = 1) {
        const c = document.createElement("canvas");
        c.width = cols * W * zoom;
        c.height = Math.ceil(frames.length / cols) * (H + 20) * zoom;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#f5efe3";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.imageSmoothingEnabled = false;
        ctx.font = `${12 * zoom}px sans-serif`;
        ctx.fillStyle = "#514a42";
        for (let i = 0; i < frames.length; i++) {
          const t = document.createElement("canvas");
          t.width = W;
          t.height = H;
          t.getContext("2d").putImageData(
            new ImageData(frames[i].rgba, W, H),
            0,
            0,
          );
          const x = (i % cols) * W * zoom,
            y = Math.floor(i / cols) * (H + 20) * zoom;
          ctx.fillText(frames[i].label, x + 8 * zoom, y + 15 * zoom);
          ctx.drawImage(t, x, y + 20 * zoom, W * zoom, H * zoom);
        }
        outputs[name] = Array.from(
          new Uint8Array(
            await (
              await new Promise((resolve) => c.toBlob(resolve, "image/png"))
            ).arrayBuffer(),
          ),
        );
      }
      const runFrames = Array.from({ length: 12 }, (_, i) => ({
        label: "Run " + (i + 1),
        rgba: renderer.frame("run", i, "gentle"),
      }));
      await sheet("diagnostics/run-keyframes.png", runFrames);
      await sheet("diagnostics/run-keyframes-2x.png", runFrames, 6, 2);
      await sheet(
        "diagnostics/master-standing-comparison.png",
        [
          { label: "Whole source master", rgba: master },
          { label: "Actual assembled gentle", rgba: afterStanding },
        ],
        2,
        2,
      );
      return {
        outputs,
        records,
        checks,
        faceRegions,
        bindings,
        motionStudy: project.motions,
        sourceRegistration: {
          scale,
          neck,
          targetNeck,
          sole: point([200, 496]),
          masterBounds: [113, 11, 390, 497],
        },
      };
    },
    { sources },
  );
  await mkdir(output, { recursive: true });
  for (const [file, bytes] of Object.entries(result.outputs)) {
    const p = new URL(file, output);
    await mkdir(new URL("./", p), { recursive: true });
    await writeFile(p, new Uint8Array(bytes));
  }
  await writeFile(
    new URL("registration.json", output),
    JSON.stringify(
      {
        sources: Object.fromEntries(
          Object.entries(sources).map(([k, v]) => [
            k,
            { path: v.path, sha256: v.sha256 },
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(result).filter(([k]) => k !== "outputs"),
        ),
        files: Object.fromEntries(
          Object.entries(result.outputs).map(([k, v]) => [
            k,
            digest(new Uint8Array(v)),
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      files: Object.keys(result.outputs).length,
      registration: result.sourceRegistration,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
