import { strToU8, zipSync, unzipSync } from "fflate";
import { readBoundedArchive } from "../core/bounded-archive";
import {
  decodeSourceRgbaPng,
  encodeSourceRgbaPng,
  type RgbaPng,
} from "../core/baked-source";
import { sha256 } from "../core/sha256";
import {
  createLimbMesh,
  deformLimbMesh,
  type LimbMesh,
  type Matrix,
  type Point,
} from "./geometry";
import { createBakedCharacterPack } from "../core/pack";
import {
  validateBakedManifest,
  validateBakedCharacterRecipe,
} from "../core/pack-v2";

/** Native Kling candidate contract with explicitly registered source anatomy. */
export const NATIVE_PARTS = [
  "head",
  "torso",
  "pelvis",
  "near-upper-arm",
  "near-forearm",
  "near-hand",
  "far-upper-arm",
  "far-forearm",
  "far-hand",
  "near-thigh",
  "near-shin",
  "near-shoe",
  "far-thigh",
  "far-shin",
  "far-shoe",
] as const;
export const NATIVE_CHAINS = [
  "nearArm",
  "farArm",
  "nearLeg",
  "farLeg",
] as const;
export const NATIVE_POSES = [
  "standing",
  "walk-contact",
  "run-flight",
  "celebrate",
] as const;
export const NATIVE_GROUPS = [
  "far-arm",
  "far-leg",
  "near-leg",
  "pelvis",
  "torso",
  "near-arm",
  "head",
  "near-upper-arm",
  "near-forearm",
] as const;
export type NativePartId = (typeof NATIVE_PARTS)[number];
export type NativePoseId = (typeof NATIVE_POSES)[number];
export type NativeChain = (typeof NATIVE_CHAINS)[number];
export type NativeGroup = (typeof NATIVE_GROUPS)[number];
export type NativeJointTriple = readonly [Point, Point, Point];
export type NativeChains = Record<NativeChain, NativeJointTriple>;
export interface NativeStudyPose {
  id: NativePoseId;
  label: string;
  body: { translation: Point; rotation: number };
  chains: NativeChains;
}
export interface NativePartDefinition {
  id: NativePartId;
  file: string;
  parent: NativePartId | "root";
  pivot: Point;
}
export interface NativeStudyDocument {
  format: "gathria-native-pose-study";
  version: 1;
  name: string;
  frame: { width: 704; height: 1056 };
  anchor: Point;
  pivot: Point;
  neck: Point;
  chains: NativeChains;
  mesh: { blendRadius: number; volume: number; shoulderBlend?: number };
  drawOrder: NativeGroup[];
  parts: NativePartDefinition[];
  poses: NativeStudyPose[];
  source: {
    name: string;
    sha256: string;
    referenceSha256: string;
    frameIndex: number;
    timeSeconds: number;
    provenance: string;
  };
}
export interface NativeStudyProject {
  document: NativeStudyDocument;
  reference: RgbaPng;
  images: Record<NativePartId, RgbaPng>;
  /** Original PNG bytes, retained without Canvas re-encoding. */
  files: Record<string, Uint8Array>;
}
const W = 704,
  H = 1056,
  SIZE = W * H * 4;
