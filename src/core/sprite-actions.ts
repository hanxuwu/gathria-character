import { strToU8, zipSync } from "fflate";
import { readBoundedArchive } from "./bounded-archive";
import {
  createBakedCharacterPack,
  readPortableCharacterPackArchive,
  validateBakedCharacterRecipe,
  validatePortableManifest,
  type PortableCharacterPackArchive,
} from "./pack";
import { BAKED_MAX_ARCHIVE_BYTES } from "./pack-v2";
import { sha256 } from "./sha256";
import type {
  BakedCharacterPackManifest,
  BakedCharacterRecipe,
  PortableAnimationName,
} from "./types";

export const SPRITE_ACTIONS = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
] as const;
export interface SpriteActionSettings {
  /** Inclusive, zero-based positions in the immutable original action clip. */
  start: number;
  end: number;
  fps: number;
  loop: boolean;
}
export interface SpriteActionDocument {
  format: "gathria-sprite-action-project";
  version: 1;
  sourceSha256: string;
  actions: Partial<Record<PortableAnimationName, SpriteActionSettings>>;
}
export interface SpriteActionProject {
  document: SpriteActionDocument;
  /** Complete, unmodified input CharacterPack; never derived from the preview. */
  source: Uint8Array;
  archive: PortableCharacterPackArchive;
}

const MAX_DOCUMENT_BYTES = 64 * 1024;
export const SPRITE_PROJECT_MAX_BYTES =
  BAKED_MAX_ARCHIVE_BYTES + MAX_DOCUMENT_BYTES + 1024;
