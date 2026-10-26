import {
  APPEARANCE_HAIR_COLORS,
  type AppearanceHairColor,
  type AppearanceSelection,
} from "../appearance/contract";
import type { RgbaPng } from "../core/baked-source";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type { Facing, PortableAnimationName } from "../core/types";
import {
  validateWardrobeDocument,
  type WardrobeProject,
  type WardrobeSelection,
} from "./contract";
import {
  createWardrobeCompositor,
  type WardrobeCompositor,
} from "./compositor";
import { createLookComparison, type LookComparison } from "./look-comparison";
import { analyzeMotionEdge, type MotionMetrics } from "./motion-review";
import {
  getWardrobeAppearanceSelection,
  readWardrobeGarment,
  validateWardrobeProject,
} from "./project";
import { analyzeReviewFrame, type ReviewFrameMetrics } from "./review-analysis";
import { createReviewBinding, type ReviewBinding } from "./review-document";

export const COMBINATION_MAX_LOOKS = 24;
export const COMBINATION_MAX_SAMPLES = 600;
export const COMBINATION_REPORT_MAX_BYTES = 4 * 1024 * 1024;
const MAX_UNIVERSE = 16 * 9 * 9 * 4;
const MAX_PIXEL_WORK = 1024 * 1024 * 1024;
const ACTIONS: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const DIAGNOSTIC =
  "Rendered differences and motion residuals are review signals, not defect severity or visual approval. Sampled positions do not establish full-cycle smoothness. Baked themes are unavailable as wardrobe factors.";

export interface CombinationOutfit {
  id: string;
  name: string;
  selection: WardrobeSelection;
}
export interface CombinationRequest {
  outfits: CombinationOutfit[];
  hairIds?: Array<string | null>;
  faceIds?: Array<string | null>;
  hairColors?: Array<AppearanceHairColor | null>;
  actions?: PortableAnimationName[];
  facings?: Facing[];
  referenceSelection?: WardrobeSelection;
  mode?: "auto" | "exhaustive" | "representative";
  maxLooks?: number;
  maxSamples?: number;
  posesPerAction?: number;
}
export interface CombinationPosition {
  action: PortableAnimationName;
  position: number;
  frameId: number;
  startMs: number;
  durationMs: number;
}
export interface CombinationCase {
  id: string;
  name: string;
  selection: WardrobeSelection;
  appearance: AppearanceSelection;
  factors: {
    outfit: string;
    hair: string | null;
    face: string | null;
    color: AppearanceHairColor | null;
  };
  candidateBinding: ReviewBinding;
  referenceBinding: ReviewBinding;
}
export interface CombinationPlan {
  format: "gathria-combination-plan";
  version: 1;
  id: string;
  binding: ReviewBinding & { inventorySha256: string };
  request: Required<CombinationRequest>;
  cases: CombinationCase[];
  positions: CombinationPosition[];
  coverage: {
    mode: "exhaustive" | "representative";
    totalCombinations: number;
    selectedCombinations: number;
    totalPairs: number;
    coveredPairs: number;
    missingPairs: string[];
    /** Timeline positions × combinations × selected facings, including holds. */
    totalPositions: number;
    plannedPositions: number;
    positionCoverage: Array<{
      action: PortableAnimationName;
      sampledPositions: number[];
      untestedPositions: number[];
      motionTestedPositions: number[];
    }>;
  };
  warnings: string[];
}
export interface CombinationRow extends CombinationPosition {
  caseId: string;
  facing: Facing;
  metrics: ReviewFrameMetrics | null;
  motion: {
    toPosition: number;
    toFrameId: number;
    loopClosure: boolean;
    metrics: MotionMetrics;
  } | null;
  error: string | null;
  manualReview: "unreviewed" | "issue" | "checked";
  note: string;
}
export interface CombinationReport {
  format: "gathria-combination-review";
  version: 1;
  plan: CombinationPlan;
  status: "complete" | "cancelled";
  completedSamples: number;
  failedSamples: number;
  rows: CombinationRow[];
  interpretation: string;
}
export interface CombinationBuiltCase {
  project: WardrobeProject;
  referenceProject: WardrobeProject;
  renderer: WardrobeCompositor;
  referenceRenderer: WardrobeCompositor;
  comparison: LookComparison;
}

