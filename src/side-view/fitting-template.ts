import { strToU8, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import {
  WARDROBE_ANCHORS,
  wardrobeObject,
  wardrobeSha,
  type ProtectedRegion,
  type RegisteredFrame,
  type WardrobeAnchorName,
  type WardrobeGarment,
  type WardrobeProject,
  type WardrobeSlot,
} from "../wardrobe/contract";
import { PAINT_MAX_POSES } from "../wardrobe/paint-import";
import { reviewedRegions } from "../wardrobe/protection";
import { validateWardrobeProject } from "../wardrobe/project";
import { clothingPose } from "../wardrobe/recipe-kit";
import type { SideAction } from "./motion";

export const FITTING_TEMPLATE_MAX_BYTES = 256 * 1024;
const ACTIONS: SideAction[] = ["idle", "walk", "run", "jump"];
const NOTE =
  "复用同一人物、同一部位的检查姿势和原图锚点。目标服装保留自己的绘制、归属遮罩与手部遮挡许可；模板不会移植旧服装轮廓、自动换装或改变身体。新袖长、领口、裙摆仍需逐帧检查和补绘。";
type GarmentReference = {
  id: string;
  name: string;
  sha256: string;
  slot: Exclude<WardrobeSlot, "shoes">;
};
type ActionReference = {
  action: SideAction;
  frames: number[];
  fps: number;
  loop: boolean;
};
export interface FittingTemplate {
  format: "gathria-side-fitting-template";
  version: 1;
  sourceSha256: string;
  registrationSha256: string;
  characterId: string;
  frameWidth: number;
  frameHeight: number;
  nativeFacing: "right";
  donor: GarmentReference;
  frameIds: number[];
  reviewAnchors: WardrobeAnchorName[];
  actions: ActionReference[];
  guides: RegisteredFrame[];
}
export interface FittingTemplateApplication {
  template: FittingTemplate;
  target: GarmentReference;
  reusedFromDifferentGarment: boolean;
  poses: Array<{
    frameId: number;
    sourceFrame: number;
    locations: Array<{ action: SideAction; position: number }>;
    points: RegisteredFrame["points"];
    protected: ProtectedRegion[];
  }>;
  note: string;
}

function reference(item: WardrobeGarment): GarmentReference {
  if (item.manifest.slot === "shoes")
    throw Error("服装模板目前支持上装、下装或连衣裙。");
  return {
    id: item.manifest.id,
    name: item.manifest.name,
    sha256: item.sha256,
    slot: item.manifest.slot,
  };
}
function wornItem(project: WardrobeProject, id: string): WardrobeGarment {
  const item = project.items.find((entry) => entry.manifest.id === id);
  if (!item || !Object.values(project.document.selection).includes(id))
    throw Error("请先穿上要检查的目标服装。");
  reference(item);
  for (const key of ["sourceSha256", "registrationSha256"] as const)
    if (item.manifest[key] !== project.document[key])
      throw Error("目标服装与当前人物的原图或锚点不一致。");
  for (const key of ["characterId", "frameWidth", "frameHeight"] as const)
    if (item.manifest[key] !== project.registration[key])
      throw Error("目标服装与当前人物的身份或原生尺寸不一致。");
  return item;
}
function actionReferences(project: WardrobeProject): ActionReference[] {
  return ACTIONS.flatMap((action) => {
    const clip = project.archive.manifest.animations[action];
    return clip
      ? [{ action, frames: [...clip.frames], fps: clip.fps, loop: clip.loop }]
      : [];
  });
}
function anchors(slot: GarmentReference["slot"]): WardrobeAnchorName[] {
  return WARDROBE_ANCHORS.filter((name) => {
    if (slot === "fullBody") return true;
    if (slot === "top") return !/Hip|Knee|Ankle|Toe/.test(name);
    return /waist|Hip|Knee|Ankle|Toe/.test(name);
  });
}
function poseIds(value: unknown, project: WardrobeProject): number[] {
  if (!Array.isArray(value) || !value.length || value.length > PAINT_MAX_POSES)
    throw Error(`模板需包含 1–${PAINT_MAX_POSES} 个不同的检查姿势。`);
  const available = new Set(
    actionReferences(project).flatMap((clip) => clip.frames),
  );
  const ids = value.map((id) => {
    if (!Number.isSafeInteger(id) || !available.has(id))
      throw Error("模板包含当前侧视动作中不存在的姿势。");
    return id as number;
  });
  if (new Set(ids).size !== ids.length) throw Error("模板检查姿势不能重复。");
  return ids;
}
/** Walk only the bounded expected schema, never recursively traverse arbitrary
 * uploaded structures. Object-key ordering is irrelevant to JSON references. */
function sameReference(value: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== "object")
    return value === expected;
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(expected))
    return (
      Array.isArray(value) &&
      value.length === expected.length &&
      expected.every((entry, i) => sameReference(value[i], entry))
    );
  if (Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const entries = Object.entries(expected);
  return (
    Object.keys(actual).length === entries.length &&
    entries.every(
      ([key, entry]) =>
        Object.hasOwn(actual, key) && sameReference(actual[key], entry),
    )
  );
}
function guides(project: WardrobeProject, ids: number[]): RegisteredFrame[] {
  return ids.map((id) => {
    const row = project.registration.frames.find(
      (frame) => frame.frameId === id,
    );
    if (!row) throw Error(`缺少姿势 ${id} 的原图锚点。`);
    return structuredClone(row);
  });
}
const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2) + "\n");

