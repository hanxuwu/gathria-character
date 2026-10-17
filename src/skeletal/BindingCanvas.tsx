import { useEffect, useId, useRef, useState } from "react";
import {
  advanceBindingDrag,
  beginBindingDrag,
  finishBindingDrag,
  nudgeJoint,
  type BindingDrag,
} from "./binding-edit";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type JointTriple,
  type Point,
} from "./types";
import "./binding-editor.css";

export interface BindingCanvasProps {
  pixels: Uint8ClampedArray;
  zoom: number;
  joints: JointTriple;
  jointLabels: readonly string[];
  label: string;
  disabled?: boolean;
  onBegin: () => void;
  onChange: (index: number, point: Point) => void;
  onCommit: () => void;
  onCancel: () => void;
}

type ActiveDrag = {
  pointerId: number;
  index: number;
  button: HTMLButtonElement;
  edit: BindingDrag;
};

/** Source coordinates never mirror with the playback preview. */
export function BindingCanvas({
  pixels,
  zoom,
  joints,
  jointLabels,
  label,
  disabled = false,
  onBegin,
  onChange,
  onCommit,
  onCancel,
}: BindingCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const active = useRef<ActiveDrag | null>(null);
  const [selected, setSelected] = useState(0);
  const helpId = useId();
  // Pointer cancellation and unmount must reach the latest owner transaction.
  const callbacks = useRef({ onBegin, onChange, onCommit, onCancel });
  callbacks.current = { onBegin, onChange, onCommit, onCancel };

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const source = document.createElement("canvas");
    source.width = FRAME_WIDTH;
    source.height = FRAME_HEIGHT;
    source
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels), FRAME_WIDTH, FRAME_HEIGHT),
        0,
        0,
      );
    context.clearRect(0, 0, FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, FRAME_WIDTH * zoom, FRAME_HEIGHT * zoom);
  }, [pixels, zoom]);

  const endDrag = (cancel: boolean) => {
    const drag = active.current;
    if (!drag) return;
    active.current = null;
    if (drag.button.hasPointerCapture(drag.pointerId)) {
      drag.button.releasePointerCapture(drag.pointerId);
    }
    const action = finishBindingDrag(drag.edit, cancel);
    if (action === "cancel") callbacks.current.onCancel();
    if (action === "commit") callbacks.current.onCommit();
  };

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active.current) return;
      event.preventDefault();
      endDrag(true);
    };
    const cancelOnBlur = () => endDrag(true);
    window.addEventListener("keydown", cancelOnEscape);
    window.addEventListener("blur", cancelOnBlur);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape);
      window.removeEventListener("blur", cancelOnBlur);
      endDrag(true);
    };
  }, []);

  useEffect(() => {
    if (disabled) endDrag(true);
  }, [disabled]);

  return (
    <div className="binding-editor">
      <div
        ref={surface}
        className="skin-canvas binding-canvas"
        style={{ width: FRAME_WIDTH * zoom, height: FRAME_HEIGHT * zoom }}
      >
        <canvas
          ref={canvas}
          id="skin-source-canvas"
          width={FRAME_WIDTH * zoom}
          height={FRAME_HEIGHT * zoom}
          role="img"
          aria-label={label}
          data-facing="right"
        />
        <svg
          className="binding-guides"
          viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
          aria-hidden="true"
        >
          <polyline
            className="binding-guide-underlay"
            points={joints.map((point) => point.join(",")).join(" ")}
          />
          <polyline points={joints.map((point) => point.join(",")).join(" ")} />
        </svg>
        {joints.map((point, index) => (
          <button
            key={index}
            type="button"
            className="binding-handle"
            aria-label={`${jointLabels[index]} joint`}
            aria-describedby={helpId}
            aria-pressed={selected === index}
            title={`${jointLabels[index]} (${point[0]}, ${point[1]})`}
            data-joint-index={index}
            data-x={point[0]}
            data-y={point[1]}
            disabled={disabled}
            style={{
              left: `${(point[0] / FRAME_WIDTH) * 100}%`,
              top: `${(point[1] / FRAME_HEIGHT) * 100}%`,
            }}
            onFocus={() => setSelected(index)}
            onPointerDown={(event) => {
              if (disabled || active.current || event.button !== 0) return;
              const bounds = surface.current?.getBoundingClientRect();
              if (!bounds || !bounds.width || !bounds.height) return;
              event.preventDefault();
              event.currentTarget.focus({ preventScroll: true });
              setSelected(index);
              event.currentTarget.setPointerCapture(event.pointerId);
              active.current = {
                pointerId: event.pointerId,
                index,
                button: event.currentTarget,
                edit: beginBindingDrag(
                  point,
                  [event.clientX, event.clientY],
                  bounds,
                ),
              };
            }}
            onPointerMove={(event) => {
              const drag = active.current;
              const bounds = surface.current?.getBoundingClientRect();
              if (!drag || drag.pointerId !== event.pointerId || !bounds)
                return;
              const update = advanceBindingDrag(
                drag.edit,
                [event.clientX, event.clientY],
                bounds,
              );
              drag.edit = update.drag;
              if (update.begin) callbacks.current.onBegin();
              if (update.changed)
                callbacks.current.onChange(drag.index, update.point);
            }}
            onPointerUp={(event) => {
              if (active.current?.pointerId === event.pointerId) endDrag(false);
            }}
            onPointerCancel={(event) => {
              if (active.current?.pointerId === event.pointerId) endDrag(true);
            }}
            onLostPointerCapture={(event) => {
              if (active.current?.pointerId === event.pointerId) endDrag(true);
            }}
            onKeyDown={(event) => {
              if (
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                active.current
              )
                return;
              if (!event.key.startsWith("Arrow")) return;
              event.preventDefault();
              const next = nudgeJoint(point, event.key, event.shiftKey);
              if (!next) return;
              callbacks.current.onBegin();
              callbacks.current.onChange(index, next);
              callbacks.current.onCommit();
            }}
          >
            <span aria-hidden="true">{index + 1}</span>
          </button>
        ))}
      </div>
      <output className="binding-position" aria-label="Selected joint position">
        {jointLabels[selected]} · {joints[selected][0]}, {joints[selected][1]}
      </output>
      <p className="binding-help" id={helpId}>
        Drag a joint, or focus it and use arrow keys. Shift moves 10 px. Escape
        cancels a drag. Source always faces right.
      </p>
    </div>
  );
}
