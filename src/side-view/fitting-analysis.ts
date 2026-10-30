import type { RgbaPng } from "../core/baked-source";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type {
  RegisteredFrame,
  WardrobeGarment,
  WardrobeProject,
} from "../wardrobe/contract";
import { clothingPose } from "../wardrobe/recipe-kit";
import {
  prepareProtection,
  protectedClothingAt,
  reviewedRegions,
} from "../wardrobe/protection";
import type { SideAction } from "./motion";
import {
  compareFittingTemporal,
  fittingTemporalProfile,
  type FittingTemporalChange,
  type FittingTemporalProfile,
} from "./fitting-temporal";

export interface FittingMetrics {
  frameId: number;
  sourceFrame: number;
  ownedPixels: number;
  paintedPixels: number;
  smallIslands: number;
  protectedOwnedPixels: number;
  unownedPaintPixels: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
}
export interface FittingAuditRow extends FittingMetrics {
  action: SideAction;
  position: number;
  nextFrameId: number | null;
  nextAreaChange: number | null;
  isLoopSeam: boolean;
  temporalChanges: FittingTemporalChange[];
  prompts: string[];
}
export interface FittingAudit {
  format: "gathria-side-fitting-audit";
  version: 1;
  sourceSha256: string;
  registrationSha256: string;
  garment: { id: string; sha256: string };
  rows: FittingAuditRow[];
  note: string;
}
export const FITTING_ACTIONS: SideAction[] = ["idle", "walk", "run", "jump"];

/** Descriptive raster diagnostics, not an anatomy or aesthetic verdict. */
export function fittingMetrics(
  item: WardrobeGarment,
  frame: RegisteredFrame,
  cloth: RgbaPng,
  ownership: RgbaPng,
  source: RgbaPng,
): FittingMetrics {
  const { width, height } = cloth;
  if (
    [ownership, source].some(
      (p) =>
        p.width !== width ||
        p.height !== height ||
        p.pixels.length !== width * height * 4,
    ) ||
    cloth.pixels.length !== width * height * 4
  )
    throw Error("服装检查需要相同的原生画布尺寸。");
  const protectedRows = prepareProtection(
    reviewedRegions(frame, item.manifest),
  );
  const active = new Uint8Array(width * height);
  let ownedPixels = 0,
    paintedPixels = 0,
    protectedOwnedPixels = 0,
    unownedPaintPixels = 0;
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * width + x,
        p = at * 4;
      const owned = ownership.pixels[p] > 0;
      if (owned) {
        ownedPixels++;
        if (
          source.pixels[p + 3] &&
          protectedClothingAt(
            frame.frameId,
            x,
            y,
            protectedRows.get(y),
            item.manifest,
          )
        )
          protectedOwnedPixels++;
      }
      if (cloth.pixels[p + 3]) {
        if (!owned) unownedPaintPixels++;
        else {
          paintedPixels++;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
          // Ignore faint antialiasing in component analysis, not in ownership checks.
          if (cloth.pixels[p + 3] >= 32) active[at] = 1;
        }
      }
    }
  const queue = new Int32Array(width * height);
  let smallIslands = 0;
  for (let seed = 0; seed < active.length; seed++) {
    if (!active[seed]) continue;
    let head = 0,
      tail = 1;
    queue[0] = seed;
    active[seed] = 0;
    while (head < tail) {
      const at = queue[head++],
        y = Math.floor(at / width),
        x = at % width;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            next = ny * width + nx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && active[next]) {
            active[next] = 0;
            queue[tail++] = next;
          }
        }
    }
    if (tail <= 12) smallIslands++;
  }
  return {
    frameId: frame.frameId,
    sourceFrame: frame.sourceFrame,
    ownedPixels,
    paintedPixels,
    smallIslands,
    protectedOwnedPixels,
    unownedPaintPixels,
    bounds:
      x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 },
  };
}

