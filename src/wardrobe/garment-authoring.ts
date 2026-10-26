import { strToU8, zipSync } from "fflate";
import { readBoundedArchive } from "../core/bounded-archive";
import { encodeSourceRgbaPngAsync, type RgbaPng } from "../core/baked-source";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  prepareSourcePng,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type { PortableAnimationName } from "../core/types";
import {
  createWardrobeCompositor,
  type WardrobeCompositor,
} from "./compositor";
import {
  WARDROBE_MAX_ITEM_BYTES,
  wardrobeObject,
  type RegisteredFrame,
  type WardrobeGarment,
  type WardrobeProject,
  type WardrobeSlot,
} from "./contract";
import { decodedGarmentPage } from "./garment-pages";
import {
  createWardrobeProject,
  readWardrobeGarment,
  selectWardrobeGarment,
  validateWardrobeProject,
} from "./project";
import { clothingPose } from "./recipe-kit";

export const AUTHORING_ALGORITHM = "owned-chromatic-ratio-v1";
export const AUTHORING_MAX_REFERENCE_BYTES = 8 * 1024 * 1024;
export const AUTHORING_MAX_REFERENCE_PIXELS = 4 * 1024 * 1024;
export const AUTHORING_MAX_DRAFT_BYTES = 80 * 1024 * 1024;
const MAX_CONFIG_BYTES = 128 * 1024;
const ACTIONS: PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const zipOptions = {
  level: 6 as const,
  mtime: new Date("2020-01-01T00:00:00Z"),
};
const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2) + "\n");
const copy = <T>(value: T): T => structuredClone(value);

export interface GarmentAuthoringConfig {
  id: string;
  name: string;
  material: {
    sourceRgb: [number, number, number];
    targetRgb: [number, number, number];
    tolerance: number;
  };
}
export interface AuthoringReferenceInput {
  name: string;
  bytes: Uint8Array;
}
export interface AuthoringReference extends AuthoringReferenceInput {
  sha256: string;
  width: number;
  height: number;
}
export type AuthoringDecision = "pending" | "accepted" | "rejected";
export interface AuthoringHardPose {
  frameId: number;
  sourceFrame: number;
  action: PortableAnimationName;
  position: number;
  reasons: string[];
  anchors: RegisteredFrame["points"];
}
export interface GarmentAuthoringTemplate {
  id: string;
  name: string;
  slot: WardrobeSlot;
  width: number;
  height: number;
  sourceSha256: string;
  registrationSha256: string;
  baseSha256: string;
  hardPoses: AuthoringHardPose[];
}
export interface GarmentAuthoringReport {
  format: "gathria-garment-authoring";
  version: 1;
  algorithm: typeof AUTHORING_ALGORITHM;
  sourceSha256: string;
  registrationSha256: string;
  base: { id: string; sha256: string };
  configuration: GarmentAuthoringConfig;
  reference: Omit<AuthoringReference, "bytes"> | null;
  output: { id: string; name: string; sha256: string };
  changedAtlasPixels: number;
  poses: Array<{
    frameId: number;
    changedPixels: number;
    beforeRgbaSha256: string;
    afterRgbaSha256: string;
  }>;
  hardPoses: Array<
    AuthoringHardPose & { decision: AuthoringDecision; note: string }
  >;
  rules: string;
}
export interface GarmentAuthoringResult {
  bytes: Uint8Array;
  report: GarmentAuthoringReport;
}
export interface GarmentAuthoringOptions extends SourcePreparationOptions {
  onProgress?: (done: number, total: number) => void;
}

