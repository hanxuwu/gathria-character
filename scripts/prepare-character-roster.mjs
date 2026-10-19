/** Offline roster registration. Source drawings, material ownership and source
 * joint landmarks are baked into portable assets; runtime remains unchanged. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { unzlibSync, zlibSync } from "fflate";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const output = new URL("artwork/character-roster/prepared/", root);
// New projects opt into this explicit shared short-leg support profile. The
// original failed Motion V2 projects remain in iterations/original-motion.
const compactRun = { footX: 0.85, footLift: 0.95, bodyBobOffset: 0 };
const inputs = {
  expressions: "artwork/character-roster/source/expressions.png",
  design: "artwork/character-roster/source/roster-design.png",
  baseline: "docs/theo-ankle-follow/final/theo-ankle-follow.rig.zip",
  roseTop: "artwork/reference-pair/prepared/rose-top.wardrobe.zip",
  roseBottom: "artwork/reference-pair/prepared/rose-bottom.wardrobe.zip",
  roseShoes: "artwork/reference-pair/prepared/rose-shoes.wardrobe.zip",
};
for (const [key, path] of Object.entries({
  raviTop: "artwork/character-roster/prepared/tops/ravi.wardrobe.zip",
  linaTop: "artwork/character-roster/prepared/tops/lina.wardrobe.zip",
})) {
  try {
    await access(new URL(path, root));
    inputs[key] = path;
  } catch {
    /* Staged identity inspection precedes tops. */
  }
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = {};
for (const [name, path] of Object.entries(inputs)) {
  const bytes = await readFile(new URL(path, root));
  sources[name] = { path, sha256: hash(bytes), data: bytes.toString("base64") };
}
for (const [name, path] of Object.entries({
  legacyIllustrated: "src/core/illustrated-assets.generated.ts",
  legacyPolished: "src/core/polished-assets.generated.ts",
  legacyAdapter: "src/core/polished-rig.ts",
})) {
  sources[name] = { path, sha256: hash(await readFile(new URL(path, root))) };
}
const server = await createServer({
  root: fileURLToPath(root),
  server: { host: "127.0.0.1", port: 5206, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  // Sage shorts were omitted from catalog 1. Import the frozen original bank
  // only in this development script, preserving all five source channels.
  const { polishedBank } = await server.ssrLoadModule(
    "/src/core/polished-rig.ts",
  );
  const { CORRECTED_EVERYDAY_EXAMPLES } = await server.ssrLoadModule(
    "/src/core/everyday-presets.ts",
  );
  const config = CORRECTED_EVERYDAY_EXAMPLES.find(
    (item) => item.id === "sage-weekend",
  ).config;
  const bank = polishedBank(config),
    lower = bank.lower.shorts;
  const sourceLayers = {};
  const legacyRecords = [];
  function sourcePart(slot, id) {
    const layer = bank.layers.find((l) => l.id === id);
    const raw = unzlibSync(Buffer.from(layer.data, "base64"));
    const full = new Uint8Array(192 * 256 * 5);
    for (let p = 0; p < layer.width * layer.height; p++) {
      if (!raw[p * 5 + 3]) continue;
      const x = layer.x + (p % layer.width),
        y = layer.y + Math.floor(p / layer.width);
      full.set(raw.subarray(p * 5, p * 5 + 5), (y * 192 + x) * 5);
    }
    sourceLayers[slot] = full;
    return {
      slot,
      data: "",
      palette: layer.palette,
      preserveWarmSkin: id.startsWith("v6:"),
      sourceLayerId: "roster-sage:" + id,
    };
  }
  const sageParts = [sourcePart("hips", lower.hips)];
  const sageShoes = [];
  for (const side of ["near", "far"]) {
    sageParts.push(
      sourcePart(side + "-thigh", lower[side + "Thigh"]),
      sourcePart(side + "-shin", lower[side + "Shin"]),
    );
    sageShoes.push(sourcePart(side + "-shoe", lower[side + "Shoe"]));
  }
  // Match the existing catalog's source-space waist allowance: the shared V6
  // crop includes a few pixels of the old hoodie, which are not a bottom part.
  // Reuse neighboring owned shorts fabric only inside the existing seam band.
  const hips = sourceLayers.hips,
    hipOriginal = hips.slice();
  let waistAllowance = 0;
  for (let p = 0; p < 192 * 256; p++) {
    const i = p * 5;
    if (!hips[i + 3] || hips[i + 4] !== 3) continue;
    const x = p % 192,
      y = Math.floor(p / 192);
    if (y < 155 || y > 180)
      throw Error(`Sage borrowed top outside waist band ${x},${y}`);
    let found = -1;
    for (let radius = 1; radius <= 18 && found < 0; radius++)
      for (let dx = -radius; dx <= radius && found < 0; dx++) {
        const dy = radius - Math.abs(dx);
        for (const yy of [y + dy, y - dy]) {
          const xx = x + dx;
          if (xx < 0 || xx >= 192 || yy < 0 || yy >= 256) continue;
          const j = (yy * 192 + xx) * 5;
          if (hipOriginal[j + 3] && hipOriginal[j + 4] === 4) {
            found = j;
            break;
          }
        }
      }
    if (found < 0) throw Error("Sage waist fabric not found");
    hips.set(hipOriginal.subarray(found, found + 3), i);
    hips[i + 4] = 4;
    waistAllowance++;
  }
  legacyRecords.push({
    sourceSpaceWaistAllowance: waistAllowance,
    band: [155, 180],
    method: "Existing catalog nearest owned fabric allowance",
  });
  for (const side of ["near", "far"]) {
    const shoe = sourceLayers[side + "-shoe"],
      shin = sourceLayers[side + "-shin"];
    let transferred = 0,
      removed = 0;
    // Assign existing shoe alpha (including fixed outline) to footwear. Skin /
    // sock pixels retain anatomical ownership instead of moving with footwear.
    for (let p = 0; p < 192 * 256; p++) {
      const i = p * 5;
      if (!shoe[i + 3]) {
        if (shin[i + 3] && shin[i + 4] === 5) {
          shin.fill(0, i, i + 5);
          removed++;
        }
        continue;
      }
      if (shoe[i + 4] === 1 || shoe[i + 4] === 4) {
        shin.set(shoe.subarray(i, i + 5), i);
        shoe.fill(0, i, i + 5);
        transferred++;
      } else if (shin[i + 3]) {
        shin.fill(0, i, i + 5);
        removed++;
      }
    }
    legacyRecords.push({
      side,
      transferredSkinOrClothToShin: transferred,
      removedShoeOverlapFromShin: removed,
    });
  }
  for (const part of [...sageParts, ...sageShoes])
    part.data = Buffer.from(zlibSync(sourceLayers[part.slot])).toString(
      "base64",
    );
  const legacy = {
    parts: sageParts,
    shoes: sageShoes,
    chains: {
      nearLeg: [lower.hipNear, lower.kneeNear, lower.ankleNear],
      farLeg: [lower.hipFar, lower.kneeFar, lower.ankleFar],
    },
    records: legacyRecords,
  };
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "log") console.log(message.text());
  });
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/skin-studio.html`,
  );
  const result = await page.evaluate(
    async ({ sources, legacy, compactRun }) => {
      const { importProject, exportProject, encodeAttachmentPng } =
        await import("/src/skeletal/skin-io.ts");
      const { importWardrobeItem, exportWardrobeItem } = await import(
        "/src/skeletal/wardrobe-item-io.ts"
      );
      const { exportWardrobeIdentity, importWardrobeIdentity } = await import(
        "/src/skeletal/identity-io.ts"
      );
      const { validateWardrobeIdentity, defaultCustomWardrobeRecipe } =
        await import("/src/skeletal/identities.ts");
      const { validateWardrobeItem } = await import(
        "/src/skeletal/wardrobe-items.ts"
      );
      const { applyWardrobe } = await import("/src/skeletal/wardrobe.ts");
      const { prepareRig } = await import("/src/skeletal/renderer.ts");
      const { zlibSync } = await import("/node_modules/.vite/deps/fflate.js");
      const W = 192,
        H = 256,
        outputs = {},
        records = [],
        checks = [];
      const from64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      function b64(b) {
        let s = "";
        for (let i = 0; i < b.length; i += 8192)
          s += String.fromCharCode(...b.subarray(i, i + 8192));
        return btoa(s);
      }
      const canonical = (v) =>
        Array.isArray(v)
          ? v.map(canonical)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.keys(v)
                  .sort()
                  .map((k) => [k, canonical(v[k])]),
              )
            : v;
      const same = (a, b) =>
        JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
      const saveBlob = async (name, blob) =>
        (outputs[name] = Array.from(new Uint8Array(await blob.arrayBuffer())));
      const savePng = async (name, pixels) =>
        (outputs[name] = Array.from(await encodeAttachmentPng(pixels)));
      const baseline = await importProject(
        new Blob([from64(sources.baseline.data)]),
      );
      const image = new Image();
      image.src = "data:image/png;base64," + sources.expressions.data;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const source = ctx.getImageData(0, 0, image.width, image.height).data;
      function inside(x, y, poly) {
        let hit = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i],
            [xj, yj] = poly[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
            hit = !hit;
        }
        return hit;
      }
      function nearBoundary(x, y, poly, margin) {
        return poly.some(([ax, ay], i) => {
          const [bx, by] = poly[(i + 1) % poly.length],
            dx = bx - ax,
            dy = by - ay,
            t = Math.max(
              0,
              Math.min(
                1,
                ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy),
              ),
            );
          return Math.hypot(x - ax - t * dx, y - ay - t * dy) <= margin;
        });
      }
      const people = {
        ravi: {
          name: "Ravi",
          palette: { skin: "#e6a16a", hair: "#66412e" },
          scale: 0.34,
          necks: [
            [318, 328],
            [777, 329],
            [1232, 329],
          ],
          boxes: [
            [130, 5, 500, 342],
            [590, 5, 960, 342],
            [1040, 5, 1415, 342],
          ],
          face: [
            [203, 218],
            [253, 214],
            [274, 230],
            [281, 200],
            [321, 176],
            [346, 126],
            [379, 126],
            [379, 156],
            [364, 176],
            [385, 188],
            [408, 186],
            [424, 169],
            [440, 184],
            [438, 269],
            [416, 298],
            [350, 313],
            [354, 338],
            [279, 338],
            [286, 308],
            [253, 292],
            [207, 279],
          ],
          fixed: [
            [286, 193, 361, 259],
            [388, 195, 434, 259],
            [290, 169, 359, 192],
            [397, 171, 436, 192],
            [338, 266, 397, 292],
          ],
        },
        lina: {
          name: "Lina",
          palette: { skin: "#f6bb8e", hair: "#403943" },
          scale: 0.34,
          necks: [
            [329, 647],
            [779, 647],
            [1234, 647],
          ],
          boxes: [
            [120, 342, 510, 659],
            [570, 342, 960, 659],
            [1025, 342, 1415, 659],
          ],
          face: [
            [218, 537],
            [251, 534],
            [267, 553],
            [275, 524],
            [321, 507],
            [367, 478],
            [384, 444],
            [414, 451],
            [437, 485],
            [449, 528],
            [447, 590],
            [427, 613],
            [352, 630],
            [363, 657],
            [289, 657],
            [301, 622],
            [271, 601],
            [217, 602],
          ],
          fixed: [
            [291, 518, 367, 576],
            [399, 517, 446, 577],
            [343, 487, 384, 515],
            [412, 489, 449, 515],
            [353, 584, 410, 609],
          ],
        },
        nora: {
          name: "Nora",
          palette: { skin: "#f7bd96", hair: "#a95634" },
          scale: 0.34,
          necks: [
            [319, 952],
            [775, 952],
            [1237, 953],
          ],
          boxes: [
            [115, 659, 492, 1022],
            [568, 659, 946, 1022],
            [1028, 659, 1418, 1022],
          ],
          face: [
            [207, 850],
            [240, 843],
            [260, 860],
            [271, 836],
            [323, 825],
            [365, 797],
            [384, 767],
            [407, 775],
            [429, 806],
            [438, 845],
            [431, 909],
            [409, 927],
            [346, 936],
            [354, 962],
            [280, 962],
            [291, 934],
            [270, 917],
            [258, 905],
            [208, 904],
          ],
          fixed: [
            [279, 830, 356, 885],
            [384, 828, 431, 886],
            [309, 806, 358, 829],
            [399, 802, 438, 828],
            [338, 887, 397, 916],
          ],
          rear: [
            [112, 853],
            [208, 853],
            [209, 882],
            [240, 902],
            [256, 906],
            [256, 948],
            [263, 971],
            [243, 1020],
            [111, 1020],
          ],
          ribbon: [
            [148, 861],
            [199, 858],
            [219, 883],
            [233, 906],
            [228, 947],
            [209, 950],
            [191, 915],
            [148, 900],
          ],
          fringe: [
            [370, 744],
            [401, 744],
            [405, 761],
            [402, 777],
            [396, 794],
            [385, 809],
            [371, 819],
            [350, 827],
            [338, 829],
            [348, 821],
            [358, 805],
            [365, 791],
            [369, 770],
          ],
        },
      };
      const identities = [],
        headSources = {};
      for (const [id, person] of Object.entries(people)) {
        const parts = [],
          neutral = person.necks[0],
          images = {};
        for (const [e, expr] of ["neutral", "gentle", "joyful"].entries()) {
          const [nx, ny] = person.necks[e],
            box = person.boxes[e],
            pixels = new Uint8ClampedArray(W * H * 4),
            mask = new Uint8ClampedArray(W * H * 4),
            packed = new Uint8Array(W * H * 5);
          let retained = 0,
            materials = [0, 0, 0];
          for (let y = 1; y < H - 1; y++)
            for (let x = 1; x < W - 1; x++) {
              const sx = Math.floor(nx + (x + 0.5 - 96) / person.scale),
                sy = Math.floor(ny + (y + 0.5 - 118) / person.scale);
              if (sx < box[0] || sy < box[1] || sx >= box[2] || sy >= box[3])
                continue;
              const si = (sy * image.width + sx) * 4;
              if (source[si + 3] < 192) continue;
              const rx = sx - nx + neutral[0],
                ry = sy - ny + neutral[1];
              // Pony/ribbon belongs behind the shoulder; retain a 2-source-pixel
              // overlap on its front edge, never truncate the ear or short neck.
              if (person.rear && inside(rx - 2, ry, person.rear)) continue;
              const p = y * W + x,
                [r, g, b] = source.subarray(si, si + 3);
              let m = 2;
              // The source face polygon owns its warm cheek/jaw/neck shadows too.
              // A bright-skin-only threshold incorrectly treated these darker skin
              // pixels as hair and turned the jaw blond during recoloring.
              if (
                inside(rx, ry, person.face) &&
                r > 95 &&
                g > 44 &&
                r > g * 1.1 &&
                g > b * 1.12
              )
                m = 1;
              // Resolve the small pale skin rim at the painted fringe boundary.
              // Only warm bright source pixels within 12 source pixels of the
              // anatomical face contour qualify; copper hair is less yellow.
              if (
                nearBoundary(rx, ry, person.face, 12) &&
                r > 190 &&
                g > r * 0.6 &&
                r > g * 1.1 &&
                g > b * 1.1
              )
                m = 1;
              // Nora's curved copper lock crosses the anatomical face contour;
              // its source ownership must stay hair even in its dark warm tones.
              if (
                person.fringe &&
                inside(rx, ry, person.fringe) &&
                g < r * 0.64
              )
                m = 2;
              for (const [l, t, rr, bb] of person.fixed)
                if (
                  rx >= l &&
                  rx < rr &&
                  ry >= t &&
                  ry < bb &&
                  ((r < 185 && g < 143) ||
                    (g > r * 0.93 && b > g * 0.87) ||
                    (e === 2 &&
                      ry > (id === "ravi" ? 260 : id === "lina" ? 575 : 880) &&
                      r > g * 1.5))
                )
                  m = 0;
              if (r < 61 && g < 52 && b < 48) m = 0;
              pixels.set([r, g, b, 255], p * 4);
              mask.set([m, 0, 0, 255], p * 4);
              packed.set([r, g, b, 255, m], p * 5);
              materials[m]++;
              retained++;
            }
          const slot = "head-" + expr;
          images[slot] = pixels;
          parts.push({
            slot,
            data: b64(zlibSync(packed)),
            palette: person.palette,
            preserveWarmSkin: true,
            sourceLayerId: `roster-${id}:${slot}`,
          });
          await savePng(`identities/${id}/slots/${slot}.png`, pixels);
          await savePng(`identities/${id}/masks/${slot}.png`, mask);
          records.push({
            identity: id,
            slot,
            source: sources.expressions.path,
            sourceCell: box,
            sourceNeck: [nx, ny],
            targetNeck: [96, 118],
            uniformScale: person.scale,
            alphaThreshold: 192,
            retained,
            materials,
          });
        }
        if (person.rear) {
          const pixels = new Uint8ClampedArray(W * H * 4),
            mask = new Uint8ClampedArray(W * H * 4),
            packed = new Uint8Array(W * H * 5);
          for (let y = 1; y < H - 1; y++)
            for (let x = 1; x < W - 1; x++) {
              const sx = Math.floor(neutral[0] + (x + 0.5 - 96) / person.scale),
                sy = Math.floor(neutral[1] + (y + 0.5 - 118) / person.scale);
              if (!inside(sx, sy, person.rear)) continue;
              const i = (sy * image.width + sx) * 4;
              if (source[i + 3] < 192) continue;
              const [r, g, b] = source.subarray(i, i + 3),
                m =
                  inside(sx, sy, person.ribbon) || (r < 61 && g < 52 && b < 48)
                    ? 0
                    : 2,
                p = y * W + x;
              pixels.set([r, g, b, 255], p * 4);
              mask.set([m, 0, 0, 255], p * 4);
              packed.set([r, g, b, 255, m], p * 5);
            }
          images["back-hair"] = pixels;
          parts.push({
            slot: "back-hair",
            data: b64(zlibSync(packed)),
            palette: person.palette,
            preserveWarmSkin: true,
            sourceLayerId: `roster-${id}:back-hair`,
          });
          await savePng(`identities/${id}/slots/back-hair.png`, pixels);
          await savePng(`identities/${id}/masks/back-hair.png`, mask);
        }
        const identity = validateWardrobeIdentity({
          format: "gathria-character-identity",
          version: 1,
          rigId: baseline.rig.id,
          id: "custom-" + id,
          name: person.name,
          provenance: `Original ${person.name} complete design and three expression heads generated with OpenAI image generation during development, 2026-10-18 UTC. Untouched source PNG and prompts: artwork/character-roster/source. Source-specific complete-head registration, uniform scale ${person.scale}, alpha threshold192 and semantic skin/hair/fixed masks: scripts/prepare-character-roster.mjs. ${person.rear ? "Neutral ponytail/ribbon registered as one rear-hair attachment shared across expressions with explicit boundary overlap. " : ""}No runtime image-model calls. Source neutral/gentle distinction and small expression color differences are retained and documented.`,
          frame: { width: 192, height: 256 },
          anchor: [96, 240],
          neck: [96, 118],
          jaw: { center: [111, 78], start: 80, scale: 1, length: 1 },
          hairSway: id === "nora" ? 0.45 : 0,
          palette: person.palette,
          sourceAppearance: {
            ...structuredClone(baseline.skin.metadata.sourceAppearance),
            name: person.name,
            skinTone: person.palette.skin,
            hairColor: person.palette.hair,
            hairstyle: id === "lina" ? "bob" : id === "nora" ? "waves" : "crop",
          },
          parts,
        });
        const zip = await exportWardrobeIdentity(identity),
          reopened = await importWardrobeIdentity(zip);
        if (!same(identity, reopened)) throw Error("Identity roundtrip " + id);
        await saveBlob(`identities/${id}.identity.zip`, zip);
        identities.push(identity);
        headSources[id] = images;
        checks.push({ identity: id, identityZipRoundtrip: true });
        console.log("Registered identity " + id);
      }
      const items = {};
      for (const key of [
        "roseTop",
        "roseBottom",
        "roseShoes",
        "raviTop",
        "linaTop",
      ])
        if (sources[key])
          items[key] = await importWardrobeItem(
            new Blob([from64(sources[key].data)]),
          );
      items.sageBottom = validateWardrobeItem({
        format: "gathria-wardrobe-item",
        version: 3,
        colorModel: "source-relative-v1",
        rigId: baseline.rig.id,
        id: "custom-roster-sage-shorts",
        name: "Sage shorts — portable source",
        group: "bottom",
        parts: legacy.parts,
        chains: legacy.chains,
        provenance:
          "Existing Sage weekend V6 shorts source, decoded offline from polishedBank without changing legacy banks. Original five source channels retained; explicit overlapping footwear pixels assigned to shoe or shin ownership. scripts/prepare-character-roster.mjs records source IDs, alpha and landmarks. Opt-in V3 source-relative material colors; not newly generated artwork.",
      });
      const sageBase = validateWardrobeItem({
        format: "gathria-wardrobe-item",
        version: 3,
        colorModel: "source-relative-v1",
        rigId: baseline.rig.id,
        id: "custom-roster-sage-shoes",
        name: "Sage sneakers — portable source",
        group: "shoes",
        parts: legacy.shoes,
        ankles: {
          near: legacy.chains.nearLeg[2],
          far: legacy.chains.farLeg[2],
        },
        provenance:
          "Existing Sage weekend V6 shoe source. Own source ankle registrations retained. Source skin/cloth owned by shin, footwear retains own outline. Offline extraction only; old sources unchanged.",
      });
      function following(original, bottom, id, name) {
        const shoe = structuredClone(original);
        shoe.version = 5;
        shoe.colorModel = "source-relative-v1";
        shoe.id = id;
        shoe.name = name;
        shoe.runShoes = {};
        for (const side of ["near", "far"]) {
          const chain = side + "Leg",
            part = shoe.parts.find((p) => p.slot === side + "-shoe");
          shoe.parts.push({
            ...part,
            slot: side + "-shoe-run",
            sourceLayerId: part.sourceLayerId + ":follow-run",
          });
          shoe.runShoes[chain] = {
            slot: side + "-shoe-run",
            ankle: shoe.ankles[side],
            sourceShin: bottom.chains[chain][1],
          };
        }
        shoe.provenance +=
          " Explicit V5 run footwear duplicates its own source PNG/mask, registering its matching original lower-leg knee→ankle direction; no Theo source coordinates or independent run shoePitch. Ordinary attachments retained unchanged.";
        return validateWardrobeItem(shoe);
      }
      items.sageShoes = following(
        sageBase,
        items.sageBottom,
        "custom-lina-follow-shoes",
        "Lina sneakers — shin-follow",
      );
      items.noraShoes = following(
        items.roseShoes,
        items.roseBottom,
        "custom-nora-follow-shoes",
        "Nora flats — shin-follow",
      );
      for (const key of ["sageBottom", "sageShoes"])
        await saveBlob(
          `garments/${key}.wardrobe.zip`,
          await exportWardrobeItem(items[key]),
        );
      const theoBottom = baseline.wardrobeItems.find(
          (i) => i.id === baseline.wardrobe.bottom,
        ),
        theoShoes = baseline.wardrobeItems.find(
          (i) => i.id === baseline.wardrobe.shoes,
        );
      const variants = {
        ravi: {
          top: items.raviTop ?? items.roseTop,
          bottom: theoBottom,
          shoes: theoShoes,
          colors: { top: "#3f7180", bottom: "#514547", shoes: "#875638" },
        },
        lina: {
          top: items.linaTop ?? items.roseTop,
          bottom: items.sageBottom,
          shoes: items.sageShoes,
          colors: { top: "#ca903b", bottom: "#6e7051", shoes: "#8a6144" },
        },
        nora: {
          top: items.roseTop,
          bottom: items.sageBottom,
          shoes: items.sageShoes,
          colors: { top: "#eed7b5", bottom: "#c8786b", shoes: "#8b5937" },
        },
      };
      const preflight = [],
        projects = [];
      for (const identity of identities) {
        const id = identity.id.slice(7),
          variant = variants[id],
          ownItems = [variant.top, variant.bottom, variant.shoes];
        for (const t of [items.raviTop, items.linaTop])
          if (t && !ownItems.some((i) => i.id === t.id)) ownItems.push(t);
        const recipe = {
          ...defaultCustomWardrobeRecipe(identity),
          top: variant.top.id,
          bottom: variant.bottom.id,
          shoes: variant.shoes.id,
          colors: {
            skin: identity.palette.skin,
            hair: identity.palette.hair,
            ...variant.colors,
          },
        };
        const motions = structuredClone(baseline.motions);
        if (id !== "ravi") {
          motions.id = "roster-compact-support-1";
          for (const key of motions.clips.run.keys) {
            key.footX *= compactRun.footX;
            key.footLift *= compactRun.footLift;
            key.bodyBob += compactRun.bodyBobOffset;
          }
        }
        const project = applyWardrobe(
          {
            ...structuredClone(baseline),
            motions,
            skin: {
              ...baseline.skin,
              metadata: { ...baseline.skin.metadata, name: identity.name },
            },
            wardrobeItems: ownItems,
            wardrobeIdentities: identities,
          },
          recipe,
        );
        project.preview = {
          ...project.preview,
          animation: "run",
          facing: "right",
          expression: "neutral",
        };
        if (!same(project.rig, baseline.rig))
          throw Error("Unexpected anatomy change");
        for (const action of ["idle", "walk", "jump"])
          if (
            !same(project.motions.clips[action], baseline.motions.clips[action])
          )
            throw Error("Unexpected non-run clip change");
        if (id === "ravi" && !same(project.motions, baseline.motions))
          throw Error("Ravi original motion changed");
        const renderer = prepareRig(project.rig, project.skin, project.motions);
        const record = {
          identity: id,
          skinVersion: project.skin.metadata.version,
          sourceShin: project.skin.metadata.runShoes,
          actions: [],
          warnings: [],
        };
        let blocked = false;
        for (const action of ["idle", "walk", "run", "jump"]) {
          for (
            let key = 0;
            key < project.motions.clips[action].keys.length;
            key++
          ) {
            try {
              const frame = renderer.frame(action, key, "neutral"),
                inspect = renderer.inspect(action, key, "neutral");
              let l = W,
                t = H,
                r = -1,
                b = -1;
              for (let p = 0; p < W * H; p++) {
                const a = frame[p * 4 + 3];
                if (a !== 0 && a !== 255) throw Error("Nonbinary alpha");
                if (a) {
                  l = Math.min(l, p % W);
                  r = Math.max(r, p % W);
                  t = Math.min(t, Math.floor(p / W));
                  b = Math.max(b, Math.floor(p / W));
                }
              }
              record.actions.push({
                action,
                key,
                bounds: [l, t, r + 1, b + 1],
                shoes: action === "run" ? inspect.shoes : undefined,
              });
              if (l < 1 || r > 190 || t < 1 || b > 254)
                record.warnings.push({
                  type: "bounds",
                  action,
                  key,
                  bounds: [l, t, r + 1, b + 1],
                });
              await savePng(`diagnostics/${id}/${action}-${key}.png`, frame);
            } catch (e) {
              record.warnings.push({
                type: "renderer",
                action,
                key,
                message: e.message,
              });
              blocked = true;
            }
          }
        }
        for (const expression of ["neutral", "gentle", "joyful"]) {
          await savePng(
            `diagnostics/${id}/expression-${expression}.png`,
            renderer.frame("idle", 0, expression),
          );
          if (
            !same(
              Array.from(project.skin.images["head-" + expression]),
              Array.from(headSources[id]["head-" + expression]),
            )
          )
            throw Error("Source head colors changed");
        }
        const recolored = applyWardrobe(project, {
            ...recipe,
            colors: { ...recipe.colors, skin: "#8d5a43", hair: "#c6ae73" },
          }),
          coloredRenderer = prepareRig(
            recolored.rig,
            recolored.skin,
            recolored.motions,
          );
        for (const expression of ["neutral", "gentle", "joyful"])
          await savePng(
            `diagnostics/${id}/recolor-${expression}.png`,
            coloredRenderer.frame("idle", 0, expression),
          );
        const zip = await exportProject(project),
          reopened = await importProject(zip);
        if (
          !same(project.motions, reopened.motions) ||
          !same(project.wardrobe, reopened.wardrobe)
        )
          throw Error("Project roundtrip changed metadata");
        await saveBlob(`projects/${id}.rig.zip`, zip);
        preflight.push(record);
        projects.push({
          id,
          wardrobe: recipe,
          libraryItems: ownItems.map((i) => i.id),
          provisionalTop: !sources[id + "Top"] && id !== "nora",
          blocked,
          projectRoundtrip: true,
        });
        console.log(
          "Prepared " +
            id +
            ": " +
            record.actions.length +
            " frames, " +
            record.warnings.length +
            " warnings",
        );
      }
      return {
        outputs,
        records,
        checks,
        preflight,
        projects,
        people,
        legacy: { chains: legacy.chains, ownership: legacy.records },
        baselineUnchanged: {
          rig: true,
          nonRunMotions: true,
          raviMotions: true,
        },
        compactRun,
        staged: !sources.raviTop || !sources.linaTop,
      };
    },
    { sources, legacy, compactRun },
  );
  await mkdir(output, { recursive: true });
  for (const [name, bytes] of Object.entries(result.outputs)) {
    const target = new URL(name, output);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, new Uint8Array(bytes));
  }
  delete result.outputs;
  await writeFile(
    new URL("registration.json", output),
    JSON.stringify(
      {
        inputs: Object.fromEntries(
          Object.entries(sources).map(([k, { data, ...v }]) => [k, v]),
        ),
        ...result,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        projects: result.projects,
        preflight: result.preflight.map(({ identity, actions, warnings }) => ({
          identity,
          frames: actions.length,
          warnings,
        })),
        staged: result.staged,
      },
      null,
      2,
    ),
  );
  execFileSync("python3", [
    "-c",
    String.raw`