const ZIP_TIME = new Date("2020-01-01T00:00:00.000Z");
const IDENT: Matrix = [1, 0, 0, 1, 0, 0];
const fileNames = [
  "reference.png",
  ...NATIVE_PARTS.map((id) => `parts/${id}.png`),
];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mapped = (m: Matrix, p: Point): Point => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];
function fail(message: string): never {
  throw Error(message);
}
function object(v: unknown, label: string, keys?: readonly string[]) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail(`${label} must be an object.`);
  const raw = v as Record<string, unknown>;
  if (keys && Object.keys(raw).some((k) => !keys.includes(k)))
    fail(`${label} contains unsupported fields.`);
  return raw;
}
function num(v: unknown, label: string, min: number, max: number) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    fail(`${label} must be finite and between ${min} and ${max}.`);
  return v;
}
function text(v: unknown, label: string, max = 160) {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail(`${label} must be nonempty text of at most ${max} characters.`);
  return v;
}
function point(v: unknown, label: string, extended = false): Point {
  if (!Array.isArray(v) || v.length !== 2) fail(`${label} must be [x,y].`);
  return [
    num(v[0], `${label}.x`, extended ? -W : 0, extended ? W * 2 : W),
    num(v[1], `${label}.y`, extended ? -H : 0, extended ? H * 2 : H),
  ];
}
function triples(v: unknown, label: string, extended = false): NativeChains {
  const raw = object(v, label, NATIVE_CHAINS);
  return Object.fromEntries(
    NATIVE_CHAINS.map((id) => {
      const triple = raw[id];
      if (!Array.isArray(triple) || triple.length !== 3)
        fail(`${label}.${id} needs three joints.`);
      const joints = triple.map((p, i) =>
        point(p, `${label}.${id}[${i}]`, extended),
      ) as unknown as NativeJointTriple;
      if (
        distance(joints[0], joints[1]) < 2 ||
        distance(joints[1], joints[2]) < 2
      )
        fail(`${label}.${id} has collapsed bones.`);
      return [id, joints];
    }),
  ) as NativeChains;
}
export function nativeBodyMatrix(pose: NativeStudyPose, pivot: Point): Matrix {
  const c = Math.cos(pose.body.rotation),
    s = Math.sin(pose.body.rotation);
  return [
    c,
    s,
    -s,
    c,
    pivot[0] - c * pivot[0] + s * pivot[1] + pose.body.translation[0],
    pivot[1] - s * pivot[0] - c * pivot[1] + pose.body.translation[1],
  ];
}
export function createNativePartDefinitions(
  source: Pick<NativeStudyDocument, "neck" | "pivot" | "chains">,
): NativePartDefinition[] {
  const result: NativePartDefinition[] = [
    {
      id: "head",
      file: "parts/head.png",
      parent: "torso",
      pivot: [...source.neck],
    },
    {
      id: "torso",
      file: "parts/torso.png",
      parent: "pelvis",
      pivot: [...source.pivot],
    },
    {
      id: "pelvis",
      file: "parts/pelvis.png",
      parent: "root",
      pivot: [...source.pivot],
    },
  ];
  for (const side of ["near", "far"] as const) {
    const arm = source.chains[`${side}Arm`],
      leg = source.chains[`${side}Leg`];
    const defs: Array<[NativePartId, NativePartDefinition["parent"], Point]> = [
      [`${side}-upper-arm`, "torso", arm[0]],
      [`${side}-forearm`, `${side}-upper-arm`, arm[1]],
      [`${side}-hand`, `${side}-forearm`, arm[2]],
      [`${side}-thigh`, "pelvis", leg[0]],
      [`${side}-shin`, `${side}-thigh`, leg[1]],
      [`${side}-shoe`, `${side}-shin`, leg[2]],
    ];
    for (const [id, parent, pivot] of defs)
      result.push({ id, file: `parts/${id}.png`, parent, pivot: [...pivot] });
  }
  return result;
}
/** Angles rotate the original source segment vectors, never stretch them. */
export function makeNativePose(
  source: Pick<NativeStudyDocument, "pivot" | "chains">,
  id: NativePoseId,
  label: string,
  options: {
    body?: NativeStudyPose["body"];
    angles?: Partial<Record<NativeChain, readonly [number, number]>>;
  } = {},
): NativeStudyPose {
  const pose: NativeStudyPose = {
    id,
    label,
    body: options.body ?? { translation: [0, 0], rotation: 0 },
    chains: {} as NativeChains,
  };
  const body = nativeBodyMatrix(pose, source.pivot);
  for (const chain of NATIVE_CHAINS) {
    const rest = source.chains[chain],
      root = mapped(body, rest[0]);
    const angles = options.angles?.[chain] ?? [
      pose.body.rotation,
      pose.body.rotation,
    ];
    const joints: Point[] = [root];
    for (let segment = 0; segment < 2; segment++) {
      const c = Math.cos(angles[segment]),
        s = Math.sin(angles[segment]),
        dx = rest[segment + 1][0] - rest[segment][0],
        dy = rest[segment + 1][1] - rest[segment][1];
      joints.push([
        joints[segment][0] + c * dx - s * dy,
        joints[segment][1] + s * dx + c * dy,
      ]);
    }
    pose.chains[chain] = joints as unknown as NativeJointTriple;
  }
  return pose;
}
export function validateNativeStudyDocument(
  value: unknown,
): NativeStudyDocument {
  const raw = object(value, "Native study", [
    "format",
    "version",
    "name",
    "frame",
    "anchor",
    "pivot",
    "neck",
    "chains",
    "mesh",
    "drawOrder",
    "parts",
    "poses",
    "source",
  ]);
  if (raw.format !== "gathria-native-pose-study" || raw.version !== 1)
    fail("Unsupported native study format/version.");
  const frame = object(raw.frame, "frame", ["width", "height"]);
  if (frame.width !== W || frame.height !== H)
    fail("This native study version preserves the 704×1056 source canvas.");
  const mesh = object(raw.mesh, "mesh", [
    "blendRadius",
    "volume",
    "shoulderBlend",
  ]);
  const source = object(raw.source, "source", [
    "name",
    "sha256",
    "referenceSha256",
    "frameIndex",
    "timeSeconds",
    "provenance",
  ]);
  for (const key of ["sha256", "referenceSha256"])
    if (
      typeof source[key] !== "string" ||
      !/^[a-f0-9]{64}$/.test(source[key] as string)
    )
      fail(`source.${key} must be SHA256.`);
  const frameIndex = num(source.frameIndex, "source.frameIndex", 0, 10000000);
  if (!Number.isInteger(frameIndex))
    fail("source.frameIndex must be an integer.");
  const doc: NativeStudyDocument = {
    format: "gathria-native-pose-study",
    version: 1,
    name: text(raw.name, "name", 80),
    frame: { width: W, height: H },
    anchor: point(raw.anchor, "anchor"),
    pivot: point(raw.pivot, "pivot"),
    neck: point(raw.neck, "neck"),
    chains: triples(raw.chains, "chains"),
    mesh: {
      blendRadius: num(mesh.blendRadius, "mesh.blendRadius", 1, 160),
      volume: num(mesh.volume, "mesh.volume", 0, 1),
      ...(mesh.shoulderBlend === undefined
        ? {}
        : {
            shoulderBlend: num(mesh.shoulderBlend, "mesh.shoulderBlend", 0, 80),
          }),
    },
    drawOrder: [],
    parts: [],
    poses: [],
    source: {
      name: text(source.name, "source.name", 240),
      sha256: source.sha256 as string,
      referenceSha256: source.referenceSha256 as string,
      frameIndex,
      timeSeconds: num(source.timeSeconds, "source.timeSeconds", 0, 1000000),
      provenance: text(source.provenance, "source.provenance", 16000),
    },
  };
  const fullArmGroups = NATIVE_GROUPS.filter(
    (id) => !["near-upper-arm", "near-forearm"].includes(id),
  );
  const splitArmGroups = NATIVE_GROUPS.filter((id) => id !== "near-arm");
  if (!Array.isArray(raw.drawOrder))
    fail(
      "drawOrder must contain the seven complete groups or eight split-arm groups.",
    );
  const order = raw.drawOrder;
  if (
    ![fullArmGroups, splitArmGroups].some(
      (groups) =>
        order.length === groups.length &&
        new Set(order).size === groups.length &&
        groups.every((id) => order.includes(id)),
    )
  )
    fail(
      "drawOrder must contain the seven complete groups or eight split-arm groups exactly once.",
    );
  doc.drawOrder = [...raw.drawOrder] as NativeGroup[];
  if (!Array.isArray(raw.parts) || raw.parts.length !== NATIVE_PARTS.length)
    fail("Native study needs fifteen registered parts.");
  const expected = createNativePartDefinitions(doc);
  const seen = new Set<string>();
  doc.parts = raw.parts.map((v, i) => {
    const part = object(v, `parts[${i}]`, ["id", "file", "parent", "pivot"]),
      definition = expected.find((p) => p.id === part.id);
    if (
      !definition ||
      seen.has(definition.id) ||
      part.file !== definition.file ||
      part.parent !== definition.parent
    )
      fail(`Invalid or duplicate source/parent registration for part ${i}.`);
    const pivot = point(part.pivot, `parts[${i}].pivot`);
    if (distance(pivot, definition.pivot) > 0.001)
      fail(`Part ${definition.id} pivot must match its registered joint.`);
    seen.add(definition.id);
    return { ...definition, pivot };
  });
  if (!Array.isArray(raw.poses) || raw.poses.length !== NATIVE_POSES.length)
    fail("Native study needs four static poses.");
  doc.poses = raw.poses.map((v, i) => {
    const input = object(v, `poses[${i}]`, ["id", "label", "body", "chains"]);
    if (input.id !== NATIVE_POSES[i])
      fail(
        "Static pose order must be standing, walk-contact, run-flight, celebrate.",
      );
    const body = object(input.body, "pose.body", ["translation", "rotation"]);
    const pose: NativeStudyPose = {
      id: input.id as NativePoseId,
      label: text(input.label, "pose.label", 80),
      body: {
        translation: point(body.translation, "pose.translation", true),
        rotation: num(body.rotation, "pose.rotation", -Math.PI, Math.PI),
      },
      chains: triples(input.chains, "pose.chains", true),
    };
    const matrix = nativeBodyMatrix(pose, doc.pivot);
    for (const chain of NATIVE_CHAINS) {
      const rest = doc.chains[chain],
        posed = pose.chains[chain];
      if (distance(posed[0], mapped(matrix, rest[0])) > 0.01)
        fail(`Pose ${pose.id} ${chain} is detached from its parent.`);
      for (let j = 0; j < 2; j++)
        if (
          Math.abs(
            distance(posed[j], posed[j + 1]) - distance(rest[j], rest[j + 1]),
          ) > 0.05
        )
          fail(`Pose ${pose.id} ${chain} changes source bone length.`);
    }
    if (
      pose.id === "standing" &&
      (Math.abs(pose.body.rotation) > 1e-9 ||
        distance(pose.body.translation, [0, 0]) > 1e-9 ||
        NATIVE_CHAINS.some((chain) =>
          pose.chains[chain].some(
            (p, j) => distance(p, doc.chains[chain][j]) > 0.001,
          ),
        ))
    )
      fail("Standing must reconstruct the registered source pose exactly.");
    return pose;
  });
  return doc;
}

