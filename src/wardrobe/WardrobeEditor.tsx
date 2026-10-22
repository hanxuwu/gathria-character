import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  Shirt,
  Upload,
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
  type WardrobeProject,
  type WardrobeSelection,
  type WardrobeSlot,
} from "./contract";
import {
  addWardrobeAppearanceBank,
  addWardrobeGarment,
  createWardrobeProject,
  exportWardrobeProject,
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
import "./wardrobe.css";
import { wardrobeAssetUrl, wardrobeCatalogUrl } from "./catalog-assets";

interface CatalogItem {
  id: string;
  name: string;
  slot: WardrobeSlot;
  url: string;
}
interface CatalogCharacter {
  key: KlingCharacterId;
  name: string;
  characterId: string;
  sourceUrl: string;
  registrationUrl: string;
  templateUrl?: string;
  appearanceBankUrl?: string;
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
      entry.items.length > 16 ||
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
        !WARDROBE_SLOTS.includes(item.slot)
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
      items,
      presets,
    };
  });
  return { version: 1, characters };
}
async function fetchBytes(
  url: string,
  maximum: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw Error(
      `Could not open ${new URL(url, window.location.href).pathname} (${response.status}).`,
    );
  if (Number(response.headers.get("content-length")) > maximum)
    throw Error("This file exceeds the supported size.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > maximum)
    throw Error("This file is empty or exceeds the supported size.");
  return bytes;
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
  const [status, setStatus] = useState("Opening the clothing library…");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [shownAction, setShownAction] = useState<PortableAnimationName>("idle");
  const [pending, setPending] = useState<PortableAnimationName | null>(null);
  const [zoom, setZoom] = useState("fit");
  const [anchors, setAnchors] = useState(false);
  const [compare, setCompare] = useState(false);
  const [retry, setRetry] = useState(0);
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
    return { token: ++request.current, controller };
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
        const delta = previous === null ? 0 : now - previous;
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
  }, [active, playing, busy, session?.renderer]);

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
  const appearanceStyles = project?.appearanceBank?.manifest.styles ?? [
    { id: "soft-crop", name: "Soft crop", slot: "hair" },
    { id: "soft-bob", name: "Soft bob", slot: "hair" },
    { id: "gentle", name: "Gentle", slot: "face" },
  ];

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
  ) {
    const open = current.current;
    if (!open || busy) return;
    const { token, controller } = beginPreparation();
    setBusy(true);
    setError("");
    setStatus("Preparing your character…");
    try {
      const next = await transform(open.project, controller.signal);
      await accept(next, open.character, true, token, controller.signal, true);
      if (token === request.current) setStatus(message);
    } catch (failure) {
      if (token === request.current)
        setError(`${failureText(failure)} Your current outfit is unchanged.`);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }
  function chooseAppearance(selection: Partial<AppearanceSelection>) {
    void changeProject(async (base, signal) => {
      let next = base;
      if (!next.appearanceBank && (selection.hairId || selection.faceId)) {
        if (!entry?.appearanceBankUrl)
          throw Error(
            "Hair and face options are not available for this character.",
          );
        next = await addWardrobeAppearanceBank(
          next,
          await fetchBytes(
            entry.appearanceBankUrl,
            APPEARANCE_MAX_BYTES,
            signal,
          ),
          { signal },
        );
      }
      return selectWardrobeAppearance(next, selection);
    }, "Appearance updated. Your clothing and original movement are preserved.");
  }
  async function ensureItem(
    base: WardrobeProject,
    id: string,
  ): Promise<WardrobeProject> {
    if (base.items.some((item) => item.manifest.id === id)) return base;
    const item = entry?.items.find((candidate) => candidate.id === id);
    if (!item)
      throw Error(
        "This clothing item is not available for the current character.",
      );
    const next = await addWardrobeGarment(
      base,
      await fetchBytes(item.url, WARDROBE_MAX_ITEM_BYTES),
    );
    const added = next.items.find((candidate) => candidate.manifest.id === id);
    if (!added || added.manifest.slot !== item.slot)
      throw Error("The clothing file does not match its library entry.");
    return next;
  }
  function chooseItem(slot: WardrobeSlot, id: string) {
    void changeProject(
      async (base) =>
        selectWardrobeGarment(
          id ? await ensureItem(base, id) : base,
          slot,
          id || null,
        ),
      "Outfit updated. Check its silhouette through each movement.",
    );
  }
  function choosePreset(selection: WardrobeSelection, name: string) {
    void changeProject(async (base) => {
      let next = base;
      for (const slot of WARDROBE_SLOTS)
        next = selectWardrobeGarment(next, slot, null);
      for (const slot of WARDROBE_SLOTS)
        if (selection[slot])
          next = selectWardrobeGarment(
            await ensureItem(next, selection[slot]!),
            slot,
            selection[slot],
          );
      return next;
    }, `${name} selected. Clothing follows the original movement frames.`);
  }
  async function chooseCharacter(character: KlingCharacterId) {
    if (busy || !catalog || character === session?.character) return;
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
    if (!file || busy) return;
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
    if (!open || busy || frameId === undefined) return;
    setBusy(true);
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

  const selected = project?.document.selection ?? EMPTY_SELECTION;
  const selectedPreset = entry?.presets.find((preset) =>
    WARDROBE_SLOTS.every((slot) => preset.selection[slot] === selected[slot]),
  );
  const original = WARDROBE_SLOTS.every((slot) => !selected[slot]);
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
            disabled={busy || !catalog}
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
          disabled={busy}
          onClick={() => projectInput.current?.click()}
        >
          <FolderOpen size={16} aria-hidden="true" /> Reopen wardrobe
        </button>
        <button
          type="button"
          disabled={busy || !session}
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
              disabled={busy}
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
      {session && project && registration && outputSheet && outputAnchor && (
        <div className="wardrobe-layout">
          <aside className="wardrobe-controls" aria-label="Clothing selection">
            <section className="wardrobe-appearance" aria-label="Hair and face">
              <div className="wardrobe-section-title">
                <h2>Hair &amp; face</h2>
              </div>
              <label className="wardrobe-slot">
                Hairstyle
                <select
                  aria-label="Hairstyle"
                  value={appearance.hairId ?? ""}
                  disabled={busy || !appearanceAvailable}
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
                  disabled={busy || !appearanceAvailable}
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
                  disabled={busy || !appearance.hairId}
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
              <button
                type="button"
                disabled={busy || (!appearance.hairId && !appearance.faceId)}
                onClick={() => chooseAppearance(DEFAULT_APPEARANCE_SELECTION)}
              >
                <RotateCcw size={14} aria-hidden="true" /> Reset appearance
              </button>
              <p className="wardrobe-hint">
                Hair and face choices stay with this character when you change
                outfits. The original face remains available.
              </p>
            </section>
            <div className="wardrobe-section-title">
              <Shirt size={18} aria-hidden="true" />
              <h2>Your outfit</h2>
            </div>
            <div
              className="wardrobe-presets"
              role="group"
              aria-label="Complete outfits"
            >
              <button
                type="button"
                aria-pressed={original}
                disabled={busy}
                onClick={() => choosePreset(EMPTY_SELECTION, "Original outfit")}
              >
                Original
              </button>
              {entry?.presets
                .filter((preset) =>
                  WARDROBE_SLOTS.some((slot) => preset.selection[slot]),
                )
                .map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selectedPreset?.id === preset.id}
                    disabled={busy}
                    onClick={() => choosePreset(preset.selection, preset.name)}
                  >
                    {preset.name}
                  </button>
                ))}
            </div>
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
                    disabled={busy}
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
            <button
              type="button"
              className="wardrobe-secondary"
              disabled={busy}
              onClick={() => garmentInput.current?.click()}
            >
              <Upload size={15} aria-hidden="true" /> Add clothing file
            </button>
            <p className="wardrobe-hint">
              New clothing must match this character’s registered poses.
              Incompatible files leave your outfit unchanged.
            </p>
            <details className="wardrobe-guides">
              <summary>Fitting guides</summary>
              <p>
                White points mark visible joints; amber points are estimated
                behind the body. The rose cross is the fixed attachment point.
              </p>
              <button
                type="button"
                disabled={busy}
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
            </details>
            <div className="wardrobe-exports">
              <h3>Take this character with you</h3>
              <button
                type="button"
                className="wardrobe-primary"
                disabled={busy}
                onClick={() => void exportFile("pack")}
              >
                <Download size={16} aria-hidden="true" /> Export CharacterPack
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void exportFile("png")}
              >
                Save current PNG
              </button>
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
                  disabled={busy}
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
                  disabled={busy}
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
                disabled={busy}
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
                disabled={busy}
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
              <label htmlFor="wardrobe-frame">
                Frame {frameIndex + 1} / {clip?.frames.length} · {clip?.fps} FPS
              </label>
              <input
                id="wardrobe-frame"
                aria-label="Wardrobe frame"
                type="range"
                min={0}
                max={(clip?.frames.length ?? 1) - 1}
                step={1}
                value={frameIndex}
                disabled={busy}
                onChange={(event) => scrub(Number(event.target.value))}
              />
              <span>
                Native {outputSheet.frameWidth} × {outputSheet.frameHeight} ·
                attachment ({outputAnchor.x}, {outputAnchor.y})
              </span>
            </div>
          </section>
        </div>
      )}
      <p className="wardrobe-local-note">
        Your appearance, clothing and exports stay in this browser. Save your
        wardrobe before closing or reloading the page.
      </p>
    </div>
  );
}
