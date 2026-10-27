import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  Undo2,
  Redo2,
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
  WARDROBE_MAX_ITEMS,
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
  validateWardrobeProject,
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
import type { PaintedGarment } from "./paint-import";
import type { MaskBuildReport } from "./mask-edit";
import type { GarmentAuthoringReport } from "./garment-authoring";
import ClothingPoseInspector from "./ClothingPoseInspector";
import { wardrobeAssetUrl, wardrobeCatalogUrl } from "./catalog-assets";
import { retainOutfitAndCustomItems } from "./library-inventory";
import ConnectionInspector from "./ConnectionInspector";
import NamedLooks from "./NamedLooks";
import LookComparison from "./LookComparison";
const ReviewWorkbench = lazy(() => import("./ReviewWorkbench"));
const GarmentCandidatePreview = lazy(() => import("./GarmentCandidatePreview"));
const MaskEditWorkbench = lazy(() => import("./MaskEditWorkbench"));
const ClothingCreationWizard = lazy(() => import("./ClothingCreationWizard"));
const CombinationReviewWorkbench = lazy(
  () => import("./CombinationReviewWorkbench"),
);
const PixelRefinement = lazy(() => import("../pixel/PixelRefinement"));
import {
  prepareGarmentCandidate,
  assertCandidateBase,
  type GarmentCandidate,
} from "./repair-candidate";
import { createLookComparison } from "./look-comparison";
import { createWardrobeDownloads } from "./download-cache";
import { checkLookSource, exactLookAsset, type NamedLook } from "./named-looks";
import { readLocalMaterial } from "./local-materials";
import { outfitMatches } from "./outfit-search";
import { outfitPreview } from "./outfit-previews";
import {
  emptyLookHistory,
  recordLookChange,
  moveLookHistory,
  type LookHistory,
} from "./look-history";

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
interface GarmentPreview extends AppearancePreview {
  painting?: PaintedGarment;
  maskCorrection?: { bytes: Uint8Array; report: MaskBuildReport };
  authoring?: { bytes: Uint8Array; report: GarmentAuthoringReport };
  proposal: GarmentCandidate;
  baseProject: WardrobeProject;
}
interface PinnedLook {
  project: WardrobeProject;
  renderer: WardrobeCompositor;
  name: string;
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [retry, setRetry] = useState(0);
  const [recipeItemId, setRecipeItemId] = useState("");
  const [showAllOutfits, setShowAllOutfits] = useState(false);
  const [outfitQuery, setOutfitQuery] = useState("");
  const [pinnedLook, setPinnedLook] = useState<PinnedLook | null>(null);
  const pinned = useRef<PinnedLook | null>(null);
  const [appearancePreview, setAppearancePreview] =
    useState<AppearancePreview | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<GarmentPreview | null>(
    null,
  );
  const candidateRenderer = useRef<WardrobeCompositor | null>(null);
  const preparingGarmentPreview = useRef(false);
  const [maskEdit, setMaskEdit] = useState<{
    project: WardrobeProject;
    itemId: string;
    action: PortableAnimationName;
    position: number;
  } | null>(null);
  const maskEditButton = useRef<HTMLButtonElement>(null);
  const resumeAfterMask = useRef(false);
  const [authoring, setAuthoring] = useState<WardrobeProject | null>(null);
  const [combination, setCombination] = useState<WardrobeProject | null>(null);
  const [pixelPreview, setPixelPreview] = useState<{
    project: WardrobeProject;
    renderer: WardrobeCompositor;
    action: PortableAnimationName;
    position: number;
    facing: Facing;
  } | null>(null);
  const authoringRef = useRef(authoring);
  const combinationRef = useRef(combination);
  authoringRef.current = authoring;
  combinationRef.current = combination;
  const authoringButton = useRef<HTMLButtonElement>(null);
  const combinationButton = useRef<HTMLButtonElement>(null);
  const pixelButton = useRef<HTMLButtonElement>(null);
  const resumeAfterLab = useRef(false);
  const candidateOrigin = useRef<"import" | "mask" | "authoring">("import");
  const modalOpen = Boolean(
    appearancePreview ||
      garmentPreview ||
      maskEdit ||
      authoring ||
      combination ||
      pixelPreview,
  );
  const previewGarmentInput = useRef<HTMLInputElement>(null);
  const paintedKitInput = useRef<HTMLInputElement>(null);
  const previewGarmentButton = useRef<HTMLButtonElement>(null);
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
  const histories = useRef(new Map<KlingCharacterId, LookHistory>());
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
  function clearPinnedLook() {
    pinned.current?.renderer.dispose();
    pinned.current = null;
    setPinnedLook(null);
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
    if (preparingAppearancePreview.current || preparingGarmentPreview.current)
      setPlaying(resumeAfterPreview.current && activeRef.current);
    preparingAppearancePreview.current = false;
    preparingGarmentPreview.current = false;
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
    history: "keep" | "edit" | "reset" | LookHistory = "keep",
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
      if (
        history === "reset" ||
        (previous && previous.character !== character)
      ) {
        clearPinnedLook();
        setOutfitQuery("");
      }
      if (history === "reset") histories.current.delete(character);
      else if (history === "edit" && previous?.character === character)
        histories.current.set(
          character,
          recordLookChange(
            histories.current.get(character) ?? emptyLookHistory(),
            previous.project,
            project,
          ),
        );
      else if (typeof history === "object")
        histories.current.set(character, history);
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
    setMaskEdit(null);
    setAuthoring(null);
    setCombination(null);
    setPixelPreview(null);
    if (candidateRenderer.current) closeGarmentPreview();
    preparingGarmentPreview.current = false;
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
      candidateRenderer.current?.dispose();
      candidateRenderer.current = null;
      current.current = null;
      rendered.current = null;
      savedSessions.current.clear();
      histories.current.clear();
      pinned.current?.renderer.dispose();
      pinned.current = null;
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
  const combinationItems = useMemo(() => {
    const choices = new Map<
      string,
      { id: string; name: string; slot: WardrobeSlot }
    >();
    for (const item of entry?.items ?? []) choices.set(item.id, item);
    for (const item of project?.items ?? [])
      choices.set(item.manifest.id, item.manifest);
    return [...choices.values()];
  }, [entry, project?.items]);
  const clip = project?.archive.manifest.animations[shownAction];
  const frameId = clip?.frames[Math.min(frameIndex, clip.frames.length - 1)];
  const facing = project?.document.preview.facing ?? "right";
  const requestedAction = project?.document.preview.action ?? "idle";
  const registration = project?.registration;
  const outputSheet = session?.renderer.manifest.spritesheet;
  const outputAnchor = session?.renderer.manifest.anchor;
  const lookComparison = useMemo(
    () =>
      pinnedLook && session
        ? createLookComparison(
            pinnedLook.renderer,
            session.renderer,
            pinnedLook.project,
            session.project,
          )
        : null,
    [pinnedLook, session?.renderer],
  );
  const reviewComparison = useMemo(
    () =>
      session
        ? (lookComparison ?? {
            manifest: session.renderer.manifest,
            renderFrame: (id: number) => session.renderer.renderFrame(id),
            renderSourceFrame: (id: number) =>
              session.renderer.renderSourceFrame(id),
          })
        : null,
    [lookComparison, session?.renderer],
  );
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
  const faceStyles = appearanceStyles.filter((style) => style.slot === "face");
  const faceIds = new Set(faceStyles.map((style) => style.id));
  const earlierFaces = faceStyles.filter(
    (style) =>
      (style.id === "gentle" && faceIds.has("gentle-v2")) ||
      (style.id === "joyful" && faceIds.has("joyful-v2")),
  );
  const currentFaces = faceStyles.filter(
    (style) => !earlierFaces.includes(style),
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
    if (!open || busy || modalOpen) return;
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
        "edit",
      );
      if (token === request.current) setStatus(message);
    } catch (failure) {
      if (token === request.current)
        setError(`${failureText(failure)} Your current outfit is unchanged.`);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  async function travelLook(direction: "undo" | "redo") {
    const open = current.current;
    if (!open || busy || modalOpen) return;
    const move = moveLookHistory(
      histories.current.get(open.character) ?? emptyLookHistory(),
      open.project,
      direction,
    );
    if (!move) return;
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Restoring this look’s exact artwork…");
    try {
      await accept(
        move.project,
        open.character,
        true,
        token,
        controller.signal,
        true,
        move.history,
      );
      if (token === request.current)
        setStatus(
          direction === "undo"
            ? "Styling change undone. Action and facing kept."
            : "Styling change redone. Action and facing kept.",
        );
    } catch (failure) {
      if (token === request.current)
        setError(
          `${failureText(failure)} Your outfit and history are unchanged.`,
        );
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
    setMaskEdit(null);
    setAuthoring(null);
    setCombination(null);
    setPixelPreview(null);
    if (authoring || combination) {
      preparation.current?.abort();
      request.current++;
      setBusy(false);
    }
    if (candidateRenderer.current) closeGarmentPreview();
    if (preparingGarmentPreview.current) {
      preparingGarmentPreview.current = false;
      preparation.current?.abort();
      request.current++;
      setBusy(false);
      setStatus("Clothing preview canceled. Your open outfit is unchanged.");
    }
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
    if (!open || busy || modalOpen || !revision || !url) return;
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
  async function loadCombinationItems(
    ids: string[],
    signal: AbortSignal,
  ): Promise<WardrobeProject> {
    const base = combination;
    if (
      !base ||
      combinationRef.current !== base ||
      current.current?.project !== base ||
      !activeRef.current
    )
      throw Error("The open outfit changed. Reopen the combination checker.");
    const requested = [...new Set(ids)];
    const allIds = new Set([
      ...base.items.map((item) => item.manifest.id),
      ...requested,
    ]);
    if (allIds.size > WARDROBE_MAX_ITEMS)
      throw Error(
        `Choose a smaller clothing pool: at most ${WARDROBE_MAX_ITEMS} loaded pieces, including the open outfit.`,
      );
    // This is an isolated pool. Never prune an artist's custom material or
    // change the accepted look just to make a batch fit the inventory limit.
    let next = base;
    for (const id of requested) {
      if (signal.aborted) throw new DOMException("Canceled", "AbortError");
      if (next.items.some((item) => item.manifest.id === id)) continue;
      const item = entry?.items.find((candidate) => candidate.id === id);
      if (!item)
        throw Error("This clothing is not in this character's library.");
      next = await addWardrobeGarment(
        next,
        await fetchBytes(
          item.url,
          WARDROBE_MAX_ITEM_BYTES,
          signal,
          item.sha256,
        ),
      );
      const loaded = next.items.find(
        (candidate) => candidate.manifest.id === id,
      );
      if (
        !loaded ||
        loaded.manifest.slot !== item.slot ||
        (item.sha256 && loaded.sha256 !== item.sha256)
      )
        throw Error("The loaded clothing does not match its catalog entry.");
    }
    const normalized = await validateWardrobeProject(next, { signal });
    if (
      signal.aborted ||
      !activeRef.current ||
      combinationRef.current !== base ||
      current.current?.project !== base
    )
      throw new DOMException("Canceled", "AbortError");
    return normalized;
  }
  async function useCombination(
    next: WardrobeProject,
    action: PortableAnimationName,
    position: number,
    direction: Facing,
    referenceProject?: WardrobeProject,
  ) {
    const open = current.current;
    if (
      !open ||
      !combination ||
      combinationRef.current !== combination ||
      open.project !== combination ||
      busy
    )
      throw Error("The open outfit changed. Reopen the combination checker.");
    if (
      !activeRef.current ||
      next.document.sourceSha256 !== open.project.document.sourceSha256 ||
      next.document.registrationSha256 !==
        open.project.document.registrationSha256
    )
      throw Error("This combination belongs to a different source character.");
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Checking the selected combination across all poses…");
    let referenceRenderer: WardrobeCompositor | null = null;
    try {
      const normalized = await validateWardrobeProject(next, {
        signal: controller.signal,
      });
      const nextClip = normalized.archive.manifest.animations[action];
      if (
        !nextClip ||
        !Number.isSafeInteger(position) ||
        position < 0 ||
        position >= nextClip.frames.length ||
        !["left", "right"].includes(direction)
      )
        throw Error("The selected inspection frame is unavailable.");
      const reference = referenceProject
        ? await validateWardrobeProject(referenceProject, {
            signal: controller.signal,
          })
        : null;
      if (reference) {
        if (
          reference.document.sourceSha256 !==
            normalized.document.sourceSha256 ||
          reference.document.registrationSha256 !==
            normalized.document.registrationSha256 ||
          JSON.stringify(reference.archive.manifest.animations) !==
            JSON.stringify(normalized.archive.manifest.animations)
        )
          throw Error(
            "The review reference does not match this source and motion.",
          );
        referenceRenderer = await createWardrobeCompositor(reference, {
          signal: controller.signal,
        });
        await validateWardrobeAppearance(referenceRenderer, {
          signal: controller.signal,
        });
      }
      await accept(
        updateWardrobePreview(normalized, { action, facing: direction }),
        open.character,
        true,
        token,
        controller.signal,
        false,
        "edit",
      );
      if (token !== request.current || controller.signal.aborted) return;
      clearPinnedLook();
      if (reference && referenceRenderer) {
        const look = {
          project: reference,
          renderer: referenceRenderer,
          name: "Combination reference · matching hair and expression",
        };
        pinned.current = look;
        setPinnedLook(look);
        referenceRenderer = null;
      }
      setCombination(null);
      seekReview(action, position, direction);
      setReviewOpen(true);
      setStatus(
        "Combination applied for review. Undo styling restores your previous look.",
      );
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(".wardrobe-review-workbench")
          ?.scrollIntoView({ block: "start" }),
      );
    } catch (failure) {
      if (token === request.current && !controller.signal.aborted)
        setError(`${failureText(failure)} Your open outfit is unchanged.`);
      throw failure;
    } finally {
      referenceRenderer?.dispose();
      if (token === request.current) {
        setBusy(false);
        setCancellable(false);
      }
    }
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
    if (busy || modalOpen || !catalog || character === session?.character)
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
  function seekReview(
    action: PortableAnimationName,
    position: number,
    direction: Facing,
  ) {
    const open = current.current;
    const actionClip = open?.project.archive.manifest.animations[action];
    if (
      !open ||
      !actionClip ||
      busy ||
      !Number.isSafeInteger(position) ||
      position < 0 ||
      position >= actionClip.frames.length
    )
      return;
    setPlaying(false);
    setPending(null);
    setShownAction(action);
    motion.current = {
      action,
      elapsedMs: (position * 1000) / actionClip.fps,
      pending: null,
    };
    tick.current = position;
    setFrameIndex(position);
    remember({
      ...open,
      project: updateWardrobePreview(open.project, {
        action,
        facing: direction,
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
    if (!file || busy || modalOpen) return;
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
      await accept(
        next,
        target.key,
        false,
        token,
        controller.signal,
        false,
        "reset",
      );
      if (token === request.current)
        setStatus("Saved outfit and action settings restored.");
    } catch (failure) {
      if (token === request.current)
        setError(`${failureText(failure)} The open outfit has been kept.`);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  function closeGarmentPreview(applied = false) {
    setGarmentPreview(null);
    candidateRenderer.current?.dispose();
    candidateRenderer.current = null;
    setPlaying(resumeAfterPreview.current && activeRef.current);
    if (!applied)
      setStatus("Clothing candidate discarded. Your open outfit is unchanged.");
    requestAnimationFrame(() => {
      const button =
        candidateOrigin.current === "authoring"
          ? authoringButton
          : candidateOrigin.current === "mask"
            ? maskEditButton
            : previewGarmentButton;
      button.current?.focus();
    });
  }
  async function previewImportedGarment(
    file?: File,
    painted = false,
    handoff?:
      | { kind: "mask"; project: WardrobeProject; report: MaskBuildReport }
      | {
          kind: "authoring";
          project: WardrobeProject;
          report: GarmentAuthoringReport;
        },
  ) {
    const open = current.current;
    if (!file || !open || busy || (modalOpen && !handoff)) return;
    // Only this mounted editor may hand off its exact, still-open base. A late
    // async completion after navigation cannot replace a different outfit.
    if (
      handoff &&
      (!activeRef.current ||
        open.project !== handoff.project ||
        (handoff.kind === "mask"
          ? maskEdit?.project !== handoff.project
          : authoringRef.current !== handoff.project))
    )
      return;
    if (handoff?.kind === "mask") setMaskEdit(null);
    if (handoff?.kind === "authoring") setAuthoring(null);
    candidateOrigin.current = handoff?.kind ?? "import";
    const { token, controller } = beginPreparation();
    preparingGarmentPreview.current = true;
    resumeAfterPreview.current =
      handoff?.kind === "mask"
        ? resumeAfterMask.current
        : handoff?.kind === "authoring"
          ? resumeAfterLab.current
          : playing;
    setPlaying(false);
    setBusy(true);
    setError("");
    setStatus("Checking imported clothing without changing your outfit…");
    let renderer: WardrobeCompositor | null = null;
    try {
      if (file.size > WARDROBE_MAX_ITEM_BYTES)
        throw Error("Clothing files must be at most 64 MiB.");
      let bytes = new Uint8Array(await file.arrayBuffer());
      let painting: PaintedGarment | undefined;
      if (painted) {
        setStatus("Checking painted poses against their original clothing…");
        const { importPaintedPoses } = await import("./paint-import");
        painting = await importPaintedPoses(open.project, bytes, {
          signal: controller.signal,
          onProgress: (n, t) => {
            if (token === request.current && !controller.signal.aborted)
              setStatus(`Checking painted poses: ${n} / ${t}…`);
          },
        });
        bytes = new Uint8Array(painting.bytes);
      }
      const proposal = await prepareGarmentCandidate(open.project, bytes, {
        signal: controller.signal,
      });
      if (handoff && handoff.report.output.sha256 !== proposal.item.sha256)
        throw Error(
          "The creation report does not match the clothing candidate.",
        );
      renderer = await createWardrobeCompositor(proposal.project, {
        signal: controller.signal,
      });
      await validateWardrobeAppearance(renderer, {
        signal: controller.signal,
        onProgress: (n, t) => {
          if (token === request.current && !controller.signal.aborted)
            setStatus(`Checking clothing candidate: ${n} / ${t} poses…`);
        },
      });
      if (
        token !== request.current ||
        controller.signal.aborted ||
        !activeRef.current
      ) {
        renderer.dispose();
        return;
      }
      candidateRenderer.current = renderer;
      setGarmentPreview({
        project: proposal.project,
        proposal,
        painting,
        ...(handoff?.kind === "mask"
          ? { maskCorrection: { bytes, report: handoff.report } }
          : {}),
        ...(handoff?.kind === "authoring"
          ? { authoring: { bytes, report: handoff.report } }
          : {}),
        baseProject: open.project,
        renderer,
        original: open.renderer,
        action: motion.current.action,
        position: tick.current,
        facing: open.project.document.preview.facing,
      });
      renderer = null;
      setStatus(
        "Clothing candidate ready. Compare it, then explicitly apply or discard.",
      );
    } catch (failure) {
      renderer?.dispose();
      if (token === request.current && !controller.signal.aborted) {
        setError(
          `${failureText(failure)} Your outfit and history are unchanged.`,
        );
        setPlaying(resumeAfterPreview.current && activeRef.current);
      }
    } finally {
      if (token === request.current) {
        preparingGarmentPreview.current = false;
        setBusy(false);
      }
    }
  }
  async function applyGarmentCandidate() {
    const preview = garmentPreview,
      open = current.current;
    if (!preview || !open || busy) return;
    const { token, controller } = beginPreparation();
    preparingGarmentPreview.current = true;
    setBusy(true);
    setCancellable(false);
    setError("");
    try {
      await assertCandidateBase(preview.proposal, open.project, {
        signal: controller.signal,
      });
      await accept(
        preview.proposal.project,
        open.character,
        true,
        token,
        controller.signal,
        true,
        "edit",
      );
      if (token === request.current && !controller.signal.aborted) {
        closeGarmentPreview(true);
        setStatus(
          "Clothing candidate applied. Undo styling restores the previous look.",
        );
      }
    } catch (failure) {
      if (token === request.current) throw failure;
    } finally {
      if (token === request.current) {
        preparingGarmentPreview.current = false;
        setBusy(false);
      }
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
    if (!open || busy || modalOpen || frameId === undefined) return;
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

  async function exportGif(comparison = false) {
    const open = current.current;
    if (!open || busy || modalOpen) return;
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
          comparison,
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
        `${safeFilename(`kling-${open.character}-wardrobe`)}-${shownAction}-${facing}${comparison ? "-comparison" : ""}-half.gif`,
        "image/gif",
      );
      setStatus(
        comparison
          ? "Comparison GIF saved: original on the left, current look on the right. Matching frames, anchors and original timing."
          : "Action GIF saved at half native size, original timing and the selected direction, on a cream background.",
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

  async function pinLook() {
    const open = current.current;
    if (!open || busy || modalOpen) return;
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Preparing this look for comparison…");
    let renderer: WardrobeCompositor | null = null;
    try {
      renderer = await createWardrobeCompositor(open.project, {
        signal: controller.signal,
      });
      await validateWardrobeAppearance(renderer, { signal: controller.signal });
      if (token !== request.current || controller.signal.aborted) return;
      clearPinnedLook();
      const next = {
        project: open.project,
        renderer,
        name: selectedPreset?.name ?? "Your combination",
      };
      pinned.current = next;
      setPinnedLook(next);
      renderer = null; // ownership moves to the one retained reference
      setStatus(
        "Look pinned. Try another outfit or hairstyle to compare the same poses.",
      );
    } catch (failure) {
      if (token === request.current && !controller.signal.aborted)
        setError(failureText(failure));
    } finally {
      renderer?.dispose();
      if (token === request.current) {
        setBusy(false);
        setCancellable(false);
      }
    }
  }

  async function exportLookGif() {
    const open = current.current;
    if (!open || !lookComparison || busy || modalOpen) return;
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Preparing look comparison GIF…");
    try {
      const { exportWardrobeActionGif } = await import("./action-gif");
      const bytes = await exportWardrobeActionGif(
        lookComparison,
        shownAction,
        facing,
        {
          comparison: true,
          referenceLabel: "PINNED",
          signal: controller.signal,
          onProgress: (done, total) => {
            if (token === request.current)
              setStatus(`Preparing look comparison GIF: ${done} / ${total}…`);
          },
        },
      );
      if (token !== request.current || controller.signal.aborted) return;
      saveBytes(
        bytes,
        `kling-${open.character}-${shownAction}-${facing}-pinned-current-half.gif`,
        "image/gif",
      );
      setStatus(
        "Look comparison GIF saved. Pinned on the left, current on the right, at matching anchors and original timing.",
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
          entry?.presets.some((p) => p.id === "day-smooth-waist")
            ? "day-smooth-waist"
            : entry?.presets.some((p) => p.id === "day-native-folds")
              ? "day-native-folds"
              : "day-soft-waist",
          entry?.presets.some((p) => p.id === "wedding-smooth-waist")
            ? "wedding-smooth-waist"
            : entry?.presets.some((p) => p.id === "wedding-native-folds")
              ? "wedding-native-folds"
              : "wedding-soft-waist",
          "sage-pinafore",
          "ivory-refined",
          "butter-bookshop",
          "apricot-garden",
          "teal-evening",
          "city-ink",
          "campus-periwinkle",
          "retro-cherry",
        ]
      : [
          entry?.presets.some((p) => p.id === "day-soft-cuff")
            ? "day-soft-cuff"
            : "day-refined",
          entry?.presets.some((p) => p.id === "wedding-curved-cuff")
            ? "wedding-curved-cuff"
            : entry?.presets.some((p) => p.id === "wedding-reviewed-sleeve")
              ? "wedding-reviewed-sleeve"
              : entry?.presets.some((p) => p.id === "wedding-soft-cuff")
                ? "wedding-soft-cuff"
                : "wedding-refined",
          "oat-weekend",
          "forest-weekend",
          "cocoa-bookshop",
          "rose-weekend",
          "ink-cafe",
          "city-ivory",
          "campus-sky",
          "retro-burgundy",
        ];
  const hasRecommended = outfitPresets.some((p) =>
    recommendedIds.includes(p.id),
  );
  const recommended = (id: string) =>
    !hasRecommended || recommendedIds.includes(id);
  const moreOutfits = outfitPresets.some((p) => !recommended(p.id));
  const visibleOutfits = outfitPresets.filter((preset) =>
    outfitQuery.trim()
      ? outfitMatches(preset.name, outfitQuery)
      : showAllOutfits ||
        recommended(preset.id) ||
        selectedPreset?.id === preset.id,
  );
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
            disabled={busy || modalOpen || !catalog}
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
          disabled={
            busy ||
            modalOpen ||
            !session ||
            !histories.current.get(session.character)?.past.length
          }
          onClick={() => void travelLook("undo")}
        >
          <Undo2 size={16} aria-hidden="true" /> Undo styling
        </button>
        <button
          type="button"
          disabled={
            busy ||
            modalOpen ||
            !session ||
            !histories.current.get(session.character)?.future.length
          }
          onClick={() => void travelLook("redo")}
        >
          <Redo2 size={16} aria-hidden="true" /> Redo styling
        </button>
        <button
          type="button"
          disabled={busy || modalOpen}
          onClick={() => projectInput.current?.click()}
        >
          <FolderOpen size={16} aria-hidden="true" /> Reopen wardrobe
        </button>
        <button
          type="button"
          disabled={busy || modalOpen || !session}
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
      {project && (
        <section
          className="wardrobe-authoring-entry"
          aria-label="Make and review clothing"
        >
          <div>
            <strong>Make and review</strong>
            <p>
              Create a clothing variant, then inspect it with different outfits,
              hair and expressions.
            </p>
          </div>
          <button
            type="button"
            ref={authoringButton}
            disabled={busy || modalOpen}
            onClick={() => {
              resumeAfterLab.current = playing;
              setPlaying(false);
              setAuthoring(project);
            }}
          >
            Create clothing
          </button>
          <button
            type="button"
            ref={combinationButton}
            disabled={busy || modalOpen}
            onClick={() => {
              resumeAfterLab.current = playing;
              setPlaying(false);
              setCombination(project);
            }}
          >
            Check combinations
          </button>
          <button
            type="button"
            ref={pixelButton}
            disabled={busy || modalOpen || !session}
            onClick={() => {
              if (!session) return;
              resumeAfterLab.current = playing;
              setPlaying(false);
              setPixelPreview({
                project,
                renderer: session.renderer,
                action: shownAction,
                position: frameIndex,
                facing,
              });
            }}
          >
            Try pixel finish
          </button>
        </section>
      )}
      <input
        ref={previewGarmentInput}
        type="file"
        accept=".zip"
        aria-label="Preview registered clothing file"
        hidden
        onChange={(event) => {
          void previewImportedGarment(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {error && (
        <div className="wardrobe-error" role="alert">
          <strong>Couldn’t complete this change</strong>
          <p>{error}</p>
          {!session && (
            <button
              type="button"
              disabled={busy || modalOpen}
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
                      disabled={busy || modalOpen || !appearanceAvailable}
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
                  disabled={busy || modalOpen || !appearanceAvailable}
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
                Face expression
                <select
                  aria-label="Face"
                  value={appearance.faceId ?? ""}
                  disabled={busy || modalOpen || !appearanceAvailable}
                  onChange={(event) =>
                    chooseAppearance({ faceId: event.target.value || null })
                  }
                >
                  <option value="">Natural (original)</option>
                  {earlierFaces.length ? (
                    <>
                      <optgroup label="Current expressions">
                        {currentFaces.map((style) => (
                          <option key={style.id} value={style.id}>
                            {style.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Earlier expressions">
                        {earlierFaces.map((style) => (
                          <option key={style.id} value={style.id}>
                            {style.id === "gentle"
                              ? "Gentle smile"
                              : style.name}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : (
                    faceStyles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.id === "gentle" ? "Gentle smile" : style.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="wardrobe-slot">
                Hair color
                <select
                  aria-label="Hair color"
                  value={appearance.hairColor}
                  disabled={busy || modalOpen || !appearance.hairId}
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
                    disabled={busy || modalOpen || !appearance.hairId}
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
                  modalOpen ||
                  (!appearance.hairId && !appearance.faceId)
                }
                onClick={() => chooseAppearance(DEFAULT_APPEARANCE_SELECTION)}
              >
                <RotateCcw size={14} aria-hidden="true" /> Reset appearance
              </button>
              <p className="wardrobe-hint">
                Hair and face choices stay with this character when you change
                outfits. Natural keeps the original face. Gentle smile and
                Joyful retain the original action blinks and laughter.
                {earlierFaces.length > 0 &&
                  " The refined smile is fuller; soft-motion Joyful follows the blur of fast movement. Earlier expressions remain available."}
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
                      disabled={busy || modalOpen}
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
            <div className="wardrobe-outfit-search">
              <label>
                Find an outfit
                <input
                  type="search"
                  aria-label="Find an outfit"
                  value={outfitQuery}
                  maxLength={80}
                  onChange={(event) => setOutfitQuery(event.target.value)}
                  placeholder="Try wedding, linen or sage"
                />
              </label>
              {outfitQuery && (
                <button type="button" onClick={() => setOutfitQuery("")}>
                  Clear outfit search
                </button>
              )}
              <p className="wardrobe-hint">
                Search includes earlier versions. Preview pictures use the
                original head; choosing clothes keeps your hair and expression.
              </p>
              {outfitQuery.trim() && (
                <p aria-live="polite">
                  {visibleOutfits.length} matching{" "}
                  {visibleOutfits.length === 1 ? "outfit" : "outfits"}
                </p>
              )}
            </div>
            <div
              className="wardrobe-presets wardrobe-outfit-gallery"
              role="group"
              aria-label="Complete outfits"
            >
              <button
                type="button"
                aria-pressed={original}
                disabled={busy || modalOpen}
                onClick={() => choosePreset(EMPTY_SELECTION, "Original outfit")}
              >
                Original
              </button>
              {visibleOutfits.map((preset) => {
                const picture = outfitPreview(
                  session.character,
                  preset.id,
                  preset.selection,
                  project.document.sourceSha256,
                  project.document.registrationSha256,
                  [
                    ...(entry?.items ?? []),
                    ...project.items.map((item) => ({
                      id: item.manifest.id,
                      sha256: item.sha256,
                    })),
                  ],
                );
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selectedPreset?.id === preset.id}
                    disabled={busy || modalOpen}
                    onClick={() => choosePreset(preset.selection, preset.name)}
                  >
                    {picture && (
                      <img
                        src={picture}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        width={176}
                        height={264}
                      />
                    )}
                    <span>{preset.name}</span>
                  </button>
                );
              })}
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
                    disabled={busy || modalOpen}
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
              disabled={busy || modalOpen}
              onApply={applyLook}
            />
            <button
              type="button"
              className="wardrobe-secondary"
              disabled={busy || modalOpen}
              onClick={() => garmentInput.current?.click()}
            >
              <Upload size={15} aria-hidden="true" /> Add clothing file
            </button>
            <button
              type="button"
              ref={previewGarmentButton}
              className="wardrobe-secondary"
              disabled={busy || modalOpen}
              onClick={() => previewGarmentInput.current?.click()}
            >
              Preview imported clothing
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
                disabled={busy || modalOpen}
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
                        disabled={busy || modalOpen}
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
                      disabled={busy || modalOpen}
                      onClick={() => void exportRecipe(chosen.manifest.id)}
                    >
                      Download clothing recipe
                    </button>
                    <p>
                      A copy of this clothing with fitting guides for new colors
                      or local pose corrections. Your current outfit stays
                      intact.
                    </p>
                    <button
                      type="button"
                      disabled={busy || modalOpen}
                      onClick={() => paintedKitInput.current?.click()}
                    >
                      Preview painted poses
                    </button>
                    <input
                      ref={paintedKitInput}
                      type="file"
                      accept=".zip"
                      hidden
                      aria-label="Painted pose kit file"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void previewImportedGarment(file, true);
                      }}
                    />
                    <p className="wardrobe-hint">
                      Reimport a pose painting kit after editing its PNGs and
                      giving the recipe a new ID/name. Keep masks, alpha and
                      native size unchanged. Up to 8 poses; preview first, then
                      apply. No script is needed for local RGB corrections.
                    </p>
                    <button
                      type="button"
                      ref={maskEditButton}
                      disabled={busy || modalOpen || frameId === undefined}
                      onClick={() => {
                        resumeAfterMask.current = playing;
                        setPlaying(false);
                        setMaskEdit({
                          project,
                          itemId: chosen.manifest.id,
                          action: shownAction,
                          position: Math.min(
                            frameIndex,
                            clip!.frames.length - 1,
                          ),
                        });
                      }}
                    >
                      Edit clothing mask
                    </button>
                    <p className="wardrobe-hint">
                      Correct which pixels belong to this clothing, preview
                      nearby poses, and accept each correction before making a
                      new clothing version.
                    </p>
                    {frameId !== undefined && (
                      <ClothingPoseInspector
                        item={chosen}
                        onInspect={() => setPlaying(false)}
                        frameId={frameId}
                        clip={clip!}
                        position={frameIndex}
                        onExportNeighbors={() =>
                          void exportRecipe(chosen.manifest.id, frameId, true)
                        }
                        disabled={busy || modalOpen}
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
                disabled={busy || modalOpen}
                onClick={() => void exportFile("pack")}
              >
                <Download size={16} aria-hidden="true" /> Export CharacterPack
              </button>
              <button
                type="button"
                disabled={busy || modalOpen}
                onClick={() => void exportFile("png")}
              >
                Save current PNG
              </button>
              <button
                type="button"
                disabled={busy || modalOpen}
                onClick={() => void exportGif()}
              >
                Download action GIF
              </button>
              <button
                type="button"
                disabled={busy || modalOpen}
                onClick={() => void exportGif(true)}
              >
                Download comparison GIF
              </button>
              <p className="wardrobe-hint">
                GIF: current action and direction, half native size, cream
                background, original speed. One-shot actions play once.
                Comparison keeps the original on the left and the current look
                on the right.
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
                  disabled={busy || modalOpen}
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
                  disabled={busy || modalOpen}
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
                disabled={busy || modalOpen}
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
                disabled={busy || modalOpen}
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
              <button
                type="button"
                disabled={busy || modalOpen}
                onClick={() => void pinLook()}
              >
                {pinnedLook ? "Replace pinned look" : "Pin current look"}
              </button>
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
                    modalOpen ||
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
                    modalOpen ||
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
                disabled={busy || modalOpen}
                onChange={(event) => scrub(Number(event.target.value))}
              />
              <span>
                Native {outputSheet.frameWidth} × {outputSheet.frameHeight} ·
                attachment ({outputAnchor.x}, {outputAnchor.y})
              </span>
            </div>
            <button
              type="button"
              aria-expanded={reviewOpen}
              disabled={busy || modalOpen}
              onClick={() => {
                setReviewOpen(!reviewOpen);
                setPlaying(false);
              }}
            >
              {reviewOpen ? "Close look review" : "Open look review"}
            </button>
            {reviewOpen && reviewComparison && frameId !== undefined && (
              <Suspense
                fallback={<p aria-live="polite">Opening look review…</p>}
              >
                <ReviewWorkbench
                  project={project}
                  renderer={session.renderer}
                  comparison={reviewComparison}
                  referenceProject={pinnedLook?.project}
                  frameId={frameId}
                  action={shownAction}
                  facing={facing}
                  disabled={busy || modalOpen}
                  onSeek={seekReview}
                />
              </Suspense>
            )}
            {inspect && frameId !== undefined && (
              <ConnectionInspector
                project={project}
                renderer={session.renderer}
                frameId={frameId}
                facing={facing}
              />
            )}
            {lookComparison && pinnedLook && frameId !== undefined && (
              <LookComparison
                comparison={lookComparison}
                frameId={frameId}
                facing={facing}
                name={pinnedLook.name}
                disabled={busy || modalOpen}
                onExportGif={() => void exportLookGif()}
                onClear={clearPinnedLook}
              />
            )}
          </section>
        </div>
      )}
      {maskEdit && active && (
        <Suspense
          fallback={<p aria-live="polite">Opening clothing mask editor…</p>}
        >
          <MaskEditWorkbench
            project={maskEdit.project}
            itemId={maskEdit.itemId}
            action={maskEdit.action}
            position={maskEdit.position}
            onClose={() => {
              setMaskEdit(null);
              setPlaying(resumeAfterMask.current && activeRef.current);
              setStatus(
                "Mask draft closed. Your accepted outfit is unchanged.",
              );
              requestAnimationFrame(() => maskEditButton.current?.focus());
            }}
            onPreview={(bytes, report) =>
              previewImportedGarment(
                new File(
                  [new Uint8Array(bytes)],
                  "mask-candidate.garment.zip",
                  { type: "application/zip" },
                ),
                false,
                { kind: "mask", project: maskEdit.project, report },
              )
            }
          />
        </Suspense>
      )}
      {authoring && active && (
        <Suspense
          fallback={<p aria-live="polite">Opening clothing creation…</p>}
        >
          <ClothingCreationWizard
            project={authoring}
            onClose={() => {
              authoringRef.current = null;
              setAuthoring(null);
              setPlaying(resumeAfterLab.current && activeRef.current);
              setStatus(
                "Clothing creation closed. Your accepted outfit is unchanged.",
              );
              requestAnimationFrame(() => authoringButton.current?.focus());
            }}
            onPreview={(bytes, report) =>
              previewImportedGarment(
                new File(
                  [new Uint8Array(bytes)],
                  "created-clothing.garment.zip",
                  { type: "application/zip" },
                ),
                false,
                { kind: "authoring", project: authoring, report },
              )
            }
          />
        </Suspense>
      )}
      {combination && active && (
        <Suspense
          fallback={<p aria-live="polite">Opening combination checks…</p>}
        >
          <CombinationReviewWorkbench
            project={combination}
            availableItems={combinationItems}
            onLoadItems={loadCombinationItems}
            onClose={() => {
              combinationRef.current = null;
              setCombination(null);
              preparation.current?.abort();
              request.current++;
              setBusy(false);
              setCancellable(false);
              setPlaying(resumeAfterLab.current && activeRef.current);
              setStatus(
                "Combination checks closed. Your accepted outfit is unchanged.",
              );
              requestAnimationFrame(() => combinationButton.current?.focus());
            }}
            onUseLook={useCombination}
          />
        </Suspense>
      )}
      {pixelPreview && active && (
        <Suspense fallback={<p aria-live="polite">Opening pixel finish…</p>}>
          <PixelRefinement
            project={pixelPreview.project}
            renderer={pixelPreview.renderer}
            initialAction={pixelPreview.action}
            initialPosition={pixelPreview.position}
            initialFacing={pixelPreview.facing}
            onClose={() => {
              setPixelPreview(null);
              setPlaying(resumeAfterLab.current && activeRef.current);
              setStatus(
                "Pixel preview closed. Your accepted outfit is unchanged.",
              );
              requestAnimationFrame(() => pixelButton.current?.focus());
            }}
          />
        </Suspense>
      )}
      {garmentPreview && (
        <Suspense
          fallback={<p aria-live="polite">Opening clothing preview…</p>}
        >
          <GarmentCandidatePreview
            original={garmentPreview.original}
            candidate={garmentPreview.renderer}
            baseProject={garmentPreview.baseProject}
            project={garmentPreview.project}
            painting={garmentPreview.painting}
            maskCorrection={garmentPreview.maskCorrection}
            authoring={garmentPreview.authoring}
            initialAction={garmentPreview.action}
            initialPosition={garmentPreview.position}
            initialFacing={garmentPreview.facing}
            onClose={() => closeGarmentPreview()}
            onApply={applyGarmentCandidate}
          />
        </Suspense>
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
        wardrobe before closing or reloading the page. Styling history keeps up
        to 12 recent changes per character in this session; large artwork may
        shorten it. Opening a saved project starts a new history.
      </p>
    </div>
  );
}
