/** Offline, source-specific registration. No model or color-classification calls
 * occur at runtime: portable identities/items contain authored RGBA + masks. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const output = new URL("artwork/reference-pair/prepared/", root);
const inputs = {
  design: "artwork/reference-pair/source/pair-design.png",
  theoClothing: "artwork/reference-pair/source/theo-clothing.png",
  roseClothing: "artwork/reference-pair/source/rose-clothing.png",
  maple: "artwork/maple-action-poses/prepared/traveler.rig.zip",
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
      const { importProject, exportProject, encodeAttachmentPng } =
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
      const W = 192,
        H = 256,
        stats = [],
        outputs = {},
        materialRecords = {};
      const from64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const b64 = (bytes) => {
        let s = "";
        for (let i = 0; i < bytes.length; i += 8192)
          s += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(s);
      };
      const sha = async (b) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
          (n) => n.toString(16).padStart(2, "0"),
        ).join("");
      const blob = async (name, b) =>
        (outputs[name] = Array.from(new Uint8Array(await b.arrayBuffer())));
      const decoded = {};
      for (const key of ["design", "theoClothing", "roseClothing"]) {
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
      function cut(id, key, box, target) {
        const source = decoded[key],
          [x0, y0, x1, y1] = box,
          ww = x1 - x0,
          hh = y1 - y0;
        const mask = new Uint8Array(ww * hh),
          seen = new Uint8Array(ww * hh);
        let partial = 0,
          foreground = 0,
          largest = [];
        for (let y = 0; y < hh; y++)
          for (let x = 0; x < ww; x++) {
            let a = source.data[((y + y0) * source.width + x + x0) * 4 + 3];
            mask[y * ww + x] = +(a >= 192);
            foreground += mask[y * ww + x];
            partial += +(a > 0 && a < 255);
          }
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
        if (largest.length < 1000)
          throw Error("Missing source component " + id);
        const owned = new Uint8Array(mask.length);
        let l = ww,
          t = hh,
          r = 0,
          b = 0;
        for (const p of largest) {
          owned[p] = 1;
          l = Math.min(l, p % ww);
          r = Math.max(r, p % ww);
          t = Math.min(t, Math.floor(p / ww));
          b = Math.max(b, Math.floor(p / ww));
        }
        const resolvedTarget =
          typeof target === "function"
            ? target([x0 + l, y0 + t, x0 + r + 1, y0 + b + 1])
            : target;
        const rgba = new Uint8ClampedArray(W * H * 4),
          [tx, ty, tw, th] = resolvedTarget;
        for (let y = 0; y < th; y++)
          for (let x = 0; x < tw; x++) {
            const sx = l + Math.floor(((x + 0.5) * (r - l + 1)) / tw),
              sy = t + Math.floor(((y + 0.5) * (b - t + 1)) / th);
            if (!owned[sy * ww + sx]) continue;
            const si = ((sy + y0) * source.width + sx + x0) * 4,
              p = ((y + ty) * W + x + tx) * 4;
            rgba.set(source.data.subarray(si, si + 3), p);
            rgba[p + 3] = 255;
          }
        stats.push({
          id,
          source: sources[key].path,
          region: box,
          sourceBounds: [x0 + l, y0 + t, x0 + r + 1, y0 + b + 1],
          target: resolvedTarget,
          alphaThreshold: 192,
          partialSourcePixels: partial,
          foregroundPixels: foreground,
          retainedComponentPixels: largest.length,
        });
        return rgba;
      }
      function half(pixels, y0, y1) {
        const a = pixels.slice();
        for (let y = 0; y < H; y++)
          if (y < y0 || y > y1) a.fill(0, y * W * 4, (y + 1) * W * 4);
        return a;
      }
      function inside(x, y, points) {
        let hit = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          let [xi, yi] = points[i],
            [xj, yj] = points[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            hit = !hit;
        }
        return hit;
      }
      const expressions = ["neutral", "gentle", "joyful"];
      const people = {
        theo: {
          name: "Theo",
          palette: {
            skin: "#f3bd92",
            hair: "#67422e",
            upper: "#343b4b",
            lower: "#343b4b",
            shoe: "#795435",
          },
          necks: [
            [674, 374],
            [1112, 374],
            [1554, 374],
          ],
          boxes: [
            [450, 50, 900, 440],
            [900, 50, 1340, 440],
            [1340, 50, 1774, 440],
          ],
          images: {},
        },
        rose: {
          name: "Rose",
          palette: {
            skin: "#f6c49d",
            hair: "#6a442f",
            upper: "#c8786b",
            lower: "#c8786b",
            shoe: "#8b5937",
          },
          necks: [
            [674, 764],
            [1114, 764],
            [1554, 764],
          ],
          boxes: [
            [450, 450, 900, 887],
            [900, 450, 1340, 887],
            [1340, 450, 1774, 887],
          ],
          images: {},
        },
      };
      for (const [id, person] of Object.entries(people)) {
        for (const [index, expression] of expressions.entries()) {
          const slot = "head-" + expression,
            [nx, ny] = person.necks[index];
          person.images[slot] = cut(
            id + ":" + slot,
            "design",
            person.boxes[index],
            ([l, t, r, b]) => [
              Math.round(96 + (l - nx) * 0.4),
              Math.round(118 + (t - ny) * 0.4),
              Math.round((r - l) * 0.4),
              Math.round((b - t) * 0.4),
            ],
          );
          outputs[`${id}/slots/${slot}.png`] = Array.from(
            await encodeAttachmentPng(person.images[slot]),
          );
        }
      }
      const maple = await importProject(new Blob([from64(sources.maple.data)]));
      const c = maple.skin.metadata.bindings.chains;
      function flip(rgba, left, right) {
        const out = new Uint8ClampedArray(rgba.length);
        for (let y = 0; y < H; y++)
          for (let x = left; x <= right; x++)
            out.set(
              rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 4),
              (y * W + left + right - x) * 4,
            );
        return out;
      }
      function eraseWhere(rgba, predicate) {
        for (let p = 0; p < W * H; p++)
          if (
            predicate(p % W, Math.floor(p / W), rgba.subarray(p * 4, p * 4 + 4))
          )
            rgba.fill(0, p * 4, p * 4 + 4);
        return rgba;
      }
      function packedPart(
        slot,
        rgba,
        materials,
        palette,
        id,
        preserveWarmSkin = false,
      ) {
        const data = new Uint8Array(W * H * 5),
          mask = new Uint8ClampedArray(W * H * 4);
        for (let p = 0; p < W * H; p++) {
          if (!rgba[p * 4 + 3]) continue;
          data.set(rgba.subarray(p * 4, p * 4 + 4), p * 5);
          data[p * 5 + 4] = materials[p];
          mask[p * 4] = materials[p];
          mask[p * 4 + 3] = 255;
        }
        materialRecords[id + ":" + slot] = {
          counts: Array.from({ length: 6 }, (_, m) =>
            materials.reduce(
              (n, v, p) => n + (rgba[p * 4 + 3] && v === m ? 1 : 0),
              0,
            ),
          ),
        };
        return {
          part: {
            slot,
            data: b64(zlibSync(data)),
            palette,
            preserveWarmSkin,
            sourceLayerId: id + ":" + slot,
          },
          mask,
        };
      }
      function limbSplit(person, arms, legs, knee = 198) {
        for (const side of ["near", "far"]) {
          person.images[side + "-upper-arm"] = half(arms[side], 0, 154);
          person.images[side + "-forearm"] = half(arms[side], 146, 255);
          person.images[side + "-thigh"] = half(legs[side], 0, knee + 4);
          person.images[side + "-shin"] = half(legs[side], knee - 4, 255);
        }
      }
      // Theo: the generated vest plate contains a little static trouser fill beneath
      // its center. Remove only that ownership and keep both original coat tails.
      const theo = people.theo,
        ti = theo.images;
      ti.torso = cut(
        "theo:torso",
        "theoClothing",
        [50, 60, 445, 475],
        [72, 112, 59, 65],
      );
      eraseWhere(
        ti.torso,
        (x, y) =>
          (y >= 163 && x >= 98 && x <= 119) || (y > 172 && x >= 94 && x <= 123),
      );
      ti.hips = cut(
        "theo:hips",
        "theoClothing",
        [70, 580, 440, 835],
        [75, 159, 47, 31],
      );
      eraseWhere(
        ti.hips,
        (x, y) =>
          y >= 176 && (y > 183 || x < 85 + y - 176 || x > 113 - y + 176),
      );
      const ta = {
        near: flip(
          cut(
            "theo:nearArm",
            "theoClothing",
            [500, 65, 810, 490],
            [56, 114, 29, 69],
          ),
          56,
          84,
        ),
        far: cut(
          "theo:farArm",
          "theoClothing",
          [930, 70, 1175, 490],
          [118, 115, 25, 68],
        ),
      };
      const tl = {
        near: cut(
          "theo:nearLeg",
          "theoClothing",
          [530, 500, 800, 930],
          [64, 167, 34, 65],
        ),
        far: cut(
          "theo:farLeg",
          "theoClothing",
          [930, 500, 1155, 930],
          [97, 167, 27, 65],
        ),
      };
      for (const a of Object.values(tl)) a.fill(0, 0, 172 * W * 4);
      limbSplit(theo, ta, tl);
      ti["near-shoe"] = cut(
        "theo:near-shoe",
        "theoClothing",
        [25, 1000, 280, 1210],
        [61, 218, 31, 22],
      );
      ti["far-shoe"] = cut(
        "theo:far-shoe",
        "theoClothing",
        [280, 1000, 485, 1210],
        [99, 219, 29, 21],
      );
      theo.legChains = { nearLeg: c.nearLeg, farLeg: c.farLeg };
      // ROSE_SOURCE_REGISTRATION
      const rose = people.rose,
        ri = rose.images;
      ri.torso = cut(
        "rose:torso",
        "roseClothing",
        [60, 45, 365, 365],
        [72, 112, 59, 66],
      );
      // The generated bodice has a scoop opening below the registered head.
      // A top-owned upper-chest allowance sits behind its unchanged cream rim.
      // Sample only the original neutral neck's skin ramp; do not lengthen or
      // repaint any head, move the neckline, or alter a visible clothing pixel.
      const collarOpening = [
        [88, 112],
        [110, 112],
        [112, 119],
        [110, 123],
        [101, 124],
        [94, 121],
        [90, 117],
      ];
      const collarSkin = new Uint8Array(W * H);
      const torsoBeforeCollar = ri.torso.slice();
      let collarSkinPixels = 0;
      for (let y = 112; y <= 123; y++)
        for (let x = 88; x <= 112; x++) {
          const p = y * W + x;
          if (ri.torso[p * 4 + 3] || !inside(x + 0.5, y + 0.5, collarOpening))
            continue;
          const sx = 94 + Math.floor(((x - 88) * 11) / 24),
            sy = Math.min(116, 114 + Math.floor((y - 112) / 4));
          const si = (sy * W + sx) * 4,
            sample = ri["head-neutral"].subarray(si, si + 4);
          if (sample[3] !== 255 || sample[0] < 200 || sample[1] < 130)
            throw Error("Collar allowance sampled outside authored neck skin");
          ri.torso.set(sample, p * 4);
          collarSkin[p] = 1;
          collarSkinPixels++;
        }
      stats.push({
        id: "rose:collar-skin-allowance",
        source: sources.design.path,
        sourceHead: "rose/head-neutral",
        registeredSourceRegion: [94, 114, 106, 117],
        targetPolygon: collarOpening,
        pixels: collarSkinPixels,
        material: 1,
        ownership:
          "top torso exposed upper chest behind the original cream scoop rim; head and neckline unchanged",
      });
      // The torso owns the single visible cream waist band. Its peplum is not a
      // second skirt layer: the independent garment provides all cloth below it.
      eraseWhere(ri.torso, (x, y) => y >= 164);
      ri.hips = cut(
        "rose:hips",
        "roseClothing",
        [20, 460, 300, 650],
        [82, 158, 37, 18],
      );
      ri.garment = cut(
        "rose:garment",
        "roseClothing",
        [295, 370, 765, 730],
        [56, 159, 96, 47],
      );
      const ra = {
        near: cut(
          "rose:nearArm",
          "roseClothing",
          [405, 40, 625, 370],
          [56, 114, 29, 69],
        ),
        far: cut(
          "rose:farArm",
          "roseClothing",
          [825, 40, 1045, 375],
          [118, 115, 25, 68],
        ),
      };
      const rl = {
        near: cut(
          "rose:nearLeg",
          "roseClothing",
          [105, 735, 280, 1110],
          [73, 185, 22, 45],
        ),
        far: cut(
          "rose:farLeg",
          "roseClothing",
          [450, 735, 635, 1110],
          [98, 185, 22, 45],
        ),
      };
      for (const a of Object.values(rl)) eraseWhere(a, (x, y) => y > 226);
      limbSplit(rose, ra, rl, 207);
      ri["near-shoe"] = cut(
        "rose:near-shoe",
        "roseClothing",
        [760, 865, 1055, 1085],
        [66, 219, 32, 21],
      );
      ri["far-shoe"] = cut(
        "rose:far-shoe",
        "roseClothing",
        [70, 1185, 350, 1390],
        [98, 220, 29, 20],
      );
      ri["back-hair"] = cut(
        "rose:back-hair",
        "roseClothing",
        [755, 365, 1086, 790],
        [23, 51, 129, 128],
      );
      rose.legChains = {
        nearLeg: [
          [83, 189],
          [79, 207],
          [79, 224],
        ],
        farLeg: [
          [109, 189],
          [108, 207],
          [108, 224],
        ],
      };
      // Complete original front curls and anatomical neck remain in each head.
      // The independently registered rear plate overlaps behind their natural ends;
      // cutting the head on a horizontal y seam would remove both curl and neck pixels.
      const clothMaterials = {};
      for (const [id, person] of Object.entries(people)) {
        clothMaterials[id] = {};
        for (const [slot, rgba] of Object.entries(person.images)) {
          if (slot.startsWith("head") || slot === "back-hair") continue;
          const materials = new Uint8Array(W * H);
          for (let p = 0; p < W * H; p++) {
            if (!rgba[p * 4 + 3]) continue;
            const x = p % W,
              y = Math.floor(p / W),
              [r, g, b] = rgba.subarray(p * 4, p * 4 + 3);
            let m = slot.includes("shoe")
              ? 5
              : slot.includes("thigh") ||
                  slot.includes("shin") ||
                  slot === "hips" ||
                  slot === "garment"
                ? 4
                : 3;
            if (id === "theo") {
              if (
                slot.includes("forearm") &&
                y >= 162 &&
                r > 100 &&
                r > g * 1.15 &&
                g > b * 1.1
              )
                m = 1;
              if (
                slot === "torso" &&
                ((inside(x, y, [
                  [87, 112],
                  [112, 112],
                  [117, 162],
                  [103, 159],
                  [99, 143],
                ]) &&
                  (r > g * 1.04 || g > 90)) ||
                  inside(x, y, [
                    [118, 122],
                    [132, 122],
                    [132, 144],
                    [117, 144],
                  ]))
              )
                m = 0;
              if (
                slot === "torso" &&
                x >= 90 &&
                x <= 111 &&
                y < 118 &&
                r > 135 &&
                g > 75 &&
                r > g * 1.1 &&
                g > b * 1.05
              )
                m = 1;
              if (
                slot.includes("forearm") &&
                y >= 156 &&
                y < 167 &&
                r > 160 &&
                g > 140
              )
                m = 0;
            } else {
              if (slot.includes("thigh") || slot.includes("shin"))
                m = y >= 216 ? 0 : 1;
              if (slot.includes("upper-arm") || slot.includes("forearm"))
                m = y >= 141 ? 1 : 0;
              // Cream puff-sleeve cuff pixels overlap the first bare-arm rows.
              // Keep their authored trim when skin changes; ownership is bounded
              // to this source cuff, never a global color deletion.
              if (
                (slot.includes("upper-arm") || slot.includes("forearm")) &&
                y >= 141 &&
                y <= 154 &&
                g > 180 &&
                r < g * 1.1 &&
                b > g * 0.8
              )
                m = 0;
              if (
                slot === "torso" &&
                ((g > 155 && r < g * 1.3 && b > g * 0.78) ||
                  Math.max(r, g, b) - Math.min(r, g, b) < 24)
              )
                m = 0;
              if (slot === "garment" && g > 155 && b > 130 && r < g * 1.15)
                m = 0;
            }
            if (id === "rose" && slot === "torso" && collarSkin[p]) m = 1;
            if (slot.includes("shoe") && y >= 235) m = 0;
            materials[p] = m;
          }
          clothMaterials[id][slot] = materials;
        }
      }
      for (const side of ["near", "far"]) {
        const base = side + "-forearm",
          slot = side + "-forearm-active";
        let rgba = cut(
          "theo:" + slot,
          "theoClothing",
          side === "near" ? [680, 1094, 790, 1184] : [1040, 1095, 1145, 1184],
          side === "near" ? [59, 164, 16, 19] : [129, 164, 14, 18],
        );
        if (side === "near") rgba = flip(rgba, 59, 74);
        const m = new Uint8Array(W * H);
        for (let p = 0; p < W * H; p++) {
          if (rgba[p * 4 + 3]) m[p] = 1;
          if (ti[base][p * 4 + 3] && clothMaterials.theo[base][p] !== 1) {
            rgba.set(ti[base].subarray(p * 4, p * 4 + 4), p * 4);
            m[p] = clothMaterials.theo[base][p];
          }
        }
        ti[slot] = rgba;
        clothMaterials.theo[slot] = m;
      }
      for (const side of ["near", "far"]) {
        const slot = side + "-forearm-active";
        const rgba = cut(
          "rose:" + slot,
          "roseClothing",
          side === "near" ? [460, 1105, 650, 1400] : [855, 1105, 1030, 1400],
          side === "near" ? [57, 146, 22, 38] : [125, 146, 20, 38],
        );
        const m = new Uint8Array(W * H);
        for (let p = 0; p < W * H; p++) if (rgba[p * 4 + 3]) m[p] = 1;
        ri[slot] = rgba;
        clothMaterials.rose[slot] = m;
      }
      const pair = {
        "near-forearm": "near-forearm-active",
        "far-forearm": "far-forearm-active",
      };
      const actionForearms = { run: { ...pair }, jump: { ...pair } };
      const identities = [],
        items = [],
        checks = [];
      let collarRimChanged = 0;
      for (let p = 0; p < W * H; p++)
        if (torsoBeforeCollar[p * 4 + 3] && p / W < 164)
          for (let channel = 0; channel < 4; channel++)
            collarRimChanged += +(
              torsoBeforeCollar[p * 4 + channel] !== ri.torso[p * 4 + channel]
            );
      if (collarRimChanged)
        throw Error("Collar allowance changed original clothing");
      for (const [id, person] of Object.entries(people))
        for (const expression of expressions) {
          let openings = 0;
          for (let y = 116; y <= 122; y++)
            for (let x = 94; x <= 110; x++) {
              const p = y * W + x;
              if (
                !person.images["head-" + expression][p * 4 + 3] &&
                !ri.torso[p * 4 + 3]
              )
                openings++;
              if (collarSkin[p] && clothMaterials.rose.torso[p] !== 1)
                throw Error("Collar allowance lost skin ownership");
            }
          if (openings)
            throw Error(id + "/" + expression + " retains exposed chest gap");
          checks.push({
            identity: id,
            expression,
            roseTopChestGapPixels: openings,
          });
        }
      checks.push({
        identity: "rose",
        collarSkinPixels,
        originalClothingPixelsChanged: collarRimChanged,
      });
      for (const side of ["near", "far"]) {
        let creamPixels = 0;
        const slot = side + "-upper-arm",
          rgba = ri[slot],
          mask = clothMaterials.rose[slot];
        for (let y = 141; y <= 154; y++)
          for (let x = 0; x < W; x++) {
            const p = y * W + x,
              [r, g, b, a] = rgba.subarray(p * 4, p * 4 + 4);
            if (a && g > 180 && r < g * 1.1 && b > g * 0.8) {
              if (mask[p] !== 0)
                throw Error("Rose cream cuff has skin ownership");
              creamPixels++;
            }
          }
        checks.push({
          identity: "rose",
          slot,
          creamCuffFixedPixels: creamPixels,
        });
      }
      for (const [id, p] of Object.entries(people))
        for (const expression of expressions) {
          let neckPixels = 0;
          for (let y = 116; y < 120; y++)
            for (let x = 86; x < 115; x++)
              neckPixels += +(
                p.images["head-" + expression][(y * W + x) * 4 + 3] > 0
              );
          if (!neckPixels) throw Error(id + " lost authored lower neck");
          checks.push({
            identity: id,
            expression,
            registeredLowerNeckPixels: neckPixels,
          });
        }
      const geo = {
        theo: {
          skin: [
            [115, 48],
            [126, 45],
            [130, 61],
            [138, 68],
            [139, 94],
            [130, 103],
            [115, 109],
            [113, 118],
            [86, 118],
            [83, 109],
            [87, 103],
            [79, 99],
            [70, 98],
            [64, 91],
            [63, 82],
            [70, 76],
            [79, 80],
            [84, 88],
            [83, 76],
            [96, 67],
            [108, 59],
          ],
          fixed: [
            [
              [86, 67],
              [111, 67],
              [111, 94],
              [86, 94],
            ],
            [
              [120, 65],
              [141, 65],
              [141, 93],
              [120, 93],
            ],
            [
              [86, 61],
              [111, 61],
              [111, 68],
              [86, 68],
            ],
            [
              [121, 57],
              [141, 57],
              [141, 65],
              [121, 65],
            ],
            [
              [101, 94],
              [129, 94],
              [129, 107],
              [101, 107],
            ],
          ],
        },
        rose: {
          skin: [
            [112, 44],
            [126, 48],
            [132, 60],
            [137, 66],
            [138, 96],
            [128, 103],
            [113, 109],
            [111, 119],
            [86, 119],
            [80, 111],
            [86, 104],
            [77, 100],
            [67, 98],
            [62, 90],
            [62, 83],
            [68, 77],
            [78, 80],
            [83, 87],
            [84, 75],
            [96, 68],
            [106, 58],
          ],
          fixed: [
            [
              [84, 68],
              [111, 68],
              [111, 94],
              [84, 94],
            ],
            [
              [120, 66],
              [141, 66],
              [141, 94],
              [120, 94],
            ],
            [
              [87, 60],
              [111, 60],
              [111, 68],
              [87, 68],
            ],
            [
              [120, 57],
              [141, 57],
              [141, 66],
              [120, 66],
            ],
            [
              [100, 94],
              [129, 94],
              [129, 108],
              [100, 108],
            ],
          ],
        },
      };
      for (const [id, person] of Object.entries(people)) {
        const pal = { skin: person.palette.skin, hair: person.palette.hair },
          parts = [];
        for (const slot of [
          ...expressions.map((x) => "head-" + x),
          ...(person.images["back-hair"] ? ["back-hair"] : []),
        ]) {
          const rgba = person.images[slot],
            m = new Uint8Array(W * H);
          for (let p = 0; p < W * H; p++) {
            if (!rgba[p * 4 + 3]) continue;
            const x = p % W,
              y = Math.floor(p / W),
              [r, g, b] = rgba.subarray(p * 4, p * 4 + 3);
            let v = 2;
            if (slot !== "back-hair") {
              if (
                inside(x + 0.5, y + 0.5, geo[id].skin) &&
                r > 135 &&
                g > 75 &&
                r > g * 1.1 &&
                g > b * 1.05
              )
                v = 1;
              if (
                x >= 61 &&
                x < 143 &&
                y >= 35 &&
                y < 121 &&
                r > 195 &&
                g > 115 &&
                r > g * 1.1 &&
                g > b * 1.05
              )
                v = 1;
              if (
                geo[id].fixed.some((poly) => inside(x + 0.5, y + 0.5, poly)) &&
                ((r < 150 && g < 110) || (g > r * 0.94 && b > g * 0.9))
              )
                v = 0;
              if (
                inside(x + 0.5, y + 0.5, geo[id].fixed[4]) &&
                r > g * 1.65 &&
                b > 45
              )
                v = 0;
              if (
                id === "rose" &&
                inside(x + 0.5, y + 0.5, [
                  [25, 39],
                  [56, 38],
                  [65, 49],
                  [61, 69],
                  [48, 80],
                  [25, 74],
                ])
              )
                v = 0;
            }
            if (r < 61 && g < 49 && b < 45) v = 0;
            m[p] = v;
          }
          const { part, mask } = packedPart(
            slot,
            rgba,
            m,
            pal,
            "reference-" + id,
            true,
          );
          parts.push(part);
          outputs[`${id}/slots/${slot}.png`] = Array.from(
            await encodeAttachmentPng(rgba),
          );
          outputs[`${id}/masks/${slot}.png`] = Array.from(
            await encodeAttachmentPng(mask),
          );
        }
        const identity = validateWardrobeIdentity({
          format: "gathria-character-identity",
          version: 1,
          rigId: maple.rig.id,
          id: "custom-" + id,
          name: person.name,
          provenance: `Original ${person.name} complete character and three expression heads generated with OpenAI image generation during development, 2026-10-18 UTC. Source sheet and exact prompts retained at artwork/reference-pair/source. Offline source landmarks, nearest-neighbor sampling, binary alpha threshold 192, explicit face/hair/fixed masks: scripts/prepare-reference-pair.mjs. No runtime AI calls.`,
          frame: { width: 192, height: 256 },
          anchor: [96, 240],
          neck: [96, 118],
          jaw: structuredClone(maple.skin.metadata.bindings.jaw),
          hairSway: id === "rose" ? 0.65 : 0,
          palette: pal,
          sourceAppearance: {
            ...structuredClone(maple.skin.metadata.sourceAppearance),
            name: person.name,
            skinTone: pal.skin,
            hairColor: pal.hair,
            hairstyle: id === "rose" ? "waves" : "crop",
          },
          parts,
        });
        identities.push(identity);
        await blob(
          id + ".identity.zip",
          await exportWardrobeIdentity(identity),
        );
        for (const group of ["top", "bottom", "shoes"]) {
          const slots =
            group === "top"
              ? [
                  "torso",
                  "near-upper-arm",
                  "near-forearm",
                  "far-upper-arm",
                  "far-forearm",
                  "near-forearm-active",
                  "far-forearm-active",
                ]
              : group === "bottom"
                ? [
                    "hips",
                    "near-thigh",
                    "near-shin",
                    "far-thigh",
                    "far-shin",
                    ...(person.images.garment ? ["garment"] : []),
                  ]
                : ["near-shoe", "far-shoe"];
          const parts = [];
          for (const slot of slots) {
            const rgba = person.images[slot];
            if (!rgba) throw Error(id + " missing " + slot);
            const { part, mask } = packedPart(
              slot,
              rgba,
              clothMaterials[id][slot],
              {
                skin: person.palette.skin,
                upper: person.palette.upper,
                lower: person.palette.lower,
                shoe: person.palette.shoe,
              },
              "reference-" + id,
              true,
            );
            parts.push(part);
            outputs[`${id}/slots/${slot}.png`] = Array.from(
              await encodeAttachmentPng(rgba),
            );
            outputs[`${id}/masks/${slot}.png`] = Array.from(
              await encodeAttachmentPng(mask),
            );
          }
          const item = {
            format: "gathria-wardrobe-item",
            version: group === "top" ? 2 : 1,
            rigId: maple.rig.id,
            id: `custom-${id}-${group}`,
            name:
              person.name +
              " " +
              (id === "theo"
                ? {
                    top: "navy formal jacket",
                    bottom: "navy trousers",
                    shoes: "brown dress shoes",
                  }
                : {
                    top: "coral bodice and cream sleeves",
                    bottom: "coral skirt",
                    shoes: "brown Mary Janes",
                  })[group],
            provenance: `Original ${person.name} outfit generated with OpenAI image generation during development, 2026-10-18 UTC. Retained source artwork/reference-pair/source/${id}-clothing.png and exact prompts.${id === "rose" && group === "top" ? " Exposed collar upper-chest skin samples the original neutral neck ramp from pair-design.png; the torso owns this bounded allowance behind its unchanged cream scoop rim. No head or neck anchor changes." : ""} scripts/prepare-reference-pair.mjs registers explicit source ownership, binary alpha192, nearest sampling, source masks, overlapping limb cuts and authored action hands. Shared rig and motions unchanged.`,
            group,
            parts,
            ...(group === "top"
              ? {
                  chains: { nearArm: c.nearArm, farArm: c.farArm },
                  actionForearms,
                }
              : group === "bottom"
                ? { chains: person.legChains }
                : {
                    ankles: {
                      near: person.legChains.nearLeg[2],
                      far: person.legChains.farLeg[2],
                    },
                  }),
          };
          items.push(item);
          await blob(
            `${id}-${group}.wardrobe.zip`,
            await exportWardrobeItem(item),
          );
        }
      }
      for (const identity of identities) {
        const id = identity.name.toLowerCase(),
          p = people[id],
          recipe = {
            ...defaultCustomWardrobeRecipe(identity),
            top: `custom-${id}-top`,
            bottom: `custom-${id}-bottom`,
            shoes: `custom-${id}-shoes`,
            colors: {
              skin: identity.palette.skin,
              hair: identity.palette.hair,
              top: p.palette.upper,
              bottom: p.palette.lower,
              shoes: p.palette.shoe,
            },
          };
        const project = applyWardrobe(
          {
            ...structuredClone(maple),
            skin: {
              ...maple.skin,
              metadata: { ...maple.skin.metadata, name: identity.name },
            },
            wardrobeItems: items,
            wardrobeIdentities: identities,
          },
          recipe,
        );
        await blob(id + ".rig.zip", await exportProject(project));
        for (const expression of expressions) {
          const slot = "head-" + expression,
            equal =
              (await sha(project.skin.images[slot])) ===
              (await sha(p.images[slot]));
          if (!equal) throw Error(id + " head source changed");
          checks.push({
            identity: id,
            expression,
            headSourcePreserved: true,
            rgbaSha256: await sha(p.images[slot]),
          });
        }
        for (const look of ["theo", "rose"]) {
          const op = people[look].palette,
            dressed = applyWardrobe(project, {
              ...recipe,
              top: `custom-${look}-top`,
              bottom: `custom-${look}-bottom`,
              shoes: `custom-${look}-shoes`,
              colors: {
                ...recipe.colors,
                top: op.upper,
                bottom: op.lower,
                shoes: op.shoe,
              },
            });
          const dr = prepareRig(dressed.rig, dressed.skin, dressed.motions);
          for (const action of ["idle", "walk", "run", "jump"])
            for (
              let key = 0;
              key < dressed.motions.clips[action].keys.length;
              key++
            )
              outputs[
                `diagnostics/outfits/${id}-${look}-${action}-${key}.png`
              ] = Array.from(
                await encodeAttachmentPng(dr.frame(action, key, "neutral")),
              );
        }
        const renderer = prepareRig(project.rig, project.skin, project.motions);
        for (const expression of expressions)
          outputs[`diagnostics/${id}/expression-${expression}.png`] =
            Array.from(
              await encodeAttachmentPng(renderer.frame("idle", 0, expression)),
            );
        const recolored = applyWardrobe(project, {
            ...recipe,
            colors: {
              ...recipe.colors,
              skin: "#8d5a43",
              hair: "#c6ae73",
              top: "#46796c",
            },
          }),
          rr = prepareRig(recolored.rig, recolored.skin, recolored.motions);
        for (const expression of expressions)
          outputs[`diagnostics/${id}/recolor-${expression}.png`] = Array.from(
            await encodeAttachmentPng(rr.frame("idle", 0, expression)),
          );
      }
      return {
        outputs,
        stats,
        checks,
        materialRecords,
        headLandmarks: Object.fromEntries(
          Object.entries(people).map(([id, p]) => [
            id,
            { necks: p.necks, scale: 0.4 },
          ]),
        ),
        headMasks: geo,
      };
    },
    { sources },
  );
  await mkdir(output, { recursive: true });
  for (const [file, bytes] of Object.entries(result.outputs)) {
    const path = new URL(file, output);
    await mkdir(new URL("./", path), { recursive: true });
    await writeFile(path, new Uint8Array(bytes));
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
      checks: result.checks,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
