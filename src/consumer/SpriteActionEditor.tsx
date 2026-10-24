import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSpriteActionProject,
  deriveSpriteActionPlayback,
  exportSpriteActionPack,
  exportSpriteActionProject,
  importSpriteActionProject,
  resetSpriteAction,
  updateSpriteAction,
  type SpriteActionProject,
  type SpriteActionDocument,
  SPRITE_PROJECT_MAX_BYTES,
} from "../core/sprite-actions";
import {
  downloadBlob,
  loadPortableCharacterPack,
  characterPackImages,
  releaseCharacterImages,
  safeFilename,
  type LoadedCharacterPack,
} from "../core/pack";
import type { Facing, PortableAnimationName } from "../core/types";
import { imageForFrame } from "./player";
import "./sprite-actions.css";

interface Session {
  project: SpriteActionProject;
  history: SpriteActionProject[];
  saved: boolean;
}
interface CachedSession {
  document: SpriteActionDocument;
  history: SpriteActionDocument[];
  saved: boolean;
}
interface Props {
  archive: Blob | null;
  basePack: LoadedCharacterPack | null;
  animation: PortableAnimationName;
  facing: Facing;
  busy: boolean;
  onPreview: (pack: LoadedCharacterPack, modified: boolean) => void;
  onOpenSource: (archive: Blob, pack: LoadedCharacterPack) => void;
  onBusy: (busy: boolean) => void;
  onDraft: (draft: boolean) => void;
}

function Endpoint({
  pack,
  frameId,
  facing,
  scale,
  label,
}: {
  pack: LoadedCharacterPack;
  frameId: number;
  facing: Facing;
  scale: number;
  label: "First frame" | "Last frame";
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = pack.manifest.frames.find((entry) => entry.id === frameId)!;
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, frame.width, frame.height);
    context.save();
    if (facing === "left") {
      context.translate(frame.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(
      imageForFrame(pack, frame),
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    );
    context.restore();
  }, [pack, frame, facing]);
  return (
    <figure>
      <figcaption>
        {label} · atlas frame {frameId}
      </figcaption>
      <canvas
        ref={canvas}
        width={frame.width}
        height={frame.height}
        style={{
          width: frame.width * scale,
          height: frame.height * scale,
          imageRendering: pack.manifest.scale.pixelArt ? "pixelated" : "auto",
        }}
        role="img"
        aria-label={`${label}, ${facing}, atlas frame ${frameId}`}
        data-testid={
          label === "First frame" ? "sprite-first-frame" : "sprite-last-frame"
        }
        data-frame-id={frameId}
        data-facing={facing}
      />
    </figure>
  );
}

