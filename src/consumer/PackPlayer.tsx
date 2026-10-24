import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  characterPackImages,
  releaseCharacterImages,
  type LoadedCharacterImage,
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
  initialCharacterZoom,
  characterZoomChoices,
  pixelCharacterStage,
} from "./player";

import {
  klingCharacters,
  isKlingCharacterId,
  type KlingCharacterId,
  type KlingVariant,
} from "./kling-catalog";
import { loadKlingCharacter } from "./kling-packs";
import {
  advanceMotionFlow,
  readMotionFlow,
  requestMotionAction,
  type MotionState,
} from "./motion-flow";
import { MainNavigation } from "../workspace/MainNavigation";

const SpriteActionEditor = lazy(() => import("./SpriteActionEditor"));

type SourceEntry = { pack: LoadedCharacterPack; archive: Blob };

export function PackPlayer() {
  const embedded =
    new URLSearchParams(window.location.search).get("embedded") === "1";
  const authoring =
    new URLSearchParams(window.location.search).get("authoring") === "1";
  const requestedVariant: KlingVariant =
    new URLSearchParams(window.location.search).get("variant") === "motion"
      ? "motion"
      : new URLSearchParams(window.location.search).get("variant") ===
          "keyframes"
        ? "keyframes"
        : "original";
  const [editorBasePack, setEditorBasePack] =
    useState<LoadedCharacterPack | null>(null);
  const [authoringBusy, setAuthoringBusy] = useState(false);
  const [authoringDraft, setAuthoringDraft] = useState(false);
  const [modifiedActions, setModifiedActions] = useState(false);
  const modifiedActionsRef = useRef(false);
  const [pack, setPack] = useState<LoadedCharacterPack | null>(null);
  const [animation, setAnimation] = useState<PortableAnimationName>("idle");
  const [facing, setFacing] = useState<Facing>("right");
  const [playing, setPlaying] = useState(true);
  const [presentationActive, setPresentationActive] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(5);
  const [busy, setBusy] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [klingCatalog, setKlingCatalog] = useState(false);
  const [catalogVariant, setCatalogVariant] =
    useState<KlingVariant>("original");
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
  const [waitForPose, setWaitForPose] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<PortableAnimationName | null>(null);
  const motionStateRef = useRef<MotionState | null>(null);
  const sourceEntries = useRef(new Map<string, SourceEntry>());
  const retainedImages = useRef(new Set<LoadedCharacterImage>());
  const ownedImages = useRef(new Set<LoadedCharacterImage>());
  const imageLifetime = useRef(0);
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
  const pendingFetchRef = useRef<AbortController | null>(null);
  const frameRef = useRef(-1);
  const [canvasWidth, setCanvasWidth] = useState(640);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const sourceCharacters = klingCatalog
    ? klingCharacters(catalogVariant)
    : sourceBundle?.characters;
  const studyMetadata = pack?.config?.sourceMetadata?.keyframeStudy;
  const motionMetadata = pack?.config?.sourceMetadata?.motionFlow;
  const motionStudy =
    !!motionMetadata &&
    typeof motionMetadata === "object" &&
    !Array.isArray(motionMetadata) &&
    motionMetadata.format === "gathria-motion-flow";
  const motionProfile = useMemo(
    () => (pack ? readMotionFlow(pack.manifest, pack.config) : null),
    [pack],
  );
  const motionEnabled =
    !!motionProfile &&
    waitForPose &&
    !authoring &&
    !comparisonRequested &&
    !comparisonPack;
  const keyframeStudy =
    !!studyMetadata &&
    typeof studyMetadata === "object" &&
    !Array.isArray(studyMetadata) &&
    studyMetadata.format === "gathria-kling-keyframe-study";
  const originalCharacterId = isKlingCharacterId(characterId)
    ? characterId
    : motionProfile
      ? motionProfile.characterId
      : keyframeStudy &&
          typeof studyMetadata === "object" &&
          studyMetadata !== null &&
          !Array.isArray(studyMetadata) &&
          isKlingCharacterId(studyMetadata.characterId)
        ? studyMetadata.characterId
        : isKlingCharacterId(pack?.config?.characterId)
          ? pack.config.characterId
          : null;
  const selectedClip = pack
    ? animationFor(pack.manifest, animation)
    : undefined;
  const isBaked = !!pack;
  const sourceBlocked = busy || authoringBusy || authoringDraft;
  const zoomChoices = characterZoomChoices(
    pack?.manifest,
    zoom,
    canvasWidth,
    comparisonPack?.manifest,
  );
  const pixelStage = pack?.manifest.scale.pixelArt
    ? pixelCharacterStage(
        pack.manifest,
        zoom,
        canvasWidth,
        comparisonPack?.manifest,
      )
    : null;
  const pixelPreviewBlocked = pixelStage?.blocked ?? false;
  const frameHeight = Math.max(
    pack?.manifest.spritesheet.frameHeight ?? 0,
    comparisonPack?.manifest.spritesheet.frameHeight ?? 0,
  );
  const canvasHeight =
    pixelStage?.height ?? Math.max(420, frameHeight * zoom + 100);
  const canvasRenderWidth =
    pixelStage?.width ??
    Math.max(
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
  const attachmentY =
    pack && !pixelPreviewBlocked
      ? Math.floor((canvasHeight - frameHeight * zoom) / 2) +
        pack.manifest.anchor.y * zoom
      : 338;

  const clearPendingMotion = useCallback(() => {
    motionStateRef.current = null;
    setPendingAction(null);
  }, []);

  useEffect(() => {
    if (
      pack?.manifest.scale.integerOnly &&
      zoomChoices.length &&
      !zoomChoices.includes(zoom)
    )
      setZoom(
        zoomChoices.filter((choice) => choice <= zoom).at(-1) ?? zoomChoices[0],
      );
  }, [pack, comparisonPack, canvasWidth, zoom]);

  useEffect(() => {
    clearPendingMotion();
  }, [motionEnabled, motionProfile, clearPendingMotion]);

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
    if (!embedded) return;
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== window.location.origin ||
        event.data?.type !== "gathria-workbench-visibility" ||
        typeof event.data.active !== "boolean"
      )
        return;
      setPresentationActive(event.data.active);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [embedded]);

  useEffect(() => {
    if (!embedded || !pack) return;
    window.parent.postMessage(
      {
        type: "gathria:prepared-character",
        characterId:
          klingCatalog && isKlingCharacterId(characterId) ? characterId : null,
        name: pack.manifest.name,
      },
      window.location.origin,
    );
  }, [embedded, pack, klingCatalog, characterId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = pack?.manifest.scale.pixelArt
      ? 1
      : window.devicePixelRatio || 1;
    // Assigning either dimension clears the bitmap, even when unchanged.
    // Playback state changes must not expose a blank frame between effects.
    const width = Math.round(canvasRenderWidth * ratio);
    const height = Math.round(canvasHeight * ratio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (pixelPreviewBlocked) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
      return;
    }
    let previous: number | undefined;
    let request = 0;
    function draw(now: number) {
      if (!context || !canvas) return;
      let activeAnimation = animation;
      const delta =
        previous !== undefined && playing && presentationActive
          ? (now - previous) * speed
          : 0;
      if (motionEnabled && motionProfile) {
        const before = motionStateRef.current ?? {
          action: animation,
          elapsedMs: elapsedRef.current,
          pending: null,
        };
        const next =
          delta > 0 ? advanceMotionFlow(motionProfile, before, delta) : before;
        motionStateRef.current = next;
        elapsedRef.current = next.elapsedMs;
        activeAnimation = next.action;
        if (next.action !== animation) {
          frameRef.current = -1;
          setAnimation(next.action);
          setCompleted(false);
        }
        if (before.pending !== next.pending) setPendingAction(next.pending);
      } else elapsedRef.current += delta;
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
        const frame = frameAtTime(
          pack.manifest,
          activeAnimation,
          elapsedRef.current,
        );
        canvas.dataset.action = activeAnimation;
        canvas.dataset.elapsedMs = String(elapsedRef.current);
        canvas.dataset.pendingAction = motionStateRef.current?.pending ?? "";
        canvas.dataset.frameId = String(frame.id);
        canvas.dataset.framePage = String(frame.page ?? 0);
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
          animationFor(comparisonPack.manifest, activeAnimation)
        ) {
          const comparisonFrame = frameAtTime(
            comparisonPack.manifest,
            activeAnimation,
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
        const clip = animationFor(pack.manifest, activeAnimation)!;
        const position = Math.floor(
          (Math.max(0, elapsedRef.current) * clip.fps) / 1000,
        );
        const framePosition = clip.loop
          ? position % clip.frames.length
          : Math.min(position, clip.frames.length - 1);
        // Keep RAF/recording observers on the exact pixels painted this tick;
        // React's labels may commit a render later than the canvas bitmap.
        canvas.dataset.framePosition = String(framePosition);
        setFramePosition(framePosition);
        context.strokeStyle = "#7762d6";
        context.beginPath();
        context.moveTo(attachment.x - 5, attachment.y + 0.5);
        context.lineTo(attachment.x + 5, attachment.y + 0.5);
        context.moveTo(attachment.x + 0.5, attachment.y - 5);
        context.lineTo(attachment.x + 0.5, attachment.y + 5);
        context.stroke();
        const comparisonClip = comparisonPack
          ? animationFor(comparisonPack.manifest, activeAnimation)
          : undefined;
        // Keep a longer compared one-shot playing after the selected character
        // has landed. The shorter character holds its authored final frame.
        const comparisonEnded =
          !comparisonPack ||
          !comparisonClip ||
          comparisonClip.loop ||
          animationHasEnded(
            comparisonPack.manifest,
            activeAnimation,
            elapsedRef.current,
          );
        if (
          animationHasEnded(
            pack.manifest,
            activeAnimation,
            elapsedRef.current,
          ) &&
          comparisonEnded
        ) {
          setCompleted(true);
          setPlaying(false);
          return;
        }
      }
      if (playing && pack && presentationActive)
        request = requestAnimationFrame(draw);
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
    presentationActive,
    speed,
    zoom,
    canvasRenderWidth,
    canvasHeight,
    attachmentY,
    playbackRevision,
    motionEnabled,
    motionProfile,
    pixelPreviewBlocked,
  ]);

  // Edited action previews share their base pack's atlas pages. Release only
  // surfaces no longer used by any displayed, editable, or cached source pack.
  useEffect(() => {
    const active = new Set<LoadedCharacterImage>();
    for (const owner of [
      pack,
      editorBasePack,
      comparisonPack,
      ...[...sourceEntries.current.values()].map((entry) => entry.pack),
    ]) {
      if (owner)
        for (const image of characterPackImages(owner)) active.add(image);
    }
    const retired = [...retainedImages.current].filter(
      (image) => !active.has(image),
    );
    releaseCharacterImages(retired);
    for (const image of retired) ownedImages.current.delete(image);
    for (const image of active) ownedImages.current.add(image);
    retainedImages.current = active;
  });

  useEffect(() => {
    const lifetime = ++imageLifetime.current;
    return () => {
      // Wait until every drawing effect has stopped. StrictMode immediately
      // starts a fresh lifetime, so its rehearsal cleanup must not close pages.
      queueMicrotask(() => {
        if (imageLifetime.current !== lifetime) return;
        releaseCharacterImages(ownedImages.current);
        ownedImages.current.clear();
        retainedImages.current.clear();
      });
    };
  }, []);

  const openPack = useCallback(
    async (
      operation: (signal: AbortSignal) => Promise<LoadedCharacterPack>,
      label: string,
      onLoaded?: (loaded: LoadedCharacterPack) => void,
    ) => {
      const request = ++requestRef.current;
      pendingFetchRef.current?.abort();
      const controller = new AbortController();
      pendingFetchRef.current = controller;
      clearPendingMotion();
      setBusy(true);
      setLoadingMessage("Opening and validating your pack…");
      setError("");
      try {
        const loaded = await operation(controller.signal);
        if (request !== requestRef.current) {
          releaseCharacterImages(characterPackImages(loaded));
          return;
        }
        for (const image of characterPackImages(loaded))
          ownedImages.current.add(image);
        elapsedRef.current = 0;
        frameRef.current = -1;
        setFrameId(loaded.manifest.animations.idle.frames[0]);
        setPack(loaded);
        setWaitForPose(!!readMotionFlow(loaded.manifest, loaded.config));
        setEditorBasePack(loaded);
        setModifiedActions(false);
        modifiedActionsRef.current = false;
        setSource(label);
        setAnimation("idle");
        setFacing(loaded.manifest.facing.native);
        setZoom(
          initialCharacterZoom(
            loaded.manifest,
            (stageRef.current?.clientWidth ?? 640) - 48,
          ),
        );
        setFramePosition(0);
        setSourceBundle(null);
        setKlingCatalog(false);
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
    [clearPendingMotion],
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
        setDownloadPack(entry?.archive ?? file);
        if (bundle && entry) {
          setSourceBundle(bundle);
          setCharacterId(selectedId);
          sourceEntries.current.set(selectedId, entry);
        }
      },
    );
  }

  const openKlingExample = useCallback(
    (id: KlingCharacterId = "male", variant: KlingVariant = "original") => {
      let entry: SourceEntry;
      void openPack(
        async (signal) => {
          entry = await loadKlingCharacter(
            id,
            signal,
            (stage) => {
              if (!signal.aborted) setLoadingMessage(stage);
            },
            variant,
          );
          return entry.pack;
        },
        variant === "motion"
          ? "Kling motion & transitions · review candidate"
          : variant === "keyframes"
            ? "Kling keyframe loop study · review candidate"
            : "Kling original-video character · prepared pack",
        () => {
          setKlingCatalog(true);
          setCatalogVariant(variant);
          setCharacterId(id);
          setDownloadPack(entry.archive);
          sourceEntries.current.set(id, entry);
        },
      );
    },
    [openPack],
  );

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("kling");
    const start = window.setTimeout(() => {
      if (isKlingCharacterId(id)) openKlingExample(id, requestedVariant);
    }, 0);
    return () => {
      window.clearTimeout(start);
      ++requestRef.current;
      pendingFetchRef.current?.abort();
      sourceEntries.current.clear();
    };
  }, [openKlingExample, requestedVariant]);

  function retainSourceEntries(ids: string[]) {
    for (const id of sourceEntries.current.keys())
      if (!ids.includes(id)) sourceEntries.current.delete(id);
  }

  async function selectSourceCharacter(id: string, compare = false) {
    if (!sourceBundle && !(klingCatalog && isKlingCharacterId(id))) return;
    const request = ++requestRef.current;
    pendingFetchRef.current?.abort();
    const controller = new AbortController();
    pendingFetchRef.current = controller;
    clearPendingMotion();
    setBusy(true);
    setLoadingMessage("Opening and validating your pack…");
    setError("");
    try {
      const cachedEntry = sourceEntries.current.get(id);
      const entry =
        cachedEntry ??
        (klingCatalog && isKlingCharacterId(id)
          ? await loadKlingCharacter(
              id,
              controller.signal,
              (stage) => {
                if (!controller.signal.aborted) setLoadingMessage(stage);
              },
              catalogVariant,
            )
          : await sourceEntry(sourceBundle!, id));
      if (request !== requestRef.current) {
        if (!cachedEntry)
          releaseCharacterImages(characterPackImages(entry.pack));
        return;
      }
      for (const image of characterPackImages(entry.pack))
        ownedImages.current.add(image);
      sourceEntries.current.set(id, entry);
      if (compare) {
        setComparisonPack(entry.pack);
        retainSourceEntries([characterId, id]);
      } else {
        const previousId = characterId;
        setCharacterId(id);
        setPack(entry.pack);
        setWaitForPose(
          !!readMotionFlow(entry.pack.manifest, entry.pack.config),
        );
        if (motionStudy) elapsedRef.current = 0;
        setEditorBasePack(entry.pack);
        setModifiedActions(false);
        modifiedActionsRef.current = false;
        setDownloadPack(entry.archive);
        if (comparisonPack)
          setComparisonPack(
            sourceEntries.current.get(previousId)?.pack ?? null,
          );
        retainSourceEntries(comparisonPack ? [id, previousId] : [id]);
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

  function chooseAnimation(value: PortableAnimationName, immediate = false) {
    const clip = pack ? animationFor(pack.manifest, value) : undefined;
    if (!clip) return;
    if (motionEnabled && playing && !immediate) {
      const state = requestMotionAction(
        motionStateRef.current ?? {
          action: animation,
          elapsedMs: elapsedRef.current,
          pending: null,
        },
        value,
      );
      motionStateRef.current = state;
      setPendingAction(state.pending);
      return;
    }
    clearPendingMotion();
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
    clearPendingMotion();
    elapsedRef.current = (index * 1000) / selectedClip.fps + 0.00001;
    setFramePosition(index);
    setPlaying(false);
    setCompleted(false);
    setPlaybackRevision((value) => value + 1);
  }

  const previewActionSettings = useCallback(
    (next: LoadedCharacterPack, modified: boolean) => {
      clearPendingMotion();
      setPack(next);
      setModifiedActions(modified);
      if (modified || modifiedActionsRef.current) {
        elapsedRef.current = 0;
        frameRef.current = -1;
        setFramePosition(0);
        setCompleted(false);
        setPlaying(false);
      }
      modifiedActionsRef.current = modified;
      setPlaybackRevision((value) => value + 1);
    },
    [clearPendingMotion],
  );

  const openActionSource = useCallback(
    (archive: Blob, loaded: LoadedCharacterPack) => {
      void openPack(
        async () => loaded,
        "Saved sprite action project",
        () => {
          setDownloadPack(archive);
        },
      );
    },
    [openPack],
  );

  function replayAnimation() {
    chooseAnimation(animation, true);
    setPlaying(true);
  }

  return (
    <div className={`player-app${embedded ? " player-app--embedded" : ""}`}>
      {!embedded && <MainNavigation active="player" />}

      <main className="player-main">
        {!embedded && (
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
        )}

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
                if (file && !sourceBlocked) openZip(file);
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
                  disabled={sourceBlocked}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && !sourceBlocked) openZip(file);
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
              disabled={sourceBlocked}
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
                disabled={sourceBlocked}
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
                disabled={sourceBlocked}
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
                disabled={sourceBlocked}
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
                disabled={sourceBlocked || !files.png || !files.metadata}
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
                loadingMessage || "Opening and validating your pack…"
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
                  <strong>
                    {pack?.manifest.schemaVersion === 4
                      ? modifiedActions
                        ? "Authored pixel artwork · edited action settings"
                        : "Authored pixel artwork · baked playback"
                      : modifiedActions
                        ? "Original artwork · edited action settings"
                        : motionStudy
                          ? "Original artwork · motion & transitions study"
                          : keyframeStudy
                            ? "Original artwork · keyframe loop study"
                            : "Original artwork · baked playback"}
                  </strong>
                  <br />
                  These frames preserve the supplied character artwork.
                  Clothing, colors and expressions are part of the image and
                  cannot be edited separately.
                </p>
                {motionStudy && (
                  <p data-testid="motion-study-note">
                    <strong>
                      Motion &amp; transitions · review candidate.
                    </strong>{" "}
                    Existing source poses with reviewed switching points. Jump
                    plays its full landing and upright recovery, then returns to
                    Idle. No blended or generated frames.
                    {originalCharacterId && (
                      <>
                        {" "}
                        <a
                          href={`/player.html?kling=${originalCharacterId}&variant=keyframes`}
                        >
                          Open continuous-hop keyframes V1
                        </a>
                        {" · "}
                        <a href={`/player.html?kling=${originalCharacterId}`}>
                          Open original playback
                        </a>
                      </>
                    )}
                  </p>
                )}
                {keyframeStudy && (
                  <p data-testid="keyframe-study-note">
                    <strong>Keyframe loop study · review candidate.</strong>{" "}
                    This preset repeats all five actions. Jump is a repeated hop
                    that lands in a crouch; the original full jump stays a
                    one-shot. Original frame pixels are unchanged. Loop quality
                    remains under review.
                    {originalCharacterId && (
                      <>
                        {" "}
                        <a href={`/player.html?kling=${originalCharacterId}`}>
                          Open original playback
                        </a>
                      </>
                    )}
                  </p>
                )}
                {sourceCharacters && (
                  <div className="player-source-selection">
                    <label htmlFor="player-character">
                      Character
                      <select
                        id="player-character"
                        aria-label="Character"
                        value={characterId}
                        disabled={sourceBlocked}
                        onChange={(event) =>
                          void selectSourceCharacter(event.target.value)
                        }
                      >
                        {sourceCharacters.map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {sourceCharacters.length === 2 && (
                      <label>
                        <input
                          type="checkbox"
                          checked={comparisonRequested}
                          disabled={sourceBlocked}
                          onChange={(event) => {
                            clearPendingMotion();
                            setComparisonRequested(event.target.checked);
                            if (!event.target.checked) {
                              setComparisonPack(null);
                              retainSourceEntries([characterId]);
                            } else {
                              const other = sourceCharacters.find(
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
                    disabled={sourceBlocked}
                    onClick={() =>
                      downloadBlob(
                        downloadPack,
                        `${characterId || "baked-character"}${motionStudy ? "-motion" : keyframeStudy ? "-keyframes" : ""}.character.zip`,
                      )
                    }
                  >
                    {authoring
                      ? keyframeStudy || motionStudy
                        ? "Export source CharacterPack"
                        : "Export original CharacterPack"
                      : "Export selected CharacterPack"}
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
              className={`player-stage${pack?.manifest.scale.pixelArt ? "" : " player-smooth"}`}
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
                <span className="player-stage-zoom">{zoom}× SOURCE SCALE</span>
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
                  data-motion-flow={motionEnabled}
                  aria-label={
                    pack
                      ? `${pack.manifest.name}, ${animation}, facing ${facing}, frame ${frameId}`
                      : "Character preview, no character loaded"
                  }
                  role="img"
                />
                {pixelPreviewBlocked && (
                  <div
                    className="player-empty-stage"
                    role="status"
                    data-testid="pixel-preview-limit"
                  >
                    <h3>Pixel preview exceeds the display limit</h3>
                    <p>
                      This native frame cannot fit the 4-megapixel preview
                      budget at whole-number zoom. Its original CharacterPack
                      can still be exported.
                    </p>
                  </div>
                )}
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
                      ["idle", "walk", "run", "jump", "celebrate"] as const
                    ).map((value) => (
                      <button
                        key={value}
                        disabled={
                          !pack ||
                          authoringDraft ||
                          authoringBusy ||
                          !animationFor(pack.manifest, value)
                        }
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
                  disabled={!pack || pixelPreviewBlocked}
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
              {motionStudy && (
                <div
                  className="player-motion-note"
                  data-testid="motion-flow-controls"
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={waitForPose}
                      disabled={
                        !motionProfile ||
                        authoring ||
                        comparisonRequested ||
                        !!comparisonPack
                      }
                      onChange={(event) => {
                        clearPendingMotion();
                        setWaitForPose(event.target.checked);
                      }}
                    />{" "}
                    Wait for a matching pose
                  </label>
                  {!motionProfile ? (
                    <p>
                      Matching-pose switching is unavailable: this pack’s action
                      settings no longer match its reviewed routes.
                    </p>
                  ) : authoring ? (
                    <p>
                      Matching-pose switching is off while authoring, so action
                      and frame inspection stay immediate.
                    </p>
                  ) : comparisonRequested || comparisonPack ? (
                    <p>
                      Matching-pose switching is off during comparison. Shared
                      elapsed time does not synchronize the two performances’
                      poses.
                    </p>
                  ) : (
                    <p>
                      {waitForPose
                        ? "During playback, action requests wait for a reviewed exit. Paused selections switch immediately."
                        : "Actions switch immediately. Enable matching poses to compare the reviewed transitions."}
                    </p>
                  )}
                  <p data-testid="motion-pending" aria-live="polite">
                    {pendingAction
                      ? `Next: ${pendingAction} · waiting for the current pose${animation === "jump" ? " and full landing recovery" : ""}.`
                      : "No action waiting."}
                  </p>
                </div>
              )}
              <p className="player-motion-note">
                {modifiedActions
                  ? "Edited frame selection and timing · Original image pixels are preserved."
                  : "Source playback · Motion inside each supplied frame is preserved."}
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
                    : motionEnabled && animation === "jump"
                      ? "Plays the complete jump once, including recovery, then follows the waiting action or returns to Idle."
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
              {authoring && selectedClip && pack && (
                <div className="player-frame-steps">
                  <button
                    className="player-reset"
                    disabled={framePosition === 0}
                    onClick={() => scrubFrame(Math.max(0, framePosition - 1))}
                  >
                    Previous frame
                  </button>
                  <button
                    className="player-reset"
                    disabled={framePosition >= selectedClip.frames.length - 1}
                    onClick={() =>
                      scrubFrame(
                        Math.min(
                          selectedClip.frames.length - 1,
                          framePosition + 1,
                        ),
                      )
                    }
                  >
                    Next frame
                  </button>
                  <span data-testid="sprite-source-frame">
                    Atlas frame {frameId}
                    {(() => {
                      const origin = pack.config?.derivation.frames.find(
                        (frame) => frame.frameId === frameId,
                      );
                      return origin
                        ? ` · source index ${origin.sourceFrame} · ${origin.timeSeconds.toFixed(3)} s`
                        : " · source index unavailable";
                    })()}
                  </span>
                </div>
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
                  Display scale
                  <select
                    id="player-zoom"
                    aria-label="Display scale"
                    value={zoom}
                    disabled={!pack || !zoomChoices.length}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  >
                    {!zoomChoices.length && (
                      <option value={zoom}>Preview unavailable</option>
                    )}
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
                    chooseAnimation("idle", true);
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
            {authoring && !pixelPreviewBlocked && (
              <Suspense
                fallback={<p role="status">Loading sprite action tools…</p>}
              >
                <SpriteActionEditor
                  archive={downloadPack}
                  basePack={editorBasePack}
                  animation={animation}
                  facing={facing}
                  busy={busy}
                  onPreview={previewActionSettings}
                  onOpenSource={openActionSource}
                  onBusy={setAuthoringBusy}
                  onDraft={setAuthoringDraft}
                />
              </Suspense>
            )}
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
                  {pack.manifest.animations.celebrate
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
                    ? "Included · baked source recipe"
                    : "Not provided · optional"}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {!embedded && (
          <footer className="player-footer">
            <span>Small characters. Big stories.</span>
            <p>
              CharacterPack V2, V3 & V4 <span>·</span> Gathria runtime
              compatibility is unverified.
            </p>
            <a href="/">
              Back to character library <ArrowUpRight size={14} />
            </a>
          </footer>
        )}
      </main>
    </div>
  );
}
