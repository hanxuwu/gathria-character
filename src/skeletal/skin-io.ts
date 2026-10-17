import { Inflate, strToU8, zipSync } from "fflate";
import { parseCharacterConfig } from "../core/config";
import { createRigDefinition } from "./definition";
import {
  ALL_SLOTS,
  CHAINS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  REQUIRED_SLOTS,
  RIG_ID,
  type AuthoringProject,
  type ChainName,
  type JointTriple,
  type MotionLibrary,
  type Point,
  type RigDefinition,
  type SkinMetadata,
  type SkinPack,
  type Slot,
} from "./types";

const PIXELS = FRAME_WIDTH * FRAME_HEIGHT * 4;
const MAX_ZIP = 12 * 1024 * 1024;
const MAX_IMAGE = 1024 * 1024;
const MAX_TEXT = 128 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
function fail(message: string): never {
  throw new Error(message);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function finite(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`${path} must be a finite number from ${min} to ${max}.`);
  return value;
}
function integer(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  const n = finite(value, path, min, max);
  if (!Number.isInteger(n)) fail(`${path} must be an integer.`);
  return n;
}
function text(value: unknown, path: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(`${path} must contain 1–${max} characters.`);
  return value.trim();
}
function exact(value: unknown, wanted: unknown, path: string): void {
  if (value !== wanted) fail(`${path} must be ${JSON.stringify(wanted)}.`);
}
function allowedKeys(
  raw: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  if (Object.keys(raw).some((key) => !allowed.includes(key)))
    fail(
      `${path} contains unsupported fields; upgrade the authoring format explicitly.`,
    );
}
function point(value: unknown, path: string, offset = false): Point {
  if (!Array.isArray(value) || value.length !== 2)
    fail(`${path} must be an [x,y] point.`);
  return offset
    ? [
        integer(value[0], `${path}.x`, -32, 32),
        integer(value[1], `${path}.y`, -32, 32),
      ]
    : [
        finite(value[0], `${path}.x`, 0, FRAME_WIDTH),
        finite(value[1], `${path}.y`, 0, FRAME_HEIGHT),
      ];
}
function equalPoint(a: Point, b: Point, path: string): void {
  if (a[0] !== b[0] || a[1] !== b[1])
    fail(`${path} must share the same joint coordinate.`);
}
function chains(value: unknown, path: string): Record<ChainName, JointTriple> {
  const source = object(value, path);
  if (Object.keys(source).length !== CHAINS.length)
    fail(`${path} must contain exactly four chains.`);
  return Object.fromEntries(
    CHAINS.map((name) => {
      const raw = source[name];
      if (!Array.isArray(raw) || raw.length !== 3)
        fail(`${path}.${name} needs three joints.`);
      const joints = raw.map((p, i) =>
        point(p, `${path}.${name}[${i}]`),
      ) as unknown as JointTriple;
      for (let i = 1; i < 3; i++) {
        const length = Math.hypot(
          joints[i][0] - joints[i - 1][0],
          joints[i][1] - joints[i - 1][1],
        );
        if (length < 3 || length > 96)
          fail(`${path}.${name} segment length must be 3–96 pixels.`);
      }
      return [name, joints];
    }),
  ) as Record<ChainName, JointTriple>;
}

