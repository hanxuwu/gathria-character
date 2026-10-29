import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  Save,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { encodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import type { Facing } from "../core/types";
import {
  APPEARANCE_HAIR_COLORS,
  type AppearanceSelection,
} from "../appearance/contract";
import {
  WARDROBE_ANCHORS,
  WARDROBE_MAX_PROJECT_BYTES,
  type WardrobeProject,
  type WardrobeSelection,
  type WardrobeSlot,
} from "../wardrobe/contract";
import {
  createWardrobeCompositor,
  exportWardrobeCharacterPack,
  validateWardrobeAppearance,
  type WardrobeCompositor,
} from "../wardrobe/compositor";
import {
  exportWardrobeProject,
  getWardrobeAppearanceSelection,
  importWardrobeProject,
  selectWardrobeAppearance,
  selectWardrobeGarment,
  updateWardrobePreview,
} from "../wardrobe/project";
import {
  SIDE_CHARACTERS,
  loadSideProject,
  sideIdentityOf,
  sideLookSelection,
  sideProjectCollection,
  type SideCharacterId,
  type SideCollection,
} from "./catalog";
import {
  advanceSideMotion,
  createSideMotionState,
  requestSideAction,
  sideActionEnded,
  sideFrameId,
  sideMotionFeedback,
  type SideAction,
  type SideMotionState,
  type SideStageMode,
} from "./motion";
import { sideKeyboardIntent } from "./input";
import SideReviewPanel from "./SideReviewPanel";
import { type ReviewNote, type ReviewRate } from "./review";
import "./side-view.css";

const FittingWorkbench = lazy(() => import("./fitting-workbench"));

const WIDTH = 1200;
const HEIGHT = 820;
const GROUND = 710;
const ACTIONS: SideAction[] = ["idle", "walk", "run", "jump"];
const ACTION_LABELS: Record<SideAction, string> = {
  idle: "待机",
  walk: "行走",
  run: "跑步",
  jump: "连续跳跃（原片两次）",
};
const ORIGINAL: WardrobeSelection = {
  top: null,
  bottom: null,
  shoes: null,
  fullBody: null,
};
const PREFS_KEY = "gathria-side-stage-v1";
type Preferences = {
  mode: SideStageMode;
  walkSpeed: number;
  runSpeed: number;
  ground: boolean;
  anchors: boolean;
  comparison: boolean;
};
const DEFAULT_PREFS: Preferences = {
  mode: "in-place",
  walkSpeed: 530,
  runSpeed: 700,
  ground: true,
  anchors: false,
  comparison: false,
};
type Session = {
  character: SideCharacterId;
  project: WardrobeProject;
  renderer: WardrobeCompositor;
  currentFrames: Map<number, HTMLCanvasElement>;
  sourceFrames: Map<number, HTMLCanvasElement>;
};
type Readout = {
  action: SideAction;
  frame: number;
  index: number;
  count: number;
  fps: number;
  facing: Facing;
  paused: boolean;
  pending: SideAction | null;
  ended: boolean;
  transitionMs: number | null;
};
const INITIAL_READOUT: Readout = {
  action: "idle",
  frame: 0,
  index: 0,
  count: 0,
  fps: 24,
  facing: "right",
  paused: false,
  pending: null,
  ended: false,
  transitionMs: null,
};

function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (!value || typeof value !== "object") return DEFAULT_PREFS;
    return {
      mode: value.mode === "travel" ? "travel" : "in-place",
      walkSpeed: Number.isFinite(value.walkSpeed)
        ? Math.max(0, Math.min(1000, value.walkSpeed))
        : DEFAULT_PREFS.walkSpeed,
      runSpeed: Number.isFinite(value.runSpeed)
        ? Math.max(0, Math.min(1400, value.runSpeed))
        : DEFAULT_PREFS.runSpeed,
      ground: typeof value.ground === "boolean" ? value.ground : true,
      anchors: value.anchors === true,
      comparison: value.comparison === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function release(session: Session | null) {
  if (!session) return;
  session.renderer.dispose();
  for (const cache of [session.currentFrames, session.sourceFrames]) {
    for (const canvas of cache.values()) {
      canvas.width = 0;
      canvas.height = 0;
    }
    cache.clear();
  }
}

function cachedFrame(session: Session, frame: number, source: boolean) {
  const cache = source ? session.sourceFrames : session.currentFrames;
  const cached = cache.get(frame);
  if (cached) {
    cache.delete(frame);
    cache.set(frame, cached);
    return cached;
  }
  const rgba = source
    ? session.renderer.renderSourceFrame(frame)
    : session.renderer.renderFrame(frame);
  const canvas = document.createElement("canvas");
  canvas.width = rgba.width;
  canvas.height = rgba.height;
  const context = canvas.getContext("2d");
  if (!context) throw Error("当前浏览器无法创建画布。");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(rgba.pixels), rgba.width, rgba.height),
    0,
    0,
  );
  cache.set(frame, canvas);
  // One complete locomotion cycle stays warm. A one-shot jump is retained in
  // the current-look cache; comparison frames have a smaller independent cap.
  while (cache.size > (source ? 24 : 64)) {
    const oldest = cache.keys().next().value!;
    const discarded = cache.get(oldest)!;
    discarded.width = 0;
    discarded.height = 0;
    cache.delete(oldest);
  }
  return canvas;
}

function download(bytes: Uint8Array, name: string, type = "application/zip") {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mirrored(image: RgbaPng): RgbaPng {
  const pixels = new Uint8Array(image.pixels.length);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      pixels.set(
        image.pixels.subarray(offset, offset + 4),
        (y * image.width + image.width - 1 - x) * 4,
      );
    }
  return { ...image, pixels };
}

function isEditing(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      "input, textarea, select, button, a, [contenteditable=true]",
    )
  );
}

