import type {
  Animation,
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
  JsonValue,
  PortableAnimationName,
  SpriteFrame,
} from "./types";

export const BAKED_MAX_DIMENSION = 8192;
export const BAKED_MAX_PIXELS = 64 * 1024 * 1024;
export const BAKED_MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_FRAMES = 1024;

function fail(message: string): never {
  throw new Error(message);
}
function record(value: unknown, path: string): Record<string, unknown> {
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
  const result = finite(value, path, min, max);
  if (!Number.isSafeInteger(result)) fail(`${path} must be an integer.`);
  return result;
}
function text(value: unknown, path: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(`${path} must be nonempty text of at most ${max} characters.`);
  return value;
}
function exact(value: unknown, expected: unknown, path: string): void {
  if (value !== expected)
    fail(
      `${path} must be ${JSON.stringify(expected)} for CharacterPack schemaVersion 2.`,
    );
}

/** V2 explicitly describes smooth, baked source pixels; it never adapts V1 art. */
export function validateBakedManifest(value: unknown): CharacterPackV2Manifest {
  const data = record(value, "Manifest");
  exact(data.schemaVersion, 2, "schemaVersion");
  exact(data.format, "gathria-character-pack", "format");
  const name = text(data.name, "name", 80);
  const generator = text(data.generator, "generator");
  const sheet = record(data.spritesheet, "spritesheet");
  exact(sheet.file, "spritesheet.png", "spritesheet.file");
  const width = integer(
    sheet.width,
    "spritesheet.width",
    1,
    BAKED_MAX_DIMENSION,
  );
  const height = integer(
    sheet.height,
    "spritesheet.height",
    1,
    BAKED_MAX_DIMENSION,
  );
  if (width * height > BAKED_MAX_PIXELS)
    fail(
      "The baked spritesheet exceeds the 64-megapixel decoded image budget.",
    );
  const frameWidth = integer(
    sheet.frameWidth,
    "spritesheet.frameWidth",
    1,
    width,
  );
  const frameHeight = integer(
    sheet.frameHeight,
    "spritesheet.frameHeight",
    1,
    height,
  );
  const columns = integer(sheet.columns, "spritesheet.columns", 1, MAX_FRAMES);
  const rows = integer(sheet.rows, "spritesheet.rows", 1, MAX_FRAMES);
  if (width !== frameWidth * columns || height !== frameHeight * rows)
    fail(
      "Spritesheet dimensions must exactly equal frame dimensions multiplied by columns and rows.",
    );
  if (columns * rows > MAX_FRAMES)
    fail("A spritesheet may contain at most 1024 frames.");
  if (
    !Array.isArray(data.frames) ||
    !data.frames.length ||
    data.frames.length > columns * rows
  )
    fail(
      "frames must contain one or more rectangles within the spritesheet grid.",
    );
  const ids = new Set<number>();
  const cells = new Set<string>();
  const frames: SpriteFrame[] = data.frames.map((raw, i) => {
    const item = record(raw, `frames[${i}]`);
    const id = integer(item.id, `frames[${i}].id`, 0, 65535);
    if (ids.has(id)) fail(`Frame ID ${id} is duplicated.`);
    ids.add(id);
    const x = integer(item.x, `frames[${i}].x`, 0, width - frameWidth);
    const y = integer(item.y, `frames[${i}].y`, 0, height - frameHeight);
    exact(item.width, frameWidth, `frames[${i}].width`);
    exact(item.height, frameHeight, `frames[${i}].height`);
    if (x % frameWidth || y % frameHeight)
      fail(`Frame ${id} must align to the spritesheet grid.`);
    const cell = `${x},${y}`;
    if (cells.has(cell)) fail(`Frame ${id} overlaps another frame.`);
    cells.add(cell);
    return { id, x, y, width: frameWidth, height: frameHeight };
  });
  const animationData = record(data.animations, "animations");
  const allowed = ["idle", "walk", "run", "jump", "celebrate"];
  for (const name of Object.keys(animationData))
    if (!allowed.includes(name))
      fail(`Unsupported baked animation ${JSON.stringify(name)}.`);
  function animation(key: PortableAnimationName): Animation {
    const item = record(animationData[key], `animations.${key}`);
    if (
      !Array.isArray(item.frames) ||
      !item.frames.length ||
      item.frames.length > MAX_FRAMES
    )
      fail(
        `animations.${key}.frames must contain 1–1024 frame IDs in playback order.`,
      );
    const refs = item.frames.map((raw, i) => {
      const id = integer(raw, `animations.${key}.frames[${i}]`, 0, 65535);
      if (!ids.has(id))
        fail(`animations.${key} references missing frame ${id}.`);
      return id;
    });
    const fps = finite(item.fps, `animations.${key}.fps`, 0.1, 60);
    if (typeof item.loop !== "boolean")
      fail(`animations.${key}.loop must be true or false.`);
    return { frames: refs, fps, loop: item.loop };
  }
  const facing = record(data.facing, "facing");
  exact(facing.native, "right", "facing.native");
  exact(facing.right, "none", "facing.right");
  exact(facing.left, "mirror-x", "facing.left");
  const anchor = record(data.anchor, "anchor");
  exact(anchor.units, "pixels", "anchor.units");
  exact(anchor.origin, "top-left", "anchor.origin");
  const x = finite(anchor.x, "anchor.x", 0, frameWidth);
  const y = finite(anchor.y, "anchor.y", 0, frameHeight);
  const scale = record(data.scale, "scale");
  exact(scale.pixelArt, false, "scale.pixelArt");
  exact(scale.integerOnly, false, "scale.integerOnly");
  const recommended = finite(scale.recommended, "scale.recommended", 0.05, 16);
  const capabilities = record(data.capabilities, "capabilities");
  exact(capabilities.renderMode, "baked", "capabilities.renderMode");
  exact(
    capabilities.editableAppearance,
    false,
    "capabilities.editableAppearance",
  );
  exact(data.configuration, "character.json", "configuration");
  return {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name,
    generator,
    spritesheet: {
      file: "spritesheet.png",
      width,
      height,
      frameWidth,
      frameHeight,
      columns,
      rows,
    },
    frames,
    animations: {
      idle: animation("idle"),
      walk: animation("walk"),
      ...("run" in animationData ? { run: animation("run") } : {}),
      ...("jump" in animationData ? { jump: animation("jump") } : {}),
      ...("celebrate" in animationData
        ? { celebrate: animation("celebrate") }
        : {}),
    },
    facing: { native: "right", right: "none", left: "mirror-x" },
    anchor: { x, y, units: "pixels", origin: "top-left" },
    scale: { pixelArt: false, integerOnly: false, recommended },
    configuration: "character.json",
    capabilities: { renderMode: "baked", editableAppearance: false },
  };
}

