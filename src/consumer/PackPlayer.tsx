import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  FileJson,
  Layers3,
  PackageOpen,
  Pause,
  Play,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  loadPortableCharacterFiles,
  loadPortableCharacterPack,
  createBakedCharacterPack,
  downloadBlob,
  type LoadedCharacterPack,
} from "../core/pack";
import type { PortableAnimationName, Facing } from "../core/types";
import {
  importBakedSourceArchive,
  inspectBakedArchiveKind,
  convertSourceCharacter,
  type BakedSourceBundle,
} from "../core/baked-source";
import {
  animationFor,
  animationHasEnded,
  drawCharacterFrame,
  frameAtTime,
  imageForFrame,
} from "./player";

type SourceEntry = { pack: LoadedCharacterPack; archive: Blob };
const klingSampleUrl = new URL(
  "../../artwork/kling-jump/prepared/kling-source.zip",
  import.meta.url,
).href;

export function PackPlayer() {
  const [pack, setPack] = useState<LoadedCharacterPack | null>(null);
  const [animation, setAnimation] = useState<PortableAnimationName>("idle");
  const [facing, setFacing] = useState<Facing>("right");
  const [playing, setPlaying] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [frameId, setFrameId] = useState(0);
  const [sourceBundle, setSourceBundle] = useState<BakedSourceBundle | null>(
    null,
  );
  const [characterId, setCharacterId] = useState("");
  const [comparisonPack, setComparisonPack] =
    useState<LoadedCharacterPack | null>(null);
  const [comparisonRequested, setComparisonRequested] = useState(false);
  const [downloadPack, setDownloadPack] = useState<Blob | null>(null);
  const [framePosition, setFramePosition] = useState(0);
  const sourceEntries = useRef(new Map<string, SourceEntry>());
  const [files, setFiles] = useState<{
    png?: File;
    metadata?: File;
    config?: File;
  }>({});
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);
  const requestRef = useRef(0);
  const frameRef = useRef(-1);
  const [canvasWidth, setCanvasWidth] = useState(640);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const selectedClip = pack
    ? animationFor(pack.manifest, animation)
    : undefined;
  const isBaked = !!pack && pack.manifest.schemaVersion !== 1;
  const zoomChoices = isBaked
    ? [...new Set([0.25, 0.5, 0.75, 1, 1.5, 2, zoom])].sort((a, b) => a - b)
    : [1, 2, 3, 4, 5, 6, 7, 8];
  const frameHeight = Math.max(
    pack?.manifest.spritesheet.frameHeight ?? 0,
    comparisonPack?.manifest.spritesheet.frameHeight ?? 0,
  );
  const canvasHeight = Math.max(420, frameHeight * zoom + 100);
  const canvasRenderWidth = Math.max(
    canvasWidth,
    pack
      ? 2 *
          Math.max(
            pack.manifest.anchor.x,
            pack.manifest.spritesheet.frameWidth - pack.manifest.anchor.x,
            comparisonPack?.manifest.anchor.x ?? 0,
            comparisonPack
              ? comparisonPack.manifest.spritesheet.frameWidth -
                  comparisonPack.manifest.anchor.x
              : 0,
          ) *
          zoom *
          (comparisonPack ? 2 : 1) +
          48
      : 0,
  );
  const attachmentY = pack
    ? Math.floor((canvasHeight - frameHeight * zoom) / 2) +
      pack.manifest.anchor.y * zoom
    : 338;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) =>
      setCanvasWidth(Math.max(240, Math.round(entries[0].contentRect.width))),
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    // Assigning either dimension clears the bitmap, even when unchanged.
    // Playback state changes must not expose a blank frame between effects.
    const width = Math.round(canvasRenderWidth * ratio);
    const height = Math.round(canvasHeight * ratio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    let previous: number | undefined;
    let request = 0;
    function draw(now: number) {
      if (!context || !canvas) return;
      if (previous !== undefined && playing)
        elapsedRef.current += (now - previous) * speed;
      previous = now;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, canvasRenderWidth, canvasHeight);
      const attachment = {
        x: Math.round(canvasRenderWidth / (comparisonPack ? 4 : 2)),
        y: attachmentY,
      };
      context.strokeStyle = "#c7c4d1";
      context.lineWidth = 1;
      context.setLineDash([4, 5]);
      context.beginPath();
      context.moveTo(24, attachment.y + 0.5);
      context.lineTo(canvasRenderWidth - 24, attachment.y + 0.5);
      context.stroke();
      context.setLineDash([]);
      if (pack) {
        const frame = frameAtTime(pack.manifest, animation, elapsedRef.current);
        drawCharacterFrame(
          context,
          imageForFrame(pack, frame),
          pack.manifest,
          frame,
          facing,
          zoom,
          attachment,
        );
        if (
          comparisonPack &&
          animationFor(comparisonPack.manifest, animation)
        ) {
          const comparisonFrame = frameAtTime(
            comparisonPack.manifest,
            animation,
            elapsedRef.current,
          );
          drawCharacterFrame(
            context,
            imageForFrame(comparisonPack, comparisonFrame),
            comparisonPack.manifest,
            comparisonFrame,
            facing,
            zoom,
            { x: Math.round((canvasRenderWidth * 3) / 4), y: attachmentY },
          );
        }
        if (frame.id !== frameRef.current) {
          frameRef.current = frame.id;
          setFrameId(frame.id);
        }
        const clip = animationFor(pack.manifest, animation)!;
        const position = Math.floor(
          (Math.max(0, elapsedRef.current) * clip.fps) / 1000,
        );
        setFramePosition(
          clip.loop
            ? position % clip.frames.length
            : Math.min(position, clip.frames.length - 1),
        );
        context.strokeStyle = "#7762d6";
        context.beginPath();
        context.moveTo(attachment.x - 5, attachment.y + 0.5);
        context.lineTo(attachment.x + 5, attachment.y + 0.5);
        context.moveTo(attachment.x + 0.5, attachment.y - 5);
        context.lineTo(attachment.x + 0.5, attachment.y + 5);
        context.stroke();
        const comparisonClip = comparisonPack
          ? animationFor(comparisonPack.manifest, animation)
          : undefined;
        // Keep a longer compared one-shot playing after the selected character
        // has landed. The shorter character holds its authored final frame.
        const comparisonEnded =
          !comparisonPack ||
          !comparisonClip ||
          comparisonClip.loop ||
          animationHasEnded(
            comparisonPack.manifest,
            animation,
            elapsedRef.current,
          );
        if (
          animationHasEnded(pack.manifest, animation, elapsedRef.current) &&
          comparisonEnded
        ) {
          setCompleted(true);
          setPlaying(false);
          return;
        }
      }
      if (playing && pack) request = requestAnimationFrame(draw);
    }
    // Paint immediately on pause, completion, action changes and replay. The
    // callback schedules subsequent ticks only while playback is active.
    draw(performance.now());
    return () => cancelAnimationFrame(request);
  }, [
    pack,
    comparisonPack,
    animation,
    facing,
    playing,
    speed,
    zoom,
    canvasRenderWidth,
    canvasHeight,
    attachmentY,
    playbackRevision,
  ]);

  const openPack = useCallback(
    async (
      operation: () => Promise<LoadedCharacterPack>,
      label: string,
      onLoaded?: (loaded: LoadedCharacterPack) => void,
    ) => {
      const request = ++requestRef.current;
      setBusy(true);
      setError("");
      try {
        const loaded = await operation();
        if (request !== requestRef.current) return;
        elapsedRef.current = 0;
        frameRef.current = -1;
        setFrameId(loaded.manifest.animations.idle.frames[0]);
        setPack(loaded);
        setSource(label);
        setAnimation("idle");
        setFacing(loaded.manifest.facing.native);
        setZoom(
          loaded.manifest.schemaVersion !== 1
            ? ([0.25, 0.5, 0.75, 1]
                .filter(
                  (value) =>
                    value <= loaded.manifest.scale.recommended &&
                    value * loaded.manifest.spritesheet.frameHeight <= 512 &&
                    value * loaded.manifest.spritesheet.frameWidth <=
                      (stageRef.current?.clientWidth ?? 640) - 48,
                )
                .at(-1) ?? 0.25)
            : Math.min(8, Math.max(1, loaded.manifest.scale.recommended)),
        );
        setFramePosition(0);
        setSourceBundle(null);
        sourceEntries.current.clear();
        setCharacterId("");
        setComparisonPack(null);
        setComparisonRequested(false);
        setDownloadPack(null);
        onLoaded?.(loaded);
        setPlaying(true);
        setCompleted(false);
      } catch (cause) {
        if (request !== requestRef.current) return;
        setError(
          `${cause instanceof Error ? cause.message : "This file could not be opened."} Choose an intact CharacterPack or unified source ZIP, or load matching PNG and metadata files below.`,
        );
      } finally {
        if (request === requestRef.current) setBusy(false);
      }
    },
    [],
  );

  async function sourceEntry(
    bundle: BakedSourceBundle,
    id: string,
  ): Promise<SourceEntry> {
    const converted = await convertSourceCharacter(bundle, id);
    const archive = await createBakedCharacterPack(
      converted.recipe,
      converted.manifest,
      converted.png,
      converted.additionalPngs,
    );
    return { pack: await loadPortableCharacterPack(archive), archive };
  }

  function openZip(
    file: Blob,
    label = file instanceof File ? file.name : "Source characters",
  ) {
    let bundle: BakedSourceBundle | undefined;
    let entry: SourceEntry | undefined;
    let selectedId = "";
    void openPack(
      async () => {
        const kind = await inspectBakedArchiveKind(file);
        if (kind === "unified-source") {
          bundle = await importBakedSourceArchive(file);
          selectedId = bundle.characters[0].id;
          entry = await sourceEntry(bundle, selectedId);
          return entry.pack;
        }
        return loadPortableCharacterPack(file);
      },
      label,
      (loaded) => {
        setDownloadPack(
          entry?.archive ?? (loaded.manifest.schemaVersion !== 1 ? file : null),
        );
        if (bundle && entry) {
          setSourceBundle(bundle);
          setCharacterId(selectedId);
          sourceEntries.current.set(selectedId, entry);
        }
      },
    );
  }

  async function openKlingExample() {
    const request = ++requestRef.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(klingSampleUrl);
      if (!response.ok)
        throw new Error(
          `Source example could not be downloaded (HTTP ${response.status}).`,
        );
      const archive = await response.blob();
      if (request !== requestRef.current) return;
      openZip(archive, "Kling original-video source bundle");
    } catch (cause) {
      if (request !== requestRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Source example could not be opened.",
      );
      setBusy(false);
    }
  }

  async function selectSourceCharacter(id: string, compare = false) {
    if (!sourceBundle) return;
    const request = ++requestRef.current;
    setBusy(true);
    setError("");
    try {
      const entry =
        sourceEntries.current.get(id) ?? (await sourceEntry(sourceBundle, id));
      if (request !== requestRef.current) return;
      sourceEntries.current.set(id, entry);
      if (compare) {
        setComparisonPack(entry.pack);
      } else {
        const previousId = characterId;
        setCharacterId(id);
        setPack(entry.pack);
        setDownloadPack(entry.archive);
        if (comparisonPack)
          setComparisonPack(
            sourceEntries.current.get(previousId)?.pack ?? null,
          );
        if (!animationFor(entry.pack.manifest, animation)) {
          setAnimation("idle");
          elapsedRef.current = 0;
        }
        frameRef.current = -1;
        setCompleted(false);
      }
      setPlaybackRevision((value) => value + 1);
    } catch (cause) {
      if (request === requestRef.current && compare)
        setComparisonRequested(false);
      if (request === requestRef.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Character could not be opened.",
        );
    } finally {
      if (request === requestRef.current) setBusy(false);
    }
  }

  function openExample(
    artworkVersion:
      | 1
      | 2
      | 3
      | 4
      | 6
      | 7
      | "corrected-running"
      | "everyday"
      | "running"
      | "running-v1",
  ) {
    void openPack(
      async () => {
        const response = await fetch(
          artworkVersion === "corrected-running"
            ? "/samples/run-connections/denim-daytrip.character.zip"
            : artworkVersion === "everyday"
              ? "/samples/everyday/denim-daytrip.character.zip"
              : artworkVersion === "running"
                ? "/samples/running-v2/dress.character.zip"
                : artworkVersion === "running-v1"
                  ? "/samples/running/dress.character.zip"
                  : artworkVersion === 7
                    ? "/samples/harmonized/dress-joyful.character.zip"
                    : artworkVersion === 6
                      ? "/samples/polished/dress-joyful.character.zip"
                      : artworkVersion === 4
                        ? "/samples/expressive/mira.character.zip"
                        : artworkVersion === 3
                          ? "/samples/detailed/mira.character.zip"
                          : artworkVersion === 2
                            ? "/samples/v2/mira.character.zip"
                            : "/samples/mira.character.zip",
        );
        if (!response.ok)
          throw new Error(
            `The example pack could not be downloaded (HTTP ${response.status}).`,
          );
        return loadPortableCharacterPack(await response.blob());
      },
      artworkVersion === "corrected-running"
        ? "denim-daytrip.character.zip · Art V6 · Motion V3 · bundled example"
        : artworkVersion === "everyday"
          ? "denim-daytrip.character.zip · Art V6 · Motion V2 · bundled example"
          : artworkVersion === "running"
            ? "dress.character.zip · Art V6 · Motion V2 · bundled example"
            : artworkVersion === "running-v1"
              ? "dress.character.zip · Art V6 · Motion V1 · preserved example"
              : `${artworkVersion >= 6 ? "dress-joyful" : "mira"}.character.zip · Art V${artworkVersion} bundled example`,
    );
  }

  function openSeparateFiles() {
    if (!files.png || !files.metadata) return;
    const { png, metadata, config } = files;
    void openPack(async () => {
      if (
        metadata.size > 1024 * 1024 ||
        (config && config.size > 1024 * 1024)
      ) {
        throw new Error(
          "Selected JSON files must be no larger than 1 MiB. Choose the small metadata files from a character export.",
        );
      }
      let manifest: unknown;
      let configuration: unknown;
      try {
        manifest = JSON.parse(await metadata.text());
        if (config) configuration = JSON.parse(await config.text());
      } catch {
        throw new Error(
          "A selected JSON file is invalid. Choose the manifest.json and optional character.json from the same export.",
        );
      }
      return loadPortableCharacterFiles(png, manifest, configuration);
    }, png.name);
  }

  function chooseAnimation(value: PortableAnimationName) {
    const clip = pack ? animationFor(pack.manifest, value) : undefined;
    if (!clip) return;
    elapsedRef.current = 0;
    frameRef.current = -1;
    setFrameId(clip.frames[0]);
    setFramePosition(0);
    setAnimation(value);
    if (completed) setPlaying(true);
    setCompleted(false);
    setPlaybackRevision((value) => value + 1);
  }

  function scrubFrame(index: number) {
    if (!selectedClip) return;
    elapsedRef.current = (index * 1000) / selectedClip.fps + 0.00001;
    setFramePosition(index);
    setPlaying(false);
    setCompleted(false);
    setPlaybackRevision((value) => value + 1);
  }

  function replayAnimation() {
    chooseAnimation(animation);
    setPlaying(true);
  }

  return (
    <div className="player-app">
      <header className="player-header">
        <a
          className="player-brand"
          href="/"
          aria-label="Gathria Character home"
        >
          <span className="player-brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            gathria<span className="player-brand-sub">CHARACTER</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/">Character studio</a>
          <a href="/player.html" aria-current="page">
            Pack player <ArrowUpRight size={14} />
          </a>
        </nav>
        <span className="player-header-tag">
          <span /> LOCAL & PRIVATE
        </span>
      </header>

      <main className="player-main">
        <div className="player-title-row">
          <div>
            <p className="player-eyebrow">YOUR CHARACTER, OUT IN THE WORLD</p>
            <h1>
              A little character.
              <br />
              <em>Ready to move.</em>
            </h1>
            <p className="player-intro">
              Drop in an exported pack and see your character come to life.
              <br className="player-desktop-break" /> An independent player,
              powered by the files you bring.
            </p>
          </div>
          <div className="player-title-note">
            <Box size={28} strokeWidth={1.3} />
            <span>
              Portable pixels.
              <br />
              Endless possibilities.
            </span>
          </div>
        </div>

        <div className="player-layout">
          <aside className="player-import-panel">
            <div className="player-section-heading">
              <span className="player-step">01</span>
              <h2>Bring your character</h2>
            </div>
            <div
              className={`player-upload ${dragging ? "player-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) openZip(file);
              }}
            >
              <div className="player-upload-icon">
                <Upload size={25} strokeWidth={1.5} />
              </div>
              <h3>A home for your pack</h3>
              <p>
                Drop your character ZIP here,
                <br />
                or choose one from your device.
              </p>
              <label
                className="player-button player-button-primary player-file-button"
                htmlFor="player-zip"
              >
                <PackageOpen size={16} /> Choose character pack
                <input
                  id="player-zip"
                  type="file"
                  accept=".zip,application/zip"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) openZip(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <span className="player-file-hint">
                .zip · CharacterPack or unified source bundle
              </span>
            </div>
            <button
              className="player-source-button"
              onClick={() => void openKlingExample()}
              disabled={busy}
            >
              <span className="player-sample-icon">
                <Layers3 size={19} />
              </span>
              <span>
                Original video artwork
                <strong>Try the Kling character pair</strong>
              </span>
              <ArrowRight size={17} />
            </button>
            <button
              className="player-sample-button"
              onClick={() => openExample("corrected-running")}
              disabled={busy}
            >
              <span className="player-sample-icon">
                <Layers3 size={19} />
              </span>
              <span>
                Just exploring?<strong>Try the denim daytrip pack</strong>
              </span>
              <ArrowRight size={17} />
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample("everyday")}
              disabled={busy}
            >
              Try the original denim pack · Motion V2
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample("running")}
              disabled={busy}
            >
              Try the running wedding pack
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample("running-v1")}
              disabled={busy}
            >
              Try the original running pack · Motion V1
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample(6)}
              disabled={busy}
            >
              Try the polished wedding pack · Art V6
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample(7)}
              disabled={busy}
            >
              Try the V7 wedding pack
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample(4)}
              disabled={busy}
            >
              Try Mira’s expressive pack · Art V4
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample(3)}
              disabled={busy}
            >
              Try Mira’s Art V3 pack · detailed
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample(2)}
              disabled={busy}
            >
              Try Mira’s Art V2 pack · classic
            </button>
            <button
              className="player-legacy-sample"
              onClick={() => openExample(1)}
              disabled={busy}
            >
              Try Mira’s example pack · original Art V1
            </button>
            <details className="player-separate-files">
              <summary>Have individual files?</summary>
              <p>
                Choose files from the same export. Character configuration is
                optional for playback.
              </p>
              <label htmlFor="player-png">
                Spritesheet PNG <span>required</span>
              </label>
              <input
                id="player-png"
                type="file"
                accept="image/png,.png"
                onChange={(event) =>
                  setFiles((previous) => ({
                    ...previous,
                    png: event.target.files?.[0],
                  }))
                }
              />
              <label htmlFor="player-manifest">
                Manifest JSON <span>required</span>
              </label>
              <input
                id="player-manifest"
                type="file"
                accept="application/json,.json"
                onChange={(event) =>
                  setFiles((previous) => ({
                    ...previous,
                    metadata: event.target.files?.[0],
                  }))
                }
              />
              <label htmlFor="player-config">
                Character JSON <span>optional</span>
              </label>
              <input
                id="player-config"
                type="file"
                accept="application/json,.json"
                onChange={(event) =>
                  setFiles((previous) => ({
                    ...previous,
                    config: event.target.files?.[0],
                  }))
                }
              />
              <button
                className="player-button player-button-secondary"
                onClick={openSeparateFiles}
                disabled={busy || !files.png || !files.metadata}
              >
                Load selected files <ArrowRight size={15} />
              </button>
            </details>
            <div className="player-local-note">
              <span className="player-small-dot" />
              <p>
                Your files stay in this browser.
                <br />
                Nothing is uploaded to a server.
              </p>
            </div>
            <div className="player-status" role="status" aria-live="polite">
              {busy ? (
                "Opening and validating your pack…"
              ) : pack ? (
                <>
                  <Check size={15} /> Loaded: {pack.manifest.name}
                </>
              ) : (
                "Ready for a character pack"
              )}
            </div>
            {error && (
              <div className="player-error" role="alert">
                <strong>Couldn’t load this character</strong>
                <p>{error}</p>
              </div>
            )}
          </aside>

          <section
            className="player-preview-panel"
            aria-label="Character playback"
          >
            <div className="player-preview-heading">
              <div>
                <span className="player-step">02</span>
                <h2>The little screen test</h2>
              </div>
              <span
                className={`player-loaded-badge ${pack ? "player-is-loaded" : ""}`}
              >
                <span /> {pack ? "PACK LOADED" : "AWAITING CHARACTER"}
              </span>
            </div>
            {isBaked && (
              <div className="player-baked-controls">
                <p>
                  <strong>Original artwork · baked playback</strong>
                  <br />
                  These frames preserve the supplied character artwork.
                  Clothing, colors and expressions are part of the image and
                  cannot be edited separately.
                </p>
                {sourceBundle && (
                  <div className="player-source-selection">
                    <label htmlFor="player-character">
                      Character
                      <select
                        id="player-character"
                        aria-label="Character"
                        value={characterId}
                        disabled={busy}
                        onChange={(event) =>
                          void selectSourceCharacter(event.target.value)
                        }
                      >
                        {sourceBundle.characters.map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {sourceBundle.characters.length === 2 && (
                      <label>
                        <input
                          type="checkbox"
                          checked={comparisonRequested}
                          disabled={busy}
                          onChange={(event) => {
                            setComparisonRequested(event.target.checked);
                            if (!event.target.checked) setComparisonPack(null);
                            else {
                              const other = sourceBundle.characters.find(
                                (character) => character.id !== characterId,
                              );
                              if (other)
                                void selectSourceCharacter(other.id, true);
                            }
                          }}
                        />{" "}
                        Compare both characters
                      </label>
                    )}
                  </div>
                )}
                {downloadPack && (
                  <button
                    className="player-button player-button-secondary"
                    disabled={busy}
                    onClick={() =>
                      downloadBlob(
                        downloadPack,
                        `${characterId || "baked-character"}.character.zip`,
                      )
                    }
                  >
                    Export selected CharacterPack
                  </button>
                )}
                {comparisonPack && (
                  <p>
                    Shared elapsed time, each source’s own frame rate. Different
                    source performances do not have identical foot phases.
                  </p>
                )}
              </div>
            )}
            <div
              className={`player-stage ${isBaked ? "player-smooth" : ""}`}
              ref={stageRef}
            >
              <div
                className="player-stage-surface"
                style={{ width: canvasRenderWidth }}
              >
                <span className="player-stage-label">
                  {pack
                    ? `${pack.manifest.name}${comparisonPack ? ` + ${comparisonPack.manifest.name}` : ""}`
                    : "YOUR NEXT ADVENTURER"}
                </span>
                <span className="player-stage-zoom">
                  {zoom}× {isBaked ? "SOURCE SCALE" : "PIXEL SCALE"}
                </span>
                <canvas
                  ref={canvasRef}
                  style={{ height: canvasHeight }}
                  data-testid="consumer-canvas"
                  data-frame-id={frameId}
                  data-frame-position={framePosition}
                  data-frame-page={
                    pack?.manifest.frames.find((frame) => frame.id === frameId)
                      ?.page ?? 0
                  }
                  data-comparison={Boolean(comparisonPack)}
                  aria-label={
                    pack
                      ? `${pack.manifest.name}, ${animation}, facing ${facing}, frame ${frameId}`
                      : "Character preview, no character loaded"
                  }
                  role="img"
                />
                {!pack && (
                  <div className="player-empty-stage">
                    <PackageOpen size={42} strokeWidth={1} />
                    <h3>A small world awaits.</h3>
                    <p>Load a character to take the first step.</p>
                  </div>
                )}
                <span
                  className="player-anchor-label"
                  style={{ top: attachmentY + 12, bottom: "auto" }}
                >
                  {pack
                    ? `ANCHOR ${pack.manifest.anchor.x}, ${pack.manifest.anchor.y}`
                    : "GROUND / ANCHOR"}
                </span>
                <span className="player-stage-frame">
                  {pack
                    ? `FRAME ID ${String(frameId).padStart(2, "0")}`
                    : "— / —"}
                </span>
              </div>
            </div>
            <div className="player-controls">
              <div className="player-control-row">
                <div className="player-control-field">
                  <span id="player-motion-label">Motion</span>
                  <div
                    className="player-segment"
                    role="group"
                    aria-labelledby="player-motion-label"
                  >
                    {(
                      [
                        "idle",
                        "walk",
                        "run",
                        "jump",
                        ...(isBaked ? ["celebrate" as const] : []),
                      ] as const
                    ).map((value) => (
                      <button
                        key={value}
                        disabled={!pack || !animationFor(pack.manifest, value)}
                        aria-describedby={
                          (value === "run" || value === "jump") &&
                          pack &&
                          !pack.manifest.animations[value]
                            ? `player-${value}-unavailable`
                            : undefined
                        }
                        aria-pressed={animation === value}
                        className={animation === value ? "player-selected" : ""}
                        onClick={() => chooseAnimation(value)}
                      >
                        {value === "idle"
                          ? "Idle"
                          : value === "walk"
                            ? "Walk"
                            : value === "run"
                              ? "Run"
                              : value === "jump"
                                ? "Jump"
                                : "Celebrate"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="player-control-field">
                  <span id="player-facing-label">Facing</span>
                  <div
                    className="player-segment"
                    role="group"
                    aria-labelledby="player-facing-label"
                  >
                    <button
                      disabled={!pack}
                      aria-pressed={facing === "left"}
                      className={facing === "left" ? "player-selected" : ""}
                      onClick={() => setFacing("left")}
                    >
                      <ArrowLeft size={15} /> Left
                    </button>
                    <button
                      disabled={!pack}
                      aria-pressed={facing === "right"}
                      className={facing === "right" ? "player-selected" : ""}
                      onClick={() => setFacing("right")}
                    >
                      Right <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                <button
                  className="player-play-button"
                  onClick={() => {
                    if (completed) replayAnimation();
                    else setPlaying((value) => !value);
                  }}
                  disabled={!pack}
                  aria-label={
                    completed
                      ? "Replay animation"
                      : playing
                        ? "Pause animation"
                        : "Play animation"
                  }
                >
                  {completed ? (
                    <RotateCcw size={18} />
                  ) : playing ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <Play size={18} fill="currentColor" />
                  )}
                </button>
              </div>
              <p className="player-motion-note">
                {isBaked
                  ? "Source playback · Motion inside each supplied frame is preserved."
                  : "In-place playback · The character stays in one place."}
              </p>
              {pack && !pack.manifest.animations.run && (
                <p className="player-motion-note" id="player-run-unavailable">
                  {pack.manifest.animations.jump
                    ? "Run unavailable: this pack does not include a run animation."
                    : "Run unavailable: this pack includes Idle and Walk only."}
                </p>
              )}
              {pack && !pack.manifest.animations.jump && (
                <p className="player-motion-note" id="player-jump-unavailable">
                  Jump unavailable: this pack does not include a jump animation.
                </p>
              )}
              {selectedClip && !selectedClip.loop && (
                <p className="player-motion-note" id="player-one-shot-note">
                  {completed
                    ? "Finished · Holding the final frame. Replay to start again."
                    : "Plays once · Holds the final frame until you replay or choose another action."}
                </p>
              )}
              {selectedClip && (
                <label className="player-frame-scrubber" htmlFor="player-frame">
                  Inspect frame {framePosition + 1} /{" "}
                  {selectedClip.frames.length}
                  <input
                    id="player-frame"
                    type="range"
                    min={0}
                    max={selectedClip.frames.length - 1}
                    step={1}
                    value={framePosition}
                    onChange={(event) => scrubFrame(Number(event.target.value))}
                  />
                </label>
              )}
              <div className="player-control-row player-secondary-controls">
                <label htmlFor="player-speed">
                  Playback speed
                  <select
                    id="player-speed"
                    aria-label="Playback speed"
                    value={speed}
                    disabled={!pack}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                  >
                    <option value={0.25}>0.25×</option>
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1×</option>
                    <option value={1.5}>1.5×</option>
                    <option value={2}>2×</option>
                  </select>
                </label>
                <label htmlFor="player-zoom">
                  {isBaked ? "Display scale" : "Pixel scale"}
                  <select
                    id="player-zoom"
                    aria-label={isBaked ? "Display scale" : "Pixel scale"}
                    value={zoom}
                    disabled={!pack}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  >
                    {zoomChoices.map((value) => (
                      <option key={value} value={value}>
                        {value}×
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="player-reset"
                  disabled={!pack}
                  onClick={() => {
                    chooseAnimation("idle");
                    setPlaying(true);
                    setSpeed(1);
                    setFacing("right");
                  }}
                >
                  <RotateCcw size={13} /> Reset
                </button>
                {selectedClip && !selectedClip.loop && (
                  <button
                    className="player-reset"
                    onClick={replayAnimation}
                    aria-describedby="player-one-shot-note"
                  >
                    <RotateCcw size={13} /> Replay clip
                  </button>
                )}
                <span className="player-timing">
                  {selectedClip
                    ? `${selectedClip.fps} FPS · ${selectedClip.loop ? "LOOP" : "ONCE"}`
                    : "PIXEL PERFECT"}
                </span>
              </div>
            </div>
          </section>
        </div>

        {pack && (
          <section
            className="player-pack-details"
            aria-label="Loaded pack information"
          >
            <div className="player-pack-detail-title">
              <FileJson size={22} strokeWidth={1.5} />
              <div>
                <h2>Inside this pack</h2>
                <p>{source}</p>
              </div>
            </div>
            <dl>
              <div>
                <dt>Spritesheet</dt>
                <dd>
                  {pack.manifest.spritesheet.width} ×{" "}
                  {pack.manifest.spritesheet.height} px
                </dd>
              </div>
              <div>
                <dt>Frame size</dt>
                <dd>
                  {pack.manifest.spritesheet.frameWidth} ×{" "}
                  {pack.manifest.spritesheet.frameHeight} px
                </dd>
              </div>
              <div>
                <dt>Animations</dt>
                <dd>
                  Idle {pack.manifest.animations.idle.fps} fps · Walk{" "}
                  {pack.manifest.animations.walk.fps} fps
                  {pack.manifest.animations.run
                    ? ` · Run ${pack.manifest.animations.run.fps} fps`
                    : " · Run unavailable"}
                  {pack.manifest.animations.jump
                    ? ` · Jump ${pack.manifest.animations.jump.fps} fps`
                    : " · Jump unavailable"}
                  {pack.manifest.schemaVersion !== 1 &&
                  pack.manifest.animations.celebrate
                    ? ` · Celebrate ${pack.manifest.animations.celebrate.fps} fps`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Generator</dt>
                <dd>{pack.manifest.generator}</dd>
              </div>
              <div>
                <dt>Configuration</dt>
                <dd>
                  {pack.config
                    ? "format" in pack.config
                      ? "Included · baked source recipe"
                      : `Included · Art V${pack.config.schemaVersion === 1 ? 1 : pack.config.artworkVersion}`
                    : "Not provided · optional"}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <footer className="player-footer">
          <span>Small characters. Big stories.</span>
          <p>
            Standalone pack formats v1, v2 & v3 <span>·</span> Gathria runtime
            compatibility is unverified.
          </p>
          <a href="/">
            Back to the studio <ArrowUpRight size={14} />
          </a>
        </footer>
      </main>
    </div>
  );
}