/** Parse a portable metadata contract; arbitrary slot names and non-finite transforms are rejected. */
export function validateSkinMetadata(value: unknown): SkinMetadata {
  const raw = object(value, "skin");
  allowedKeys(
    raw,
    [
      "format",
      "version",
      "id",
      "name",
      "rigId",
      "bindings",
      "sourceAppearance",
      "provenance",
      "slots",
    ],
    "skin",
  );
  exact(raw.format, "gathria-skin-pack", "skin.format");
  exact(raw.version, 1, "skin.version");
  exact(raw.rigId, RIG_ID, "skin.rigId");
  const id = text(raw.id, "skin.id", 80);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id))
    fail("skin.id must be a simple alphanumeric identifier.");
  if (
    !Array.isArray(raw.slots) ||
    raw.slots.length < REQUIRED_SLOTS.length ||
    raw.slots.length > ALL_SLOTS.length
  )
    fail(
      "skin.slots must list the 15 required slots and at most two optional slots.",
    );
  const slots = raw.slots.map((s) => {
    if (typeof s !== "string" || !(ALL_SLOTS as readonly string[]).includes(s))
      fail(`Unknown skin slot ${String(s)}.`);
    return s as Slot;
  });
  if (new Set(slots).size !== slots.length)
    fail("skin.slots contains a duplicate slot.");
  for (const slot of REQUIRED_SLOTS)
    if (!slots.includes(slot)) fail(`skin.slots is missing ${slot}.`);
  const bindings = object(raw.bindings, "bindings"),
    mesh = object(bindings.mesh, "bindings.mesh"),
    jaw = object(bindings.jaw, "bindings.jaw");
  allowedKeys(
    bindings,
    ["chains", "offsets", "mesh", "jaw", "hairSway", "garmentSway"],
    "bindings",
  );
  allowedKeys(mesh, ["blendRadius", "volume"], "mesh");
  allowedKeys(jaw, ["center", "start", "scale", "length"], "jaw");
  const offsets: SkinMetadata["bindings"]["offsets"] = {};
  for (const [slot, value] of Object.entries(
    object(bindings.offsets, "bindings.offsets"),
  )) {
    if (
      !(ALL_SLOTS as readonly string[]).includes(slot) ||
      !slots.includes(slot as Slot)
    )
      fail(`Offset refers to absent or unknown slot ${slot}.`);
    offsets[slot as Slot] = point(value, `bindings.offsets.${slot}`, true);
  }
  const sourceAppearance = parseCharacterConfig(raw.sourceAppearance);
  if (
    sourceAppearance.schemaVersion !== 2 ||
    sourceAppearance.artworkVersion !== 6
  )
    fail("sourceAppearance must use artworkVersion 6.");
  return {
    format: "gathria-skin-pack",
    version: 1,
    id,
    name: text(raw.name, "skin.name", 60),
    rigId: RIG_ID,
    slots,
    sourceAppearance,
    provenance: text(raw.provenance, "skin.provenance", 16000),
    bindings: {
      chains: chains(bindings.chains, "bindings.chains"),
      offsets,
      mesh: {
        blendRadius: finite(mesh.blendRadius, "mesh.blendRadius", 1, 16),
        volume: finite(mesh.volume, "mesh.volume", 0, 1),
      },
      jaw: {
        center: point(jaw.center, "jaw.center"),
        start: finite(jaw.start, "jaw.start", 0, 240),
        scale: finite(jaw.scale, "jaw.scale", 0.7, 1.3),
        length: finite(jaw.length, "jaw.length", 0.7, 1.3),
      },
      hairSway: finite(bindings.hairSway, "hairSway", -20, 20),
      garmentSway: finite(bindings.garmentSway, "garmentSway", -20, 20),
    },
  };
}

/** Defensive validation returns independent pixels and metadata, never caller-owned buffers. */
export function validateSkin(skin: SkinPack): SkinPack {
  const raw = object(skin, "skin pack"),
    metadata = validateSkinMetadata(raw.metadata),
    images = object(raw.images, "skin images");
  allowedKeys(raw, ["metadata", "images"], "skin pack");
  if (Object.keys(images).length !== metadata.slots.length)
    fail("skin images must exactly match the declared slots.");
  const result: SkinPack = { metadata, images: {} };
  for (const slot of metadata.slots) {
    const pixels = images[slot];
    if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== PIXELS)
      fail(`${slot} must contain a full 192×256 RGBA image.`);
    let visible = false,
      transparent = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0 && pixels[i] !== 255)
        fail(
          `${slot} must use binary alpha. Import its PNG through slot replacement to normalize alpha.`,
        );
      visible ||= pixels[i] === 255;
      transparent ||= pixels[i] === 0;
    }
    if (!visible)
      fail(`${slot} must not be empty. Omit unused optional slots instead.`);
    if (!transparent) fail(`${slot} needs a transparent background.`);
    result.images[slot] = new Uint8ClampedArray(pixels);
  }
  return result;
}