/** A reusable review plan, distinct from garment artwork and playable packs. */
export async function exportFittingTemplate(
  project: WardrobeProject,
  itemId: string,
  frameIds: number[],
  options: SourcePreparationOptions = {},
): Promise<Uint8Array> {
  assertSourcePreparationActive(options);
  const ids = poseIds([...frameIds], project);
  const verified = await validateWardrobeProject(project, options);
  const donor = reference(wornItem(verified, itemId));
  const template: FittingTemplate = {
    format: "gathria-side-fitting-template",
    version: 1,
    sourceSha256: verified.document.sourceSha256,
    registrationSha256: verified.document.registrationSha256,
    characterId: verified.registration.characterId,
    frameWidth: verified.registration.frameWidth,
    frameHeight: verified.registration.frameHeight,
    nativeFacing: "right",
    donor,
    frameIds: ids,
    reviewAnchors: anchors(donor.slot),
    actions: actionReferences(verified),
    guides: guides(verified, ids),
  };
  const bytes = json(template);
  if (bytes.length > FITTING_TEMPLATE_MAX_BYTES)
    throw Error("服装模板超过 256 KiB。");
  assertSourcePreparationActive(options);
  return bytes;
}

/** The caller's project has already been loaded by the strict project importer.
 * Every uploaded guide must match that canonical registration exactly. Target
 * garment hand/neckline exceptions are never copied from the template donor. */
export function inspectFittingTemplate(
  bytes: Uint8Array,
  project: WardrobeProject,
  targetItemId: string,
): FittingTemplateApplication {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > FITTING_TEMPLATE_MAX_BYTES
  )
    throw Error("请选择不超过 256 KiB 的服装模板 JSON。");
  const raw = wardrobeObject(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    "Fitting template",
    [
      "format",
      "version",
      "sourceSha256",
      "registrationSha256",
      "characterId",
      "frameWidth",
      "frameHeight",
      "nativeFacing",
      "donor",
      "frameIds",
      "reviewAnchors",
      "actions",
      "guides",
    ],
  );
  if (
    raw.format !== "gathria-side-fitting-template" ||
    raw.version !== 1 ||
    raw.nativeFacing !== "right"
  )
    throw Error("请选择原生朝右的第 1 版服装模板。");
  for (const key of ["sourceSha256", "registrationSha256"] as const)
    if (wardrobeSha(raw[key], key) !== project.document[key])
      throw Error("模板属于不同原图或锚点版本，不能用于当前人物。");
  for (const key of ["characterId", "frameWidth", "frameHeight"] as const)
    if (raw[key] !== project.registration[key])
      throw Error("模板的人物身份或原生尺寸不匹配。");
  const donorRaw = wardrobeObject(raw.donor, "Template donor", [
    "id",
    "name",
    "sha256",
    "slot",
  ]);
  if (
    typeof donorRaw.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(donorRaw.id) ||
    typeof donorRaw.name !== "string" ||
    !donorRaw.name.trim() ||
    donorRaw.name.length > 120 ||
    !["top", "bottom", "fullBody"].includes(String(donorRaw.slot))
  )
    throw Error("模板原服装信息无效。");
  const donor: GarmentReference = {
    id: donorRaw.id,
    name: donorRaw.name,
    sha256: wardrobeSha(donorRaw.sha256, "Template donor sha256"),
    slot: donorRaw.slot as GarmentReference["slot"],
  };
  const item = wornItem(project, targetItemId),
    target = reference(item);
  if (target.slot !== donor.slot)
    throw Error("上装、下装和连衣裙的模板不能互相套用。");
  const ids = poseIds(raw.frameIds, project),
    canonical = guides(project, ids),
    actions = actionReferences(project);
  if (
    !sameReference(raw.guides, canonical) ||
    !sameReference(raw.actions, actions) ||
    !sameReference(raw.reviewAnchors, anchors(donor.slot))
  )
    throw Error("模板中的锚点、保护区或动作顺序已改变，请重新导出原生模板。");
  if (
    ids.some(
      (id) => !item.manifest.frames.some((frame) => frame.frameId === id),
    )
  )
    throw Error("目标服装缺少模板要求的姿势。");
  const template: FittingTemplate = {
    format: "gathria-side-fitting-template",
    version: 1,
    sourceSha256: project.document.sourceSha256,
    registrationSha256: project.document.registrationSha256,
    characterId: project.registration.characterId,
    frameWidth: project.registration.frameWidth,
    frameHeight: project.registration.frameHeight,
    nativeFacing: "right",
    donor,
    frameIds: ids,
    reviewAnchors: anchors(donor.slot),
    actions,
    guides: canonical,
  };
  return {
    template,
    target,
    reusedFromDifferentGarment: donor.sha256 !== target.sha256,
    poses: canonical.map((frame) => ({
      frameId: frame.frameId,
      sourceFrame: frame.sourceFrame,
      points: structuredClone(frame.points),
      protected: structuredClone(reviewedRegions(frame, item.manifest)),
      locations: actions.flatMap((clip) =>
        clip.frames.flatMap((id, position) =>
          id === frame.frameId ? [{ action: clip.action, position }] : [],
        ),
      ),
    })),
    note: NOTE,
  };
}