export default function SideViewPlayground({
  initialCharacter = "male",
  initialCollection = "material",
  active = true,
}: {
  initialCharacter?: SideCharacterId;
  initialCollection?: SideCollection;
  active?: boolean;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [readout, setReadout] = useState(INITIAL_READOUT);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("正在准备角色…");
  const [error, setError] = useState("");
  const [catalogLoadFailed, setCatalogLoadFailed] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [fittingOpen, setFittingOpen] = useState(false);
  const fittingRef = useRef(false);
  const [reviewRate, setReviewRate] = useState<ReviewRate>(1);
  const reviewRef = useRef({ open: false, rate: 1 as ReviewRate });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const travelReadoutRef = useRef<HTMLOutputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const motionRef = useRef<SideMotionState>(createSideMotionState());
  const preferencesRef = useRef(preferences);
  const activeRef = useRef(active);
  const busyRef = useRef(true);
  const visibleRef = useRef(!document.hidden);
  const preparationRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const dirtyRef = useRef(true);
  const mountedRef = useRef(true);
  const keysRef = useRef(new Set<string>());
  const loadTargetRef = useRef({
    character: initialCharacter,
    collection: initialCollection,
  });
  const pendingFacingRef = useRef<Facing | null>(null);
  const keyboardJumpRef = useRef(false);
  const keyboardResumeRef = useRef<SideAction | null>(null);
  preferencesRef.current = preferences;
  activeRef.current = active;
  reviewRef.current = { open: reviewOpen, rate: reviewRate };
  fittingRef.current = fittingOpen;

  function markBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
    lastTimeRef.current = null;
  }
  function beginPreparation() {
    preparationRef.current?.abort();
    const controller = new AbortController();
    preparationRef.current = controller;
    const token = ++requestRef.current;
    markBusy(true);
    setError("");
    setCatalogLoadFailed(false);
    return { controller, token };
  }
  function live(token: number, controller: AbortController) {
    return (
      mountedRef.current &&
      token === requestRef.current &&
      !controller.signal.aborted
    );
  }

  async function prepare(
    candidate: WardrobeProject,
    controller: AbortController,
    token: number,
    resetMotion: boolean,
  ) {
    const character = sideIdentityOf(candidate);
    let renderer: WardrobeCompositor | null = null;
    try {
      renderer = await createWardrobeCompositor(candidate, {
        signal: controller.signal,
      });
      await validateWardrobeAppearance(renderer, {
        signal: controller.signal,
        onProgress: (done, total) => {
          if (live(token, controller))
            setStatus(`正在准备服装与动作 · ${done} / ${total}`);
        },
      });
      if (!live(token, controller)) {
        renderer.dispose();
        return;
      }
      const next: Session = {
        character,
        project: candidate,
        renderer,
        currentFrames: new Map(),
        sourceFrames: new Map(),
      };
      const previous = sessionRef.current;
      sessionRef.current = next;
      if (resetMotion) {
        const saved = candidate.document.preview;
        const action = ACTIONS.includes(saved.action as SideAction)
          ? (saved.action as SideAction)
          : "idle";
        motionRef.current = {
          ...createSideMotionState(),
          action,
          facing: saved.facing,
          paused: reviewRef.current.open,
        };
        keysRef.current.clear();
        pendingFacingRef.current = null;
        keyboardJumpRef.current = false;
        keyboardResumeRef.current = null;
      }
      setSession(next);
      release(previous);
      dirtyRef.current = true;
      setStatus(
        resetMotion
          ? "角色已就绪。点击舞台，使用方向键开始。"
          : "当前搭配已应用，可在全部动作中预览。",
      );
    } catch (failure) {
      renderer?.dispose();
      throw failure;
    }
  }

  async function openCharacter(
    character: SideCharacterId,
    collection: SideCollection = sessionRef.current
      ? sideProjectCollection(sessionRef.current.project)
      : initialCollection,
  ) {
    loadTargetRef.current = { character, collection };
    const { controller, token } = beginPreparation();
    setStatus("正在载入侧视角色…");
    try {
      let candidate = await loadSideProject(
        character,
        controller.signal,
        collection,
      );
      if (collection === "tailored") {
        const look = sideLookSelection(character, collection);
        for (const slot of ["top", "bottom", "shoes"] as const)
          if (look[slot])
            candidate = selectWardrobeGarment(candidate, slot, look[slot]);
      }
      await prepare(candidate, controller, token, true);
    } catch (failure) {
      if (live(token, controller)) {
        setCatalogLoadFailed(true);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    } finally {
      if (live(token, controller)) markBusy(false);
    }
  }

  async function changeSelection(selection: WardrobeSelection) {
    const open = sessionRef.current;
    if (!open || busyRef.current) return;
    const { controller, token } = beginPreparation();
    try {
      let candidate = open.project;
      for (const slot of [
        "fullBody",
        "top",
        "bottom",
        "shoes",
      ] as WardrobeSlot[])
        candidate = selectWardrobeGarment(candidate, slot, null);
      for (const slot of [
        "top",
        "bottom",
        "shoes",
        "fullBody",
      ] as WardrobeSlot[])
        if (selection[slot])
          candidate = selectWardrobeGarment(candidate, slot, selection[slot]);
      await prepare(candidate, controller, token, false);
    } catch (failure) {
      if (live(token, controller))
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (live(token, controller)) markBusy(false);
    }
  }

  async function changeAppearance(selection: Partial<AppearanceSelection>) {
    const open = sessionRef.current;
    if (!open?.project.appearanceBank || busyRef.current) return;
    const { controller, token } = beginPreparation();
    try {
      await prepare(
        selectWardrobeAppearance(open.project, selection),
        controller,
        token,
        false,
      );
    } catch (failure) {
      if (live(token, controller))
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (live(token, controller)) markBusy(false);
    }
  }

  async function reopen(file: File) {
    if (busyRef.current) return;
    const { controller, token } = beginPreparation();
    setStatus("正在打开保存的项目…");
    try {
      if (file.size > WARDROBE_MAX_PROJECT_BYTES)
        throw Error("项目文件不能超过 128 MiB。");
      const candidate = await importWardrobeProject(
        new Uint8Array(await file.arrayBuffer()),
        { signal: controller.signal },
      );
      await prepare(candidate, controller, token, true);
      if (live(token, controller))
        setStatus("项目已打开，搭配、动作和朝向已恢复。");
    } catch (failure) {
      if (live(token, controller))
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (live(token, controller)) markBusy(false);
    }
  }

  async function applyFittedProject(candidate: WardrobeProject) {
    const open = sessionRef.current;
    if (!open || busyRef.current) throw Error("请等待当前操作完成。");
    if (
      candidate.document.sourceSha256 !== open.project.document.sourceSha256 ||
      candidate.document.registrationSha256 !==
        open.project.document.registrationSha256
    )
      throw Error("服装校正必须属于当前角色与定位版本。");
    const { controller, token } = beginPreparation();
    setStatus("正在验证校正后的服装…");
    try {
      await prepare(candidate, controller, token, false);
    } catch (failure) {
      if (live(token, controller))
        setError(failure instanceof Error ? failure.message : String(failure));
      throw failure;
    } finally {
      if (live(token, controller)) markBusy(false);
    }
  }

  function toggleFitting() {
    const next = !fittingOpen;
    fittingRef.current = next;
    setFittingOpen(next);
    if (next) {
      keysRef.current.clear();
      pendingFacingRef.current = null;
      keyboardJumpRef.current = false;
      keyboardResumeRef.current = null;
      motionRef.current = { ...motionRef.current, paused: true, pending: null };
      setPreferences((previous) => ({ ...previous, mode: "in-place" }));
    }
    lastTimeRef.current = null;
    dirtyRef.current = true;
  }

  function requestAction(action: SideAction, inspect = false) {
    const open = sessionRef.current;
    if (!open || busyRef.current) return;
    const current = motionRef.current;
    if (inspect) {
      keyboardJumpRef.current = false;
      keyboardResumeRef.current = null;
    }
    // A paused action button selects a review pose immediately. Playing jumps
    // still complete the original two-jump clip before consuming an exit.
    if (inspect && current.paused) {
      motionRef.current = {
        ...current,
        action,
        elapsedMs: 0,
        pending: null,
        jumpFrom:
          action === "jump" &&
          (current.action === "walk" || current.action === "run")
            ? current.action
            : null,
      };
    } else
      motionRef.current = requestSideAction(
        current,
        action,
        open.renderer.manifest,
      );
    dirtyRef.current = true;
  }

  function changeFacing(facing: Facing) {
    const open = sessionRef.current;
    if (!open || busyRef.current) return;
    const motion = motionRef.current;
    if (
      motion.action === "jump" &&
      !motion.paused &&
      !sideActionEnded(motion, open.renderer.manifest)
    )
      pendingFacingRef.current = facing;
    else {
      pendingFacingRef.current = null;
      motionRef.current = { ...motion, facing };
    }
    dirtyRef.current = true;
  }

  function synchronizeKeys() {
    const intent = sideKeyboardIntent(keysRef.current);
    const requested = intent.action;
    if (intent.facing) changeFacing(intent.facing);
    // A locomotion seam may still be waiting to start the requested jump.
    // Preserve that request while remembering the latest held-key intent.
    if (keyboardJumpRef.current && motionRef.current.pending === "jump") {
      keyboardResumeRef.current = requested;
      return;
    }
    if (keyboardJumpRef.current && motionRef.current.action === "jump")
      keyboardResumeRef.current = null;
    requestAction(requested);
  }

  function step(direction: number) {
    const open = sessionRef.current;
    if (!open || busyRef.current) return;
    const current = motionRef.current;
    const clip = open.renderer.manifest.animations[current.action]!;
    const frame = sideFrameId(current, open.renderer.manifest);
    const index = Math.max(0, clip.frames.indexOf(frame));
    const next = clip.loop
      ? (index + direction + clip.frames.length) % clip.frames.length
      : Math.max(0, Math.min(clip.frames.length - 1, index + direction));
    seekFrame(next);
  }

  function seekFrame(index: number) {
    const open = sessionRef.current;
    if (!open || busyRef.current) return;
    const current = motionRef.current;
    const clip = open.renderer.manifest.animations[current.action]!;
    const next = Math.max(0, Math.min(clip.frames.length - 1, index));
    motionRef.current = {
      ...current,
      paused: true,
      pending: null,
      elapsedMs: (next * 1000) / clip.fps + 0.000001,
    };
    dirtyRef.current = true;
  }

  function toggleReview() {
    const next = !reviewOpen;
    setReviewOpen(next);
    setReviewRate(1);
    if (next) {
      keysRef.current.clear();
      pendingFacingRef.current = null;
      keyboardJumpRef.current = false;
      keyboardResumeRef.current = null;
      motionRef.current = { ...motionRef.current, paused: true, pending: null };
      setPreferences((previous) => ({
        ...previous,
        mode: "in-place",
        comparison: true,
      }));
    }
    lastTimeRef.current = null;
    dirtyRef.current = true;
  }

  function locateReviewNote(note: ReviewNote) {
    const open = sessionRef.current;
    if (!open || busyRef.current) return;
    const clip = open.renderer.manifest.animations[note.action];
    const index = clip?.frames.indexOf(note.frame) ?? -1;
    if (!clip || index < 0) return;
    keysRef.current.clear();
    pendingFacingRef.current = null;
    keyboardJumpRef.current = false;
    keyboardResumeRef.current = null;
    motionRef.current = {
      ...motionRef.current,
      action: note.action,
      facing: note.facing,
      paused: true,
      pending: null,
      jumpFrom: null,
      elapsedMs: (index * 1000) / clip.fps + 0.000001,
    };
    lastTimeRef.current = null;
    dirtyRef.current = true;
  }

  const reviewFrame = useCallback(
    (frame: number, source: boolean) => {
      if (!session) throw Error("请先打开角色。");
      return cachedFrame(session, frame, source);
    },
    [session],
  );

  async function save(kind: "project" | "png" | "gif" | "pack") {
    const open = sessionRef.current;
    if (!open || busyRef.current) return;
    const { controller, token } = beginPreparation();
    const motion = { ...motionRef.current };
    const project = updateWardrobePreview(open.project, {
      action: motion.action,
      facing: motion.facing,
    });
    const stem = `kling-${open.character}-side-view`;
    setStatus(
      kind === "pack"
        ? "正在生成完整角色包…"
        : kind === "gif"
          ? "正在生成当前动作 GIF…"
          : "正在准备下载…",
    );
    try {
      let bytes: Uint8Array;
      let filename: string;
      let mime = "application/zip";
      if (kind === "project") {
        bytes = await exportWardrobeProject(project);
        filename = `${stem}.wardrobe.zip`;
      } else if (kind === "pack") {
        bytes = await exportWardrobeCharacterPack(project, {
          onProgress: ({ completedPages, totalPages }) => {
            if (live(token, controller))
              setStatus(
                `正在生成完整角色包 · ${completedPages} / ${totalPages}`,
              );
          },
        });
        filename = `${stem}.character.zip`;
      } else if (kind === "gif") {
        const { exportWardrobeActionGif } = await import(
          "../wardrobe/action-gif"
        );
        bytes = await exportWardrobeActionGif(
          open.renderer,
          motion.action,
          motion.facing,
          {
            signal: controller.signal,
            onProgress: (done, total) => {
              if (live(token, controller))
                setStatus(`正在生成动作 GIF · ${done} / ${total}`);
            },
          },
        );
        filename = `${stem}-${motion.action}-${motion.facing}.gif`;
        mime = "image/gif";
      } else {
        const frame = sideFrameId(motion, open.renderer.manifest);
        const image = open.renderer.renderFrame(frame);
        bytes = encodeSourceRgbaPng(
          motion.facing === "left" ? mirrored(image) : image,
        );
        filename = `${stem}-${motion.action}-${motion.facing}-${frame}.png`;
        mime = "image/png";
      }
      if (!live(token, controller)) return;
      download(bytes, filename, mime);
      setStatus(
        kind === "project"
          ? "项目已保存，包含原片、服装、当前搭配及动作朝向；可在此重新打开。"
          : kind === "pack"
            ? "角色包已导出，包含当前搭配的全部动作，可独立播放。"
            : kind === "gif"
              ? "GIF 已导出：当前搭配与朝向、原生节奏、半尺寸米色背景。"
              : "透明 PNG 已导出，保留当前搭配、帧和朝向。",
      );
    } catch (failure) {
      if (live(token, controller))
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (live(token, controller)) markBusy(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void openCharacter(initialCharacter, initialCollection);
    return () => {
      mountedRef.current = false;
      requestRef.current++;
      preparationRef.current?.abort();
      release(sessionRef.current);
      sessionRef.current = null;
    };
    // The URL sets the initial character. Imports and the switcher own the
    // session afterwards; unrelated parent renders never reload an open file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dirtyRef.current = true;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
    } catch {
      /* A private browser may disable local storage. */
    }
  }, [preferences]);

  useEffect(() => {
    lastTimeRef.current = null;
    if (!active) {
      const hadMovement = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].some(
        (key) => keysRef.current.has(key),
      );
      keysRef.current.clear();
      if (hadMovement && !busyRef.current) synchronizeKeys();
      pendingFacingRef.current = null;
    }
    dirtyRef.current = true;
  }, [active]);

  useEffect(() => {
    function clearKeys() {
      const hadMovement = [...keysRef.current].some((key) =>
        ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(key),
      );
      keysRef.current.clear();
      if (hadMovement && !busyRef.current) synchronizeKeys();
      lastTimeRef.current = null;
    }
    function visibility() {
      visibleRef.current = !document.hidden;
      clearKeys();
    }
    function keydown(event: KeyboardEvent) {
      if (
        !activeRef.current ||
        !visibleRef.current ||
        busyRef.current ||
        fittingRef.current ||
        isEditing(event.target)
      )
        return;
      const movement = [
        "ArrowLeft",
        "ArrowRight",
        "KeyA",
        "KeyD",
        "ShiftLeft",
        "ShiftRight",
      ].includes(event.code);
      if (!movement && event.code !== "Space") return;
      if (!sessionRef.current) return;
      event.preventDefault();
      if (event.repeat || keysRef.current.has(event.code)) return;
      keysRef.current.add(event.code);
      if (event.code === "Space") {
        if (
          motionRef.current.action === "jump" &&
          !sideActionEnded(
            motionRef.current,
            sessionRef.current.renderer.manifest,
          )
        )
          return;
        keyboardJumpRef.current = true;
        const intent = sideKeyboardIntent(keysRef.current);
        keyboardResumeRef.current =
          intent.action === "idle" ? null : intent.action;
        requestAction("jump");
        return;
      }
      synchronizeKeys();
    }
    function keyup(event: KeyboardEvent) {
      if (!keysRef.current.has(event.code)) return;
      keysRef.current.delete(event.code);
      if (event.code !== "Space" && activeRef.current && !busyRef.current)
        synchronizeKeys();
    }
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    let request = 0;
    let lastDrawn = "";
    let lastReadout = "";
    function tick(now: number) {
      request = requestAnimationFrame(tick);
      if (!activeRef.current || !visibleRef.current) {
        lastTimeRef.current = null;
        return;
      }
      const open = sessionRef.current;
      const canvas = canvasRef.current;
      if (!open || !canvas) {
        lastTimeRef.current = null;
        return;
      }
      const prefs = preferencesRef.current;
      const delta =
        lastTimeRef.current === null ? 0 : now - lastTimeRef.current;
      const rate = reviewRef.current.open ? reviewRef.current.rate : 1;
      lastTimeRef.current = now;
      try {
        const manifest = open.renderer.manifest;
        // Travel uses a following camera. These finite bounds protect numeric
        // precision without stopping ordinary playback at the screen edges.
        const bounds = { min: -10_000_000, max: 10_000_000 };
        if (!busyRef.current)
          motionRef.current = advanceSideMotion(
            motionRef.current,
            delta * rate,
            manifest,
            {
              mode: prefs.mode,
              walkSpeed: prefs.walkSpeed,
              runSpeed: prefs.runSpeed,
              bounds,
            },
          );
        let motion = motionRef.current;
        if (
          keyboardJumpRef.current &&
          motion.action === "jump" &&
          keyboardResumeRef.current !== null
        ) {
          motion = requestSideAction(
            motion,
            keyboardResumeRef.current,
            manifest,
          );
          keyboardResumeRef.current = null;
          motionRef.current = motion;
        }
        if (
          keyboardJumpRef.current &&
          motion.action !== "jump" &&
          motion.pending !== "jump"
        ) {
          keyboardJumpRef.current = false;
          keyboardResumeRef.current = null;
        }
        if (
          pendingFacingRef.current &&
          (motion.action !== "jump" || sideActionEnded(motion, manifest))
        ) {
          motion = { ...motion, facing: pendingFacingRef.current };
          pendingFacingRef.current = null;
          motionRef.current = motion;
        }
        const frame = sideFrameId(motion, manifest);
        const clip = manifest.animations[motion.action]!;
        const index = Math.max(0, clip.frames.indexOf(frame));
        const ended = sideActionEnded(motion, manifest);
        const feedback = sideMotionFeedback(motion, manifest);
        canvas.dataset.action = motion.action;
        canvas.dataset.frame = String(frame);
        canvas.dataset.frameIndex = String(index);
        canvas.dataset.frameId = String(frame);
        canvas.dataset.framePosition = String(index);
        canvas.dataset.facing = motion.facing;
        canvas.dataset.mode = prefs.mode;
        canvas.dataset.position = motion.worldX.toFixed(3);
        canvas.dataset.camera = prefs.mode === "travel" ? "follow" : "fixed";
        canvas.dataset.groundOffset = (
          prefs.mode === "travel" ? -motion.worldX : 0
        ).toFixed(3);
        if (travelReadoutRef.current)
          travelReadoutRef.current.textContent = `${motion.worldX >= 0 ? "+" : ""}${Math.round(motion.worldX).toLocaleString()} px`;
        canvas.dataset.elapsedMs = motion.elapsedMs.toFixed(3);
        canvas.dataset.fps = String(clip.fps);
        canvas.dataset.timing = rate === 1 ? "native-1x" : `review-${rate}x`;
        canvas.dataset.previewRate = String(rate);
        canvas.dataset.paused = String(motion.paused);
        canvas.dataset.pending = motion.pending ?? "";
        canvas.dataset.ended = String(ended);
        canvas.dataset.character = open.character;
        canvas.dataset.collection = sideProjectCollection(open.project);
        canvas.dataset.phase = feedback.phase;
        canvas.dataset.appearance = JSON.stringify(
          getWardrobeAppearanceSelection(open.project),
        );
        canvas.dataset.selection = JSON.stringify(
          open.project.document.selection,
        );
        const readoutKey = [
          open.character,
          clip.frames.length,
          clip.fps,
          motion.action,
          frame,
          motion.facing,
          motion.paused,
          motion.pending,
          ended,
          feedback.transition
            ? Math.ceil(feedback.transition.remainingMs / 100)
            : null,
        ].join(":");
        if (readoutKey !== lastReadout) {
          lastReadout = readoutKey;
          setReadout({
            action: motion.action,
            frame,
            index,
            count: clip.frames.length,
            fps: clip.fps,
            facing: motion.facing,
            paused: motion.paused,
            pending: motion.pending,
            ended,
            transitionMs: feedback.transition?.remainingMs ?? null,
          });
        }
        const drawKey = `${readoutKey}:${prefs.mode === "travel" ? motion.worldX : 0}`;
        if (!dirtyRef.current && lastDrawn === drawKey) return;
        lastDrawn = drawKey;
        dirtyRef.current = false;
        const context = canvas.getContext("2d");
        if (!context) throw Error("当前浏览器无法创建预览画布。");
        context.clearRect(0, 0, WIDTH, HEIGHT);
        if (prefs.ground) {
          const offset =
            prefs.mode === "travel" ? ((motion.worldX % 80) + 80) % 80 : 0;
          const panels = prefs.comparison
            ? [
                [40, 560],
                [640, 1160],
              ]
            : [[40, 1160]];
          context.strokeStyle = "#c7cebe";
          context.lineWidth = 1;
          for (const [left, right] of panels) {
            context.beginPath();
            context.moveTo(left, GROUND + 0.5);
            context.lineTo(right, GROUND + 0.5);
            context.stroke();
            for (let x = left + 80 - offset; x < right; x += 80) {
              context.beginPath();
              context.moveTo(x + 0.5, GROUND);
              context.lineTo(x + 0.5, GROUND + 9);
              context.stroke();
            }
          }
          context.fillStyle = "#8d9988";
          context.font = "14px system-ui";
          context.fillText("地面参考", 42, GROUND + 31);
        }
        const drawCharacter = (center: number, source: boolean) => {
          const frameCanvas = cachedFrame(open, frame, source);
          context.save();
          context.translate(center, GROUND);
          if (motion.facing === "left") context.scale(-1, 1);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(
            frameCanvas,
            -manifest.anchor.x,
            -manifest.anchor.y,
          );
          if (prefs.anchors) {
            const registration = open.project.registration.frames.find(
              (entry) => entry.frameId === frame,
            );
            if (registration)
              for (const key of WARDROBE_ANCHORS) {
                const point = registration.points[key];
                context.beginPath();
                context.arc(
                  point.x - manifest.anchor.x,
                  point.y - manifest.anchor.y,
                  4,
                  0,
                  Math.PI * 2,
                );
                context.fillStyle =
                  point.visibility === "occluded" ||
                  (point.confidence ?? 1) < 0.7
                    ? "#f4bb72"
                    : "#36796b";
                context.fill();
                context.strokeStyle = "#fff";
                context.lineWidth = 1.5;
                context.stroke();
              }
          }
          context.restore();
        };
        if (prefs.comparison) {
          drawCharacter(300, true);
          drawCharacter(900, false);
          context.strokeStyle = "#d4d9cc";
          context.setLineDash([5, 7]);
          context.beginPath();
          context.moveTo(600, 75);
          context.lineTo(600, 770);
          context.stroke();
          context.setLineDash([]);
          context.fillStyle = "#788670";
          context.font = "17px system-ui";
          context.textAlign = "center";
          context.fillText("原片", 300, 53);
          context.fillText("当前搭配", 900, 53);
          context.textAlign = "left";
        } else drawCharacter(600, false);
      } catch (failure) {
        motionRef.current = { ...motionRef.current, paused: true };
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    }
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, []);

  const selection = session?.project.document.selection ?? ORIGINAL;
  const collection = session
    ? sideProjectCollection(session.project)
    : initialCollection;
  const appearance = session
    ? getWardrobeAppearanceSelection(session.project)
    : null;
  const preset = sideLookSelection(
    session?.character ?? initialCharacter,
    collection,
  );
  const presetAvailable =
    !!session &&
    Object.values(preset).every(
      (id) =>
        id === null ||
        session.project.items.some((item) => item.manifest.id === id),
    );
  const originalSelected = Object.values(selection).every((id) => id === null);
  const dailySelected =
    !!session &&
    (["top", "bottom", "shoes", "fullBody"] as WardrobeSlot[]).every(
      (slot) => selection[slot] === preset[slot],
    );
  const jumpLocked =
    readout.action === "jump" && !readout.ended && !readout.paused;
  function setPreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) {
    setPreferences((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <section
      className="side-playground"
      data-testid="side-playground"
      aria-busy={busy}
      aria-label="侧视动作与换装"
    >
      <header className="side-heading">
        <div>
          <p className="side-eyebrow">SIDE VIEW · PLAY & DRESS</p>
          <h2>让角色动起来</h2>
          <p className="side-intro">
            从原片动作出发，试穿、转身，也向前走几步。
          </p>
        </div>
        <div className="side-project-tools">
          <button
            type="button"
            disabled={busy}
            data-testid="side-open-project"
            onClick={() => fileRef.current?.click()}
          >
            <FolderOpen size={15} />
            打开项目
          </button>
          <button
            type="button"
            className="side-primary"
            disabled={!session || busy}
            data-testid="side-save-project"
            onClick={() => void save("project")}
          >
            <Save size={15} />
            保存项目
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".zip,application/zip"
            data-testid="side-project-input"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void reopen(file);
            }}
          />
        </div>
      </header>

      <div className="side-layout">
        <div className="side-preview-column">
          <div className="side-stage-card">
            <div className="side-stage-topline">
              <span>
                <i />
                {session
                  ? SIDE_CHARACTERS.find(
                      (entry) => entry.id === session.character,
                    )?.name
                  : "侧视预览"}
              </span>
              <span>
                {reviewOpen && reviewRate !== 1
                  ? `审阅慢放 · ${reviewRate}×`
                  : "原生节奏 · 1×"}
                <b>原片 {readout.fps} fps</b>
              </span>
            </div>
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              className="side-stage"
              data-testid="side-stage"
              tabIndex={0}
              aria-label="侧视角色舞台。方向键或 A、D 移动，Shift 跑步，空格连续跳跃。"
            />
            {preferences.mode === "travel" && (
              <div
                className="side-camera-readout"
                data-testid="side-travel-status"
              >
                <span>镜头跟随</span>
                <output ref={travelReadoutRef}>0 px</output>
                <small>原始像素位移</small>
              </div>
            )}
            {!session && (
              <div className="side-loading" role="status">
                <span className="side-spinner" />
                {error ? "角色未能载入" : "正在准备原片与服装…"}
                {error && (
                  <button
                    type="button"
                    onClick={() =>
                      void openCharacter(
                        loadTargetRef.current.character,
                        loadTargetRef.current.collection,
                      )
                    }
                  >
                    重新载入
                  </button>
                )}
              </div>
            )}
            {session && busy && (
              <div className="side-preparing">
                <span className="side-spinner" />
                正在准备…
              </div>
            )}
            <div className="side-keyboard-hint">
              <span>
                <kbd>←</kbd>
                <kbd>→</kbd> / <kbd>A</kbd>
                <kbd>D</kbd> 移动
              </span>
              <span>
                <kbd>Shift</kbd> 跑步
              </span>
              <span>
                <kbd>Space</kbd> 跳跃
              </span>
              <small>点击舞台即可操作</small>
            </div>
          </div>

          <div className="side-playback">
            <div className="side-actions" aria-label="动作选择">
              {ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  data-testid={`side-action-${action}`}
                  disabled={!session || busy}
                  aria-pressed={readout.action === action}
                  onClick={() => requestAction(action, true)}
                >
                  {ACTION_LABELS[action]}
                </button>
              ))}
            </div>
            <input
              className="side-frame-range"
              type="range"
              min={0}
              max={Math.max(0, readout.count - 1)}
              value={readout.index}
              disabled={!session || busy}
              aria-label="动作帧"
              data-testid="side-frame"
              onChange={(event) => seekFrame(Number(event.currentTarget.value))}
            />
            <div className="side-timeline">
              <div className="side-transport">
                <button
                  type="button"
                  disabled={!session || busy}
                  aria-label="上一帧"
                  data-testid="side-step-back"
                  onClick={() => step(-1)}
                >
                  <SkipBack size={16} />
                </button>
                <button
                  type="button"
                  disabled={!session || busy}
                  aria-label={readout.paused ? "继续播放" : "暂停播放"}
                  data-testid="side-play-pause"
                  onClick={() => {
                    motionRef.current = {
                      ...motionRef.current,
                      paused: !motionRef.current.paused,
                    };
                    lastTimeRef.current = null;
                    dirtyRef.current = true;
                  }}
                >
                  {readout.paused ? <Play size={17} /> : <Pause size={17} />}
                </button>
                <button
                  type="button"
                  disabled={!session || busy}
                  aria-label="下一帧"
                  data-testid="side-step-forward"
                  onClick={() => step(1)}
                >
                  <SkipForward size={16} />
                </button>
              </div>
              <div
                className="side-frame-readout"
                data-testid="side-frame-status"
              >
                <strong>{ACTION_LABELS[readout.action]}</strong>
                <span>
                  {readout.count
                    ? `${readout.index + 1} / ${readout.count} 帧`
                    : "准备中"}
                  {readout.ended
                    ? " · 原片末帧停留"
                    : readout.paused
                      ? " · 已暂停"
                      : ""}
                </span>
              </div>
              <div className="side-facing" aria-label="朝向">
                <button
                  type="button"
                  disabled={!session || busy || jumpLocked}
                  aria-label="朝左"
                  aria-pressed={readout.facing === "left"}
                  data-testid="side-facing-left"
                  onClick={() => changeFacing("left")}
                >
                  <ArrowLeft size={15} />左
                </button>
                <button
                  type="button"
                  disabled={!session || busy || jumpLocked}
                  aria-label="朝右"
                  aria-pressed={readout.facing === "right"}
                  data-testid="side-facing-right"
                  onClick={() => changeFacing("right")}
                >
                  右<ArrowRight size={15} />
                </button>
              </div>
            </div>
            {readout.pending && (
              <p className="side-pending" data-testid="side-pending">
                {readout.action === "jump"
                  ? "两次跳跃完整播放后"
                  : "本轮动作结束后"}
                切换为{ACTION_LABELS[readout.pending]}
                {readout.transitionMs !== null &&
                  `（剩余约 ${(Math.ceil(readout.transitionMs / (reviewOpen ? reviewRate : 1) / 100) / 10).toFixed(1)} 秒${readout.paused ? "，已暂停" : ""}）`}
                。
              </p>
            )}
            {readout.ended && (
              <p className="side-pending" data-testid="side-endpoint-note">
                原片停在浅蹲末帧，尚未回到自然站立。可选择待机或再次播放跳跃。
              </p>
            )}
          </div>

          <div className="side-review-toggle">
            <button
              type="button"
              data-testid="side-review-toggle"
              disabled={!session || busy}
              aria-expanded={reviewOpen}
              onClick={toggleReview}
            >
              {reviewOpen ? "关闭逐帧审阅" : "检查穿帮 · 逐帧审阅"}
            </button>
            <span>
              {reviewOpen
                ? "关闭后恢复 1× 预览，可点击继续播放。"
                : "暂停到当前帧，并排对比、放大局部、记录问题。"}
            </span>
          </div>
          {reviewOpen && session && (
            <SideReviewPanel
              key={`${session.character}:${session.project.document.sourceSha256}`}
              project={session.project}
              character={session.character}
              action={readout.action}
              frame={readout.frame}
              facing={readout.facing}
              busy={busy}
              rate={reviewRate}
              onRate={(rate) => {
                setReviewRate(rate);
                lastTimeRef.current = null;
                dirtyRef.current = true;
              }}
              onPose={locateReviewNote}
              getFrame={reviewFrame}
            />
          )}
          <div className="side-review-toggle">
            <button
              type="button"
              data-testid="side-fitting-toggle"
              disabled={!session || busy}
              aria-expanded={fittingOpen}
              onClick={toggleFitting}
            >
              {fittingOpen ? "关闭服装校正" : "服装校正 · 锚点与遮挡"}
            </button>
            <span>检查定位与遮挡，局部修正服装并保存为独立版本。</span>
          </div>
          {fittingOpen && session && (
            <Suspense fallback={<p role="status">正在打开服装校正工具…</p>}>
              <FittingWorkbench
                key={`${session.character}:${session.project.document.sourceSha256}`}
                project={session.project}
                renderer={session.renderer}
                action={readout.action}
                frameId={readout.frame}
                disabled={busy}
                onApply={applyFittedProject}
              />
            </Suspense>
          )}

          <div className="side-feedback">
            <p role="status" aria-live="polite" data-testid="side-status">
              {status}
            </p>
            {error && (
              <div className="side-error" role="alert">
                <p>{error}</p>
                {session && catalogLoadFailed && (
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="side-retry-load"
                    onClick={() =>
                      void openCharacter(
                        loadTargetRef.current.character,
                        loadTargetRef.current.collection,
                      )
                    }
                  >
                    重新载入所选角色与服装组
                  </button>
                )}
              </div>
            )}
          </div>
          <details className="side-source-note">
            <summary>关于这组侧视动作</summary>
            <p>
              男女角色来自各自的侧视原片，与角色库默认动作的取帧不同。行走、跑步按完整片段循环；跳跃保留原片的连续两次跳起，结束停在浅蹲末帧。横向移动采用镜头跟随与滚动地面，跳跃高度来自原片。
            </p>
            <p>
              17
              个定位点用于服装对齐参考，部分遮挡位置为估计；不会驱动或拉伸身体。
            </p>
          </details>
        </div>

        <aside className="side-controls" aria-label="角色与舞台设置">
          <section className="side-control-section">
            <div className="side-section-title">
              <span>01</span>
              <h3>角色与搭配</h3>
            </div>
            <label className="side-field">
              角色
              <select
                value={session?.character ?? initialCharacter}
                disabled={busy}
                data-testid="side-character"
                onChange={(event) =>
                  void openCharacter(
                    event.currentTarget.value as SideCharacterId,
                  )
                }
              >
                {SIDE_CHARACTERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="side-field">
              服装组
              <select
                data-testid="side-collection"
                value={collection}
                disabled={busy}
                onChange={(event) =>
                  void openCharacter(
                    session?.character ?? initialCharacter,
                    event.currentTarget.value as SideCollection,
                  )
                }
              >
                <option value="material">原版型配色</option>
                <option value="tailored">新款试装 · 上衣与下装</option>
              </select>
            </label>
            <p className="side-small-note">
              切换服装组会打开对应项目；当前搭配可先保存。
            </p>
            <div className="side-look-presets">
              <button
                type="button"
                disabled={!session || busy}
                aria-pressed={originalSelected}
                data-testid="side-look-original"
                onClick={() => void changeSelection(ORIGINAL)}
              >
                <span className="side-swatch side-swatch-original" />
                {collection === "tailored" ? "原片服装" : "原片造型"}
              </button>
              <button
                type="button"
                disabled={!presetAvailable || busy}
                aria-pressed={dailySelected}
                data-testid="side-look-daily"
                onClick={() => session && void changeSelection(preset)}
              >
                <span
                  className={`side-swatch side-swatch-${session?.character ?? initialCharacter}`}
                />
                {collection === "tailored" ? "新款搭配" : "日常搭配"}
              </button>
            </div>
            {(
              [
                ["top", "上装"],
                ["bottom", "下装"],
                ["shoes", "鞋履"],
              ] as const
            ).map(([slot, label]) => (
              <label className="side-field" key={slot}>
                {label}
                <select
                  data-testid={`side-${slot}`}
                  disabled={!session || busy}
                  value={selection[slot] ?? ""}
                  onChange={(event) =>
                    void changeSelection({
                      ...selection,
                      fullBody: null,
                      [slot]: event.currentTarget.value || null,
                    })
                  }
                >
                  <option value="">原片{label}</option>
                  {session?.project.items
                    .filter((item) => item.manifest.slot === slot)
                    .map((item) => (
                      <option key={item.manifest.id} value={item.manifest.id}>
                        {item.manifest.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <p className="side-small-note">
              每件服装跟随原片逐帧对齐，试试混搭后再跑几步。
            </p>
            {session?.project.appearanceBank && appearance && (
              <>
                <label className="side-field">
                  发型
                  <select
                    data-testid="side-hair"
                    disabled={busy}
                    value={appearance.hairId ?? ""}
                    onChange={(event) =>
                      void changeAppearance({
                        hairId: event.currentTarget.value || null,
                      })
                    }
                  >
                    <option value="">原片发型</option>
                    {session.project.appearanceBank.manifest.styles
                      .filter((style) => style.slot === "hair")
                      .map((style) => (
                        <option key={style.id} value={style.id}>
                          {style.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="side-field">
                  发色
                  <select
                    data-testid="side-hair-color"
                    disabled={busy || !appearance.hairId}
                    value={appearance.hairColor}
                    onChange={(event) =>
                      void changeAppearance({
                        hairColor: event.currentTarget
                          .value as AppearanceSelection["hairColor"],
                      })
                    }
                  >
                    {APPEARANCE_HAIR_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {
                          {
                            chestnut: "栗棕",
                            espresso: "深棕",
                            copper: "铜棕",
                          }[color]
                        }
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </section>

          <section className="side-control-section">
            <div className="side-section-title">
              <span>02</span>
              <h3>舞台</h3>
            </div>
            <div className="side-segmented" aria-label="舞台模式">
              <button
                type="button"
                data-testid="side-mode-in-place"
                aria-pressed={preferences.mode === "in-place"}
                onClick={() => setPreference("mode", "in-place")}
              >
                原地预览
              </button>
              <button
                type="button"
                data-testid="side-mode-travel"
                disabled={reviewOpen}
                aria-pressed={preferences.mode === "travel"}
                onClick={() =>
                  setPreferences((previous) => ({
                    ...previous,
                    mode: "travel",
                    ground: true,
                  }))
                }
              >
                横向移动
              </button>
            </div>
            {reviewOpen && (
              <p className="side-small-note">
                逐帧审阅使用原地预览。关闭审阅后可切换横向移动。
              </p>
            )}
            {preferences.mode === "travel" && (
              <div className="side-speeds">
                <label>
                  行走速度 <output>{preferences.walkSpeed} px/s</output>
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    step={5}
                    value={preferences.walkSpeed}
                    data-testid="side-walk-speed"
                    onChange={(event) =>
                      setPreference(
                        "walkSpeed",
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                </label>
                <label>
                  跑步速度 <output>{preferences.runSpeed} px/s</output>
                  <input
                    type="range"
                    min={0}
                    max={1400}
                    step={5}
                    value={preferences.runSpeed}
                    data-testid="side-run-speed"
                    onChange={(event) =>
                      setPreference(
                        "runSpeed",
                        Number(event.currentTarget.value),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="side-reset"
                  data-testid="side-center"
                  onClick={() => {
                    motionRef.current = { ...motionRef.current, worldX: 0 };
                    dirtyRef.current = true;
                  }}
                >
                  <RotateCcw size={13} />
                  重置位移
                </button>
                <p className="side-small-note">
                  速度按原片支撑脚位移估算，可调整；动作仍以原生节奏播放。
                </p>
              </div>
            )}
            <label className="side-toggle">
              <input
                type="checkbox"
                checked={preferences.ground}
                data-testid="side-ground"
                onChange={(event) =>
                  setPreference("ground", event.currentTarget.checked)
                }
              />
              <span>地面参考线</span>
            </label>
            <label className="side-toggle">
              <input
                type="checkbox"
                checked={preferences.comparison}
                data-testid="side-comparison"
                onChange={(event) =>
                  setPreference("comparison", event.currentTarget.checked)
                }
              />
              <span>并排对比原片</span>
            </label>
            <label className="side-toggle">
              <input
                type="checkbox"
                checked={preferences.anchors}
                data-testid="side-anchors"
                onChange={(event) =>
                  setPreference("anchors", event.currentTarget.checked)
                }
              />
              <span>显示 17 个服装定位点</span>
            </label>
            {preferences.anchors && (
              <p className="side-small-note">
                橙色点表示被遮挡或把握较低的位置，仅作试装参考，需结合原片检查。
              </p>
            )}
          </section>

          <section className="side-control-section side-export-section">
            <div className="side-section-title">
              <span>03</span>
              <h3>带走当前造型</h3>
            </div>
            <button
              type="button"
              disabled={!session || busy}
              data-testid="side-export-png"
              onClick={() => void save("png")}
            >
              <Download size={14} />
              <span>
                透明 PNG<small>当前帧 · 原始尺寸</small>
              </span>
            </button>
            <button
              type="button"
              disabled={!session || busy}
              data-testid="side-export-gif"
              onClick={() => void save("gif")}
            >
              <Download size={14} />
              <span>
                动作 GIF<small>当前动作 · 原生节奏</small>
              </span>
            </button>
            <button
              type="button"
              disabled={!session || busy}
              data-testid="side-export-pack"
              onClick={() => void save("pack")}
            >
              <Download size={14} />
              <span>
                CharacterPack<small>完整动作 · 可独立播放</small>
              </span>
            </button>
            <p className="side-small-note">
              导出使用当前搭配和朝向。继续换装请保存项目。
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}
