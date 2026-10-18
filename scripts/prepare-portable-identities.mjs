/** Offline, source-specific registration. No model or color-classification calls
 * occur at runtime: portable identities/items contain authored RGBA + masks. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const output = new URL("artwork/portable-identities/prepared/", root);
const inputs = {
  design: "artwork/portable-identities/source/willow-design.png",
  clothing: "artwork/portable-identities/source/willow-clothing.png",
  fists: "artwork/maple-action-poses/source/closed-fists.png",
  maple: "artwork/maple-action-poses/prepared/traveler.rig.zip",
  mapleTop: "artwork/maple-action-poses/prepared/traveler-top.wardrobe.zip",
  mapleBottom:
    "artwork/maple-action-poses/prepared/traveler-bottom.wardrobe.zip",
  mapleShoes: "artwork/maple-action-poses/prepared/traveler-shoes.wardrobe.zip",
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
      const { importWardrobeItem, exportWardrobeItem } = await import(
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
        images = {},
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
      for (const key of ["design", "clothing", "fists"]) {
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
        const rgba = new Uint8ClampedArray(W * H * 4),
          [tx, ty, tw, th] = target;
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
          target,
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
      const maple = await importProject(new Blob([from64(sources.maple.data)]));
      const mapleItems = [];
      for (const key of ["mapleTop", "mapleBottom", "mapleShoes"])
        mapleItems.push(
          await importWardrobeItem(new Blob([from64(sources[key].data)])),
        );
      const palette = {
        skin: "#f8b985",
        hair: "#72432e",
        upper: "#884957",
        lower: "#737752",
        shoe: "#ead6b4",
      };
      for (const [index, expression] of [
        "neutral",
        "gentle",
        "joyful",
      ].entries())
        images["head-" + expression] = cut(
          "head-" + expression,
          "design",
          [
            [430, 260, 880, 700],
            [880, 260, 1320, 700],
            [1320, 260, 1774, 700],
          ][index],
          [42, 9, 118, 111],
        );
      images.torso = cut(
        "torso",
        "clothing",
        [60, 80, 470, 510],
        [72, 112, 59, 63],
      );
      images.hips = cut(
        "hips",
        "clothing",
        [1100, 170, 1500, 500],
        [75, 165, 47, 25],
      );
      for (let y = 176; y < H; y++)
        for (let x = 0; x < W; x++)
          if (y > 183 || x < 85 + (y - 176) || x > 113 - (y - 176))
            images.hips.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4);
      const arms = {
        near: cut(
          "nearArm",
          "clothing",
          [510, 85, 730, 520],
          [56, 114, 29, 69],
        ),
        far: cut(
          "farArm",
          "clothing",
          [850, 85, 1040, 520],
          [118, 115, 25, 68],
        ),
      };
      const legs = {
        near: cut(
          "nearLeg",
          "clothing",
          [65, 515, 365, 965],
          [64, 167, 34, 65],
        ),
        far: cut("farLeg", "clothing", [500, 515, 770, 965], [97, 167, 27, 65]),
      };
      for (const a of Object.values(legs)) a.fill(0, 0, 172 * W * 4);
      for (const side of ["near", "far"]) {
        images[side + "-upper-arm"] = half(arms[side], 0, 154);
        images[side + "-forearm"] = half(arms[side], 146, 255);
        images[side + "-thigh"] = half(legs[side], 0, 202);
        images[side + "-shin"] = half(legs[side], 194, 255);
      }
      images["near-shoe"] = cut(
        "near-shoe",
        "clothing",
        [815, 760, 1140, 975],
        [61, 218, 31, 22],
      );
      images["far-shoe"] = cut(
        "far-shoe",
        "clothing",
        [1200, 760, 1500, 975],
        [99, 219, 29, 21],
      );
      const headPolygons = {
        maple: {
          skin: [
            [116, 48],
            [123, 50],
            [128, 56],
            [131, 64],
            [138, 69],
            [140, 78],
            [139, 97],
            [128, 105],
            [119, 109],
            [118, 115],
            [110, 120],
            [94, 118],
            [90, 113],
            [94, 106],
            [87, 102],
            [85, 97],
            [77, 99],
            [69, 93],
            [69, 84],
            [75, 80],
            [81, 82],
            [84, 87],
            [90, 92],
            [87, 85],
            [87, 77],
            [97, 70],
            [108, 63],
            [113, 56],
          ],
          fixed: [
            [
              [92, 72],
              [114, 70],
              [115, 91],
              [92, 92],
            ],
            [
              [127, 70],
              [141, 70],
              [141, 91],
              [127, 91],
            ],
            [
              [105, 61],
              [119, 61],
              [119, 70],
              [105, 70],
            ],
            [
              [128, 61],
              [141, 61],
              [141, 70],
              [128, 70],
            ],
            [
              [111, 94],
              [128, 94],
              [128, 107],
              [111, 107],
            ],
          ],
        },
        willow: {
          skin: [
            [116, 41],
            [123, 43],
            [128, 49],
            [131, 58],
            [136, 63],
            [139, 70],
            [141, 94],
            [134, 102],
            [122, 108],
            [115, 110],
            [119, 117],
            [109, 120],
            [95, 117],
            [91, 113],
            [94, 106],
            [87, 102],
            [82, 98],
            [77, 99],
            [69, 94],
            [66, 87],
            [70, 81],
            [75, 78],
            [81, 80],
            [84, 87],
            [90, 92],
            [87, 85],
            [87, 77],
            [93, 71],
            [101, 66],
            [108, 60],
            [113, 51],
          ],
          fixed: [
            [
              [94, 69],
              [117, 69],
              [117, 92],
              [94, 92],
            ],
            [
              [127, 68],
              [141, 68],
              [141, 89],
              [127, 89],
            ],
            [
              [103, 59],
              [117, 59],
              [117, 69],
              [103, 69],
            ],
            [
              [128, 55],
              [141, 55],
              [141, 65],
              [128, 65],
            ],
            [
              [109, 92],
              [130, 92],
              [130, 106],
              [109, 106],
            ],
          ],
        },
      };
      function packedPart(
        slot,
        rgba,
        materials,
        partPalette,
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
            palette: partPalette,
            preserveWarmSkin,
            sourceLayerId: id + ":" + slot,
          },
          mask,
        };
      }
      async function identity(id, name, heads, pal) {
        const geo = headPolygons[name.toLowerCase()],
          parts = [];
        for (const expr of ["neutral", "gentle", "joyful"]) {
          const slot = "head-" + expr,
            rgba = heads[slot],
            materials = new Uint8Array(W * H);
          for (let p = 0; p < W * H; p++) {
            if (!rgba[p * 4 + 3]) continue;
            const x = p % W,
              y = Math.floor(p / W),
              [r, g, b] = rgba.subarray(p * 4, p * 4 + 3);
            let m = 2;
            // Explicit anatomical ownership first; source-specific chroma only resolves
            // the one-pixel brown antialiased hair/skin boundary INSIDE that region.
            if (
              inside(x + 0.5, y + 0.5, geo.skin) &&
              r > 130 &&
              g > 65 &&
              r > g * 1.1 &&
              g > b * 1.05
            )
              m = 1;
            // The generated expressions shift their bright temple edge by 1–3 pixels.
            // A bounded skin-only source band captures those warm highlights without
            // assigning dark hair or any fixed eye feature to skin.
            if (
              x >= 65 &&
              x < 148 &&
              y >= 38 &&
              y < 122 &&
              r > 200 &&
              g > 110 &&
              r > g * 1.1 &&
              g > b * 1.05
            )
              m = 1;
            // Eye whites, iris/lashes, brows and mouth stay authored at every skin/hair
            // color. Masks are baked here; the runtime never classifies source RGB.
            if (
              geo.fixed.some((poly) => inside(x + 0.5, y + 0.5, poly)) &&
              ((r < 210 && g < 135) || (g > r * 0.94 && b > g * 0.9))
            )
              m = 0;
            if (r < 62 && g < 50 && b < 45) m = 0;
            materials[p] = m;
          }
          const { part, mask } = packedPart(
            slot,
            rgba,
            materials,
            pal,
            id,
            true,
          );
          parts.push(part);
          outputs[`${name.toLowerCase()}/slots/${slot}.png`] = Array.from(
            await encodeAttachmentPng(rgba),
          );
          outputs[`${name.toLowerCase()}/masks/${slot}.png`] = Array.from(
            await encodeAttachmentPng(mask),
          );
        }
        const value = validateWardrobeIdentity({
          format: "gathria-character-identity",
          version: 1,
          rigId: maple.rig.id,
          id,
          name,
          provenance:
            name === "Maple"
              ? "Original generated Maple complete heads reused byte-for-byte from artwork/maple-action-poses/prepared/traveler.rig.zip; explicit offline semantic face/hair ownership added by scripts/prepare-portable-identities.mjs. Source/prompts retained at artwork/generated-traveler/source. No new identity drawing or runtime inference."
              : "Willow original full character and three complete expression heads created with OpenAI image generation during development, 2026-10-17 UTC; retained at artwork/portable-identities/source/willow-design.png with exact prompts. scripts/prepare-portable-identities.mjs performs measured component registration, alpha threshold 192, nearest sampling and source-specific semantic masks. No runtime model calls.",
          frame: { width: 192, height: 256 },
          anchor: [96, 240],
          neck: [96, 118],
          jaw: structuredClone(maple.skin.metadata.bindings.jaw),
          hairSway: 0,
          palette: pal,
          sourceAppearance: {
            ...structuredClone(maple.skin.metadata.sourceAppearance),
            name,
            skinTone: pal.skin,
            hairColor: pal.hair,
          },
          parts,
        });
        await blob(
          name.toLowerCase() + ".identity.zip",
          await exportWardrobeIdentity(value),
        );
        return value;
      }
      const identities = [
        await identity("custom-maple", "Maple", maple.skin.images, {
          skin: "#f2be93",
          hair: "#8c4c30",
        }),
        await identity("custom-willow", "Willow", images, {
          skin: palette.skin,
          hair: palette.hair,
        }),
      ];
      const clothMaterials = {};
      const nearHand = [
          [52, 184],
          [52, 167],
          [62, 165],
          [65, 164],
          [72, 165],
          [78, 170],
          [80, 184],
        ],
        farHand = [
          [121, 185],
          [121, 169],
          [128, 166],
          [133, 164],
          [139, 165],
          [145, 171],
          [149, 185],
        ];
      for (const [slot, rgba] of Object.entries(images)) {
        if (slot.startsWith("head")) continue;
        const m = new Uint8Array(W * H);
        for (let p = 0; p < W * H; p++) {
          if (!rgba[p * 4 + 3]) continue;
          const x = p % W,
            y = Math.floor(p / W);
          m[p] = slot.includes("shoe")
            ? 5
            : slot.includes("thigh") || slot.includes("shin") || slot === "hips"
              ? 4
              : 3;
          if (
            slot.includes("forearm") &&
            inside(x, y, slot.startsWith("near") ? nearHand : farHand)
          )
            m[p] = 1;
          else if (
            slot === "torso" &&
            inside(x, y, [
              [83, 113],
              [112, 114],
              [123, 165],
              [100, 169],
              [98, 148],
            ]) &&
            rgba[p * 4] < rgba[p * 4 + 1] * 1.4 &&
            rgba[p * 4 + 1] > rgba[p * 4 + 2] * 0.95
          )
            m[p] = 0;
          else if (slot.includes("shoe") && y >= 235) m[p] = 0;
        }
        clothMaterials[slot] = m;
      }
      const pair = {
          "near-forearm": "near-forearm-active",
          "far-forearm": "far-forearm-active",
        },
        actionForearms = { run: { ...pair }, jump: { ...pair } };
      for (const side of ["near", "far"]) {
        const slot = side + "-forearm-active",
          base = side + "-forearm";
        const rgba = cut(
            slot,
            "fists",
            side === "near" ? [350, 240, 760, 680] : [1000, 240, 1410, 680],
            side === "near" ? [59, 164, 16, 19] : [129, 164, 14, 18],
          ),
          m = new Uint8Array(W * H);
        for (let p = 0; p < W * H; p++) {
          if (rgba[p * 4 + 3]) {
            m[p] = 1;
            /* Source-palette conversion only at preparation time. */ rgba[
              p * 4
            ] = Math.min(255, (rgba[p * 4] * 248) / 242);
            rgba[p * 4 + 1] = Math.min(255, (rgba[p * 4 + 1] * 185) / 190);
            rgba[p * 4 + 2] = Math.min(255, (rgba[p * 4 + 2] * 133) / 147);
          }
          if (images[base][p * 4 + 3] && clothMaterials[base][p] !== 1) {
            rgba.set(images[base].subarray(p * 4, p * 4 + 4), p * 4);
            m[p] = clothMaterials[base][p];
          }
        }
        images[slot] = rgba;
        clothMaterials[slot] = m;
      }
      const provenance =
        "Original Willow cardigan, olive trousers and cream sneakers generated with OpenAI image generation during development, 2026-10-17 UTC. Raw source/prompts retained at artwork/portable-identities/source. Explicit 192x256 registration, component alpha threshold 192, nearest sampling, material ownership and overlapping limb cuts: scripts/prepare-portable-identities.mjs. Action hands reuse retained generated closed fists, source-palette adjusted offline under the original cuffs. Shared rig and motions unchanged; no runtime model calls.";
      const items = [...mapleItems];
      const c = maple.skin.metadata.bindings.chains;
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
              ? ["hips", "near-thigh", "near-shin", "far-thigh", "far-shin"]
              : ["near-shoe", "far-shoe"];
        const parts = [];
        for (const slot of slots) {
          const { part, mask } = packedPart(
            slot,
            images[slot],
            clothMaterials[slot],
            {
              skin: palette.skin,
              upper: palette.upper,
              lower: palette.lower,
              shoe: palette.shoe,
            },
            "generated-willow",
            true,
          );
          parts.push(part);
          outputs["willow/slots/" + slot + ".png"] = Array.from(
            await encodeAttachmentPng(images[slot]),
          );
          outputs["willow/masks/" + slot + ".png"] = Array.from(
            await encodeAttachmentPng(mask),
          );
        }
        const item = {
          format: "gathria-wardrobe-item",
          version: group === "top" ? 2 : 1,
          rigId: maple.rig.id,
          id: "custom-willow-" + group,
          name:
            "Willow " +
            {
              top: "plum cardigan",
              bottom: "olive trousers",
              shoes: "cream sneakers",
            }[group],
          provenance,
          group,
          parts,
          ...(group === "top"
            ? {
                chains: { nearArm: c.nearArm, farArm: c.farArm },
                actionForearms,
              }
            : group === "bottom"
              ? { chains: { nearLeg: c.nearLeg, farLeg: c.farLeg } }
              : { ankles: { near: c.nearLeg[2], far: c.farLeg[2] } }),
        };
        items.push(item);
        await blob(
          "willow-" + group + ".wardrobe.zip",
          await exportWardrobeItem(item),
        );
      }
      const checks = [];
      for (const identity of identities) {
        const name = identity.name.toLowerCase();
        const recipe = {
          ...defaultCustomWardrobeRecipe(identity),
          top:
            name === "maple" ? "custom-maple-active-top" : "custom-willow-top",
          bottom: "custom-" + name + "-bottom",
          shoes: "custom-" + name + "-shoes",
          colors: {
            skin: identity.palette.skin,
            hair: identity.palette.hair,
            top: name === "maple" ? "#c66632" : palette.upper,
            bottom: name === "maple" ? "#3e5b5c" : palette.lower,
            shoes: name === "maple" ? "#875134" : palette.shoe,
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
        await blob(name + ".rig.zip", await exportProject(project));
        for (const expression of ["neutral", "gentle", "joyful"]) {
          const slot = "head-" + expression;
          const equal =
            (await sha(project.skin.images[slot])) ===
            (await sha(
              name === "maple" ? maple.skin.images[slot] : images[slot],
            ));
          if (!equal) throw Error(name + " authored head changed");
          checks.push({
            identity: name,
            expression,
            headSourcePreserved: true,
            rgbaSha256: await sha(project.skin.images[slot]),
          });
        }
        for (const look of ["maple", "willow", "denim"]) {
          const dressed = applyWardrobe(project, {
            ...recipe,
            top:
              look === "denim"
                ? "denim-jacket"
                : look === "maple"
                  ? "custom-maple-active-top"
                  : "custom-willow-top",
            bottom:
              look === "denim" ? "trousers" : "custom-" + look + "-bottom",
            shoes: look === "denim" ? "boots" : "custom-" + look + "-shoes",
            colors: {
              ...recipe.colors,
              top:
                look === "maple"
                  ? "#c66632"
                  : look === "willow"
                    ? palette.upper
                    : "#385d76",
              bottom:
                look === "maple"
                  ? "#3e5b5c"
                  : look === "willow"
                    ? palette.lower
                    : "#66503a",
              shoes:
                look === "maple"
                  ? "#875134"
                  : look === "willow"
                    ? palette.shoe
                    : "#60412e",
            },
          });
          const dr = prepareRig(dressed.rig, dressed.skin, dressed.motions);
          for (const action of ["idle", "run"])
            for (const key of action === "idle" ? [0] : [0, 3, 6, 9])
              outputs[
                `diagnostics/outfits/${name}-${look}-${action}-${key}.png`
              ] = Array.from(
                await encodeAttachmentPng(dr.frame(action, key, "neutral")),
              );
        }
        const renderer = prepareRig(project.rig, project.skin, project.motions);
        for (const action of ["idle", "walk", "run", "jump"])
          for (
            let key = 0;
            key < project.motions.clips[action].keys.length;
            key++
          )
            outputs[`diagnostics/${name}/${action}-${key}.png`] = Array.from(
              await encodeAttachmentPng(renderer.frame(action, key, "neutral")),
            );
        for (const expression of ["neutral", "gentle", "joyful"])
          outputs[`diagnostics/${name}/expression-${expression}.png`] =
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
        });
        const rr = prepareRig(recolored.rig, recolored.skin, recolored.motions);
        for (const expression of ["neutral", "gentle", "joyful"])
          outputs[`diagnostics/${name}/recolor-${expression}.png`] = Array.from(
            await encodeAttachmentPng(rr.frame("idle", 0, expression)),
          );
      }
      return {
        outputs,
        stats,
        headPolygons,
        handPolygons: { nearHand, farHand },
        materialRecords,
        checks,
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
