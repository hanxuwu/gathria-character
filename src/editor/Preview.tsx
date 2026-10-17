import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AnimationName, Facing, GeneratedCharacter } from "../core/types";

export function useSpriteSheet(generated: GeneratedCharacter) {
  const sheet = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(0);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = generated.width;
    canvas.height = generated.height;
    canvas
      .getContext("2d")!
      .putImageData(
        new ImageData(
          new Uint8ClampedArray(generated.pixels),
          generated.width,
          generated.height,
        ),
        0,
        0,
      );
    sheet.current = canvas;
    setReady((v) => v + 1);
  }, [generated]);
  return { sheet, ready };
}

interface PreviewProps {
  generated: GeneratedCharacter;
  animation: AnimationName;
  facing: Facing;
  playing: boolean;
  speed: number;
  zoom: number;
  onFrame?: (frame: number) => void;
}
export function CharacterPreview({
  generated,
  animation,
  facing,
  playing,
  speed,
  zoom,
  onFrame,
}: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { sheet, ready } = useSpriteSheet(generated);
  const elapsed = useRef(0);
  const frameCallback = useRef(onFrame);
  frameCallback.current = onFrame;
  useEffect(() => {
    elapsed.current = 0;
  }, [animation, facing, generated]);
  useEffect(() => {
    let raf = 0;
    let previous = 0;
    let lastFrame = -1;
    const draw = (now: number) => {
      if (previous && playing)
        elapsed.current += Math.min(now - previous, 100) * speed;
      previous = now;
      const sequence =
        generated.manifest.animations[animation] ??
        generated.manifest.animations.idle;
      const offset =
        Math.floor((elapsed.current * sequence.fps) / 1000) %
        sequence.frames.length;
      const frame = generated.manifest.frames.find(
        (item) => item.id === sequence.frames[offset],
      )!;
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx && sheet.current) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        if (facing === "left") {
          ctx.translate(ctx.canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(
          sheet.current,
          frame.x,
          frame.y,
          frame.width,
          frame.height,
          0,
          0,
          frame.width * zoom,
          frame.height * zoom,
        );
        ctx.restore();
        if (lastFrame !== offset) {
          frameCallback.current?.(offset + 1);
          lastFrame = offset;
        }
      }
      if (playing) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [generated, animation, facing, playing, speed, zoom, ready, sheet]);
  return (
    <canvas
      ref={canvasRef}
      width={generated.manifest.spritesheet.frameWidth * zoom}
      height={generated.manifest.spritesheet.frameHeight * zoom}
      role="img"
      aria-label={`${generated.manifest.name}, ${animation}, facing ${facing}`}
      data-testid="character-preview"
    />
  );
}

export function Filmstrip({
  generated,
  animation,
  activeFrame,
}: {
  generated: GeneratedCharacter;
  animation: AnimationName;
  activeFrame: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { sheet, ready } = useSpriteSheet(generated);
  const sequence =
    generated.manifest.animations[animation] ??
    generated.manifest.animations.idle;
  const { frameWidth, frameHeight } = generated.manifest.spritesheet;
  const slotWidth = frameWidth + 16;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !sheet.current) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.imageSmoothingEnabled = false;
    sequence.frames.forEach((id, i) => {
      const frame = generated.manifest.frames.find((item) => item.id === id)!;
      ctx.drawImage(
        sheet.current!,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        i * slotWidth + 8,
        0,
        frame.width,
        frame.height,
      );
    });
  }, [ready, generated, sequence, sheet, slotWidth]);
  return (
    <div className="filmstrip-scroll">
      <div
        className="filmstrip"
        style={
          {
            width: sequence.frames.length * slotWidth,
            "--frame-slot": `${slotWidth}px`,
          } as CSSProperties
        }
      >
        <canvas
          ref={ref}
          width={sequence.frames.length * slotWidth}
          height={frameHeight}
          aria-label={`${animation} animation frames`}
        />
        <div className="frame-labels">
          {sequence.frames.map((id, i) => (
            <span
              className={activeFrame === i + 1 ? "active" : ""}
              key={`${i}-${id}`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
