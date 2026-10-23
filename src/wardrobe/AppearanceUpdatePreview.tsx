import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, Pause, Play, X } from "lucide-react";
import type { Facing, PortableAnimationName } from "../core/types";
import type { WardrobeProject } from "./contract";
import type { WardrobeCompositor } from "./compositor";

interface Props {
  original: WardrobeCompositor;
  candidate: WardrobeCompositor;
  project: WardrobeProject;
  initialAction: PortableAnimationName;
  initialPosition: number;
  initialFacing: Facing;
  onClose: () => void;
  onSave: (project: WardrobeProject) => Promise<void>;
}
const ACTIONS: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const title = (value: string) => value[0].toUpperCase() + value.slice(1);

/** This dialog owns its inspection state, never the open editable project. */
export default function AppearanceUpdatePreview({
  original,
  candidate,
  project,
  initialAction,
  initialPosition,
  initialFacing,
  onClose,
  onSave,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const beforeCanvas = useRef<HTMLCanvasElement>(null);
  const afterCanvas = useRef<HTMLCanvasElement>(null);
  const elapsed = useRef(0);
  const [action, setAction] = useState(initialAction);
  const [position, setPosition] = useState(initialPosition);
  const [facing, setFacing] = useState(initialFacing);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState("fit");
  const clip = project.archive.manifest.animations[action]!;
  const frameId = clip.frames[Math.min(position, clip.frames.length - 1)];
  const padding = {
    left: Math.max(original.padding.left, candidate.padding.left),
    right: Math.max(original.padding.right, candidate.padding.right),
    top: Math.max(original.padding.top, candidate.padding.top),
    bottom: Math.max(original.padding.bottom, candidate.padding.bottom),
  };
  const sheet = project.archive.manifest.spritesheet;
  const width = sheet.frameWidth + padding.left + padding.right;
  const height = sheet.frameHeight + padding.top + padding.bottom;

  useEffect(() => {
    const restoreFocus = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (restoreFocus instanceof HTMLElement && restoreFocus.isConnected)
        restoreFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!playing || saving) return;
    let raf = 0;
    let previous: number | null = null;
    const duration = (clip.frames.length * 1000) / clip.fps;
    const animate = (now: number) => {
      if (document.hidden) previous = null;
      else {
        const delta = previous === null ? 0 : now - previous;
        previous = now;
        elapsed.current = clip.loop
          ? (elapsed.current + delta) % duration
          : Math.min(elapsed.current + delta, duration);
        setPosition(
          Math.min(
            Math.floor((elapsed.current * clip.fps) / 1000),
            clip.frames.length - 1,
          ),
        );
        if (!clip.loop && elapsed.current >= duration) setPlaying(false);
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [playing, saving, clip]);

  useLayoutEffect(() => {
    try {
      for (const [target, renderer] of [
        [beforeCanvas.current, original],
        [afterCanvas.current, candidate],
      ] as const) {
        if (!target) continue;
        const pixels = renderer.renderFrame(frameId);
        const scratch = document.createElement("canvas");
        scratch.width = pixels.width;
        scratch.height = pixels.height;
        scratch
          .getContext("2d")!
          .putImageData(
            new ImageData(
              new Uint8ClampedArray(pixels.pixels),
              pixels.width,
              pixels.height,
            ),
            0,
            0,
          );
        const context = target.getContext("2d")!;
        context.clearRect(0, 0, width, height);
        context.save();
        if (facing === "left") {
          context.translate(width, 0);
          context.scale(-1, 1);
        }
        context.drawImage(
          scratch,
          padding.left - renderer.padding.left,
          padding.top - renderer.padding.top,
        );
        context.restore();
        target.dataset.renderedFrameId = String(frameId);
        target.dataset.framePosition = String(position);
        target.dataset.renderedAction = action;
        target.dataset.facing = facing;
      }
    } catch (failure) {
      setPlaying(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [
    original,
    candidate,
    frameId,
    position,
    action,
    facing,
    width,
    height,
    padding.left,
    padding.top,
  ]);

  async function saveCopy() {
    if (saving || error) return;
    setSaving(true);
    setPlaying(false);
    try {
      await onSave(project);
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  }
  const size =
    zoom === "fit"
      ? undefined
      : {
          width: width * Number(zoom),
          height: height * Number(zoom),
        };
  return (
    <dialog
      ref={dialog}
      className="appearance-update-dialog"
      aria-labelledby="appearance-update-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className="appearance-update-heading">
        <div>
          <h2 id="appearance-update-title">Preview updated appearance</h2>
          <p>
            Compare the same original pose. Your open outfit stays unchanged.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close update preview"
          disabled={saving}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="wardrobe-playback-controls">
        <label>
          Action
          <select
            aria-label="Update preview action"
            value={action}
            disabled={saving}
            onChange={(event) => {
              setAction(event.target.value as PortableAnimationName);
              elapsed.current = 0;
              setPosition(0);
              setPlaying(false);
            }}
          >
            {ACTIONS.filter(
              (name) => project.archive.manifest.animations[name],
            ).map((name) => (
              <option key={name} value={name}>
                {title(name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Facing
          <select
            aria-label="Update preview facing"
            value={facing}
            disabled={saving}
            onChange={(event) => setFacing(event.target.value as Facing)}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>
        <button
          type="button"
          disabled={saving || Boolean(error)}
          aria-label={playing ? "Pause update preview" : "Play update preview"}
          onClick={() => {
            const atEnd = !clip.loop && position === clip.frames.length - 1;
            elapsed.current = atEnd ? 0 : (position * 1000) / clip.fps;
            if (atEnd) setPosition(0);
            setPlaying(!playing);
          }}
        >
          {playing ? (
            <Pause size={15} aria-hidden="true" />
          ) : (
            <Play size={15} aria-hidden="true" />
          )}
          {playing ? "Pause" : "Play"}
        </button>
        <label>
          Size
          <select
            aria-label="Update preview size"
            value={zoom}
            onChange={(event) => setZoom(event.target.value)}
          >
            <option value="fit">Fit</option>
            <option value="1">1× native</option>
            <option value="2">2×</option>
          </select>
        </label>
      </div>
      <div
        className={`wardrobe-stage wardrobe-stage--compare ${zoom === "fit" ? "wardrobe-stage--fit" : ""}`}
      >
        <figure>
          <figcaption>Current appearance</figcaption>
          <canvas
            ref={beforeCanvas}
            width={width}
            height={height}
            style={size}
            role="img"
            aria-label={`Current appearance, ${action}, frame ${frameId}, ${facing}`}
            data-testid="appearance-update-before"
          />
        </figure>
        <figure>
          <figcaption>Updated appearance</figcaption>
          <canvas
            ref={afterCanvas}
            width={width}
            height={height}
            style={size}
            role="img"
            aria-label={`Updated appearance, ${action}, frame ${frameId}, ${facing}`}
            data-testid="appearance-update-after"
          />
        </figure>
      </div>
      <div className="wardrobe-timeline">
        <label htmlFor="appearance-update-frame">
          Frame {position + 1} / {clip.frames.length} · {clip.fps} FPS
        </label>
        <input
          id="appearance-update-frame"
          type="range"
          aria-label="Update preview frame"
          min={0}
          max={clip.frames.length - 1}
          step={1}
          value={position}
          disabled={saving}
          onChange={(event) => {
            setPlaying(false);
            setPosition(Number(event.target.value));
            elapsed.current = (Number(event.target.value) * 1000) / clip.fps;
          }}
        />
      </div>
      {error && (
        <p className="wardrobe-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="appearance-copy-saved">
          Updated copy saved. Reopen the downloaded copy to use it. Your
          original outfit is still open.
        </p>
      )}
      <div className="appearance-update-footer">
        <p>
          Clothing, hair color, face and saved action settings are kept. These
          inspection controls do not change the saved copy. Your original is
          never overwritten.
        </p>
        <button type="button" disabled={saving} onClick={onClose}>
          Cancel preview
        </button>
        <button
          type="button"
          className="wardrobe-primary"
          disabled={saving || Boolean(error)}
          onClick={() => void saveCopy()}
        >
          <Download size={15} aria-hidden="true" />
          {saving ? "Saving updated copy…" : "Save updated copy"}
        </button>
      </div>
    </dialog>
  );
}