const ZIP_TIME = new Date("2020-01-01T00:00:00.000Z");
const decoder = new TextDecoder("utf-8", { fatal: true });
function object(value: unknown, name: string, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${name} must be an object.`);
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw Error(`Unexpected ${name} field ${key}.`);
  return value as Record<string, unknown>;
}

function validateSettings(
  value: unknown,
  action: PortableAnimationName,
  frameCount: number,
): SpriteActionSettings {
  const settings = object(value, `${action} settings`, [
    "start",
    "end",
    "fps",
    "loop",
  ]);
  for (const key of ["start", "end"] as const)
    if (
      typeof settings[key] !== "number" ||
      !Number.isSafeInteger(settings[key]) ||
      settings[key] < 0 ||
      settings[key] >= frameCount
    )
      throw Error(
        `${action}.${key} must be a source clip position from 0 to ${frameCount - 1}.`,
      );
  if ((settings.start as number) > (settings.end as number))
    throw Error(`${action} needs a nonempty ordered frame range.`);
  if (
    typeof settings.fps !== "number" ||
    !Number.isFinite(settings.fps) ||
    settings.fps < 0.1 ||
    settings.fps > 60
  )
    throw Error(`${action}.fps must be between 0.1 and 60.`);
  if (typeof settings.loop !== "boolean")
    throw Error(`${action}.loop must be true or false.`);
  return {
    start: settings.start as number,
    end: settings.end as number,
    fps: settings.fps,
    loop: settings.loop,
  };
}

export function validateSpriteActionDocument(
  value: unknown,
  manifest: BakedCharacterPackManifest,
): SpriteActionDocument {
  const data = object(value, "Sprite action project", [
    "format",
    "version",
    "sourceSha256",
    "actions",
  ]);
  if (data.format !== "gathria-sprite-action-project" || data.version !== 1)
    throw Error("Unsupported sprite action project format/version.");
  if (
    typeof data.sourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.sourceSha256)
  )
    throw Error("Sprite action project sourceSha256 must be SHA-256.");
  const raw = object(data.actions, "actions", SPRITE_ACTIONS);
  const actions: SpriteActionDocument["actions"] = {};
  for (const action of SPRITE_ACTIONS) {
    const clip = manifest.animations[action];
    if (!clip) {
      if (Object.hasOwn(raw, action))
        throw Error(`The original pack does not contain ${action}.`);
      continue;
    }
    if (!Object.hasOwn(raw, action))
      throw Error(`Sprite action project is missing ${action} settings.`);
    actions[action] = validateSettings(raw[action], action, clip.frames.length);
  }
  return {
    format: "gathria-sprite-action-project",
    version: 1,
    sourceSha256: data.sourceSha256,
    actions,
  };
}

function originalSettings(
  manifest: BakedCharacterPackManifest,
  action: PortableAnimationName,
): SpriteActionSettings {
  const clip = manifest.animations[action];
  if (!clip) throw Error(`The original pack does not contain ${action}.`);
  return {
    start: 0,
    end: clip.frames.length - 1,
    fps: clip.fps,
    loop: clip.loop,
  };
}

/** Structural, CRC and PNG-envelope validation is shared with the independent player. */
export async function createSpriteActionProject(
  source: Uint8Array,
): Promise<SpriteActionProject> {
  if (source.length > BAKED_MAX_ARCHIVE_BYTES)
    throw Error("The original CharacterPack must be at most 64 MiB.");
  const bytes = new Uint8Array(source);
  const archive = readPortableCharacterPackArchive(bytes);
  const actions: SpriteActionDocument["actions"] = {};
  for (const action of SPRITE_ACTIONS)
    if (archive.manifest.animations[action])
      actions[action] = originalSettings(archive.manifest, action);
  return {
    source: bytes,
    archive,
    document: {
      format: "gathria-sprite-action-project",
      version: 1,
      sourceSha256: await sha256(bytes),
      actions,
    },
  };
}

/** Returns a new document; atlas bytes, source pack and original clips stay untouched. */
export function updateSpriteAction(
  project: SpriteActionProject,
  action: PortableAnimationName,
  settings: SpriteActionSettings,
): SpriteActionProject {
  if (!SPRITE_ACTIONS.includes(action))
    throw Error("Unsupported sprite action.");
  return {
    ...project,
    document: validateSpriteActionDocument(
      {
        ...project.document,
        actions: { ...project.document.actions, [action]: settings },
      },
      project.archive.manifest,
    ),
  };
}

export function resetSpriteAction(
  project: SpriteActionProject,
  action: PortableAnimationName,
): SpriteActionProject {
  return updateSpriteAction(
    project,
    action,
    originalSettings(project.archive.manifest, action),
  );
}

export function deriveSpriteActionPlayback(project: SpriteActionProject): {
  manifest: BakedCharacterPackManifest;
  config: BakedCharacterRecipe;
  changed: boolean;
} {
  const doc = validateSpriteActionDocument(
    project.document,
    project.archive.manifest,
  );
  const original = project.archive.manifest;
  const manifest = structuredClone(original);
  let changed = false;
  for (const action of SPRITE_ACTIONS) {
    const clip = original.animations[action],
      settings = doc.actions[action];
    if (!clip || !settings) continue;
    manifest.animations[action] = {
      frames: clip.frames.slice(settings.start, settings.end + 1),
      fps: settings.fps,
      loop: settings.loop,
    };
    changed ||=
      settings.start !== 0 ||
      settings.end !== clip.frames.length - 1 ||
      settings.fps !== clip.fps ||
      settings.loop !== clip.loop;
  }
  const validatedManifest = validatePortableManifest(manifest);
  if (!changed)
    return {
      manifest: validatedManifest,
      config: structuredClone(project.archive.config),
      changed,
    };
  const note =
    "Sprite action settings adjusted from the preserved source CharacterPack. Only contiguous clip selection, FPS and loop/one-shot metadata changed. Every original atlas PNG byte, frame rectangle, source-frame/time mapping and anchor is retained; playback timing may now differ from source video timing.";
  const config = validateBakedCharacterRecipe(
    {
      ...structuredClone(project.archive.config),
      provenance: `${project.archive.config.provenance}\n\n${note}`,
      derivation: {
        ...structuredClone(project.archive.config.derivation),
        method: `${project.archive.config.derivation.method}\n\n${note}`,
      },
      sourceMetadata: {
        ...structuredClone(project.archive.config.sourceMetadata ?? {}),
        spriteActionEdit: {
          format: doc.format,
          version: doc.version,
          sourcePackSha256: doc.sourceSha256,
          actions: structuredClone(doc.actions),
          sourceFrameTimesUnchanged: true,
        },
      },
    },
    validatedManifest,
  );
  return { manifest: validatedManifest, config, changed };
}

async function verifySource(
  project: SpriteActionProject,
): Promise<SpriteActionProject> {
  // Re-read original bytes at the persistence boundary, never trust a caller's
  // mutable archive or source view to redefine the pixel-preservation promise.
  const original = await createSpriteActionProject(project.source);
  if (original.document.sourceSha256 !== project.document.sourceSha256)
    throw Error(
      "Sprite action project source checksum does not match its original CharacterPack.",
    );
  return {
    ...original,
    document: validateSpriteActionDocument(
      project.document,
      original.archive.manifest,
    ),
  };
}

export async function exportSpriteActionProject(
  project: SpriteActionProject,
): Promise<Uint8Array> {
  const verified = await verifySource(project);
  const doc = strToU8(JSON.stringify(verified.document, null, 2));
  if (doc.length > MAX_DOCUMENT_BYTES)
    throw Error("Sprite action document is too large.");
  const archive = zipSync(
    {
      "document.json": doc,
      "original.character.zip": [verified.source, { level: 0 }],
    },
    { level: 6, mtime: ZIP_TIME },
  );
  if (archive.length > SPRITE_PROJECT_MAX_BYTES)
    throw Error("Sprite action project exceeds the archive size limit.");
  return archive;
}

export async function importSpriteActionProject(
  bytes: Uint8Array,
): Promise<SpriteActionProject> {
  const files = readBoundedArchive(bytes, {
    label: "Sprite action project",
    maxArchiveBytes: SPRITE_PROJECT_MAX_BYTES,
    maxExpandedBytes: BAKED_MAX_ARCHIVE_BYTES + MAX_DOCUMENT_BYTES,
    minFiles: 2,
    maxFiles: 2,
    files: {
      "document.json": MAX_DOCUMENT_BYTES,
      "original.character.zip": BAKED_MAX_ARCHIVE_BYTES,
    },
    required: ["document.json", "original.character.zip"],
  });
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(files["document.json"]));
  } catch {
    throw Error("Sprite action document must be valid UTF-8 JSON.");
  }
  const original = await createSpriteActionProject(
    files["original.character.zip"],
  );
  const document = validateSpriteActionDocument(raw, original.archive.manifest);
  if (document.sourceSha256 !== original.document.sourceSha256)
    throw Error(
      "Sprite action project source checksum does not match its original CharacterPack.",
    );
  return { ...original, document };
}

export async function exportSpriteActionPack(
  project: SpriteActionProject,
): Promise<Blob> {
  const verified = await verifySource(project);
  const { manifest, config, changed } = deriveSpriteActionPlayback(verified);
  // Untouched or reset projects retain even the source ZIP's original bytes.
  if (!changed) return new Blob([verified.source], { type: "application/zip" });
  return createBakedCharacterPack(
    config,
    manifest,
    new Blob([verified.archive.png], { type: "image/png" }),
    (verified.archive.additionalPngs ?? []).map(
      (bytes) => new Blob([bytes], { type: "image/png" }),
    ),
  );
}
