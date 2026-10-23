import type { Point, Rect, WardrobeRegistration } from "../wardrobe/contract";

export const APPEARANCE_HAIR_COLORS = [
  "chestnut",
  "espresso",
  "copper",
] as const;
export type AppearanceHairColor = (typeof APPEARANCE_HAIR_COLORS)[number];
export interface AppearanceSelection {
  hairId: string | null;
  faceId: string | null;
  hairColor: AppearanceHairColor;
}
export interface AppearanceDocumentSelection extends AppearanceSelection {
  bankSha256: string;
}
export const DEFAULT_APPEARANCE_SELECTION: AppearanceSelection = {
  hairId: null,
  faceId: null,
  hairColor: "chestnut",
};
export const APPEARANCE_ANCHORS = [
  "headCenter",
  "crown",
  "chin",
  "nearEye",
  "farEye",
  "mouth",
] as const;
export interface AppearancePadding {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface AppearancePose {
  frameId: number;
  sourceFrame: number;
  anchors: Record<(typeof APPEARANCE_ANCHORS)[number], Point>;
  /** Native source coordinates; the original head/body is never rescaled. */
  headBounds: Rect;
  /** Optional raster fringe envelope for hair only. Older banks retain their
   * exact headBounds occlusion; face ownership and lower body never expand. */
  hairOcclusionBounds?: Rect;
  facePolygon: Point[];
  /** Hair may extend into declared transparent output padding. */
  hairBounds: Rect;
  /** Near-side hands/arms that must remain in front of appearance layers. */
  foreground: Point[][];
}
export interface AppearancePage {
  file: `patches-${number}.png`;
  maskFile: `ownership-${number}.png`;
  width: number;
  height: number;
}
export interface AppearancePaintFrame {
  frameId: number;
  mode: "paint";
  page: number;
  rect: Rect;
  offset: Point;
}
export interface AppearanceSourceFrame {
  frameId: number;
  mode: "source";
  /** E.g. an original blink/laugh is explicitly retained, not synthesized. */
  reason: string;
}
export type AppearanceFrame = AppearancePaintFrame | AppearanceSourceFrame;
export type AppearanceLayerRole = "hair-back" | "face" | "hair-front";
export interface AppearanceLayer {
  role: AppearanceLayerRole;
  frames: AppearanceFrame[];
}
export interface AppearanceStyle {
  id: string;
  name: string;
  slot: "hair" | "face";
  layers: AppearanceLayer[];
}
export interface AppearanceBankManifest {
  format: "gathria-sprite-appearance-bank";
  version: 1;
  id: string;
  name: string;
  sourceSha256: string;
  registrationSha256: string;
  characterId: string;
  frameWidth: number;
  frameHeight: number;
  padding: AppearancePadding;
  poses: AppearancePose[];
  pages: AppearancePage[];
  styles: AppearanceStyle[];
  provenance: string;
}
export interface AppearanceBank {
  bytes: Uint8Array;
  sha256: string;
  manifest: AppearanceBankManifest;
  pages: Array<{ patch: Uint8Array; ownership: Uint8Array }>;
}
export const APPEARANCE_MAX_BYTES = 64 * 1024 * 1024;
export const APPEARANCE_MAX_METADATA_BYTES = 2 * 1024 * 1024;
export const APPEARANCE_MAX_PAGES = 8;
export const APPEARANCE_MAX_PIXELS = 64 * 1024 * 1024;

function fail(message: string): never {
  throw Error(message);
}
function object(
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
    fail(`${label} is outside its supported bounds.`);
  return value;
}
function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(`${label} needs nonempty text of at most ${max} characters.`);
  return value;
}
function id(value: unknown): string {
  const result = text(value, "Appearance id", 64);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result))
    fail("Invalid appearance id.");
  return result;
}
function sha(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    fail(`${label} must be SHA-256.`);
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
  bounds: Rect,
  integer = false,
): Point {
  const p = object(value, label, ["x", "y"]);
  return {
    x: number(p.x, `${label}.x`, bounds.x, bounds.x + bounds.width, integer),
    y: number(p.y, `${label}.y`, bounds.y, bounds.y + bounds.height, integer),
  };
}
function rect(
  value: unknown,
  label: string,
  bounds: Rect,
  integer = false,
): Rect {
  const r = object(value, label, ["x", "y", "width", "height"]);
  const result = {
    x: number(r.x, `${label}.x`, bounds.x, bounds.x + bounds.width, integer),
    y: number(r.y, `${label}.y`, bounds.y, bounds.y + bounds.height, integer),
    width: number(r.width, `${label}.width`, 1, bounds.width, integer),
    height: number(r.height, `${label}.height`, 1, bounds.height, integer),
  };
  if (
    result.x + result.width > bounds.x + bounds.width ||
    result.y + result.height > bounds.y + bounds.height
  )
    fail(`${label} exceeds its coordinate bounds.`);
  return result;
}
function polygon(value: unknown, label: string, bounds: Rect): Point[] {
  const points = array(value, label, 3, 64).map((p) => point(p, label, bounds));
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(area) < 0.0001) fail(`${label} must enclose nonzero area.`);
  return points;
}