const archivePaths = ["document.json", "checksums.json", ...fileNames];
const archivePolicy = {
  label: "Native study project",
  maxArchiveBytes: 64 * 1024 * 1024,
  maxExpandedBytes: 64 * 1024 * 1024,
  minFiles: archivePaths.length,
  maxFiles: archivePaths.length,
  files: Object.fromEntries(
    archivePaths.map((name) => [
      name,
      name.endsWith(".json") ? 256 * 1024 : 4 * 1024 * 1024,
    ]),
  ),
  required: archivePaths,
};
function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail(`${label} is not valid UTF-8 JSON.`);
  }
}
async function decodeProject(
  document: NativeStudyDocument,
  files: Record<string, Uint8Array>,
): Promise<NativeStudyProject> {
  const referenceBytes = files["reference.png"];
  if (
    !referenceBytes ||
    (await sha256(referenceBytes)) !== document.source.referenceSha256
  )
    fail("Immutable reference.png hash differs from the source registration.");
  const reference = decodeSourceRgbaPng(referenceBytes, document.frame);
  const images = {} as Record<NativePartId, RgbaPng>;
  for (const part of document.parts) {
    if (!files[part.file]) fail(`Missing native image ${part.file}.`);
    const image = decodeSourceRgbaPng(files[part.file], document.frame);
    let visible = false;
    for (let i = 3; i < image.pixels.length; i += 4)
      if (image.pixels[i]) {
        visible = true;
        break;
      }
    if (!visible) fail(`Native part ${part.id} is empty.`);
    images[part.id] = image;
  }
  return {
    document,
    reference,
    images,
    files: Object.fromEntries(
      fileNames.map((name) => [name, new Uint8Array(files[name])]),
    ),
  };
}
export async function importNativeStudyArchive(
  bytes: Uint8Array,
): Promise<NativeStudyProject> {
  const files = readBoundedArchive(bytes, archivePolicy);
  const checksums = object(
    parseJson(files["checksums.json"], "checksums.json"),
    "checksums",
    archivePaths.filter((name) => name !== "checksums.json"),
  );
  for (const name of archivePaths.filter((name) => name !== "checksums.json"))
    if (checksums[name] !== (await sha256(files[name])))
      fail(`Native project checksum mismatch: ${name}.`);
  return decodeProject(
    validateNativeStudyDocument(
      parseJson(files["document.json"], "document.json"),
    ),
    files,
  );
}
export async function createNativeStudyArchive(
  document: NativeStudyDocument,
  pngFiles: Record<string, Uint8Array>,
): Promise<Uint8Array> {
  const checked = validateNativeStudyDocument(document);
  if (
    Object.keys(pngFiles).some((name) => !fileNames.includes(name)) ||
    fileNames.some((name) => !(pngFiles[name] instanceof Uint8Array))
  )
    fail("Provide exactly reference.png and the fifteen registered part PNGs.");
  await decodeProject(checked, pngFiles);
  const files: Record<string, Uint8Array> = {
    "document.json": strToU8(JSON.stringify(checked, null, 2)),
    ...Object.fromEntries(fileNames.map((name) => [name, pngFiles[name]])),
  };
  const sums: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files))
    sums[name] = await sha256(bytes);
  files["checksums.json"] = strToU8(JSON.stringify(sums, null, 2));
  const result = zipSync(files, { level: 6, mtime: ZIP_TIME });
  readBoundedArchive(result, archivePolicy);
  return result;
}
export async function exportNativeStudyProject(project: NativeStudyProject) {
  return createNativeStudyArchive(project.document, project.files);
}