function validateRig(value: unknown): RigDefinition {
  const raw = object(value, "rig"),
    canonical = createRigDefinition();
  allowedKeys(
    raw,
    [
      "format",
      "version",
      "id",
      "frame",
      "anchor",
      "pivot",
      "bones",
      "chains",
      "drawOrder",
    ],
    "rig",
  );
  exact(raw.format, "gathria-rig", "rig.format");
  exact(raw.version, 1, "rig.version");
  exact(raw.id, RIG_ID, "rig.id");
  const frame = object(raw.frame, "rig.frame");
  exact(frame.width, 192, "rig.frame.width");
  exact(frame.height, 256, "rig.frame.height");
  const anchor = point(raw.anchor, "rig.anchor"),
    pivot = point(raw.pivot, "rig.pivot"),
    joints = chains(raw.chains, "rig.chains");
  equalPoint(anchor, [96, 240], "rig.anchor");
  if (!Array.isArray(raw.bones) || raw.bones.length !== canonical.bones.length)
    fail("rig needs the complete humanoid bone hierarchy.");
  const ids = new Set<string>();
  const bones = raw.bones.map((value, i) => {
    const bone = object(value, `rig.bones[${i}]`),
      id = text(bone.id, "bone.id"),
      expected = canonical.bones.find((b) => b.id === id);
    allowedKeys(bone, ["id", "parent", "from", "to"], "bone");
    if (!expected || ids.has(id)) fail("rig has an unknown or duplicate bone.");
    ids.add(id);
    exact(bone.parent, expected.parent, `${id}.parent`);
    const from = point(bone.from, `${id}.from`),
      to = point(bone.to, `${id}.to`);
    if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 3)
      fail(`${id} bone must not collapse.`);
    return { id, parent: expected.parent, from, to };
  });
  const bone = (id: string) => bones.find((b) => b.id === id)!;
  equalPoint(bone("root").from, anchor, "root.from");
  equalPoint(bone("root").to, pivot, "root.to");
  equalPoint(bone("torso").from, pivot, "torso.from");
  equalPoint(bone("head").from, bone("torso").to, "head.from");
  for (const chain of CHAINS) {
    equalPoint(
      bone(`${chain}:upper`).from,
      joints[chain][0],
      `${chain}:upper.from`,
    );
    equalPoint(
      bone(`${chain}:upper`).to,
      joints[chain][1],
      `${chain}:upper.to`,
    );
    equalPoint(
      bone(`${chain}:lower`).from,
      joints[chain][1],
      `${chain}:lower.from`,
    );
    equalPoint(
      bone(`${chain}:lower`).to,
      joints[chain][2],
      `${chain}:lower.to`,
    );
  }
  if (
    !Array.isArray(raw.drawOrder) ||
    raw.drawOrder.length !== canonical.drawOrder.length ||
    new Set(raw.drawOrder).size !== canonical.drawOrder.length ||
    raw.drawOrder.some((v) => !canonical.drawOrder.includes(v))
  )
    fail(
      "rig.drawOrder must contain each attachment group exactly once, without duplicate limb slots.",
    );
  return {
    format: "gathria-rig",
    version: 1,
    id: RIG_ID,
    frame: { width: 192, height: 256 },
    anchor,
    pivot,
    bones,
    chains: joints,
    drawOrder: [...raw.drawOrder],
  };
}
function validateMotions(value: unknown): MotionLibrary {
  const raw = object(value, "motions"),
    source = object(raw.clips, "motions.clips");
  allowedKeys(raw, ["format", "version", "id", "clips"], "motions");
  exact(raw.format, "gathria-motion-library", "motions.format");
  exact(raw.version, 1, "motions.version");
  allowedKeys(source, ["idle", "walk", "run", "jump"], "motions.clips");
  const names = [
    "idle",
    "walk",
    "run",
    ...(source.jump === undefined ? [] : ["jump"]),
  ] as const;
  const clips = Object.fromEntries(
    names.map((name) => {
      const clip = object(source[name], `motions.${name}`);
      exact(clip.loop, name !== "jump", `${name}.loop`);
      allowedKeys(clip, ["fps", "loop", "keys", "sequence"], `motions.${name}`);
      const keyCount = { idle: 4, walk: 8, run: 12, jump: 12 }[
        name as "idle" | "walk" | "run" | "jump"
      ];
      if (!Array.isArray(clip.keys) || clip.keys.length !== keyCount)
        fail(`${name} needs exactly ${keyCount} keys for authoring format v1.`);
      const keys = clip.keys.map((value) => {
        const k = object(value, `${name}.key`);
        allowedKeys(
          k,
          [
            "footX",
            "footLift",
            "shoePitch",
            "bodyBob",
            "armAngle",
            "lean",
            "armSwing",
            ...(name === "jump" ? ["rootY", "armBend"] : []),
          ],
          `${name}.key`,
        );
        return {
          footX: finite(k.footX, "footX", -48, 48),
          footLift: finite(k.footLift, "footLift", 0, 64),
          shoePitch: finite(k.shoePitch, "shoePitch", -1.6, 1.6),
          bodyBob: finite(k.bodyBob, "bodyBob", -16, 16),
          armAngle: finite(k.armAngle, "armAngle", -1.6, 1.6),
          lean: finite(k.lean, "lean", -0.4, 0.4),
          armSwing: finite(k.armSwing, "armSwing", -24, 24),
          ...(k.rootY === undefined
            ? {}
            : { rootY: finite(k.rootY, "rootY", -16, 0) }),
          ...(k.armBend === undefined
            ? {}
            : { armBend: finite(k.armBend, "armBend", -1.5, 1.5) }),
        };
      });
      if (
        !Array.isArray(clip.sequence) ||
        clip.sequence.length < 1 ||
        clip.sequence.length > 120
      )
        fail(`${name}.sequence needs 1–120 entries.`);
      const sequence = clip.sequence.map((i) =>
        integer(i, `${name}.sequence index`, 0, keys.length - 1),
      );
      return [
        name,
        {
          fps: finite(clip.fps, `${name}.fps`, 1, 60),
          loop: name !== "jump",
          keys,
          sequence,
        },
      ];
    }),
  ) as MotionLibrary["clips"];
  return {
    format: "gathria-motion-library",
    version: 1,
    id: text(raw.id, "motions.id"),
    clips,
  };
}
export function validateProject(
  value: unknown,
  skin?: SkinPack,
): AuthoringProject {
  const raw = object(value, "project"),
    preview = object(raw.preview, "project.preview");
  allowedKeys(
    raw,
    ["format", "version", "rig", "motions", "skin", "preview"],
    "project",
  );
  allowedKeys(preview, ["animation", "facing", "expression"], "preview");
  exact(raw.format, "gathria-rig-authoring", "project.format");
  exact(raw.version, 1, "project.version");
  const motions = validateMotions(raw.motions);
  if (
    !["idle", "walk", "run", "jump"].includes(String(preview.animation)) ||
    (preview.animation === "jump" && !motions.clips.jump) ||
    !["left", "right"].includes(String(preview.facing)) ||
    !["neutral", "gentle", "joyful"].includes(String(preview.expression))
  )
    fail(
      "project.preview must specify a supported animation, facing and expression.",
    );
  return {
    format: "gathria-rig-authoring",
    version: 1,
    rig: validateRig(raw.rig),
    motions,
    skin: validateSkin(skin ?? (raw.skin as SkinPack)),
    preview: {
      animation: preview.animation as AuthoringProject["preview"]["animation"],
      facing: preview.facing as AuthoringProject["preview"]["facing"],
      expression:
        preview.expression as AuthoringProject["preview"]["expression"],
    },
  };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let v = n;
  for (let b = 0; b < 8; b++) v = (v >>> 1) ^ (v & 1 ? 0xedb88320 : 0);
  return v >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (c >>> 8) ^ crcTable[(c ^ b) & 255];
  return (c ^ 0xffffffff) >>> 0;
}

