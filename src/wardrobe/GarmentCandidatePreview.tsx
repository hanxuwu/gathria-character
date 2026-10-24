import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, X } from "lucide-react";
import { downloadBlob } from "../core/pack";
import type { Facing, PortableAnimationName } from "../core/types";
import type { WardrobeProject } from "./contract";
import type { WardrobeCompositor } from "./compositor";
import { createLookComparison } from "./look-comparison";

interface Props {
  original: WardrobeCompositor;
  candidate: WardrobeCompositor;
  baseProject: WardrobeProject;
  project: WardrobeProject;
  initialAction: PortableAnimationName;
  initialPosition: number;
  initialFacing: Facing;
  onClose: () => void;
  onApply: (project: WardrobeProject) => Promise<void>;
}
const ACTIONS: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/** Owns only inspection state. The parent validates and commits a candidate
 * atomically; neither playback nor PNG export changes the accepted project. */
export default function GarmentCandidatePreview({
  original,
  candidate,
  baseProject,
  project,
  initialAction,
  initialPosition,
  initialFacing,
  onClose,
  onApply,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const beforeCanvas = useRef<HTMLCanvasElement>(null);
  const afterCanvas = useRef<HTMLCanvasElement>(null);
  const alive = useRef(true);
  const applyingNow = useRef(false);
  const elapsed = useRef(0);
  const available = ACTIONS.filter(
    (name) => project.archive.manifest.animations[name],
  );
  const startAction = available.includes(initialAction)
    ? initialAction
    : (available[0] ?? "idle");
  const startClip = project.archive.manifest.animations[startAction];
  const [action, setAction] = useState(startAction);
  const [position, setPosition] = useState(
    Number.isSafeInteger(initialPosition)
      ? Math.max(
          0,
          Math.min(initialPosition, (startClip?.frames.length ?? 1) - 1),
        )
      : 0,
  );
  const [facing, setFacing] = useState(initialFacing);
  const [playing, setPlaying] = useState(false);
  const [applying, setApplying] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [notice, setNotice] = useState("");
  const [zoom, setZoom] = useState("fit");
  const clip = project.archive.manifest.animations[action];
  const frameId = clip?.frames[Math.min(position, clip.frames.length - 1)];
  const aligned = useMemo(() => {
    try {
      return {
        value: createLookComparison(original, candidate, baseProject, project),
        error: "",
      };
    } catch (cause) {
      return { value: null, error: describe(cause) };
    }
  }, [original, candidate, baseProject, project]);
  const width = aligned.value?.manifest.spritesheet.frameWidth ?? 1;
  const height = aligned.value?.manifest.spritesheet.frameHeight ?? 1;
  const invalid =
    aligned.error ||
    renderError ||
    (!clip ? "This candidate has no available action." : "");

  useEffect(() => {
    alive.current = true;
    const restoreFocus = document.activeElement;
    const target = dialog.current;
    target?.showModal();
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      target?.close();
      if (restoreFocus instanceof HTMLElement && restoreFocus.isConnected)
        restoreFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!playing || applying || invalid || !clip) return;
    let raf = 0;
    let previous: number | null = null;
    const duration = (clip.frames.length * 1000) / clip.fps;
    const animate = (now: number) => {
      if (document.hidden) {
        setPlaying(false);
        return;
      }
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
      if (!clip.loop && elapsed.current >= duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [playing, applying, invalid, clip]);

  useLayoutEffect(() => {
    const clear = () => {
      for (const target of [beforeCanvas.current, afterCanvas.current]) {
        if (!target) continue;
        target.width = 1;
        target.height = 1;
        delete target.dataset.renderedFrameId;
        delete target.dataset.framePosition;
        delete target.dataset.renderedAction;
      }
    };
    if (!aligned.value || frameId === undefined) {
      clear();
      return;
    }
    try {
      // Resolve both frames before drawing either panel. A failure never leaves
      // one new panel beside the other panel's previous pose.
      const pictures = [
        aligned.value.renderSourceFrame(frameId),
        aligned.value.renderFrame(frameId),
      ];
      for (const [index, target] of [
        beforeCanvas.current,
        afterCanvas.current,
      ].entries()) {
        if (!target) continue;
        const image = pictures[index];
        const scratch = document.createElement("canvas");
        scratch.width = image.width;
        scratch.height = image.height;
        scratch
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
        target.width = width;
        target.height = height;
        const context = target.getContext("2d")!;
        context.imageSmoothingEnabled = false;
        context.save();
        if (facing === "left") {
          context.translate(width, 0);
          context.scale(-1, 1);
        }
        context.drawImage(scratch, 0, 0);
        context.restore();
        target.dataset.renderedFrameId = String(frameId);
        target.dataset.framePosition = String(position);
        target.dataset.renderedAction = action;
        target.dataset.facing = facing;
        target.dataset.anchor = JSON.stringify(aligned.value.manifest.anchor);
      }
      setRenderError("");
    } catch (cause) {
      clear();
      setPlaying(false);
      setRenderError(describe(cause));
    }
  }, [aligned, frameId, position, action, facing, width, height]);

  async function applyCandidate() {
    if (applyingNow.current || invalid) return;
    applyingNow.current = true;
    setApplying(true);
    setPlaying(false);
    setOperationError("");
    setNotice("");
    try {
      await onApply(project);
      if (alive.current) setNotice("Clothing candidate applied.");
    } catch (cause) {
      if (alive.current) setOperationError(describe(cause));
    } finally {
      applyingNow.current = false;
      if (alive.current) setApplying(false);
    }
  }
  function saveComparison() {
    if (invalid || applying || !beforeCanvas.current || !afterCanvas.current)
      return;
    setPlaying(false);
    setOperationError("");
    const board = document.createElement("canvas"),
      gap = 16,
      title = 48;
    board.width = width * 2 + gap;
    board.height = height + title;
    const ctx = board.getContext("2d")!;
    ctx.fillStyle = "#eeeadf";
    ctx.fillRect(0, 0, board.width, board.height);
    ctx.fillStyle = "#344b3f";
    ctx.font = "18px sans-serif";
    ctx.fillText("Accepted clothing", 8, 22, Math.max(1, width - 16));
    ctx.fillText(
      "Imported candidate",
      width + gap + 8,
      22,
      Math.max(1, width - 16),
    );
    ctx.font = "13px sans-serif";
    for (const x of [8, width + gap + 8])
      ctx.fillText(
        `${action} · pose ${frameId} · ${facing} · 1×`,
        x,
        41,
        Math.max(1, width - 16),
      );
    ctx.drawImage(beforeCanvas.current, 0, title);
    ctx.drawImage(afterCanvas.current, width + gap, title);
    board.toBlob((blob) => {
      if (!alive.current) return;
      if (blob) {
        downloadBlob(
          blob,
          `clothing-candidate-${action}-${frameId}-${facing}-1x.png`,
        );
        setNotice(
          "Candidate comparison PNG saved. The open clothing is unchanged.",
        );
      } else setOperationError("The comparison PNG could not be encoded.");
    }, "image/png");
  }
  const size =
    zoom === "fit"
      ? undefined
      : { width: width * Number(zoom), height: height * Number(zoom) };
  const close = () => {
    if (!applyingNow.current) onClose();
  };
  return (
    <dialog
      ref={dialog}
      className="appearance-update-dialog"
      aria-labelledby="garment-candidate-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="appearance-update-heading">
        <div>
          <h2 id="garment-candidate-title">Preview imported clothing</h2>
          <p>
            Both looks use the same source pose, scale and attachment point.
            Your accepted clothing stays unchanged until you apply this
            candidate.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close clothing candidate preview"
          disabled={applying}
          onClick={close}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="wardrobe-playback-controls">
        <label>
          Action
          <select
            aria-label="Candidate preview action"
            value={action}
            disabled={applying}
            onChange={(event) => {
              setAction(event.target.value as PortableAnimationName);
              setPlaying(false);
              setPosition(0);
              elapsed.current = 0;
            }}
          >
            {available.map((name) => (
              <option key={name} value={name}>
                {name[0].toUpperCase() + name.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Facing
          <select
            aria-label="Candidate preview facing"
            value={facing}
            disabled={applying}
            onChange={(event) => setFacing(event.target.value as Facing)}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </label>
        <button
          type="button"
          disabled={applying || Boolean(invalid)}
          aria-label={
            playing ? "Pause candidate preview" : "Play candidate preview"
          }
          onClick={() => {
            if (!clip) return;
            const restart =
              !playing && !clip.loop && position === clip.frames.length - 1;
            elapsed.current = restart ? 0 : (position * 1000) / clip.fps;
            if (restart) setPosition(0);
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
            aria-label="Candidate preview size"
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
          <figcaption>Accepted clothing</figcaption>
          <canvas
            ref={beforeCanvas}
            width={width}
            height={height}
            style={size}
            role="img"
            aria-label={`Accepted clothing, ${action}, frame ${frameId}, ${facing}`}
            data-testid="garment-candidate-before"
          />
        </figure>
        <figure>
          <figcaption>Imported candidate</figcaption>
          <canvas
            ref={afterCanvas}
            width={width}
            height={height}
            style={size}
            role="img"
            aria-label={`Imported clothing candidate, ${action}, frame ${frameId}, ${facing}`}
            data-testid="garment-candidate-after"
          />
        </figure>
      </div>
      <div className="wardrobe-timeline">
        <label htmlFor="garment-candidate-frame">
          Frame {position + 1} / {clip?.frames.length ?? 0} · {clip?.fps ?? 0}{" "}
          FPS · source {frameId ?? "unavailable"}
        </label>
        <input
          id="garment-candidate-frame"
          type="range"
          aria-label="Candidate preview frame"
          min={0}
          max={Math.max(0, (clip?.frames.length ?? 1) - 1)}
          step={1}
          value={position}
          disabled={applying || !clip}
          onChange={(event) => {
            setPlaying(false);
            setPosition(Number(event.target.value));
            elapsed.current =
              (Number(event.target.value) * 1000) / (clip?.fps ?? 1);
          }}
        />
      </div>
      {(invalid || operationError) && (
        <p className="wardrobe-error" role="alert">
          {invalid || operationError}
        </p>
      )}
      {notice && <p aria-live="polite">{notice}</p>}
      <div className="appearance-update-footer">
        <p>
          Preview action and direction are inspection controls. Applying keeps
          the accepted project's saved playback settings and can be undone
          through styling history.
        </p>
        <button
          type="button"
          disabled={applying || Boolean(invalid)}
          onClick={saveComparison}
        >
          <Download size={15} aria-hidden="true" />
          Save candidate comparison PNG
        </button>
        <button type="button" disabled={applying} onClick={close}>
          Discard clothing candidate
        </button>
        <button
          type="button"
          className="wardrobe-primary"
          disabled={applying || Boolean(invalid)}
          onClick={() => void applyCandidate()}
        >
          {applying
            ? "Applying clothing candidate…"
            : "Apply clothing candidate"}
        </button>
      </div>
    </dialog>
  );
}