/** Straight RGBA storage, mathematically premultiplied sampling/compositing. */
function over(
  dst: Uint8ClampedArray,
  offset: number,
  r: number,
  g: number,
  b: number,
  a: number,
) {
  if (a <= 0) return;
  if (a >= 255 || dst[offset + 3] === 0) {
    dst[offset] = Math.round(r);
    dst[offset + 1] = Math.round(g);
    dst[offset + 2] = Math.round(b);
    dst[offset + 3] = Math.round(a);
    return;
  }
  const sa = a / 255,
    da = dst[offset + 3] / 255,
    outA = sa + da * (1 - sa);
  dst[offset] = Math.round((r * sa + dst[offset] * da * (1 - sa)) / outA);
  dst[offset + 1] = Math.round(
    (g * sa + dst[offset + 1] * da * (1 - sa)) / outA,
  );
  dst[offset + 2] = Math.round(
    (b * sa + dst[offset + 2] * da * (1 - sa)) / outA,
  );
  dst[offset + 3] = Math.round(outA * 255);
}
export function nativeSourceOver(
  dst: Uint8ClampedArray,
  source: Uint8Array | Uint8ClampedArray,
) {
  if (dst.length !== SIZE || source.length !== SIZE)
    fail("Native layers must contain 704×1056 RGBA pixels.");
  for (let p = 0; p < source.length; p += 4)
    if (source[p + 3])
      over(dst, p, source[p], source[p + 1], source[p + 2], source[p + 3]);
}
function bounds(
  pixels: Uint8Array | Uint8ClampedArray,
): [number, number, number, number] {
  let left = W,
    top = H,
    right = -1,
    bottom = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (pixels[(y * W + x) * 4 + 3]) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < left) fail("Cannot render an empty native layer.");
  return [left, top, right, bottom];
}
function sample(
  source: Uint8ClampedArray,
  x: number,
  y: number,
): [number, number, number, number] {
  const left = Math.floor(x),
    top = Math.floor(y),
    tx = x - left,
    ty = y - top;
  let a = 0,
    r = 0,
    g = 0,
    b = 0;
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 2; col++) {
      const sx = left + col,
        sy = top + row;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const p = (sy * W + sx) * 4,
        weight = (col ? tx : 1 - tx) * (row ? ty : 1 - ty),
        alpha = source[p + 3] * weight;
      a += alpha;
      r += source[p] * alpha;
      g += source[p + 1] * alpha;
      b += source[p + 2] * alpha;
    }
  return a ? [r / a, g / a, b / a, a] : [0, 0, 0, 0];
}
function drawRigid(
  target: Uint8ClampedArray,
  texture: Uint8ClampedArray,
  box: readonly number[],
  m: Matrix,
) {
  if (m.every((v, i) => Math.abs(v - IDENT[i]) < 1e-10)) {
    nativeSourceOver(target, texture);
    return;
  }
  const [a, b, c, d, tx, ty] = m,
    det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8)
    fail("Singular native part transform.");
  const corners = [
    [box[0] - 1, box[1] - 1],
    [box[2] + 1, box[1] - 1],
    [box[2] + 1, box[3] + 1],
    [box[0] - 1, box[3] + 1],
  ].map((p) => mapped(m, [p[0], p[1]]));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])))),
    x1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map((p) => p[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1])))),
    y1 = Math.min(H - 1, Math.ceil(Math.max(...corners.map((p) => p[1]))));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      over(
        target,
        (y * W + x) * 4,
        ...sample(
          texture,
          (d * (x - tx) - c * (y - ty)) / det,
          (-b * (x - tx) + a * (y - ty)) / det,
        ),
      );
}
/** A third, rigid parent influence keeps the proximal arm attached to the vest.
 * It tapers along the source upper bone; source anatomy and posed joint triples
 * remain unchanged. A zero radius retains the original two-bone deformation. */
