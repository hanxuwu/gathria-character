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
  onInspect,
}: {
  item: WardrobeGarment;
  frameId: number;
  disabled: boolean;
  onExport: () => void;
  clip: PoseClip;
  position: number;
  onExportNeighbors: () => void;
  onInspect: () => void;
}) {
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const dialog = useRef<HTMLDialogElement>(null),
    enlarge = useRef<HTMLButtonElement>(null);
  const neighbors = poseNeighborhood(
    clip,
    Math.min(position, clip.frames.length - 1),
  );
  const [open, setOpen] = useState(false),
    [mask, setMask] = useState(false),
    [expanded, setExpanded] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!expanded) {
      enlarge.current?.focus();
      return;
    }
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, [expanded]);
  useEffect(() => {
    if (!open) return;
    try {
      const views = poseNeighborhood(
        clip,
        Math.min(position, clip.frames.length - 1),
      );
      const crops = views.map(
        (v) => item.manifest.frames.find((f) => f.frameId === v.frameId)!,
      );
      // Use one common native-coordinate crop for every enlarged view. Independent
      // per-frame fits would hide drift and change apparent sleeve size.
      const x = expanded
        ? Math.max(0, Math.min(...crops.map((f) => f.offset.x)) - 12)
        : 0;
      const y = expanded
        ? Math.max(0, Math.min(...crops.map((f) => f.offset.y)) - 12)
        : 0;
      const right = expanded
        ? Math.min(
            item.manifest.frameWidth,
            Math.max(...crops.map((f) => f.offset.x + f.rect.width)) + 12,
          )
        : item.manifest.frameWidth;
      const bottom = expanded
        ? Math.min(
            item.manifest.frameHeight,
            Math.max(...crops.map((f) => f.offset.y + f.rect.height)) + 12,
          )
        : item.manifest.frameHeight;
      for (const neighbor of views) {
        const canvas = canvases.current[neighbor.role];
        if (!canvas) continue;
        const pose = clothingPose(item, neighbor.frameId),
          image = mask ? pose.mask : pose.image;
        canvas.width = right - x;
        canvas.height = bottom - y;
        canvas.dataset.cropX = String(x);
        canvas.dataset.cropY = String(y);
        canvas
          .getContext("2d")!
          .putImageData(
            new ImageData(
              new Uint8ClampedArray(image.pixels),
              image.width,
              image.height,
            ),
            -x,
            -y,
          );
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [item, frameId, clip, position, open, mask, expanded]);
  const panels = (
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
        {neighbors.map((n) => (
          <figure key={n.role}>
            <figcaption>
              {n.role} · position {n.position + 1} · pose {n.frameId}
            </figcaption>
            <canvas
              ref={(node) => {
                canvases.current[n.role] = node;
              }}
              aria-label={
                n.role === "Current"
                  ? "Native clothing pose"
                  : `${n.role} native clothing pose`
              }
              hidden={Boolean(error)}
            />
          </figure>
        ))}
      </div>
      <p>
        {expanded
          ? "All three views use the same clothing-area crop, keeping their relative positions and size. "
          : ""}
        Previous and next follow this action’s order; only looping actions wrap.
        White in the editable-area view belongs to this clothing; the rest is
        protected.
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
  );
  return (
    <div className="clothing-pose-inspector">
      <label>
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => {
            setOpen(e.target.checked);
            if (e.target.checked) onInspect();
          }}
        />{" "}
        Inspect clothing layer
      </label>
      {open && (
        <>
          {expanded ? (
            <dialog
              ref={dialog}
              className="clothing-pose-dialog"
              aria-label="Adjacent clothing poses"
              onCancel={() => setExpanded(false)}
            >
              <button type="button" onClick={() => setExpanded(false)}>
                Close larger comparison
              </button>
              {panels}
            </dialog>
          ) : (
            panels
          )}
          <button
            ref={enlarge}
            type="button"
            disabled={disabled || Boolean(error)}
            onClick={() => {
              onInspect();
              setExpanded(true);
            }}
          >
            Open larger comparison
          </button>
        </>
      )}
    </div>
  );
}
