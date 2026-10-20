import { validateBakedManifest } from "./pack-v2";
import type {
  Animation,
  CharacterPackV2Manifest,
  CharacterPackV3Manifest,
  PortableAnimationName,
} from "./types";

export const BAKED_MAX_PAGES = 4;
export const BAKED_MAX_TOTAL_PIXELS = 128 * 1024 * 1024;
const MAX_FRAMES = 1024;
function fail(message: string): never {
  throw new Error(message);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function integer(
  value: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(`${path} must be an integer from ${min} to ${max}.`);
  return value;
}

/** Explicit multipage contract; V2 remains a strict single-image format. */
export function validateMultipageBakedManifest(
  value: unknown,
): CharacterPackV3Manifest {
  const data = object(value, "Manifest");
  if (data.schemaVersion !== 3)
    fail("schemaVersion must be 3 for a multipage CharacterPack.");
  if (
    !Array.isArray(data.additionalSheets) ||
    data.additionalSheets.length < 1 ||
    data.additionalSheets.length >= BAKED_MAX_PAGES
  )
    fail("V3 requires 2–4 atlas pages, including the primary spritesheet.");
  const sheets = [
    object(data.spritesheet, "spritesheet"),
    ...data.additionalSheets.map((v, i) => object(v, `additionalSheets[${i}]`)),
  ];
  if (
    !Array.isArray(data.frames) ||
    !data.frames.length ||
    data.frames.length > MAX_FRAMES
  )
    fail("V3 frames must contain 1–1024 frame rectangles.");
  const seenIds = new Set<number>();
  const frames = data.frames.map((v, i) => {
    const frame = object(v, `frames[${i}]`);
    const id = integer(frame.id, `frames[${i}].id`, 0, 65535);
    if (seenIds.has(id))
      fail(`Frame ID ${id} is duplicated across atlas pages.`);
    seenIds.add(id);
    return {
      ...frame,
      id,
      page: integer(frame.page, `frames[${i}].page`, 0, sheets.length - 1),
    };
  });
  let totalPixels = 0;
  let totalCells = 0;
  const normalized: CharacterPackV2Manifest[] = sheets.map((sheet, page) => {
    const file = page ? `spritesheet-${page}.png` : "spritesheet.png";
    if (sheet.file !== file)
      fail(`Atlas page ${page} must use root filename ${file}.`);
    if (
      page &&
      (sheet.frameWidth !== sheets[0].frameWidth ||
        sheet.frameHeight !== sheets[0].frameHeight)
    )
      fail("All atlas pages must preserve the same native frame dimensions.");
    const pageFrames = frames.filter((f) => f.page === page);
    if (!pageFrames.length) fail(`Atlas page ${page} has no frames.`);
    // Reuse the strict V2 bounds, grid, overlap, color/render and anchor rules per page.
    const checked = validateBakedManifest({
      ...data,
      schemaVersion: 2,
      spritesheet: { ...sheet, file: "spritesheet.png" },
      frames: pageFrames,
      animations: {
        idle: { frames: [pageFrames[0].id], fps: 1, loop: true },
        walk: { frames: [pageFrames[0].id], fps: 1, loop: true },
      },
    });
    totalPixels += checked.spritesheet.width * checked.spritesheet.height;
    totalCells += checked.spritesheet.columns * checked.spritesheet.rows;
    if (totalPixels > BAKED_MAX_TOTAL_PIXELS)
      fail("V3 atlas pages exceed the 128-Mi-pixel aggregate decoded budget.");
    if (totalCells > MAX_FRAMES)
      fail("V3 atlas pages may contain at most 1024 total grid cells.");
    return checked;
  });
  const rawAnimations = object(data.animations, "animations");
  const allowed: PortableAnimationName[] = [
    "idle",
    "walk",
    "run",
    "jump",
    "celebrate",
  ];
  for (const name of Object.keys(rawAnimations))
    if (!allowed.includes(name as PortableAnimationName))
      fail(`Unsupported baked animation ${JSON.stringify(name)}.`);
  function animation(name: PortableAnimationName): Animation {
    const raw = object(rawAnimations[name], `animations.${name}`);
    if (
      !Array.isArray(raw.frames) ||
      !raw.frames.length ||
      raw.frames.length > MAX_FRAMES
    )
      fail(`animations.${name}.frames must contain 1–1024 frame IDs.`);
    const refs = raw.frames.map((id, i) => {
      const ref = integer(id, `animations.${name}.frames[${i}]`, 0, 65535);
      if (!seenIds.has(ref))
        fail(`animations.${name} references missing frame ${ref}.`);
      return ref;
    });
    if (
      typeof raw.fps !== "number" ||
      !Number.isFinite(raw.fps) ||
      raw.fps < 0.1 ||
      raw.fps > 60
    )
      fail(`animations.${name}.fps must be a finite number from 0.1 to 60.`);
    if (typeof raw.loop !== "boolean")
      fail(`animations.${name}.loop must be true or false.`);
    return { frames: refs, fps: raw.fps, loop: raw.loop };
  }
  const cleanFrames = new Map(
    normalized.flatMap((m, page) =>
      m.frames.map((f) => [f.id, { ...f, page }] as const),
    ),
  );
  return {
    ...normalized[0],
    schemaVersion: 3,
    additionalSheets: normalized
      .slice(1)
      .map((m, i) => ({ ...m.spritesheet, file: `spritesheet-${i + 1}.png` })),
    frames: frames.map((f) => cleanFrames.get(f.id)!),
    animations: {
      idle: animation("idle"),
      walk: animation("walk"),
      ...("run" in rawAnimations ? { run: animation("run") } : {}),
      ...("jump" in rawAnimations ? { jump: animation("jump") } : {}),
      ...("celebrate" in rawAnimations
        ? { celebrate: animation("celebrate") }
        : {}),
    },
  };
}