export function deformNativeLimb(
  mesh: LimbMesh,
  posed: NativeJointTriple,
  parent?: { matrix: Matrix; radius: number },
): Point[] {
  if (
    parent &&
    (!Number.isFinite(parent.radius) ||
      parent.radius < 0 ||
      parent.radius > 80 ||
      parent.matrix.some((value) => !Number.isFinite(value)))
  )
    fail("Native parent influence needs a finite matrix and radius from0to80.");
  const vertices = deformLimbMesh(mesh, posed);
  if (!parent || !parent.radius) return vertices;
  const root = mesh.joints[0],
    end = mesh.joints[1],
    length = distance(root, end),
    ux = (end[0] - root[0]) / length,
    uy = (end[1] - root[1]) / length;
  return vertices.map((vertex, i) => {
    const point = mesh.rest[i],
      along = (point[0] - root[0]) * ux + (point[1] - root[1]) * uy;
    const t = Math.max(0, Math.min(1, along / parent.radius)),
      chainWeight = t * t * (3 - 2 * t),
      torso = mapped(parent.matrix, point);
    return [
      torso[0] + (vertex[0] - torso[0]) * chainWeight,
      torso[1] + (vertex[1] - torso[1]) * chainWeight,
    ];
  });
}

function drawMesh(
  target: Uint8ClampedArray,
  texture: Uint8ClampedArray,
  mesh: LimbMesh,
  posed: NativeJointTriple,
  partition?: {
    ownership: Uint8Array;
    upper: Uint8ClampedArray;
    lower: Uint8ClampedArray;
  },
  parent?: { matrix: Matrix; radius: number },
) {
  if (posed.every((p, i) => distance(p, mesh.joints[i]) < 1e-9)) {
    if (partition) {
      for (let index = 0; index < W * H; index++)
        if (texture[index * 4 + 3]) {
          const destination = partition.ownership[index]
            ? partition.lower
            : partition.upper;
          destination.set(
            texture.subarray(index * 4, index * 4 + 4),
            index * 4,
          );
        }
    } else nativeSourceOver(target, texture);
    return;
  }
  const vertices = deformNativeLimb(mesh, posed, parent),
    layer = new Uint8ClampedArray(SIZE),
    written = new Uint8Array(W * H);
  // Each destination pixel belongs to one mesh triangle; shared edges must not
  // double-composite translucent skin/fringe. Folded geometry uses stable order.
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const ia = mesh.triangles[i],
      ib = mesh.triangles[i + 1],
      ic = mesh.triangles[i + 2],
      a = vertices[ia],
      b = vertices[ib],
      c = vertices[ic];
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(det) < 1e-8) continue;
    const x0 = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]))),
      x1 = Math.min(W - 1, Math.floor(Math.max(a[0], b[0], c[0]))),
      y0 = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]))),
      y1 = Math.min(H - 1, Math.floor(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const index = y * W + x;
        if (written[index]) continue;
        const wa =
            ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det,
          wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det,
          wc = 1 - wa - wb;
        if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue;
        const sx =
            wa * mesh.rest[ia][0] +
            wb * mesh.rest[ib][0] +
            wc * mesh.rest[ic][0],
          sy =
            wa * mesh.rest[ia][1] +
            wb * mesh.rest[ib][1] +
            wc * mesh.rest[ic][1];
        const rgba = sample(texture, sx, sy);
        if (rgba[3] <= 0) continue;
        written[index] = 1;
        const destination = partition
          ? partition.ownership[
              Math.max(0, Math.min(H - 1, Math.round(sy))) * W +
                Math.max(0, Math.min(W - 1, Math.round(sx)))
            ]
            ? partition.lower
            : partition.upper
          : layer;
        for (let channel = 0; channel < 4; channel++)
          destination[index * 4 + channel] = Math.round(rgba[channel]);
      }
  }
  if (!partition) nativeSourceOver(target, layer);
}
export function mirrorNativePixels(
  pixels: Uint8ClampedArray,
): Uint8ClampedArray {
  if (pixels.length !== SIZE) fail("Mirror needs a native704×1056 frame.");
  const out = new Uint8ClampedArray(SIZE);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      out.set(pixels.subarray(p, p + 4), (y * W + W - 1 - x) * 4);
    }
  return out;
}

