import {
  validateAppearanceSelection,
  type AppearanceBank,
  type AppearanceDocumentSelection,
} from "../appearance/contract";
import type { PortableCharacterPackArchive } from "../core/pack";
import type { Facing, PortableAnimationName } from "../core/types";
import { assertHandReviewSubset } from "./protection";
import { assertNecklinePermissionProfile } from "./neckline-permissions";

/** Versioned native-frame authoring guides; these are not an inferred runtime rig. */
export const WARDROBE_ANCHORS = [
  "neck",
  "nearShoulder",
  "farShoulder",
  "waistLeft",
  "waistRight",
  "nearHip",
  "farHip",
  "nearElbow",
  "farElbow",
  "nearWrist",
  "farWrist",
  "nearKnee",
  "farKnee",
  "nearAnkle",
  "farAnkle",
  "nearToe",
  "farToe",
] as const;
export type WardrobeAnchorName = (typeof WARDROBE_ANCHORS)[number];
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface WardrobeAnchor extends Point {
  visibility: "visible" | "occluded";
  confidence?: number;
  /** Records observed, contour-derived, placed, or interpolated estimates honestly. */
  method?: string;
}
export interface ProtectedRegion {
  label: "head" | "nearHand" | "farHand";
  /** Native-frame polygon; only opaque source pixels inside it are protected. */
  polygon: Point[];
}
export interface RegisteredFrame {
  frameId: number;
  sourceFrame: number;
  points: Record<WardrobeAnchorName, WardrobeAnchor>;
  protected: ProtectedRegion[];
}
/** Explicit garment-authoring correction, not a change to the source or anchors.
 * V2 may shrink a reviewed hand region for a long sleeve, never the head. */
export interface HandProtectionReview {
  frameId: number;
  label: "nearHand" | "farHand";
  polygon: Point[];
  reason: string;
}
export interface WardrobeRegistration {
  format: "gathria-wardrobe-registration";
  version: 1;
  sourceSha256: string;
  characterId: string;
  frameWidth: number;
  frameHeight: number;
  anchor: Point;
  frames: RegisteredFrame[];
}
export const WARDROBE_SLOTS = ["top", "bottom", "fullBody", "shoes"] as const;
export type WardrobeSlot = (typeof WARDROBE_SLOTS)[number];
/** Shoes are behind trouser cuffs and dress hems. */
export const WARDROBE_COMPOSITION_ORDER = [
  "shoes",
  "bottom",
  "top",
  "fullBody",
] as const;
export interface WardrobeGarmentPage {
  file: `patches-${number}.png`;
  maskFile: `ownership-${number}.png`;
  width: number;
  height: number;
}
export interface WardrobeGarmentFrame {
  frameId: number;
  page: number;
  /** Pixel-aligned crop in both patch and ownership atlases. */
  rect: Rect;
  /** Crop's top-left position in the unchanged native source frame. */
  offset: Point;
}
export interface WardrobeGarmentManifest {
  format: "gathria-sprite-garment";
  version: 1 | 2 | 3;
  id: string;
  name: string;
  slot: WardrobeSlot;
  sourceSha256: string;
  registrationSha256: string;
  characterId: string;
  frameWidth: number;
  frameHeight: number;
  pages: WardrobeGarmentPage[];
  frames: WardrobeGarmentFrame[];
  provenance: string;
  handProtectionReviews?: HandProtectionReview[];
  /** V3 explicitly opts into a shipped, source-bound cloth-only review. It does
   * not permit arbitrary editing or shrinking of the head protection polygon. */
  necklinePermissionProfile?: string;
}
export interface WardrobeGarment {
  bytes: Uint8Array;
  sha256: string;
  manifest: WardrobeGarmentManifest;
  pages: Array<{ patch: Uint8Array; ownership: Uint8Array }>;
}
export type WardrobeSelection = Record<WardrobeSlot, string | null>;
interface WardrobeDocumentBase {
  format: "gathria-wardrobe-project";
  sourceSha256: string;
  registrationSha256: string;
  items: Array<{ id: string; sha256: string }>;
  /** fullBody is mutually exclusive with top and bottom. */
  selection: WardrobeSelection;
  preview: { action: PortableAnimationName; facing: Facing };
}
/** V1 remains the original clothing-only document. Loading a head bank explicitly upgrades to V2. */
export type WardrobeDocument =
  | (WardrobeDocumentBase & { version: 1; appearance?: never })
  | (WardrobeDocumentBase & {
      version: 2;
      appearance: AppearanceDocumentSelection;
    });