/** Bound every allocation before inflation; accept only our documented file paths. */
function readArchive(
  bytes: Uint8Array,
  project: boolean,
): Record<string, Uint8Array> {
  if (bytes.length < 22 || bytes.length > MAX_ZIP)
    fail("Skin/project ZIP must be intact and at most 12 MiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--)
    if (
      view.getUint32(p, true) === 0x06054b50 &&
      p + 22 + view.getUint16(p + 20, true) === bytes.length
    ) {
      end = p;
      break;
    }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    fail("Invalid or multi-volume ZIP directory.");
  const count = view.getUint16(end + 10, true),
    directory = view.getUint32(end + 16, true);
  if (
    count !== view.getUint16(end + 8, true) ||
    count > ALL_SLOTS.length + (project ? 2 : 3) ||
    count < REQUIRED_SLOTS.length + (project ? 2 : 1)
  )
    fail("ZIP contains an unexpected number of files.");
  if (directory + view.getUint32(end + 12, true) !== end)
    fail("Invalid ZIP directory bounds; ZIP64 is unsupported.");
  const allowed = new Set([
    "skin.json",
    ...ALL_SLOTS.map((s) => `slots/${s}.png`),
    ...(project ? ["project.json"] : ["TEMPLATE.md", "guides.png"]),
  ]);
  const entries: Array<{
    name: string;
    size: number;
    compressed: number;
    start: number;
    method: number;
    crc: number;
  }> = [];
  const names = new Set<string>(),
    ranges: Array<[number, number]> = [];
  let offset = directory,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      fail("Invalid ZIP entry.");
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true),
      crc = view.getUint32(offset + 16, true),
      compressed = view.getUint32(offset + 20, true),
      size = view.getUint32(offset + 24, true),
      nl = view.getUint16(offset + 28, true),
      el = view.getUint16(offset + 30, true),
      cl = view.getUint16(offset + 32, true),
      local = view.getUint32(offset + 42, true);
    const next = offset + 46 + nl + el + cl;
    if (next > end || view.getUint16(offset + 34, true))
      fail("Invalid ZIP entry bounds.");
    let name: string;
    try {
      name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nl));
    } catch {
      fail("ZIP filenames must be valid UTF-8.");
    }
    if (!allowed.has(name))
      fail(`Unexpected ZIP path ${JSON.stringify(name)}.`);
    if (names.has(name)) fail(`Duplicate ZIP file ${name}.`);
    names.add(name);
    if (flags & ~0x080e || ![0, 8].includes(method))
      fail("Encrypted or unsupported ZIP compression.");
    if (
      !size ||
      size > (name.endsWith(".png") ? MAX_IMAGE : MAX_TEXT) ||
      (total += size) > MAX_ZIP
    )
      fail(`${name} exceeds the uncompressed size limit.`);
    if (local + 30 > directory || view.getUint32(local, true) !== 0x04034b50)
      fail(`Invalid local ZIP header for ${name}.`);
    if (
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method
    )
      fail(`Inconsistent ZIP headers for ${name}.`);
    const localNl = view.getUint16(local + 26, true),
      start = local + 30 + localNl + view.getUint16(local + 28, true);
    if (
      start + compressed > directory ||
      localNl !== nl ||
      !bytes
        .subarray(local + 30, local + 30 + localNl)
        .every((v, j) => v === bytes[offset + 46 + j])
    )
      fail(`Invalid ZIP filename/data for ${name}.`);
    if (
      !(flags & 8) &&
      (view.getUint32(local + 14, true) !== crc ||
        view.getUint32(local + 18, true) !== compressed ||
        view.getUint32(local + 22, true) !== size)
    )
      fail(`Inconsistent ZIP sizes/checksum for ${name}.`);
    if (ranges.some(([a, b]) => local < b && start + compressed > a))
      fail("Overlapping ZIP entries.");
    ranges.push([local, start + compressed]);
    entries.push({ name, start, compressed, size, method, crc });
    offset = next;
  }
  if (
    offset !== end ||
    !names.has("skin.json") ||
    (project && !names.has("project.json"))
  )
    fail("ZIP is missing its metadata or has invalid directory size.");
  if (!project && names.has("guides.png") !== names.has("TEMPLATE.md"))
    fail("Template guides and instructions must be supplied together.");
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    const compressed = bytes.subarray(
      entry.start,
      entry.start + entry.compressed,
    );
    let output: Uint8Array;
    if (!entry.method) output = compressed;
    else {
      output = new Uint8Array(entry.size);
      let written = 0;
      try {
        const inflate = new Inflate((chunk) => {
          if (written + chunk.length > output.length)
            fail("Inflation exceeds declared size.");
          output.set(chunk, written);
          written += chunk.length;
        });
        if (!compressed.length) fail("Empty compressed data.");
        for (let i = 0; i < compressed.length; i += 1024)
          inflate.push(
            compressed.subarray(i, i + 1024),
            i + 1024 >= compressed.length,
          );
      } catch {
        fail(`${entry.name} cannot be decompressed within its declared size.`);
      }
      if (written !== entry.size) fail(`${entry.name} failed its size check.`);
    }
    if (output.length !== entry.size || crc32(output) !== entry.crc)
      fail(`${entry.name} failed its checksum or size check.`);
    files[entry.name] = output;
  }
  return files;
}
function json(bytes: Uint8Array, name: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    fail(`${name} must be valid UTF-8 JSON.`);
  }
}