export function fittingRows(
  project: WardrobeProject,
  metrics: Map<number, FittingMetrics>,
  temporal: Map<number, FittingTemporalProfile> = new Map(),
): FittingAuditRow[] {
  return FITTING_ACTIONS.flatMap((action) => {
    const clip = project.archive.manifest.animations[action];
    if (!clip) return [];
    return clip.frames.map((frameId, position) => {
      const current = metrics.get(frameId);
      if (!current) throw Error(`缺少姿势 ${frameId} 的检查结果。`);
      const nextFrameId =
        position + 1 < clip.frames.length
          ? clip.frames[position + 1]
          : clip.loop
            ? clip.frames[0]
            : null;
      const next = nextFrameId === null ? null : metrics.get(nextFrameId);
      if (nextFrameId !== null && !next)
        throw Error(`缺少相邻姿势 ${nextFrameId}。`);
      const nextAreaChange = next
        ? Math.abs(next.paintedPixels - current.paintedPixels) /
          Math.max(1, next.paintedPixels, current.paintedPixels)
        : null;
      const temporalChanges =
        nextFrameId !== null
          ? compareFittingTemporal(
              temporal.get(frameId) ?? [],
              temporal.get(nextFrameId) ?? [],
            )
          : [];
      const prompts: string[] = [];
      if (current.protectedOwnedPixels) prompts.push("覆盖受保护原图区域");
      if (current.unownedPaintPixels) prompts.push("有未归属的绘制像素");
      if (current.smallIslands) prompts.push("检查独立小片段");
      if (nextAreaChange !== null && nextAreaChange >= 0.25)
        prompts.push("检查相邻帧衣料面积变化");
      for (const change of temporalChanges)
        if (change.status === "review")
          prompts.push(`${change.label}邻帧轮廓变化，请复核`);
      return {
        ...current,
        action,
        position,
        nextFrameId,
        nextAreaChange,
        isLoopSeam: Boolean(
          clip.loop &&
            position === clip.frames.length - 1 &&
            clip.frames.length > 1,
        ),
        temporalChanges,
        prompts,
      };
    });
  });
}

export async function auditFitting(
  project: WardrobeProject,
  itemId: string,
  sourceFrame: (frameId: number) => RgbaPng,
  options: SourcePreparationOptions & {
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<FittingAudit> {
  assertSourcePreparationActive(options);
  const item = project.items.find((entry) => entry.manifest.id === itemId);
  if (!item) throw Error("请先选择已加载的服装。");
  const ids = [
    ...new Set(
      FITTING_ACTIONS.flatMap(
        (action) => project.archive.manifest.animations[action]?.frames ?? [],
      ),
    ),
  ];
  const metrics = new Map<number, FittingMetrics>();
  const temporal = new Map<number, FittingTemporalProfile>();
  for (let index = 0; index < ids.length; index++) {
    assertSourcePreparationActive(options);
    const frameId = ids[index],
      registered = project.registration.frames.find(
        (row) => row.frameId === frameId,
      );
    if (!registered) throw Error(`缺少姿势 ${frameId} 的锚点。`);
    const cloth = clothingPose(item, frameId),
      source = sourceFrame(frameId);
    metrics.set(
      frameId,
      fittingMetrics(item, registered, cloth.image, cloth.mask, source),
    );
    temporal.set(
      frameId,
      fittingTemporalProfile(
        registered,
        item.manifest.slot,
        cloth.image,
        cloth.mask,
        source,
      ),
    );
    options.onProgress?.(index + 1, ids.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  assertSourcePreparationActive(options);
  return {
    format: "gathria-side-fitting-audit",
    version: 1,
    sourceSha256: project.document.sourceSha256,
    registrationSha256: project.document.registrationSha256,
    garment: { id: itemId, sha256: item.sha256 },
    rows: fittingRows(project, metrics, temporal),
    note: "几何与像素检查提示，不是美术验收。局部窗口随原锚点对齐，并保留衣料变化与原人物变化的分数；原图也明显变化时降低提示优先级，不代表没有穿帮。小片段和面积变化可能来自正常遮挡。隐藏锚点、微小裂缝、褶皱颜色及窗口外的轮廓仍需目视检查。循环动作包含末帧到首帧，跳跃不连接结尾与开头。源素材、锚点及时间信息未改变。",
  };
}