/** Reuses the review pose set with the TARGET's exact artwork and ownership.
 * The result follows the existing recipe-kit schema, including strict browser
 * painted-pose import; no new runtime/CharacterPack format is introduced. */
export async function exportFittingTemplateKit(
  input: Uint8Array,
  project: WardrobeProject,
  targetItemId: string,
  options: SourcePreparationOptions = {},
): Promise<Uint8Array> {
  assertSourcePreparationActive(options);
  inspectFittingTemplate(input, project, targetItemId);
  const bytes = new Uint8Array(input);
  const verified = await validateWardrobeProject(project, options);
  const application = inspectFittingTemplate(bytes, verified, targetItemId);
  const item = wornItem(verified, targetItemId);
  const category =
    item.manifest.slot === "fullBody"
      ? "dress"
      : item.manifest.slot === "bottom"
        ? "trousers"
        : /jacket|suit/i.test(item.manifest.name)
          ? "jacket"
          : "shirt";
  const recipe = {
    format: "gathria-garment-recipe",
    version: 1,
    category,
    base: { file: "base.garment.zip", sha256: item.sha256 },
    output: {
      id: `${item.manifest.id.slice(0, 53)}-variant-v1`,
      name: `${item.manifest.name.slice(0, 100)} variant`,
    },
    poseOverrides: [] as Array<{
      frameId: number;
      image: { file: string; sha256: string };
      mask: { file: string; sha256: string };
    }>,
  };
  const files: Record<string, Uint8Array> = {
    "base.garment.zip": new Uint8Array(item.bytes),
    "registration.json": new Uint8Array(verified.registrationBytes),
    "pose-guide.json": json({
      format: "gathria-fitting-template-application",
      version: 1,
      templateSha256: await sha256(bytes),
      sourceSha256: verified.document.sourceSha256,
      registrationSha256: verified.document.registrationSha256,
      donor: application.template.donor,
      target: application.target,
      nativeFacing: "right",
      reviewAnchors: application.template.reviewAnchors,
      actions: application.template.actions,
      note: NOTE,
    }),
    "README.md": strToU8(
      `# Target clothing fitting review kit\n\n${NOTE}\n\nThis is a painting kit, not a CharacterPack. Review the listed native poses and their actual neighbors, including the declared loop seam. Jump is a one-shot and never wraps. The selected pose set is a checklist, not a complete new animation.\n\nbase.garment.zip, pose-ID.png and mask-ID.png are the TARGET garment's exact bytes/native layers. No donor clothing pixels or ownership masks have been transferred. The canonical anchors and protected head stay unchanged; pose guides report the target's own hand protection reviews and neckline permission profile. These remain target-specific.\n\nTo repaint: edit RGB only inside white ownership, preserve every alpha value and mask, choose a new unused recipe output id/name, then zip the files at the root. Wear this exact target garment and use Preview painted poses. Existing Python recipe tooling can also consume recipe.json. Unedited painting kits reproduce target artwork under a new ID. New silhouettes, sleeve lengths and newly exposed body areas require separate artwork and explicit ownership review.\n`,
    ),
  };
  for (const pose of application.poses) {
    assertSourcePreparationActive(options);
    const native = clothingPose(item, pose.frameId);
    const imageFile = `pose-${pose.frameId}.png`,
      maskFile = `mask-${pose.frameId}.png`;
    files[imageFile] = encodeSourceRgbaPng(native.image);
    files[maskFile] = encodeSourceRgbaPng(native.mask);
    recipe.poseOverrides.push({
      frameId: pose.frameId,
      image: { file: imageFile, sha256: await sha256(files[imageFile]) },
      mask: { file: maskFile, sha256: await sha256(files[maskFile]) },
    });
    files[`pose-${pose.frameId}-guide.json`] = json({
      sourceSha256: verified.document.sourceSha256,
      registrationSha256: verified.document.registrationSha256,
      nativeFacing: "right",
      width: native.image.width,
      height: native.image.height,
      ...pose,
      necklinePermissionProfile:
        item.manifest.necklinePermissionProfile ?? null,
      note: "Protection shown belongs to this target garment. Template donor exceptions are not inherited. Anchors with occluded visibility are estimates, not observed hidden anatomy.",
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  files["recipe.json"] = json(recipe);
  assertSourcePreparationActive(options);
  return zipSync(files, { level: 6, mtime: new Date(2020, 0, 1) });
}
