import { useLayoutEffect, useRef, useState } from "react";
import type { Facing } from "../core/types";
import type { RgbaPng } from "../core/baked-source";
import type { Rect } from "./contract";
import type { LookComparison } from "./look-comparison";
import { reviewDifferenceImage } from "./review-analysis";
import { clampReviewRegion } from "./review-sheets";

export type ReviewCanvasMode = "split" | "overlay" | "difference";

export default function ReviewCanvas({
  comparison,
  frameId,
  facing,
  region,
  mode,
  threshold = 8,
  backdrop = "checker",
}: {
  comparison: LookComparison;
  frameId: number;
  facing: Facing;
  region?: Rect;
  mode: ReviewCanvasMode;
  threshold?: number;
  backdrop?: "cream" | "dark" | "checker";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useLayoutEffect(() => {
    try {
      const target = canvas.current!,
        context = target.getContext("2d")!;
      const sheet = comparison.manifest.spritesheet;
      const crop = clampReviewRegion(
        sheet.frameWidth,
        sheet.frameHeight,
        region,
      );
      const labelHeight = 28,
        gap = 16;
      target.width = mode === "split" ? crop.width * 2 + gap : crop.width;
      target.height = crop.height + labelHeight;
      context.fillStyle = backdrop === "dark" ? "#202631" : "#eeeadf";
      context.fillRect(0, 0, target.width, target.height);
      if (backdrop === "checker") {
        context.fillStyle = "#c4c6c1";
        for (let y = labelHeight; y < target.height; y += 16)
          for (let x = 0; x < target.width; x += 16)
            if (
              (Math.floor((y - labelHeight) / 16) + Math.floor(x / 16)) % 2 ===
              0
            )
              context.fillRect(x, y, 16, 16);
      }
      const reference = comparison.renderSourceFrame(frameId),
        current = comparison.renderFrame(frameId);
      for (const frame of [reference, current])
        if (
          frame.width !== sheet.frameWidth ||
          frame.height !== sheet.frameHeight ||
          frame.pixels.length !== frame.width * frame.height * 4
        )
          throw Error("The review frame dimensions have changed.");
      function draw(image: RgbaPng, panel: number, opacity = 1) {
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
        context.translate(panel * (crop.width + gap), labelHeight);
        context.globalAlpha = opacity;
        context.imageSmoothingEnabled = false;
        if (facing === "left") {
          context.translate(crop.width, 0);
          context.scale(-1, 1);
        }
        context.drawImage(
          source,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height,
        );
        context.restore();
      }
      if (mode === "split") {
        draw(reference, 0);
        draw(current, 1);
      } else if (mode === "difference")
        draw(reviewDifferenceImage(reference, current, threshold, crop), 0);
      else {
        draw(reference, 0);
        draw(current, 0, 0.5);
      }
      context.fillStyle = backdrop === "dark" ? "#f0f0eb" : "#344b3f";
      context.font = "13px sans-serif";
      context.fillText(
        mode === "split"
          ? "Reference"
          : mode === "overlay"
            ? "Reference + current at 50%"
            : "Changed pixels · not a defect score",
        5,
        19,
        crop.width - 10,
      );
      if (mode === "split")
        context.fillText("Current", crop.width + gap + 5, 19, crop.width - 10);
      target.dataset.frameId = String(frameId);
      target.dataset.facing = facing;
      target.dataset.mode = mode;
      target.dataset.crop = JSON.stringify(crop);
      target.dataset.anchor = JSON.stringify(comparison.manifest.anchor);
      target.dataset.threshold = String(threshold);
      setError("");
    } catch (cause) {
      // Never leave stale successful pixels visible under a new pose label.
      if (canvas.current) {
        canvas.current.width = 1;
        canvas.current.height = 1;
      }
      setError(
        cause instanceof Error ? cause.message : "Unable to draw this review.",
      );
    }
  }, [comparison, frameId, facing, region, mode, threshold, backdrop]);
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Review ${mode}: source pose ${frameId}, ${facing}`}
        style={{
          maxWidth: "100%",
          height: "auto",
          display: error ? "none" : "block",
        }}
      />
      {mode === "difference" && (
        <p className="wardrobe-hint">
          Cyan: added opacity. Magenta: removed opacity. Amber: changed color or
          mixed edges. These are image differences, not automatic defect
          judgments.
        </p>
      )}
    </div>
  );
}
