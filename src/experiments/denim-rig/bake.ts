import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { generateMotionV3 } from "../../core/generator-motion-v3";
import { createCharacterPack } from "../../core/pack";
import type { GeneratedCharacter } from "../../core/types";
import {
  createDefaultProject,
  parseRigProject,
  type RigProject,
} from "./project";
import { prepareSkeletalRig } from "./rig";

export const SKELETAL_GENERATOR_ID = "gathria-denim-skeletal-v1";
let baseline: GeneratedCharacter | undefined;
export function baselineCharacter(): GeneratedCharacter {
  baseline ??= generateMotionV3(createDefaultProject().config);
  // Caller edits must never poison subsequent baseline/export comparisons.
  return {
    ...baseline,
    pixels: baseline.pixels.slice(),
    manifest: structuredClone(baseline.manifest),
  };
}

/** CPU bake at native pixel resolution. Playback receives only PNG + metadata;
 * no skeleton, mesh dependency or drawing/model service is needed by consumers. */
export function bakeRigProject(value: RigProject): GeneratedCharacter {
  const project = parseRigProject(value);
  const generated = baselineCharacter();
  generated.manifest.generator = SKELETAL_GENERATOR_ID;
  const rig = prepareSkeletalRig(project);
  for (let key = 0; key < 12; key++) {
    const f = generated.manifest.frames.find((frame) => frame.id === 12 + key)!;
    const pixels = rig.frame(key);
    for (let row = 0; row < 256; row++)
      generated.pixels.set(
        pixels.subarray(row * 192 * 4, (row + 1) * 192 * 4),
        ((f.y + row) * generated.width + f.x) * 4,
      );
  }
  return generated;
}

export async function createRigPack(
  value: RigProject,
  generated?: GeneratedCharacter,
): Promise<Blob> {
  const project = parseRigProject(value);
  // A caller-provided bake is accepted only if it equals the current recipe.
  const baked = bakeRigProject(project);
  if (
    generated &&
    (JSON.stringify(generated.manifest) !== JSON.stringify(baked.manifest) ||
      generated.pixels.length !== baked.pixels.length ||
      !generated.pixels.every((pixel, i) => pixel === baked.pixels[i]))
  )
    throw Error(
      "The supplied bake does not match the rig project. Bake again before export.",
    );
  const ordinaryPack = await createCharacterPack(project.config, baked);
  const files = unzipSync(new Uint8Array(await ordinaryPack.arrayBuffer()));
  const notice =
    "EXPERIMENTAL DENIM SKELETAL BAKE v1\n" +
    "Run frames use this project's own weighted mesh/triangle renderer. No Spine software, file format, runtime or third-party animation code is included.\n" +
    "Appearance textures reuse the existing AI-assisted V6 sources; no new artwork/model call was made for this experiment. Source revision: " +
    project.sourceRevision +
    ".\n" +
    "Idle/walk pixels are unchanged from Motion 3. character.json preserves appearance; opening it in ordinary Studio intentionally regenerates production Motion 3, NOT this experimental run.\n" +
    "Reproduce the experimental run with rig-lab.html and the separate rig project JSON. The exact recipe is also embedded below. No runtime interpretation is needed for playback.\n\n";
  const historical = strFromU8(files["PROVENANCE.txt"]);
  files["PROVENANCE.txt"] = strToU8(
    notice +
      "Source artwork / baseline provenance (not the experimental run algorithm):\n\n" +
      historical +
      "\nBEGIN GATHRIA RIG PROJECT\n" +
      JSON.stringify(project, null, 2) +
      "\nEND GATHRIA RIG PROJECT\n",
  );
  files["INTEGRATION.md"] = strToU8(
    "# Experimental baked pack\n\n" +
      notice +
      strFromU8(files["INTEGRATION.md"]),
  );
  // The existing validator permits exactly five root files. Authoring source
  // therefore stays separate, with a recovery copy inside provenance text.
  return new Blob([zipSync(files, { level: 6 })], { type: "application/zip" });
}