function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
function configValue(input: unknown): GarmentAuthoringConfig {
  const v = wardrobeObject(input, "Clothing design", [
    "id",
    "name",
    "material",
  ]);
  require(typeof v.id === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(
      v.id,
    ), "Give the new clothing a unique ID of 1–64 letters, numbers, dots, underscores or hyphens.");
  require(typeof v.name === "string" &&
    v.name.trim().length > 0 &&
    v.name.length <= 120, "Give the clothing a name of 1–120 characters.");
  const m = wardrobeObject(v.material, "Material rule", [
    "sourceRgb",
    "targetRgb",
    "tolerance",
  ]);
  const rgb = (value: unknown): [number, number, number] => {
    require(Array.isArray(value) &&
      value.length === 3 &&
      value.every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 255,
      ), "Material RGB channels must be integers from 1 to 255; avoid zero channels.");
    return [...value] as [number, number, number];
  };
  require(typeof m.tolerance === "number" &&
    Number.isFinite(m.tolerance) &&
    m.tolerance >= 0.02 &&
    m.tolerance <= 0.5, "Material tolerance must be between 0.02 and 0.5.");
  return {
    id: v.id,
    name: v.name.trim(),
    material: {
      sourceRgb: rgb(m.sourceRgb),
      targetRgb: rgb(m.targetRgb),
      tolerance: m.tolerance,
    },
  };
}
function digestValue(value: unknown, label: string): string {
  require(typeof value === "string" &&
    /^[a-f0-9]{64}$/.test(value), `${label} needs an exact SHA-256.`);
  return value;
}
function referenceMetadata(
  reference: AuthoringReference | null,
): Omit<AuthoringReference, "bytes"> | null {
  if (!reference) return null;
  const { bytes: _bytes, ...metadata } = reference;
  return metadata;
}
async function prepareReference(
  input: AuthoringReferenceInput | undefined,
  options: SourcePreparationOptions,
): Promise<AuthoringReference | null> {
  if (!input) return null;
  require(typeof input.name === "string" &&
    input.name.trim().length > 0 &&
    input.name.length <=
      180, "Reference PNG needs a name of 1–180 characters.");
  const name = input.name.trim();
  require(input.bytes instanceof Uint8Array &&
    input.bytes.length >= 45 &&
    input.bytes.length <=
      AUTHORING_MAX_REFERENCE_BYTES, "Choose a reference PNG up to 8 MiB.");
  const bytes = new Uint8Array(input.bytes);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  require([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) &&
    v.getUint32(8) === 13 &&
    v.getUint32(12) ===
      0x49484452, "Choose an intact static RGBA PNG reference.");
  const width = v.getUint32(16),
    height = v.getUint32(20);
  require(width > 0 &&
    height > 0 &&
    width <= 4096 &&
    height <= 4096 &&
    width * height <=
      AUTHORING_MAX_REFERENCE_PIXELS, "Reference PNG must have at most 4 million pixels and sides up to 4096 pixels.");
  require(bytes[24] === 8 &&
    bytes[25] === 6 &&
    !bytes[26] &&
    !bytes[27] &&
    !bytes[28], "Reference PNG must be a static, non-interlaced 8-bit RGBA image.");
  await prepareSourcePng(bytes, { width, height }, options);
  assertSourcePreparationActive(options);
  return {
    name,
    bytes,
    width,
    height,
    sha256: await sha256(bytes),
  };
}
function roundEven(n: number): number {
  const floor = Math.floor(n),
    fraction = n - floor;
  return fraction === 0.5 ? floor + (floor % 2) : Math.round(n);
}
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** Deterministic guide selection; these geometric extremes are review prompts,
 * never automatic judgements that a garment is good or bad. */