const json = (value: unknown) => JSON.stringify(value);
const digest = (value: unknown) =>
  sha256(new TextEncoder().encode(json(value)));
const copy = <T>(value: T): T => JSON.parse(json(value)) as T;
const int = (n: unknown, min: number, max: number, label: string): number => {
  if (!Number.isSafeInteger(n) || (n as number) < min || (n as number) > max)
    throw Error(`${label} must be an integer from ${min} to ${max}.`);
  return n as number;
};
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw Error(`${label} must be nonempty and at most ${max} characters.`);
  return value;
}
function list<T>(value: unknown, max: number, label: string): T[] {
  if (!Array.isArray(value) || !value.length || value.length > max)
    throw Error(`${label} must contain between 1 and ${max} choices.`);
  if (new Set(value.map(json)).size !== value.length)
    throw Error(`${label} cannot contain duplicate choices.`);
  return value as T[];
}
function selectedProject(
  project: WardrobeProject,
  selection: WardrobeSelection,
  appearance?: AppearanceSelection,
): WardrobeProject {
  const document = {
    ...project.document,
    selection,
    ...(project.document.version === 2 && appearance
      ? { appearance: { ...project.document.appearance, ...appearance } }
      : {}),
  };
  return { ...project, document: validateWardrobeDocument(document, project) };
}
function normalizeRequest(
  project: WardrobeProject,
  input: CombinationRequest,
): Required<CombinationRequest> {
  if (!input || typeof input !== "object")
    throw Error("Choose combination factors first.");
  const current = getWardrobeAppearanceSelection(project);
  const outfits = list<CombinationOutfit>(input.outfits, 16, "Outfits")
    .map((outfit) => {
      const id = text(outfit?.id, 80, "Outfit ID"),
        name = text(outfit?.name, 120, "Outfit name");
      return {
        id,
        name,
        selection: selectedProject(project, outfit.selection).document
          .selection,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  if (
    new Set(outfits.map((o) => o.id)).size !== outfits.length ||
    new Set(outfits.map((o) => json(o.selection))).size !== outfits.length
  )
    throw Error(
      "Outfits must have distinct IDs and distinct clothing selections.",
    );
  const ids = (values: Array<string | null>, slot: "hair" | "face") =>
    list<string | null>(values, 9, slot)
      .map((id) => {
        if (
          id !== null &&
          (typeof id !== "string" ||
            !project.appearanceBank?.manifest.styles.some(
              (s) => s.slot === slot && s.id === id,
            ))
        )
          throw Error(
            `Choose ${slot} from this project's verified appearance bank.`,
          );
        return id;
      })
      .sort((a, b) => (a ?? "").localeCompare(b ?? "", "en"));
  const hairIds = ids(input.hairIds ?? [current.hairId], "hair"),
    faceIds = ids(input.faceIds ?? [current.faceId], "face");
  const hairColors = list<AppearanceHairColor | null>(
    input.hairColors ?? [current.hairColor],
    4,
    "Hair colors",
  )
    .map((color) => {
      if (color !== null && !APPEARANCE_HAIR_COLORS.includes(color))
        throw Error("Unsupported hair color.");
      return color;
    })
    .sort((a, b) => (a ?? "").localeCompare(b ?? "", "en"));
  const actions = list<PortableAnimationName>(
    input.actions ??
      ACTIONS.filter((a) => project.archive.manifest.animations[a]),
    5,
    "Actions",
  );
  if (
    actions.some(
      (a) => !ACTIONS.includes(a) || !project.archive.manifest.animations[a],
    )
  )
    throw Error("Choose available source actions.");
  actions.sort((a, b) => ACTIONS.indexOf(a) - ACTIONS.indexOf(b));
  const facings = list<Facing>(
    input.facings ?? ["right", "left"],
    2,
    "Facings",
  );
  if (facings.some((f) => f !== "left" && f !== "right"))
    throw Error("Choose right or left facing.");
  facings.sort((a, b) => (a === b ? 0 : a === "right" ? -1 : 1));
  const mode = input.mode ?? "auto";
  if (!["auto", "exhaustive", "representative"].includes(mode))
    throw Error("Choose a supported combination mode.");
  return {
    outfits,
    hairIds,
    faceIds,
    hairColors,
    actions,
    facings,
    referenceSelection: selectedProject(
      project,
      input.referenceSelection ?? project.document.selection,
    ).document.selection,
    mode,
    maxLooks: int(
      input.maxLooks ?? 12,
      1,
      COMBINATION_MAX_LOOKS,
      "Combination limit",
    ),
    maxSamples: int(
      input.maxSamples ?? 240,
      1,
      COMBINATION_MAX_SAMPLES,
      "Sample limit",
    ),
    posesPerAction: int(input.posesPerAction ?? 4, 1, 120, "Poses per action"),
  };
}
type Choice = Pick<
  CombinationCase,
  "name" | "selection" | "appearance" | "factors"
>;
function pairs(choice: Choice): string[] {
  const values = Object.entries(choice.factors);
  return values.flatMap(([a, x], i) =>
    values.slice(i + 1).map(([b, y]) => json([a, x, b, y])),
  );
}
/** Cover valid factor pairs, including canonical bald/no-color values. Stable
 * greedy tie-breaking follows the sorted candidate list; no random sampling. */
function chooseCases(
  universe: Choice[],
  cap: number,
): { selected: Choice[]; total: Set<string>; covered: Set<string> } {
  const all = universe.map((choice) => ({ choice, pairs: pairs(choice) }));
  const total = new Set(all.flatMap((entry) => entry.pairs)),
    covered = new Set<string>(),
    selected: Choice[] = [];
  while (selected.length < Math.min(cap, all.length)) {
    let best: (typeof all)[number] | undefined,
      score = -1;
    for (const candidate of all) {
      if (selected.includes(candidate.choice)) continue;
      const gain = candidate.pairs.filter((key) => !covered.has(key)).length;
      if (gain > score) {
        score = gain;
        best = candidate;
      }
    }
    if (!best) break;
    selected.push(best.choice);
    best.pairs.forEach((key) => covered.add(key));
  }
  return { selected, total, covered };
}
function plannedPositions(
  project: WardrobeProject,
  request: Required<CombinationRequest>,
): CombinationPosition[] {
  return request.actions.flatMap((action) => {
    const clip = project.archive.manifest.animations[action]!;
    if (clip.frames.length > 600)
      throw Error("An action exceeds the 600-position review limit.");
    // One representative per unique source pose. Holds remain in the coverage
    // ledger; they are not falsely presented as newly rendered poses.
    const unique: number[] = [];
    const seen = new Set<number>();
    clip.frames.forEach((id, position) => {
      if (!seen.has(id)) {
        seen.add(id);
        unique.push(position);
      }
    });
    const count = Math.min(request.posesPerAction, unique.length);
    const sampled =
      count === 1
        ? [unique[0]]
        : Array.from(
            { length: count },
            (_, i) =>
              unique[Math.round((i * (unique.length - 1)) / (count - 1))],
          );
    return sampled.map((position) => ({
      action,
      position,
      frameId: clip.frames[position],
      startMs: (position * 1000) / clip.fps,
      durationMs: 1000 / clip.fps,
    }));
  });
}
async function inventoryBinding(
  project: WardrobeProject,
): Promise<CombinationPlan["binding"]> {
  return {
    ...(await createReviewBinding(project)),
    inventorySha256: await digest({
      items: project.document.items
        .map(({ id, sha256 }) => [id, sha256])
        .sort((a, b) => a[0].localeCompare(b[0], "en")),
      appearanceBank: project.appearanceBank?.sha256 ?? null,
    }),
  };
}
async function planVerified(
  project: WardrobeProject,
  input: CombinationRequest,
): Promise<CombinationPlan> {
  const request = normalizeRequest(project, input),
    positions = plannedPositions(project, request);
  const universe: Choice[] = [];
  for (const outfit of request.outfits)
    for (const hairId of request.hairIds)
      for (const faceId of request.faceIds) {
        const colors =
          hairId === null
            ? [null]
            : [...new Set(request.hairColors.map((c) => c ?? "chestnut"))];
        for (const color of colors)
          universe.push({
            name: `${outfit.name} · ${hairId ?? "original hair"} · ${faceId ?? "original face"} · ${color ?? "source color"}`,
            selection: outfit.selection,
            appearance: { hairId, faceId, hairColor: color ?? "chestnut" },
            factors: { outfit: outfit.id, hair: hairId, face: faceId, color },
          });
      }
  if (!universe.length || universe.length > MAX_UNIVERSE)
    throw Error(
      "The selected factor universe exceeds its bounded combination limit.",
    );
  const padding = project.appearanceBank?.manifest.padding ?? {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  };
  const width = project.registration.frameWidth + padding.left + padding.right,
    height = project.registration.frameHeight + padding.top + padding.bottom;
  // Four frame inputs per static + adjacent-edge measurement. This is a work
  // ceiling, not a promise that arbitrary large images will scan instantly.
  const pixelCap = Math.floor(MAX_PIXEL_WORK / (width * height * 4));
  const sampleCap = Math.min(request.maxSamples, pixelCap);
  const perLook = positions.length * request.facings.length;
  const cap = Math.min(request.maxLooks, Math.floor(sampleCap / perLook));
  if (cap < 1)
    throw Error(
      "The selected poses and facings exceed the sample/pixel budget even for one combination. Reduce poses or actions.",
    );
  if (request.mode === "exhaustive" && universe.length > cap)
    throw Error(
      `Exhaustive review needs ${universe.length} looks and ${universe.length * perLook} samples; this request permits ${cap} looks. Increase bounded limits or explicitly choose representative coverage.`,
    );
  const { selected, total, covered } = chooseCases(universe, cap);
  const binding = await inventoryBinding(project),
    cases: CombinationCase[] = [];
  for (const choice of selected) {
    const candidate = selectedProject(
        project,
        choice.selection,
        choice.appearance,
      ),
      reference = selectedProject(
        project,
        request.referenceSelection,
        choice.appearance,
      );
    cases.push({
      ...choice,
      id: (await digest(choice.factors)).slice(0, 24),
      candidateBinding: await createReviewBinding(candidate),
      referenceBinding: await createReviewBinding(reference),
    });
  }
  const full = cases.length === universe.length;
  const plan: Omit<CombinationPlan, "id"> = {
    format: "gathria-combination-plan",
    version: 1,
    binding,
    request,
    cases,
    positions,
    coverage: {
      mode: full ? "exhaustive" : "representative",
      totalCombinations: universe.length,
      selectedCombinations: cases.length,
      totalPairs: total.size,
      coveredPairs: covered.size,
      missingPairs: [...total].filter((key) => !covered.has(key)).sort(),
      totalPositions:
        universe.length *
        request.facings.length *
        request.actions.reduce(
          (sum, action) =>
            sum + project.archive.manifest.animations[action]!.frames.length,
          0,
        ),
      plannedPositions: cases.length * perLook,
      positionCoverage: request.actions.map((action) => {
        const clip = project.archive.manifest.animations[action]!,
          sampledPositions = positions
            .filter((p) => p.action === action)
            .map((p) => p.position);
        return {
          action,
          sampledPositions,
          untestedPositions: clip.frames.flatMap((_, i) =>
            sampledPositions.includes(i) ? [] : [i],
          ),
          motionTestedPositions: [
            ...new Set(
              sampledPositions.flatMap((i) =>
                i + 1 < clip.frames.length
                  ? [i, i + 1]
                  : clip.loop
                    ? [i, 0]
                    : [],
              ),
            ),
          ].sort((a, b) => a - b),
        };
      }),
    },
    warnings: [
      DIAGNOSTIC,
      ...(!full
        ? [
            `Only ${cases.length} of ${universe.length} valid combinations are planned; ${total.size - covered.size} valid factor pairs remain uncovered.`,
          ]
        : []),
      ...(pixelCap < request.maxSamples
        ? [
            "Native frame dimensions reduced the effective sample cap to stay within the pixel-work budget.",
          ]
        : []),
    ],
  };
  return { ...plan, id: await digest(plan) };
}

export async function createCombinationPlan(
  project: WardrobeProject,
  request: CombinationRequest,
  options: SourcePreparationOptions = {},
): Promise<CombinationPlan> {
  const input = copy(request);
  const verified = await validateWardrobeProject(project, {
    ...options,
    decodeGarments: false,
  });
  assertSourcePreparationActive(options);
  return planVerified(verified, input);
}
async function verifiedPlan(
  project: WardrobeProject,
  plan: CombinationPlan,
  options: SourcePreparationOptions = {},
): Promise<WardrobeProject> {
  if (!plan || typeof plan !== "object" || typeof plan.id !== "string")
    throw Error("Choose a valid combination plan.");
  const snapshot = copy(plan),
    verified = await validateWardrobeProject(project, {
      ...options,
      decodeGarments: false,
    }),
    rebuilt = await planVerified(verified, snapshot.request);
  if (json(rebuilt) !== json(snapshot))
    throw Error(
      "The combination plan no longer matches this source, material inventory, appearance bank or selected reference look. Plan the review again.",
    );
  assertSourcePreparationActive(options);
  return verified;
}
async function builtCase(
  project: WardrobeProject,
  plan: CombinationPlan,
  caseId: string,
  options: SourcePreparationOptions,
): Promise<CombinationBuiltCase> {
  const item = plan.cases.find((entry) => entry.id === caseId);
  if (!item) throw Error("Choose a case in the exact combination plan.");
  const current = selectedProject(project, item.selection, item.appearance),
    reference = selectedProject(
      project,
      plan.request.referenceSelection,
      item.appearance,
    );
  let renderer: WardrobeCompositor | undefined,
    referenceRenderer: WardrobeCompositor | undefined;
  try {
    // Planning verifies bindings without warming every loaded wardrobe page.
    // Here strictly validate only the union of clothes this renderer pair uses;
    // malformed selected PNG streams/masks become technical case failures.
    const used = new Set([
      ...Object.values(current.document.selection),
      ...Object.values(reference.document.selection),
    ]);
    for (const garment of project.items)
      if (used.has(garment.manifest.id))
        await readWardrobeGarment(
          garment.bytes,
          project.registration,
          project.document.registrationSha256,
          options,
        );
    renderer = await createWardrobeCompositor(current, options);
    referenceRenderer = await createWardrobeCompositor(reference, options);
    assertSourcePreparationActive(options);
    return {
      project: current,
      referenceProject: reference,
      renderer,
      referenceRenderer,
      comparison: createLookComparison(
        referenceRenderer,
        renderer,
        reference,
        current,
      ),
    };
  } catch (error) {
    renderer?.dispose();
    referenceRenderer?.dispose();
    throw error;
  }
}
/** Caller owns and must dispose BOTH renderers. Previewing never changes the
 * user's current look; applying a case remains an explicit UI action. */
export async function buildCombinationCase(
  project: WardrobeProject,
  plan: CombinationPlan,
  caseId: string,
  options: SourcePreparationOptions = {},
): Promise<CombinationBuiltCase> {
  const snapshot = copy(plan),
    verified = await verifiedPlan(project, snapshot, options);
  return builtCase(verified, snapshot, caseId, options);
}
function facingImage(input: RgbaPng, facing: Facing): RgbaPng {
  if (facing === "right") return input;
  const pixels = new Uint8Array(input.pixels.length);
  for (let y = 0; y < input.height; y++)
    for (let x = 0; x < input.width; x++) {
      const from = (y * input.width + x) * 4,
        to = (y * input.width + input.width - 1 - x) * 4;
      pixels.set(input.pixels.subarray(from, from + 4), to);
    }
  return { ...input, pixels };
}
export async function scanCombinationPlan(
  project: WardrobeProject,
  plan: CombinationPlan,
  options: SourcePreparationOptions & {
    onProgress?: (
      completed: number,
      total: number,
      row: CombinationRow,
    ) => void;
  } = {},
): Promise<CombinationReport> {
  const snapshot = copy(plan);
  // Bind and own bytes even for a pre-cancelled run: an invalid plan cannot
  // manufacture a plausible partial report by aborting before verification.
  const verified = await verifiedPlan(project, snapshot, {
    signal: options.signal?.aborted ? undefined : options.signal,
  });
  const report: CombinationReport = {
    format: "gathria-combination-review",
    version: 1,
    plan: snapshot,
    status: "complete",
    completedSamples: 0,
    failedSamples: 0,
    rows: [],
    interpretation: DIAGNOSTIC,
  };
  for (const item of snapshot.cases) {
    if (options.signal?.aborted) {
      report.status = "cancelled";
      break;
    }
    let built: CombinationBuiltCase | undefined, failure: string | undefined;
    try {
      built = await builtCase(verified, snapshot, item.id, options);
    } catch (error) {
      if (options.signal?.aborted) {
        report.status = "cancelled";
        break;
      }
      failure =
        error instanceof Error
          ? error.message.slice(0, 1000)
          : "Combination rendering failed.";
    }
    try {
      for (const position of snapshot.positions) {
        if (options.signal?.aborted) {
          report.status = "cancelled";
          break;
        }
        for (const facing of snapshot.request.facings) {
          if (options.signal?.aborted) {
            report.status = "cancelled";
            break;
          }
          const row: CombinationRow = {
            ...position,
            caseId: item.id,
            facing,
            metrics: null,
            motion: null,
            error: null,
            manualReview: "unreviewed",
            note: "",
          };
          try {
            if (failure || !built)
              throw Error(failure ?? "Combination renderer is unavailable.");
            const reference = facingImage(
                built.comparison.renderSourceFrame(position.frameId),
                facing,
              ),
              current = facingImage(
                built.comparison.renderFrame(position.frameId),
                facing,
              );
            row.metrics = analyzeReviewFrame(reference, current);
            const clip = built.comparison.manifest.animations[position.action]!;
            if (position.position + 1 < clip.frames.length || clip.loop) {
              const toPosition = (position.position + 1) % clip.frames.length,
                toFrameId = clip.frames[toPosition];
              const nextReference = facingImage(
                  built.comparison.renderSourceFrame(toFrameId),
                  facing,
                ),
                nextCurrent = facingImage(
                  built.comparison.renderFrame(toFrameId),
                  facing,
                );
              row.motion = {
                toPosition,
                toFrameId,
                loopClosure: toPosition === 0,
                metrics: analyzeMotionEdge(
                  reference,
                  nextReference,
                  current,
                  nextCurrent,
                ),
              };
            }
          } catch (error) {
            row.metrics = null;
            row.motion = null;
            row.error =
              error instanceof Error
                ? error.message.slice(0, 1000)
                : "Frame rendering failed.";
          }
          report.rows.push(row);
          report.completedSamples++;
          if (row.error) report.failedSamples++;
          options.onProgress?.(
            report.completedSamples,
            snapshot.coverage.plannedPositions,
            copy(row),
          );
          // Release all frame buffers before yielding. A run owns only one
          // renderer pair and one four-frame measurement, never a matrix atlas.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
    } finally {
      built?.renderer.dispose();
      built?.referenceRenderer.dispose();
    }
    if (report.status === "cancelled") break;
  }
  if (report.rows.length < snapshot.coverage.plannedPositions)
    report.status = "cancelled";
  return report;
}

function checkMetrics(value: unknown, width: number, height: number): void {
  if (!value || typeof value !== "object")
    throw Error("Malformed rendered metrics.");
  const m = value as ReviewFrameMetrics;
  if (
    Object.keys(m).sort().join() !==
    [
      "alphaAdded",
      "alphaRemoved",
      "changedBounds",
      "changedPixels",
      "meanDelta",
      "totalPixels",
    ]
      .sort()
      .join()
  )
    throw Error("Unexpected rendered metric fields.");
  const pixelsLimit = width * height;
  if (m.totalPixels !== pixelsLimit)
    throw Error("Metric pixels do not match this case's native canvas.");
  for (const key of ["changedPixels", "alphaAdded", "alphaRemoved"] as const)
    int(m[key], 0, m.totalPixels, key);
  if (!Number.isFinite(m.meanDelta) || m.meanDelta < 0 || m.meanDelta > 1)
    throw Error("Invalid metric delta.");
  if (m.changedBounds !== null) {
    if (Object.keys(m.changedBounds).sort().join() !== "height,width,x,y")
      throw Error("Invalid changed bounds.");
    int(m.changedBounds.x, 0, width - 1, "Bounds x");
    int(m.changedBounds.y, 0, height - 1, "Bounds y");
    int(m.changedBounds.width, 1, width - m.changedBounds.x, "Bounds width");
    int(m.changedBounds.height, 1, height - m.changedBounds.y, "Bounds height");
    if (m.changedPixels > m.changedBounds.width * m.changedBounds.height)
      throw Error("Changed pixels exceed their diagnostic bounds.");
  }
  if ((m.changedPixels === 0) !== (m.changedBounds === null))
    throw Error("Changed bounds disagree with metric pixels.");
  if (m.alphaAdded + m.alphaRemoved > m.changedPixels)
    throw Error("Alpha metrics exceed changed pixels.");
}
function validateReportRows(
  report: CombinationReport,
  project: WardrobeProject,
): void {
  if (
    !report ||
    Object.keys(report).sort().join() !==
      [
        "format",
        "version",
        "plan",
        "status",
        "completedSamples",
        "failedSamples",
        "rows",
        "interpretation",
      ]
        .sort()
        .join() ||
    report.format !== "gathria-combination-review" ||
    report.version !== 1 ||
    !["complete", "cancelled"].includes(report.status) ||
    report.interpretation !== DIAGNOSTIC ||
    !Array.isArray(report.rows) ||
    report.rows.length > COMBINATION_MAX_SAMPLES
  )
    throw Error("Unsupported or oversized combination report.");
  const expected = report.plan.cases.flatMap((item) =>
    report.plan.positions.flatMap((position) =>
      report.plan.request.facings.map((facing) => ({
        ...position,
        caseId: item.id,
        facing,
      })),
    ),
  );
  if (
    report.completedSamples !== report.rows.length ||
    report.failedSamples !==
      report.rows.filter((row) => row.error !== null).length ||
    report.rows.length > expected.length ||
    (report.status === "complete" && report.rows.length !== expected.length)
  )
    throw Error("Report completion counts do not match its exact sample plan.");
  report.rows.forEach((row, i) => {
    if (
      !row ||
      Object.keys(row).sort().join() !==
        [
          "action",
          "position",
          "frameId",
          "startMs",
          "durationMs",
          "caseId",
          "facing",
          "metrics",
          "motion",
          "error",
          "manualReview",
          "note",
        ]
          .sort()
          .join()
    )
      throw Error("Unexpected sample fields.");
    const wanted = expected[i];
    if (
      Object.entries(wanted).some(
        ([key, value]) => row[key as keyof CombinationRow] !== value,
      )
    )
      throw Error(
        "Report rows must be the completed prefix of the exact case/pose/facing plan.",
      );
    if (
      !["unreviewed", "issue", "checked"].includes(row.manualReview) ||
      typeof row.note !== "string" ||
      row.note.length > 1000
    )
      throw Error("Invalid manual review state or note.");
    if (row.error !== null) {
      text(row.error, 1000, "Render error");
      if (row.manualReview === "checked")
        throw Error("A failed render cannot be marked visually checked.");
      if (row.metrics !== null || row.motion !== null)
        throw Error("A failed sample cannot claim rendered metrics.");
      return;
    }
    const item = report.plan.cases.find((entry) => entry.id === row.caseId)!;
    const padding =
      item.appearance.hairId || item.appearance.faceId
        ? project.appearanceBank?.manifest.padding
        : undefined;
    const width =
        project.registration.frameWidth +
        (padding?.left ?? 0) +
        (padding?.right ?? 0),
      height =
        project.registration.frameHeight +
        (padding?.top ?? 0) +
        (padding?.bottom ?? 0);
    checkMetrics(row.metrics, width, height);
    const clip = project.archive.manifest.animations[row.action]!;
    const hasNext = row.position + 1 < clip.frames.length || clip.loop;
    if (hasNext !== (row.motion !== null))
      throw Error(
        "Motion measurement does not match source action boundaries.",
      );
    if (row.motion) {
      const motion = row.motion,
        to = (row.position + 1) % clip.frames.length;
      if (
        Object.keys(motion).sort().join() !==
          "loopClosure,metrics,toFrameId,toPosition" ||
        motion.toPosition !== to ||
        motion.toFrameId !== clip.frames[to] ||
        motion.loopClosure !== (to === 0)
      )
        throw Error("Motion edge does not match source timing.");
      if (
        !motion.metrics ||
        Object.keys(motion.metrics).sort().join() !==
          "current,reference,residual"
      )
        throw Error("Malformed motion metrics.");
      checkMetrics(motion.metrics.reference, width, height);
      checkMetrics(motion.metrics.current, width, height);
      const residual = motion.metrics.residual;
      if (
        !residual ||
        Object.keys(residual).sort().join() !==
          "changedPixels,maxDelta,meanDelta"
      )
        throw Error("Malformed motion residual.");
      int(
        residual.changedPixels,
        0,
        row.metrics!.totalPixels,
        "Residual pixels",
      );
      if (
        ![residual.meanDelta, residual.maxDelta].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 1,
        )
      )
        throw Error("Invalid motion residual delta.");
      if (residual.meanDelta > residual.maxDelta)
        throw Error("Motion residual mean exceeds its maximum.");
    }
  });
}
export function serializeCombinationReport(report: CombinationReport): string {
  const serialized = JSON.stringify(report, null, 2) + "\n";
  if (
    new TextEncoder().encode(serialized).length > COMBINATION_REPORT_MAX_BYTES
  )
    throw Error("Combination report exceeds the 4 MiB portable JSON limit.");
  return serialized;
}
/** Imported measurements are user-provided diagnostics, not a trusted claim
 * of execution. Exact bindings/coverage are recomputed; reproducing numbers
 * requires running the scan again. No material is changed by report import. */
export async function parseCombinationReport(
  input: string,
  project: WardrobeProject,
  plan: CombinationPlan,
  options: SourcePreparationOptions = {},
): Promise<CombinationReport> {
  if (
    typeof input !== "string" ||
    new TextEncoder().encode(input).length > COMBINATION_REPORT_MAX_BYTES
  )
    throw Error("Choose a combination JSON report within 4 MiB.");
  let report: CombinationReport;
  try {
    report = JSON.parse(input) as CombinationReport;
  } catch {
    throw Error("Combination report is not valid JSON.");
  }
  const verified = await verifiedPlan(project, plan, options);
  if (json(report?.plan) !== json(plan))
    throw Error(
      "This report belongs to another exact project or combination plan.",
    );
  validateReportRows(report, verified);
  return copy(report);
}
