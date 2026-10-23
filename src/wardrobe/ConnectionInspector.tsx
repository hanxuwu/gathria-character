import { useLayoutEffect, useRef, useState } from "react";
import type { Facing } from "../core/types";
import type { WardrobeCompositor } from "./compositor";
import type { WardrobeProject } from "./contract";
import { downloadBlob } from "../core/pack";

type Region = "head" | "waist" | "feet";

/** Both pictures use one registered source rectangle. No per-layer recentering. */
function regionFor(project: WardrobeProject, frameId: number, region: Region) {
  const record = project.registration.frames.find(
    (f) => f.frameId === frameId,
  )!;
  const p = record.points;
  const w = project.registration.frameWidth;
  const h = project.registration.frameHeight;
  const margin = w * 0.045;
  let left: number, top: number, right: number, bottom: number;
  if (region === "head") {
    const pose = project.appearanceBank?.manifest.poses.find(
      (f) => f.frameId === frameId,
    );
    const bounds = pose?.hairBounds ?? pose?.headBounds;
    left = bounds ? bounds.x : w * 0.13;
    right = bounds ? bounds.x + bounds.width : w * 0.87;
    top = bounds ? bounds.y : h * 0.03;
    bottom = Math.max(
      p.neck.y + margin,
      bounds ? bounds.y + bounds.height : h * 0.55,
    );
  } else {
    const points =
      region === "waist"
        ? [
            p.nearShoulder,
            p.farShoulder,
            p.nearElbow,
            p.farElbow,
            p.waistLeft,
            p.waistRight,
          ]
        : [
            p.waistLeft,
            p.waistRight,
            p.nearKnee,
            p.farKnee,
            p.nearAnkle,
            p.farAnkle,
            p.nearToe,
            p.farToe,
          ];
    left = Math.min(...points.map((p) => p.x));
    right = Math.max(...points.map((p) => p.x));
    top = Math.min(...points.map((p) => p.y));
    bottom = Math.max(...points.map((p) => p.y));
  }
  return {
    x: Math.floor(left - margin),
    y: Math.floor(top - margin),
    width: Math.max(1, Math.ceil(right - left + 2 * margin)),
    height: Math.max(1, Math.ceil(bottom - top + 2 * margin)),
  };
}

export default function ConnectionInspector({
  project,
  renderer,
  frameId,
  facing,
}: {
  project: WardrobeProject;
  renderer: WardrobeCompositor;
  frameId: number;
  facing: Facing;
}) {
  const [region, setRegion] = useState<Region>("head");
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const rect = regionFor(project, frameId, region);
    // Source coordinates can extend beyond the original silhouette into the
    // appearance padding. Clamp both images against the same padded canvas.
    const sheet = renderer.manifest.spritesheet;
    const x = Math.max(0, rect.x + renderer.padding.left);
    const y = Math.max(0, rect.y + renderer.padding.top);
    const width = Math.max(1, Math.min(sheet.frameWidth - x, rect.width));
    const height = Math.max(1, Math.min(sheet.frameHeight - y, rect.height));
    const target = canvas.current!;
    const scale = 2,
      gap = 16,
      label = 28;
    target.width = width * scale * 2 + gap;
    target.height = height * scale + label;
    const context = target.getContext("2d")!;
    context.fillStyle = "#eeeadf";
    context.fillRect(0, 0, target.width, target.height);
    context.fillStyle = "#344b3f";
    context.font = "13px sans-serif";
    context.fillText("Original · 2×", 5, 18);
    context.fillText("Current look · 2×", width * scale + gap + 5, 18);
    context.imageSmoothingEnabled = false;
    for (const [index, image] of [
      renderer.renderSourceFrame(frameId),
      renderer.renderFrame(frameId),
    ].entries()) {
      const source = document.createElement("canvas");
      source.width = image.width;
      source.height = image.height;
      source
        .getContext("2d")!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(image.pixels),
            image.width,
            image.height,
          ),
          0,
          0,
        );
      context.save();
      context.translate(index * (width * scale + gap), label);
      if (facing === "left") {
        context.translate(width * scale, 0);
        context.scale(-1, 1);
      }
      context.drawImage(
        source,
        x,
        y,
        width,
        height,
        0,
        0,
        width * scale,
        height * scale,
      );
      context.restore();
    }
    target.dataset.frameId = String(frameId);
    target.dataset.facing = facing;
  }, [project, renderer, frameId, region, facing]);
  return (
    <section className="wardrobe-inspector" aria-label="Connection inspector">
      <div className="wardrobe-playback-controls">
        <label>
          Inspect area
          <select
            aria-label="Inspection area"
            value={region}
            onChange={(e) => setRegion(e.target.value as Region)}
          >
            <option value="head">Hair, ears & neck</option>
            <option value="waist">Shoulders & waist</option>
            <option value="feet">Hem, knees & shoes</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            canvas.current?.toBlob((blob) => {
              if (blob)
                downloadBlob(
                  blob,
                  `connections-${region}-${frameId}-${facing}-2x.png`,
                );
            }, "image/png")
          }
        >
          Save comparison PNG
        </button>
      </div>
      <p className="wardrobe-hint">
        Same source frame and crop · 2× pixels. Inspection and slow playback do
        not change your exports.
      </p>
      <div className="wardrobe-inspector-scroll">
        <canvas
          ref={canvas}
          role="img"
          aria-label="Original and current connection crops"
        />
      </div>
    </section>
  );
}