export function planGarmentHardPoses(
  project: WardrobeProject,
): AuthoringHardPose[] {
  const registered = new Map(
    project.registration.frames.map((f) => [f.frameId, f]),
  );
  const candidates = ACTIONS.flatMap((action) => {
    const clip = project.archive.manifest.animations[action];
    if (!clip) return [];
    const seen = new Set<number>();
    return clip.frames.flatMap((frameId, position) => {
      if (seen.has(frameId)) return [];
      seen.add(frameId);
      const f = registered.get(frameId)!;
      const p = f.points;
      const waist = {
        x: (p.waistLeft.x + p.waistRight.x) / 2,
        y: (p.waistLeft.y + p.waistRight.y) / 2,
      };
      const torso = Math.max(
        1,
        Math.hypot(waist.x - p.neck.x, waist.y - p.neck.y),
      );
      const handLift =
        Math.max(
          p.nearShoulder.y - p.nearWrist.y,
          p.farShoulder.y - p.farWrist.y,
        ) / torso;
      const compression = project.registration.frameHeight / torso;
      const fold = (side: "near" | "far") => {
        const h = p[`${side}Hip`],
          k = p[`${side}Knee`],
          a = p[`${side}Ankle`];
        return (
          1 -
          Math.hypot(h.x - a.x, h.y - a.y) /
            Math.max(
              1,
              Math.hypot(h.x - k.x, h.y - k.y) +
                Math.hypot(k.x - a.x, k.y - a.y),
            )
        );
      };
      return {
        frameId,
        sourceFrame: f.sourceFrame,
        action,
        position,
        anchors: copy(p),
        handLift,
        compression,
        fold: Math.max(fold("near"), fold("far")),
      };
    });
  });
  const chosen = new Map<number, AuthoringHardPose>();
  const add = (c: (typeof candidates)[number] | undefined, reason: string) => {
    if (!c) return;
    const existing = chosen.get(c.frameId);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    const { handLift: _h, compression: _c, fold: _f, ...pose } = c;
    chosen.set(c.frameId, { ...pose, reasons: [reason] });
  };
  for (const action of ACTIONS) {
    const rows = candidates.filter((c) => c.action === action);
    add(
      rows.find((c) => !chosen.has(c.frameId)) ?? rows[0],
      `${action}: first distinct source drawing; inspect action-specific fit.`,
    );
  }
  for (const [key, reason] of [
    [
      "handLift",
      "Raised or crossing arms: inspect shoulders, armholes and cuffs.",
    ],
    [
      "compression",
      "Short torso span: inspect compressed waist and overlapping seams.",
    ],
    ["fold", "Bent legs: inspect hems, knees and garment/leg occlusion."],
  ] as const) {
    const ordered = [...candidates].sort(
      (a, b) => b[key] - a[key] || a.frameId - b.frameId,
    );
    add(
      ordered.find((c) => !chosen.has(c.frameId)),
      reason,
    );
  }
  return [...chosen.values()].slice(0, 8);
}

/** Session owns revalidated source/template bytes. No incoming parsed cache or
 * uploaded mutable buffer becomes authoritative. Every output has a new ID. */
