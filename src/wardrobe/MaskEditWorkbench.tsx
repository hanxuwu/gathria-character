import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { RgbaPng } from "../core/baked-source";
import { downloadBlob } from "../core/pack";
import type { PortableAnimationName } from "../core/types";
import type { Point, Rect, WardrobeProject } from "./contract";
import {
  compatibleNecklineProfile,
  createMaskEditSession,
  MASK_MAX_DRAFT_BYTES,
  type MaskBuildReport,
  type MaskEditSession,
} from "./mask-edit";
import { useRetainedDialog } from "./retained-dialog";
import "./mask-edit.css";

interface Props {
  active?: boolean;
  project: WardrobeProject;
  itemId: string;
  action: PortableAnimationName;
  position: number;
  onClose: () => void;
  onPreview: (
    bytes: Uint8Array,
    report: MaskBuildReport,
  ) => Promise<void> | void;
}

type PoseView = Awaited<ReturnType<MaskEditSession["loadPose"]>>;
type Tool = "sample" | "cloth" | "restore";
const describe = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const saveJson = (bytes: Uint8Array, filename: string) =>
  downloadBlob(
    new Blob([new Uint8Array(bytes)], { type: "application/json" }),
    filename,
  );
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function imageCanvas(image: RgbaPng): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
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
  return canvas;
}

/** Authoring stays local to this modal. Only an explicitly accepted pose is
 * included in the newly named garment; the parent still validates and previews
 * that garment before it can replace the selected look. */