export interface WardrobeProject {
  document: WardrobeDocument;
  source: Uint8Array;
  archive: PortableCharacterPackArchive;
  registrationBytes: Uint8Array;
  registration: WardrobeRegistration;
  items: WardrobeGarment[];
  appearanceBank?: AppearanceBank;
}

export const WARDROBE_MAX_ITEMS = 16;
export const WARDROBE_MAX_PAGES = 4;
export const WARDROBE_MAX_ITEM_BYTES = 64 * 1024 * 1024;
export const WARDROBE_MAX_PROJECT_BYTES = 128 * 1024 * 1024;
export const WARDROBE_MAX_METADATA_BYTES = 1024 * 1024;
/** Ownership and RGBA patches each have this budget, validated before decode. */
export const WARDROBE_MAX_ITEM_PIXELS = 32 * 1024 * 1024;

function fail(message: string): never {
  throw Error(message);
}
export function wardrobeObject(
  value: unknown,
  label: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  for (const key of Object.keys(value))
    if (!keys.includes(key)) fail(`Unexpected ${label} field ${key}.`);
  return value as Record<string, unknown>;
}
function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    fail(
      `${label} must be ${integer ? "an integer" : "finite"} between ${min} and ${max}.`,
    );
  return value;
}
function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(`${label} needs nonempty text of at most ${max} characters.`);
  return value;
}
export function wardrobeSha(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    fail(`${label} must be SHA-256.`);
  return value;
}
function id(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)
  )
    fail(
      "Garment id must be 1–64 letters, numbers, dots, underscores or hyphens.",
    );
  return value;
}
function array(
  value: unknown,
  label: string,
  min: number,
  max: number,
): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    fail(`${label} must contain ${min}–${max} entries.`);
  return value;
}
function point(
  value: unknown,
  label: string,
  width: number,
  height: number,
  integer = false,
): Point {
  const p = wardrobeObject(value, label, ["x", "y"]);
  return {
    x: number(p.x, `${label}.x`, 0, width, integer),
    y: number(p.y, `${label}.y`, 0, height, integer),
  };
}
function same(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected)
    fail(`${label} does not match the immutable source.`);
}