export function appearanceIsActive(selection?: AppearanceSelection): boolean {
  return !!(selection?.hairId || selection?.faceId);
}

export function validateAppearanceSelection(
  value: unknown,
  bank: AppearanceBank,
): AppearanceDocumentSelection {
  const selected = object(value, "Appearance selection", [
    "bankSha256",
    "hairId",
    "faceId",
    "hairColor",
  ]);
  if (sha(selected.bankSha256, "Appearance bank checksum") !== bank.sha256)
    fail("Appearance bank checksum mismatch.");
  const select = (key: "hairId" | "faceId", slot: "hair" | "face") => {
    const value = selected[key];
    if (
      value !== null &&
      (typeof value !== "string" ||
        !bank.manifest.styles.some(
          (style) => style.id === value && style.slot === slot,
        ))
    )
      fail(`Appearance ${key} must reference a compatible style or null.`);
    return value as string | null;
  };
  if (
    !APPEARANCE_HAIR_COLORS.includes(selected.hairColor as AppearanceHairColor)
  )
    fail("Unsupported appearance hair color.");
  return {
    bankSha256: bank.sha256,
    hairId: select("hairId", "hair"),
    faceId: select("faceId", "face"),
    hairColor: selected.hairColor as AppearanceHairColor,
  };
}