/** Footwear is rigid and rotates with the shin about the exact shared ankle.
 * Rounded landmark tolerances must not introduce axial shoe stretching. */
function nativeShoeMatrix(
  source: NativeJointTriple,
  posed: NativeJointTriple,
): Matrix {
  const angle =
    Math.atan2(posed[2][1] - posed[1][1], posed[2][0] - posed[1][0]) -
    Math.atan2(source[2][1] - source[1][1], source[2][0] - source[1][0]);
  const c = Math.cos(angle),
    s = Math.sin(angle),
    a = source[2],
    target = posed[2];
  return [
    c,
    s,
    -s,
    c,
    target[0] - c * a[0] + s * a[1],
    target[1] - s * a[0] - c * a[1],
  ];
}
export function prepareNativeStudy(project: NativeStudyProject) {
  const doc = validateNativeStudyDocument(project.document);
  const textures = {} as Record<NativePartId, Uint8ClampedArray>;
  for (const id of NATIVE_PARTS) {
    const image = project.images[id];
    if (
      !image ||
      image.width !== W ||
      image.height !== H ||
      image.pixels.length !== SIZE
    )
      fail(`Invalid native image ${id}.`);
    textures[id] = new Uint8ClampedArray(image.pixels);
  }
  const rigid = Object.fromEntries(
    ["head", "torso", "pelvis", "near-shoe", "far-shoe"].map((id) => [
      id,
      {
        pixels: textures[id as NativePartId],
        bounds: bounds(textures[id as NativePartId]),
      },
    ]),
  ) as Record<
    string,
    { pixels: Uint8ClampedArray; bounds: [number, number, number, number] }
  >;
  const limbs = {} as Record<
    NativeChain,
    { pixels: Uint8ClampedArray; mesh: LimbMesh }
  >;
  for (const chain of NATIVE_CHAINS) {
    const side = chain.startsWith("near") ? "near" : "far",
      arm = chain.endsWith("Arm");
    const ids: NativePartId[] = arm
      ? [`${side}-upper-arm`, `${side}-forearm`, `${side}-hand`]
      : [`${side}-thigh`, `${side}-shin`];
    const pixels = new Uint8ClampedArray(SIZE);
    ids.forEach((id) => nativeSourceOver(pixels, textures[id]));
    const box = bounds(pixels);
    limbs[chain] = {
      pixels,
      mesh: createLimbMesh(
        [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1],
        doc.chains[chain],
        doc.mesh,
      ),
    };
  }
  // The near arm is sampled/deformed as one continuous texture, then assigned
  // whole destination pixels by original source ownership. This lets its upper
  // section sit behind the vest while the forearm crosses in front, without
  // double-alpha seams from independently transformed cut pieces.
  const nearLower = new Uint8ClampedArray(SIZE),
    nearOwnership = new Uint8Array(W * H);
  nativeSourceOver(nearLower, textures["near-forearm"]);
  nativeSourceOver(nearLower, textures["near-hand"]);
  for (let index = 0; index < W * H; index++) {
    const alpha = nearLower[index * 4 + 3],
      upper = textures["near-upper-arm"][index * 4 + 3];
    nearOwnership[index] =
      alpha > 0 && alpha >= upper * (1 - alpha / 255) ? 1 : 0;
  }
  function getPose(id: NativePoseId) {
    const pose = doc.poses.find((p) => p.id === id);
    if (!pose) fail(`Unknown native pose ${id}.`);
    return pose;
  }
  function inspect(id: NativePoseId) {
    const pose = getPose(id),
      body = nativeBodyMatrix(pose, doc.pivot);
    return {
      bodyBones: [
        { id: "root", from: doc.anchor, to: mapped(body, doc.pivot) },
        {
          id: "torso",
          from: mapped(body, doc.pivot),
          to: mapped(body, doc.neck),
        },
      ],
      chains: structuredClone(pose.chains),
      shoes: (["nearLeg", "farLeg"] as const).map((chain) => {
        const source = doc.chains[chain],
          posed = pose.chains[chain],
          matrix = nativeShoeMatrix(source, posed);
        return {
          chain,
          ankle: posed[2],
          rotation: Math.atan2(matrix[1], matrix[0]),
          matrix,
        };
      }),
    };
  }
  function render(id: NativePoseId, facing: "left" | "right" = "right") {
    const pose = getPose(id),
      body = nativeBodyMatrix(pose, doc.pivot),
      pixels = new Uint8ClampedArray(SIZE);
    const split = doc.drawOrder.includes("near-upper-arm")
      ? {
          ownership: nearOwnership,
          upper: new Uint8ClampedArray(SIZE),
          lower: new Uint8ClampedArray(SIZE),
        }
      : undefined;
    if (split)
      drawMesh(
        pixels,
        limbs.nearArm.pixels,
        limbs.nearArm.mesh,
        pose.chains.nearArm,
        split,
        { matrix: body, radius: doc.mesh.shoulderBlend ?? 0 },
      );
    for (const group of doc.drawOrder) {
      if (group === "near-upper-arm" || group === "near-forearm") {
        nativeSourceOver(
          pixels,
          group === "near-upper-arm" ? split!.upper : split!.lower,
        );
        continue;
      }
      if (group === "head" || group === "torso" || group === "pelvis") {
        const item = rigid[group];
        drawRigid(pixels, item.pixels, item.bounds, body);
        continue;
      }
      const side = group.startsWith("near") ? "near" : "far",
        chain: NativeChain = `${side}${group.endsWith("arm") ? "Arm" : "Leg"}`;
      drawMesh(
        pixels,
        limbs[chain].pixels,
        limbs[chain].mesh,
        pose.chains[chain],
        undefined,
        chain.endsWith("Arm")
          ? { matrix: body, radius: doc.mesh.shoulderBlend ?? 0 }
          : undefined,
      );
      if (chain.endsWith("Leg")) {
        const source = doc.chains[chain],
          posed = pose.chains[chain],
          shoe = rigid[`${side}-shoe`];
        drawRigid(
          pixels,
          shoe.pixels,
          shoe.bounds,
          nativeShoeMatrix(source, posed),
        );
      }
    }
    return facing === "left" ? mirrorNativePixels(pixels) : pixels;
  }
  return { document: doc, render, inspect };
}