export function validateWardrobeRegistration(
  value: unknown,
  archive: PortableCharacterPackArchive,
  sourceSha256: string,
): WardrobeRegistration {
  const data = wardrobeObject(value, "Wardrobe registration", [
    "format",
    "version",
    "sourceSha256",
    "characterId",
    "frameWidth",
    "frameHeight",
    "anchor",
    "frames",
  ]);
  if (data.format !== "gathria-wardrobe-registration" || data.version !== 1)
    fail("Unsupported wardrobe registration format/version.");
  const manifest = archive.manifest;
  same(
    wardrobeSha(data.sourceSha256, "Registration sourceSha256"),
    sourceSha256,
    "Registration checksum",
  );
  same(data.characterId, archive.config.characterId, "Registration character");
  same(
    data.frameWidth,
    manifest.spritesheet.frameWidth,
    "Registration frame width",
  );
  same(
    data.frameHeight,
    manifest.spritesheet.frameHeight,
    "Registration frame height",
  );
  const width = manifest.spritesheet.frameWidth,
    height = manifest.spritesheet.frameHeight;
  const anchor = point(data.anchor, "Registration anchor", width, height);
  same(anchor.x, manifest.anchor.x, "Registration anchor.x");
  same(anchor.y, manifest.anchor.y, "Registration anchor.y");
  const sourceFrames = new Map(
    archive.config.derivation.frames.map((f) => [f.frameId, f.sourceFrame]),
  );
  const expected = new Set(manifest.frames.map((f) => f.id)),
    seen = new Set<number>();
  const frames = array(
    data.frames,
    "Registration frames",
    expected.size,
    expected.size,
  ).map((raw) => {
    const f = wardrobeObject(raw, "Registered frame", [
      "frameId",
      "sourceFrame",
      "points",
      "protected",
    ]);
    const frameId = number(
      f.frameId,
      "Registered frameId",
      0,
      Number.MAX_SAFE_INTEGER,
      true,
    );
    if (!expected.has(frameId) || seen.has(frameId))
      fail("Registration must cover every source frame exactly once.");
    seen.add(frameId);
    same(f.sourceFrame, sourceFrames.get(frameId), "Registration sourceFrame");
    const rawPoints = wardrobeObject(
      f.points,
      "Registration points",
      WARDROBE_ANCHORS,
    );
    const points = {} as RegisteredFrame["points"];
    for (const key of WARDROBE_ANCHORS) {
      const p = wardrobeObject(rawPoints[key], `Anchor ${key}`, [
        "x",
        "y",
        "visibility",
        "confidence",
        "method",
      ]);
      if (p.visibility !== "visible" && p.visibility !== "occluded")
        fail(`Anchor ${key} visibility must be visible or occluded.`);
      points[key] = {
        x: number(p.x, `${key}.x`, 0, width),
        y: number(p.y, `${key}.y`, 0, height),
        visibility: p.visibility,
      };
      if (p.confidence !== undefined)
        points[key].confidence = number(
          p.confidence,
          `${key}.confidence`,
          0,
          1,
        );
      if (p.method !== undefined)
        points[key].method = text(p.method, `${key}.method`, 240);
    }
    const labels = new Set<string>();
    const regions: ProtectedRegion[] = array(
      f.protected,
      "Protected regions",
      1,
      3,
    ).map((raw) => {
      const region = wardrobeObject(raw, "Protected region", [
        "label",
        "polygon",
      ]);
      if (
        !["head", "nearHand", "farHand"].includes(region.label as string) ||
        labels.has(region.label as string)
      )
        fail(
          "Protected region labels must be distinct head, nearHand or farHand.",
        );
      labels.add(region.label as string);
      const polygon = array(region.polygon, "Protection polygon", 3, 64).map(
        (p) => point(p, "Protection point", width, height),
      );
      let area = 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        area += a.x * b.y - b.x * a.y;
      }
      if (Math.abs(area) < 0.0001)
        fail("Protection polygon must enclose a nonzero area.");
      return { label: region.label as ProtectedRegion["label"], polygon };
    });
    if (!labels.has("head"))
      fail("Every registered frame must protect its head.");
    return {
      frameId,
      sourceFrame: f.sourceFrame as number,
      points,
      protected: regions,
    };
  });
  return {
    format: "gathria-wardrobe-registration",
    version: 1,
    sourceSha256,
    characterId: archive.config.characterId,
    frameWidth: width,
    frameHeight: height,
    anchor,
    frames,
  };
}

