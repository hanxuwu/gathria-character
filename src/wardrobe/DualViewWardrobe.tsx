import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, FolderOpen, Pause, Play, Save } from "lucide-react";
import { APPEARANCE_HAIR_COLORS } from "../appearance/contract";
import type { Facing, PortableAnimationName } from "../core/types";
import { encodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import {
  advanceGameplayMotion,
  createGameplayState,
  gameplayFrameId,
  gameplayFramePosition,
  gameplayManifest,
  requestGameplayAction,
  resolveGameplayMotion,
  type GameplayMode,
  type GameplayMotion,
  type GameplayState,
} from "../core/gameplay-motion";
import {
  createWardrobeCompositor,
  exportWardrobeCharacterPack,
  validateWardrobeAppearance,
  type WardrobeCompositor,
} from "./compositor";
import { exportWardrobeActionGif } from "./action-gif";
import { exportWardrobeRunJumpGif } from "./action-flow-gif";
import {
  exportWardrobeProject,
  getWardrobeAppearanceSelection,
  updateWardrobePreview,
} from "./project";
import {
  clearDualViewAppearance,
  DEFAULT_DUAL_VIEW_APPEARANCE,
  describeDualViewAppearance,
  prepareDualViewAppearance,
  type DualViewAppearanceSelection,
} from "./dual-view-appearance";
import {
  compatiblePairedAppearance,
  loadPairedAppearanceBank,
  pairedAppearanceCatalog,
} from "./dual-view-appearance-catalog";
import {
  createDualViewWardrobe,
  exportDualViewWardrobe,
  importDualViewWardrobe,
  type DualView,
  type DualViewCharacter,
  type DualViewPreview,
  type DualViewSelection,
  type DualViewWardrobe as PairedProject,
} from "./dual-view";
import {
  DUAL_OUTFIT,
  DUAL_PALETTES,
  availableDualViewOutfits,
  dualViewOutfit,
  loadDualViewWardrobe,
  prepareDualViewLook,
  validateDualViewLook,
} from "./dual-view-catalog";
import {
  advanceNativeClock,
  calibrateSourceBody,
  comparisonLayout,
  type BodyCalibration,
} from "./dual-view-comparison";
import { DisplayFrameCache } from "./display-frame-cache";
import "./dual-view-wardrobe.css";

const VIEWS: DualView[] = ["original", "side"];
const ACTIONS: Array<[PortableAnimationName, string]> = [
  ["idle", "待机"],
  ["walk", "走路"],
  ["run", "跑步"],
  ["jump", "跳跃"],
  ["celebrate", "庆祝"],
];
const viewName = (view: DualView) =>
  view === "original" ? "原版 · 三分之四视角" : "侧视 · 横版动作";
type Session = {
  pair: PairedProject;
  renderers: Record<DualView, WardrobeCompositor>;
  manifests: Record<DualView, WardrobeCompositor["manifest"]>;
  profiles: Record<DualView, GameplayMotion | null>;
  comparison: ReturnType<typeof comparisonLayout>;
};
type Operation = { token: number; controller: AbortController };
type ExportKind =
  | "project"
  | "native-project"
  | "png"
  | "gif"
  | "flow-gif"
  | "pack";

function motionSources(
  pair: PairedProject,
  renderers: Session["renderers"],
): Pick<Session, "profiles" | "manifests"> {
  const profiles = {} as Session["profiles"];
  const manifests = {} as Session["manifests"];
  for (const source of VIEWS) {
    const profile =
      pair.motionMode === "single-jump"
        ? (pair.previews[source].takeoff?.profile ??
          resolveGameplayMotion(
            pair.projects[source].archive.manifest,
            pair.projects[source].document.sourceSha256,
          ))
        : null;
    if (pair.motionMode === "single-jump" && !profile)
      throw Error(`${viewName(source)}缺少经过检查的单次跳跃动作。`);
    profiles[source] = profile;
    manifests[source] = profile
      ? gameplayManifest(renderers[source].manifest, profile)
      : renderers[source].manifest;
  }
  return { profiles, manifests };
}

function motionPosition(state: GameplayState, profile: GameplayMotion): number {
  return gameplayFramePosition(profile, state);
}

function leadInLabel(state: GameplayState): string | null {
  if (!state.leadIn) return null;
  return state.leadIn.from === "jump" ? "落地接跑步" : "起跳准备";
}

function motionPreview(
  preview: DualViewPreview,
  state: GameplayState,
  profile: GameplayMotion,
): DualViewPreview {
  const { takeoff: _takeoff, ...pose } = preview;
  return {
    ...pose,
    action: state.action,
    position: motionPosition(state, profile),
    ...(state.leadIn
      ? { takeoff: { profile, state: structuredClone(state) } }
      : {}),
  };
}

function dispose(session: Session | undefined) {
  if (session)
    for (const renderer of Object.values(session.renderers)) renderer.dispose();
}
function download(bytes: Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function mirror(image: RgbaPng): RgbaPng {
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

/** A single editing surface owns both source-specific projects. Replacing a
 * look commits only after both native renderers have passed their validation. */
export default function DualViewWardrobe({
  initialCharacter,
  view,
  active,
  onViewChange,
  onCharacterChange,
}: {
  initialCharacter: DualViewCharacter;
  view: DualView;
  active: boolean;
  onViewChange: (view: DualView) => void;
  onCharacterChange: (character: DualViewCharacter) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState("正在准备两个视角的日常服装…");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState<Record<DualView, boolean>>({
    original: false,
    side: false,
  });
  const [comparing, setComparing] = useState(false);
  const compareRef = useRef(false);
  const compareCanvases = useRef<
    Partial<Record<DualView, HTMLCanvasElement | null>>
  >({});
  const calibrations = useRef(new Map<string, BodyCalibration>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const [displayFrames] = useState(
    () =>
      new DisplayFrameCache<HTMLCanvasElement>((surface) => {
        surface.width = 0;
        surface.height = 0;
      }),
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const current = useRef<Session | null>(null);
  // Retain portable data for both characters; only the current character keeps
  // decoded renderers. Switching back validates and prepares that saved pair.
  const cached = useRef(new Map<DualViewCharacter, PairedProject>());
  const operation = useRef<Operation | null>(null);
  const serial = useRef(0);
  const alive = useRef(true);
  const activeRef = useRef(active);
  const busyRef = useRef(true);
  const viewRef = useRef(view);
  const playingRef = useRef(playing);
  const elapsed = useRef<Record<DualView, number>>({ original: 0, side: 0 });
  const motion = useRef<Record<DualView, GameplayState>>({
    original: createGameplayState(),
    side: createGameplayState(),
  });
  const previousTime = useRef<number | null>(null);
  const callbacks = useRef({ onViewChange, onCharacterChange });
  compareRef.current = comparing;
  activeRef.current = active;
  viewRef.current = view;
  playingRef.current = playing;
  callbacks.current = { onViewChange, onCharacterChange };

  function markBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
    previousTime.current = null;
  }
  function begin(message: string): Operation {
    operation.current?.controller.abort();
    const next = { token: ++serial.current, controller: new AbortController() };
    operation.current = next;
    markBusy(true);
    setError("");
    setStatus(message);
    return next;
  }
  function live(request: Operation) {
    return (
      alive.current &&
      serial.current === request.token &&
      !request.controller.signal.aborted
    );
  }
  function failed(request: Operation, failure: unknown) {
    if (live(request)) {
      setError(
        `${failure instanceof Error ? failure.message : String(failure)}${current.current ? " 当前两个视角的搭配均已保留。" : ""}`,
      );
      setStatus(
        current.current ? "未应用这次操作。" : "未能打开双视角衣橱，请重试。",
      );
    }
  }
  function finish(request: Operation) {
    if (live(request)) {
      operation.current = null;
      markBusy(false);
    }
  }
  function cancel() {
    operation.current?.controller.abort();
    operation.current = null;
    serial.current++;
    markBusy(false);
    setError("");
    setStatus(
      current.current
        ? "操作已取消，两个视角的当前搭配均未改变。"
        : "已取消载入，可重新打开。",
    );
  }

  function remember(next: Session) {
    current.current = next;
    cached.current.set(next.pair.character, next.pair);
    setSession(next);
  }
  function synchronizeClocks(
    pair: PairedProject,
    manifests: Session["manifests"],
  ) {
    for (const source of VIEWS) {
      const preview = pair.previews[source];
      const clip = manifests[source].animations[preview.action]!;
      elapsed.current[source] = (preview.position * 1000) / clip.fps;
      motion.current[source] = preview.takeoff
        ? structuredClone(preview.takeoff.state)
        : {
            ...createGameplayState(preview.action),
            elapsedMs: elapsed.current[source],
          };
      elapsed.current[source] = motion.current[source].elapsedMs;
    }
    previousTime.current = null;
  }
  function paint(open: Session, source: DualView) {
    const comparison = compareRef.current;
    const target = comparison
      ? compareCanvases.current[source]
      : canvas.current;
    if (!target || !activeRef.current) return;
    const preview = open.pair.previews[source];
    const renderer = open.renderers[source];
    const clip = open.manifests[source].animations[preview.action];
    const profile = open.profiles[source];
    const id = profile
      ? gameplayFrameId(profile, motion.current[source])
      : clip?.frames[preview.position];
    if (id === undefined) throw Error("当前动作没有可显示的原始帧。");
    displayFrames.withFrame(
      renderer,
      id,
      () => {
        const image = renderer.renderFrame(id);
        const surface = document.createElement("canvas");
        surface.width = image.width;
        surface.height = image.height;
        const context = surface.getContext("2d");
        if (!context) {
          surface.width = 0;
          surface.height = 0;
          throw Error("当前浏览器无法创建预览画布。");
        }
        context.putImageData(
          new ImageData(
            new Uint8ClampedArray(image.pixels),
            image.width,
            image.height,
          ),
          0,
          0,
        );
        return surface;
      },
      (image) => {
        const width = comparison ? open.comparison.width : image.width;
        const height = comparison ? open.comparison.height : image.height;
        if (target.width !== width) target.width = width;
        if (target.height !== height) target.height = height;
        const context = target.getContext("2d")!;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, target.width, target.height);
        context.save();
        if (preview.facing === "left") {
          context.translate(target.width, 0);
          context.scale(-1, 1);
        }
        if (comparison) {
          const transform = open.comparison.transforms[VIEWS.indexOf(source)];
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.drawImage(
            image,
            transform.x,
            transform.y,
            image.width * transform.scale,
            image.height * transform.scale,
          );
        } else context.drawImage(image, 0, 0);
        context.restore();
        const headCatalog =
          compatiblePairedAppearance(open.pair) ??
          pairedAppearanceCatalog(open.pair.character);
        const head = headCatalog
          ? describeDualViewAppearance(open.pair, headCatalog)
          : null;
        const nativeHead = getWardrobeAppearanceSelection(
          open.pair.projects[source],
        );
        Object.assign(target.dataset, {
          displayScale: String(
            comparison
              ? open.comparison.transforms[VIEWS.indexOf(source)].scale
              : 1,
          ),
          displayBaseline: String(comparison ? open.comparison.baselineY : ""),
          displayBodyHeight: String(
            comparison ? open.comparison.bodyHeight : "",
          ),
          view: source,
          character: open.pair.character,
          outfit: open.pair.selection.outfitId,
          palette: open.pair.selection.paletteId,
          top: open.pair.selection.topId ?? "original",
          bottom: open.pair.selection.bottomId ?? "original",
          hair:
            head?.status === "custom"
              ? "custom"
              : (head?.selection?.hairId ?? "original"),
          face:
            head?.status === "custom"
              ? "custom"
              : (head?.selection?.faceId ?? "original"),
          hairColor: nativeHead.hairColor,
          nativeHair: nativeHead.hairId ?? "original",
          nativeFace: nativeHead.faceId ?? "original",
          appearanceSha:
            open.pair.projects[source].appearanceBank?.sha256 ?? "",
          action: preview.action,
          motionMode: open.pair.motionMode,
          profileId: open.profiles[source]?.id ?? "",
          pendingAction: motion.current[source].pending ?? "",
          returnAction: motion.current[source].returnAction,
          jumpFrom: motion.current[source].jumpFrom ?? "",
          leadIn: String(!!motion.current[source].leadIn),
          leadInElapsedMs: String(
            motion.current[source].leadIn?.elapsedMs ?? 0,
          ),
          elapsedMs: String(
            open.profiles[source]
              ? motion.current[source].elapsedMs
              : elapsed.current[source],
          ),
          framePosition: String(preview.position),
          frameId: String(id),
          facing: preview.facing,
          paused: String(!playingRef.current[source]),
          frameWidth: String(image.width),
          frameHeight: String(image.height),
          fps: String(clip!.fps),
          frameCount: String(clip!.frames.length),
          sourceSha: open.pair.projects[source].document.sourceSha256,
          registrationSha:
            open.pair.projects[source].document.registrationSha256,
        });
      },
    );
  }

  async function prepare(
    pair: PairedProject,
    request: Operation,
    restoreView = false,
  ) {
    validateDualViewLook(pair);
    const renderers: Partial<Record<DualView, WardrobeCompositor>> = {};
    let committed = false;
    try {
      // Serial preflight bounds peak decode work. Neither live view changes yet.
      for (const source of VIEWS) {
        if (!live(request)) return;
        const renderer = await createWardrobeCompositor(pair.projects[source], {
          signal: request.controller.signal,
        });
        renderers[source] = renderer;
        await validateWardrobeAppearance(renderer, {
          signal: request.controller.signal,
          onProgress: (done, total) => {
            if (live(request))
              setStatus(`检查${viewName(source)} · ${done} / ${total}`);
          },
        });
      }
      if (!live(request)) return;
      const nextPair = {
        ...pair,
        activeView: restoreView ? pair.activeView : viewRef.current,
      };
      const comparisonSources = VIEWS.map((source) => {
        const renderer = renderers[source]!;
        const sha = pair.projects[source].document.sourceSha256;
        let body = calibrations.current.get(sha);
        if (!body) {
          body = calibrateSourceBody(
            renderer.sourceManifest.animations.idle!.frames,
            (id) => renderer.renderSourceFrame(id),
            renderer.padding,
          );
          calibrations.current.set(sha, body);
        }
        return {
          body,
          width: renderer.manifest.spritesheet.frameWidth,
          height: renderer.manifest.spritesheet.frameHeight,
          padding: renderer.padding,
        };
      });
      const next = {
        pair: nextPair,
        renderers: renderers as Session["renderers"],
        ...motionSources(nextPair, renderers as Session["renderers"]),
        comparison: comparisonLayout(comparisonSources),
      };
      for (const source of VIEWS) {
        const preview = nextPair.previews[source];
        next.renderers[source].renderFrame(
          preview.takeoff
            ? gameplayFrameId(preview.takeoff.profile, preview.takeoff.state)
            : next.manifests[source].animations[preview.action]!.frames[
                preview.position
              ],
        );
      }
      const replaced = current.current ?? undefined;
      // Clear only after both replacement renderers and previews validate.
      // Rejected/cancelled imports retain the accepted look's warm surfaces.
      displayFrames.clear();
      remember(next);
      synchronizeClocks(nextPair, next.manifests);
      if (restoreView) callbacks.current.onViewChange(pair.activeView);
      callbacks.current.onCharacterChange(pair.character);
      setPlaying({ original: false, side: false });
      playingRef.current = { original: false, side: false };
      committed = true;
      dispose(replaced);
      setStatus(
        "两个视角已就绪。切换人物素材时，会保留各自的服装、发型与表情。",
      );
    } finally {
      if (!committed)
        for (const renderer of Object.values(renderers)) renderer.dispose();
    }
  }

  async function chooseCharacter(character: DualViewCharacter) {
    const request = begin("正在打开两个视角的服装素材…");
    try {
      const stored = cached.current.get(character);
      if (stored) {
        await prepare(stored, request);
        if (live(request)) setStatus("已恢复这个人物的双视角搭配。");
      } else {
        const pair = await loadDualViewWardrobe(character, {
          signal: request.controller.signal,
        });
        await prepare({ ...pair, motionMode: "single-jump" }, request);
      }
    } catch (failure) {
      failed(request, failure);
    } finally {
      finish(request);
    }
  }
  async function chooseLook(change: Partial<DualViewSelection>) {
    const open = current.current;
    if (!open || busyRef.current) return;
    const request = begin("正在验证两个视角的同款搭配…");
    try {
      const pair = await prepareDualViewLook(
        open.pair,
        { ...open.pair.selection, ...change },
        { signal: request.controller.signal },
      );
      await prepare(pair, request);
    } catch (failure) {
      failed(request, failure);
    } finally {
      finish(request);
    }
  }
  async function chooseAppearance(
    change: Partial<DualViewAppearanceSelection>,
  ) {
    const open = current.current;
    if (!open || busyRef.current) return;
    const request = begin("正在检查两个视角的发型与表情…");
    try {
      const entries = compatiblePairedAppearance(open.pair);
      if (!entries) throw Error("请先选择新款日常服装组，或使用完整日常造型。");
      const description = describeDualViewAppearance(open.pair, entries);
      const selection = {
        ...(description.selection ?? DEFAULT_DUAL_VIEW_APPEARANCE),
        ...change,
      };
      const pair = await prepareDualViewAppearance(
        open.pair,
        selection,
        entries,
        loadPairedAppearanceBank,
        { signal: request.controller.signal },
      );
      await prepare(pair, request);
    } catch (failure) {
      failed(request, failure);
    } finally {
      finish(request);
    }
  }
  async function resetAppearance() {
    const open = current.current;
    if (!open || busyRef.current) return;
    const request = begin("正在恢复两个视角的原片头部…");
    try {
      await prepare(clearDualViewAppearance(open.pair), request);
    } catch (failure) {
      failed(request, failure);
    } finally {
      finish(request);
    }
  }
  async function applyCompleteLook() {
    const open = current.current;
    if (!open || busyRef.current) return;
    const request = begin("正在准备完整日常造型，两个视角都通过后一起应用…");
    try {
      const preferred = "polished-day";
      const look = dualViewOutfit(open.pair.character, preferred);
      // The explicit complete-look action replaces clothing and appearance in
      // a temporary pair. A failure leaves every accepted embedded bank intact.
      let pair = await prepareDualViewLook(
        clearDualViewAppearance(open.pair),
        {
          outfitId: look.id,
          paletteId: open.pair.selection.paletteId,
          topId: look.topId,
          bottomId: look.bottomId,
        },
        { signal: request.controller.signal },
      );
      const entries = compatiblePairedAppearance(pair);
      if (!entries) throw Error("完整造型尚缺对应视角的外观素材。");
      pair = await prepareDualViewAppearance(
        pair,
        {
          hairId: "daily-hair",
          faceId: "gentle",
          hairColor: "chestnut",
        },
        entries,
        loadPairedAppearanceBank,
        { signal: request.controller.signal },
      );
      await prepare(pair, request);
      if (live(request))
        setStatus("已应用完整日常造型。发型、表情和服装可以分别调整。");
    } catch (failure) {
      failed(request, failure);
    } finally {
      finish(request);
    }
  }
  function changePreview(
    change: Partial<DualViewPreview>,
    source = viewRef.current,
  ) {
    const open = current.current;
    if (!open || busyRef.current) return;
    if (change.action && playingRef.current[source] && open.profiles[source]) {
      requestActions(change.action, [source]);
      return;
    }
    const preview = { ...open.pair.previews[source], ...change };
    if (Object.hasOwn(change, "action") || Object.hasOwn(change, "position"))
      delete preview.takeoff;
    const clip = open.manifests[source].animations[preview.action];
    if (!clip || !Number.isSafeInteger(preview.position)) return;
    preview.position = Math.max(
      0,
      Math.min(preview.position, clip.frames.length - 1),
    );
    const pair = {
      ...open.pair,
      previews: { ...open.pair.previews, [source]: preview },
    };
    remember({ ...open, pair });
    if (Object.hasOwn(change, "action") || Object.hasOwn(change, "position")) {
      elapsed.current[source] = (preview.position * 1000) / clip.fps;
      motion.current[source] = {
        ...createGameplayState(preview.action),
        elapsedMs: elapsed.current[source],
      };
    }
    previousTime.current = null;
    setPlaying((previous) => ({ ...previous, [source]: false }));
    playingRef.current = { ...playingRef.current, [source]: false };
  }
  function requestActions(
    action: PortableAnimationName,
    sources = compareRef.current ? VIEWS : [viewRef.current],
    start = false,
  ) {
    if (!current.current || busyRef.current) return;
    const wasPlaying = sources.some((source) => playingRef.current[source]);
    for (const source of sources) {
      const open = current.current!;
      const profile = open.profiles[source];
      if (!open.manifests[source].animations[action]) continue;
      if (profile && (playingRef.current[source] || start)) {
        const previous = motion.current[source];
        const state = requestGameplayAction(previous, action, profile);
        if (
          state.action === previous.action &&
          state.elapsedMs === previous.elapsedMs &&
          state.pending === previous.pending &&
          state.returnAction === previous.returnAction &&
          state.jumpFrom === previous.jumpFrom
        )
          continue;
        motion.current[source] = state;
        elapsed.current[source] = state.elapsedMs;
        const previews = {
          ...open.pair.previews,
          [source]: motionPreview(open.pair.previews[source], state, profile),
        };
        remember({ ...open, pair: { ...open.pair, previews } });
      } else changePreview({ action, position: 0 }, source);
    }
    if (start && sources.some((source) => !playingRef.current[source])) {
      const next = { ...playingRef.current };
      for (const source of sources) next[source] = true;
      playingRef.current = next;
      setPlaying(next);
    }
    if (!wasPlaying) previousTime.current = null;
  }
  function changeMotionMode(mode: GameplayMode) {
    const open = current.current;
    if (!open || busyRef.current || mode === open.pair.motionMode) return;
    try {
      const pair = {
        ...open.pair,
        motionMode: mode,
        previews: Object.fromEntries(
          VIEWS.map((source) => {
            const { takeoff: _takeoff, ...preview } =
              open.pair.previews[source];
            return [source, preview];
          }),
        ) as PairedProject["previews"],
      };
      const nextMotion = motionSources(pair, open.renderers);
      const previews = { ...pair.previews };
      for (const source of VIEWS) {
        const preview = previews[source];
        const profile = open.profiles[source];
        const frameId = profile
          ? gameplayFrameId(profile, motion.current[source])
          : open.manifests[source].animations[preview.action]!.frames[
              preview.position
            ];
        const nextClip =
          nextMotion.manifests[source].animations[preview.action]!;
        previews[source] = {
          ...preview,
          position: Math.max(0, nextClip.frames.indexOf(frameId)),
        };
      }
      pair.previews = previews;
      synchronizeClocks(pair, nextMotion.manifests);
      playingRef.current = { original: false, side: false };
      setPlaying(playingRef.current);
      remember({ ...open, ...nextMotion, pair });
      setStatus(
        mode === "single-jump"
          ? "已切换为单次跳跃。播放中可直接切动作，落地后接回走路或跑步。"
          : "已切换为原片对照，侧视包含原视频的连续两跳。",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  function playSources(sources: DualView[], play?: boolean) {
    const open = current.current;
    if (!open || busyRef.current) return;
    const shouldPlay =
      play ?? !sources.some((source) => playingRef.current[source]);
    for (const source of sources) {
      const preview = current.current!.pair.previews[source];
      const clip = open.manifests[source].animations[preview.action]!;
      if (
        shouldPlay &&
        !clip.loop &&
        preview.position === clip.frames.length - 1 &&
        // The final jump pose still has one authored tick to play. Resuming it
        // must complete landing and return, never invent a second takeoff.
        (!open.profiles[source] ||
          (preview.action !== "jump" &&
            motion.current[source].elapsedMs >=
              (clip.frames.length * 1000) / clip.fps))
      )
        changePreview({ position: 0 }, source);
    }
    const next = { ...playingRef.current };
    for (const source of sources) next[source] = shouldPlay;
    playingRef.current = next;
    setPlaying(next);
    previousTime.current = null;
  }

  async function reopen(file: File) {
    const request = begin("正在校验双视角项目…");
    try {
      if (file.size > 256 * 1024 * 1024)
        throw Error("双视角项目不能超过 256 MiB。");
      const pair = await importDualViewWardrobe(
        new Uint8Array(await file.arrayBuffer()),
        { signal: request.controller.signal },
      );
      await prepare(pair, request, true);
    } catch (failure) {
      failed(request, failure);
    } finally {
      finish(request);
    }
  }
  async function save(kind: ExportKind) {
    const open = current.current;
    if (!open || busyRef.current) return;
    const source = viewRef.current;
    const preview = open.pair.previews[source];
    const request = begin(
      kind === "project"
        ? "正在保存两个视角的完整项目…"
        : "正在生成当前视角的导出…",
    );
    try {
      const { projects, ...settings } = open.pair;
      const previews = { ...settings.previews };
      for (const view of VIEWS) {
        const profile = open.profiles[view];
        if (profile)
          previews[view] = motionPreview(
            previews[view],
            motion.current[view],
            profile,
          );
      }
      const pair = createDualViewWardrobe(projects, {
        ...settings,
        previews,
        activeView: source,
      });
      const project = updateWardrobePreview(pair.projects[source], {
        action: preview.action,
        facing: preview.facing,
      });
      const renderer = open.renderers[source];
      const profile = open.profiles[source];
      const prefix = `kling-${pair.character}-${source}`;
      let bytes: Uint8Array;
      let name: string;
      let mime = "application/zip";
      if (kind === "project") {
        bytes = await exportDualViewWardrobe(pair, {
          signal: request.controller.signal,
        });
        name = `kling-${pair.character}-dual-view.wardrobe.zip`;
      } else if (kind === "native-project") {
        bytes = await exportWardrobeProject(project);
        name = `${prefix}.wardrobe.zip`;
      } else if (kind === "pack") {
        bytes = await exportWardrobeCharacterPack(project, {
          gameplayMotion: profile ?? undefined,
          // The polish revises side assets only. Keep the unchanged original
          // pack's collection name (and bytes) stable across this explicit upgrade.
          name: `Kling ${pair.character} · ${viewName(source)} · ${
            dualViewOutfit(
              pair.character,
              source === "original" &&
                pair.selection.outfitId === "polished-day"
                ? pair.character === "male"
                  ? "tailored-day"
                  : "complete-day"
                : pair.selection.outfitId,
            ).name
          }`,
          onProgress: ({ completedPages, totalPages }) => {
            if (live(request))
              setStatus(`正在导出角色包 · ${completedPages} / ${totalPages}`);
          },
        });
        name = `${prefix}.character.zip`;
      } else if (kind === "gif") {
        bytes = await exportWardrobeActionGif(
          renderer,
          preview.action,
          preview.facing,
          {
            signal: request.controller.signal,
            gameplayMotion: profile ?? undefined,
          },
        );
        name = `${prefix}-${preview.action}-${preview.facing}.gif`;
        mime = "image/gif";
      } else if (kind === "flow-gif") {
        if (!profile) throw Error("请先选择单次跳跃，再导出跑跳衔接。");
        bytes = await exportWardrobeRunJumpGif(
          renderer,
          profile,
          preview.facing,
          { signal: request.controller.signal },
        );
        name = `${prefix}-run-jump-run-${preview.facing}.gif`;
        mime = "image/gif";
      } else {
        const id = profile
          ? gameplayFrameId(profile, motion.current[source])
          : open.manifests[source].animations[preview.action]!.frames[
              preview.position
            ];
        const image = renderer.renderFrame(id);
        bytes = encodeSourceRgbaPng(
          preview.facing === "left" ? mirror(image) : image,
        );
        name = `${prefix}-${preview.action}-${preview.facing}-${id}.png`;
        mime = "image/png";
      }
      if (!live(request)) return;
      download(bytes, name, mime);
      setStatus(
        kind === "project"
          ? "已发起双视角项目下载，重新打开可继续换装。"
          : kind === "native-project"
            ? "已下载当前视角换装素材。单次跳跃设置保存在双视角项目中。"
            : profile
              ? "已发起当前视角下载，保留原始画面，使用单次跳跃与原帧播放节奏。"
              : "已发起当前视角下载，原始帧与动作时长保持不变。",
      );
    } catch (failure) {
      failed(request, failure);
    } finally {
      finish(request);
    }
  }

  useEffect(() => {
    alive.current = true;
    void chooseCharacter(initialCharacter);
    return () => {
      alive.current = false;
      serial.current++;
      operation.current?.controller.abort();
      displayFrames.clear();
      dispose(current.current ?? undefined);
      cached.current.clear();
      current.current = null;
    };
  }, [initialCharacter]);

  useEffect(() => {
    // A hidden tab may suspend RAF before a hidden tick is delivered. Reset
    // at both boundaries so hidden wall time never skips takeoff or landing.
    const resetClock = () => {
      previousTime.current = null;
    };
    document.addEventListener("visibilitychange", resetClock);
    return () => document.removeEventListener("visibilitychange", resetClock);
  }, []);

  useEffect(() => {
    previousTime.current = null;
    const open = current.current;
    if (open && open.pair.activeView !== view)
      remember({ ...open, pair: { ...open.pair, activeView: view } });
  }, [view, active]);

  useLayoutEffect(() => {
    const open = current.current;
    if (!active || !open) return;
    try {
      // A React commit may follow another clock tick. Read the same accepted
      // session as the live approach state so labels and native pixels agree.
      for (const source of comparing ? VIEWS : [view]) paint(open, source);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [active, session, view, playing, comparing]);

  useEffect(() => {
    if (!active) return;
    function keydown(event: KeyboardEvent) {
      if (
        event.code !== "Space" ||
        !activeRef.current ||
        busyRef.current ||
        current.current?.pair.motionMode !== "single-jump" ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "input, select, textarea, button, [contenteditable=true]",
          ))
      )
        return;
      event.preventDefault();
      if (!event.repeat) requestActions("jump", undefined, true);
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    previousTime.current = null;
    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (!activeRef.current || document.hidden || busyRef.current) {
        previousTime.current = null;
        return;
      }
      const open = current.current;
      if (!open) return;
      const delta =
        previousTime.current === null ? 0 : now - previousTime.current;
      previousTime.current = now;
      let previews = open.pair.previews;
      let nextPlaying = playingRef.current;
      for (const source of compareRef.current ? VIEWS : [viewRef.current]) {
        if (!playingRef.current[source]) continue;
        const preview = previews[source];
        const profile = open.profiles[source];
        if (profile) {
          const before = motion.current[source];
          const previousFrame = gameplayFrameId(profile, before);
          const state = advanceGameplayMotion(
            profile,
            motion.current[source],
            delta,
          );
          motion.current[source] = state;
          elapsed.current[source] = state.elapsedMs;
          const position = motionPosition(state, profile);
          const actionClip = profile.actions[state.action]!;
          if (
            !actionClip.loop &&
            state.action !== "jump" &&
            state.elapsedMs >=
              (actionClip.frames.length * 1000) / actionClip.fps
          )
            nextPlaying = { ...nextPlaying, [source]: false };
          if (
            state.action !== preview.action ||
            position !== preview.position ||
            gameplayFrameId(profile, state) !== previousFrame ||
            !!state.leadIn !== !!before.leadIn
          )
            previews = {
              ...previews,
              [source]: motionPreview(preview, state, profile),
            };
          continue;
        }
        const clip = open.manifests[source].animations[preview.action]!;
        const next = advanceNativeClock(elapsed.current[source], delta, clip);
        elapsed.current[source] = next.elapsed;
        if (next.finished) nextPlaying = { ...nextPlaying, [source]: false };
        if (next.position !== preview.position)
          previews = {
            ...previews,
            [source]: { ...preview, position: next.position },
          };
      }
      if (nextPlaying !== playingRef.current) {
        playingRef.current = nextPlaying;
        setPlaying(nextPlaying);
      }
      if (previews !== open.pair.previews)
        remember({ ...open, pair: { ...open.pair, previews } });
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      previousTime.current = null;
    };
  }, [active, view, comparing]);

  const preview = session?.pair.previews[view];
  const renderer = session?.renderers[view];
  const clip = preview && session?.manifests[view].animations[preview.action];
  const locked = busy || !session;
  const character = session?.pair.character ?? initialCharacter;
  const outfit = dualViewOutfit(
    character,
    session?.pair.selection.outfitId ?? DUAL_OUTFIT.id,
  );
  const outfits = availableDualViewOutfits(character);
  const headCatalog = pairedAppearanceCatalog(character);
  const headEntries = session ? compatiblePairedAppearance(session.pair) : null;
  const head =
    session && headCatalog
      ? describeDualViewAppearance(session.pair, headEntries ?? headCatalog)
      : null;
  const headChoice = head?.selection ?? DEFAULT_DUAL_VIEW_APPEARANCE;
  const hasHeadBank =
    !!session &&
    VIEWS.some((source) => !!session.pair.projects[source].appearanceBank);
  const needsHeadRevision =
    !!session &&
    !!headCatalog &&
    VIEWS.some(
      (source) =>
        !!session.pair.projects[source].appearanceBank &&
        session.pair.projects[source].document.registrationSha256 !==
          headCatalog[source].registrationSha256,
    );
  const headLocked = locked || !headEntries;
  return (
    <section
      className="dual-wardrobe"
      data-testid="dual-wardrobe"
      aria-busy={busy}
      aria-label="双视角衣橱"
    >
      <header className="dual-heading">
        <div>
          <p className="dual-eyebrow">ONE LOOK · TWO VIEWS</p>
          <h2>同一套搭配，两个视角</h2>
          <p>搭配服装、发型与表情。两个视角使用各自绘制的素材和原片动作。</p>
        </div>
        <div className="dual-project-tools">
          <button
            disabled={busy}
            data-testid="dual-open-project"
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen size={16} />
            打开双视角项目
          </button>
          <button
            disabled={locked}
            data-testid="dual-save-project"
            onClick={() => void save("project")}
          >
            <Save size={16} />
            保存双视角项目
          </button>
          <input
            hidden
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            data-testid="dual-project-input"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file && !busyRef.current) void reopen(file);
            }}
          />
        </div>
      </header>
      <div
        className={`dual-layout${comparing ? " dual-layout-comparing" : ""}`}
      >
        <div className="dual-preview">
          <div className="dual-preview-mode">
            <button
              data-testid="dual-compare-toggle"
              aria-pressed={comparing}
              disabled={locked}
              onClick={() => {
                previousTime.current = null;
                setComparing(!comparing);
              }}
            >
              {comparing ? "返回单视角" : "并排比较两个视角"}
            </button>
            <span className="dual-note">
              {comparing
                ? "以原片站姿身高对齐，保留各自动作节奏。"
                : "打开并排比较，检查同款搭配。"}
            </span>
          </div>
          <div className="dual-motion-tools" aria-label="跳跃与动作衔接">
            <label>
              动作模式
              <select
                data-testid="dual-motion-mode"
                disabled={locked}
                value={session?.pair.motionMode ?? "single-jump"}
                onChange={(event) =>
                  changeMotionMode(event.target.value as GameplayMode)
                }
              >
                <option value="single-jump">单次跳跃 · 落地接回动作</option>
                <option value="source">原片对照 · 保留完整动作</option>
              </select>
            </label>
            {session?.pair.motionMode === "single-jump" && (
              <>
                <div className="dual-motion-buttons">
                  <button
                    data-testid="dual-idle"
                    disabled={locked}
                    onClick={() => requestActions("idle", undefined, true)}
                  >
                    站稳
                  </button>
                  <button
                    data-testid="dual-walk"
                    disabled={locked}
                    onClick={() => requestActions("walk", undefined, true)}
                  >
                    走路
                  </button>
                  <button
                    data-testid="dual-run"
                    disabled={locked}
                    onClick={() => requestActions("run", undefined, true)}
                  >
                    跑步
                  </button>
                  <button
                    data-testid="dual-jump-once"
                    disabled={locked}
                    onClick={() => requestActions("jump", undefined, true)}
                  >
                    跳一次
                  </button>
                </div>
                <p className="dual-note" data-testid="dual-motion-help">
                  跑步中点“跳一次”，落地后继续跑步。跳跃过程中可选择落地后的动作；重复点击不会重新起跳。聚焦预览后也可按空格跳跃。
                </p>
                <p
                  className="dual-motion-status"
                  data-testid="dual-motion-status"
                >
                  {(comparing ? VIEWS : [view])
                    .map((source) => {
                      const state = motion.current[source];
                      const label = (action: PortableAnimationName) =>
                        ACTIONS.find(([id]) => id === action)?.[1] ?? action;
                      return `${comparing ? `${source === "original" ? "原版" : "侧视"}：` : ""}${leadInLabel(state) ?? label(state.action)}${state.pending ? ` → ${label(state.pending)}${state.action === "jump" ? "（落地后）" : ""}` : state.action === "jump" ? ` → ${label(state.returnAction)}（落地后）` : ""}`;
                    })
                    .join(" · ")}
                </p>
              </>
            )}
          </div>
          {comparing ? (
            <>
              <div
                className="dual-comparison-toolbar"
                aria-label="两个视角的播放控制"
              >
                <button
                  data-testid="dual-compare-play-all"
                  disabled={locked}
                  onClick={() => playSources(VIEWS)}
                >
                  {VIEWS.some((source) => playing[source]) ? (
                    <Pause size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                  {VIEWS.some((source) => playing[source])
                    ? "全部暂停"
                    : "一起播放"}
                </button>
                <label>
                  两边动作
                  <select
                    data-testid="dual-compare-action"
                    disabled={locked}
                    value={
                      session &&
                      (motion.current.original.pending ??
                        session.pair.previews.original.action) ===
                        (motion.current.side.pending ??
                          session.pair.previews.side.action)
                        ? (motion.current.original.pending ??
                          session.pair.previews.original.action)
                        : ""
                    }
                    onChange={(event) => {
                      for (const source of VIEWS)
                        changePreview(
                          {
                            action: event.target.value as PortableAnimationName,
                            position: 0,
                          },
                          source,
                        );
                    }}
                  >
                    <option value="" disabled>
                      分别设置
                    </option>
                    {ACTIONS.filter(([id]) =>
                      VIEWS.every(
                        (source) => session?.manifests[source].animations[id],
                      ),
                    ).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  两边朝向
                  <select
                    data-testid="dual-compare-facing"
                    disabled={locked}
                    value={
                      session &&
                      session.pair.previews.original.facing ===
                        session.pair.previews.side.facing
                        ? session.pair.previews.original.facing
                        : ""
                    }
                    onChange={(event) => {
                      for (const source of VIEWS)
                        changePreview(
                          { facing: event.target.value as Facing },
                          source,
                        );
                    }}
                  >
                    <option value="" disabled>
                      分别设置
                    </option>
                    <option value="right">朝右</option>
                    <option value="left">朝左</option>
                  </select>
                </label>
              </div>
              <div className="dual-comparison-grid">
                {VIEWS.map((source) => {
                  const nativePreview = session?.pair.previews[source];
                  const nativeClip =
                    nativePreview &&
                    session?.manifests[source].animations[nativePreview.action];
                  return (
                    <section
                      key={source}
                      className="dual-comparison-panel"
                      aria-label={viewName(source)}
                    >
                      <div className="dual-stage-card">
                        <div className="dual-stage-label">
                          <strong>{viewName(source)}</strong>
                          <span>{playing[source] ? "播放中" : "已暂停"}</span>
                        </div>
                        <canvas
                          ref={(element) => {
                            compareCanvases.current[source] = element;
                          }}
                          width={session?.comparison.width ?? 512}
                          height={session?.comparison.height ?? 768}
                          data-testid={`dual-compare-stage-${source}`}
                          aria-label={`${viewName(source)}人物预览`}
                          tabIndex={0}
                        />
                      </div>
                      <div className="dual-transport">
                        <button
                          data-testid={`dual-compare-play-${source}`}
                          disabled={locked}
                          aria-label={`${playing[source] ? "暂停" : "播放"}${viewName(source)}`}
                          onClick={() => playSources([source])}
                        >
                          {playing[source] ? (
                            <Pause size={15} />
                          ) : (
                            <Play size={15} />
                          )}
                          {playing[source] ? "暂停" : "播放"}
                        </button>
                        <label>
                          动作
                          <select
                            data-testid={`dual-compare-action-${source}`}
                            disabled={locked}
                            value={
                              motion.current[source].pending ??
                              nativePreview?.action ??
                              "idle"
                            }
                            onChange={(event) =>
                              changePreview(
                                {
                                  action: event.target
                                    .value as PortableAnimationName,
                                  position: 0,
                                },
                                source,
                              )
                            }
                          >
                            {ACTIONS.map(([id, name]) => (
                              <option
                                key={id}
                                value={id}
                                disabled={
                                  !session?.manifests[source].animations[id]
                                }
                              >
                                {name}
                                {source === "side" && id === "celebrate"
                                  ? "（无素材）"
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          朝向
                          <select
                            data-testid={`dual-compare-facing-${source}`}
                            disabled={locked}
                            value={nativePreview?.facing ?? "right"}
                            onChange={(event) =>
                              changePreview(
                                { facing: event.target.value as Facing },
                                source,
                              )
                            }
                          >
                            <option value="right">朝右</option>
                            <option value="left">朝左</option>
                          </select>
                        </label>
                      </div>
                      <label className="dual-frame-control">
                        {viewName(source)} ·{" "}
                        {leadInLabel(motion.current[source]) ??
                          `第 ${nativePreview ? nativePreview.position + 1 : 0} / ${nativeClip?.frames.length ?? 0} 帧`}
                        <input
                          type="range"
                          data-testid={`dual-compare-frame-${source}`}
                          min={0}
                          max={Math.max(
                            0,
                            (nativeClip?.frames.length ?? 1) - 1,
                          )}
                          value={nativePreview?.position ?? 0}
                          disabled={locked}
                          onChange={(event) =>
                            changePreview(
                              { position: Number(event.target.value) },
                              source,
                            )
                          }
                        />
                      </label>
                      <div className="dual-frame-steps">
                        <button
                          data-testid={`dual-compare-previous-${source}`}
                          disabled={locked || !nativePreview?.position}
                          onClick={() =>
                            changePreview(
                              { position: (nativePreview?.position ?? 0) - 1 },
                              source,
                            )
                          }
                        >
                          上一帧
                        </button>
                        <button
                          data-testid={`dual-compare-next-${source}`}
                          disabled={
                            locked ||
                            nativePreview?.position ===
                              (nativeClip?.frames.length ?? 1) - 1
                          }
                          onClick={() =>
                            changePreview(
                              { position: (nativePreview?.position ?? 0) + 1 },
                              source,
                            )
                          }
                        >
                          下一帧
                        </button>
                        <span className="dual-note">
                          {nativeClip?.fps ?? "—"} 帧 / 秒 ·{" "}
                          {nativeClip?.loop
                            ? "循环"
                            : session?.profiles[source] &&
                                nativePreview?.action === "jump"
                              ? "单次 · 落地接回动作"
                              : "播完停止"}
                        </span>
                      </div>
                    </section>
                  );
                })}
              </div>
              <p className="dual-note">
                两边按各自原片的节奏播放，步伐相位可能不同。
                {session?.pair.motionMode === "single-jump"
                  ? "每次跳跃都完成一次起跳和落地，再接回选择的动作。"
                  : "原片对照保留侧视连续两跳，播完停止。"}
                庆祝仅原版有素材。
              </p>
            </>
          ) : (
            <>
              <div className="dual-stage-card">
                <div className="dual-stage-label">
                  <strong>{viewName(view)}</strong>
                  <span>
                    {renderer
                      ? `${renderer.manifest.spritesheet.frameWidth} × ${renderer.manifest.spritesheet.frameHeight}`
                      : "原生画面"}
                  </span>
                </div>
                <canvas
                  ref={canvas}
                  width={704}
                  height={1056}
                  data-testid="dual-stage"
                  aria-label="双视角人物预览"
                  tabIndex={0}
                />
                {!session && (
                  <p className="dual-empty">
                    {busy
                      ? "正在准备两个视角…"
                      : "打开一组双视角素材开始搭配。"}
                  </p>
                )}
              </div>
              <div className="dual-transport">
                <button
                  disabled={locked}
                  data-testid="dual-play-pause"
                  aria-label={playing[view] ? "暂停播放" : "播放动作"}
                  onClick={() => playSources([view])}
                >
                  {playing[view] ? <Pause size={16} /> : <Play size={16} />}
                  {playing[view] ? "暂停" : "播放"}
                </button>
                <label>
                  动作
                  <select
                    data-testid="dual-action"
                    value={
                      motion.current[view].pending ?? preview?.action ?? "idle"
                    }
                    disabled={locked}
                    onChange={(event) =>
                      changePreview({
                        action: event.target.value as PortableAnimationName,
                        position: 0,
                      })
                    }
                  >
                    {ACTIONS.map(([id, name]) => (
                      <option
                        key={id}
                        value={id}
                        disabled={!session?.manifests[view].animations[id]}
                      >
                        {name}
                        {view === "side" && id === "celebrate"
                          ? "（仅原版支持）"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  朝向
                  <select
                    data-testid="dual-facing"
                    value={preview?.facing ?? "right"}
                    disabled={locked}
                    onChange={(event) =>
                      changePreview({ facing: event.target.value as Facing })
                    }
                  >
                    <option value="right">朝右</option>
                    <option value="left">朝左</option>
                  </select>
                </label>
              </div>
              <label className="dual-frame-control">
                {motion.current[view].leadIn
                  ? `${leadInLabel(motion.current[view])} · 可继续播放或选择基础动作帧`
                  : `当前动作帧 ${preview ? preview.position + 1 : 0} / ${clip?.frames.length ?? 0}`}
                <input
                  data-testid="dual-frame"
                  type="range"
                  min={0}
                  max={Math.max(0, (clip?.frames.length ?? 1) - 1)}
                  value={preview?.position ?? 0}
                  disabled={locked}
                  onChange={(event) =>
                    changePreview({ position: Number(event.target.value) })
                  }
                />
              </label>
              <p className="dual-note">
                每个视角分别保留动作与帧位。
                {session?.pair.motionMode === "single-jump"
                  ? "单次跳跃保留完整起跳、腾空与落地，播放中切换动作会完成衔接。"
                  : view === "side"
                    ? "侧视原片保留连续两跳，播完停止；没有庆祝素材。"
                    : "原版保留待机、走路、跑步、跳跃和庆祝。"}
              </p>
            </>
          )}
        </div>
        <aside className="dual-controls" aria-label="共用人物造型选择">
          <h3>完整人物造型</h3>
          <label>
            人物
            <select
              data-testid="dual-character"
              disabled={busy}
              value={session?.pair.character ?? initialCharacter}
              onChange={(event) =>
                void chooseCharacter(event.target.value as DualViewCharacter)
              }
            >
              <option value="male">Kling 男版</option>
              <option value="female">Kling 女版</option>
            </select>
          </label>
          <button
            className="dual-complete-look"
            data-testid="dual-complete-look"
            disabled={
              locked ||
              !headCatalog?.original.faceId ||
              !headCatalog?.side.faceId
            }
            onClick={() => void applyCompleteLook()}
          >
            应用完整日常造型
          </button>
          <p className="dual-note">
            一起换上新款服装、栗棕发型和柔和微笑，保留当前服装配色。
          </p>
          <fieldset className="dual-appearance">
            <legend>头发与表情</legend>
            <label>
              发型
              <select
                data-testid="dual-hair"
                disabled={headLocked || head?.status === "custom"}
                value={
                  head?.status === "custom"
                    ? "custom"
                    : (headChoice.hairId ?? "")
                }
                onChange={(event) =>
                  void chooseAppearance({
                    hairId: event.target.value ? "daily-hair" : null,
                  })
                }
              >
                {head?.status === "custom" && (
                  <option value="custom" disabled>
                    工程中保存的发型
                  </option>
                )}
                <option value="">原片发型</option>
                <option value="daily-hair">
                  {character === "male" ? "柔软侧分短发" : "轻盈短波波"}
                </option>
              </select>
            </label>
            <label>
              发色
              <select
                data-testid="dual-hair-color"
                disabled={
                  headLocked || !headChoice.hairId || head?.status === "custom"
                }
                value={
                  head?.status === "custom" ? "custom" : headChoice.hairColor
                }
                onChange={(event) =>
                  void chooseAppearance({
                    hairColor: event.target
                      .value as DualViewAppearanceSelection["hairColor"],
                  })
                }
              >
                {head?.status === "custom" && (
                  <option value="custom" disabled>
                    工程中保存的发色
                  </option>
                )}
                {APPEARANCE_HAIR_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {
                      { chestnut: "栗棕", espresso: "深棕", copper: "铜棕" }[
                        color
                      ]
                    }
                  </option>
                ))}
              </select>
            </label>
            <label>
              表情
              <select
                data-testid="dual-face"
                disabled={headLocked || head?.status === "custom"}
                value={
                  head?.status === "custom"
                    ? "custom"
                    : (headChoice.faceId ?? "")
                }
                onChange={(event) =>
                  void chooseAppearance({
                    faceId: event.target.value ? "gentle" : null,
                  })
                }
              >
                {head?.status === "custom" && (
                  <option value="custom" disabled>
                    工程中保存的表情
                  </option>
                )}
                <option value="">自然 · 保留原片</option>
                <option
                  value="gentle"
                  disabled={
                    !headEntries?.original.faceId || !headEntries?.side.faceId
                  }
                >
                  柔和微笑
                </option>
              </select>
            </label>
            {head?.status === "custom" && headEntries && (
              <button
                data-testid="dual-use-paired-appearance"
                disabled={locked}
                onClick={() =>
                  void chooseAppearance({
                    hairId: "daily-hair",
                    faceId: "gentle",
                    hairColor: "chestnut",
                  })
                }
              >
                替换为配对发型与表情
              </button>
            )}
            <button
              data-testid="dual-reset-appearance"
              disabled={locked || !hasHeadBank}
              onClick={() => void resetAppearance()}
            >
              恢复原片头部
            </button>
            <p className="dual-note" data-testid="dual-appearance-note">
              {head?.status === "custom"
                ? `${head.message} ${headEntries ? "选择“替换为配对发型与表情”后，才会替换两边保存的外观。" : "可使用完整日常造型一起更换服装与外观，或恢复原片头部。"}`
                : !headEntries
                  ? "这组旧服装保留原来的外观。使用完整日常造型可一起切换到新款服装与发型。"
                  : "两种视角使用各自的发型和表情素材。原片眨眼、笑容变化和动作节奏仍保留。"}
            </p>
          </fieldset>
          <h3>服装搭配</h3>
          <label>
            服装组
            <select
              data-testid="dual-outfit"
              disabled={locked}
              value={outfit.id}
              onChange={(event) => {
                const selected = dualViewOutfit(character, event.target.value);
                void chooseLook({
                  outfitId: selected.id,
                  topId: selected.topId,
                  bottomId: selected.bottomId,
                });
              }}
            >
              {outfits.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p className="dual-note">
            更换服装组会选择该套装的上装与下装，配色保持不变。
          </p>
          {needsHeadRevision && (
            <p className="dual-note" data-testid="dual-revision-help">
              当前工程保留旧版头部。切换接缝修订款时，请点击“应用完整日常造型”，一起更新服装、发型与表情；也可以先“恢复原片头部”，再单独更换服装。
            </p>
          )}
          <label>
            配色
            <select
              data-testid="dual-palette"
              disabled={locked}
              value={session?.pair.selection.paletteId ?? "sea"}
              onChange={(event) =>
                void chooseLook({ paletteId: event.target.value })
              }
            >
              {DUAL_PALETTES.map((palette) => (
                <option key={palette.id} value={palette.id}>
                  {palette.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            上装
            <select
              data-testid="dual-top"
              disabled={locked}
              value={session?.pair.selection.topId ?? ""}
              onChange={(event) =>
                void chooseLook({ topId: event.target.value || null })
              }
            >
              <option value="">原片上装</option>
              {outfit.tops.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            下装
            <select
              data-testid="dual-bottom"
              disabled={locked}
              value={session?.pair.selection.bottomId ?? ""}
              onChange={(event) =>
                void chooseLook({ bottomId: event.target.value || null })
              }
            >
              <option value="">原片短裤</option>
              {outfit.bottoms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <p className="dual-note">
            {outfit.id !== "cotton-day"
              ? "可与原片上装、短裤混搭；彩色棉质款使用独立服装组。"
              : "上装、下装可分别保留原片。"}
            此处只展示已经制作双视角版本的款式；原有完整衣橱仍可使用。
          </p>
          <div className="dual-exports">
            <h3>导出当前视角</h3>
            {comparing && (
              <label>
                导出视角
                <select
                  data-testid="dual-export-view"
                  value={view}
                  disabled={locked}
                  onChange={(event) =>
                    callbacks.current.onViewChange(
                      event.target.value as DualView,
                    )
                  }
                >
                  <option value="original">原版 · 三分之四视角</option>
                  <option value="side">侧视 · 横版动作</option>
                </select>
              </label>
            )}
            {comparing && (
              <p className="dual-note">
                导出保留所选视角的原生尺寸与动作。并排对齐只用于此处预览。
              </p>
            )}
            <button
              disabled={locked}
              data-testid="dual-export-png"
              onClick={() => void save("png")}
            >
              <Download size={15} />
              当前帧 PNG
            </button>
            <button
              disabled={locked}
              data-testid="dual-export-gif"
              onClick={() => void save("gif")}
            >
              <Download size={15} />
              当前动作 GIF
            </button>
            <button
              disabled={locked || !session?.profiles[view]}
              data-testid="dual-export-run-jump-gif"
              onClick={() => void save("flow-gif")}
            >
              <Download size={15} />
              跑步 → 单次跳跃 → 跑步 GIF
            </button>
            <button
              disabled={locked}
              data-testid="dual-export-pack"
              onClick={() => void save("pack")}
            >
              <Download size={15} />
              CharacterPack
            </button>
            <button
              disabled={locked}
              data-testid="dual-export-native-project"
              onClick={() => void save("native-project")}
            >
              <Download size={15} />
              当前视角换装项目
            </button>
            <p className="dual-note">
              CharacterPack
              可在独立播放器中打开，并保留所选动作模式。继续编辑两边搭配及单次跳跃设置，请保存双视角项目。
            </p>
          </div>
        </aside>
      </div>
      <div className="dual-feedback">
        <p role="status" data-testid="dual-status">
          {status}
        </p>
        {busy && (
          <button data-testid="dual-cancel" onClick={cancel}>
            取消本次操作
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        {!busy && !session && (
          <button
            data-testid="dual-retry"
            onClick={() => void chooseCharacter(initialCharacter)}
          >
            重新载入
          </button>
        )}
      </div>
    </section>
  );
}