export default function SpriteActionEditor({
  archive,
  basePack,
  animation,
  facing,
  busy,
  onPreview,
  onOpenSource,
  onBusy,
  onDraft,
}: Props) {
  // Retain lightweight settings, never old source ZIPs or decoded atlas pages.
  const sessions = useRef(new Map<string, CachedSession>());
  const [session, setSession] = useState<Session | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(
    "Open a CharacterPack to arrange its sprite actions.",
  );
  const [start, setStart] = useState("1");
  const [end, setEnd] = useState("1");
  const [fps, setFps] = useState("24");
  const [loop, setLoop] = useState(true);
  const [endpointScale, setEndpointScale] = useState(0.5);
  const request = useRef(0);
  const projectInput = useRef<HTMLInputElement>(null);
  const callbacks = useRef({ onPreview, onBusy });
  callbacks.current = { onPreview, onBusy };

  function cache(next: Session) {
    sessions.current.set(next.project.document.sourceSha256, {
      document: next.project.document,
      history: next.history.map((project) => project.document),
      saved: next.saved,
    });
  }
  function remember(next: Session) {
    // Validate the complete derived recipe before replacing an accepted session.
    // Source metadata can be valid yet too close to its limit for edit provenance.
    const derived = deriveSpriteActionPlayback(next.project);
    cache(next);
    setSession(next);
    if (basePack) {
      callbacks.current.onPreview(
        { ...basePack, manifest: derived.manifest, config: derived.config },
        derived.changed,
      );
    }
  }

  useEffect(() => {
    const token = ++request.current;
    if (!archive || !basePack) {
      setSession(null);
      setWorking(false);
      callbacks.current.onBusy(false);
      return;
    }
    setWorking(true);
    callbacks.current.onBusy(true);
    setSession(null);
    setError("");
    void (async () => {
      try {
        const project = await createSpriteActionProject(
          new Uint8Array(await archive.arrayBuffer()),
        );
        if (token !== request.current) return;
        const cached = sessions.current.get(project.document.sourceSha256);
        const next: Session = cached
          ? {
              project: { ...project, document: cached.document },
              history: cached.history.map((document) => ({
                ...project,
                document,
              })),
              saved: cached.saved,
            }
          : { project, history: [], saved: true };
        const derived = deriveSpriteActionPlayback(next.project);
        cache(next);
        setSession(next);
        callbacks.current.onPreview(
          { ...basePack, manifest: derived.manifest, config: derived.config },
          derived.changed,
        );
        setStatus(
          derived.changed
            ? "Restored this source’s action edits. Save the project to keep them after closing."
            : "Source action settings. Edit frame selection and timing below; the artwork stays intact.",
        );
      } catch (failure) {
        if (token === request.current)
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
      } finally {
        if (token === request.current) {
          setWorking(false);
          callbacks.current.onBusy(false);
        }
      }
    })();
    return () => {
      request.current++;
    };
  }, [archive, basePack]);

  const settings = session?.project.document.actions[animation];
  useEffect(() => {
    if (!settings) return;
    setStart(String(settings.start + 1));
    setEnd(String(settings.end + 1));
    setFps(String(settings.fps));
    setLoop(settings.loop);
  }, [settings, animation]);
  const hasDraft =
    !!settings &&
    (Number(start) !== settings.start + 1 ||
      Number(end) !== settings.end + 1 ||
      Number(fps) !== settings.fps ||
      !start.trim() ||
      !end.trim() ||
      !fps.trim() ||
      loop !== settings.loop);
  useEffect(() => {
    onDraft(Boolean(hasDraft));
  }, [hasDraft, onDraft]);

  const originalClip = session?.project.archive.manifest.animations[animation];
  const derived = useMemo(
    () => (session ? deriveSpriteActionPlayback(session.project) : null),
    [session],
  );
  const clip = derived?.manifest.animations[animation];
  const previewPack = useMemo(
    () =>
      derived && basePack
        ? { ...basePack, manifest: derived.manifest, config: derived.config }
        : null,
    [derived, basePack],
  );
  const blocked = busy || working;
  const prefix = safeFilename(
    basePack?.config?.characterId ?? basePack?.manifest.name ?? "character",
  );

  function change(project: SpriteActionProject, label: string) {
    if (!session) return;
    remember({
      project,
      history: [...session.history.slice(-19), session.project],
      saved: false,
    });
    setError("");
    setStatus(label);
  }
  function apply() {
    if (!session) return;
    try {
      if (![start, end, fps].every((value) => value.trim().length))
        throw Error("Enter a start frame, end frame and action FPS.");
      change(
        updateSpriteAction(session.project, animation, {
          start: Number(start) - 1,
          end: Number(end) - 1,
          fps: Number(fps),
          loop,
        }),
        "Action settings applied. Preview uses the selected source frames and updated timing.",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  async function perform(action: () => Promise<void>) {
    const token = request.current;
    setWorking(true);
    onBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      if (token === request.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (token === request.current) {
        setWorking(false);
        onBusy(false);
      }
    }
  }
  async function openProject(file: File) {
    const token = ++request.current;
    await perform(async () => {
      if (file.size > SPRITE_PROJECT_MAX_BYTES)
        throw Error("Action project exceeds its supported file limit.");
      const project = await importSpriteActionProject(
        new Uint8Array(await file.arrayBuffer()),
      );
      // A structurally valid project must also produce a valid preview/export
      // before it can replace the currently accepted character and settings.
      deriveSpriteActionPlayback(project);
      const sourceArchive = new Blob([project.source], {
        type: "application/zip",
      });
      if (token !== request.current) return;
      const loaded = await loadPortableCharacterPack(sourceArchive);
      if (token !== request.current) {
        releaseCharacterImages(characterPackImages(loaded));
        return;
      }
      const next = { project, history: [], saved: true };
      cache(next);
      onOpenSource(sourceArchive, loaded);
      setStatus(
        "Action project opened with its original source pack and saved settings.",
      );
    });
  }

  return (
    <section
      className="sprite-action-editor"
      aria-label="Sprite action editor"
      aria-busy={working}
    >
      <div className="sprite-action-heading">
        <div>
          <p className="player-eyebrow">WORK WITH THE ORIGINAL FRAMES</p>
          <h2>Sprite action settings</h2>
        </div>
        <span className="sprite-action-badge" data-testid="sprite-edit-state">
          {derived?.changed ? "Adjusted actions" : "Source settings"}
        </span>
      </div>
      <p>
        Choose a motion above, then trim its existing frame sequence and set its
        pace. Images, dimensions and anchors stay unchanged. Preview speed is
        separate from the exported action FPS.
      </p>
      {originalClip && settings && (
        <>
          <p className="sprite-action-summary">
            <strong>{animation}</strong> · source {originalClip.frames.length}{" "}
            frames at {originalClip.fps} FPS
            {clip &&
              ` · current ${clip.frames.length} frames / ${(clip.frames.length / clip.fps).toFixed(3)} s`}
          </p>
          <div className="sprite-action-fields">
            <label>
              Start frame
              <input
                aria-label="Start frame"
                type="number"
                min={1}
                max={originalClip.frames.length}
                step={1}
                value={start}
                disabled={blocked}
                onChange={(event) => setStart(event.target.value)}
              />
            </label>
            <label>
              End frame
              <input
                aria-label="End frame"
                type="number"
                min={1}
                max={originalClip.frames.length}
                step={1}
                value={end}
                disabled={blocked}
                onChange={(event) => setEnd(event.target.value)}
              />
            </label>
            <label>
              Action FPS
              <input
                aria-label="Action FPS"
                type="number"
                min={0.1}
                max={60}
                step={0.1}
                value={fps}
                disabled={blocked}
                onChange={(event) => setFps(event.target.value)}
              />
            </label>
            <label className="sprite-action-loop">
              <input
                aria-label="Loop action"
                type="checkbox"
                checked={loop}
                disabled={blocked}
                onChange={(event) => setLoop(event.target.checked)}
              />{" "}
              Loop action
            </label>
          </div>
          <p className="sprite-action-hint">
            Start and end are inclusive positions in the original action,
            starting at 1. Apply updates the preview.
          </p>
          {hasDraft && (
            <p className="sprite-action-hint">
              Unapplied changes: apply or discard them before switching
              characters/actions or opening another source.
            </p>
          )}
          <div className="sprite-action-buttons">
            <button
              className="player-button player-button-primary"
              disabled={blocked}
              onClick={apply}
            >
              Apply action settings
            </button>
            <button
              className="player-button player-button-secondary"
              disabled={blocked || !session?.history.length}
              onClick={() => {
                if (!session?.history.length) return;
                remember({
                  project: session.history.at(-1)!,
                  history: session.history.slice(0, -1),
                  saved: false,
                });
                setError("");
                setStatus("Previous action settings restored.");
              }}
            >
              Undo action edit
            </button>
            <button
              className="player-button player-button-secondary"
              disabled={blocked}
              onClick={() => {
                if (session)
                  change(
                    resetSpriteAction(session.project, animation),
                    "Selected action restored to its source settings.",
                  );
              }}
            >
              Reset action to source
            </button>
            {hasDraft && (
              <button
                className="player-button player-button-secondary"
                disabled={blocked}
                onClick={() => {
                  setStart(String(settings.start + 1));
                  setEnd(String(settings.end + 1));
                  setFps(String(settings.fps));
                  setLoop(settings.loop);
                  setError("");
                }}
              >
                Discard unapplied changes
              </button>
            )}
          </div>
        </>
      )}
      {!archive && (
        <p>
          Load a complete CharacterPack ZIP to edit, or open a saved action
          project below.
        </p>
      )}
      {archive && !session && !working && (
        <p>The loaded character remains available for playback.</p>
      )}
      <div className="sprite-action-buttons">
        <button
          className="player-button player-button-secondary"
          disabled={blocked || hasDraft || !session}
          onClick={() =>
            void perform(async () => {
              if (!session) return;
              const bytes = await exportSpriteActionProject(session.project);
              downloadBlob(
                new Blob([bytes], { type: "application/zip" }),
                `${prefix}.sprite-project.zip`,
              );
              const next = { ...session, saved: true };
              cache(next);
              setSession(next);
              setStatus(
                "Action project saved with its original source pack and current action settings.",
              );
            })
          }
        >
          Save action project
        </button>
        <button
          className="player-button player-button-secondary"
          disabled={blocked || hasDraft}
          onClick={() => projectInput.current?.click()}
        >
          Open action project
        </button>
        <input
          ref={projectInput}
          className="sprite-action-file"
          aria-label="Open action project"
          type="file"
          accept=".zip,application/zip"
          disabled={blocked || hasDraft}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void openProject(file);
          }}
        />
        <button
          className="player-button player-button-primary"
          disabled={blocked || hasDraft || !session}
          onClick={() =>
            void perform(async () => {
              if (!session) return;
              downloadBlob(
                await exportSpriteActionPack(session.project),
                `${prefix}-actions.character.zip`,
              );
              setStatus(
                "CharacterPack exported with current action settings and unchanged source PNGs.",
              );
            })
          }
        >
          Export edited CharacterPack
        </button>
      </div>
      <p className="sprite-action-hint">
        Applied edits stay with each source while switching characters in this
        session. Save a project before closing or reloading.
        {session &&
          !session.saved &&
          " Current changes have not been saved to a project file."}
      </p>
      <p role="status" className="sprite-action-status">
        {working ? "Preparing action project…" : status}
      </p>
      {error && (
        <p role="alert" className="player-error">
          {error} Your current character and settings are retained.
        </p>
      )}
      {previewPack && clip && (
        <details className="sprite-endpoints" open>
          <summary>Compare first and last frame</summary>
          <p>
            Check silhouette and foot position at the clip boundary. Both images
            use the same native frame and display scale.
          </p>
          <label>
            Endpoint scale
            <select
              aria-label="Endpoint scale"
              value={
                previewPack.manifest.scale.integerOnly
                  ? Math.max(1, endpointScale)
                  : endpointScale
              }
              onChange={(event) => setEndpointScale(Number(event.target.value))}
            >
              {!previewPack.manifest.scale.integerOnly && (
                <option value={0.5}>½× · fit</option>
              )}
              <option value={1}>1× · native</option>
              <option value={2}>2× · inspect</option>
            </select>
          </label>
          <div className="sprite-endpoint-scroll">
            <Endpoint
              pack={previewPack}
              frameId={clip.frames[0]}
              facing={facing}
              scale={
                previewPack.manifest.scale.integerOnly
                  ? Math.max(1, endpointScale)
                  : endpointScale
              }
              label="First frame"
            />
            <Endpoint
              pack={previewPack}
              frameId={clip.frames.at(-1)!}
              facing={facing}
              scale={
                previewPack.manifest.scale.integerOnly
                  ? Math.max(1, endpointScale)
                  : endpointScale
              }
              label="Last frame"
            />
          </div>
        </details>
      )}
    </section>
  );
}
