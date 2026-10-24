import { useLayoutEffect, useRef } from "react";
import type { Facing } from "../core/types";
import { downloadBlob } from "../core/pack";
import type { LookComparison as Comparison } from "./look-comparison";

export default function LookComparison({
  comparison,
  frameId,
  facing,
  name,
  disabled,
  onExportGif,
  onClear,
}: {
  comparison: Comparison;
  frameId: number;
  facing: Facing;
  name: string;
  disabled: boolean;
  onExportGif: () => void;
  onClear: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const target = canvas.current!,
      context = target.getContext("2d")!;
    const { frameWidth: w, frameHeight: h } = comparison.manifest.spritesheet;
    const gap = 16,
      title = 48;
    target.width = w * 2 + gap;
    target.height = h + title;
    context.fillStyle = "#eeeadf";
    context.fillRect(0, 0, target.width, target.height);
    context.fillStyle = "#344b3f";
    context.font = "18px sans-serif";
    context.fillText("Pinned look", 8, 22, Math.max(1, w - 16));
    context.fillText("Current look", w + gap + 8, 22, Math.max(1, w - 16));
    context.font = "13px sans-serif";
    context.fillText(
      `Pose ${frameId} · ${facing} · 1×`,
      8,
      41,
      Math.max(1, w - 16),
    );
    context.fillText(
      `Pose ${frameId} · ${facing} · 1×`,
      w + gap + 8,
      41,
      Math.max(1, w - 16),
    );
    context.imageSmoothingEnabled = false;
    for (const [index, image] of [
      comparison.renderSourceFrame(frameId),
      comparison.renderFrame(frameId),
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
      context.translate(index * (w + gap), title);
      if (facing === "left") {
        context.translate(w, 0);
        context.scale(-1, 1);
      }
      context.drawImage(source, 0, 0);
      context.restore();
    }
    target.dataset.frameId = String(frameId);
    target.dataset.facing = facing;
    target.dataset.anchor = JSON.stringify(comparison.manifest.anchor);
  }, [comparison, frameId, facing]);
  return (
    <section
      className="wardrobe-look-comparison"
      aria-label="Pinned look comparison"
    >
      <h3>Pinned look · {name}</h3>
      <p className="wardrobe-hint">
        Same pose, attachment point and scale. Your reference stays fixed while
        you try clothes and hair. It lasts until you clear it, switch character,
        reopen a project or leave this page.
      </p>
      <div className="wardrobe-playback-controls">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            canvas.current?.toBlob((blob) => {
              if (blob) downloadBlob(blob, `looks-${frameId}-${facing}-1x.png`);
            }, "image/png")
          }
        >
          Save look comparison PNG
        </button>
        <button type="button" disabled={disabled} onClick={onExportGif}>
          Download look comparison GIF
        </button>
        <button type="button" disabled={disabled} onClick={onClear}>
          Clear pinned look
        </button>
      </div>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Pinned and current looks at the same pose"
      />
    </section>
  );
}
