import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { RgbaPng } from "../core/baked-source";
import { downloadBlob } from "../core/pack";
import { WARDROBE_ANCHORS, type WardrobeProject } from "../wardrobe/contract";
import {
  createWardrobeCompositor,
  type WardrobeCompositor,
} from "../wardrobe/compositor";
import { clothingPose, exportClothingRecipeKit } from "../wardrobe/recipe-kit";
import { reviewedRegions } from "../wardrobe/protection";
import {
  prepareGarmentCandidate,
  assertCandidateBase,
  type GarmentCandidate,
} from "../wardrobe/repair-candidate";
import type { MaskBuildReport } from "../wardrobe/mask-edit";
import {
  auditFitting,
  FITTING_ACTIONS,
  type FittingAudit,
} from "./fitting-analysis";
import type { SideAction } from "./motion";
import {
  exportFittingTemplate,
  inspectFittingTemplate,
  exportFittingTemplateKit,
  FITTING_TEMPLATE_MAX_BYTES,
  type FittingTemplateApplication,
} from "./fitting-template";
import "./fitting-workbench.css";

const MaskEditWorkbench = lazy(() => import("../wardrobe/MaskEditWorkbench"));
const GarmentCandidatePreview = lazy(
  () => import("../wardrobe/GarmentCandidatePreview"),
);
const LABELS: Record<SideAction, string> = {
  idle: "待机",
  walk: "行走",
  run: "跑步",
  jump: "跳跃",
};
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);
const save = (bytes: Uint8Array, name: string, type: string) =>
  downloadBlob(new Blob([new Uint8Array(bytes)], { type }), name);
type Candidate = {
  value: GarmentCandidate;
  renderer: WardrobeCompositor;
  bytes: Uint8Array;
  report: MaskBuildReport;
};
export interface FittingWorkbenchProps {
  project: WardrobeProject;
  renderer: WardrobeCompositor;
  action: SideAction;
  frameId: number;
  disabled?: boolean;
  active?: boolean;
  /** Deliberate inspection changes also position the shared stage and exports. */
  onPose?: (action: SideAction, frameId: number) => void;
  /** Keep parent pose/material controls fixed while a correction is in progress. */
  onEditingChange?: (locked: boolean) => void;
  /** Identity whose project ZIP download was successfully initiated by the parent. */
  savedProject?: WardrobeProject | null;
  onApply: (project: WardrobeProject) => Promise<void>;
}

/** Native sprite corrections, keeping the original registration and source fixed.
 * The established mask draft/candidate workflow supplies the edit round trip. */
