/** Offline-source adapter only. The reusable renderer never imports this file
 * or the legacy character banks: a loaded SkinPack supplies all its pixels. */
import { unzlibSync } from "fflate";
import { CORRECTED_EVERYDAY_EXAMPLES } from "../core/everyday-presets";
import { polishedBank } from "../core/polished-rig";
import { repairRunningArmParts } from "../core/running-arm-parts";
import { expressiveColors } from "../core/expressive-face";
import type { IllustratedLayer } from "../core/illustrated-types";
import type { ArtV6CharacterConfig } from "../core/types";
import { createMotionLibrary, createRigDefinition } from "./definition";
import {
  RIG_ID,
  type AuthoringProject,
  type SkinPack,
  type Slot,
  type Point,
} from "./types";

export type BuiltinSkinId = "denim-daytrip" | "coral-afternoon";
function coloredLayer(layer: IllustratedLayer, config: ArtV6CharacterConfig) {
  const pixels = expressiveColors(layer, {
    ...config,
    artworkVersion: 4,
    expression: config.expression === "neutral" ? "gentle" : config.expression,
  });
  if (layer.id.startsWith("v6:") && layer.palette.skin) {
    const raw = unzlibSync(
      Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)),
    );
    const base = [1, 3, 5].map((i) =>
      parseInt(layer.palette.skin!.slice(i, i + 2), 16),
    );
    const light = (v: readonly number[]) =>
      v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
    const baseLight = light(base);
    for (let p = 0; p < layer.width * layer.height; p++) {
      if (raw[p * 5 + 4] !== 1) continue;
      const lum = light([raw[p * 5], raw[p * 5 + 1], raw[p * 5 + 2]]);
      for (let c = 0; c < 3; c++) {
        const neutral =
          lum <= baseLight
            ? (base[c] * lum) / baseLight
            : base[c] +
              ((255 - base[c]) * (lum - baseLight)) / (255 - baseLight);
        pixels[p * 4 + c] += (raw[p * 5 + c] - neutral) * 0.35;
      }
    }
  }
  return pixels;
}

/** Preserve Motion 3's anatomical arm ownership. This extraction produces
 * ordinary RGBA PNG slots; runtime users can replace them without these banks. */
function cutArm(
  layer: IllustratedLayer,
  pixels: Uint8ClampedArray,
  start: Point,
  end: Point,
  startRadius: number,
  endRadius: number,
) {
  const raw = unzlibSync(
    Uint8Array.from(atob(layer.data), (c) => c.charCodeAt(0)),
  );
  const dx = end[0] - start[0],
    dy = end[1] - start[1],
    l2 = dx * dx + dy * dy;
  for (let p = 0; p < layer.width * layer.height; p++) {
    const x = layer.x + (p % layer.width),
      y = layer.y + Math.floor(p / layer.width);
    const t = ((x - start[0]) * dx + (y - start[1]) * dy) / l2;
    const across =
      Math.abs((x - start[0]) * dy - (y - start[1]) * dx) / Math.sqrt(l2);
    if (
      across > 11 ||
      (t < 0 && Math.hypot(x - start[0], y - start[1]) > startRadius) ||
      (t > 1 && Math.hypot(x - end[0], y - end[1]) > endRadius) ||
      raw[p * 5 + 4] === 2
    )
      pixels.fill(0, p * 4, p * 4 + 4);
  }
}
function fullFrame(layer: IllustratedLayer, pixels: Uint8ClampedArray) {
  const result = new Uint8ClampedArray(192 * 256 * 4);
  for (let y = 0; y < layer.height; y++)
    for (let x = 0; x < layer.width; x++) {
      const p = (y * layer.width + x) * 4;
      if (pixels[p + 3])
        result.set(
          pixels.subarray(p, p + 4),
          ((y + layer.y) * 192 + x + layer.x) * 4,
        );
    }
  return result;
}

