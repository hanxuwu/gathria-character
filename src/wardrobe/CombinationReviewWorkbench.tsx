import { useEffect, useMemo, useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import {
  APPEARANCE_HAIR_COLORS,
  type AppearanceHairColor,
} from "../appearance/contract";
import { encodeSourceRgbaPngAsync, type RgbaPng } from "../core/baked-source";
import { downloadBlob } from "../core/pack";
import { sha256 } from "../core/sha256";
import type { Facing, PortableAnimationName } from "../core/types";
import type {
  Rect,
  WardrobeProject,
  WardrobeSelection,
  WardrobeSlot,
} from "./contract";
import { getWardrobeAppearanceSelection } from "./project";
import {
  buildCombinationCase,
  createCombinationPlan,
  parseCombinationReport,
  scanCombinationPlan,
  serializeCombinationReport,
  COMBINATION_MAX_LOOKS,
  COMBINATION_MAX_SAMPLES,
  COMBINATION_REPORT_MAX_BYTES,
  type CombinationBuiltCase,
  type CombinationOutfit,
  type CombinationPlan,
  type CombinationReport,
  type CombinationRequest,
  type CombinationRow,
} from "./combination-review";
import ReviewCanvas, { type ReviewCanvasMode } from "./ReviewCanvas";
import { clampReviewRegion } from "./review-sheets";
import "./combination-review.css";

export interface CombinationReviewWorkbenchProps {
  project: WardrobeProject;
  onClose: () => void;
  onUseLook: (
    project: WardrobeProject,
    action: PortableAnimationName,
    position: number,
    facing: Facing,
    referenceProject?: WardrobeProject,
  ) => Promise<void> | void;
  availableItems?: Array<{ id: string; name: string; slot: WardrobeSlot }>;
  onLoadItems?: (
    ids: string[],
    signal: AbortSignal,
  ) => Promise<WardrobeProject>;
}
const ACTIONS: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const SLOTS: WardrobeSlot[] = ["top", "bottom", "fullBody", "shoes"];
const SLOT_NAMES: Record<WardrobeSlot, string> = {
  top: "Top",
  bottom: "Bottom",
  fullBody: "One-piece",
  shoes: "Shoes",
};
const ORIGINAL: WardrobeSelection = {
  top: null,
  bottom: null,
  fullBody: null,
  shoes: null,
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const rowKey = (row: CombinationRow) =>
  `${row.caseId}:${row.action}:${row.position}:${row.facing}`;
const toggle = <T,>(items: T[], item: T) =>
  items.includes(item) ? items.filter((v) => v !== item) : [...items, item];
const dispose = (pair: CombinationBuiltCase | null) => {
  pair?.renderer.dispose();
  pair?.referenceRenderer.dispose();
};
const active = (signal: AbortSignal) => {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
};
type RegionName = "full" | "head" | "neckline" | "waist" | "hands" | "feet";

function regionFor(
  project: WardrobeProject,
  pair: CombinationBuiltCase,
  frameId: number,
  name: RegionName,
): Rect | undefined {
  if (name === "full") return undefined;
  const f = project.registration.frames.find(
    (frame) => frame.frameId === frameId,
  );
  if (!f) return undefined;
  const points = f.points;
  const keys =
    name === "neckline"
      ? (["neck", "nearShoulder", "farShoulder"] as const)
      : name === "waist"
        ? (["waistLeft", "waistRight", "nearHip", "farHip"] as const)
        : name === "hands"
          ? (["nearElbow", "farElbow", "nearWrist", "farWrist"] as const)
          : (["nearAnkle", "farAnkle", "nearToe", "farToe"] as const);
  const head = f.protected.find((area) => area.label === "head")?.polygon;
  const selected =
    name === "head" && head?.length ? head : keys.map((key) => points[key]);
  const pad = Math.max(
    2,
    Math.round(
      project.registration.frameWidth * (name === "head" ? 0.03 : 0.065),
    ),
  );
  const dx = pair.comparison.manifest.anchor.x - project.registration.anchor.x;
  const dy = pair.comparison.manifest.anchor.y - project.registration.anchor.y;
  const x = Math.min(...selected.map((p) => p.x)) - pad + dx;
  const y = Math.min(...selected.map((p) => p.y)) - pad + dy;
  return clampReviewRegion(
    pair.comparison.manifest.spritesheet.frameWidth,
    pair.comparison.manifest.spritesheet.frameHeight,
    {
      x,
      y,
      width: Math.max(...selected.map((p) => p.x)) + pad + dx - x,
      height: Math.max(...selected.map((p) => p.y)) + pad + dy - y,
    },
  );
}
function reducedCrop(
  image: RgbaPng,
  crop: Rect,
  facing: Facing,
  factor: number,
): RgbaPng {
  const width = Math.ceil(crop.width / factor),
    height = Math.ceil(crop.height / factor);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx =
        crop.x + (facing === "left" ? crop.width - 1 - x * factor : x * factor);
      const from = ((crop.y + y * factor) * image.width + sx) * 4;
      pixels.set(image.pixels.subarray(from, from + 4), (y * width + x) * 4);
    }
  return { width, height, pixels, colorChunks: image.colorChunks };
}
function pictureCanvas(image: RgbaPng) {
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
async function canvasBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(Error("Could not encode contact sheet.")),
      "image/png",
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/** A local inspection workspace. Only the explicit final handoff changes the accepted wardrobe. */
export default function CombinationReviewWorkbench({
  project,
  onClose,
  onUseLook,
  availableItems = [],
  onLoadItems,
}: CombinationReviewWorkbenchProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true),
    operation = useRef<AbortController | null>(null),
    previewController = useRef<AbortController | null>(null);
  const operationNumber = useRef(0),
    pairRef = useRef<CombinationBuiltCase | null>(null);
  const [pool, setPool] = useState(project);
  const [poolIds, setPoolIds] = useState<string[]>(
    project.items.map((item) => item.manifest.id),
  );
  const appearance = getWardrobeAppearanceSelection(project);
  const [slots, setSlots] = useState<
    Record<WardrobeSlot, Array<string | null>>
  >(
    () =>
      Object.fromEntries(
        SLOTS.map((slot) => [slot, [project.document.selection[slot]]]),
      ) as Record<WardrobeSlot, Array<string | null>>,
  );
  const [separates, setSeparates] = useState(
    !project.document.selection.fullBody,
  );
  const [hairs, setHairs] = useState<Array<string | null>>([appearance.hairId]);
  const [faces, setFaces] = useState<Array<string | null>>([appearance.faceId]);
  const [colors, setColors] = useState<Array<AppearanceHairColor | null>>([
    appearance.hairColor,
  ]);
  const availableActions = ACTIONS.filter(
    (action) => pool.archive.manifest.animations[action],
  );
  const [actions, setActions] = useState<PortableAnimationName[]>(
    ACTIONS.filter((action) => project.archive.manifest.animations[action]),
  );
  const [facings, setFacings] = useState<Facing[]>(["right", "left"]);
  const [mode, setMode] = useState<"auto" | "exhaustive" | "representative">(
    "auto",
  );
  const [maxLooks, setMaxLooks] = useState(12),
    [maxSamples, setMaxSamples] = useState(240),
    [poses, setPoses] = useState(4);
  const [reference, setReference] = useState<"current" | "original">("current");
  const [plan, setPlan] = useState<CombinationPlan | null>(null),
    [report, setReport] = useState<CombinationReport | null>(null);
  const [importedRequest, setImportedRequest] =
    useState<CombinationRequest | null>(null);
  const [dirty, setDirty] = useState(true),
    [liveRows, setLiveRows] = useState<CombinationRow[]>([]);
  const [busy, setBusy] = useState(""),
    [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(""),
    [sheetKeys, setSheetKeys] = useState<string[]>([]);
  const [sort, setSort] = useState("sequence");
  const [preview, setPreview] = useState<{
    caseId: string;
    planId: string;
    pair: CombinationBuiltCase;
  } | null>(null);
  const [previewError, setPreviewError] = useState(""),
    [action, setAction] = useState<PortableAnimationName>(
      availableActions[0] ?? "idle",
    );
  const [position, setPosition] = useState(0),
    [facing, setFacing] = useState<Facing>("right"),
    [playing, setPlaying] = useState(false);
  const [canvasMode, setCanvasMode] = useState<ReviewCanvasMode>("split"),
    [region, setRegion] = useState<RegionName>("full");
  const [backdrop, setBackdrop] = useState<"cream" | "dark" | "checker">(
    "checker",
  );
  const rows = busy === "scan" ? liveRows : (report?.rows ?? []);
  const row = rows.find((item) => rowKey(item) === selected);
  const chosenCase = plan?.cases.find((item) => item.id === row?.caseId);
  const shown =
    preview && preview.caseId === row?.caseId && preview.planId === plan?.id
      ? preview.pair
      : null;
  const clip = shown?.comparison.manifest.animations[action];
  const frameId = clip?.frames[Math.min(position, clip.frames.length - 1)];
  const sortedRows = useMemo(
    () =>
      rows
        .map((value, index) => ({ value, index }))
        .sort((a, b) => {
          const score = (r: CombinationRow) =>
            sort === "changed"
              ? (r.metrics?.changedPixels ?? -1)
              : sort === "alpha"
                ? r.metrics
                  ? r.metrics.alphaAdded + r.metrics.alphaRemoved
                  : -1
                : sort === "motion"
                  ? (r.motion?.metrics.residual.meanDelta ?? -1)
                  : 0;
          return score(b.value) - score(a.value) || a.index - b.index;
        }),
    [rows, sort],
  );
  const editFactors = () => {
    setDirty(true);
    setImportedRequest(null);
    setNotice("");
  };
  const begin = (kind: string) => {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    const id = ++operationNumber.current;
    setBusy(kind);
    setError("");
    setNotice("");
    setPlaying(false);
    return {
      controller,
      valid: () => alive.current && id === operationNumber.current,
    };
  };
  const fail = (cause: unknown, valid: () => boolean, signal: AbortSignal) => {
    if (valid())
      signal.aborted
        ? setNotice("Cancelled. Previously completed results are retained.")
        : setError(message(cause));
  };
  const resetAnalysis = () => {
    setPlan(null);
    setReport(null);
    setLiveRows([]);
    setSelected("");
    setSheetKeys([]);
    setDirty(true);
    setImportedRequest(null);
  };
  useEffect(() => {
    alive.current = true;
    const focus = document.activeElement;
    dialog.current?.showModal();
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      alive.current = false;
      operation.current?.abort();
      previewController.current?.abort();
      dispose(pairRef.current);
      pairRef.current = null;
      document.removeEventListener("visibilitychange", pause);
      dialog.current?.close();
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus();
    };
  }, []);
  useEffect(() => {
    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setPreview(null);
    setPreviewError("");
    dispose(pairRef.current);
    pairRef.current = null;
    if (!plan || !row || row.error) return;
    void buildCombinationCase(pool, plan, row.caseId, {
      signal: controller.signal,
    })
      .then((pair) => {
        if (controller.signal.aborted || !alive.current) {
          dispose(pair);
          return;
        }
        pairRef.current = pair;
        setPreview({ caseId: row.caseId, planId: plan.id, pair });
      })
      .catch((cause) => {
        if (!controller.signal.aborted && alive.current)
          setPreviewError(message(cause));
      });
    return () => controller.abort();
  }, [pool, plan, row?.caseId, !!row?.error]);
  useEffect(() => {
    if (!playing || !clip || busy) return;
    let raf = 0,
      previous: number | null = null,
      elapsed = (position * 1000) / clip.fps;
    const duration = (clip.frames.length * 1000) / clip.fps;
    const tick = (now: number) => {
      if (document.hidden) {
        setPlaying(false);
        return;
      }
      elapsed += previous === null ? 0 : now - previous;
      previous = now;
      if (!clip.loop && elapsed >= duration) {
        setPosition(clip.frames.length - 1);
        setPlaying(false);
        return;
      }
      if (clip.loop) elapsed %= duration;
      setPosition(
        Math.min(
          clip.frames.length - 1,
          Math.floor((elapsed * clip.fps) / 1000),
        ),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Position is the starting position; updates within this playback must not restart its clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, clip, busy]);

  function request(): CombinationRequest {
    if (importedRequest) return importedRequest;
    const outfits: CombinationOutfit[] = [];
    const add = (selection: WardrobeSelection) => {
      if (
        outfits.some(
          (o) => JSON.stringify(o.selection) === JSON.stringify(selection),
        )
      )
        return;
      if (outfits.length >= 16)
        throw Error(
          "Choose fewer clothing options: at most 16 distinct outfits can be planned at once.",
        );
      const name =
        Object.values(selection)
          .filter(Boolean)
          .map(
            (id) =>
              pool.items.find((item) => item.manifest.id === id)?.manifest
                .name ?? id,
          )
          .join(" + ") || "Original clothing";
      outfits.push({
        id: `outfit-${String(outfits.length + 1).padStart(3, "0")}`,
        name: name.slice(0, 120),
        selection,
      });
    };
    if (separates)
      for (const top of slots.top)
        for (const bottom of slots.bottom)
          for (const shoes of slots.shoes)
            add({ top, bottom, fullBody: null, shoes });
    for (const fullBody of slots.fullBody.filter((id) => id !== null))
      for (const shoes of slots.shoes)
        add({ top: null, bottom: null, fullBody, shoes });
    return {
      outfits,
      hairIds: hairs,
      faceIds: faces,
      hairColors: colors,
      actions,
      facings,
      mode,
      maxLooks,
      maxSamples,
      posesPerAction: poses,
      referenceSelection:
        reference === "current" ? project.document.selection : ORIGINAL,
    };
  }
  async function planNow() {
    const op = begin("plan");
    try {
      const next = await createCombinationPlan(pool, request(), {
        signal: op.controller.signal,
      });
      active(op.controller.signal);
      if (op.valid()) {
        setPlan(next);
        setReport(null);
        setLiveRows([]);
        setSelected("");
        setSheetKeys([]);
        setDirty(false);
        setNotice("Plan ready. Review coverage before starting the scan.");
      }
    } catch (cause) {
      fail(cause, op.valid, op.controller.signal);
    } finally {
      if (op.valid()) setBusy("");
    }
  }
  async function scanNow() {
    if (!plan || dirty) return;
    const op = begin("scan");
    setLiveRows([]);
    setProgress({ done: 0, total: plan.coverage.plannedPositions });
    try {
      const next = await scanCombinationPlan(pool, plan, {
        signal: op.controller.signal,
        onProgress: (done, total, sample) => {
          if (op.valid()) {
            setProgress({ done, total });
            setLiveRows((prev) => [...prev, sample]);
          }
        },
      });
      if (op.valid()) {
        setReport(next);
        setSelected(next.rows[0] ? rowKey(next.rows[0]) : "");
        if (next.rows[0]) {
          setAction(next.rows[0].action);
          setPosition(next.rows[0].position);
          setFacing(next.rows[0].facing);
        }
        const good = next.rows.filter((r) => !r.error).slice(0, 8);
        setSheetKeys(good.map(rowKey));
        setNotice(
          `${next.status === "cancelled" ? "Scan cancelled" : "Scan complete"}: ${next.completedSamples} completed samples, ${next.failedSamples} failed. Visual review is still required.`,
        );
      }
    } catch (cause) {
      fail(cause, op.valid, op.controller.signal);
    } finally {
      if (op.valid()) setBusy("");
    }
  }
  async function loadPool() {
    if (!onLoadItems) return;
    const op = begin("load");
    try {
      const ids = [
        ...new Set([...pool.items.map((i) => i.manifest.id), ...poolIds]),
      ];
      if (ids.length > 16)
        throw Error(
          "The local review pool supports at most 16 clothing items. Choose fewer additions.",
        );
      const next = await onLoadItems(ids, op.controller.signal);
      active(op.controller.signal);
      if (
        next.registration.sourceSha256 !== pool.registration.sourceSha256 ||
        JSON.stringify(next.registration) !== JSON.stringify(pool.registration)
      )
        throw Error(
          "Loaded clothing belongs to a different source or registration.",
        );
      if (op.valid()) {
        setPool(next);
        setPoolIds(next.items.map((i) => i.manifest.id));
        resetAnalysis();
        setNotice(
          "Clothing loaded into this review session. Select factors and make a new plan.",
        );
      }
    } catch (cause) {
      fail(cause, op.valid, op.controller.signal);
    } finally {
      if (op.valid()) setBusy("");
    }
  }
  async function importReport(file: File | undefined) {
    if (!file) return;
    const op = begin("import");
    try {
      if (file.size > COMBINATION_REPORT_MAX_BYTES)
        throw Error("Choose a JSON report no larger than 4 MiB.");
      const text = await file.text();
      active(op.controller.signal);
      const raw: unknown = JSON.parse(text);
      const savedRequest = (raw as { plan?: { request?: CombinationRequest } })
        ?.plan?.request;
      if (!savedRequest) throw Error("This file has no combination plan.");
      const nextPlan = await createCombinationPlan(pool, savedRequest, {
        signal: op.controller.signal,
      });
      const next = await parseCombinationReport(text, pool, nextPlan, {
        signal: op.controller.signal,
      });
      active(op.controller.signal);
      if (op.valid()) {
        setPlan(nextPlan);
        setReport(next);
        setImportedRequest(nextPlan.request);
        setDirty(false);
        setLiveRows([]);
        setSelected(next.rows[0] ? rowKey(next.rows[0]) : "");
        if (next.rows[0]) {
          setAction(next.rows[0].action);
          setPosition(next.rows[0].position);
          setFacing(next.rows[0].facing);
        }
        setSheetKeys(
          next.rows
            .filter((r) => !r.error)
            .slice(0, 8)
            .map(rowKey),
        );
        setNotice(
          "Matching report reopened with its review notes. Imported measurements are unverified diagnostic data; rerun the scan to verify them. Changing factors starts a new plan.",
        );
      }
    } catch (cause) {
      fail(cause, op.valid, op.controller.signal);
    } finally {
      if (op.valid()) setBusy("");
    }
  }
  function updateReview(
    patch: Partial<Pick<CombinationRow, "manualReview" | "note">>,
  ) {
    setReport((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              rowKey(r) === selected ? { ...r, ...patch } : r,
            ),
          }
        : prev,
    );
  }
  function inspect(sample: CombinationRow) {
    setSelected(rowKey(sample));
    setAction(sample.action);
    setPosition(sample.position);
    setFacing(sample.facing);
    setPlaying(false);
  }
  async function useLook() {
    if (!shown || !clip) return;
    const op = begin("apply");
    try {
      await onUseLook(
        shown.project,
        action,
        position,
        facing,
        shown.referenceProject,
      );
      if (op.valid()) setNotice("Combination applied for review.");
    } catch (cause) {
      fail(cause, op.valid, op.controller.signal);
    } finally {
      if (op.valid()) setBusy("");
    }
  }
  async function exportSheets() {
    if (!plan || !report) return;
    const chosen = report.rows.filter(
      (r) => sheetKeys.includes(rowKey(r)) && !r.error,
    );
    const op = begin("export");
    setProgress({ done: 0, total: chosen.length });
    let built: CombinationBuiltCase | null = null;
    try {
      if (!chosen.length || chosen.length > 24)
        throw Error(
          "Choose between 1 and 24 successful samples for contact sheets.",
        );
      const entries: Record<string, Uint8Array> = {
        "combination-report.json": strToU8(serializeCombinationReport(report)),
      };
      const hashes: Array<{ file: string; sha256: string; bytes: number }> = [];
      const samples: unknown[] = [];
      let totalBytes = entries["combination-report.json"].length;
      let sheet: HTMLCanvasElement | null = null,
        context: CanvasRenderingContext2D | null = null;
      const add = async (file: string, data: Uint8Array) => {
        active(op.controller.signal);
        totalBytes += data.length;
        if (totalBytes > 32 * 1024 * 1024)
          throw Error("Contact-sheet data exceeds the 32 MiB review limit.");
        entries[file] = data;
        hashes.push({ file, sha256: await sha256(data), bytes: data.length });
      };
      hashes.push({
        file: "combination-report.json",
        sha256: await sha256(entries["combination-report.json"]),
        bytes: entries["combination-report.json"].length,
      });
      let previousCase = "";
      for (const [index, sample] of chosen.entries()) {
        active(op.controller.signal);
        if (!built || previousCase !== sample.caseId) {
          dispose(built);
          built = null;
          built = await buildCombinationCase(pool, plan, sample.caseId, {
            signal: op.controller.signal,
          });
          previousCase = sample.caseId;
        }
        const size = built.comparison.manifest.spritesheet;
        const crop = clampReviewRegion(
          size.frameWidth,
          size.frameHeight,
          regionFor(pool, built, sample.frameId, region),
        );
        const factor = Math.max(
          1,
          Math.ceil(Math.max(crop.width / 176, crop.height / 264)),
        );
        const before = reducedCrop(
          built.comparison.renderSourceFrame(sample.frameId),
          crop,
          sample.facing,
          factor,
        );
        const after = reducedCrop(
          built.comparison.renderFrame(sample.frameId),
          crop,
          sample.facing,
          factor,
        );
        const stem = `samples/${String(index + 1).padStart(2, "0")}`;
        await add(`${stem}-before.png`, await encodeSourceRgbaPngAsync(before));
        await add(`${stem}-after.png`, await encodeSourceRgbaPngAsync(after));
        if (index % 4 === 0) {
          sheet = document.createElement("canvas");
          sheet.width = 400;
          sheet.height = 48 + Math.min(4, chosen.length - index) * 312;
          context = sheet.getContext("2d")!;
          context.fillStyle = "#eeeade";
          context.fillRect(0, 0, sheet.width, sheet.height);
          context.fillStyle = "#233e33";
          context.font = "14px sans-serif";
          context.fillText(
            "Same appearance baseline     Selected clothing",
            12,
            24,
          );
        }
        const y = 48 + (index % 4) * 312;
        context!.fillStyle = "#233e33";
        context!.font = "12px sans-serif";
        context!.fillText(
          `${index + 1}. ${sample.action} ${sample.position + 1} / pose ${sample.frameId} / ${sample.facing}`,
          12,
          y + 16,
        );
        context!.fillText(
          `Native crop ${crop.width}×${crop.height}; integer reduction ÷${factor}`,
          12,
          y + 32,
        );
        context!.imageSmoothingEnabled = false;
        context!.drawImage(pictureCanvas(before), 12, y + 40);
        context!.drawImage(pictureCanvas(after), 212, y + 40);
        samples.push({
          key: rowKey(sample),
          caseId: sample.caseId,
          candidateBinding: plan.cases.find((c) => c.id === sample.caseId)!
            .candidateBinding,
          referenceBinding: plan.cases.find((c) => c.id === sample.caseId)!
            .referenceBinding,
          action: sample.action,
          position: sample.position,
          frameId: sample.frameId,
          facing: sample.facing,
          startMs: sample.startMs,
          durationMs: sample.durationMs,
          nativeCrop: crop,
          integerReduction: factor,
          width: before.width,
          height: before.height,
          before: `${stem}-before.png`,
          after: `${stem}-after.png`,
        });
        if (index % 4 === 3 || index === chosen.length - 1)
          await add(
            `sheets/page-${Math.floor(index / 4) + 1}.png`,
            await canvasBytes(sheet!),
          );
        if (op.valid()) setProgress({ done: index + 1, total: chosen.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      dispose(built);
      built = null;
      active(op.controller.signal);
      entries["manifest.json"] = strToU8(
        JSON.stringify(
          {
            format: "gathria-combination-contact-review",
            version: 1,
            planId: plan.id,
            binding: plan.binding,
            region,
            samples,
            files: hashes,
            note: "Fresh local compositor renders; nearest samples at an explicitly recorded integer reduction. PNGs retain RGBA. Contact pages add a neutral matte and labels. Review derivatives are not native CharacterPack exports or visual approval.",
          },
          null,
          2,
        ),
      );
      const zip = zipSync(entries, { level: 6 });
      active(op.controller.signal);
      if (op.valid()) {
        downloadBlob(
          new Blob([new Uint8Array(zip)], { type: "application/zip" }),
          "combination-contact-review.zip",
        );
        setNotice(
          `Exported ${chosen.length} actual-render sample pairs with a hash manifest and review report.`,
        );
      }
    } catch (cause) {
      fail(cause, op.valid, op.controller.signal);
    } finally {
      dispose(built);
      if (op.valid()) setBusy("");
    }
  }

  return (
    <dialog
      ref={dialog}
      className="combination-workbench"
      aria-label="Combination review workbench"
      onCancel={(event) => {
        event.preventDefault();
        if (busy !== "apply") onClose();
      }}
    >
      <header className="combination-header">
        <div>
          <h2>Check clothing combinations</h2>
          <p>
            Plan a bounded review, inspect actual frames, and keep notes before
            using a look.
          </p>
        </div>
        <button
          type="button"
          disabled={busy === "apply"}
          onClick={onClose}
          aria-label="Close combination review"
        >
          Close
        </button>
      </header>
      <div className="combination-body">
        <aside className="combination-factors">
          {onLoadItems && availableItems.length > 0 && (
            <details>
              <summary>Add clothing to check</summary>
              <p>
                Load a local review pool of up to 16 items. Your current look
                stays unchanged.
              </p>
              <fieldset disabled={!!busy}>
                <legend>Available clothing</legend>
                {availableItems.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={poolIds.includes(item.id)}
                      disabled={pool.items.some(
                        (loaded) => loaded.manifest.id === item.id,
                      )}
                      onChange={() => setPoolIds(toggle(poolIds, item.id))}
                    />
                    {item.name} · {SLOT_NAMES[item.slot]}
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void loadPool()}
              >
                Load selected clothing
              </button>
            </details>
          )}
          <fieldset disabled={!!busy}>
            <legend>Clothing factors</legend>
            <label>
              <input
                type="checkbox"
                checked={separates}
                onChange={() => {
                  setSeparates(!separates);
                  editFactors();
                }}
              />
              Include separates
            </label>
            {SLOTS.map((slot) => (
              <fieldset key={slot}>
                <legend>{SLOT_NAMES[slot]}</legend>
                {slot !== "fullBody" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={slots[slot].includes(null)}
                      onChange={() => {
                        setSlots({
                          ...slots,
                          [slot]: toggle(slots[slot], null),
                        });
                        editFactors();
                      }}
                    />
                    Original {slot}
                  </label>
                )}
                {pool.items
                  .filter((item) => item.manifest.slot === slot)
                  .map((item) => (
                    <label key={item.manifest.id}>
                      <input
                        type="checkbox"
                        checked={slots[slot].includes(item.manifest.id)}
                        onChange={() => {
                          setSlots({
                            ...slots,
                            [slot]: toggle(slots[slot], item.manifest.id),
                          });
                          editFactors();
                        }}
                      />
                      {item.manifest.name}
                    </label>
                  ))}
              </fieldset>
            ))}
            <small>
              Separates combine top × bottom × shoes; one-pieces replace both
              top and bottom. At most 16 distinct outfits per plan.
            </small>
          </fieldset>
          <fieldset disabled={!!busy}>
            <legend>Appearance factors</legend>
            <p>
              Only the verified appearance bank loaded in this project is
              available. Choose other hair in the wardrobe first to load its
              bank.
            </p>
            {(["hair", "face"] as const).map((slot) => {
              const values = slot === "hair" ? hairs : faces,
                set = slot === "hair" ? setHairs : setFaces;
              return (
                <fieldset key={slot}>
                  <legend>{slot === "hair" ? "Hair" : "Face"}</legend>
                  {[
                    { id: null, name: `Original ${slot}` },
                    ...(pool.appearanceBank?.manifest.styles.filter(
                      (style) => style.slot === slot,
                    ) ?? []),
                  ].map((style) => (
                    <label key={style.id ?? "original"}>
                      <input
                        type="checkbox"
                        checked={values.includes(style.id)}
                        onChange={() => {
                          set(toggle(values, style.id));
                          editFactors();
                        }}
                      />
                      {style.name}
                    </label>
                  ))}
                </fieldset>
              );
            })}
            <fieldset>
              <legend>Hair color</legend>
              {APPEARANCE_HAIR_COLORS.map((color) => (
                <label key={color}>
                  <input
                    type="checkbox"
                    checked={colors.includes(color)}
                    onChange={() => {
                      setColors(toggle(colors, color));
                      editFactors();
                    }}
                  />
                  {color}
                </label>
              ))}
            </fieldset>
          </fieldset>
          <fieldset disabled={!!busy}>
            <legend>Actions</legend>
            {availableActions.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={actions.includes(name)}
                  onChange={() => {
                    setActions(toggle(actions, name));
                    editFactors();
                  }}
                />
                {name}
              </label>
            ))}
          </fieldset>
          <fieldset disabled={!!busy}>
            <legend>Facing</legend>
            {(["right", "left"] as const).map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={facings.includes(name)}
                  onChange={() => {
                    setFacings(toggle(facings, name));
                    editFactors();
                  }}
                />
                {name}
              </label>
            ))}
          </fieldset>
          <fieldset disabled={!!busy}>
            <legend>Coverage limits</legend>
            <label>
              Clothing baseline
              <select
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value as typeof reference);
                  editFactors();
                }}
              >
                <option value="current">Current clothing</option>
                <option value="original">Original clothing</option>
              </select>
            </label>
            <p>
              Each baseline always uses the same hair, face and hair color as
              its candidate.
            </p>
            <label>
              Coverage mode
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as typeof mode);
                  editFactors();
                }}
              >
                <option value="auto">Automatic within limits</option>
                <option value="exhaustive">
                  Exhaustive requested combinations
                </option>
                <option value="representative">
                  Representative combinations
                </option>
              </select>
            </label>
            <label>
              Maximum looks
              <input
                type="number"
                min={1}
                max={COMBINATION_MAX_LOOKS}
                value={maxLooks}
                onChange={(e) => {
                  setMaxLooks(Number(e.target.value));
                  editFactors();
                }}
              />
            </label>
            <label>
              Maximum samples
              <input
                type="number"
                min={1}
                max={COMBINATION_MAX_SAMPLES}
                value={maxSamples}
                onChange={(e) => {
                  setMaxSamples(Number(e.target.value));
                  editFactors();
                }}
              />
            </label>
            <label>
              Poses per action
              <input
                type="number"
                min={1}
                max={120}
                value={poses}
                onChange={(e) => {
                  setPoses(Number(e.target.value));
                  editFactors();
                }}
              />
            </label>
          </fieldset>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void planNow()}
          >
            Plan combinations
          </button>
        </aside>
        <main className="combination-content">
          {error && (
            <p role="alert" className="combination-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {busy && (
            <div
              data-testid="combination-progress"
              data-completed={progress.done}
              data-total={progress.total}
              role="status"
            >
              <p>
                {busy === "scan"
                  ? "Scanning"
                  : busy === "export"
                    ? "Rendering contact sheets"
                    : busy === "load"
                      ? "Loading clothing"
                      : busy === "apply"
                        ? "Applying combination"
                        : "Preparing review"}
                {progress.total > 0 && ["scan", "export"].includes(busy)
                  ? `: ${progress.done} / ${progress.total}`
                  : "…"}
              </p>
              {["scan", "export"].includes(busy) && (
                <progress
                  value={progress.done}
                  max={Math.max(1, progress.total)}
                />
              )}
              {busy !== "apply" && (
                <button
                  type="button"
                  onClick={() => operation.current?.abort()}
                >
                  {busy === "scan" ? "Cancel scan" : "Cancel operation"}
                </button>
              )}
            </div>
          )}
          {plan && (
            <section
              data-testid="combination-coverage"
              className="combination-panel"
            >
              <h3>Planned coverage</h3>
              <p>
                {plan.coverage.mode}: {plan.coverage.selectedCombinations} /{" "}
                {plan.coverage.totalCombinations} combinations ·{" "}
                {plan.coverage.plannedPositions} /{" "}
                {plan.coverage.totalPositions} static frame samples ·{" "}
                {plan.coverage.coveredPairs} / {plan.coverage.totalPairs} factor
                pairs.
              </p>
              <p>
                Exhaustive combinations do not imply every animation frame was
                sampled. Motion checks compare each sampled pose to its real
                next timeline position.
              </p>
              {dirty && (
                <p role="status">
                  Factors changed. Make a new plan before scanning.
                </p>
              )}
              {importedRequest && (
                <p>
                  Reopened plan uses its saved factors. Edit any factor to
                  create a new plan from the controls.
                </p>
              )}
              <details>
                <summary>Untested positions and factor pairs</summary>
                {plan.coverage.positionCoverage.map((coverage) => (
                  <p key={coverage.action}>
                    {coverage.action}: sampled positions [
                    {coverage.sampledPositions.join(", ")}]; untested [
                    {coverage.untestedPositions.join(", ")}]; motion endpoints [
                    {coverage.motionTestedPositions.join(", ")}]. Positions are
                    zero-based.
                  </p>
                ))}
                <p>
                  {plan.coverage.missingPairs.length
                    ? plan.coverage.missingPairs.join("; ")
                    : "All requested factor pairs are covered by the selected combinations."}
                </p>
              </details>
              {plan.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <button
                type="button"
                disabled={!!busy || dirty}
                onClick={() => void scanNow()}
              >
                Scan planned combinations
              </button>
            </section>
          )}
          <section className="combination-panel">
            <h3>Reports and contact sheets</h3>
            <p>
              Reports bind to the exact source, registration, clothing pool and
              appearance bank. Reopening applies notes only after all checks
              pass.
            </p>
            <div className="combination-toolbar">
              <button
                type="button"
                disabled={!!busy || !report}
                onClick={() => {
                  if (report)
                    downloadBlob(
                      new Blob([serializeCombinationReport(report)], {
                        type: "application/json",
                      }),
                      "combination-review.json",
                    );
                }}
              >
                Save combination report
              </button>
              <label className="combination-upload">
                Open report
                <input
                  aria-label="Combination report file"
                  type="file"
                  accept=".json,application/json"
                  disabled={!!busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void importReport(file);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={
                  !!busy ||
                  !report ||
                  !sheetKeys.length ||
                  sheetKeys.length > 24
                }
                onClick={() => void exportSheets()}
              >
                Download selected contact sheets
              </button>
            </div>
            <p>
              {sheetKeys.length} / 24 samples selected for actual-render sheets.
              Uses the current region; large regions use a recorded integer
              reduction. Native crops remain available in the inspection canvas.
            </p>
          </section>
          <section
            data-testid="combination-results"
            className="combination-panel"
          >
            <h3>Completed samples ({rows.length})</h3>
            <p>
              Differences and motion residuals help locate changes. They are not
              an art score or an automatic defect verdict.
            </p>
            <label>
              Sort samples
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="sequence">Scan sequence</option>
                <option value="changed">Changed pixels</option>
                <option value="alpha">Alpha changes</option>
                <option value="motion">Motion residual</option>
              </select>
            </label>
            <div className="combination-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th>Sample</th>
                    <th>Clothing / appearance</th>
                    <th>Changes</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(({ value: sample, index }) => {
                    const c = plan?.cases.find(
                      (item) => item.id === sample.caseId,
                    );
                    return (
                      <tr
                        key={rowKey(sample)}
                        aria-selected={selected === rowKey(sample)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Include sample ${index + 1} in contact sheets`}
                            disabled={
                              !!busy ||
                              !!sample.error ||
                              (!sheetKeys.includes(rowKey(sample)) &&
                                sheetKeys.length >= 24)
                            }
                            checked={sheetKeys.includes(rowKey(sample))}
                            onChange={() =>
                              setSheetKeys(toggle(sheetKeys, rowKey(sample)))
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            aria-label={`Inspect sample ${index + 1}`}
                            disabled={busy === "apply"}
                            onClick={() => inspect(sample)}
                          >
                            {index + 1}. {sample.action} {sample.position + 1} ·{" "}
                            {sample.facing}
                            <br />
                            pose {sample.frameId}
                          </button>
                        </td>
                        <td>
                          {c?.name}
                          <small>
                            Hair: {c?.appearance.hairId ?? "original"} · Face:{" "}
                            {c?.appearance.faceId ?? "original"} ·{" "}
                            {c?.appearance.hairColor}
                          </small>
                        </td>
                        <td>
                          {sample.error ? (
                            <span role="status">{sample.error}</span>
                          ) : (
                            <>
                              {sample.metrics?.changedPixels.toLocaleString()}{" "}
                              pixels
                              <br />α +{sample.metrics?.alphaAdded} / −
                              {sample.metrics?.alphaRemoved}
                              <br />
                              motion{" "}
                              {sample.motion
                                ? sample.motion.metrics.residual.meanDelta.toFixed(
                                    4,
                                  )
                                : "n/a"}
                            </>
                          )}
                        </td>
                        <td>{sample.manualReview}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {row && (
            <section className="combination-panel combination-inspector">
              <h3>Inspect selected combination</h3>
              <p>
                {chosenCase?.name}. The main wardrobe is unchanged while you
                inspect.
              </p>
              {previewError && <p role="alert">{previewError}</p>}
              {row.error && <p role="alert">{row.error}</p>}
              {!shown && !previewError && !row.error && (
                <p role="status">Preparing selected look…</p>
              )}
              {shown && frameId !== undefined && (
                <>
                  <div className="combination-toolbar">
                    <label>
                      Preview action
                      <select
                        value={action}
                        disabled={!!busy}
                        onChange={(e) => {
                          setPlaying(false);
                          setAction(e.target.value as PortableAnimationName);
                          setPosition(0);
                        }}
                      >
                        {availableActions.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Preview facing
                      <select
                        value={facing}
                        disabled={!!busy}
                        onChange={(e) => setFacing(e.target.value as Facing)}
                      >
                        <option value="right">right</option>
                        <option value="left">left</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        if (
                          !playing &&
                          !clip?.loop &&
                          position === (clip?.frames.length ?? 1) - 1
                        )
                          setPosition(0);
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? "Pause preview" : "Play selected combination"}
                    </button>
                    <label>
                      Preview position
                      <input
                        type="range"
                        min={0}
                        max={(clip?.frames.length ?? 1) - 1}
                        value={position}
                        disabled={!!busy}
                        onChange={(e) => {
                          setPlaying(false);
                          setPosition(Number(e.target.value));
                        }}
                      />
                    </label>
                  </div>
                  <p>
                    Position {position + 1} / {clip?.frames.length}; source pose{" "}
                    {frameId}; {clip?.fps} fps;{" "}
                    {clip?.loop ? "loop" : "one-shot"}. In-place playback;
                    source timing is preserved.
                  </p>
                  <div className="combination-toolbar">
                    <label>
                      Comparison view
                      <select
                        value={canvasMode}
                        onChange={(e) =>
                          setCanvasMode(e.target.value as ReviewCanvasMode)
                        }
                      >
                        <option value="split">Side by side</option>
                        <option value="overlay">50% overlay</option>
                        <option value="difference">Pixel difference</option>
                      </select>
                    </label>
                    <label>
                      Review region
                      <select
                        value={region}
                        onChange={(e) =>
                          setRegion(e.target.value as RegionName)
                        }
                      >
                        {[
                          "full",
                          "head",
                          "neckline",
                          "waist",
                          "hands",
                          "feet",
                        ].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Review background
                      <select
                        value={backdrop}
                        onChange={(e) =>
                          setBackdrop(e.target.value as typeof backdrop)
                        }
                      >
                        <option value="checker">checker</option>
                        <option value="cream">cream</option>
                        <option value="dark">dark</option>
                      </select>
                    </label>
                  </div>
                  <div className="combination-canvas">
                    <ReviewCanvas
                      comparison={shown.comparison}
                      frameId={frameId}
                      facing={facing}
                      region={regionFor(pool, shown, frameId, region)}
                      mode={canvasMode}
                      backdrop={backdrop}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void useLook()}
                  >
                    Use this combination and review
                  </button>
                </>
              )}
              <fieldset disabled={!!busy || !report}>
                <legend>
                  Review note for sampled {row.action}, position{" "}
                  {row.position + 1}, {row.facing}
                </legend>
                <p>
                  This status belongs to the selected scan sample, even when
                  previewing another pose.
                </p>
                <label>
                  Sample review status
                  <select
                    value={row.manualReview}
                    onChange={(e) =>
                      updateReview({
                        manualReview: e.target
                          .value as CombinationRow["manualReview"],
                      })
                    }
                  >
                    <option value="unreviewed">Unreviewed</option>
                    <option value="issue">Issue observed</option>
                    <option value="checked" disabled={!!row.error}>
                      Checked visually
                    </option>
                  </select>
                </label>
                <label>
                  Sample review note
                  <textarea
                    value={row.note}
                    maxLength={1000}
                    rows={3}
                    onChange={(e) => updateReview({ note: e.target.value })}
                  />
                </label>
              </fieldset>
            </section>
          )}
        </main>
      </div>
    </dialog>
  );
}
