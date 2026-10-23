import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  Shirt,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  KLING_CHARACTERS,
  type KlingCharacterId,
} from "../consumer/kling-catalog";
import {
  advanceMotionFlow,
  readMotionFlow,
  requestMotionAction,
  type MotionState,
} from "../consumer/motion-flow";
import { downloadBlob, safeFilename } from "../core/pack";
import { encodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import type { Facing, PortableAnimationName } from "../core/types";
import {
  APPEARANCE_HAIR_COLORS,
  APPEARANCE_MAX_BYTES,
  DEFAULT_APPEARANCE_SELECTION,
  type AppearanceSelection,
} from "../appearance/contract";
import {
  WARDROBE_MAX_ITEM_BYTES,
  WARDROBE_MAX_PROJECT_BYTES,
  WARDROBE_SLOTS,
  validateWardrobeDocument,
  type WardrobeProject,
  type WardrobeSelection,
  type WardrobeSlot,
} from "./contract";
import {
  addWardrobeAppearanceBank,
  addWardrobeGarment,
  createWardrobeProject,
  exportWardrobeProject,
  getWardrobeAppearanceSelection,
  importWardrobeProject,
  selectWardrobeAppearance,
  selectWardrobeGarment,
  updateWardrobePreview,
} from "./project";
import {
  createWardrobeCompositor,
  exportWardrobeCharacterPack,
  validateWardrobeAppearance,
  type WardrobeCompositor,
} from "./compositor";
import {
  getAppearanceUpgradeAvailability,
  appearanceReleaseFor,
  prepareAppearanceUpgrade,
  validateAppearanceCatalogRevision,
  type AppearanceCatalogRevision,
} from "../appearance/upgrade";
import AppearanceUpdatePreview from "./AppearanceUpdatePreview";
import {
  libraryAppearanceChoices,
  isLibraryAppearance,
  validateAppearanceLibraryBanks,
  type AppearanceLibraryBank,
  validateAppearanceStyleSummaries,
  type AppearanceStyleSummary,
} from "../appearance/catalog";
import "./wardrobe.css";
import { exportClothingRecipeKit } from "./recipe-kit";
import ClothingPoseInspector from "./ClothingPoseInspector";
import { wardrobeAssetUrl, wardrobeCatalogUrl } from "./catalog-assets";
import { retainOutfitAndCustomItems } from "./library-inventory";
import ConnectionInspector from "./ConnectionInspector";
import NamedLooks from "./NamedLooks";
import { createWardrobeDownloads } from "./download-cache";
import { checkLookSource, exactLookAsset, type NamedLook } from "./named-looks";
import { readLocalMaterial } from "./local-materials";

interface CatalogItem {
  id: string;
  name: string;
  slot: WardrobeSlot;
  url: string;
  sha256?: string;
}
interface CatalogCharacter {
  key: KlingCharacterId;
  name: string;
  characterId: string;
  sourceUrl: string;
  registrationUrl: string;
  templateUrl?: string;
  appearanceBankUrl?: string;
  appearanceRevision?: AppearanceCatalogRevision;
  appearanceStyles?: AppearanceStyleSummary[];
  appearanceLibraries?: AppearanceLibraryBank[];
  items: CatalogItem[];
  presets: Array<{ id: string; name: string; selection: WardrobeSelection }>;
}
interface Catalog {
  version: 1;
  characters: CatalogCharacter[];
}
interface Session {
  character: KlingCharacterId;
  project: WardrobeProject;
  renderer: WardrobeCompositor;
  dirty: boolean;
}
interface AppearancePreview {
  project: WardrobeProject;
  renderer: WardrobeCompositor;
  original: WardrobeCompositor;
  action: PortableAnimationName;
  position: number;
  facing: Facing;
}
// These are reviewed, actual application exports. Missing artwork remains a
// named choice until its matching thumbnail is delivered, never a broken URL.
const HAIR_PREVIEWS = import.meta.glob<string>("../appearance/previews/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});
const hairPreview = (character: KlingCharacterId, styleId: string) =>
  HAIR_PREVIEWS[`../appearance/previews/${character}-${styleId}.png`];
const HAIR_SWATCHES = {
  chestnut: "#74422e",
  espresso: "#332623",
  copper: "#ab5e37",
};
interface Props {
  initialCharacter: KlingCharacterId;
  active: boolean;
  onCharacterChange: (character: KlingCharacterId) => void;
}
const ACTIONS: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const SLOT_NAMES: Record<WardrobeSlot, string> = {
  top: "Top",
  bottom: "Bottom",
  fullBody: "Dress / one-piece",
  shoes: "Shoes",
};
const EMPTY_SELECTION: WardrobeSelection = {
  top: null,
  bottom: null,
  fullBody: null,
  shoes: null,
};
const nameFor = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);
const failureText = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);

function localUrl(value: unknown): string {
  if (typeof value !== "string")
    throw Error("The clothing library contains an invalid file link.");
  const url = new URL(wardrobeAssetUrl(value), window.location.href);
  if (
    url.origin !== window.location.origin ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw Error("Clothing library files must come from this application.");
  return url.href;
}
function readCatalog(value: unknown): Catalog {
  const data = value as Partial<Catalog>;
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.characters) ||
    data.characters.length !== 2
  )
    throw Error("This clothing library is not supported.");
  const seen = new Set<string>();
  const characters = data.characters.map((entry) => {
    if (
      !entry ||
      !["male", "female"].includes(entry.key) ||
      seen.has(entry.key) ||
      typeof entry.name !== "string" ||
      !Array.isArray(entry.items) ||
      // Catalog metadata is lazy-loaded; the embedded project still limits
      // itself to 16 actual garments and keeps its existing memory budgets.
      entry.items.length > 64 ||
      !Array.isArray(entry.presets)
    )
      throw Error("The clothing library has an invalid character.");
    seen.add(entry.key);
    const ids = new Set<string>();
    const items = entry.items.map((item) => {
      if (
        !item ||
        typeof item.id !== "string" ||
        ids.has(item.id) ||
        typeof item.name !== "string" ||
        !WARDROBE_SLOTS.includes(item.slot) ||
        (item.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(item.sha256))
      )
        throw Error("The clothing library has an invalid item.");
      ids.add(item.id);
      return { ...item, url: localUrl(item.url) };
    });
    const presets = entry.presets.map((preset) => {
      if (
        !preset ||
        typeof preset.id !== "string" ||
        typeof preset.name !== "string" ||
        !preset.selection
      )
        throw Error("The clothing library has an invalid outfit.");
      for (const slot of WARDROBE_SLOTS) {
        const id = preset.selection[slot];
        if (
          id !== null &&
          !items.some((item) => item.id === id && item.slot === slot)
        )
          throw Error("An outfit refers to missing clothing.");
      }
      if (
        preset.selection.fullBody &&
        (preset.selection.top || preset.selection.bottom)
      )
        throw Error(
          "A one-piece outfit cannot also select a separate top and bottom.",
        );
      return preset;
    });
    return {
      ...entry,
      characterId: entry.characterId ?? `kling-${entry.key}-motion-v1`,
      sourceUrl: localUrl(entry.sourceUrl),
      registrationUrl: localUrl(entry.registrationUrl),
      templateUrl: entry.templateUrl ? localUrl(entry.templateUrl) : undefined,
      appearanceBankUrl: entry.appearanceBankUrl
        ? localUrl(entry.appearanceBankUrl)
        : undefined,
      appearanceRevision: entry.appearanceRevision
        ? validateAppearanceCatalogRevision(entry.appearanceRevision)
        : undefined,
      appearanceStyles:
        entry.appearanceStyles === undefined
          ? undefined
          : validateAppearanceStyleSummaries(entry.appearanceStyles),
      appearanceLibraries:
        entry.appearanceLibraries === undefined
          ? undefined
          : validateAppearanceLibraryBanks(entry.appearanceLibraries).map(
              (bank) => ({ ...bank, url: localUrl(bank.url) }),
            ),
      items,
      presets,
    };
  });
  return { version: 1, characters };
}
function saveBytes(
  bytes: Uint8Array,
  filename: string,
  type = "application/zip",
) {
  downloadBlob(new Blob([new Uint8Array(bytes)], { type }), filename);
}
function canvasFor(image: RgbaPng): HTMLCanvasElement {
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
function mirrorImage(image: RgbaPng): RgbaPng {
  const pixels = new Uint8Array(image.pixels.length);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4;
      pixels.set(
        image.pixels.subarray(from, from + 4),
        (y * image.width + image.width - 1 - x) * 4,
      );
    }
  return { ...image, pixels };
}

