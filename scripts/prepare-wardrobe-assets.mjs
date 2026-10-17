/** Prepare this bounded wardrobe catalog from already-reviewed repository art.
 * This is a development-only adapter. Browser assembly imports only the emitted
 * packed pixels and source landmarks, never the old character generator. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { unzlibSync, zlibSync } from "fflate";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const W = 192;
const H = 256;
const output = resolve(root, "src/skeletal/wardrobe-assets.generated.ts");
const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const { polishedBank } = await server.ssrLoadModule(
    "/src/core/polished-rig.ts",
  );
  const { repairRunningArmParts } = await server.ssrLoadModule(
    "/src/core/running-arm-parts.ts",
  );
  const { CORRECTED_EVERYDAY_EXAMPLES } = await server.ssrLoadModule(
    "/src/core/everyday-presets.ts",
  );
  const sourceConfig = (id) =>
    structuredClone(
      CORRECTED_EVERYDAY_EXAMPLES.find((example) => example.id === id).config,
    );
  const denim = sourceConfig("denim-daytrip");
  const coral = sourceConfig("coral-afternoon");
  const bankFor = (config) =>
    repairRunningArmParts(polishedBank(config), config);
  const layerFor = (bank, id) => {
    const layer = bank.layers.find((item) => item.id === id);
    if (!layer) throw Error(`Missing source layer ${id}.`);
    return layer;
  };

  /** Same anatomical capsule as builtins.ts. Work on all five source channels
   * together, preserving fixed ink and authored material ownership. */
  function cutArm(layer, raw, start, end, startRadius, endRadius) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length2 = dx * dx + dy * dy;
    for (let p = 0; p < layer.width * layer.height; p++) {
      const x = layer.x + (p % layer.width);
      const y = layer.y + Math.floor(p / layer.width);
      const t = ((x - start[0]) * dx + (y - start[1]) * dy) / length2;
      const across =
        Math.abs((x - start[0]) * dy - (y - start[1]) * dx) /
        Math.sqrt(length2);
      if (
        across > 11 ||
        (t < 0 && Math.hypot(x - start[0], y - start[1]) > startRadius) ||
        (t > 1 && Math.hypot(x - end[0], y - end[1]) > endRadius) ||
        raw[p * 5 + 4] === 2
      )
        raw.fill(0, p * 5, p * 5 + 5);
    }
  }

  const sourceSummary = [];
  function decodedFrame(layer) {
    const raw = unzlibSync(Buffer.from(layer.data, "base64"));
    const full = new Uint8Array(W * H * 5);
    for (let p = 0; p < layer.width * layer.height; p++) {
      if (!raw[p * 5 + 3]) continue;
      const x = layer.x + (p % layer.width);
      const y = layer.y + Math.floor(p / layer.width);
      full.set(raw.subarray(p * 5, p * 5 + 5), (y * W + x) * 5);
    }
    return full;
  }

  /** Original clothing crops overlap at the waist. Keep their coverage but
   * remove borrowed cloth: extend the nearest same-part authored fabric into
   * that small seam allowance. Fixed outlines/underskirt ink are never touched.
   * This is a source-space ownership repair, independent of target colors. */
  function ownedWaistAllowance(full, borrowedMaterial, ownedMaterial) {
    const source = full.slice();
    let repaired = 0;
    for (let p = 0; p < W * H; p++) {
      if (!source[p * 5 + 3] || source[p * 5 + 4] !== borrowedMaterial)
        continue;
      const x = p % W;
      const y = Math.floor(p / W);
      if (y < 155 || y > 180)
        throw Error(
          `Borrowed waist material outside registered seam: ${x},${y}`,
        );
      let sample = -1;
      for (let radius = 1; radius <= 18 && sample < 0; radius++)
        for (let dx = -radius; dx <= radius && sample < 0; dx++) {
          const dy = radius - Math.abs(dx);
          for (const py of [y + dy, y - dy]) {
            const px = x + dx;
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const candidate = (py * W + px) * 5;
            if (
              source[candidate + 3] &&
              source[candidate + 4] === ownedMaterial
            ) {
              sample = candidate;
              break;
            }
          }
        }
      if (sample < 0) throw Error(`Missing adjacent fabric at ${x},${y}.`);
      full.set(source.subarray(sample, sample + 3), p * 5);
      full[p * 5 + 4] = ownedMaterial;
      repaired++;
    }
    return repaired;
  }

  function separateShoe(bank, slot, sourceLayerId, full) {
    if (!slot.endsWith("shin") && !slot.endsWith("shoe")) return {};
    const lower = sourceLayerId.includes("trousers")
      ? bank.lower.trousers
      : bank.lower.skirt;
    const near = slot.startsWith("near");
    const shoe = decodedFrame(
      layerFor(bank, near ? lower.nearShoe : lower.farShoe),
    );
    let removedShoe = 0;
    let returnedCuff = 0;
    for (let p = 0; p < W * H; p++) {
      const i = p * 5;
      if (slot.endsWith("shoe")) {
        // These are pixels of the trouser cuff, not part of the boot design.
        if (full[i + 3] && full[i + 4] === 4) {
          full.fill(0, i, i + 5);
          returnedCuff++;
        }
      } else if (shoe[i + 3] && shoe[i + 4] === 4) {
        full.set(shoe.subarray(i, i + 5), i);
        returnedCuff++;
      } else if (
        full[i + 3] &&
        (full[i + 4] === 5 || (shoe[i + 3] && shoe[i + 4] !== 4))
      ) {
        // Existing shoe alpha owns its fixed outline too. A color-only filter
        // would leave dark boot fragments on a shin when switching to flats.
        full.fill(0, i, i + 5);
        removedShoe++;
      }
    }
    return { removedShoe, returnedCuff };
  }

  function part(bank, slot, sourceLayerId, armChain) {
    const layer = layerFor(bank, sourceLayerId);
    const raw = unzlibSync(Buffer.from(layer.data, "base64"));
    if (raw.length !== layer.width * layer.height * 5)
      throw Error(`Invalid packed dimensions in ${sourceLayerId}.`);
    if (armChain) {
      const forearm = slot.endsWith("forearm");
      cutArm(
        layer,
        raw,
        armChain[forearm ? 1 : 0],
        armChain[forearm ? 2 : 1],
        forearm ? 8 : 10,
        forearm ? 20 : 7,
      );
    }
    const full = new Uint8Array(W * H * 5);
    for (let p = 0; p < layer.width * layer.height; p++) {
      if (!raw[p * 5 + 3]) continue;
      const x = layer.x + (p % layer.width);
      const y = layer.y + Math.floor(p / layer.width);
      const material = raw[p * 5 + 4];
      if (x < 0 || x >= W || y < 0 || y >= H)
        throw Error(`Clipped source layer ${sourceLayerId}.`);
      if (raw[p * 5 + 3] !== 255 || material > 5)
        throw Error(`Invalid alpha/material in ${sourceLayerId}.`);
      full.set(raw.subarray(p * 5, p * 5 + 5), (y * W + x) * 5);
    }
    const ownershipEdits = separateShoe(bank, slot, sourceLayerId, full);
    if (slot === "torso")
      ownershipEdits.waistAllowance = ownedWaistAllowance(full, 4, 3);
    if (slot === "hips" || slot === "garment")
      ownershipEdits.waistAllowance = ownedWaistAllowance(full, 3, 4);
    const materials = [0, 0, 0, 0, 0, 0];
    for (let p = 0; p < W * H; p++)
      if (full[p * 5 + 3]) materials[full[p * 5 + 4]]++;
    if (!materials.some(Boolean)) throw Error(`Empty part ${sourceLayerId}.`);
    sourceSummary.push({ slot, sourceLayerId, materials, ownershipEdits });
    return {
      slot,
      data: Buffer.from(zlibSync(full, { level: 9 })).toString("base64"),
      palette: layer.palette,
      preserveWarmSkin: sourceLayerId.startsWith("v6:"),
      sourceLayerId,
    };
  }

  function identity(config, name) {
    const bank = bankFor(config);
    const portrait = bank.portraits[config.hairstyle];
    const parts = [];
    if (portrait.backHair)
      parts.push(part(bank, "back-hair", portrait.backHair));
    for (const expression of ["neutral", "gentle", "joyful"]) {
      const expressionBank = bankFor({ ...config, expression });
      parts.push(
        part(
          expressionBank,
          `head-${expression}`,
          expressionBank.portraits[config.hairstyle].head,
        ),
      );
    }
    return {
      id: config.hairstyle,
      name,
      parts,
      jaw: {
        center: portrait.faceCenter,
        start: portrait.jawStart,
        scale:
          config.faceVariant === "heart"
            ? 0.94
            : config.faceVariant === "round"
              ? 1.055
              : 1,
        length:
          config.faceVariant === "oval"
            ? 1.055
            : config.faceVariant === "round"
              ? 0.97
              : 1,
      },
      sourceAppearance: config,
    };
  }

  function top(config, id, name) {
    const bank = bankFor(config);
    const body = bank.upper[config.upperClothing];
    const chains = {
      nearArm: [body.shoulderNear, body.elbowNear, body.wristNear],
      farArm: [body.shoulderFar, body.elbowFar, body.wristFar],
    };
    const parts = [part(bank, "torso", body.torso)];
    for (const near of [true, false]) {
      const side = near ? "near" : "far";
      const chain = near ? chains.nearArm : chains.farArm;
      parts.push(
        part(bank, `${side}-upper-arm`, body[`${side}UpperArm`], chain),
        part(bank, `${side}-forearm`, body[`${side}Forearm`], chain),
      );
    }
    return { id, name, parts, chains };
  }

  function bottom(config, id, name) {
    const bank = bankFor(config);
    const legs = bank.lower[config.lowerClothing];
    const parts = [part(bank, "hips", legs.hips)];
    for (const side of ["near", "far"])
      parts.push(
        part(bank, `${side}-thigh`, legs[`${side}Thigh`]),
        part(bank, `${side}-shin`, legs[`${side}Shin`]),
      );
    if (legs.garment) parts.push(part(bank, "garment", legs.garment));
    return {
      id,
      name,
      parts,
      chains: {
        nearLeg: [legs.hipNear, legs.kneeNear, legs.ankleNear],
        farLeg: [legs.hipFar, legs.kneeFar, legs.ankleFar],
      },
    };
  }

  function shoes(config, id, name) {
    const bank = bankFor(config);
    const legs = bank.lower[config.lowerClothing];
    return {
      id,
      name,
      parts: [
        part(bank, "near-shoe", legs.nearShoe),
        part(bank, "far-shoe", legs.farShoe),
      ],
      ankles: { near: legs.ankleNear, far: legs.ankleFar },
    };
  }

  const assets = {
    format: "gathria-wardrobe-assets",
    version: 1,
    catalogVersion: 1,
    identities: [
      identity(denim, "Cropped hair"),
      identity(coral, "Long waves"),
    ],
    tops: [
      top(denim, "denim-jacket", "Denim jacket"),
      top(coral, "soft-top", "Soft top"),
    ],
    bottoms: [
      bottom(denim, "trousers", "Trousers"),
      bottom(coral, "short-skirt", "Short skirt"),
    ],
    shoes: [
      shoes(denim, "boots", "Lace-up shoes"),
      shoes(coral, "flats", "Flats"),
    ],
    provenance:
      "Prepared offline from this repository's existing AI-assisted V6 crop/waves heads, illustrated everyday garments and Motion 3 repaired arm/skirt ownership. No new image-model call. Raw authored RGBA+material IDs, source palettes and registration landmarks are retained. Catalog v1 uses one 192×256 humanoid rig family with garment-specific source cut landmarks. See docs/WARDROBE_ASSET_SOURCES.md and docs/ASSET_PROVENANCE.md. Original artwork reuse follows the repository MIT notice; imported artwork retains its own terms.",
  };
  const sourceFiles = [
    "src/core/illustrated-assets.generated.ts",
    "src/core/polished-assets.generated.ts",
    "src/core/running-arm-parts.ts",
    "src/core/polished-rig.ts",
    "src/core/everyday-presets.ts",
    "src/skeletal/builtins.ts",
  ];
  const hashes = {};
  for (const path of sourceFiles)
    hashes[path] = createHash("sha256")
      .update(await readFile(resolve(root, path)))
      .digest("hex");
  const header = `/** Generated by scripts/prepare-wardrobe-assets.mjs. Do not edit packed pixels.\n * Five bytes per registered 192×256 pixel: RGBA, authored material ID.\n * 0=fixed, 1=skin, 2=hair, 3=upper, 4=lower, 5=shoe.\n * Source SHA256: ${JSON.stringify(hashes)}\n */\nimport type { WardrobeAssets } from "./wardrobe-types";\n\n`;
  await writeFile(
    output,
    `${header}export const WARDROBE_ASSETS: WardrobeAssets = ${JSON.stringify(assets, null, 2)};\n`,
  );
  console.log(
    JSON.stringify(
      {
        output,
        identities: assets.identities.length,
        tops: assets.tops.length,
        bottoms: assets.bottoms.length,
        shoes: assets.shoes.length,
        parts: sourceSummary.length,
        sourceFiles: hashes,
        sourceParts: sourceSummary,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