export default function FittingWorkbench({
  project,
  renderer,
  action: initialAction,
  frameId: initialFrame,
  disabled = false,
  active = true,
  onPose,
  onEditingChange,
  savedProject = null,
  onApply,
}: FittingWorkbenchProps) {
  const worn = project.items.filter(
    (item) =>
      item.manifest.slot !== "shoes" &&
      Object.values(project.document.selection).includes(item.manifest.id),
  );
  const [itemId, setItemId] = useState(worn[0]?.manifest.id ?? "");
  const [action, setAction] = useState(initialAction);
  const [position, setPosition] = useState(
    Math.max(
      0,
      project.archive.manifest.animations[initialAction]?.frames.indexOf(
        initialFrame,
      ) ?? 0,
    ),
  );
  const [guides, setGuides] = useState(true);
  const [zoom, setZoom] = useState("fit");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [audit, setAudit] = useState<FittingAudit | null>(null);
  const [onlyPrompts, setOnlyPrompts] = useState(false);
  const [template, setTemplate] = useState<{
    bytes: Uint8Array;
    application: FittingTemplateApplication;
  } | null>(null);
  const templateInput = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [neighborView, setNeighborView] = useState<"look" | "cloth">("look");
  const [appliedProject, setAppliedProject] = useState<WardrobeProject | null>(
    null,
  );
  const neighborCanvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const neighborSection = useRef<HTMLDivElement | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const currentProject = useRef(project);
  currentProject.current = project;
  const callbacks = useRef({ onPose, onEditingChange });
  callbacks.current = { onPose, onEditingChange };
  const candidateRef = useRef<Candidate | null>(null);
  candidateRef.current = candidate;
  const item = worn.find((entry) => entry.manifest.id === itemId) ?? worn[0];
  const clip = project.archive.manifest.animations[action];
  const safePosition = Math.max(
    0,
    Math.min(position, (clip?.frames.length ?? 1) - 1),
  );
  const frameId = clip?.frames[safePosition];
  const registered = project.registration.frames.find(
    (frame) => frame.frameId === frameId,
  );
  const editingLocked = busy || editing || candidate !== null;
  const locked = disabled || !active || editingLocked;
  const neighborPositions = clip
    ? [
        safePosition > 0
          ? safePosition - 1
          : clip.loop
            ? clip.frames.length - 1
            : null,
        safePosition,
        safePosition + 1 < clip.frames.length
          ? safePosition + 1
          : clip.loop
            ? 0
            : null,
      ]
    : [null, null, null];
  const neighborIds = neighborPositions.map((at) =>
    at === null ? null : (clip?.frames[at] ?? null),
  );
  const auditRow = audit?.rows.find(
    (row) => row.action === action && row.position === safePosition,
  );
  const stageLabel = candidate
    ? "候选预览：当前项目尚未替换"
    : editing
      ? "局部草稿：修正尚未应用到当前项目"
      : savedProject === project
        ? "项目下载已发起；请保留下载文件"
        : appliedProject === project
          ? "修正已应用到当前项目，请保存项目下载副本"
          : "当前搭配：检查与预览不会自动保存项目";

  function selectPosition(nextAction: SideAction, nextPosition: number) {
    if (locked) return;
    const nextClip = project.archive.manifest.animations[nextAction];
    if (!nextClip || !Number.isSafeInteger(nextPosition)) return;
    const index = Math.max(
      0,
      Math.min(nextPosition, nextClip.frames.length - 1),
    );
    const nextFrame = nextClip.frames[index];
    if (nextFrame === undefined) return;
    setAction(nextAction);
    setPosition(index);
    callbacks.current.onPose?.(nextAction, nextFrame);
  }

  function inspectPosition(
    nextAction: SideAction,
    nextPosition: number,
    repair = false,
  ) {
    if (locked) return;
    selectPosition(nextAction, nextPosition);
    setShowNeighbors(true);
    if (repair) setEditing(true);
    else
      requestAnimationFrame(() => {
        if (neighborSection.current?.checkVisibility())
          neighborSection.current.scrollIntoView({ block: "nearest" });
      });
  }

  // The stage owns playback. Follow its pose when no correction is locked;
  // deliberate inspector changes call onPose above, never from this effect.
  // This keeps PNG/GIF exports on the inspected action without feedback loops.
  useEffect(() => {
    if (!active || locked) return;
    const index =
      project.archive.manifest.animations[initialAction]?.frames.indexOf(
        initialFrame,
      );
    if (index === undefined || index < 0) return;
    setAction(initialAction);
    setPosition(index);
  }, [active, locked, initialAction, initialFrame, project]);

  useEffect(() => {
    callbacks.current.onEditingChange?.(editingLocked);
  }, [editingLocked]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current++;
      abort.current?.abort();
      candidateRef.current?.renderer.dispose();
      callbacks.current.onEditingChange?.(false);
    };
  }, []);
  useEffect(() => {
    request.current++;
    abort.current?.abort();
    candidateRef.current?.renderer.dispose();
    candidateRef.current = null;
    setCandidate(null);
    setAppliedProject((previous) => (previous === project ? previous : null));
    setEditing(false);
    setAudit(null);
    setBusy(false);
    setError("");
    setNotice("");
  }, [project]);
  useEffect(() => {
    setAudit(null);
    setTemplate(null);
    setNotice("");
  }, [item?.sha256, project]);

  useEffect(() => {
    if (!active || !item || frameId === undefined || !registered) return;
    try {
      const cloth = clothingPose(item, frameId);
      const views: Record<string, RgbaPng> = {
        source: renderer.renderSourceFrame(frameId),
        cloth: cloth.image,
        current: renderer.renderFrame(frameId),
      };
      for (const [key, image] of Object.entries(views)) {
        const canvas = canvases.current[key];
        if (!canvas) continue;
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw Error("无法创建服装校正画布。");
        context.putImageData(
          new ImageData(
            new Uint8ClampedArray(image.pixels),
            image.width,
            image.height,
          ),
          0,
          0,
        );
        if (guides) {
          for (const region of reviewedRegions(registered, item.manifest)) {
            context.beginPath();
            region.polygon.forEach((p, i) =>
              i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y),
            );
            context.closePath();
            context.fillStyle =
              region.label === "head"
                ? "rgba(150,78,188,.18)"
                : "rgba(224,119,48,.24)";
            context.strokeStyle =
              region.label === "head" ? "#814aa0" : "#b65f20";
            context.lineWidth = 1;
            context.fill();
            context.stroke();
          }
          for (const name of WARDROBE_ANCHORS) {
            const p = registered.points[name];
            context.beginPath();
            context.arc(p.x, p.y, 3, 0, 2 * Math.PI);
            context.fillStyle =
              p.visibility === "visible" ? "#057e74" : "#b45c16";
            context.fill();
            context.strokeStyle = "white";
            context.stroke();
          }
        }
      }
      setError("");
    } catch (cause) {
      setError(message(cause));
    }
  }, [active, item, frameId, registered, renderer, guides, project]);

  useEffect(() => {
    if (!active || !showNeighbors || !item) return;
    try {
      for (let index = 0; index < neighborIds.length; index++) {
        const id = neighborIds[index];
        const canvas = neighborCanvases.current[index];
        if (id === null || !canvas) continue;
        const image =
          neighborView === "cloth"
            ? clothingPose(item, id).image
            : renderer.renderFrame(id);
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw Error("无法创建邻帧比较画布。");
        context.putImageData(
          new ImageData(
            new Uint8ClampedArray(image.pixels),
            image.width,
            image.height,
          ),
          0,
          0,
        );
      }
    } catch (cause) {
      setError(message(cause));
    }
  }, [
    active,
    showNeighbors,
    neighborView,
    item,
    renderer,
    action,
    safePosition,
    clip,
  ]);

  // Native zoom should initially show the character rather than the empty
  // canvas corner. Do not recenter on scrubbing: manual panning remains stable.
  useEffect(() => {
    if (!active || zoom === "fit" || !registered) return;
    const scale = Number(zoom);
    const points = registered.points;
    const x = (points.waistLeft.x + points.waistRight.x) / 2;
    const y =
      (points.neck.y + (points.waistLeft.y + points.waistRight.y) / 2) / 2;
    const raf = requestAnimationFrame(() => {
      for (const canvas of [
        ...Object.values(canvases.current),
        ...Object.values(neighborCanvases.current),
      ]) {
        const scroll = canvas?.parentElement;
        if (!scroll || !canvas?.isConnected) continue;
        scroll.scrollLeft = Math.max(0, x * scale - scroll.clientWidth / 2);
        scroll.scrollTop = Math.max(0, y * scale - scroll.clientHeight / 2);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [active, zoom, showNeighbors, project.document.sourceSha256]);

  async function runAudit() {
    if (!item || locked) return;
    const token = ++request.current,
      controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setBusy(true);
    setError("");
    setAudit(null);
    try {
      const result = await auditFitting(
        project,
        item.manifest.id,
        (id) => renderer.renderSourceFrame(id),
        {
          signal: controller.signal,
          onProgress: (done, total) => {
            if (alive.current && token === request.current)
              setNotice(`正在检查 ${done} / ${total} 个原始姿势…`);
          },
        },
      );
      if (
        !alive.current ||
        token !== request.current ||
        controller.signal.aborted
      )
        return;
      setAudit(result);
      setNotice(
        `检查完成：${result.rows.length} 个动作位置。请逐帧判断提示是否属于正常遮挡。`,
      );
    } catch (cause) {
      if (
        alive.current &&
        token === request.current &&
        !controller.signal.aborted
      )
        setError(message(cause));
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  }
  async function exportGuide() {
    if (!item || frameId === undefined || locked) return;
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      const bytes = await exportClothingRecipeKit(
        project,
        item.manifest.id,
        frameId,
        { action, position: safePosition },
      );
      if (alive.current && token === request.current)
        save(
          bytes,
          `${item.manifest.id}-${action}-${frameId}-guides.zip`,
          "application/zip",
        );
    } catch (cause) {
      if (alive.current && token === request.current) setError(message(cause));
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  }
  async function saveTemplate(kind: "reference" | "kit") {
    if (!item || locked || (kind === "kit" && !template)) return;
    const token = ++request.current,
      controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      const bytes =
        kind === "reference"
          ? await exportFittingTemplate(
              project,
              item.manifest.id,
              [
                ...new Set(
                  neighborIds.filter((id): id is number => id !== null),
                ),
              ],
              { signal: controller.signal },
            )
          : await exportFittingTemplateKit(
              template!.bytes,
              project,
              item.manifest.id,
              { signal: controller.signal },
            );
      if (
        alive.current &&
        token === request.current &&
        !controller.signal.aborted
      ) {
        save(
          bytes,
          `${item.manifest.id}-${kind === "reference" ? "fitting-template.json" : "template-guides.zip"}`,
          kind === "reference" ? "application/json" : "application/zip",
        );
        setNotice(
          kind === "reference"
            ? "定位模板已导出，包含当前帧及可用邻帧；没有修改服装。"
            : "当前服装的绘制包已导出；模板仅复用定位与待看姿势，服装画面保持原样。",
        );
      }
    } catch (cause) {
      if (
        alive.current &&
        token === request.current &&
        !controller.signal.aborted
      )
        setError(message(cause));
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  }
  async function openTemplate(file: File) {
    if (!item || locked) return;
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      if (file.size > FITTING_TEMPLATE_MAX_BYTES)
        throw Error("定位模板超过允许大小。");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!alive.current || token !== request.current) return;
      const application = inspectFittingTemplate(
        bytes,
        project,
        item.manifest.id,
      );
      setTemplate({ bytes, application });
      setNotice("定位模板已检查，请选择姿势查看，或导出当前衣服的绘制包。");
    } catch (cause) {
      if (alive.current && token === request.current) setError(message(cause));
    } finally {
      if (alive.current && token === request.current) setBusy(false);
    }
  }
  async function preview(bytes: Uint8Array, report: MaskBuildReport) {
    const token = ++request.current,
      controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    let prepared: WardrobeCompositor | null = null;
    try {
      const value = await prepareGarmentCandidate(project, bytes, {
        signal: controller.signal,
      });
      prepared = await createWardrobeCompositor(value.project, {
        signal: controller.signal,
      });
      await assertCandidateBase(value, currentProject.current, {
        signal: controller.signal,
      });
      if (
        !alive.current ||
        token !== request.current ||
        controller.signal.aborted
      ) {
        prepared.dispose();
        return;
      }
      setEditing(false);
      setCandidate({
        value,
        renderer: prepared,
        bytes: new Uint8Array(bytes),
        report,
      });
    } catch (cause) {
      prepared?.dispose();
      throw cause;
    }
  }
  function closeCandidate() {
    candidateRef.current?.renderer.dispose();
    candidateRef.current = null;
    setCandidate(null);
  }

  return (
    <section
      className="side-fitting"
      data-testid="side-fitting"
      aria-label="服装校正工作台"
      aria-busy={busy}
    >
      <h3>服装校正工作台</h3>
      <p
        className="side-fitting-workflow"
        data-testid="fitting-workflow-status"
        aria-live="polite"
      >
        {stageLabel}
      </p>
      <p>
        原生右朝向制作。绿点为可见锚点，棕点为遮挡估计；紫色保护头部，橙色保护手部。锚点和原人物保持固定。
      </p>
      {!item ? (
        <p>先穿上一件上衣、下装或连衣裙，再打开校正工具。</p>
      ) : (
        <>
          <div className="side-fitting-controls">
            <label>
              校正服装
              <select
                data-testid="fitting-item"
                value={item.manifest.id}
                disabled={locked}
                onChange={(e) => setItemId(e.target.value)}
              >
                {worn.map((entry) => (
                  <option key={entry.manifest.id} value={entry.manifest.id}>
                    {entry.manifest.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              检查动作
              <select
                data-testid="fitting-action"
                value={action}
                disabled={locked}
                onChange={(e) =>
                  selectPosition(e.target.value as SideAction, 0)
                }
              >
                {FITTING_ACTIONS.filter(
                  (key) => project.archive.manifest.animations[key],
                ).map((key) => (
                  <option key={key} value={key}>
                    {LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              动作内位置
              <input
                data-testid="fitting-position"
                type="number"
                min={0}
                max={(clip?.frames.length ?? 1) - 1}
                value={safePosition}
                disabled={locked}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isSafeInteger(n)) selectPosition(action, n);
                }}
              />
            </label>
            <label>
              显示尺寸
              <select
                data-testid="fitting-zoom"
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
              >
                <option value="fit">适应面板</option>
                <option value="1">原生 1×</option>
                <option value="2">整数 2×</option>
              </select>
            </label>
            <label>
              <input
                data-testid="fitting-guides"
                type="checkbox"
                checked={guides}
                onChange={(e) => setGuides(e.target.checked)}
              />
              显示锚点与保护区域
            </label>
          </div>
          <p data-testid="fitting-frame">
            姿势 {frameId} · 视频帧 {registered?.sourceFrame} · {clip?.fps} fps
            · {clip?.loop ? "循环（含首尾检查）" : "原片单次播放"}
          </p>
          <div className="side-fitting-views">
            {(
              [
                ["source", "原人物"],
                ["cloth", "独立衣料"],
                ["current", "当前完整搭配"],
              ] as const
            ).map(([key, label]) => (
              <figure key={key}>
                <figcaption>{label}</figcaption>
                <div className="side-fitting-scroll">
                  <canvas
                    data-testid={`fitting-${key}`}
                    ref={(node) => {
                      canvases.current[key] = node;
                    }}
                    aria-label={label}
                    style={
                      zoom === "fit"
                        ? { width: "100%", maxWidth: 256 }
                        : {
                            width:
                              project.registration.frameWidth * Number(zoom),
                            maxWidth: "none",
                            imageRendering: "pixelated",
                          }
                    }
                  />
                </div>
              </figure>
            ))}
          </div>
          <div className="side-fitting-controls">
            <button
              type="button"
              data-testid="fitting-neighbors-toggle"
              aria-expanded={showNeighbors}
              disabled={locked}
              onClick={() => setShowNeighbors(!showNeighbors)}
            >
              {showNeighbors ? "收起邻帧比较" : "比较前一帧、当前帧与后一帧"}
            </button>
            <button
              type="button"
              data-testid="fitting-previous"
              disabled={locked || neighborPositions[0] === null}
              onClick={() => selectPosition(action, neighborPositions[0]!)}
            >
              前一帧
            </button>
            <button
              type="button"
              data-testid="fitting-next"
              disabled={locked || neighborPositions[2] === null}
              onClick={() => selectPosition(action, neighborPositions[2]!)}
            >
              后一帧
            </button>
          </div>
          {showNeighbors && (
            <div
              ref={neighborSection}
              data-testid="fitting-neighbors"
              className="side-fitting-neighbors"
            >
              <h4>连续姿势对比 · {LABELS[action]}</h4>
              <p>
                {clip?.loop
                  ? "动作末帧与首帧相连，首尾位置会明确标注。"
                  : "原片单次动作，开头与结尾不连接。"}{" "}
                三张图使用相同画布与尺寸，锚点叠层不进入这些画面。
              </p>
              <label>
                邻帧显示内容{" "}
                <select
                  data-testid="fitting-neighbor-view"
                  value={neighborView}
                  onChange={(event) =>
                    setNeighborView(event.target.value as "look" | "cloth")
                  }
                >
                  <option value="look">完整搭配</option>
                  <option value="cloth">独立衣料</option>
                </select>
              </label>
              <div className="side-fitting-views">
                {neighborIds.map((id, index) => (
                  <figure key={index}>
                    <figcaption data-testid={`fitting-neighbor-label-${index}`}>
                      {["前一帧", "当前帧", "后一帧"][index]} ·{" "}
                      {id === null ? "动作边界" : `姿势 ${id}`}
                      {id !== null &&
                      ((index === 0 && safePosition === 0) ||
                        (index === 2 &&
                          safePosition === (clip?.frames.length ?? 0) - 1))
                        ? "（循环交界）"
                        : ""}
                    </figcaption>
                    {id === null ? (
                      <p className="side-fitting-boundary">
                        {index === 0
                          ? "起始位置，无前一帧"
                          : "结束位置，无后一帧"}
                      </p>
                    ) : (
                      <>
                        <div className="side-fitting-scroll">
                          <canvas
                            data-testid={`fitting-neighbor-${index}`}
                            ref={(node) => {
                              neighborCanvases.current[index] = node;
                            }}
                            aria-label={`${LABELS[action]} ${["前一帧", "当前帧", "后一帧"][index]} 姿势 ${id}`}
                            style={
                              zoom === "fit"
                                ? { width: "100%", maxWidth: 256 }
                                : {
                                    width:
                                      project.registration.frameWidth *
                                      Number(zoom),
                                    maxWidth: "none",
                                    imageRendering: "pixelated",
                                  }
                            }
                          />
                        </div>
                        {index !== 1 && (
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() =>
                              selectPosition(action, neighborPositions[index]!)
                            }
                          >
                            检查此帧
                          </button>
                        )}
                      </>
                    )}
                  </figure>
                ))}
              </div>
              {auditRow && (
                <div data-testid="fitting-transition-summary">
                  <p>
                    {auditRow.prompts.join("；") ||
                      "此位置无自动检查提示，仍需观察连续轮廓。"}
                  </p>
                  {auditRow.temporalChanges.length > 0 && (
                    <ul>
                      {auditRow.temporalChanges
                        .filter(
                          (change) =>
                            change.status === "review" ||
                            change.status === "source-motion",
                        )
                        .sort(
                          (a, b) =>
                            Number(b.status === "review") -
                            Number(a.status === "review"),
                        )
                        .slice(0, 2)
                        .map((change) => (
                          <li key={change.region}>
                            {change.label}：
                            {change.status === "review"
                              ? "衣料轮廓变化，需目视确认"
                              : "原人物也有变化，仍需目视"}
                            {change.estimatedAnchors ? " · 含估计锚点" : ""}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          <details>
            <summary>查看本帧 17 个锚点</summary>
            <div className="side-fitting-table">
              <table>
                <thead>
                  <tr>
                    <th>锚点</th>
                    <th>x / y</th>
                    <th>依据</th>
                  </tr>
                </thead>
                <tbody>
                  {registered &&
                    WARDROBE_ANCHORS.map((name) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td>
                          {registered.points[name].x.toFixed(1)} /{" "}
                          {registered.points[name].y.toFixed(1)}
                        </td>
                        <td>
                          {registered.points[name].visibility === "visible"
                            ? "可见"
                            : "遮挡估计"}
                          {registered.points[name].method
                            ? ` · ${registered.points[name].method}`
                            : ""}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="side-fitting-controls">
            <button
              type="button"
              data-testid="fitting-repair"
              disabled={locked}
              onClick={() => setEditing(true)}
            >
              修正本帧衣料边界
            </button>
            <button
              type="button"
              data-testid="fitting-guides-export"
              disabled={locked}
              onClick={() => void exportGuide()}
            >
              导出邻帧绘制包
            </button>
            <button
              type="button"
              data-testid="fitting-audit"
              disabled={locked}
              onClick={() => void runAudit()}
            >
              检查这件服装的全部动作
            </button>
            {busy && (
              <button
                type="button"
                onClick={() => {
                  request.current++;
                  abort.current?.abort();
                  setBusy(false);
                  setNotice("已停止，当前搭配保持原样。");
                }}
              >
                停止
              </button>
            )}
          </div>
          <p>
            边界工具支持取样衣料、局部补齐、恢复原图、撤销，以及保存 /
            重开校正草稿。修正后先逐帧预览，再应用为独立衣服；随后可用页面的保存与导出功能。每份草稿最多校正
            8 个姿势，不会自动传播到整套动作。
          </p>
          <p>
            新增轮廓或重画褶皱仍需准备美术素材。邻帧绘制包保留精确来源与锚点，不能直接作为可播放角色导入。
          </p>
          <details data-testid="fitting-template-panel">
            <summary>复用服装定位模板</summary>
            <p>
              把当前帧及相邻帧的定位与待看位置保存为模板。模板用于同一人物、同一锚点版本和相同穿戴部位的服装；导入后不会覆盖衣料或自动换装。
            </p>
            <div className="side-fitting-controls">
              <button
                type="button"
                data-testid="fitting-template-export"
                disabled={locked}
                onClick={() => void saveTemplate("reference")}
              >
                导出当前邻帧模板
              </button>
              <button
                type="button"
                data-testid="fitting-template-open"
                disabled={locked}
                onClick={() => templateInput.current?.click()}
              >
                打开定位模板
              </button>
              <input
                ref={templateInput}
                hidden
                type="file"
                accept=".json,application/json"
                data-testid="fitting-template-input"
                aria-label="服装定位模板文件"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void openTemplate(file);
                }}
              />
            </div>
            {template && (
              <div data-testid="fitting-template-result">
                <p>
                  参考服装：{template.application.template.donor.name} →
                  当前服装：{template.application.target.name}
                </p>
                <p>{template.application.note}</p>
                <div className="side-fitting-controls">
                  {template.application.poses.flatMap((pose) =>
                    pose.locations.map((location) => (
                      <button
                        type="button"
                        key={`${location.action}-${location.position}`}
                        disabled={locked}
                        onClick={() =>
                          inspectPosition(location.action, location.position)
                        }
                      >
                        {LABELS[location.action]} / {pose.frameId}
                      </button>
                    )),
                  )}
                </div>
                <button
                  type="button"
                  data-testid="fitting-template-kit"
                  disabled={locked}
                  onClick={() => void saveTemplate("kit")}
                >
                  导出当前服装的模板绘制包
                </button>
              </div>
            )}
          </details>
          {audit && (
            <div data-testid="fitting-audit-results">
              <p>{audit.note}</p>
              <label>
                <input
                  type="checkbox"
                  checked={onlyPrompts}
                  onChange={(e) => setOnlyPrompts(e.target.checked)}
                />
                只看有提示的位置
              </label>
              <button
                type="button"
                data-testid="fitting-audit-export"
                onClick={() =>
                  save(
                    new TextEncoder().encode(
                      JSON.stringify(audit, null, 2) + "\n",
                    ),
                    `${item.manifest.id}-fitting-audit.json`,
                    "application/json",
                  )
                }
              >
                导出检查 JSON
              </button>
              <div className="side-fitting-table">
                <table>
                  <thead>
                    <tr>
                      <th>动作 / 姿势</th>
                      <th>绘制像素</th>
                      <th>小片段</th>
                      <th>到下一帧面积变化</th>
                      <th>局部轮廓变化</th>
                      <th>待看提示</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.rows
                      .filter((row) => !onlyPrompts || row.prompts.length)
                      .map((row) => (
                        <tr key={`${row.action}-${row.position}`}>
                          <td>
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => {
                                inspectPosition(row.action, row.position);
                              }}
                            >
                              {LABELS[row.action]} / {row.frameId}
                            </button>
                            <button
                              type="button"
                              className="side-fitting-inline-repair"
                              data-testid={`fitting-repair-${row.action}-${row.frameId}`}
                              disabled={locked}
                              onClick={() =>
                                inspectPosition(row.action, row.position, true)
                              }
                            >
                              修正此帧
                            </button>
                          </td>
                          <td>{row.paintedPixels}</td>
                          <td>{row.smallIslands}</td>
                          <td>
                            {row.nextAreaChange === null
                              ? "结束"
                              : `${(row.nextAreaChange * 100).toFixed(1)}% → ${row.nextFrameId}`}
                          </td>
                          <td>
                            {row.temporalChanges
                              .filter((change) => change.status === "review")
                              .map((change) => change.label)
                              .join("、") || "—"}
                            {row.isLoopSeam ? " · 循环交界" : ""}
                          </td>
                          <td>
                            {row.prompts.join("；") || "无几何提示，仍需目视"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <Suspense fallback={<p role="status">正在打开校正工具…</p>}>
        {editing && item && (
          <MaskEditWorkbench
            active={active}
            project={project}
            itemId={item.manifest.id}
            action={action}
            position={safePosition}
            onClose={() => {
              request.current++;
              abort.current?.abort();
              setEditing(false);
            }}
            onPreview={preview}
          />
        )}
        {candidate && (
          <GarmentCandidatePreview
            active={active}
            original={renderer}
            candidate={candidate.renderer}
            baseProject={project}
            project={candidate.value.project}
            maskCorrection={{
              bytes: candidate.bytes,
              report: candidate.report,
            }}
            initialAction={action}
            initialPosition={safePosition}
            initialFacing="right"
            historyAvailable={false}
            onClose={closeCandidate}
            onApply={async (next) => {
              await assertCandidateBase(
                candidate.value,
                currentProject.current,
              );
              await onApply(next);
              if (alive.current) {
                setAppliedProject(next);
                closeCandidate();
              }
            }}
          />
        )}
      </Suspense>
    </section>
  );
}