/** Keep only bounded JSON metadata; reject cycles, prototypes and non-JSON values. */
function metadata(value: unknown): { [key: string]: JsonValue } {
  record(value, "sourceMetadata");
  let nodes = 0;
  const seen = new Set<object>();
  function check(item: unknown, depth: number): void {
    if (++nodes > 10000 || depth > 16)
      fail("sourceMetadata is too deeply nested or complex.");
    if (item === null || typeof item === "boolean" || typeof item === "string")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (!item || typeof item !== "object" || seen.has(item))
      fail("sourceMetadata must be finite, acyclic JSON.");
    if (
      !Array.isArray(item) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(item))
    )
      fail("sourceMetadata must contain plain JSON objects.");
    seen.add(item);
    for (const child of Object.values(item)) check(child, depth + 1);
    seen.delete(item);
  }
  check(value, 0);
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length > 64 * 1024)
    fail("sourceMetadata must be at most 64 KiB of UTF-8 JSON.");
  return JSON.parse(serialized) as { [key: string]: JsonValue };
}

export function validateBakedCharacterRecipe(
  value: unknown,
  manifest?: CharacterPackV2Manifest,
): BakedCharacterRecipe {
  const data = record(value, "character.json");
  if (data.schemaVersion !== 1 || data.format !== "gathria-baked-character")
    fail(
      "character.json must be a gathria-baked-character recipe with schemaVersion 1.",
    );
  const name = text(data.name, "character.json.name", 80);
  if (manifest && name !== manifest.name)
    fail("character.json name must match the name in manifest.json.");
  const characterId = text(data.characterId, "character.json.characterId", 120);
  const rawSource = record(data.source, "character.json.source");
  if (
    rawSource.kind !== "video-extraction" &&
    rawSource.kind !== "unified-archive"
  )
    fail(
      "character.json.source.kind must identify video-extraction or unified-archive.",
    );
  const sourceName = text(rawSource.name, "character.json.source.name", 240);
  const sha256 = text(rawSource.sha256, "character.json.source.sha256", 64);
  if (!/^[a-f0-9]{64}$/.test(sha256))
    fail(
      "character.json.source.sha256 must be 64 lowercase hexadecimal characters.",
    );
  const provenance = text(data.provenance, "character.json.provenance", 32768);
  const derivation = record(data.derivation, "character.json.derivation");
  const method = text(
    derivation.method,
    "character.json.derivation.method",
    16384,
  );
  if (
    !Array.isArray(derivation.frames) ||
    !derivation.frames.length ||
    derivation.frames.length > MAX_FRAMES
  )
    fail(
      "character.json.derivation.frames must map 1–1024 unique atlas frames to their source.",
    );
  const ids = new Set<number>();
  const frames = derivation.frames.map((raw, i) => {
    const item = record(raw, `character.json.derivation.frames[${i}]`);
    const frameId = integer(
      item.frameId,
      `derivation.frames[${i}].frameId`,
      0,
      65535,
    );
    if (ids.has(frameId))
      fail(`Duplicate derivation for atlas frame ${frameId}.`);
    ids.add(frameId);
    const sourceFrame = integer(
      item.sourceFrame,
      `derivation.frames[${i}].sourceFrame`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const timeSeconds = finite(
      item.timeSeconds,
      `derivation.frames[${i}].timeSeconds`,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    return { frameId, sourceFrame, timeSeconds };
  });
  if (
    manifest &&
    (ids.size !== manifest.frames.length ||
      manifest.frames.some((frame) => !ids.has(frame.id)))
  )
    fail(
      "character.json derivation must describe every atlas frame exactly once.",
    );
  return {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name,
    characterId,
    source: { kind: rawSource.kind, name: sourceName, sha256 },
    provenance,
    derivation: { method, frames },
    ...(data.sourceMetadata !== undefined
      ? { sourceMetadata: metadata(data.sourceMetadata) }
      : {}),
  };
}