export function validateWardrobeGarmentManifest(
  value: unknown,
  registration: WardrobeRegistration,
  registrationSha256: string,
): WardrobeGarmentManifest {
  const data = wardrobeObject(value, "Garment", [
    "format",
    "version",
    "id",
    "name",
    "slot",
    "sourceSha256",
    "registrationSha256",
    "characterId",
    "frameWidth",
    "frameHeight",
    "pages",
    "frames",
    "provenance",
    "handProtectionReviews",
    "necklinePermissionProfile",
  ]);
  if (
    data.format !== "gathria-sprite-garment" ||
    ![1, 2, 3].includes(data.version as number)
  )
    fail("Unsupported garment format/version.");
  const itemId = id(data.id),
    name = text(data.name, "Garment name");
  if (!WARDROBE_SLOTS.includes(data.slot as WardrobeSlot))
    fail("Unsupported garment slot.");
  same(
    wardrobeSha(data.sourceSha256, "Garment sourceSha256"),
    registration.sourceSha256,
    "Garment source checksum",
  );
  same(
    wardrobeSha(data.registrationSha256, "Garment registrationSha256"),
    registrationSha256,
    "Garment registration checksum",
  );
  for (const key of ["characterId", "frameWidth", "frameHeight"] as const)
    same(data[key], registration[key], `Garment ${key}`);
  let pixels = 0;
  const pages: WardrobeGarmentPage[] = array(
    data.pages,
    "Garment pages",
    1,
    WARDROBE_MAX_PAGES,
  ).map((raw, i) => {
    const p = wardrobeObject(raw, "Garment page", [
      "file",
      "maskFile",
      "width",
      "height",
    ]);
    if (p.file !== `patches-${i}.png` || p.maskFile !== `ownership-${i}.png`)
      fail(
        "Garment page filenames must be consecutive patches-N.png / ownership-N.png.",
      );
    const width = number(p.width, "Page width", 1, 8192, true),
      height = number(p.height, "Page height", 1, 8192, true);
    if ((pixels += width * height) > WARDROBE_MAX_ITEM_PIXELS)
      fail("Garment exceeds the decoded pixel budget.");
    return {
      file: `patches-${i}.png`,
      maskFile: `ownership-${i}.png`,
      width,
      height,
    };
  });
  const expected = new Set(registration.frames.map((f) => f.frameId)),
    seen = new Set<number>(),
    usedPages = new Set<number>();
  const frames = array(
    data.frames,
    "Garment frames",
    expected.size,
    expected.size,
  ).map((raw) => {
    const f = wardrobeObject(raw, "Garment frame", [
      "frameId",
      "page",
      "rect",
      "offset",
    ]);
    const frameId = number(
      f.frameId,
      "Garment frameId",
      0,
      Number.MAX_SAFE_INTEGER,
      true,
    );
    if (!expected.has(frameId) || seen.has(frameId))
      fail(
        "Garment must cover every registered source frame exactly once; missing poses cannot fall back silently.",
      );
    seen.add(frameId);
    const page = number(f.page, "Garment page", 0, pages.length - 1, true);
    usedPages.add(page);
    const r = wardrobeObject(f.rect, "Patch rectangle", [
      "x",
      "y",
      "width",
      "height",
    ]);
    const rect: Rect = {
      x: number(r.x, "Patch x", 0, pages[page].width - 1, true),
      y: number(r.y, "Patch y", 0, pages[page].height - 1, true),
      width: number(r.width, "Patch width", 1, pages[page].width, true),
      height: number(r.height, "Patch height", 1, pages[page].height, true),
    };
    if (
      rect.x + rect.width > pages[page].width ||
      rect.y + rect.height > pages[page].height
    )
      fail("Patch rectangle exceeds its atlas.");
    const offset = point(
      f.offset,
      "Patch offset",
      registration.frameWidth,
      registration.frameHeight,
      true,
    );
    if (
      offset.x + rect.width > registration.frameWidth ||
      offset.y + rect.height > registration.frameHeight
    )
      fail("Garment silhouette exceeds the native source frame.");
    return { frameId, page, rect, offset };
  });
  if (usedPages.size !== pages.length)
    fail("Every garment atlas page must be used.");
  let handProtectionReviews: HandProtectionReview[] | undefined;
  if (data.version === 1 && data.handProtectionReviews !== undefined)
    fail("Hand protection reviews require garment V2.");
  let necklinePermissionProfile: string | undefined;
  if (data.version !== 3 && data.necklinePermissionProfile !== undefined)
    fail("Neckline cloth reviews require garment V3.");
  if (data.version === 3) {
    if (data.slot !== "top" && data.slot !== "fullBody")
      fail("Only tops or full-body clothing may use a neckline cloth review.");
    necklinePermissionProfile = assertNecklinePermissionProfile(
      data.necklinePermissionProfile,
      registration,
      registrationSha256,
    );
  }
  if (
    data.version === 2 ||
    (data.version === 3 && data.handProtectionReviews !== undefined)
  ) {
    if (data.slot !== "top" && data.slot !== "fullBody")
      fail(
        "Only sleeved tops or full-body clothing may review hand protection.",
      );
    const reviewed = new Set<string>();
    handProtectionReviews = array(
      data.handProtectionReviews,
      "Hand protection reviews",
      1,
      32,
    ).map((raw) => {
      const review = wardrobeObject(raw, "Hand protection review", [
        "frameId",
        "label",
        "polygon",
        "reason",
      ]);
      const frameId = number(
        review.frameId,
        "Reviewed frameId",
        0,
        Number.MAX_SAFE_INTEGER,
        true,
      );
      if (review.label !== "nearHand" && review.label !== "farHand")
        fail(
          "Only nearHand or farHand protection can be reviewed; head protection is immutable.",
        );
      const key = `${frameId}:${review.label}`;
      const original = registration.frames
        .find((f) => f.frameId === frameId)
        ?.protected.find((r) => r.label === review.label);
      if (!original || reviewed.has(key))
        fail(
          "Hand review must name one existing, distinct protected hand and source pose.",
        );
      reviewed.add(key);
      const polygon = array(review.polygon, "Reviewed hand polygon", 3, 64).map(
        (p) =>
          point(
            p,
            "Reviewed hand point",
            registration.frameWidth,
            registration.frameHeight,
          ),
      );
      assertHandReviewSubset(original, polygon);
      return {
        frameId,
        label: review.label,
        polygon,
        reason: text(review.reason, "Hand review reason", 1000),
      };
    });
  }
  return {
    format: "gathria-sprite-garment",
    version: data.version as 1 | 2 | 3,
    id: itemId,
    name,
    slot: data.slot as WardrobeSlot,
    sourceSha256: registration.sourceSha256,
    registrationSha256,
    characterId: registration.characterId,
    frameWidth: registration.frameWidth,
    frameHeight: registration.frameHeight,
    pages,
    frames,
    provenance: text(data.provenance, "Garment provenance", 8192),
    ...(handProtectionReviews ? { handProtectionReviews } : {}),
    ...(necklinePermissionProfile ? { necklinePermissionProfile } : {}),
  };
}