from PIL import Image,ImageDraw
from pathlib import Path
import sys,json,zipfile,hashlib
p=Path(sys.argv[1]); names=['ravi','lina','nora']; bg='#eeeadd'
for zoom in [1,2]:
 c=Image.new('RGB',(192*3*zoom,(256*zoom+24)*3),bg);d=ImageDraw.Draw(c)
 for row,name in enumerate(names):
  for col,expr in enumerate(['neutral','gentle','joyful']):
   im=Image.open(p/f'diagnostics/{name}/expression-{expr}.png').convert('RGBA').resize((192*zoom,256*zoom),Image.Resampling.NEAREST)
   x=col*192*zoom;y=row*(256*zoom+24);c.paste(im,(x,y+24),im);d.text((x+4,y+5),f'{name} / {expr}',fill='#26322d')
 c.save(p/f'diagnostics/expressions-{zoom}x.png')
for name in names:
 c=Image.new('RGB',(192*6,280*2),bg);d=ImageDraw.Draw(c)
 for key in range(12):
  file=p/f'diagnostics/{name}/run-{key}.png'
  if not file.exists():continue
  im=Image.open(file).convert('RGBA');x=(key%6)*192;y=(key//6)*280;c.paste(im,(x,y+24),im);d.text((x+4,y+5),f'{name} / key {key+1}',fill='#26322d')
 c.save(p/f'diagnostics/{name}-run-keyframes-1x.png')
counts={'png':0,'zip':0};checks=[]
for folder in ['identities','projects','garments','diagnostics']:
 for f in sorted((p/folder).rglob('*')):
  if f.suffix=='.png':
   with Image.open(f) as im:im.load();assert im.width>0 and im.height>0
   counts['png']+=1
  elif f.suffix=='.zip':
   with zipfile.ZipFile(f) as z:assert z.testzip() is None
   counts['zip']+=1
  else:continue
  checks.append({'path':str(f.relative_to(p)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
r=json.loads((p/'registration.json').read_text());assert not r['staged'];assert all(len(x['actions'])==36 and not x['warnings'] for x in r['preflight'])
report={'counts':counts,'allPrimaryNeutralFrames':108,'primaryRendererWarnings':0,'threeIdentityZIPRoundtrips':True,'threeProjectZIPRoundtrips':True,'files':checks}
(p/'artifact-validation.json').write_text(json.dumps(report,indent=2)+'\n')
`,
    fileURLToPath(output),
  ]);
} finally {
  await browser.close();
  await server.close();
}