export default function MaskEditWorkbench({
  active = true,
  project,
  itemId,
  action,
  position,
  onClose,
  onPreview,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sourceCanvas = useRef<HTMLCanvasElement>(null);
  const beforeCanvas = useRef<HTMLCanvasElement>(null);
  const editCanvas = useRef<HTMLCanvasElement>(null);
  const draftInput = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<MaskEditSession | null>(null);
  const alive = useRef(true);
  const activeRef = useRef(active);
  activeRef.current = active;
  const controller = useRef<AbortController | null>(null);
  const request = useRef(0);
  const drawing = useRef<{ pointerId: number; points: Point[] } | null>(null);
  const paintPreview = useRef<() => void>(() => undefined);
  const item = project.items.find((entry) => entry.manifest.id === itemId);
  const clip = project.archive.manifest.animations[action];
  const initialPosition = clamp(position, 0, (clip?.frames.length ?? 1) - 1);
  const initialFrameId = clip?.frames[initialPosition] ?? 0;
  const profile = useMemo(
    () => compatibleNecklineProfile(project, itemId),
    [project, itemId],
  );
  const inheritedReview = Boolean(item?.manifest.necklinePermissionProfile);
  const [reviewedCloth, setReviewedCloth] = useState(inheritedReview);
  const [session, setSession] = useState<MaskEditSession | null>(null);
  const [view, setView] = useState<PoseView | null>(null);
  const [frameId, setFrameId] = useState(initialFrameId);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Preparing the original clothing…");
  const [tool, setTool] = useState<Tool>("sample");
  const [radius, setRadius] = useState(6);
  const [sample, setSample] = useState<Point | null>(null);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [overlay, setOverlay] = useState(true);
  const [area, setArea] = useState<"clothing" | "whole">("clothing");
  const [zoom, setZoom] = useState("fit");
  const [outputId, setOutputId] = useState(
    `${itemId.slice(0, 38)}-mask-${Date.now().toString(36)}`,
  );
  const [outputName, setOutputName] = useState(
    `${item?.manifest.name ?? "Clothing"} · mask review`.slice(0, 120),
  );

  const summaries = session?.summary() ?? [];
  const hasEdits = summaries.some((row) => row.canUndo);
  const acceptedCount = summaries.filter(
    (row) => row.decision === "accepted" && row.stats.changedPixels > 0,
  ).length;
  const pendingCount = summaries.filter(
    (row) => row.decision === "pending" && row.stats.changedPixels > 0,
  ).length;
  // A source drawing can be held at several timeline positions. Include the
  // distinct neighbors of every occurrence, so the last held position still
  // offers the next drawing. The engine enforces the same adjacency rule.
  const neighbors =
    session && clip
      ? clip.frames
          .flatMap((id, index) =>
            id === frameId ? session.neighbors(index) : [],
          )
          .filter(
            (neighbor, index, rows) =>
              rows.findIndex((row) => row.frameId === neighbor.frameId) ===
              index,
          )
      : [];

  useRetainedDialog(dialog, active);

  useLayoutEffect(() => {
    if (active) return;
    const stroke = drawing.current;
    drawing.current = null;
    if (stroke && editCanvas.current?.hasPointerCapture(stroke.pointerId))
      editCanvas.current.releasePointerCapture(stroke.pointerId);
    paintPreview.current = () => undefined;
  }, [active]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
      controller.current?.abort();
      drawing.current = null;
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const token = ++request.current;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setSession(null);
    setView(null);
    setSample(null);
    setBusy(true);
    setError("");
    setNotice("Preparing the original clothing…");
    let created: MaskEditSession | null = null;
    void (async () => {
      try {
        created = await createMaskEditSession(
          project,
          itemId,
          action,
          initialPosition,
          {
            signal: abort.signal,
            ...(reviewedCloth && profile
              ? { necklinePermissionProfile: profile }
              : {}),
          },
        );
        const first = await created.loadPose(initialFrameId);
        if (
          !alive.current ||
          token !== request.current ||
          abort.signal.aborted
        ) {
          created.dispose();
          return;
        }
        sessionRef.current = created;
        setSession(created);
        setFrameId(initialFrameId);
        setView(first);
        setNotice("Choose a cloth sample, then brush the area to correct.");
      } catch (cause) {
        created?.dispose();
        if (alive.current && token === request.current && !abort.signal.aborted)
          setError(describe(cause));
      } finally {
        if (alive.current && token === request.current) setBusy(false);
      }
    })();
    return () => {
      abort.abort();
      created?.dispose();
    };
  }, [
    project,
    itemId,
    action,
    initialPosition,
    initialFrameId,
    profile,
    reviewedCloth,
  ]);

  const crop = useMemo<Rect>(() => {
    const width = session?.width ?? project.registration.frameWidth;
    const height = session?.height ?? project.registration.frameHeight;
    const frame = item?.manifest.frames.find(
      (entry) => entry.frameId === frameId,
    );
    if (area === "whole" || !frame) return { x: 0, y: 0, width, height };
    const left = Math.max(0, frame.offset.x - 64);
    const top = Math.max(0, frame.offset.y - 64);
    return {
      x: left,
      y: top,
      width: Math.min(width, frame.offset.x + frame.rect.width + 64) - left,
      height: Math.min(height, frame.offset.y + frame.rect.height + 64) - top,
    };
  }, [session, project, item, frameId, area]);

  useLayoutEffect(() => {
    if (!active) return;
    const canvases = [
      sourceCanvas.current,
      beforeCanvas.current,
      editCanvas.current,
    ];
    if (!view || view.frameId !== frameId) {
      for (const canvas of canvases) {
        if (!canvas) continue;
        canvas.width = 1;
        canvas.height = 1;
        delete canvas.dataset.frameId;
      }
      paintPreview.current = () => undefined;
      return;
    }
    try {
      const images = [view.source, view.before, view.after];
      const buffers = images.map(imageCanvas);
      const draw = () => {
        for (let index = 0; index < canvases.length; index++) {
          const canvas = canvases[index];
          if (!canvas) continue;
          canvas.width = crop.width;
          canvas.height = crop.height;
          const ctx = canvas.getContext("2d")!;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(buffers[index], -crop.x, -crop.y);
          if (index === 2 && overlay) {
            const colors = new Uint8ClampedArray(crop.width * crop.height * 4);
            for (let cy = 0; cy < crop.height; cy++) {
              for (let cx = 0; cx < crop.width; cx++) {
                const pixel = (cy + crop.y) * view.source.width + cx + crop.x;
                if (!view.source.pixels[pixel * 4 + 3]) continue;
                const offset = (cy * crop.width + cx) * 4;
                const color =
                  view.allowed[pixel] === 0
                    ? [184, 58, 67, 90]
                    : view.allowed[pixel] === 2
                      ? [224, 168, 56, 105]
                      : view.ownership[pixel]
                        ? [32, 160, 148, 85]
                        : null;
                if (color) colors.set(color, offset);
              }
            }
            const layer = document.createElement("canvas");
            layer.width = crop.width;
            layer.height = crop.height;
            layer
              .getContext("2d")!
              .putImageData(
                new ImageData(colors, crop.width, crop.height),
                0,
                0,
              );
            ctx.drawImage(layer, 0, 0);
          }
          if (index === 2 && sample && overlay) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sample.x - crop.x, sample.y - crop.y, 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = "#153d34";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sample.x - crop.x - 8, sample.y - crop.y);
            ctx.lineTo(sample.x - crop.x + 8, sample.y - crop.y);
            ctx.moveTo(sample.x - crop.x, sample.y - crop.y - 8);
            ctx.lineTo(sample.x - crop.x, sample.y - crop.y + 8);
            ctx.stroke();
          }
          if (index === 2 && drawing.current?.points.length) {
            ctx.strokeStyle = tool === "restore" ? "#ac4662" : "#087f76";
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = radius * 2;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            const points = drawing.current.points;
            ctx.moveTo(points[0].x - crop.x, points[0].y - crop.y);
            for (const point of points.slice(1))
              ctx.lineTo(point.x - crop.x, point.y - crop.y);
            if (points.length === 1)
              ctx.lineTo(points[0].x - crop.x + 0.01, points[0].y - crop.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          canvas.dataset.frameId = String(frameId);
          canvas.dataset.cropX = String(crop.x);
          canvas.dataset.cropY = String(crop.y);
          canvas.dataset.nativeWidth = String(view.source.width);
          canvas.dataset.nativeHeight = String(view.source.height);
          canvas.dataset.facing = "right";
        }
      };
      paintPreview.current = draw;
      draw();
    } catch (cause) {
      for (const canvas of canvases) {
        if (!canvas) continue;
        canvas.width = 1;
        canvas.height = 1;
      }
      setError(describe(cause));
    }
  }, [active, view, frameId, crop, overlay, sample, tool, radius, revision]);

  function update(next: PoseView, message?: string) {
    setView(next);
    setRevision((value) => value + 1);
    setError("");
    if (message) setNotice(message);
  }

  async function choosePose(id: number) {
    if (!session || busy || id === frameId) return;
    const token = ++request.current;
    const previousView = view;
    setBusy(true);
    setError("");
    setView(null);
    setSample(null);
    drawing.current = null;
    try {
      const next = await session.loadPose(id);
      if (!alive.current || token !== request.current) return;
      setFrameId(id);
      update(next, `Inspect pose ${id}; changes stay local until accepted.`);
    } catch (cause) {
      if (alive.current && token === request.current) {
        setError(describe(cause));
        // Both the unchanged label and its original pixels remain together.
        setView(previousView);
      }
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  }

  function selectSample(point: Point) {
    if (!view || busy) return;
    const pixel = point.y * view.source.width + point.x;
    if (!view.baseOwnership[pixel] || !view.baseCloth.pixels[pixel * 4 + 3]) {
      setError("Choose a visible pixel belonging to the original clothing.");
      return;
    }
    setSample(point);
    setTool("cloth");
    setError("");
    setNotice(
      `Cloth sample selected at ${point.x}, ${point.y}. Brush the area to cover.`,
    );
  }

  function applyStroke(points: Point[]) {
    if (!session || !view || busy || !points.length) return;
    if (tool === "sample") {
      selectSample(points[0]);
      return;
    }
    if (tool === "cloth" && !sample) {
      setError("Select a cloth sample first.");
      return;
    }
    try {
      const next = session.stroke(frameId, {
        mode: tool,
        points,
        radius,
        ...(sample ? { sample } : {}),
      });
      update(
        next,
        "Stroke added. Inspect the edge and accept this pose when ready.",
      );
    } catch (cause) {
      setError(describe(cause));
    }
  }

  function nativePoint(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(
        Math.floor(
          ((event.clientX - bounds.left) / bounds.width) * crop.width + crop.x,
        ),
        0,
        (session?.width ?? 1) - 1,
      ),
      y: clamp(
        Math.floor(
          ((event.clientY - bounds.top) / bounds.height) * crop.height + crop.y,
        ),
        0,
        (session?.height ?? 1) - 1,
      ),
    };
  }

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current || busy || !view || event.button !== 0) return;
    event.preventDefault();
    const point = nativePoint(event);
    setX(point.x);
    setY(point.y);
    if (tool === "sample") {
      selectSample(point);
      return;
    }
    if (tool === "cloth" && !sample) {
      setError("Select a cloth sample first.");
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = { pointerId: event.pointerId, points: [point] };
    paintPreview.current();
  }

  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!activeRef.current) return;
    const active = drawing.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = nativePoint(event);
    const last = active.points.at(-1)!;
    if (point.x === last.x && point.y === last.y) return;
    // A stroke has a bounded native-point list. The engine also validates the
    // full draft budget before accepting any operation.
    if (active.points.length < 1024) active.points.push(point);
    paintPreview.current();
  }

  function pointerEnd(
    event: ReactPointerEvent<HTMLCanvasElement>,
    cancel = false,
  ) {
    const active = drawing.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drawing.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && activeRef.current) applyStroke(active.points);
    paintPreview.current();
  }

  async function suggestNeighbors() {
    if (!session || busy || !view) return;
    const targets = neighbors.filter((entry) => entry.frameId !== frameId);
    if (!targets.length) return;
    const token = ++request.current;
    setBusy(true);
    setError("");
    const completed: number[] = [];
    const failed: string[] = [];
    try {
      for (const target of targets) {
        if (!alive.current || token !== request.current) return;
        try {
          await session.propose(frameId, target.frameId);
          completed.push(target.frameId);
        } catch (cause) {
          failed.push(`Pose ${target.frameId}: ${describe(cause)}`);
        }
      }
      if (!alive.current || token !== request.current) return;
      setRevision((value) => value + 1);
      setNotice(
        completed.length
          ? `Suggested poses ${completed.join(", ")}. Open each pose to inspect, then accept or reject it.`
          : "No new neighboring suggestion was created.",
      );
      if (failed.length) setError(failed.join(" "));
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  }

  function changeDecision(decision: "accepted" | "rejected" | "pending") {
    if (!session || busy || !view) return;
    try {
      update(
        session.decide(frameId, decision),
        decision === "accepted"
          ? `Pose ${frameId} accepted for this draft. The open outfit is unchanged.`
          : decision === "rejected"
            ? `Pose ${frameId} excluded from the new clothing. Its draft remains available to revise.`
            : `Pose ${frameId} returned to review.`,
      );
    } catch (cause) {
      setError(describe(cause));
    }
  }

  function undo(reset = false) {
    if (!session || busy || !view) return;
    try {
      update(
        reset ? session.reset(frameId) : session.undo(frameId),
        reset
          ? `Pose ${frameId} restored to the original clothing.`
          : "Last stroke undone.",
      );
    } catch (cause) {
      setError(describe(cause));
    }
  }

  function saveDraft() {
    if (!session || busy) return;
    try {
      saveJson(session.serialize(), `${itemId}-${action}.mask-draft.json`);
      setNotice(
        "Mask draft downloaded with its original clothing and pose references.",
      );
      setError("");
    } catch (cause) {
      setError(describe(cause));
    }
  }

  async function openDraft(file?: File) {
    if (!file || !session || busy) return;
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      if (file.size > MASK_MAX_DRAFT_BYTES)
        throw Error("Choose a mask draft no larger than 4 MiB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!alive.current || token !== request.current) return;
      await session.restore(bytes);
      if (!alive.current || token !== request.current) return;
      const entries = session.summary();
      const target = entries.some((row) => row.frameId === frameId)
        ? frameId
        : (entries[0]?.frameId ?? initialFrameId);
      const next = await session.loadPose(target);
      if (!alive.current || token !== request.current) return;
      setFrameId(target);
      setSample(null);
      update(
        next,
        "Draft reopened. Review each pose before building the clothing candidate.",
      );
    } catch (cause) {
      if (alive.current && token === request.current)
        setError(`${describe(cause)} Your current draft has been kept.`);
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  }

  async function previewCandidate() {
    if (!session || busy || !acceptedCount) return;
    const token = ++request.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setNotice(
      "Building the accepted poses into a separate clothing candidate…",
    );
    try {
      const result = await session.build(
        { id: outputId, name: outputName },
        { signal: abort.signal },
      );
      if (!alive.current || token !== request.current || abort.signal.aborted)
        return;
      await onPreview(result.bytes, result.report);
    } catch (cause) {
      if (alive.current && token === request.current && !abort.signal.aborted)
        setError(`${describe(cause)} Your open outfit is unchanged.`);
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  }

  const canvasStyle = {
    width: zoom === "fit" ? "100%" : `${crop.width * Number(zoom)}px`,
    maxWidth: zoom === "fit" ? "100%" : "none",
  };
  const sampleColor =
    view && sample
      ? `rgb(${Array.from(view.baseCloth.pixels.slice((sample.y * view.source.width + sample.x) * 4, (sample.y * view.source.width + sample.x) * 4 + 3)).join(",")})`
      : "transparent";

  return (
    <dialog
      ref={dialog}
      className="mask-edit-workbench"
      aria-label="Clothing mask workbench"
      onCancel={(event) => {
        event.preventDefault();
        if (activeRef.current) onClose();
      }}
    >
      <header className="mask-edit-header">
        <div>
          <h2>Correct clothing edges</h2>
          <p>
            {item?.manifest.name} · {action} · native right-facing artwork
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Close mask workbench
        </button>
      </header>
      <p className="mask-edit-intro">
        Sample existing cloth, then mark where it should cover the original.
        Suggestions stay pending until you inspect each pose. Your current
        outfit and original artwork stay unchanged while this draft is open.
      </p>
      {profile && (
        <div className="mask-edit-permission">
          <label>
            <input
              type="checkbox"
              checked={reviewedCloth}
              disabled={busy || hasEdits || inheritedReview}
              onChange={(event) => setReviewedCloth(event.target.checked)}
            />{" "}
            Include reviewed neckline cloth
          </label>
          <p>
            Allows only the traced original cloth in the six reviewed neckline
            poses. Existing head and hand protection stays in place outside the
            traced cloth pixels. Choose this before editing or reopening a draft
            that uses those areas.
          </p>
        </div>
      )}
      <div className="mask-edit-toolbar">
        <label>
          Source pose
          <select
            value={frameId}
            disabled={busy || !session}
            onChange={(event) => void choosePose(Number(event.target.value))}
          >
            {(session?.frameIds ?? [initialFrameId]).map((id) => (
              <option key={id} value={id}>
                Pose {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          View area
          <select
            value={area}
            onChange={(event) =>
              setArea(event.target.value as "clothing" | "whole")
            }
            disabled={busy}
          >
            <option value="clothing">Clothing area</option>
            <option value="whole">Whole character</option>
          </select>
        </label>
        <label>
          Detail scale
          <select
            value={zoom}
            onChange={(event) => setZoom(event.target.value)}
            disabled={busy}
          >
            <option value="fit">Fit panels</option>
            <option value="1">Native 1×</option>
            <option value="2">Integer 2×</option>
          </select>
        </label>
        <label className="mask-edit-check">
          <input
            type="checkbox"
            checked={overlay}
            onChange={(event) => setOverlay(event.target.checked)}
          />{" "}
          Show mask overlay
        </label>
      </div>
      <div
        className="mask-edit-neighbors"
        aria-label="Neighboring source poses"
      >
        {neighbors.map((neighbor) => (
          <button
            key={`${neighbor.role}-${neighbor.frameId}`}
            type="button"
            disabled={busy || neighbor.frameId === frameId}
            onClick={() => void choosePose(neighbor.frameId)}
          >
            {neighbor.role} · pose {neighbor.frameId}
          </button>
        ))}
      </div>
      <div className="mask-edit-panels">
        <figure>
          <figcaption>Original source</figcaption>
          <div className="mask-edit-canvas-scroll">
            <canvas
              ref={sourceCanvas}
              style={canvasStyle}
              aria-label="Original source for mask review"
            />
          </div>
        </figure>
        <figure>
          <figcaption>Before · selected clothing</figcaption>
          <div className="mask-edit-canvas-scroll">
            <canvas
              ref={beforeCanvas}
              style={canvasStyle}
              aria-label="Original selected clothing"
            />
          </div>
        </figure>
        <figure>
          <figcaption>Draft · edit here</figcaption>
          <div className="mask-edit-canvas-scroll">
            <canvas
              ref={editCanvas}
              style={canvasStyle}
              className={`mask-edit-interactive mask-edit-tool-${tool}`}
              data-testid="mask-edit-canvas"
              aria-label="Editable clothing mask"
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={(event) => pointerEnd(event)}
              onPointerCancel={(event) => pointerEnd(event, true)}
              onLostPointerCapture={(event) => pointerEnd(event, true)}
            />
          </div>
        </figure>
      </div>
      <p className="mask-edit-legend">
        <span className="mask-edit-own">Teal: owned cloth</span>
        <span className="mask-edit-lock">Red: locked area</span>
        <span className="mask-edit-reviewed">
          Amber: reviewed neckline cloth
        </span>
      </p>
      <p className="mask-edit-help">
        These panels isolate the selected clothing on the original source. Hair,
        other clothes and both playback directions are checked in the full
        candidate preview. Use the coordinate controls below as an alternative
        to drawing.
      </p>
      <fieldset className="mask-edit-tools" disabled={busy || !view}>
        <legend>Brush</legend>
        <div className="mask-edit-button-row">
          <button
            type="button"
            aria-pressed={tool === "sample"}
            onClick={() => setTool("sample")}
          >
            Sample cloth
          </button>
          <button
            type="button"
            aria-pressed={tool === "cloth"}
            onClick={() => setTool("cloth")}
          >
            Add clothing
          </button>
          <button
            type="button"
            aria-pressed={tool === "restore"}
            onClick={() => setTool("restore")}
          >
            Restore source
          </button>
          <label>
            Brush size
            <input
              type="number"
              min={1}
              max={48}
              value={radius}
              onChange={(event) =>
                setRadius(clamp(Number(event.target.value) || 1, 1, 48))
              }
            />
          </label>
          <span className="mask-edit-sample">
            <i style={{ backgroundColor: sampleColor }} />
            {sample
              ? `Sample ${sample.x}, ${sample.y}`
              : "No cloth sample selected"}
          </span>
        </div>
        <div className="mask-edit-button-row">
          <label>
            Native X
            <input
              type="number"
              min={0}
              max={(session?.width ?? 1) - 1}
              value={x}
              onChange={(event) =>
                setX(
                  clamp(
                    Math.floor(Number(event.target.value) || 0),
                    0,
                    (session?.width ?? 1) - 1,
                  ),
                )
              }
            />
          </label>
          <label>
            Native Y
            <input
              type="number"
              min={0}
              max={(session?.height ?? 1) - 1}
              value={y}
              onChange={(event) =>
                setY(
                  clamp(
                    Math.floor(Number(event.target.value) || 0),
                    0,
                    (session?.height ?? 1) - 1,
                  ),
                )
              }
            />
          </label>
          <button type="button" onClick={() => selectSample({ x, y })}>
            Use sample coordinates
          </button>
          <button
            type="button"
            disabled={tool === "sample"}
            onClick={() => applyStroke([{ x, y }])}
          >
            Apply brush at coordinates
          </button>
          <button
            type="button"
            disabled={!view?.canUndo}
            onClick={() => undo()}
          >
            Undo stroke
          </button>
          <button
            type="button"
            disabled={!view?.canUndo && !view?.stats.changedPixels}
            onClick={() => undo(true)}
          >
            Reset pose
          </button>
        </div>
        <p className="mask-edit-help">
          Add clothing clones the chosen cloth texture relative to the start of
          each stroke. Locked areas and unavailable cloth samples are skipped.
          Restore source removes this garment's ownership at the brush location.
        </p>
      </fieldset>
      {view && (
        <section className="mask-edit-pose-review">
          <p data-testid="mask-pose-status">
            <strong>
              Pose {view.frameId}: {view.decision}
            </strong>{" "}
            · {view.stats.changedPixels} changed pixels ·{" "}
            {view.stats.addedPixels} added · {view.stats.restoredPixels}{" "}
            restored
          </p>
          {view.warnings.length > 0 && (
            <ul className="mask-edit-warnings">
              {view.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
          <div className="mask-edit-button-row">
            <button
              type="button"
              disabled={busy || !view.stats.changedPixels}
              onClick={() => changeDecision("accepted")}
            >
              Accept pose
            </button>
            <button
              type="button"
              disabled={busy || !view.stats.changedPixels}
              onClick={() => changeDecision("rejected")}
            >
              Reject pose
            </button>
            <button
              type="button"
              disabled={busy || view.decision === "pending"}
              onClick={() => changeDecision("pending")}
            >
              Return to review
            </button>
            <button
              type="button"
              disabled={
                busy ||
                !view.stats.changedPixels ||
                neighbors.every((entry) => entry.frameId === frameId)
              }
              onClick={() => void suggestNeighbors()}
            >
              Suggest neighboring poses
            </button>
          </div>
          <p className="mask-edit-help">
            Propagation follows the registered clothing guides. Different folds,
            occlusions and blurred poses can need manual correction. A
            suggestion is never visual approval.
          </p>
        </section>
      )}
      <section
        className="mask-edit-draft-summary"
        aria-label="Mask draft poses"
      >
        <h3>Review queue</h3>
        <p>
          {acceptedCount} accepted · {pendingCount} pending · up to 8 poses in a
          draft
        </p>
        <div className="mask-edit-button-row">
          {summaries.map((row) => (
            <button
              key={row.frameId}
              type="button"
              disabled={busy || row.frameId === frameId}
              onClick={() => void choosePose(row.frameId)}
              aria-current={row.frameId === frameId ? "true" : undefined}
            >
              Pose {row.frameId} · {row.decision} · {row.stats.changedPixels} px
            </button>
          ))}
        </div>
      </section>
      <section className="mask-edit-output">
        <h3>Save the draft or preview new clothing</h3>
        <div className="mask-edit-button-row">
          <button type="button" disabled={busy || !session} onClick={saveDraft}>
            Save mask draft
          </button>
          <button
            type="button"
            disabled={busy || !session}
            onClick={() => draftInput.current?.click()}
          >
            Open mask draft
          </button>
          <input
            ref={draftInput}
            aria-label="Mask draft file"
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void openDraft(file);
            }}
          />
        </div>
        <div className="mask-edit-output-fields">
          <label>
            New clothing ID
            <input
              value={outputId}
              maxLength={64}
              disabled={busy}
              onChange={(event) => setOutputId(event.target.value)}
            />
          </label>
          <label>
            New clothing name
            <input
              value={outputName}
              maxLength={120}
              disabled={busy}
              onChange={(event) => setOutputName(event.target.value)}
            />
          </label>
        </div>
        <p className="mask-edit-help">
          Only accepted changed poses enter the new garment. Pending and
          rejected edits are excluded; the other poses keep their original
          artwork. Save your draft to retain all review decisions.
        </p>
        <button
          className="mask-edit-primary"
          type="button"
          disabled={
            busy || !acceptedCount || !outputId.trim() || !outputName.trim()
          }
          onClick={() => void previewCandidate()}
        >
          Preview corrected clothing
        </button>
      </section>
      <p
        className="mask-edit-status"
        data-testid="mask-workbench-status"
        role="status"
        aria-live="polite"
      >
        {busy ? "Working… " : ""}
        {notice}
      </p>
      {error && (
        <p className="mask-edit-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
