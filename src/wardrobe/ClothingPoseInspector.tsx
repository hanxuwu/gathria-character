import { useEffect, useRef, useState } from "react";
import type { WardrobeGarment } from "./contract";
import { clothingPose } from "./recipe-kit";

export default function ClothingPoseInspector({
  item,
  frameId,
  disabled,
  onExport,
}: {
  item: WardrobeGarment;
  frameId: number;
  disabled: boolean;
  onExport: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false),
    [mask, setMask] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open || !canvas.current) return;
    try {
      const pose = clothingPose(item, frameId),
        image = mask ? pose.mask : pose.image;
      canvas.current.width = image.width;
      canvas.current.height = image.height;
      canvas.current
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
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [item, frameId, open, mask]);
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
          <canvas
            ref={canvas}
            aria-label="Native clothing pose"
            hidden={Boolean(error)}
          />
          <p>
            Use the action and frame controls to inspect the next pose. White in
            the editable-area view belongs to this clothing; the rest is
            protected.
          </p>
          <button
            type="button"
            disabled={disabled || Boolean(error)}
            onClick={onExport}
          >
            Download this pose for painting
          </button>
        </>
      )}
    </div>
  );
}