export class GarmentAuthoringSession {
  private built: {
    item: WardrobeGarment;
    report: GarmentAuthoringReport;
    renderer: WardrobeCompositor;
  } | null = null;
  private referenceValue: AuthoringReference | null = null;
  private revision = 0;
  private disposed = false;
  private readonly templateValue: GarmentAuthoringTemplate;
  constructor(
    private readonly project: WardrobeProject,
    private readonly base: WardrobeGarment,
    private readonly renderer: WardrobeCompositor,
    private readonly inventory: Map<string, string>,
    private readonly sessionOptions: SourcePreparationOptions,
  ) {
    this.templateValue = {
      id: base.manifest.id,
      name: base.manifest.name,
      slot: base.manifest.slot,
      width: base.manifest.frameWidth,
      height: base.manifest.frameHeight,
      sourceSha256: project.document.sourceSha256,
      registrationSha256: project.document.registrationSha256,
      baseSha256: base.sha256,
      hardPoses: planGarmentHardPoses(project),
    };
  }
  get template(): GarmentAuthoringTemplate {
    return copy(this.templateValue);
  }
  get configuration(): GarmentAuthoringConfig | null {
    return this.built ? copy(this.built.report.configuration) : null;
  }
  get reference(): AuthoringReference | null {
    return copy(this.referenceValue);
  }
  private check(options: SourcePreparationOptions = {}) {
    require(!this.disposed, "This clothing creation session is closed.");
    assertSourcePreparationActive(this.sessionOptions);
    assertSourcePreparationActive(options);
  }
  invalidate(): void {
    this.check();
    this.revision++;
    this.built?.renderer.dispose();
    this.built = null;
  }
  getReport(): GarmentAuthoringReport | null {
    this.check();
    return this.built ? copy(this.built.report) : null;
  }
  getOutputBytes(): Uint8Array | null {
    this.check();
    return this.built ? new Uint8Array(this.built.item.bytes) : null;
  }
  renderPose(frameId: number): {
    source: RgbaPng;
    before: RgbaPng;
    after: RgbaPng;
    anchors: RegisteredFrame["points"];
  } {
    this.check();
    const frame = this.project.registration.frames.find(
      (f) => f.frameId === frameId,
    );
    require(frame, "Choose a registered source pose.");
    return {
      source: this.renderer.renderSourceFrame(frameId),
      before: this.renderer.renderFrame(frameId),
      after: (this.built?.renderer ?? this.renderer).renderFrame(frameId),
      anchors: copy(frame.points),
    };
  }
  sampleCloth(frameId: number, x: number, y: number): [number, number, number] {
    this.check();
    require(Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.templateValue.width &&
      y <
        this.templateValue.height, "Sample within the native clothing canvas.");
    const { image, mask } = clothingPose(this.base, frameId),
      at = (y * image.width + x) * 4;
    require(mask.pixels[at] &&
      image.pixels[
        at + 3
      ], "Sample opaque pixels belonging to the template clothing, not skin or the background.");
    return [image.pixels[at], image.pixels[at + 1], image.pixels[at + 2]];
  }
  async build(
    input: GarmentAuthoringConfig,
    reference?: AuthoringReferenceInput,
    options: GarmentAuthoringOptions = {},
  ): Promise<GarmentAuthoringResult> {
    this.check(options);
    const configuration = configValue(input);
    require(configuration.id !==
      this.base.manifest
        .id, "Use a new clothing ID; preserve the template artwork.");
    const revision = ++this.revision;
    this.built?.renderer.dispose();
    this.built = null;
    const check = () => {
      this.check(options);
      require(revision ===
        this
          .revision, "The design changed during preparation. Build the current settings again.");
    };
    const ref = await prepareReference(reference, options);
    check();
    const files: Record<string, Uint8Array> = {};
    const changedByPage: Uint8Array[] = [];
    let changedAtlasPixels = 0;
    const material = configuration.material,
      sourceMean = material.sourceRgb.reduce((n, c) => n + c, 0) / 3;
    options.onProgress?.(
      0,
      this.base.manifest.pages.length + this.base.manifest.frames.length,
    );
    for (const [pageIndex, spec] of this.base.manifest.pages.entries()) {
      check();
      const page = decodedGarmentPage(
        `${this.base.sha256}:${pageIndex}`,
        this.base.pages[pageIndex].patch,
        this.base.pages[pageIndex].ownership,
        spec,
      );
      const output = copy(page.patch),
        changed = new Uint8Array(spec.width * spec.height);
      // Process unique atlas texels, not pose rectangles: shared drawings receive
      // the same single material transform and cannot be recolored repeatedly.
      for (let i = 0; i < changed.length; i++) {
        if (i % 65536 === 0) {
          await yieldTask();
          check();
        }
        const at = i * 4;
        if (!page.ownership[i] || !output.pixels[at + 3]) continue;
        const rgb = [
          page.patch.pixels[at],
          page.patch.pixels[at + 1],
          page.patch.pixels[at + 2],
        ];
        const mean = Math.max(1, (rgb[0] + rgb[1] + rgb[2]) / 3);
        const distance = Math.hypot(
          ...rgb.map((c, j) => c / mean - material.sourceRgb[j] / sourceMean),
        );
        const weight =
          clamp((material.tolerance - distance) / (material.tolerance * 0.35)) *
          clamp((mean - 28) / 42);
        if (!weight) continue;
        for (let c = 0; c < 3; c++)
          output.pixels[at + c] = roundEven(
            rgb[c] * (1 - weight) +
              clamp(
                (rgb[c] * material.targetRgb[c]) / material.sourceRgb[c],
                0,
                255,
              ) *
                weight,
          );
        if (rgb.some((c, j) => c !== output.pixels[at + j])) {
          changed[i] = 1;
          changedAtlasPixels++;
        }
      }
      changedByPage.push(changed);
      files[spec.file] = changed.some(Boolean)
        ? await encodeSourceRgbaPngAsync(output)
        : new Uint8Array(this.base.pages[pageIndex].patch);
      files[spec.maskFile] = new Uint8Array(
        this.base.pages[pageIndex].ownership,
      );
      check();
      options.onProgress?.(
        pageIndex + 1,
        this.base.manifest.pages.length + this.base.manifest.frames.length,
      );
    }
    require(changedAtlasPixels >
      0, "This material rule changes no clothing pixels. Choose a different target or sample matching cloth.");
    const recipeSha256 = await sha256(
      json({
        algorithm: AUTHORING_ALGORITHM,
        configuration,
        reference: referenceMetadata(ref),
      }),
    );
    check();
    const manifest = copy(this.base.manifest);
    manifest.id = configuration.id;
    manifest.name = configuration.name;
    manifest.provenance += ` Browser clothing variant ${AUTHORING_ALGORITHM}; base SHA256 ${this.base.sha256}; design SHA256 ${recipeSha256}. Owned opaque RGB only, ties-to-even rounding; source, ownership, alpha, anchors, pose geometry and timing retained. Reference ${ref?.sha256 ?? "none"} is palette/design context only, never auto-fitted artwork.`;
    files["manifest.json"] = json(manifest);
    const bytes = zipSync(files, zipOptions);
    require(bytes.length <= WARDROBE_MAX_ITEM_BYTES &&
      Object.values(files).reduce((n, b) => n + b.length, 0) <=
        WARDROBE_MAX_ITEM_BYTES, "The new clothing exceeds the 64 MiB garment budget.");
    const item = await readWardrobeGarment(
      bytes,
      this.project.registration,
      this.project.document.registrationSha256,
      options,
    );
    check();
    const collision = this.inventory.get(item.manifest.id);
    require(!collision ||
      collision ===
        item.sha256, "This clothing ID already contains different artwork. Choose a new ID.");
    const poses: GarmentAuthoringReport["poses"] = [];
    for (const [index, f] of manifest.frames.entries()) {
      await yieldTask();
      check();
      const before = clothingPose(this.base, f.frameId),
        after = clothingPose(item, f.frameId);
      let changedPixels = 0;
      for (let y = f.rect.y; y < f.rect.y + f.rect.height; y++)
        for (let x = f.rect.x; x < f.rect.x + f.rect.width; x++)
          changedPixels +=
            changedByPage[f.page][y * manifest.pages[f.page].width + x];
      poses.push({
        frameId: f.frameId,
        changedPixels,
        beforeRgbaSha256: await sha256(before.image.pixels),
        afterRgbaSha256: await sha256(after.image.pixels),
      });
      check();
      options.onProgress?.(
        this.base.manifest.pages.length + index + 1,
        this.base.manifest.pages.length + manifest.frames.length,
      );
    }
    require(poses.some(
      (pose) => pose.changedPixels > 0,
    ), "This rule changes only unused atlas pixels. Choose cloth visible in a registered pose.");
    const report: GarmentAuthoringReport = {
      format: "gathria-garment-authoring",
      version: 1,
      algorithm: AUTHORING_ALGORITHM,
      sourceSha256: this.templateValue.sourceSha256,
      registrationSha256: this.templateValue.registrationSha256,
      base: { id: this.base.manifest.id, sha256: this.base.sha256 },
      configuration,
      reference: referenceMetadata(ref),
      output: {
        id: item.manifest.id,
        name: item.manifest.name,
        sha256: item.sha256,
      },
      changedAtlasPixels,
      poses,
      hardPoses: this.templateValue.hardPoses.map((p) => ({
        ...copy(p),
        decision: "pending",
        note: "",
      })),
      rules:
        "All source poses retained. Only template-owned opaque RGB is transformed once per atlas texel; masks, alpha, PNG color metadata, source, registration, geometry and timing stay unchanged. Reference images provide palette/design context, not inferred clothing or anatomy. Geometric hard-pose prompts and validation are not visual acceptance; inspect all actions and both directions before final use.",
    };
    let candidateProject = await createWardrobeProject(
      this.project.source,
      this.project.registrationBytes,
      [item.bytes],
      options,
    );
    candidateProject = selectWardrobeGarment(
      candidateProject,
      item.manifest.slot,
      item.manifest.id,
    );
    check();
    const candidateRenderer = await createWardrobeCompositor(
      candidateProject,
      options,
    );
    try {
      await candidateRenderer.validateAppearance(options);
      check();
      this.referenceValue = ref;
      this.built = { item, report, renderer: candidateRenderer };
      return { bytes: new Uint8Array(bytes), report: copy(report) };
    } catch (error) {
      candidateRenderer.dispose();
      throw error;
    }
  }
  reviewPose(
    frameId: number,
    decision: AuthoringDecision,
    note = "",
  ): GarmentAuthoringReport {
    this.check();
    require(this
      .built, "Build the current design before reviewing its exact output.");
    require(["pending", "accepted", "rejected"].includes(decision) &&
      typeof note === "string" &&
      note.length <=
        1000, "Use a valid pose decision and a note up to 1000 characters.");
    const pose = this.built.report.hardPoses.find((p) => p.frameId === frameId);
    require(pose, "Choose a planned hard pose for this output.");
    pose.decision = decision;
    pose.note = note;
    return copy(this.built.report);
  }
  async saveDraft(options: SourcePreparationOptions = {}): Promise<Uint8Array> {
    this.check(options);
    require(this
      .built, "Build the current settings before saving a portable clothing draft.");
    const design = {
      format: "gathria-garment-authoring-draft",
      version: 1,
      algorithm: AUTHORING_ALGORITHM,
      sourceSha256: this.templateValue.sourceSha256,
      registrationSha256: this.templateValue.registrationSha256,
      baseSha256: this.base.sha256,
      configuration: this.built.report.configuration,
      reference: referenceMetadata(this.referenceValue),
      review: {
        outputSha256: this.built.item.sha256,
        poses: this.built.report.hardPoses.map(
          ({ frameId, decision, note }) => ({ frameId, decision, note }),
        ),
      },
    };
    const data = json(design);
    require(data.length <=
      MAX_CONFIG_BYTES, "The authoring draft metadata exceeds its budget.");
    const files: Record<string, Uint8Array> = {
      "design.json": data,
      "base.garment.zip": new Uint8Array(this.base.bytes),
    };
    if (this.referenceValue)
      files["reference.png"] = new Uint8Array(this.referenceValue.bytes);
    const bytes = zipSync(files, zipOptions);
    require(bytes.length <=
      AUTHORING_MAX_DRAFT_BYTES, "The clothing draft exceeds 80 MiB.");
    this.check(options);
    return bytes;
  }
  dispose(): void {
    this.disposed = true;
    this.revision++;
    this.built?.renderer.dispose();
    this.built = null;
    this.referenceValue = null;
    this.renderer.dispose();
  }
}

