import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, FolderOpen, Pause, Play, Save } from "lucide-react";
import type { Facing, PortableAnimationName } from "../core/types";
import { encodeSourceRgbaPng, type RgbaPng } from "../core/baked-source";
import {
  createWardrobeCompositor,
  exportWardrobeCharacterPack,
  validateWardrobeAppearance,
  type WardrobeCompositor,
} from "./compositor";
import { exportWardrobeActionGif } from "./action-gif";
import { exportWardrobeProject, updateWardrobePreview } from "./project";
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
};
type Operation = { token: number; controller: AbortController };
type ExportKind = "project" | "native-project" | "png" | "gif" | "pack";

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
  const canvas = useRef<HTMLCanvasElement>(null);
  const sourceCanvas = useRef<HTMLCanvasElement | null>(null);
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
  const previousTime = useRef<number | null>(null);
  const callbacks = useRef({ onViewChange, onCharacterChange });
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
  function synchronizeClocks(pair: PairedProject) {
    for (const source of VIEWS) {
      const preview = pair.previews[source];
      const clip =
        pair.projects[source].archive.manifest.animations[preview.action]!;
      elapsed.current[source] = (preview.position * 1000) / clip.fps;
    }
    previousTime.current = null;
  }
  function paint(open: Session, source: DualView) {
    const target = canvas.current;
    if (!target || !activeRef.current) return;
    const preview = open.pair.previews[source];
    const renderer = open.renderers[source];
    const clip = renderer.manifest.animations[preview.action];
    const id = clip?.frames[preview.position];
    if (id === undefined) throw Error("当前动作没有可显示的原始帧。");
    const image = renderer.renderFrame(id);
    if (target.width !== image.width) target.width = image.width;
    if (target.height !== image.height) target.height = image.height;
    const sourceTarget = (sourceCanvas.current ??=
      document.createElement("canvas"));
    if (sourceTarget.width !== image.width) sourceTarget.width = image.width;
    if (sourceTarget.height !== image.height)
      sourceTarget.height = image.height;
    sourceTarget
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
    const context = target.getContext("2d")!;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, target.width, target.height);
    context.save();
    if (preview.facing === "left") {
      context.translate(target.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(sourceTarget, 0, 0);
    context.restore();
    Object.assign(target.dataset, {
      view: source,
      character: open.pair.character,
      outfit: open.pair.selection.outfitId,
      palette: open.pair.selection.paletteId,
      top: open.pair.selection.topId ?? "original",
      bottom: open.pair.selection.bottomId ?? "original",
      action: preview.action,
      framePosition: String(preview.position),
      frameId: String(id),
      facing: preview.facing,
      paused: String(!playingRef.current[source]),
      frameWidth: String(image.width),
      frameHeight: String(image.height),
      fps: String(clip!.fps),
      frameCount: String(clip!.frames.length),
      sourceSha: open.pair.projects[source].document.sourceSha256,
      registrationSha: open.pair.projects[source].document.registrationSha256,
    });
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
        const preview = pair.previews[source];
        renderer.renderFrame(
          renderer.manifest.animations[preview.action]!.frames[
            preview.position
          ],
        );
      }
      if (!live(request)) return;
      const nextPair = {
        ...pair,
        activeView: restoreView ? pair.activeView : viewRef.current,
      };
      const next = {
        pair: nextPair,
        renderers: renderers as Session["renderers"],
      };
      const replaced = current.current ?? undefined;
      remember(next);
      synchronizeClocks(nextPair);
      if (restoreView) callbacks.current.onViewChange(pair.activeView);
      callbacks.current.onCharacterChange(pair.character);
      setPlaying({ original: false, side: false });
      playingRef.current = { original: false, side: false };
      committed = true;
      dispose(replaced);
      setStatus("两个视角已就绪。切换人物素材时，会保持同款服装与配色。");
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
        await prepare(pair, request);
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
  function changePreview(change: Partial<DualViewPreview>) {
    const open = current.current;
    if (!open || busyRef.current) return;
    const source = viewRef.current;
    const preview = { ...open.pair.previews[source], ...change };
    const clip = open.renderers[source].manifest.animations[preview.action];
    if (!clip || !Number.isSafeInteger(preview.position)) return;
    preview.position = Math.max(
      0,
      Math.min(preview.position, clip.frames.length - 1),
    );
    const pair = {
      ...open.pair,
      activeView: source,
      previews: { ...open.pair.previews, [source]: preview },
    };
    remember({ ...open, pair });
    elapsed.current[source] = (preview.position * 1000) / clip.fps;
    previousTime.current = null;
    setPlaying((previous) => ({ ...previous, [source]: false }));
    playingRef.current = { ...playingRef.current, [source]: false };
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
      const pair = createDualViewWardrobe(projects, {
        ...settings,
        activeView: source,
      });
      const project = updateWardrobePreview(pair.projects[source], {
        action: preview.action,
        facing: preview.facing,
      });
      const renderer = open.renderers[source];
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
          name: `Kling ${pair.character} · ${viewName(source)} · ${dualViewOutfit(pair.character, pair.selection.outfitId).name}`,
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
          { signal: request.controller.signal },
        );
        name = `${prefix}-${preview.action}-${preview.facing}.gif`;
        mime = "image/gif";
      } else {
        const id =
          renderer.manifest.animations[preview.action]!.frames[
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
      dispose(current.current ?? undefined);
      cached.current.clear();
      current.current = null;
    };
  }, [initialCharacter]);

  useEffect(() => {
    previousTime.current = null;
    const open = current.current;
    if (open && open.pair.activeView !== view)
      remember({ ...open, pair: { ...open.pair, activeView: view } });
  }, [view, active]);

  useLayoutEffect(() => {
    if (!active || !session) return;
    try {
      paint(session, view);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, [active, session, view, playing]);

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
      const source = viewRef.current;
      const delta =
        previousTime.current === null ? 0 : now - previousTime.current;
      previousTime.current = now;
      if (!playingRef.current[source]) return;
      const preview = open.pair.previews[source];
      const clip = open.renderers[source].manifest.animations[preview.action]!;
      const duration = (clip.frames.length * 1000) / clip.fps;
      elapsed.current[source] = clip.loop
        ? (elapsed.current[source] + delta) % duration
        : Math.min(duration, elapsed.current[source] + delta);
      const position = Math.min(
        clip.frames.length - 1,
        Math.floor((elapsed.current[source] * clip.fps) / 1000),
      );
      if (!clip.loop && elapsed.current[source] >= duration) {
        playingRef.current = { ...playingRef.current, [source]: false };
        setPlaying(playingRef.current);
      }
      if (position !== preview.position)
        remember({
          ...open,
          pair: {
            ...open.pair,
            previews: {
              ...open.pair.previews,
              [source]: { ...preview, position },
            },
          },
        });
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      previousTime.current = null;
    };
  }, [active, view]);

  const preview = session?.pair.previews[view];
  const renderer = session?.renderers[view];
  const clip = preview && renderer?.manifest.animations[preview.action];
  const locked = busy || !session;
  const character = session?.pair.character ?? initialCharacter;
  const outfit = dualViewOutfit(
    character,
    session?.pair.selection.outfitId ?? DUAL_OUTFIT.id,
  );
  const outfits = availableDualViewOutfits(character);
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
          <p>
            选择套装或分别搭配上下装。款式和配色一起切换，动作使用各自的原片。
          </p>
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
      <div className="dual-layout">
        <div className="dual-preview">
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
            />
            {!session && (
              <p className="dual-empty">
                {busy ? "正在准备两个视角…" : "打开一组双视角素材开始搭配。"}
              </p>
            )}
          </div>
          <div className="dual-transport">
            <button
              disabled={locked}
              data-testid="dual-play-pause"
              aria-label={playing[view] ? "暂停播放" : "播放动作"}
              onClick={() => {
                if (!clip || !preview) return;
                if (!clip.loop && preview.position === clip.frames.length - 1) {
                  changePreview({ position: 0 });
                  elapsed.current[view] = 0;
                }
                const next = {
                  ...playingRef.current,
                  [view]: !playingRef.current[view],
                };
                playingRef.current = next;
                setPlaying(next);
                previousTime.current = null;
              }}
            >
              {playing[view] ? <Pause size={16} /> : <Play size={16} />}
              {playing[view] ? "暂停" : "播放"}
            </button>
            <label>
              动作
              <select
                data-testid="dual-action"
                value={preview?.action ?? "idle"}
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
                    disabled={!renderer?.manifest.animations[id]}
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
            当前动作帧 {preview ? preview.position + 1 : 0} /{" "}
            {clip?.frames.length ?? 0}
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
            {view === "side"
              ? "侧视跳跃保留原片连续两跳，播完停止；没有庆祝素材。"
              : "原版保留待机、走路、跑步、跳跃和庆祝。"}
          </p>
        </div>
        <aside className="dual-controls" aria-label="共用服装选择">
          <h3>同款衣橱</h3>
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
            {outfit.id === "tailored-day"
              ? "可与原片上装、短裤混搭；彩色棉质款使用独立服装组。"
              : "上装、下装可分别保留原片。"}
            此处只展示已经制作双视角版本的款式；原有完整衣橱仍可使用。
          </p>
          <div className="dual-exports">
            <h3>导出当前视角</h3>
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
              可在独立播放器中打开。继续编辑两边搭配，请保存双视角项目。
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