/** Four one-frame holds, explicitly not finished animation cycles. */
export async function createNativeStudyHoldPack(
  project: NativeStudyProject,
): Promise<Blob> {
  const prepared = prepareNativeStudy(project),
    width = W * 4,
    pixels = new Uint8Array(width * H * 4);
  NATIVE_POSES.forEach((id, index) => {
    const frame = prepared.render(id);
    for (let y = 0; y < H; y++)
      pixels.set(
        frame.subarray(y * W * 4, (y + 1) * W * 4),
        (y * width + index * W) * 4,
      );
  });
  const name = `${project.document.name.slice(0, 55)} — static pose holds`;
  const manifest = validateBakedManifest({
    schemaVersion: 2,
    format: "gathria-character-pack",
    name,
    generator: "gathria-native-pose-study-v1",
    spritesheet: {
      file: "spritesheet.png",
      width,
      height: H,
      frameWidth: W,
      frameHeight: H,
      columns: 4,
      rows: 1,
    },
    frames: NATIVE_POSES.map((_, id) => ({
      id,
      x: id * W,
      y: 0,
      width: W,
      height: H,
    })),
    animations: Object.fromEntries(
      ["idle", "walk", "run", "celebrate"].map((id, frame) => [
        id,
        { frames: [frame], fps: 1, loop: false },
      ]),
    ),
    facing: { native: "right", right: "none", left: "mirror-x" },
    anchor: {
      x: project.document.anchor[0],
      y: project.document.anchor[1],
      units: "pixels",
      origin: "top-left",
    },
    scale: { pixelArt: false, integerOnly: false, recommended: 0.5 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  });
  const nativeZip = await exportNativeStudyProject(project);
  const recipe = validateBakedCharacterRecipe(
    {
      format: "gathria-baked-character",
      schemaVersion: 1,
      name,
      characterId: "kling-male-native-study",
      source: {
        kind: "unified-archive",
        name: "native-study.project.zip",
        sha256: await sha256(nativeZip),
      },
      provenance: `${project.document.source.provenance}\nDerived static skeletal candidate. This pack contains rendered pose holds; the editable native project is a separate archive.`,
      derivation: {
        method:
          "Source indices0–3 refer to authored static poses in native-study.project.zip, not video frame indices. Reference original source metadata is retained separately. Existing approved video playback is unchanged.",
        frames: NATIVE_POSES.map((_, frameId) => ({
          frameId,
          sourceFrame: frameId,
          timeSeconds: 0,
        })),
      },
      sourceMetadata: {
        staticPoseStudy: true,
        poses: project.document.poses.map((p) => ({
          id: p.id,
          label: p.label,
        })),
        originalReference: project.document.source,
      },
    },
    manifest,
  );
  const png = encodeSourceRgbaPng({
    width,
    height: H,
    pixels,
    colorChunks: project.reference.colorChunks,
  });
  const blob = await createBakedCharacterPack(
    recipe,
    manifest,
    new Blob([png], { type: "image/png" }),
  );
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const notice = `NATIVE KLING MALE CANDIDATE — FOUR STATIC POSE HOLDS\n\n${recipe.provenance}\n\nStanding, walk contact, run flight and celebration are four still poses, not completed animation cycles. Selectors idle/walk/run/celebrate each hold one frame at1FPS with loop=false. No jump is supplied. Native pixels and smooth alpha use704×1056; facing left mirrors each frame.\n\nThis is derived skeletal rendering from registered original parts plus explicitly disclosed reconstructed hidden regions. It is not an exact video frame for the three posed states. The separate native-study project retains source PNGs, registrations, joints and editable static poses. Do not import it as legacy SkinV1.\n\n${recipe.derivation.method}\nProject SHA256: ${recipe.source.sha256}\n`;
  files["PROVENANCE.txt"] = strToU8(notice);
  files["INTEGRATION.md"] = strToU8(
    `# Native pose-study holds / CharacterPack V2\n\n${notice}\nLoad with the independent V2 player using manifest rectangles and anchor, smooth fractional display scaling, and the non-looping hold semantics. No model API or editor is required for playback.\n`,
  );
  return new Blob([zipSync(files, { level: 6, mtime: ZIP_TIME })], {
    type: "application/zip",
  });
}
