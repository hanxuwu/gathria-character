import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  characterPackImages,
  downloadBlob,
  loadPortableCharacterPack,
  releaseCharacterImages,
  safeFilename,
  type LoadedCharacterPack,
} from "../core/pack";
import { encodeSourceRgbaPngAsync } from "../core/baked-source";
import type { Facing, PortableAnimationName } from "../core/types";
import { drawCharacterFrame, imageForFrame } from "../consumer/player";
import type { WardrobeProject } from "../wardrobe/contract";
import {
  exportWardrobeCharacterPack,
  type WardrobeCompositor,
} from "../wardrobe/compositor";
import { mirrorMotionFrame } from "../wardrobe/motion-bundle";
import { themeActionGif, themeFramePng } from "../themes/media";
import { buildPixelCandidate, type PixelCandidate } from "./pack";
import {
  DEFAULT_PIXEL_SETTINGS,
  STRONG_PIXEL_SETTINGS,
  type PixelSettings,
} from "./refine";
import "./pixel.css";

interface Props {
  project: WardrobeProject;
  renderer: WardrobeCompositor;
  initialAction: PortableAnimationName;
  initialPosition: number;
  initialFacing: Facing;
  onClose: () => void;
}
interface Accepted {
  candidate: PixelCandidate;
  loaded: LoadedCharacterPack;
}
const ACTIONS: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const save = (bytes: Uint8Array, name: string, type = "application/zip") =>
  downloadBlob(new Blob([new Uint8Array(bytes)], { type }), name);
const release = (value: Accepted | null) => {
  if (value) releaseCharacterImages(characterPackImages(value.loaded));
};
const check = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException("Canceled", "AbortError");
};
const sameSettings = (left: PixelSettings, right: PixelSettings) =>
  left.factor === right.factor &&
  left.colors === right.colors &&
  left.sampling === right.sampling &&
  left.finish === right.finish;
const settingsName = (settings: PixelSettings) =>
  sameSettings(settings, DEFAULT_PIXEL_SETTINGS)
    ? "Detailed pixels"
    : sameSettings(settings, STRONG_PIXEL_SETTINGS)
      ? "Strong pixels"
      : "Custom pixels";

/** The smooth reference is drawn straight from the frozen wardrobe compositor.
 * Only its display is scaled; no second source atlas is decoded for preview. */
