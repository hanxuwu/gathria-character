/** Offline registration of the two new roster tops. PNG creation/sampling and
 * semantic masks happen here; runtime consumes the ordinary V3 item contract. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const output = new URL("artwork/character-roster/prepared/tops/", root);
const specifications = {
  ravi: {
    source: "artwork/character-roster/source/ravi-top.png",
    id: "custom-ravi-utility-top",
    name: "Ravi teal utility jacket",
    palette: { skin: "#e9a06b", upper: "#427886" },
    parts: {
      torso: {
        box: [120, 120, 560, 560],
        source: [
          [366, 190],
          [366, 550],
        ],
        target: [
          [96, 118],
          [96, 174],
        ],
        skin: [
          [306, 172],
          [407, 173],
          [421, 207],
          [393, 222],
          [338, 210],
        ],
        fixed: [
          [
            [327, 213],
            [374, 225],
            [420, 211],
            [434, 247],
            [472, 516],
            [341, 522],
            [353, 331],
            [348, 261],
          ],
        ],
      },
      nearArm: {
        box: [710, 130, 945, 620],
        source: [
          [821, 180],
          [841, 479],
        ],
        target: [
          [75, 122],
          [60, 171],
        ],
        skin: [
          [791, 487],
          [841, 469],
          [882, 465],
          [913, 497],
          [945, 620],
          [755, 620],
          [780, 511],
        ],
      },
      farArm: {
        box: [1195, 130, 1450, 615],
        source: [
          [1288, 181],
          [1361, 479],
        ],
        target: [
          [123, 123],
          [134, 171],
        ],
        skin: [
          [1319, 500],
          [1367, 478],
          [1398, 473],
          [1435, 503],
          [1450, 615],
          [1295, 615],
        ],
      },
      nearActive: {
        box: [710, 650, 945, 955],
        source: [
          [795, 690],
          [841, 831],
        ],
        target: [
          [64, 150],
          [60, 171],
        ],
        skin: [
          [790, 850],
          [835, 821],
          [877, 812],
          [925, 834],
          [945, 955],
          [755, 955],
        ],
      },
      farActive: {
        box: [1220, 650, 1450, 955],
        source: [
          [1302, 690],
          [1362, 831],
        ],
        target: [
          [130, 150],
          [134, 171],
        ],
        skin: [
          [1320, 854],
          [1365, 828],
          [1401, 819],
          [1439, 849],
          [1450, 955],
          [1295, 955],
        ],
      },
    },
  },
  lina: {
    source: "artwork/character-roster/source/lina-top.png",
    id: "custom-lina-ochre-top",
    name: "Lina ochre pullover",
    palette: { skin: "#f1b88e", upper: "#d89a40" },
    parts: {
      torso: {
        box: [105, 100, 540, 515],
        source: [
          [329, 160],
          [329, 500],
        ],
        target: [
          [96, 119],
          [96, 173],
        ],
        fixed: [
          [
            [226, 120],
            [247, 110],
            [290, 139],
            [348, 145],
            [395, 113],
            [414, 116],
            [429, 150],
            [417, 171],
            [383, 191],
            [330, 198],
            [277, 182],
            [244, 157],
          ],
        ],
      },
      nearArm: {
        box: [710, 70, 965, 610],
        source: [
          [831, 170],
          [848, 467],
        ],
        target: [
          [75, 122],
          [60, 171],
        ],
        exclude: [
          [
            [710, 70],
            [965, 70],
            [965, 190],
            [927, 174],
            [898, 145],
            [864, 121],
            [826, 109],
            [790, 109],
            [710, 109],
          ],
        ],
        skin: [
          [792, 486],
          [808, 467],
          [845, 455],
          [879, 459],
          [913, 493],
          [955, 610],
          [755, 610],
        ],
      },
      farArm: {
        box: [1190, 75, 1440, 605],
        source: [
          [1288, 170],
          [1356, 463],
        ],
        target: [
          [123, 123],
          [134, 171],
        ],
        exclude: [
          [
            [1190, 75],
            [1440, 75],
            [1440, 210],
            [1370, 185],
            [1340, 151],
            [1300, 121],
            [1260, 117],
            [1190, 117],
          ],
        ],
        skin: [
          [1300, 479],
          [1340, 454],
          [1370, 446],
          [1404, 474],
          [1440, 605],
          [1280, 605],
        ],
      },
      nearActive: {
        box: [715, 630, 965, 960],
        source: [
          [801, 667],
          [849, 835],
        ],
        target: [
          [64, 150],
          [60, 171],
        ],
        skin: [
          [800, 861],
          [830, 828],
          [880, 816],
          [935, 837],
          [965, 960],
          [780, 960],
        ],
      },
      farActive: {
        box: [1205, 630, 1450, 955],
        source: [
          [1286, 666],
          [1357, 831],
        ],
        target: [
          [130, 150],
          [134, 171],
        ],
        skin: [
          [1305, 849],
          [1341, 828],
          [1377, 818],
          [1410, 836],
          [1450, 850],
          [1450, 955],
          [1285, 955],
        ],
      },
    },
  },
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sources = {};
for (const [id, spec] of Object.entries(specifications)) {
  const bytes = await readFile(new URL(spec.source, root));
  sources[id] = {
    path: spec.source,
    sha256: sha(bytes),
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
    async ({ sources, specifications }) => {
      const { encodeAttachmentPng } = await import("/src/skeletal/skin-io.ts");
      const { exportWardrobeItem, importWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { validateWardrobeItem, addWardrobeItem } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const { createRigDefinition } = await import(
        "/src/skeletal/definition.ts"
      );
      const { createAuthoringProject } = await import(
        "/src/skeletal/builtins.ts"
      );
      const { applyWardrobe, defaultWardrobeRecipe } = await import(
        "/src/skeletal/wardrobe.ts"
      );
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
      const W = 192,
        H = 256,
        outputs = {},
        records = [],
        items = [];
      const b64 = (bytes) => {
        let s = "";
        for (let i = 0; i < bytes.length; i += 8192)
          s += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(s);
      };
      const digest = async (bytes) =>
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
      const put = async (name, blob) =>
        (outputs[name] = Array.from(new Uint8Array(await blob.arrayBuffer())));
      const matrices = (a, b, c, d) => {
        const ux = b[0] - a[0],
          uy = b[1] - a[1],
          vx = d[0] - c[0],
          vy = d[1] - c[1],
          len = ux * ux + uy * uy;
        const re = (ux * vx + uy * vy) / len,
          im = (ux * vy - uy * vx) / len;
        return [
          re,
          im,
          -im,
          re,
          c[0] - re * a[0] + im * a[1],
          c[1] - im * a[0] - re * a[1],
        ];
      };
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
      const chains = createRigDefinition().chains;
      for (const [id, spec] of Object.entries(specifications)) {
        const image = new Image();
        image.src = "data:image/png;base64," + sources[id].data;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const source = {
          width: image.width,
          height: image.height,
          pixels: ctx.getImageData(0, 0, image.width, image.height).data,
        };
        const extracted = {};
        function register(name, config) {
          const [l, t, r, b] = config.box,
            ww = r - l,
            hh = b - t,
            seen = new Uint8Array(ww * hh),
            mask = new Uint8Array(ww * hh);
          let count = 0,
            partial = 0,
            largest = [];
          for (let y = 0; y < hh; y++)
            for (let x = 0; x < ww; x++) {
              const alpha =
                source.pixels[((y + t) * source.width + x + l) * 4 + 3];
              mask[y * ww + x] = +(
                alpha >= 192 &&
                !config.exclude?.some((poly) =>
                  inside(x + l + 0.5, y + t + 0.5, poly),
                )
              );
              count += mask[y * ww + x];
              partial += +(alpha > 0 && alpha < 255);
            }
          for (let p = 0; p < mask.length; p++)
            if (mask[p] && !seen[p]) {
              const group = [p];
              seen[p] = 1;
              for (let i = 0; i < group.length; i++) {
                const a = group[i],
                  x = a % ww,
                  y = Math.floor(a / ww);
                for (let dy = -1; dy <= 1; dy++)
                  for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx,
                      ny = y + dy,
                      j = ny * ww + nx;
                    if (
                      nx >= 0 &&
                      nx < ww &&
                      ny >= 0 &&
                      ny < hh &&
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
          if (largest.length < 300)
            throw Error(`${id}/${name}: missing source component`);
          const owned = new Uint8Array(mask.length);
          for (const p of largest) owned[p] = 1;
          const matrix =
            config.matrix ??
            matrices(
              config.source[0],
              config.source[1],
              config.target[0],
              config.target[1],
            );
          const [a, bb, c, d, tx, ty] = matrix,
            det = a * d - bb * c,
            rgba = new Uint8ClampedArray(W * H * 4),
            materials = new Uint8Array(W * H);
          let pixels = 0;
          for (let y = 1; y < H - 1; y++)
            for (let x = 1; x < W - 1; x++) {
              const sx = Math.round((d * (x - tx) - c * (y - ty)) / det),
                sy = Math.round((-bb * (x - tx) + a * (y - ty)) / det);
              if (
                sx < l ||
                sx >= r ||
                sy < t ||
                sy >= b ||
                !owned[(sy - t) * ww + sx - l]
              )
                continue;
              const p = y * W + x,
                si = (sy * source.width + sx) * 4;
              rgba.set(source.pixels.subarray(si, si + 3), p * 4);
              rgba[p * 4 + 3] = 255;
              pixels++;
              let material = 3;
              if (config.skin && inside(sx + 0.5, sy + 0.5, config.skin))
                material = 1;
              if (
                config.fixed?.some((poly) => inside(sx + 0.5, sy + 0.5, poly))
              )
                material = 0;
              materials[p] = material;
            }
          records.push({
            character: id,
            part: name,
            source: sources[id].path,
            sha256: sources[id].sha256,
            box: config.box,
            sourceLandmarks: config.source ?? null,
            targetLandmarks: config.target ?? null,
            matrix,
            skinPolygon: config.skin ?? null,
            fixedPolygons: config.fixed ?? [],
            excludedOwnershipPolygons: config.exclude ?? [],
            alphaThreshold: 192,
            sourceOpaque: count,
            retainedComponent: largest.length,
            sourcePartial: partial,
            registeredPixels: pixels,
          });
          return { rgba, materials };
        }
        for (const [name, config] of Object.entries(spec.parts))
          extracted[name] = register(name, config);
        if (
          !extracted.torso ||
          !extracted.nearArm ||
          !extracted.farArm ||
          !extracted.nearActive ||
          !extracted.farActive
        )
          throw Error(`${id}: source registrations are incomplete`);
        const parts = [],
          straightOverlapParts = new Map();
        async function add(
          slot,
          sourcePart,
          filter = () => true,
          baselineFilter,
        ) {
          const rgba = sourcePart.rgba.slice(),
            m = sourcePart.materials.slice(),
            raw = new Uint8Array(W * H * 5),
            maskImage = new Uint8ClampedArray(W * H * 4),
            counts = [0, 0, 0, 0, 0, 0];
          for (let p = 0; p < W * H; p++) {
            if (!filter(p % W, Math.floor(p / W))) {
              rgba.fill(0, p * 4, p * 4 + 4);
              m[p] = 0;
            }
            if (!rgba[p * 4 + 3]) continue;
            raw.set(rgba.subarray(p * 4, p * 4 + 4), p * 5);
            raw[p * 5 + 4] = m[p];
            maskImage[p * 4] = m[p];
            maskImage[p * 4 + 3] = 255;
            counts[m[p]]++;
          }
          await put(
            `${id}/slots/${slot}.png`,
            new Blob([await encodeAttachmentPng(rgba)]),
          );
          await put(
            `${id}/masks/${slot}.png`,
            new Blob([await encodeAttachmentPng(maskImage)]),
          );
          records.push({
            character: id,
            slot,
            materials: counts,
            rgbaSha256: await digest(rgba),
            maskSha256: await digest(maskImage),
          });
          const part = {
            slot,
            data: b64(zlibSync(raw)),
            palette: spec.palette,
            preserveWarmSkin: true,
            sourceLayerId: `roster-${id}:${slot}`,
          };
          parts.push(part);
          if (baselineFilter) {
            const baseline = new Uint8Array(W * H * 5),
              changed = [];
            const armConfig =
              spec.parts[slot.startsWith("near") ? "nearArm" : "farArm"];
            const [a, bb, c, d, tx, ty] = matrices(
              armConfig.source[0],
              armConfig.source[1],
              armConfig.target[0],
              armConfig.target[1],
            );
            const det = a * d - bb * c;
            for (let p = 0; p < W * H; p++) {
              const x = p % W,
                y = Math.floor(p / W);
              if (!sourcePart.rgba[p * 4 + 3] || !baselineFilter(x, y))
                continue;
              baseline.set(sourcePart.rgba.subarray(p * 4, p * 4 + 4), p * 5);
              baseline[p * 5 + 4] = sourcePart.materials[p];
              if (!filter(x, y))
                changed.push({
                  registered: [x, y],
                  source: [
                    Math.round((d * (x - tx) - c * (y - ty)) / det),
                    Math.round((-bb * (x - tx) + a * (y - ty)) / det),
                  ],
                });
            }
            straightOverlapParts.set(slot, {
              ...part,
              data: b64(zlibSync(baseline)),
            });
            records.push({
              character: id,
              slot,
              overlapTrial: {
                before: "straight +6px beyond elbow",
                after:
                  "elliptical distal cap: 6px along forearm axis, 15px across; proximal pixels unchanged",
                changedOwnershipPixels: changed,
              },
            });
          }
        }
        await add("torso", extracted.torso);
        for (const side of ["near", "far"]) {
          const chain = chains[side + "Arm"],
            mid = chain[1],
            end = chain[2],
            dx = end[0] - mid[0],
            dy = end[1] - mid[1],
            len = Math.hypot(dx, dy),
            distance = (x, y) => ((x - mid[0]) * dx + (y - mid[1]) * dy) / len;
          const roundedUpperOverlap = (x, y) => {
            const along = distance(x, y);
            if (along <= 0) return true;
            const across = (-(x - mid[0]) * dy + (y - mid[1]) * dx) / len;
            return (along / 6) ** 2 + (across / 15) ** 2 <= 1;
          };
          await add(
            side + "-upper-arm",
            extracted[side + "Arm"],
            roundedUpperOverlap,
            (x, y) => distance(x, y) <= 6,
          );
          await add(
            side + "-forearm",
            extracted[side + "Arm"],
            (x, y) => distance(x, y) >= -6,
          );
          await add(
            side + "-forearm-active",
            extracted[side + "Active"],
            (x, y) => distance(x, y) >= -6,
          );
        }
        const pair = {
          "near-forearm": "near-forearm-active",
          "far-forearm": "far-forearm-active",
        };
        const item = validateWardrobeItem({
          format: "gathria-wardrobe-item",
          version: 3,
          colorModel: "source-relative-v1",
          rigId: "gathria-v6-humanoid-1",
          id: spec.id,
          name: spec.name,
          provenance: `Original ${spec.name} source created with OpenAI image generation during development. Source ${sources[id].path} SHA256 ${sources[id].sha256}. Offline scripts/prepare-roster-tops.mjs registers isolated cloth and hands to fixed shared arm chains; paired active forearms serve run/jump. Binary alpha192, nearest-neighbor sampling, explicit ownership/material polygons. Upper sleeves use a rounded hidden distal elbow cap (6px along axis, 15px across), overlapping forearms by up to 12px; no added pixels or runtime changes. Source-relative colors; source palettes, extraction transforms and exact cap-trial ownership coordinates retained in registration.json. No runtime API calls or rig/motion changes.`,
          group: "top",
          chains: { nearArm: chains.nearArm, farArm: chains.farArm },
          actionForearms: { run: { ...pair }, jump: { ...pair } },
          parts,
        });
        const exported = await exportWardrobeItem(item),
          reopened = await importWardrobeItem(exported);
        if (JSON.stringify(reopened) !== JSON.stringify(item))
          throw Error(`${id}: item PNG/mask ZIP roundtrip differs`);
        await put(`${id}.wardrobe.zip`, exported);
        outputs[`${id}.item.json`] = Array.from(
          new TextEncoder().encode(JSON.stringify(item, null, 2) + "\n"),
        );
        const fixtureRecipe = defaultWardrobeRecipe();
        fixtureRecipe.colors.skin = spec.palette.skin;
        fixtureRecipe.colors.top = spec.palette.upper;
        const fixture = addWardrobeItem(
          applyWardrobe(createAuthoringProject(), fixtureRecipe),
          item,
        );
        const posed = prepareRig(fixture.rig, fixture.skin, fixture.motions),
          checks = [];
        const beforeItem = validateWardrobeItem({
          ...item,
          parts: item.parts.map(
            (part) => straightOverlapParts.get(part.slot) ?? part,
          ),
        });
        const beforeFixture = addWardrobeItem(
          applyWardrobe(createAuthoringProject(), fixtureRecipe),
          beforeItem,
        );
        const beforeRig = prepareRig(
          beforeFixture.rig,
          beforeFixture.skin,
          beforeFixture.motions,
        );
        for (const f of [8, 9, 10]) {
          await put(
            `diagnostics/overlap-before/${id}-run-${f}.png`,
            new Blob([
              await encodeAttachmentPng(beforeRig.frame("run", f, "gentle")),
            ]),
          );
        }
        for (const action of ["idle", "walk", "run", "jump"])
          for (let f = 0; f < fixture.motions.clips[action].keys.length; f++) {
            const pixels = posed.frame(action, f, "gentle");
            for (let p = 0; p < W * H; p++)
              if (
                pixels[p * 4 + 3] &&
                (p % W === 0 ||
                  p % W === W - 1 ||
                  Math.floor(p / W) === 0 ||
                  Math.floor(p / W) === H - 1)
              )
                throw Error(`${id}/${action}/${f}: bounds`);
            checks.push({ action, frame: f, sha256: await digest(pixels) });
            await put(
              `diagnostics/${id}-${action}-${f}.png`,
              new Blob([await encodeAttachmentPng(pixels)]),
            );
          }
        items.push({
          character: id,
          id: item.id,
          skinPalette: spec.palette.skin,
          topPalette: spec.palette.upper,
          chains: item.chains,
          actionForearms: item.actionForearms,
          roundtrip: true,
          fixtureChecks: checks,
        });
      }
      return { outputs, records, items };
    },
    { sources, specifications },
  );
  for (const [name, bytes] of Object.entries(result.outputs)) {
    const target = new URL(name, output);
    await mkdir(new URL(".", target), { recursive: true });
    await writeFile(target, new Uint8Array(bytes));
  }
  const manifest = {
    sources: Object.fromEntries(
      Object.entries(sources).map(([id, { data, ...v }]) => [id, v]),
    ),
    records: result.records,
    items: result.items,
    files: Object.fromEntries(
      Object.entries(result.outputs).map(([n, b]) => [
        n,
        { bytes: b.length, sha256: sha(new Uint8Array(b)) },
      ]),
    ),
  };
  await writeFile(
    new URL("registration.json", output),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      output: fileURLToPath(output),
      items: result.items.map((v) => v.id),
      files: Object.keys(result.outputs).length,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