export function validateAppearanceBankManifest(
  value: unknown,
  registration: WardrobeRegistration,
  registrationSha256: string,
): AppearanceBankManifest {
  const data = object(value, "Appearance bank", [
    "format",
    "version",
    "id",
    "name",
    "sourceSha256",
    "registrationSha256",
    "characterId",
    "frameWidth",
    "frameHeight",
    "padding",
    "poses",
    "pages",
    "styles",
    "provenance",
  ]);
  if (data.format !== "gathria-sprite-appearance-bank" || data.version !== 1)
    fail("Unsupported appearance bank format/version.");
  if (
    sha(data.sourceSha256, "Appearance source checksum") !==
    registration.sourceSha256
  )
    fail("Appearance source checksum mismatch.");
  if (
    sha(data.registrationSha256, "Appearance registration checksum") !==
    registrationSha256
  )
    fail("Appearance registration checksum mismatch.");
  for (const key of ["characterId", "frameWidth", "frameHeight"] as const)
    if (data[key] !== registration[key])
      fail(`Appearance ${key} does not match its source registration.`);
  const width = registration.frameWidth,
    height = registration.frameHeight;
  const native = { x: 0, y: 0, width, height };
  const rawPadding = object(data.padding, "Appearance padding", [
    "left",
    "top",
    "right",
    "bottom",
  ]);
  const padding = {} as AppearancePadding;
  for (const key of ["left", "top", "right", "bottom"] as const)
    padding[key] = number(rawPadding[key], `Padding ${key}`, 0, 128, true);
  const padded = {
    x: -padding.left,
    y: -padding.top,
    width: width + padding.left + padding.right,
    height: height + padding.top + padding.bottom,
  };
  const known = new Map(registration.frames.map((f) => [f.frameId, f]));
  const poseIds = new Set<number>();
  const poses = array(
    data.poses,
    "Appearance poses",
    known.size,
    known.size,
  ).map((raw): AppearancePose => {
    const p = object(raw, "Appearance pose", [
      "frameId",
      "sourceFrame",
      "anchors",
      "headBounds",
      "hairOcclusionBounds",
      "facePolygon",
      "hairBounds",
      "foreground",
    ]);
    const frameId = number(
      p.frameId,
      "Appearance frame id",
      0,
      Number.MAX_SAFE_INTEGER,
      true,
    );
    if (!known.has(frameId) || poseIds.has(frameId))
      fail(
        "Appearance poses must cover each registered source frame exactly once.",
      );
    poseIds.add(frameId);
    if (p.sourceFrame !== known.get(frameId)!.sourceFrame)
      fail("Appearance source frame mismatch.");
    const headBounds = rect(p.headBounds, "Head bounds", native);
    // A bank may register a finer face region, but cannot redefine the torso
    // as a head. The immutable clothing registration bounds the authored head;
    // two source pixels accommodate rasterization of its polygon boundary.
    const sourceHead = known
      .get(frameId)!
      .protected.find((region) => region.label === "head");
    if (!sourceHead)
      fail("Appearance requires immutable source head protection.");
    const headMinX =
      Math.min(...sourceHead.polygon.map((point) => point.x)) - 2;
    const headMinY =
      Math.min(...sourceHead.polygon.map((point) => point.y)) - 2;
    const headMaxX =
      Math.max(...sourceHead.polygon.map((point) => point.x)) + 2;
    const headMaxY =
      Math.max(...sourceHead.polygon.map((point) => point.y)) + 2;
    if (
      headBounds.x < headMinX ||
      headBounds.y < headMinY ||
      headBounds.x + headBounds.width > headMaxX ||
      headBounds.y + headBounds.height > headMaxY
    )
      fail("Appearance head bounds exceed immutable source head protection.");
    let hairOcclusionBounds: Rect | undefined;
    if (p.hairOcclusionBounds !== undefined) {
      hairOcclusionBounds = rect(
        p.hairOcclusionBounds,
        "Hair occlusion bounds",
        native,
      );
      const h = hairOcclusionBounds;
      // Raster remnants just outside the authored head box are still scalp,
      // not clothing. Permit a small, explicit top/side fringe only. The lower
      // boundary and all foreground hand/arm masks remain authoritative.
      if (
        h.x > headBounds.x ||
        h.y > headBounds.y ||
        h.x < headBounds.x - 3 ||
        h.y < headBounds.y - 3 ||
        h.x + h.width < headBounds.x + headBounds.width ||
        h.x + h.width > headBounds.x + headBounds.width + 3 ||
        Math.abs(h.y + h.height - (headBounds.y + headBounds.height)) > 1e-6
      )
        fail(
          "Hair occlusion bounds may extend only the top and sides by at most three source pixels.",
        );
    }
    const rawAnchors = object(p.anchors, "Head anchors", APPEARANCE_ANCHORS);
    const anchors = {} as AppearancePose["anchors"];
    for (const key of APPEARANCE_ANCHORS)
      anchors[key] = point(rawAnchors[key], `Head anchor ${key}`, headBounds);
    return {
      frameId,
      sourceFrame: p.sourceFrame as number,
      anchors,
      headBounds,
      ...(hairOcclusionBounds ? { hairOcclusionBounds } : {}),
      facePolygon: polygon(p.facePolygon, "Inner face polygon", headBounds),
      hairBounds: rect(p.hairBounds, "Hair bounds", padded),
      foreground: array(p.foreground, "Head foreground regions", 0, 8).map(
        (region) => polygon(region, "Head foreground polygon", native),
      ),
    };
  });
  let pixels = 0;
  const pages = array(
    data.pages,
    "Appearance pages",
    1,
    APPEARANCE_MAX_PAGES,
  ).map((raw, i): AppearancePage => {
    const p = object(raw, "Appearance page", [
      "file",
      "maskFile",
      "width",
      "height",
    ]);
    if (p.file !== `patches-${i}.png` || p.maskFile !== `ownership-${i}.png`)
      fail(
        "Appearance page filenames must be consecutive patches-N.png / ownership-N.png.",
      );
    const width = number(p.width, "Appearance page width", 1, 8192, true),
      height = number(p.height, "Appearance page height", 1, 8192, true);
    if ((pixels += width * height) > APPEARANCE_MAX_PIXELS)
      fail("Appearance bank exceeds its decoded pixel budget.");
    return {
      file: `patches-${i}.png`,
      maskFile: `ownership-${i}.png`,
      width,
      height,
    };
  });
  const styleIds = new Set<string>(),
    usedPages = new Set<number>();
  const styles = array(data.styles, "Appearance styles", 1, 8).map(
    (raw): AppearanceStyle => {
      const s = object(raw, "Appearance style", [
        "id",
        "name",
        "slot",
        "layers",
      ]);
      const styleId = id(s.id);
      if (styleIds.has(styleId)) fail("Appearance style ids must be unique.");
      styleIds.add(styleId);
      if (s.slot !== "hair" && s.slot !== "face")
        fail("Unsupported appearance slot.");
      const roles = new Set<string>();
      const layers = array(
        s.layers,
        "Appearance layers",
        1,
        s.slot === "hair" ? 2 : 1,
      ).map((raw): AppearanceLayer => {
        const l = object(raw, "Appearance layer", ["role", "frames"]);
        if (
          !(
            s.slot === "hair" ? ["hair-back", "hair-front"] : ["face"]
          ).includes(l.role as string) ||
          roles.has(l.role as string)
        )
          fail(
            "Appearance layer roles must be unique and match their style slot.",
          );
        roles.add(l.role as string);
        const frameIds = new Set<number>();
        const frames = array(
          l.frames,
          "Appearance layer frames",
          known.size,
          known.size,
        ).map((raw): AppearanceFrame => {
          const f = object(raw, "Appearance layer frame", [
            "frameId",
            "mode",
            "reason",
            "page",
            "rect",
            "offset",
          ]);
          const frameId = number(
            f.frameId,
            "Appearance layer frame id",
            0,
            Number.MAX_SAFE_INTEGER,
            true,
          );
          if (!known.has(frameId) || frameIds.has(frameId))
            fail(
              "Every appearance layer must cover all registered frames exactly once.",
            );
          frameIds.add(frameId);
          if (f.mode === "source") {
            if (
              f.page !== undefined ||
              f.rect !== undefined ||
              f.offset !== undefined
            )
              fail(
                "A preserved source appearance frame cannot contain a paint crop.",
              );
            return {
              frameId,
              mode: "source",
              reason: text(f.reason, "Preserved source reason", 240),
            };
          }
          if (f.mode !== "paint" || f.reason !== undefined)
            fail("Appearance frame must explicitly paint or preserve source.");
          const page = number(
            f.page,
            "Appearance atlas page",
            0,
            pages.length - 1,
            true,
          );
          usedPages.add(page);
          const crop = rect(
            f.rect,
            "Appearance patch rectangle",
            {
              x: 0,
              y: 0,
              width: pages[page].width,
              height: pages[page].height,
            },
            true,
          );
          const offset = point(
            f.offset,
            "Appearance patch offset",
            padded,
            true,
          );
          if (
            offset.x + crop.width > padded.x + padded.width ||
            offset.y + crop.height > padded.y + padded.height
          )
            fail("Appearance patch exceeds output padding.");
          return { frameId, mode: "paint", page, rect: crop, offset };
        });
        return { role: l.role as AppearanceLayerRole, frames };
      });
      return {
        id: styleId,
        name: text(s.name, "Appearance style name"),
        slot: s.slot,
        layers,
      };
    },
  );
  if (usedPages.size !== pages.length)
    fail("Every appearance atlas page must be used.");
  return {
    format: "gathria-sprite-appearance-bank",
    version: 1,
    id: id(data.id),
    name: text(data.name, "Appearance bank name"),
    sourceSha256: registration.sourceSha256,
    registrationSha256,
    characterId: registration.characterId,
    frameWidth: width,
    frameHeight: height,
    padding,
    poses,
    pages,
    styles,
    provenance: text(data.provenance, "Appearance provenance", 16384),
  };
}