export function createBuiltinSkin(id: BuiltinSkinId): SkinPack {
  if (id !== "denim-daytrip" && id !== "coral-afternoon")
    throw Error("Unknown built-in skin.");
  const config = structuredClone(
    CORRECTED_EVERYDAY_EXAMPLES.find((x) => x.id === id)!.config,
  );
  const bank = repairRunningArmParts(polishedBank(config), config);
  const body = bank.upper[config.upperClothing],
    legs = bank.lower[config.lowerClothing];
  const portrait = bank.portraits[config.hairstyle];
  const lookup = new Map(bank.layers.map((l) => [l.id, l]));
  const ids: Partial<Record<Slot, string>> = {
    torso: body.torso,
    hips: legs.hips,
    "near-upper-arm": body.nearUpperArm,
    "near-forearm": body.nearForearm,
    "far-upper-arm": body.farUpperArm,
    "far-forearm": body.farForearm,
    "near-thigh": legs.nearThigh,
    "near-shin": legs.nearShin,
    "near-shoe": legs.nearShoe,
    "far-thigh": legs.farThigh,
    "far-shin": legs.farShin,
    "far-shoe": legs.farShoe,
    "back-hair": portrait.backHair,
    garment: legs.garment,
  };
  const chains = {
    nearArm: [body.shoulderNear, body.elbowNear, body.wristNear] as const,
    farArm: [body.shoulderFar, body.elbowFar, body.wristFar] as const,
    nearLeg: [legs.hipNear, legs.kneeNear, legs.ankleNear] as const,
    farLeg: [legs.hipFar, legs.kneeFar, legs.ankleFar] as const,
  };
  const images: SkinPack["images"] = {};
  for (const [key, value] of Object.entries(ids)) {
    if (!value) continue;
    const layer = lookup.get(value)!;
    const pixels = coloredLayer(layer, config);
    if (key.endsWith("upper-arm") || key.endsWith("forearm")) {
      const chain = key.startsWith("near") ? chains.nearArm : chains.farArm;
      const fore = key.endsWith("forearm");
      cutArm(
        layer,
        pixels,
        chain[fore ? 1 : 0],
        chain[fore ? 2 : 1],
        fore ? 8 : 10,
        fore ? 20 : 7,
      );
    }
    images[key as Slot] = fullFrame(layer, pixels);
  }
  for (const expression of ["neutral", "gentle", "joyful"] as const) {
    const c = { ...config, expression };
    const b = polishedBank(c),
      head = b.portraits[c.hairstyle].head;
    const layer = b.layers.find((l) => l.id === head)!;
    images[`head-${expression}`] = fullFrame(layer, coloredLayer(layer, c));
  }
  return {
    metadata: {
      format: "gathria-skin-pack",
      version: 1,
      id,
      name: config.name,
      rigId: RIG_ID,
      sourceAppearance: config,
      provenance:
        "Prepared from this repository's existing AI-assisted V6 source artwork at 391d842c5241814aca39bed94df4373e0ceb346f. Technical extraction reuses polishedBank and Motion 3 arm ownership; no new model call or third-party illustration. Full-frame RGBA slots retain source color/texture. See docs/ASSET_PROVENANCE.md and docs/REUSABLE_RIG_REVIEW.md. Original project artwork reuse follows the repository MIT notice; imported replacement art retains its own source terms.",
      slots: Object.keys(images) as Slot[],
      bindings: {
        chains: structuredClone(chains),
        offsets: {},
        mesh: { blendRadius: 6, volume: 0.65 },
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
        hairSway: 1,
        garmentSway: 1,
      },
    },
    images,
  };
}

export function createAuthoringProject(
  skin: SkinPack = createBuiltinSkin("denim-daytrip"),
): AuthoringProject {
  return {
    format: "gathria-rig-authoring",
    version: 1,
    rig: createRigDefinition(),
    motions: createMotionLibrary(),
    skin: structuredClone(skin),
    preview: { animation: "run", facing: "right", expression: "gentle" },
  };
}