function checkPng(bytes: Uint8Array): void {
  if (
    bytes.length < 33 ||
    bytes.length > MAX_IMAGE ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  )
    fail("Attachment must be an intact PNG under 1 MiB.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    v.getUint32(8) !== 13 ||
    v.getUint32(12) !== 0x49484452 ||
    v.getUint32(16) !== 192 ||
    v.getUint32(20) !== 256
  )
    fail(
      "Attachment PNG must be exactly 192×256; keep the full canvas and joint registration.",
    );
  let offset = 8,
    imageData = false,
    finished = false;
  while (offset + 12 <= bytes.length) {
    const length = v.getUint32(offset),
      type = v.getUint32(offset + 4),
      next = offset + length + 12;
    if (
      next > bytes.length ||
      crc32(bytes.subarray(offset + 4, next - 4)) !== v.getUint32(next - 4)
    )
      fail("Attachment PNG has a damaged chunk or checksum.");
    if (type === 0x6163544c || type === 0x6663544c || type === 0x66644154)
      fail("Use a single-frame PNG attachment, not an animated PNG.");
    if (type === 0x49484452 && offset !== 8)
      fail("Attachment PNG has duplicate headers.");
    imageData ||= type === 0x49444154;
    if (type === 0x49454e44) {
      if (length || next !== bytes.length)
        fail("Attachment PNG has invalid trailing data.");
      finished = true;
      break;
    }
    offset = next;
  }
  if (!imageData || !finished)
    fail("Attachment PNG is truncated or lacks image data.");
}
export async function decodeAttachment(
  file: Blob,
): Promise<{ pixels: Uint8ClampedArray; thresholdedPixels: number }> {
  if (file.size > MAX_IMAGE) fail("Attachment PNG must be at most 1 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkPng(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("Attachment PNG could not be decoded."));
      img.src = url;
    });
    if (img.naturalWidth !== 192 || img.naturalHeight !== 256)
      fail("Decoded attachment dimensions must be 192×256.");
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 256;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) fail("2D canvas is unavailable.");
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, 192, 256).data;
    let thresholdedPixels = 0,
      visible = false,
      transparent = false;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] !== 0 && pixels[i + 3] !== 255) thresholdedPixels++;
      pixels[i + 3] = pixels[i + 3] >= 128 ? 255 : 0;
      if (!pixels[i + 3]) {
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        transparent = true;
      } else visible = true;
    }
    if (!visible || !transparent)
      fail("Attachment needs visible artwork on a transparent background.");
    return { pixels, thresholdedPixels };
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function encodePng(pixels: Uint8ClampedArray): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) fail("2D canvas is unavailable.");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), 192, 256),
    0,
    0,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG export failed."))),
      "image/png",
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
async function skinFiles(skin: SkinPack): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {
    "skin.json": strToU8(JSON.stringify(skin.metadata, null, 2)),
  };
  for (const slot of skin.metadata.slots)
    files[`slots/${slot}.png`] = await encodePng(skin.images[slot]!);
  return files;
}
async function decodeSkin(
  files: Record<string, Uint8Array>,
): Promise<SkinPack> {
  const metadata = validateSkinMetadata(json(files["skin.json"], "skin.json"));
  const paths = Object.keys(files).filter((p) => p.startsWith("slots/"));
  if (
    paths.length !== metadata.slots.length ||
    paths.some((p) => !metadata.slots.some((s) => p === `slots/${s}.png`))
  )
    fail("ZIP slot PNGs must exactly match skin.json.");
  const images: SkinPack["images"] = {};
  for (const slot of metadata.slots) {
    const { pixels, thresholdedPixels } = await decodeAttachment(
      new Blob([files[`slots/${slot}.png`]], { type: "image/png" }),
    );
    if (thresholdedPixels)
      fail(
        `${slot} has partial alpha. Import it through slot replacement to explicitly normalize alpha, then export the skin again.`,
      );
    images[slot] = pixels;
  }
  return validateSkin({ metadata, images });
}
async function openArchive(
  file: Blob,
  project: boolean,
): Promise<Record<string, Uint8Array>> {
  if (file.size > MAX_ZIP) fail("Skin/project ZIP must be at most 12 MiB.");
  return readArchive(new Uint8Array(await file.arrayBuffer()), project);
}
export async function exportSkinPack(skin: SkinPack): Promise<Blob> {
  return new Blob([zipSync(await skinFiles(validateSkin(skin)))], {
    type: "application/zip",
  });
}
export async function importSkinPack(file: Blob): Promise<SkinPack> {
  return decodeSkin(await openArchive(file, false));
}
export async function exportProject(project: AuthoringProject): Promise<Blob> {
  const validated = validateProject(project, validateSkin(project.skin));
  const { skin: _skin, ...metadata } = validated;
  const files = await skinFiles(validated.skin);
  files["project.json"] = strToU8(JSON.stringify(metadata, null, 2));
  return new Blob([zipSync(files)], { type: "application/zip" });
}
export async function importProject(file: Blob): Promise<AuthoringProject> {
  const files = await openArchive(file, true),
    skin = await decodeSkin(files);
  return validateProject(json(files["project.json"], "project.json"), skin);
}
export async function exportTemplate(skin: SkinPack): Promise<Blob> {
  const valid = validateSkin(skin),
    files = await skinFiles(valid);
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) fail("2D canvas is unavailable.");
  ctx.font = "8px monospace";
  ctx.lineWidth = 1;
  for (const [i, name] of CHAINS.entries()) {
    const joints = valid.metadata.bindings.chains[name];
    ctx.strokeStyle = ctx.fillStyle = [
      "#d7305b",
      "#2769d8",
      "#658722",
      "#ad4bba",
    ][i];
    ctx.beginPath();
    ctx.moveTo(...joints[0]);
    ctx.lineTo(...joints[1]);
    ctx.lineTo(...joints[2]);
    ctx.stroke();
    joints.forEach((p, n) => {
      ctx.fillRect(p[0] - 2, p[1] - 2, 5, 5);
      ctx.fillText(`${name}${n}`, Math.min(p[0] + 4, 128), p[1] - 4);
    });
  }
  ctx.fillStyle = "#111111";
  ctx.fillText("GUIDE ONLY — DO NOT IMPORT", 2, 10);
  ctx.fillRect(93, 240, 7, 1);
  ctx.fillRect(96, 237, 1, 7);
  files["guides.png"] = await encodePng(ctx.getImageData(0, 0, 192, 256).data);
  files["TEMPLATE.md"] = strToU8(
    `# ${valid.metadata.name} — registered skin template\n\nEvery slots/*.png is a full 192×256 transparent canvas at native scale. Do not crop or resize it. guides.png is an instruction overlay, never a renderable slot; do not bake markers into artwork. The common foot anchor is (96,240). skin.json stores each source shoulder/elbow/wrist and hip/knee/ankle, offsets, mesh settings, provenance, and jaw registration.\n\nReplace artwork while preserving joint locations and a small overlap around joints. Upper/lower limbs own their own clothing only; torso and hips must remain filled beneath moving arms. Keep all three full-head expressions aligned, including ears, chin, hair and neck. Keep optional garment/back-hair separate from hands and limbs. Use binary alpha, nearest-neighbor pixels, and a transparent background. Standard skin import rejects partial alpha; Studio slot replacement offers explicit threshold conversion at alpha 128.\n\nThe 15 required slots are ${REQUIRED_SLOTS.join(", ")}. Optional slots: back-hair, garment. Remove an unused optional slot from skin.json and its PNG. Files must agree exactly. Do not rename paths or add files. This template archive may be imported with the two guide files present; they are ignored for rendering.\n\nSkin sourceAppearance is provenance/CharacterPack compatibility metadata; importing a skin uses these PNGs, never regenerates the appearance from that configuration. Record the actual creator, license and processing history in provenance when replacing art. Source: ${valid.metadata.provenance}\n`,
  );
  return new Blob([zipSync(files)], { type: "application/zip" });
}