export default function WardrobeEditor({
  initialCharacter,
  active,
  onCharacterChange,
}: Props) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancellable, setCancellable] = useState(false);
  const [downloads] = useState(() => createWardrobeDownloads());
  const [status, setStatus] = useState("Opening the clothing library…");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [shownAction, setShownAction] = useState<PortableAnimationName>("idle");
  const [pending, setPending] = useState<PortableAnimationName | null>(null);
  const [zoom, setZoom] = useState("fit");
  const [anchors, setAnchors] = useState(false);
  const [compare, setCompare] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [retry, setRetry] = useState(0);
  const [recipeItemId, setRecipeItemId] = useState("");
  const [showAllOutfits, setShowAllOutfits] = useState(false);
  const [appearancePreview, setAppearancePreview] =
    useState<AppearancePreview | null>(null);
  const previewRenderer = useRef<WardrobeCompositor | null>(null);
  const preparingAppearancePreview = useRef(false);
  const resumeAfterPreview = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const updateAppearanceButton = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const originalCanvas = useRef<HTMLCanvasElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const garmentInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const preparation = useRef<AbortController | null>(null);
  const current = useRef<Session | null>(null);
  const callbacks = useRef({ onCharacterChange });
  callbacks.current = { onCharacterChange };
  const savedSessions = useRef(
    new Map<KlingCharacterId, Pick<Session, "project" | "dirty">>(),
  );
  const motion = useRef<MotionState>({
    action: "idle",
    elapsedMs: 0,
    pending: null,
  });
  const tick = useRef(0);
  const rendered = useRef<{
    renderer: WardrobeCompositor;
    id: number;
    dressed: HTMLCanvasElement;
    original: HTMLCanvasElement | null;
  } | null>(null);

  function remember(next: Session) {
    current.current = next;
    savedSessions.current.set(next.character, {
      project: next.project,
      dirty: next.dirty,
    });
    setSession(next);
  }
  function beginPreparation() {
    preparation.current?.abort();
    const controller = new AbortController();
    preparation.current = controller;
    setCancellable(true);
    return { token: ++request.current, controller };
  }
  function fetchBytes(
    url: string,
    maximum: number,
    signal?: AbortSignal,
    hash?: string,
  ) {
    return downloads.load(url, maximum, {
      signal,
      sha256: hash,
      onProgress: (value) => {
        if (signal?.aborted || maximum < 2 * 1024 * 1024) return;
        const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
        setStatus(
          value.cached
            ? "Reusing verified artwork from this session…"
            : `Downloading artwork: ${mb(value.loaded)}${value.total ? ` / ${mb(value.total)}` : ""} MB…`,
        );
      },
    });
  }
  function cancelPreparation() {
    preparation.current?.abort();
    request.current++;
    if (preparingAppearancePreview.current)
      setPlaying(resumeAfterPreview.current && activeRef.current);
    preparingAppearancePreview.current = false;
    setBusy(false);
    setCancellable(false);
    setError("");
    setStatus(
      current.current
        ? "Preparation canceled. Your accepted outfit is unchanged."
        : "Loading canceled. Retry when you are ready.",
    );
  }
  async function accept(
    project: WardrobeProject,
    character: KlingCharacterId,
    dirty: boolean,
    token: number,
    signal: AbortSignal,
    preserveMotion = false,
  ) {
    const renderer = await createWardrobeCompositor(project, { signal });
    try {
      await validateWardrobeAppearance(renderer, {
        signal,
        onSourceProgress: (completedPages, totalPages) => {
          if (token === request.current && !signal.aborted)
            setStatus(
              `Preparing character artwork: ${completedPages} / ${totalPages}…`,
            );
        },
        onProgress: (completedFrames, totalFrames) => {
          if (token === request.current && !signal.aborted)
            setStatus(
              `Checking your character across all poses: ${completedFrames} / ${totalFrames}…`,
            );
        },
      });
      const action = preserveMotion
        ? motion.current.action
        : project.document.preview.action;
      const clip = project.archive.manifest.animations[action]!;
      const position = preserveMotion
        ? Math.min(tick.current, clip.frames.length - 1)
        : 0;
      // Decode and compose before replacing the accepted session. A bad item must
      // not leave the user looking at a blank preview or lose their open outfit.
      renderer.renderFrame(clip.frames[position]);
      if (token !== request.current || signal.aborted) {
        renderer.dispose();
        return;
      }
      const previous = current.current;
      remember({ project, character, renderer, dirty });
      previous?.renderer.dispose();
      rendered.current = null;
      if (!preserveMotion) {
        motion.current = { action, elapsedMs: 0, pending: null };
        setPlaying(false);
      }
      tick.current = position;
      setFrameIndex(position);
      setShownAction(action);
      setPending(motion.current.pending);
      callbacks.current.onCharacterChange(character);
    } catch (failure) {
      renderer.dispose();
      throw failure;
    }
  }

  useEffect(() => {
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Opening the clothing library…");
    void (async () => {
      try {
        const data = JSON.parse(
          new TextDecoder().decode(
            await fetchBytes(wardrobeCatalogUrl, 256 * 1024, controller.signal),
          ),
        );
        const library = readCatalog(data);
        if (token !== request.current) return;
        setCatalog(library);
        setStatus("Loading character artwork…");
        const entry = library.characters.find(
          (item) => item.key === initialCharacter,
        )!;
        const [source, registration] = await Promise.all([
          fetchBytes(entry.sourceUrl, 64 * 1024 * 1024, controller.signal),
          fetchBytes(entry.registrationUrl, 1024 * 1024, controller.signal),
        ]);
        if (token !== request.current) return;
        setStatus("Preparing this character…");
        const project = await createWardrobeProject(source, registration, [], {
          signal: controller.signal,
        });
        await accept(project, entry.key, false, token, controller.signal);
        if (token === request.current)
          setStatus(
            "Original outfit. Choose a complete look or combine individual pieces.",
          );
      } catch (failure) {
        if (token === request.current && !controller.signal.aborted)
          setError(failureText(failure));
      } finally {
        if (token === request.current) setBusy(false);
      }
    })();
    return () => {
      request.current++;
      controller.abort();
    };
  }, [initialCharacter, retry]);

  useEffect(
    () => () => {
      request.current++;
      preparation.current?.abort();
      current.current?.renderer.dispose();
      previewRenderer.current?.dispose();
      previewRenderer.current = null;
      current.current = null;
      rendered.current = null;
      savedSessions.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!active || !playing || busy || !session) return;
    let frame = 0;
    let previous: number | null = null;
    function animate(now: number) {
      if (document.hidden) previous = null;
      else {
        const open = current.current!;
        const manifest = open.project.archive.manifest;
        const profile = readMotionFlow(manifest, open.project.archive.config);
        const delta = previous === null ? 0 : (now - previous) * playbackRate;
        previous = now;
        const before = motion.current;
        let after: MotionState;
        if (profile) after = advanceMotionFlow(profile, before, delta);
        else {
          const clip = manifest.animations[before.action]!;
          const duration = (clip.frames.length * 1000) / clip.fps;
          after = {
            ...before,
            elapsedMs: clip.loop
              ? (before.elapsedMs + delta) % duration
              : Math.min(before.elapsedMs + delta, duration),
          };
          if (!clip.loop && after.elapsedMs >= duration) setPlaying(false);
        }
        motion.current = after;
        const clip = manifest.animations[after.action]!;
        const raw = Math.floor((after.elapsedMs * clip.fps) / 1000);
        const position = clip.loop
          ? raw % clip.frames.length
          : Math.min(raw, clip.frames.length - 1);
        tick.current = position;
        setFrameIndex(position);
        if (after.action !== before.action) {
          setShownAction(after.action);
          // A completed one-shot returns to Idle, including the saved preview.
          if (!after.pending)
            remember({
              ...open,
              project: updateWardrobePreview(open.project, {
                action: after.action,
                facing: open.project.document.preview.facing,
              }),
              dirty: true,
            });
        }
        if (after.pending !== before.pending) setPending(after.pending);
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [active, playing, busy, session?.renderer, playbackRate]);

  const project = session?.project;
  const entry = catalog?.characters.find(
    (item) => item.key === session?.character,
  );
  const clip = project?.archive.manifest.animations[shownAction];
  const frameId = clip?.frames[Math.min(frameIndex, clip.frames.length - 1)];
  const facing = project?.document.preview.facing ?? "right";
  const requestedAction = project?.document.preview.action ?? "idle";
  const registration = project?.registration;
  const outputSheet = session?.renderer.manifest.spritesheet;
  const outputAnchor = session?.renderer.manifest.anchor;
  const appearance =
    project?.document.version === 2
      ? project.document.appearance
      : DEFAULT_APPEARANCE_SELECTION;
  const appearanceAvailable = Boolean(
    project?.appearanceBank || entry?.appearanceBankUrl,
  );
  const appearanceRelease = appearanceReleaseFor(
    entry?.appearanceRevision,
    entry?.appearanceBankUrl,
    entry?.appearanceLibraries,
    project?.appearanceBank?.sha256,
  );
  const upgradeAvailability = project
    ? getAppearanceUpgradeAvailability(
        project,
        appearanceRelease?.revision,
        entry?.appearanceLibraries,
      )
    : null;
  const showLibraryThumbnails = isLibraryAppearance(
    project?.appearanceBank?.sha256,
    entry?.appearanceRevision?.bankSha256,
    entry?.appearanceLibraries,
  );
  const appearanceStyles = libraryAppearanceChoices(
    project?.appearanceBank?.manifest,
    project?.appearanceBank?.sha256,
    entry?.appearanceRevision?.bankSha256,
    entry?.appearanceStyles,
    entry?.appearanceLibraries,
  );

  useLayoutEffect(() => {
    if (!session || frameId === undefined || !canvas.current) return;
    try {
      let cached = rendered.current;
      if (
        !cached ||
        cached.renderer !== session.renderer ||
        cached.id !== frameId
      ) {
        cached = {
          renderer: session.renderer,
          id: frameId,
          dressed: canvasFor(session.renderer.renderFrame(frameId)),
          original: null,
        };
        rendered.current = cached;
      }
      if (compare && !cached.original)
        cached.original = canvasFor(
          session.renderer.renderSourceFrame(frameId),
        );
      function paint(
        target: HTMLCanvasElement | null,
        image: HTMLCanvasElement,
        overlay: boolean,
      ) {
        if (!target) return;
        const context = target.getContext("2d")!;
        context.clearRect(0, 0, target.width, target.height);
        context.save();
        if (facing === "left") {
          context.translate(target.width, 0);
          context.scale(-1, 1);
        }
        context.drawImage(image, 0, 0);
        if (overlay) {
          context.save();
          context.translate(
            session!.renderer.padding.left,
            session!.renderer.padding.top,
          );
          const registered = session!.project.registration.frames.find(
            (candidate) => candidate.frameId === frameId,
          )!;
          const points = registered.points;
          context.lineWidth = 3;
          context.strokeStyle = "#186f9b";
          for (const chain of [
            ["nearShoulder", "nearElbow", "nearWrist"],
            ["farShoulder", "farElbow", "farWrist"],
            ["nearHip", "nearKnee", "nearAnkle", "nearToe"],
            ["farHip", "farKnee", "farAnkle", "farToe"],
            ["waistLeft", "waistRight"],
          ] as const) {
            context.beginPath();
            chain.forEach((key, index) => {
              const p = points[key];
              if (index) context.lineTo(p.x, p.y);
              else context.moveTo(p.x, p.y);
            });
            context.stroke();
          }
          for (const point of Object.values(points)) {
            context.beginPath();
            context.arc(point.x, point.y, 6, 0, Math.PI * 2);
            context.fillStyle =
              point.visibility === "occluded" ? "#ffbd68" : "#e9ffff";
            context.fill();
            context.stroke();
          }
          const anchor = session!.project.registration.anchor;
          context.strokeStyle = "#bd4162";
          context.beginPath();
          context.moveTo(anchor.x - 14, anchor.y);
          context.lineTo(anchor.x + 14, anchor.y);
          context.moveTo(anchor.x, anchor.y - 14);
          context.lineTo(anchor.x, anchor.y + 14);
          context.stroke();
          context.restore();
        }
        context.restore();
        // Publish the observation metadata only after the matching bitmap is
        // painted. This also covers held source poses with repeated frame IDs.
        target.dataset.framePosition = String(frameIndex);
        target.dataset.renderedFrameId = String(frameId);
        target.dataset.renderedAction = shownAction;
        target.dataset.elapsedMs = String(motion.current.elapsedMs);
        target.dataset.pendingAction = motion.current.pending ?? "";
      }
      paint(canvas.current, cached.dressed, anchors);
      if (compare && cached.original)
        paint(originalCanvas.current, cached.original, anchors);
    } catch (failure) {
      setError(failureText(failure));
      setPlaying(false);
    }
  }, [
    session?.renderer,
    frameId,
    frameIndex,
    shownAction,
    facing,
    anchors,
    compare,
  ]);

  async function changeProject(
    transform: (
      project: WardrobeProject,
      signal: AbortSignal,
    ) => Promise<WardrobeProject> | WardrobeProject,
    message: string,
    preserveMotion = true,
  ) {
    const open = current.current;
    if (!open || busy || appearancePreview) return;
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Preparing your character…");
    try {
      const next = await transform(open.project, controller.signal);
      await accept(
        next,
        open.character,
        true,
        token,
        controller.signal,
        preserveMotion,
      );
      if (token === request.current) setStatus(message);
    } catch (failure) {
      if (token === request.current)
        setError(`${failureText(failure)} Your current outfit is unchanged.`);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  function closeAppearancePreview() {
    setAppearancePreview(null);
    previewRenderer.current?.dispose();
    previewRenderer.current = null;
    setPlaying(resumeAfterPreview.current && active);
    setStatus("Appearance preview closed. Your open outfit is unchanged.");
    requestAnimationFrame(() => updateAppearanceButton.current?.focus());
  }
  useEffect(() => {
    if (active) return;
    if (previewRenderer.current) closeAppearancePreview();
    if (preparingAppearancePreview.current) {
      preparingAppearancePreview.current = false;
      preparation.current?.abort();
      request.current++;
      setBusy(false);
      setStatus("Appearance preview canceled. Your open outfit is unchanged.");
    }
  }, [active]);

  async function previewAppearanceUpdate() {
    const open = current.current;
    const revision = appearanceRelease?.revision;
    const url = appearanceRelease?.url;
    if (!open || busy || appearancePreview || !revision || !url) return;
    const { token, controller } = beginPreparation();
    preparingAppearancePreview.current = true;
    resumeAfterPreview.current = playing;
    setPlaying(false);
    setBusy(true);
    setError("");
    setStatus(
      "Preparing an appearance update preview. Your open outfit is unchanged…",
    );
    let renderer: WardrobeCompositor | null = null;
    try {
      const candidate = await prepareAppearanceUpgrade(
        open.project,
        await fetchBytes(
          url,
          APPEARANCE_MAX_BYTES,
          controller.signal,
          revision.bankSha256,
        ),
        revision,
        { signal: controller.signal },
      );
      renderer = await createWardrobeCompositor(candidate, {
        signal: controller.signal,
      });
      await validateWardrobeAppearance(renderer, {
        signal: controller.signal,
        onProgress: (completed, total) => {
          if (token === request.current && !controller.signal.aborted)
            setStatus(
              `Checking updated appearance: ${completed} / ${total} poses…`,
            );
        },
      });
      if (
        token !== request.current ||
        controller.signal.aborted ||
        !activeRef.current
      ) {
        renderer.dispose();
        if (token === request.current && !controller.signal.aborted)
          setStatus(
            "Appearance preview canceled. Your open outfit is unchanged.",
          );
        return;
      }
      previewRenderer.current = renderer;
      setAppearancePreview({
        project: candidate,
        renderer,
        original: open.renderer,
        action: motion.current.action,
        position: tick.current,
        facing: open.project.document.preview.facing,
      });
      setStatus(
        "Compare the updated appearance, then save a separate copy if you want to keep it.",
      );
    } catch (failure) {
      renderer?.dispose();
      if (token === request.current && !controller.signal.aborted) {
        setError(`${failureText(failure)} Your open outfit is unchanged.`);
        setPlaying(resumeAfterPreview.current && activeRef.current);
      }
    } finally {
      if (token === request.current) {
        preparingAppearancePreview.current = false;
        setBusy(false);
      }
    }
  }
  async function saveAppearanceCopy(candidate: WardrobeProject) {
    const character = current.current?.character;
    if (!character)
      throw Error("Open a character before saving an updated copy.");
    const bytes = await exportWardrobeProject(candidate);
    saveBytes(
      bytes,
      `${safeFilename(`kling-${character}-wardrobe`)}-appearance-updated.wardrobe.zip`,
    );
    setStatus(
      "Updated appearance copy saved. Reopen the downloaded copy to use it; your original outfit is still open.",
    );
  }
  function chooseAppearance(selection: Partial<AppearanceSelection>) {
    void changeProject(async (base, signal) => {
      let next = retainOutfitAndCustomItems(base, entry?.items ?? []);
      const wanted = { ...getWardrobeAppearanceSelection(next), ...selection };
      const has = (id: string | null) =>
        !id ||
        next.appearanceBank?.manifest.styles.some((style) => style.id === id);
      if (
        (!next.appearanceBank && (wanted.hairId || wanted.faceId)) ||
        !has(wanted.hairId) ||
        !has(wanted.faceId)
      ) {
        const library = entry?.appearanceLibraries?.find(
          (bank) =>
            wanted.hairId &&
            bank.styles.some((style) => style.id === wanted.hairId),
        );
        const url = library?.url ?? entry?.appearanceBankUrl;
        const expected =
          library?.sha256 ?? entry?.appearanceRevision?.bankSha256;
        if (!url)
          throw Error(
            "Hair and face options are not available for this character.",
          );
        next = await addWardrobeAppearanceBank(
          next,
          await fetchBytes(url, APPEARANCE_MAX_BYTES, signal, expected),
          { signal },
        );
        if (
          (expected && next.appearanceBank?.sha256 !== expected) ||
          (library && next.appearanceBank?.manifest.id !== library.bankId)
        )
          throw Error("The appearance file does not match its library entry.");
      }
      return next.appearanceBank
        ? selectWardrobeAppearance(next, wanted)
        : next;
    }, "Appearance updated. Your clothing and original movement are preserved.");
  }
  function applyLook(look: NamedLook) {
    void changeProject(
      async (base, signal) => {
        checkLookSource(look, base);
        // Resolve every reference before fetching or changing the accepted outfit.
        const needed = await Promise.all(
          look.items.map(async (ref) => {
            const embedded = base.items.find(
              (i) => i.manifest.id === ref.id && i.sha256 === ref.sha256,
            );
            const item = embedded
              ? null
              : entry?.items.find(
                  (i) => i.id === ref.id && i.sha256 === ref.sha256,
                );
            const stored = !embedded
              ? await readLocalMaterial(
                  "garment",
                  ref.sha256,
                  signal,
                  Boolean(item),
                )
              : null;
            if (!embedded && !item && !stored) exactLookAsset(ref, []);
            return {
              ref,
              embedded,
              item,
              stored,
            };
          }),
        );
        const bankHash = look.appearance?.bankSha256;
        const bankUrl =
          bankHash === entry?.appearanceRevision?.bankSha256
            ? entry?.appearanceBankUrl
            : entry?.appearanceLibraries?.find((b) => b.sha256 === bankHash)
                ?.url;
        const storedBank =
          bankHash && base.appearanceBank?.sha256 !== bankHash
            ? await readLocalMaterial(
                "appearance",
                bankHash,
                signal,
                Boolean(bankUrl),
              )
            : null;
        if (
          bankHash &&
          base.appearanceBank?.sha256 !== bankHash &&
          !bankUrl &&
          !storedBank
        )
          throw Error(
            "The exact saved appearance is unavailable. Reopen its saved wardrobe project; no replacement was applied.",
          );
        let next = base;
        for (const slot of WARDROBE_SLOTS)
          next = selectWardrobeGarment(next, slot, null);
        // Release inactive library bytes before loading a different look, while
        // retaining its already-embedded references and every custom import.
        const requiredIds = new Set(look.items.map((item) => item.id));
        next = retainOutfitAndCustomItems(
          next,
          (entry?.items ?? []).filter((item) => !requiredIds.has(item.id)),
        );
        for (const { ref, embedded, item, stored } of needed) {
          if (embedded) continue;
          if (next.items.some((i) => i.manifest.id === ref.id))
            throw Error(
              "An imported item uses this name with different artwork. Reopen the saved wardrobe project.",
            );
          next = await addWardrobeGarment(
            next,
            stored ??
              (await fetchBytes(
                item!.url,
                WARDROBE_MAX_ITEM_BYTES,
                signal,
                ref.sha256,
              )),
          );
          exactLookAsset(
            ref,
            next.items.map((i) => ({ id: i.manifest.id, sha256: i.sha256 })),
          );
        }
        if (bankHash && next.appearanceBank?.sha256 !== bankHash)
          next = await addWardrobeAppearanceBank(
            next,
            storedBank ??
              (await fetchBytes(
                bankUrl!,
                APPEARANCE_MAX_BYTES,
                signal,
                bankHash,
              )),
            { signal },
          );
        if (!look.appearance) next = { ...next, appearanceBank: undefined };
        if (bankHash && next.appearanceBank?.sha256 !== bankHash)
          throw Error("The appearance file does not match the saved look.");
        const { appearance: _old, ...document } = next.document;
        next = {
          ...next,
          document: validateWardrobeDocument(
            {
              ...document,
              version: look.appearance ? 2 : 1,
              ...(look.appearance ? { appearance: look.appearance } : {}),
              selection: look.selection,
              preview: look.preview,
            },
            next,
          ),
        };
        return retainOutfitAndCustomItems(next, entry?.items ?? []);
      },
      `${look.name} restored with its saved materials, action and facing.`,
      false,
    );
  }
  async function ensureItem(
    base: WardrobeProject,
    id: string,
    signal?: AbortSignal,
  ): Promise<WardrobeProject> {
    base = retainOutfitAndCustomItems(base, entry?.items ?? []);
    if (base.items.some((item) => item.manifest.id === id)) return base;
    const item = entry?.items.find((candidate) => candidate.id === id);
    if (!item)
      throw Error(
        "This clothing item is not available for the current character.",
      );
    const next = await addWardrobeGarment(
      base,
      await fetchBytes(item.url, WARDROBE_MAX_ITEM_BYTES, signal, item.sha256),
    );
    const added = next.items.find((candidate) => candidate.manifest.id === id);
    if (
      !added ||
      added.manifest.slot !== item.slot ||
      (item.sha256 && added.sha256 !== item.sha256)
    )
      throw Error("The clothing file does not match its library entry.");
    return next;
  }
  function chooseItem(slot: WardrobeSlot, id: string) {
    void changeProject(
      async (base, signal) =>
        retainOutfitAndCustomItems(
          selectWardrobeGarment(
            id ? await ensureItem(base, id, signal) : base,
            slot,
            id || null,
          ),
          entry?.items ?? [],
        ),
      "Outfit updated. Check its silhouette through each movement.",
    );
  }
  function choosePreset(selection: WardrobeSelection, name: string) {
    void changeProject(async (base, signal) => {
      let next = base;
      for (const slot of WARDROBE_SLOTS)
        next = selectWardrobeGarment(next, slot, null);
      for (const slot of WARDROBE_SLOTS)
        if (selection[slot])
          next = selectWardrobeGarment(
            await ensureItem(next, selection[slot]!, signal),
            slot,
            selection[slot],
          );
      return retainOutfitAndCustomItems(next, entry?.items ?? []);
    }, `${name} selected. Clothing follows the original movement frames.`);
  }
  async function chooseCharacter(character: KlingCharacterId) {
    if (
      busy ||
      appearancePreview ||
      !catalog ||
      character === session?.character
    )
      return;
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Opening this character’s wardrobe…");
    try {
      const cached = savedSessions.current.get(character);
      const target = catalog.characters.find(
        (candidate) => candidate.key === character,
      )!;
      let next = cached?.project;
      if (!next) {
        const [source, registration] = await Promise.all([
          fetchBytes(target.sourceUrl, 64 * 1024 * 1024, controller.signal),
          fetchBytes(target.registrationUrl, 1024 * 1024, controller.signal),
        ]);
        next = await createWardrobeProject(source, registration, [], {
          signal: controller.signal,
        });
      }
      await accept(
        next,
        character,
        cached?.dirty ?? false,
        token,
        controller.signal,
      );
      if (token === request.current)
        setStatus(
          cached
            ? "Restored this character’s open outfit."
            : "Original outfit. Choose a complete look or individual pieces.",
        );
    } catch (failure) {
      if (token === request.current)
        setError(
          `${failureText(failure)} Your previous character is still open.`,
        );
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  function chooseAction(action: PortableAnimationName) {
    const open = current.current;
    if (!open || busy) return;
    const profile = readMotionFlow(
      open.project.archive.manifest,
      open.project.archive.config,
    );
    if (playing && profile) {
      motion.current = requestMotionAction(motion.current, action);
      setPending(motion.current.pending);
    } else {
      motion.current = { action, elapsedMs: 0, pending: null };
      tick.current = 0;
      setFrameIndex(0);
      setShownAction(action);
      setPending(null);
    }
    remember({
      ...open,
      project: updateWardrobePreview(open.project, { action, facing }),
      dirty: true,
    });
  }
  function chooseFacing(next: Facing) {
    const open = current.current;
    if (open)
      remember({
        ...open,
        project: updateWardrobePreview(open.project, {
          action: requestedAction,
          facing: next,
        }),
        dirty: true,
      });
  }
  function scrub(position: number) {
    if (!clip || !current.current) return;
    setPlaying(false);
    setPending(null);
    motion.current = {
      action: shownAction,
      elapsedMs: (position * 1000) / clip.fps,
      pending: null,
    };
    tick.current = position;
    setFrameIndex(position);
    const open = current.current;
    remember({
      ...open,
      project: updateWardrobePreview(open.project, {
        action: shownAction,
        facing,
      }),
      dirty: true,
    });
  }
  function togglePlayback() {
    if (!playing && clip && !clip.loop) {
      const duration = (clip.frames.length * 1000) / clip.fps;
      // Imported/edited clips can use direct playback without motion routes.
      // Once that one-shot has ended, Play should replay it, not stop again.
      if (motion.current.elapsedMs >= duration) {
        motion.current = { action: shownAction, elapsedMs: 0, pending: null };
        tick.current = 0;
        setFrameIndex(0);
        setPending(null);
      }
    }
    setPlaying(!playing);
  }
  async function importProject(file?: File) {
    if (!file || busy || appearancePreview) return;
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Checking the saved wardrobe…");
    try {
      if (file.size > WARDROBE_MAX_PROJECT_BYTES)
        throw Error("Wardrobe projects must be at most 128 MiB.");
      const next = await importWardrobeProject(
        new Uint8Array(await file.arrayBuffer()),
        { signal: controller.signal },
      );
      const target =
        catalog?.characters.find(
          (candidate) =>
            candidate.characterId === next.registration.characterId,
        ) ??
        KLING_CHARACTERS.map((candidate) => ({
          key: candidate.id,
          characterId: `kling-${candidate.id}-motion-v1`,
        })).find(
          (candidate) =>
            candidate.characterId === next.registration.characterId,
        );
      if (!target)
        throw Error(
          "This project does not belong to either supported Kling character.",
        );
      await accept(next, target.key, false, token, controller.signal);
      if (token === request.current)
        setStatus("Saved outfit and action settings restored.");
    } catch (failure) {
      if (token === request.current)
        setError(`${failureText(failure)} The open outfit has been kept.`);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  async function importGarment(file?: File) {
    if (!file) return;
    void changeProject(async (base) => {
      if (file.size > WARDROBE_MAX_ITEM_BYTES)
        throw Error("Clothing files must be at most 64 MiB.");
      return addWardrobeGarment(base, new Uint8Array(await file.arrayBuffer()));
    }, "Clothing added to the selection lists. Choose it to try it on.");
  }
  async function exportFile(kind: "project" | "pack" | "png") {
    const open = current.current;
    if (!open || busy || appearancePreview || frameId === undefined) return;
    setBusy(true);
    setCancellable(false);
    setError("");
    setStatus(
      kind === "pack"
        ? "Building the complete character pack…"
        : "Preparing your download…",
    );
    try {
      const stem = safeFilename(`kling-${open.character}-wardrobe`);
      if (kind === "project") {
        saveBytes(
          await exportWardrobeProject(open.project),
          `${stem}.wardrobe.zip`,
        );
        remember({ ...open, dirty: false });
        setStatus(
          "Wardrobe project saved with the original character and clothing. Reopen it here to keep editing.",
        );
      } else if (kind === "pack") {
        saveBytes(
          await exportWardrobeCharacterPack(open.project, {
            onProgress: ({ completedPages, totalPages }) =>
              setStatus(
                `Building character pack: ${completedPages} / ${totalPages} pages…`,
              ),
          }),
          `${stem}.character.zip`,
        );
        setStatus(
          "CharacterPack exported with all actions. It can play independently after this editor is closed.",
        );
      } else {
        const image = open.renderer.renderFrame(frameId);
        saveBytes(
          encodeSourceRgbaPng(facing === "left" ? mirrorImage(image) : image),
          `${stem}-${shownAction}-${facing}-${frameId}.png`,
          "image/png",
        );
        setStatus("Transparent frame saved without the preview guides.");
      }
    } catch (failure) {
      setError(failureText(failure));
    } finally {
      setBusy(false);
    }
  }

  async function exportGif() {
    const open = current.current;
    if (!open || busy || appearancePreview) return;
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Preparing action GIF…");
    try {
      const { exportWardrobeActionGif } = await import("./action-gif");
      const bytes = await exportWardrobeActionGif(
        open.renderer,
        shownAction,
        facing,
        {
          signal: controller.signal,
          onProgress: (done, total) => {
            if (token === request.current)
              setStatus(`Preparing action GIF: ${done} / ${total}…`);
          },
        },
      );
      if (token !== request.current || controller.signal.aborted) return;
      saveBytes(
        bytes,
        `${safeFilename(`kling-${open.character}-wardrobe`)}-${shownAction}-${facing}-half.gif`,
        "image/gif",
      );
      setStatus(
        "Action GIF saved at half native size, original timing and the selected direction, on a cream background.",
      );
    } catch (failure) {
      if (token === request.current && !controller.signal.aborted)
        setError(failureText(failure));
    } finally {
      if (token === request.current) {
        setBusy(false);
        setCancellable(false);
      }
    }
  }

  async function exportRecipe(
    itemId: string,
    poseId?: number,
    neighbors = false,
  ) {
    if (!current.current || busy) return;
    setBusy(true);
    setError("");
    setStatus("Preparing the selected clothing and its fitting guides…");
    try {
      const bytes = await exportClothingRecipeKit(
        current.current.project,
        itemId,
        poseId,
        neighbors ? { action: shownAction, position: frameIndex } : undefined,
      );
      saveBytes(
        bytes,
        `${itemId}${neighbors ? `-${shownAction}-neighbors` : poseId === undefined ? "" : `-pose-${poseId}`}.clothing-recipe.zip`,
      );
      setStatus(
        "Clothing recipe saved. Edit it offline, then import the new clothing item.",
      );
    } catch (e) {
      setError(failureText(e));
      setStatus("Your current outfit is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  const selected = project?.document.selection ?? EMPTY_SELECTION;
  const selectedPreset = entry?.presets.find((preset) =>
    WARDROBE_SLOTS.every((slot) => preset.selection[slot] === selected[slot]),
  );
  const original = WARDROBE_SLOTS.every((slot) => !selected[slot]);
  const outfitPresets =
    entry?.presets.filter((preset) =>
      WARDROBE_SLOTS.some((slot) => preset.selection[slot]),
    ) ?? [];
  const recommendedIds =
    session?.character === "female"
      ? [
          entry?.presets.some((p) => p.id === "day-native-folds")
            ? "day-native-folds"
            : "day-soft-waist",
          entry?.presets.some((p) => p.id === "wedding-native-folds")
            ? "wedding-native-folds"
            : "wedding-soft-waist",
          "sage-pinafore",
          "ivory-refined",
        ]
      : [
          entry?.presets.some((p) => p.id === "day-soft-cuff")
            ? "day-soft-cuff"
            : "day-refined",
          entry?.presets.some((p) => p.id === "wedding-reviewed-sleeve")
            ? "wedding-reviewed-sleeve"
            : entry?.presets.some((p) => p.id === "wedding-soft-cuff")
              ? "wedding-soft-cuff"
              : "wedding-refined",
          "oat-weekend",
          "forest-weekend",
        ];
  const hasRecommended = outfitPresets.some((p) =>
    recommendedIds.includes(p.id),
  );
  const recommended = (id: string) =>
    !hasRecommended || recommendedIds.includes(id);
  const moreOutfits = outfitPresets.some((p) => !recommended(p.id));
  const size = outputSheet
    ? {
        width:
          zoom === "fit" ? undefined : outputSheet.frameWidth * Number(zoom),
        height:
          zoom === "fit" ? undefined : outputSheet.frameHeight * Number(zoom),
      }
    : undefined;

  return (
    <div className="wardrobe-editor" aria-busy={busy}>
      <div className="wardrobe-toolbar">
        <label>
          Character
          <select
            aria-label="Wardrobe character"
            value={session?.character ?? initialCharacter}
            disabled={busy || Boolean(appearancePreview) || !catalog}
            onChange={(event) =>
              void chooseCharacter(event.target.value as KlingCharacterId)
            }
          >
            {(
              catalog?.characters ??
              KLING_CHARACTERS.map(({ id, name }) => ({ key: id, name }))
            ).map((character) => (
              <option key={character.key} value={character.key}>
                {character.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Choose hair, expression and clothing while keeping the original
          movement.
        </p>
        <button
          type="button"
          disabled={busy || Boolean(appearancePreview)}
          onClick={() => projectInput.current?.click()}
        >
          <FolderOpen size={16} aria-hidden="true" /> Reopen wardrobe
        </button>
        <button
          type="button"
          disabled={busy || Boolean(appearancePreview) || !session}
          onClick={() => void exportFile("project")}
        >
          <Download size={16} aria-hidden="true" /> Save wardrobe
          {session?.dirty ? " *" : ""}
        </button>
        <input
          ref={projectInput}
          type="file"
          accept=".zip"
          aria-label="Open wardrobe project file"
          hidden
          onChange={(event) => {
            void importProject(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <input
          ref={garmentInput}
          type="file"
          accept=".zip"
          aria-label="Import registered clothing file"
          hidden
          onChange={(event) => {
            void importGarment(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && (
        <div className="wardrobe-error" role="alert">
          <strong>Couldn’t complete this change</strong>
          <p>{error}</p>
          {!session && (
            <button
              type="button"
              disabled={busy || Boolean(appearancePreview)}
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry loading
            </button>
          )}
        </div>
      )}
      <p role="status" className="wardrobe-status">
        {busy && <span className="wardrobe-spinner" aria-hidden="true" />}
        {status}
      </p>
      {busy && cancellable && (
        <button type="button" onClick={cancelPreparation}>
          Cancel preparation
        </button>
      )}
      {!busy && !session && !error && (
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          Retry loading
        </button>
      )}
      {session && project && registration && outputSheet && outputAnchor && (
        <div className="wardrobe-layout">
          <aside className="wardrobe-controls" aria-label="Clothing selection">
            <section className="wardrobe-appearance" aria-label="Hair and face">
              <div className="wardrobe-section-title">
                <h2>Hair &amp; face</h2>
              </div>
              <div
                className="appearance-style-choices"
                role="group"
                aria-label="Hairstyle previews"
              >
                {appearanceStyles
                  .filter((style) => style.slot === "hair")
                  .map((style) => (
                    <button
                      type="button"
                      key={style.id}
                      aria-label={`Choose ${style.name}`}
                      aria-pressed={appearance.hairId === style.id}
                      disabled={
                        busy ||
                        Boolean(appearancePreview) ||
                        !appearanceAvailable
                      }
                      onClick={() => chooseAppearance({ hairId: style.id })}
                    >
                      {showLibraryThumbnails &&
                        hairPreview(session.character, style.id) && (
                          <img
                            src={hairPreview(session.character, style.id)}
                            alt=""
                            width={152}
                            height={128}
                          />
                        )}
                      <span>{style.name}</span>
                    </button>
                  ))}
              </div>
              <p className="wardrobe-hint appearance-example-note">
                {showLibraryThumbnails
                  ? "Style examples in Chestnut. Your chosen color and face appear in the live preview."
                  : "Using the appearance saved in this project. Inspect its styles in the live preview."}
              </p>
              <label className="wardrobe-slot">
                Hairstyle
                <select
                  aria-label="Hairstyle"
                  value={appearance.hairId ?? ""}
                  disabled={
                    busy || Boolean(appearancePreview) || !appearanceAvailable
                  }
                  onChange={(event) =>
                    chooseAppearance({ hairId: event.target.value || null })
                  }
                >
                  <option value="">Original</option>
                  {appearanceStyles
                    .filter((style) => style.slot === "hair")
                    .map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="wardrobe-slot">
                Face
                <select
                  aria-label="Face"
                  value={appearance.faceId ?? ""}
                  disabled={
                    busy || Boolean(appearancePreview) || !appearanceAvailable
                  }
                  onChange={(event) =>
                    chooseAppearance({ faceId: event.target.value || null })
                  }
                >
                  <option value="">Original</option>
                  {appearanceStyles
                    .filter((style) => style.slot === "face")
                    .map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="wardrobe-slot">
                Hair color
                <select
                  aria-label="Hair color"
                  value={appearance.hairColor}
                  disabled={
                    busy || Boolean(appearancePreview) || !appearance.hairId
                  }
                  onChange={(event) =>
                    chooseAppearance({
                      hairColor: event.target
                        .value as AppearanceSelection["hairColor"],
                    })
                  }
                >
                  {APPEARANCE_HAIR_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {nameFor(color)}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="appearance-color-choices"
                role="group"
                aria-label="Hair color swatches"
              >
                {APPEARANCE_HAIR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use ${nameFor(color)}`}
                    aria-pressed={appearance.hairColor === color}
                    disabled={
                      busy || Boolean(appearancePreview) || !appearance.hairId
                    }
                    onClick={() => chooseAppearance({ hairColor: color })}
                  >
                    <span
                      className="appearance-color-swatch"
                      style={{ backgroundColor: HAIR_SWATCHES[color] }}
                      aria-hidden="true"
                    />
                    <span>{nameFor(color)}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={
                  busy ||
                  Boolean(appearancePreview) ||
                  (!appearance.hairId && !appearance.faceId)
                }
                onClick={() => chooseAppearance(DEFAULT_APPEARANCE_SELECTION)}
              >
                <RotateCcw size={14} aria-hidden="true" /> Reset appearance
              </button>
              <p className="wardrobe-hint">
                Hair and face choices stay with this character when you change
                outfits. Gentle keeps the original action blinks and laughter.
                Use Compare original to inspect the source face and movement.
              </p>
              {upgradeAvailability?.status === "available" &&
                entry?.appearanceBankUrl && (
                  <div className="appearance-update-entry">
                    <p>
                      {project.appearanceBank
                        ? "A refined appearance is available. Preview it with your current outfit before saving a separate copy."
                        : "You can add the current hair and face tools to a separate copy. Your original appearance is kept until you choose a style."}
                    </p>
                    <button
                      ref={updateAppearanceButton}
                      type="button"
                      disabled={busy || Boolean(appearancePreview)}
                      onClick={() => void previewAppearanceUpdate()}
                    >
                      Preview updated appearance
                    </button>
                  </div>
                )}
              {project.appearanceBank &&
                upgradeAvailability?.status === "current" && (
                  <p className="wardrobe-hint">
                    This project uses the current appearance.
                  </p>
                )}
              {project.appearanceBank &&
                upgradeAvailability?.status === "unavailable" && (
                  <p className="wardrobe-hint">{upgradeAvailability.reason}</p>
                )}
            </section>
            <div className="wardrobe-section-title">
              <Shirt size={18} aria-hidden="true" />
              <h2>Your outfit</h2>
            </div>
            {hasRecommended && (
              <p className="wardrobe-hint">
                Recommended starting looks. Your saved outfits keep their
                original artwork.
              </p>
            )}
            <div
              className="wardrobe-presets"
              role="group"
              aria-label="Complete outfits"
            >
              <button
                type="button"
                aria-pressed={original}
                disabled={busy || Boolean(appearancePreview)}
                onClick={() => choosePreset(EMPTY_SELECTION, "Original outfit")}
              >
                Original
              </button>
              {outfitPresets
                .filter(
                  (preset) =>
                    showAllOutfits ||
                    recommended(preset.id) ||
                    selectedPreset?.id === preset.id,
                )
                .map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selectedPreset?.id === preset.id}
                    disabled={busy || Boolean(appearancePreview)}
                    onClick={() => choosePreset(preset.selection, preset.name)}
                  >
                    {preset.name}
                  </button>
                ))}
            </div>
            {moreOutfits && (
              <button
                className="wardrobe-more-outfits"
                type="button"
                aria-expanded={showAllOutfits}
                onClick={() => setShowAllOutfits(!showAllOutfits)}
              >
                {showAllOutfits
                  ? "Show recommended outfits"
                  : "More outfits and earlier versions"}
              </button>
            )}
            {WARDROBE_SLOTS.map((slot) => {
              const choices = new Map<string, { id: string; name: string }>();
              for (const item of entry?.items ?? [])
                if (item.slot === slot) choices.set(item.id, item);
              for (const item of project.items)
                if (item.manifest.slot === slot)
                  choices.set(item.manifest.id, item.manifest);
              return (
                <label key={slot} className="wardrobe-slot">
                  {SLOT_NAMES[slot]}
                  <select
                    aria-label={SLOT_NAMES[slot]}
                    disabled={busy || Boolean(appearancePreview)}
                    value={selected[slot] ?? ""}
                    onChange={(event) => chooseItem(slot, event.target.value)}
                  >
                    <option value="">
                      {slot === "fullBody" ? "Separate pieces" : "Original"}
                    </option>
                    {[...choices.values()].map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            <p className="wardrobe-hint">
              A dress or one-piece replaces both top and bottom. Shoes sit
              beneath trouser cuffs and hems.
            </p>
            <NamedLooks
              project={project}
              character={session.character}
              disabled={busy || Boolean(appearancePreview)}
              onApply={applyLook}
            />
            <button
              type="button"
              className="wardrobe-secondary"
              disabled={busy || Boolean(appearancePreview)}
              onClick={() => garmentInput.current?.click()}
            >
              <Upload size={15} aria-hidden="true" /> Add clothing file
            </button>
            <p className="wardrobe-hint">
              New clothing must match this character’s registered poses.
              Incompatible files leave your outfit unchanged.
            </p>
            <p className="wardrobe-hint">
              Projects keep your current look and custom clothing. Other library
              clothes and hairstyles load when selected; the saved look remains
              self-contained for reopening and export.
            </p>
            <details className="wardrobe-guides">
              <summary>Fitting guides</summary>
              <p>
                White points mark visible joints; amber points are estimated
                behind the body. The rose cross is the fixed attachment point.
              </p>
              <button
                type="button"
                disabled={busy || Boolean(appearancePreview)}
                onClick={() =>
                  saveBytes(
                    project.registrationBytes,
                    `kling-${session.character}-anchors.json`,
                    "application/json",
                  )
                }
              >
                Download anchor guide
              </button>
              {entry?.templateUrl && (
                <>
                  <a
                    className="wardrobe-template-link"
                    href={entry.templateUrl}
                    download={`kling-${session.character}-wardrobe-template.zip`}
                  >
                    Download clothing template
                  </a>
                  <p>
                    Original frames, anchors and masks for preparing new
                    clothing offline. This reference kit is separate from your
                    saved wardrobe project.
                  </p>
                </>
              )}
              {(() => {
                const worn = project.items.filter(
                  (item) =>
                    item.manifest.slot !== "shoes" &&
                    Object.values(project.document.selection).includes(
                      item.manifest.id,
                    ),
                );
                const chosen =
                  worn.find((item) => item.manifest.id === recipeItemId) ??
                  worn[0];
                if (!chosen)
                  return (
                    <p>
                      Choose a top, bottom or dress to make a clothing variant.
                    </p>
                  );
                return (
                  <>
                    <label className="wardrobe-slot">
                      Clothing to use as a starting point
                      <select
                        aria-label="Recipe clothing"
                        value={chosen.manifest.id}
                        disabled={busy || Boolean(appearancePreview)}
                        onChange={(event) =>
                          setRecipeItemId(event.target.value)
                        }
                      >
                        {worn.map((item) => (
                          <option
                            key={item.manifest.id}
                            value={item.manifest.id}
                          >
                            {item.manifest.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={busy || Boolean(appearancePreview)}
                      onClick={() => void exportRecipe(chosen.manifest.id)}
                    >
                      Download clothing recipe
                    </button>
                    <p>
                      A copy of this clothing with fitting guides for new colors
                      or local pose corrections. Your current outfit stays
                      intact.
                    </p>
                    {frameId !== undefined && (
                      <ClothingPoseInspector
                        item={chosen}
                        frameId={frameId}
                        clip={clip!}
                        position={frameIndex}
                        onExportNeighbors={() =>
                          void exportRecipe(chosen.manifest.id, frameId, true)
                        }
                        disabled={busy || Boolean(appearancePreview)}
                        onExport={() =>
                          void exportRecipe(chosen.manifest.id, frameId)
                        }
                      />
                    )}
                  </>
                );
              })()}
            </details>
            <div className="wardrobe-exports">
              <h3>Take this character with you</h3>
              <button
                type="button"
                className="wardrobe-primary"
                disabled={busy || Boolean(appearancePreview)}
                onClick={() => void exportFile("pack")}
              >
                <Download size={16} aria-hidden="true" /> Export CharacterPack
              </button>
              <button
                type="button"
                disabled={busy || Boolean(appearancePreview)}
                onClick={() => void exportFile("png")}
              >
                Save current PNG
              </button>
              <button
                type="button"
                disabled={busy || Boolean(appearancePreview)}
                onClick={() => void exportGif()}
              >
                Download action GIF
              </button>
              <p className="wardrobe-hint">
                GIF: current action and direction, half native size, cream
                background, original speed. One-shot actions play once.
              </p>
              <a href="/player.html" target="_blank" rel="noreferrer">
                Open independent player ↗
              </a>
              <p className="wardrobe-hint">
                The CharacterPack contains the finished animation. Save a
                wardrobe project as well to change hair, face or clothing later.
              </p>
            </div>
          </aside>
          <section className="wardrobe-review" aria-label="Outfit preview">
            <div className="wardrobe-playback-controls">
              <label>
                Action
                <select
                  aria-label="Wardrobe action"
                  value={requestedAction}
                  disabled={busy || Boolean(appearancePreview)}
                  onChange={(event) =>
                    chooseAction(event.target.value as PortableAnimationName)
                  }
                >
                  {ACTIONS.filter(
                    (action) => project.archive.manifest.animations[action],
                  ).map((action) => (
                    <option key={action} value={action}>
                      {nameFor(action)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Facing
                <select
                  aria-label="Wardrobe facing"
                  value={facing}
                  disabled={busy || Boolean(appearancePreview)}
                  onChange={(event) =>
                    chooseFacing(event.target.value as Facing)
                  }
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </label>
              <button
                type="button"
                aria-label={
                  playing
                    ? "Pause wardrobe animation"
                    : "Play wardrobe animation"
                }
                disabled={busy || Boolean(appearancePreview)}
                onClick={togglePlayback}
              >
                {playing ? (
                  <Pause size={16} aria-hidden="true" />
                ) : (
                  <Play size={16} aria-hidden="true" />
                )}
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                aria-label="Restart wardrobe action"
                disabled={busy || Boolean(appearancePreview)}
                onClick={() => {
                  motion.current = {
                    action: requestedAction,
                    elapsedMs: 0,
                    pending: null,
                  };
                  tick.current = 0;
                  setFrameIndex(0);
                  setShownAction(requestedAction);
                  setPending(null);
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
              </button>
              <label>
                Preview speed
                <select
                  aria-label="Wardrobe preview speed"
                  value={playbackRate}
                  onChange={(e) => setPlaybackRate(Number(e.target.value))}
                >
                  <option value={1}>1×</option>
                  <option value={0.5}>0.5×</option>
                  <option value={0.25}>0.25×</option>
                </select>
              </label>
              <label>
                Size
                <select
                  aria-label="Wardrobe preview size"
                  value={zoom}
                  onChange={(event) => setZoom(event.target.value)}
                >
                  <option value="fit">Fit</option>
                  <option value="1">1× native</option>
                  <option value="2">2×</option>
                </select>
              </label>
            </div>
            <div className="wardrobe-review-options">
              <label>
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />{" "}
                Compare original
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={inspect}
                  onChange={(e) => {
                    setInspect(e.target.checked);
                    if (e.target.checked) setPlaying(false);
                  }}
                />
                Inspect connections
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={anchors}
                  onChange={(event) => setAnchors(event.target.checked)}
                />{" "}
                Show anchors
              </label>
              <span>
                {pending
                  ? `${nameFor(shownAction)} → ${nameFor(pending)} at the next prepared boundary`
                  : `${nameFor(shownAction)} · ${clip?.loop ? "loop" : "one shot"} · in place`}
              </span>
            </div>
            <div
              className={`wardrobe-stage ${compare ? "wardrobe-stage--compare" : ""} ${zoom === "fit" ? "wardrobe-stage--fit" : ""}`}
            >
              {compare && (
                <figure>
                  <figcaption>Original · same frame</figcaption>
                  <canvas
                    ref={originalCanvas}
                    width={outputSheet.frameWidth}
                    height={outputSheet.frameHeight}
                    style={size}
                    role="img"
                    aria-label={`Original ${session.character}, ${shownAction}, frame ${frameId}, ${facing}`}
                    data-testid="wardrobe-original-preview"
                    data-frame-id={frameId}
                  />
                </figure>
              )}
              <figure>
                <figcaption>
                  {original
                    ? "Original outfit"
                    : (selectedPreset?.name ?? "Your combination")}
                </figcaption>
                <canvas
                  ref={canvas}
                  width={outputSheet.frameWidth}
                  height={outputSheet.frameHeight}
                  style={size}
                  role="img"
                  aria-label={`Dressed ${session.character}, ${shownAction}, frame ${frameId}, ${facing}`}
                  data-testid="wardrobe-preview"
                  data-frame-id={frameId}
                  data-facing={facing}
                  data-action={shownAction}
                />
              </figure>
            </div>
            <div className="wardrobe-timeline">
              <div className="wardrobe-frame-buttons">
                <button
                  type="button"
                  aria-label="Previous wardrobe frame"
                  disabled={
                    busy ||
                    Boolean(appearancePreview) ||
                    !clip ||
                    (!clip?.loop && frameIndex === 0)
                  }
                  onClick={() =>
                    scrub(
                      (frameIndex - 1 + clip!.frames.length) %
                        clip!.frames.length,
                    )
                  }
                >
                  <ChevronLeft size={16} />
                  Previous frame
                </button>
                <button
                  type="button"
                  aria-label="Next wardrobe frame"
                  disabled={
                    busy ||
                    Boolean(appearancePreview) ||
                    !clip ||
                    (!clip?.loop && frameIndex === clip.frames.length - 1)
                  }
                  onClick={() => scrub((frameIndex + 1) % clip!.frames.length)}
                >
                  Next frame
                  <ChevronRight size={16} />
                </button>
              </div>
              <label htmlFor="wardrobe-frame">
                Frame {frameIndex + 1} / {clip?.frames.length} · {clip?.fps} FPS{" "}
                · source {frameId}
              </label>
              <input
                id="wardrobe-frame"
                aria-label="Wardrobe frame"
                type="range"
                min={0}
                max={(clip?.frames.length ?? 1) - 1}
                step={1}
                value={frameIndex}
                disabled={busy || Boolean(appearancePreview)}
                onChange={(event) => scrub(Number(event.target.value))}
              />
              <span>
                Native {outputSheet.frameWidth} × {outputSheet.frameHeight} ·
                attachment ({outputAnchor.x}, {outputAnchor.y})
              </span>
            </div>
            {inspect && frameId !== undefined && (
              <ConnectionInspector
                project={project}
                renderer={session.renderer}
                frameId={frameId}
                facing={facing}
              />
            )}
          </section>
        </div>
      )}
      {appearancePreview && (
        <AppearanceUpdatePreview
          original={appearancePreview.original}
          candidate={appearancePreview.renderer}
          project={appearancePreview.project}
          initialAction={appearancePreview.action}
          initialPosition={appearancePreview.position}
          initialFacing={appearancePreview.facing}
          onClose={closeAppearancePreview}
          onSave={saveAppearanceCopy}
        />
      )}
      <p className="wardrobe-local-note">
        Your appearance, clothing and exports stay in this browser. Save your
        wardrobe before closing or reloading the page.
      </p>
    </div>
  );
}