function PixelComparison({
  accepted,
  renderer,
  frameId,
  position,
  facing,
  zoom,
}: {
  accepted: Accepted;
  renderer: WardrobeCompositor;
  frameId: number;
  position: number;
  facing: Facing;
  zoom: number;
}) {
  const before = useRef<HTMLCanvasElement>(null);
  const after = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const previous = useRef<number | null>(null);
  const [error, setError] = useState("");
  const { mapping } = accepted.candidate.report;

  useLayoutEffect(() => {
    const a = before.current,
      b = after.current;
    if (!a || !b) return;
    try {
      const surface = (scratch.current ??= document.createElement("canvas"));
      if (previous.current !== frameId) {
        const image = renderer.renderFrame(frameId);
        surface.width = image.width;
        surface.height = image.height;
        surface
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
        previous.current = frameId;
      }
      a.width = b.width = mapping.width * zoom;
      a.height = b.height = mapping.height * zoom;
      const source = a.getContext("2d")!;
      source.imageSmoothingEnabled = true;
      source.imageSmoothingQuality = "high";
      source.save();
      if (facing === "left") {
        source.translate(a.width, 0);
        source.scale(-1, 1);
      }
      source.drawImage(
        surface,
        (mapping.padding.left * zoom) / mapping.factor,
        (mapping.padding.top * zoom) / mapping.factor,
        (surface.width * zoom) / mapping.factor,
        (surface.height * zoom) / mapping.factor,
      );
      source.restore();
      const { loaded } = accepted;
      const frame = loaded.manifest.frames.find(
        (entry) => entry.id === frameId,
      );
      if (!frame)
        throw Error("This source pose is missing from the candidate.");
      drawCharacterFrame(
        b.getContext("2d")!,
        imageForFrame(loaded, frame),
        loaded.manifest,
        frame,
        facing,
        zoom,
        {
          x:
            (facing === "left"
              ? mapping.width - mapping.anchor.x
              : mapping.anchor.x) * zoom,
          y: mapping.anchor.y * zoom,
        },
      );
      setError("");
    } catch (cause) {
      setError(message(cause));
    }
  }, [accepted, renderer, frameId, facing, zoom, mapping]);

  useEffect(
    () => () => {
      if (scratch.current) scratch.current.width = scratch.current.height = 0;
      scratch.current = null;
      previous.current = null;
    },
    [],
  );

  return (
    <>
      {error && <p role="alert">Preview could not be drawn: {error}</p>}
      <div className="pixel-comparison">
        <figure>
          <figcaption>
            Current look <small>Smooth reference · scaled for comparison</small>
          </figcaption>
          <div className="pixel-preview-scroll">
            <canvas
              ref={before}
              aria-label="Current outfit at the pixel candidate scale"
              data-testid="pixel-source-canvas"
              data-frame-id={frameId}
              data-frame-position={position}
              data-facing={facing}
              style={{
                width: mapping.width * zoom,
                height: mapping.height * zoom,
              }}
            />
          </div>
        </figure>
        <figure>
          <figcaption>
            Pixel candidate · {settingsName(accepted.candidate.report.settings)}
            <small>Native artwork · {zoom}× integer preview</small>
          </figcaption>
          <div className="pixel-preview-scroll">
            <canvas
              ref={after}
              aria-label="Pixel candidate"
              data-testid="pixel-candidate-canvas"
              data-frame-id={frameId}
              data-frame-position={position}
              data-facing={facing}
              style={{
                width: mapping.width * zoom,
                height: mapping.height * zoom,
                imageRendering: "pixelated",
              }}
            />
          </div>
        </figure>
      </div>
    </>
  );
}

/** An optional baked candidate. All edits remain in the source wardrobe;
 * changing its appearance means opening this preview again and rebuilding. */
