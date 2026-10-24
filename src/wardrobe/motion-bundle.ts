import { strToU8, zipSync } from "fflate";
import { encodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import { sha256 } from "../core/sha256";
import type { Facing, PortableAnimationName } from "../core/types";
import type { LookComparison } from "./look-comparison";
import type { WardrobeProject } from "./contract";
import { createReviewBinding } from "./review-document";
import { planMotionEdges, scanMotionAction } from "./motion-review";
import { exportWardrobeActionGif } from "./action-gif";

export function mirrorMotionFrame(image: RgbaPng, facing: Facing): RgbaPng {
  if (facing !== "left" && facing !== "right")
    throw Error("Choose a valid motion review facing.");
  if (facing === "right") return image;
  const pixels = new Uint8Array(image.pixels.length);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4,
        to = (y * image.width + image.width - 1 - x) * 4;
      pixels.set(image.pixels.subarray(from, from + 4), to);
    }
  return { ...image, pixels };
}

/** Review evidence, not a playable/editable character. Native PNGs retain alpha;
 * the GIF explicitly uses the existing half-size opaque review convention. */
export async function exportMotionBundle(
  comparison: LookComparison,
  project: WardrobeProject,
  referenceProject: WardrobeProject | undefined,
  action: PortableAnimationName,
  facing: Facing,
  edgeIndex: number,
  options: {
    signal?: AbortSignal;
    threshold?: number;
    onProgress?: (message: string) => void;
  } = {},
): Promise<Uint8Array> {
  const check = () => {
    if (options.signal?.aborted)
      throw new DOMException("Motion export canceled.", "AbortError");
  };
  check();
  if (facing !== "left" && facing !== "right")
    throw Error("Choose a valid facing.");
  const plan = planMotionEdges(comparison.manifest, action);
  if (
    !Number.isSafeInteger(edgeIndex) ||
    edgeIndex < 0 ||
    edgeIndex >= plan.length
  )
    throw Error("Select an available transition to export.");
  const current = await createReviewBinding(project);
  const reference = referenceProject
    ? await createReviewBinding(referenceProject)
    : { kind: "original", sourceSha256: current.sourceSha256 };
  check();
  const scan = await scanMotionAction(comparison, action, {
    ...options,
    onProgress: (n, t) => options.onProgress?.(`Checking motion ${n}/${t}`),
  });
  const edge = scan.edges[edgeIndex];
  const files: Record<string, Uint8Array> = {
    "motion.json": strToU8(JSON.stringify(scan, null, 2)),
  };
  const pictures = [];
  for (const [label, frameId, position] of [
    ["from", edge.fromFrameId, edge.fromPosition],
    ["to", edge.toFrameId, edge.toPosition],
  ] as const) {
    for (const look of ["reference", "current"] as const) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      check();
      const frame =
        look === "reference"
          ? comparison.renderSourceFrame(frameId)
          : comparison.renderFrame(frameId);
      const file = `${label}-${look}.png`;
      files[file] = encodeSourceRgbaPng(mirrorMotionFrame(frame, facing));
      pictures.push({ file, look, position, frameId });
    }
  }
  check();
  files["action-comparison.gif"] = await exportWardrobeActionGif(
    comparison,
    action,
    facing,
    {
      signal: options.signal,
      comparison: true,
      referenceLabel: referenceProject ? "PINNED" : "ORIGINAL",
      onProgress: (n, t) =>
        options.onProgress?.(`Encoding original-timing GIF ${n}/${t}`),
    },
  );
  const entries = [];
  let total = 0;
  for (const [file, bytes] of Object.entries(files)) {
    check();
    total += bytes.length;
    if (total > 96 * 1024 * 1024)
      throw Error("Motion evidence exceeds the 96 MiB local limit.");
    entries.push({ file, bytes: bytes.length, sha256: await sha256(bytes) });
  }
  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        format: "gathria-motion-review-bundle",
        version: 1,
        current,
        reference,
        action,
        facing,
        threshold: scan.threshold,
        edge,
        pictures,
        canvas: comparison.manifest.spritesheet,
        anchor: comparison.manifest.anchor,
        coordinateSpace:
          "PNG pixels are native-size with shared anchors, mirrored as a whole for left. JSON coordinates/metrics remain native right-facing.",
        gif: {
          file: "action-comparison.gif",
          scale: 0.5,
          alpha: "opaque cream matte",
          timing:
            "source FPS rounded cumulatively to GIF centiseconds; no tweening",
          loop: scan.loop,
        },
        files: entries,
        note: "Differences are diagnostics, not visual approval. Jump is one-shot. Original drawing and timing remain unchanged.",
      },
      null,
      2,
    ),
  );
  check();
  return zipSync(files, { level: 0, mtime: new Date(2020, 0, 1, 0, 0, 0) });
}
