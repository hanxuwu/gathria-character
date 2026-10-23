import { useEffect, useRef, useState } from "react";
import type { WardrobeGarment } from "./contract";
import { clothingPose } from "./recipe-kit";
import { poseNeighborhood, type PoseClip } from "./pose-neighborhood";

export default function ClothingPoseInspector({
  item,
  frameId,
  disabled,
  onExport,
  clip,
  position,
  onExportNeighbors,
}: {
  item: WardrobeGarment;
  frameId: number;
  disabled: boolean;
  onExport: () => void;
  clip: PoseClip;
  position: number;
  onExportNeighbors: () => void;
}) {
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const neighbors = poseNeighborhood(
    clip,
    Math.min(position, clip.frames.length - 1),
  );
  const [open, setOpen] = useState(false),
    [mask, setMask] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    try {
      for (const neighbor of poseNeighborhood(
        clip,
        Math.min(position, clip.frames.length - 1),
      )) {
        const canvas = canvases.current[neighbor.role];
        if (!canvas) continue;
        const pose = clothingPose(item, neighbor.frameId),
          image = mask ? pose.mask : pose.image;
        canvas.width = image.width;
        canvas.height = image.height;
        canvas
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
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [item, frameId, clip, position, open, mask]);
  return (
    <div className="clothing-pose-inspector">
      <label>
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => setOpen(e.target.checked)}
        />{" "}
        Inspect clothing layer
      </label>
      {open && (
        <>
          <p>
            {item.manifest.name} · source pose {frameId} · native right
          </p>
          <label>
            <input
              type="checkbox"
              checked={mask}
              onChange={(e) => setMask(e.target.checked)}
            />{" "}
            Show editable area
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="clothing-pose-neighbors">
            {neighbors.map((neighbor) => (
              <figure key={neighbor.role}>
                <figcaption>
                  {neighbor.role} · position {neighbor.position + 1} · pose{" "}
                  {neighbor.frameId}
                </figcaption>
                <canvas
                  ref={(node) => {
                    canvases.current[neighbor.role] = node;
                  }}
                  aria-label={
                    neighbor.role === "Current"
                      ? "Native clothing pose"
                      : `${neighbor.role} native clothing pose`
                  }
                  hidden={Boolean(error)}
                />
              </figure>
            ))}
          </div>
          <p>
            Previous and next follow this action’s order; only looping actions
            wrap. White in the editable-area view belongs to this clothing; the
            rest is protected.
          </p>
          <button
            type="button"
            disabled={disabled || Boolean(error)}
            onClick={onExport}
          >
            Download this pose for painting
          </button>
          <button
            type="button"
            disabled={disabled || Boolean(error)}
            onClick={onExportNeighbors}
          >
            Download neighboring poses for painting
          </button>
        </>
      )}
    </div>
  );
}