export function validateWardrobeDocument(
  value: unknown,
  project: Pick<WardrobeProject, "archive" | "items" | "appearanceBank">,
): WardrobeDocument {
  const data = wardrobeObject(value, "Wardrobe project document", [
    "format",
    "version",
    "sourceSha256",
    "registrationSha256",
    "items",
    "selection",
    "preview",
    "appearance",
  ]);
  if (
    data.format !== "gathria-wardrobe-project" ||
    (data.version !== 1 && data.version !== 2)
  )
    fail("Unsupported wardrobe project format/version.");
  if (data.version === 1 && ("appearance" in data || project.appearanceBank))
    fail("Wardrobe V1 cannot contain an appearance bank or selection.");
  if (data.version === 2 && !project.appearanceBank)
    fail("Wardrobe V2 requires its embedded appearance bank.");
  const appearance =
    data.version === 2
      ? validateAppearanceSelection(data.appearance, project.appearanceBank!)
      : undefined;
  const sourceSha256 = wardrobeSha(data.sourceSha256, "Project sourceSha256"),
    registrationSha256 = wardrobeSha(
      data.registrationSha256,
      "Project registrationSha256",
    );
  const known = new Map(project.items.map((item) => [item.manifest.id, item])),
    seen = new Set<string>();
  const items = array(
    data.items,
    "Project items",
    project.items.length,
    project.items.length,
  ).map((raw) => {
    const ref = wardrobeObject(raw, "Item reference", ["id", "sha256"]),
      itemId = id(ref.id),
      hash = wardrobeSha(ref.sha256, "Item SHA-256");
    if (seen.has(itemId) || !known.has(itemId))
      fail("Project item references must match its embedded garments exactly.");
    seen.add(itemId);
    if (known.get(itemId)!.sha256 !== hash)
      fail("Project garment checksum mismatch.");
    return { id: itemId, sha256: hash };
  });
  const selected = wardrobeObject(data.selection, "Selection", WARDROBE_SLOTS),
    selection = {} as WardrobeSelection;
  for (const slot of WARDROBE_SLOTS) {
    const value = selected[slot];
    if (
      value !== null &&
      (typeof value !== "string" ||
        !known.has(value) ||
        known.get(value)!.manifest.slot !== slot)
    )
      fail(
        `Selection ${slot} must reference a compatible embedded garment or null.`,
      );
    selection[slot] = value as string | null;
  }
  if (selection.fullBody && (selection.top || selection.bottom))
    fail(
      "A full-body outfit cannot be combined with a separate top or bottom.",
    );
  const preview = wardrobeObject(data.preview, "Preview", ["action", "facing"]);
  if (
    !["idle", "walk", "run", "jump", "celebrate"].includes(
      preview.action as string,
    ) ||
    !project.archive.manifest.animations[
      preview.action as PortableAnimationName
    ]
  )
    fail("Preview action is unavailable in the source pack.");
  if (preview.facing !== "right" && preview.facing !== "left")
    fail("Preview facing must be right or left.");
  const document: WardrobeDocument = {
    format: "gathria-wardrobe-project",
    version: 1,
    sourceSha256,
    registrationSha256,
    items,
    selection,
    preview: {
      action: preview.action as PortableAnimationName,
      facing: preview.facing,
    },
  };
  return appearance ? { ...document, version: 2, appearance } : document;
}