async function sessionFromBase(
  verified: WardrobeProject,
  baseBytes: Uint8Array,
  options: SourcePreparationOptions,
): Promise<GarmentAuthoringSession> {
  const base = await readWardrobeGarment(
    baseBytes,
    verified.registration,
    verified.document.registrationSha256,
    options,
  );
  require(base.manifest.slot !==
    "shoes", "Choose a top, bottom or dress as the clothing template.");
  let isolated = await createWardrobeProject(
    verified.source,
    verified.registrationBytes,
    [base.bytes],
    options,
  );
  isolated = selectWardrobeGarment(
    isolated,
    base.manifest.slot,
    base.manifest.id,
  );
  const renderer = await createWardrobeCompositor(isolated, options);
  try {
    await renderer.validateAppearance(options);
    return new GarmentAuthoringSession(
      isolated,
      isolated.items[0],
      renderer,
      new Map(verified.items.map((i) => [i.manifest.id, i.sha256])),
      options,
    );
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}
export async function createGarmentAuthoringSession(
  project: WardrobeProject,
  itemId: string,
  options: SourcePreparationOptions = {},
): Promise<GarmentAuthoringSession> {
  assertSourcePreparationActive(options);
  const verified = await validateWardrobeProject(project, {
    ...options,
    decodeGarments: false,
  });
  const item = verified.items.find((i) => i.manifest.id === itemId);
  require(item &&
    Object.values(verified.document.selection).includes(
      itemId,
    ), "Wear the top, bottom or dress you want to use as the template.");
  return sessionFromBase(verified, new Uint8Array(item.bytes), options);
}
export async function openGarmentAuthoringDraft(
  project: WardrobeProject,
  input: Uint8Array,
  options: GarmentAuthoringOptions = {},
): Promise<GarmentAuthoringSession> {
  assertSourcePreparationActive(options);
  require(input instanceof Uint8Array &&
    input.length <=
      AUTHORING_MAX_DRAFT_BYTES, "Choose a clothing creation draft up to 80 MiB.");
  const files = readBoundedArchive(new Uint8Array(input), {
    label: "Clothing creation draft",
    maxArchiveBytes: AUTHORING_MAX_DRAFT_BYTES,
    maxExpandedBytes:
      WARDROBE_MAX_ITEM_BYTES +
      AUTHORING_MAX_REFERENCE_BYTES +
      MAX_CONFIG_BYTES,
    minFiles: 2,
    maxFiles: 3,
    files: {
      "design.json": MAX_CONFIG_BYTES,
      "base.garment.zip": WARDROBE_MAX_ITEM_BYTES,
      "reference.png": AUTHORING_MAX_REFERENCE_BYTES,
    },
    required: ["design.json", "base.garment.zip"],
  });
  const design = wardrobeObject(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(files["design.json"]),
    ),
    "Clothing creation draft",
    [
      "format",
      "version",
      "algorithm",
      "sourceSha256",
      "registrationSha256",
      "baseSha256",
      "configuration",
      "reference",
      "review",
    ],
  );
  require(design.format === "gathria-garment-authoring-draft" &&
    design.version === 1 &&
    design.algorithm ===
      AUTHORING_ALGORITHM, "Unsupported clothing creation draft version or algorithm.");
  require(digestValue(design.sourceSha256, "Draft source") ===
    project.document.sourceSha256 &&
    digestValue(design.registrationSha256, "Draft registration") ===
      project.document
        .registrationSha256, "Open this draft on its matching source character and registration.");
  require(digestValue(design.baseSha256, "Draft template") ===
    (await sha256(
      files["base.garment.zip"],
    )), "The embedded template does not match the draft hash.");
  const configuration = configValue(design.configuration);
  let reference: AuthoringReferenceInput | undefined;
  if (design.reference !== null) {
    const ref = wardrobeObject(design.reference, "Draft reference", [
      "name",
      "sha256",
      "width",
      "height",
    ]);
    require(typeof ref.name === "string" &&
      files["reference.png"] &&
      digestValue(ref.sha256, "Reference") ===
        (await sha256(
          files["reference.png"],
        )), "The draft reference PNG is missing or changed.");
    reference = { name: ref.name, bytes: files["reference.png"] };
    const validated = await prepareReference(reference, options);
    require(validated &&
      validated.width === ref.width &&
      validated.height === ref.height &&
      validated.name ===
        ref.name, "Reference metadata does not match its PNG.");
  } else
    require(!files[
      "reference.png"
    ], "The draft contains an undeclared reference PNG.");
  const review = wardrobeObject(design.review, "Draft review", [
    "outputSha256",
    "poses",
  ]);
  digestValue(review.outputSha256, "Reviewed output");
  require(Array.isArray(review.poses) &&
    review.poses.length <= 10, "Draft review has too many pose decisions.");
  const seen = new Set<number>();
  const decisions = review.poses.map((value) => {
    const row = wardrobeObject(value, "Draft pose decision", [
      "frameId",
      "decision",
      "note",
    ]);
    require(Number.isSafeInteger(row.frameId) &&
      (row.frameId as number) >= 0 &&
      !seen.has(
        row.frameId as number,
      ), "Draft decisions must name distinct source poses.");
    require(["pending", "accepted", "rejected"].includes(
      String(row.decision),
    ) &&
      typeof row.note === "string" &&
      row.note.length <= 1000, "Invalid draft pose decision.");
    seen.add(row.frameId as number);
    return {
      frameId: row.frameId as number,
      decision: row.decision as AuthoringDecision,
      note: row.note,
    };
  });
  const verified = await validateWardrobeProject(project, {
    ...options,
    decodeGarments: false,
  });
  const session = await sessionFromBase(
    verified,
    files["base.garment.zip"],
    options,
  );
  try {
    const built = await session.build(configuration, reference, options);
    require(built.report.output.sha256 ===
      review.outputSha256, "The saved decisions belong to a different output; no draft was opened.");
    require(decisions.length === session.template.hardPoses.length &&
      decisions.every((d) =>
        session.template.hardPoses.some((p) => p.frameId === d.frameId),
      ), "The draft review must cover exactly its planned hard poses.");
    for (const decision of decisions)
      session.reviewPose(decision.frameId, decision.decision, decision.note);
    return session;
  } catch (error) {
    session.dispose();
    throw error;
  }
}