export default function PixelRefinement({
  project,
  renderer,
  initialAction,
  initialPosition,
  initialFacing,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const sequence = useRef(0);
  const operation = useRef<AbortController | null>(null);
  const sourceBytes = useRef<Uint8Array | null>(null);
  const current = useRef<Accepted | null>(null);
  const elapsed = useRef(0);
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const [settings, setSettings] = useState<PixelSettings>({
    ...DEFAULT_PIXEL_SETTINGS,
  });
  const [action, setAction] = useState(initialAction);
  const [position, setPosition] = useState(initialPosition);
  const [facing, setFacing] = useState(initialFacing);
  const [zoom, setZoom] = useState(2);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Build a separate pixel version of this complete look, including every action.",
  );
  const [error, setError] = useState("");
  const manifest = accepted?.loaded.manifest ?? renderer.manifest;
  const clip = manifest.animations[action]!;
  const shownPosition = Math.min(position, clip.frames.length - 1);
  const frameId = clip.frames[shownPosition];
  const stale = Boolean(
    accepted && !sameSettings(settings, accepted.candidate.report.settings),
  );
  const downloadReady = Boolean(accepted && !busy && !stale);

  useEffect(() => {
    alive.current = true;
    const target = dialog.current;
    const restoreFocus = document.activeElement;
    target?.showModal();
    return () => {
      alive.current = false;
      sequence.current++;
      operation.current?.abort();
      release(current.current);
      current.current = null;
      sourceBytes.current = null;
      target?.close();
      if (restoreFocus instanceof HTMLElement && restoreFocus.isConnected)
        restoreFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!playing || !accepted || busy) return;
    let previous: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (document.hidden) previous = null;
      else {
        const delta = previous === null ? 0 : now - previous;
        previous = now;
        elapsed.current += delta;
        const raw = Math.floor((elapsed.current * clip.fps) / 1000);
        setPosition(
          clip.loop
            ? raw % clip.frames.length
            : Math.min(raw, clip.frames.length - 1),
        );
        if (!clip.loop && raw >= clip.frames.length) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, accepted, busy, clip]);

  function cancel() {
    operation.current?.abort();
    sequence.current++;
    setBusy(false);
    setStatus("Preparation canceled. Any previous candidate is retained.");
  }

  async function build() {
    if (busy) return;
    const token = ++sequence.current;
    const controller = new AbortController();
    operation.current?.abort();
    operation.current = controller;
    setBusy(true);
    setPlaying(false);
    setError("");
    setStatus("Preparing the current outfit’s original frames…");
    let loaded: LoadedCharacterPack | null = null;
    const live = () => alive.current && sequence.current === token;
    try {
      let bytes = sourceBytes.current;
      if (!bytes) {
        bytes = await exportWardrobeCharacterPack(project, {
          onProgress: ({ completedPages, totalPages }) => {
            check(controller.signal);
            if (live())
              setStatus(
                `Preparing current outfit pages ${completedPages}/${totalPages}…`,
              );
          },
        });
        check(controller.signal);
        if (!live()) return;
        sourceBytes.current = bytes;
      }
      const candidate = await buildPixelCandidate(bytes, settings, {
        signal: controller.signal,
        onProgress: ({ stage, completed, total }) => {
          if (live()) setStatus(`${title(stage)} · ${completed}/${total}…`);
        },
      });
      check(controller.signal);
      if (!live()) return;
      setStatus("Opening the finished pixel preview…");
      loaded = await loadPortableCharacterPack(
        new Blob([new Uint8Array(candidate.bytes)], {
          type: "application/zip",
        }),
      );
      check(controller.signal);
      if (!live()) return;
      const next = { candidate, loaded };
      const previous = current.current;
      current.current = next;
      setAccepted(next);
      loaded = null;
      release(previous);
      elapsed.current = (shownPosition * 1000) / clip.fps;
      setStatus(
        "Pixel candidate ready. Compare the full motion before saving it.",
      );
    } catch (cause) {
      if (live() && !controller.signal.aborted) {
        setError(`${message(cause)} Any previous candidate is retained.`);
        setStatus("Pixel preparation did not finish.");
      }
    } finally {
      if (loaded) releaseCharacterImages(characterPackImages(loaded));
      if (live()) setBusy(false);
    }
  }

  async function exportFile(
    kind: "pack" | "source-pack" | "png" | "source-png" | "gif" | "report",
  ) {
    const value = current.current;
    if (!value || !downloadReady) return;
    const token = ++sequence.current;
    const controller = new AbortController();
    operation.current?.abort();
    operation.current = controller;
    setBusy(true);
    setPlaying(false);
    setError("");
    setStatus("Preparing your pixel download…");
    const stem = safeFilename(
      `${project.archive.config.characterId}-pixel-candidate`,
    );
    const { candidate } = value;
    const live = () => alive.current && sequence.current === token;
    try {
      if (kind === "pack") save(candidate.bytes, `${stem}.character.zip`);
      else if (kind === "source-pack")
        save(sourceBytes.current!, `${stem}-source.character.zip`);
      else if (kind === "report")
        save(
          new TextEncoder().encode(JSON.stringify(candidate.report, null, 2)),
          `${stem}.pixel-report.json`,
          "application/json",
        );
      else {
        const bytes =
          kind === "gif"
            ? await themeActionGif(candidate.archive, action, facing, {
                signal: controller.signal,
                onProgress: (done, total) => {
                  if (live()) setStatus(`Encoding pixel GIF ${done}/${total}…`);
                },
              })
            : kind === "source-png"
              ? await encodeSourceRgbaPngAsync(
                  mirrorMotionFrame(renderer.renderFrame(frameId), facing),
                )
              : await themeFramePng(candidate.archive, frameId, facing, {
                  signal: controller.signal,
                });
        check(controller.signal);
        if (!live()) return;
        const extension = kind === "gif" ? "gif" : "png";
        save(
          bytes,
          `${stem}-${kind === "source-png" ? "source-" : ""}${action}-${facing}${kind === "gif" ? "" : `-${shownPosition}`}.${extension}`,
          `image/${extension}`,
        );
      }
      if (live())
        setStatus("Download ready. The current wardrobe is unchanged.");
    } catch (cause) {
      if (live() && !controller.signal.aborted) setError(message(cause));
    } finally {
      if (live()) setBusy(false);
    }
  }

  return (
    <dialog
      className="pixel-refinement"
      ref={dialog}
      aria-labelledby="pixel-refinement-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="pixel-header">
        <div>
          <p className="pixel-eyebrow">
            A separate finish for your current look
          </p>
          <h2 id="pixel-refinement-title">Pixel finish</h2>
          <p>
            Keep the original poses, clothing and timing. Compare a locally
            converted pixel candidate before exporting it.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close pixel finish">
          Close
        </button>
      </header>
      <div className="pixel-body">
        <section className="pixel-presets" aria-label="Pixel style presets">
          <button
            type="button"
            aria-label="Detailed pixels"
            aria-pressed={sameSettings(settings, DEFAULT_PIXEL_SETTINGS)}
            disabled={busy}
            onClick={() => setSettings({ ...DEFAULT_PIXEL_SETTINGS })}
          >
            <strong>Detailed pixels</strong>
            <span>Finer shading and small details · previous finish</span>
          </button>
          <button
            type="button"
            aria-label="Strong pixels"
            aria-pressed={sameSettings(settings, STRONG_PIXEL_SETTINGS)}
            disabled={busy}
            onClick={() => setSettings({ ...STRONG_PIXEL_SETTINGS })}
          >
            <strong>Strong pixels</strong>
            <span>Coarser pixels and simpler color shapes</span>
          </button>
        </section>
        <p className="pixel-style-selection" aria-live="polite">
          Selected style: {settingsName(settings)}
        </p>
        <section className="pixel-settings" aria-label="Pixel finish settings">
          <label>
            Detail size
            <select
              aria-label="Pixel detail"
              disabled={busy}
              value={settings.factor}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  factor: Number(event.target.value) as PixelSettings["factor"],
                })
              }
            >
              <option value={4}>Fine · 1/4 source size</option>
              <option value={6}>Balanced · 1/6 source size</option>
              <option value={8}>Coarse · 1/8 source size</option>
            </select>
          </label>
          <label>
            Color limit
            <select
              aria-label="Pixel colors"
              disabled={busy}
              value={settings.colors}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  colors: Number(event.target.value) as PixelSettings["colors"],
                })
              }
            >
              <option value={64}>64 colors</option>
              <option value={96}>96 colors</option>
              <option value={128}>128 colors</option>
            </select>
          </label>
          <label>
            Edge treatment
            <select
              aria-label="Pixel sampling"
              disabled={busy}
              value={settings.sampling}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  sampling: event.target.value as PixelSettings["sampling"],
                })
              }
            >
              <option value="detail">Preserve small details</option>
              <option value="nearest">Simple sampling · comparison</option>
            </select>
          </label>
          <label>
            Color detail
            <select
              aria-label="Pixel color cleanup"
              disabled={busy}
              value={settings.finish ?? "none"}
              onChange={(event) => {
                const { finish: _previousFinish, ...base } = settings;
                setSettings(
                  event.target.value === "cluster"
                    ? { ...base, finish: "cluster" }
                    : base,
                );
              }}
            >
              <option value="none">Keep fine color details</option>
              <option value="cluster">Simplify small color patches</option>
            </select>
          </label>
          <button
            type="button"
            className="pixel-primary"
            disabled={busy}
            onClick={() => void build()}
          >
            Build pixel candidate
          </button>
          {busy && (
            <button type="button" onClick={cancel}>
              Cancel pixel preparation
            </button>
          )}
        </section>
        <p className="pixel-note">
          Strong pixels trade fine shading for clearer color shapes. Both styles
          keep every source pose and its timing, with one fixed grid and one
          shared palette for the complete look. Existing clothing seams remain;
          conversion does not redraw anatomy. Save your editable wardrobe
          separately to keep changing clothes.
        </p>
        <p className="pixel-status" role="status">
          {status}
        </p>
        {error && (
          <p className="pixel-error" role="alert">
            {error}
          </p>
        )}
        {stale && (
          <p className="pixel-stale" role="note">
            Settings changed. The previous candidate is shown below; rebuild to
            preview and save the new settings.
          </p>
        )}
        {accepted ? (
          <>
            <section
              className="pixel-playback"
              aria-label="Pixel preview controls"
            >
              <label>
                Action
                <select
                  aria-label="Pixel action"
                  disabled={busy}
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value as PortableAnimationName);
                    setPosition(0);
                    elapsed.current = 0;
                  }}
                >
                  {ACTIONS.map((value) => (
                    <option
                      key={value}
                      value={value}
                      disabled={!manifest.animations[value]}
                    >
                      {title(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Direction
                <select
                  aria-label="Pixel facing"
                  disabled={busy}
                  value={facing}
                  onChange={(event) => setFacing(event.target.value as Facing)}
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </label>
              <label>
                Preview size
                <select
                  aria-label="Pixel preview zoom"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                >
                  <option value={1}>Native · 1×</option>
                  <option value={2}>Integer · 2×</option>
                </select>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    !playing &&
                    !clip.loop &&
                    shownPosition === clip.frames.length - 1
                  ) {
                    setPosition(0);
                    elapsed.current = 0;
                  }
                  setPlaying(!playing);
                }}
              >
                {playing ? "Pause pixel preview" : "Play pixel preview"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPosition(0);
                  elapsed.current = 0;
                }}
              >
                Restart pixel preview
              </button>
            </section>
            <PixelComparison
              accepted={accepted}
              renderer={renderer}
              frameId={frameId}
              position={shownPosition}
              facing={facing}
              zoom={zoom}
            />
            <label className="pixel-frame-control">
              Frame {shownPosition + 1} / {clip.frames.length} · {clip.fps} FPS
              · source pose {frameId}
              <input
                type="range"
                aria-label="Pixel frame"
                min={0}
                max={clip.frames.length - 1}
                step={1}
                value={shownPosition}
                disabled={busy}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setPlaying(false);
                  setPosition(next);
                  elapsed.current = (next * 1000) / clip.fps;
                }}
              />
            </label>
            <p className="pixel-note">
              {accepted.candidate.report.mapping.width} ×{" "}
              {accepted.candidate.report.mapping.height} native pixels ·{" "}
              {accepted.candidate.report.palette.length} shared colors ·{" "}
              {clip.loop
                ? "Repeating action"
                : "One-shot: holds its final pose here for inspection"}
              . GIF is an opaque preview; PNG and CharacterPack preserve
              transparency.
            </p>
            <section
              className="pixel-downloads"
              aria-label="Pixel candidate downloads"
            >
              <button
                type="button"
                disabled={!downloadReady}
                onClick={() => void exportFile("pack")}
              >
                Save pixel CharacterPack
              </button>
              <button
                type="button"
                disabled={!downloadReady}
                onClick={() => void exportFile("png")}
              >
                Save pixel PNG
              </button>
              <button
                type="button"
                disabled={!downloadReady}
                onClick={() => void exportFile("gif")}
              >
                Save pixel GIF
              </button>
              <button
                type="button"
                disabled={!downloadReady}
                onClick={() => void exportFile("report")}
              >
                Save pixel build report
              </button>
              <button
                type="button"
                disabled={!downloadReady}
                onClick={() => void exportFile("source-pack")}
              >
                Save source CharacterPack
              </button>
              <button
                type="button"
                disabled={!downloadReady}
                onClick={() => void exportFile("source-png")}
              >
                Save source PNG
              </button>
            </section>
          </>
        ) : (
          <div className="pixel-empty">
            Your current look will appear beside its pixel candidate after
            preparation.
          </div>
        )}
      </div>
    </dialog>
  );
}
