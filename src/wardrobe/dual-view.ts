import { strToU8, zipSync } from "fflate";
import { sha256 } from "../core/sha256";
import {
  gameplayManifest,
  gameplayFrameId,
  gameplayFramePosition,
  gameplayMotionMetadata,
  type GameplayMotion,
  type GameplayState,
  resolveGameplayMotion,
  type GameplayMode,
} from "../core/gameplay-motion";
import {
  assertSourcePreparationActive,
  prepareBoundedArchive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import type { Facing, PortableAnimationName } from "../core/types";
import {
  WARDROBE_MAX_PROJECT_BYTES,
  wardrobeSha,
  type WardrobeProject,
} from "./contract";
import {
  exportWardrobeProject,
  importWardrobeProject,
  updateWardrobePreview,
  validateWardrobeProject,
} from "./project";

export const DUAL_VIEWS = ["original", "side"] as const;
export type DualView = (typeof DUAL_VIEWS)[number];
export type DualViewCharacter = "male" | "female";
export const DUAL_VIEW_MAX_BYTES = 256 * 1024 * 1024;
export const DUAL_VIEW_METADATA_MAX_BYTES = 64 * 1024;

/** Logical choices are resolved by the reviewed collection, never by stretching
 * a garment from one source onto the other. Persistence retains both actual
 * source-bound projects; a caller must validate known choices against its
 * collection before presenting an imported look as a reviewed catalog item. */
export interface DualViewSelection {
  outfitId: string;
  paletteId: string;
  topId: string | null;
  bottomId: string | null;
}

export interface DualViewPreview {
  action: PortableAnimationName;
  facing: Facing;
  /** Position within this view's action, not a shared source-frame ID. */
  position: number;
  /** A paused, reviewed run-up is outside the standalone Jump clip. */
  takeoff?: { profile: GameplayMotion; state: GameplayState };
}

export interface DualViewWardrobe {
  character: DualViewCharacter;
  motionMode: GameplayMode;
  selection: DualViewSelection;
  activeView: DualView;
  previews: Record<DualView, DualViewPreview>;
  projects: Record<DualView, WardrobeProject>;
}

export type DualViewSettings = Omit<
  DualViewWardrobe,
  "projects" | "motionMode"
> & {
  /** Omitted legacy settings retain the complete source action clips. */
  motionMode?: GameplayMode;
};
type NormalizedDualViewSettings = Omit<DualViewWardrobe, "projects">;

interface ProjectReference {
  file: "original.wardrobe.zip" | "side.wardrobe.zip";
  sha256: string;
  sourceSha256: string;
  registrationSha256: string;
  characterId: string;
  frameWidth: number;
  frameHeight: number;
}

type DualViewManifest = Omit<DualViewSettings, "motionMode"> & {
  format: "gathria-dual-view-wardrobe";
  views: Record<DualView, ProjectReference>;
} & ({ version: 1 } | { version: 2; motionMode: GameplayMode });

const ACTIONS: readonly PortableAnimationName[] = [
  "idle",
  "walk",
  "run",
  "jump",
  "celebrate",
];
const decoder = new TextDecoder("utf-8", { fatal: true });
const projectFile = (view: DualView): ProjectReference["file"] =>
  `${view}.wardrobe.zip`;
const sourceIdentity = (character: DualViewCharacter, view: DualView) =>
  `kling-${character}-${view === "original" ? "motion-v1" : "side-workspace-v1"}`;

function object(
  value: unknown,
  label: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw Error(`${label} contains missing or unexpected fields.`);
  return value as Record<string, unknown>;
}

function id(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(value)
  )
    throw Error(`${label} must be a short material identifier.`);
  return value;
}

function readSettings(value: unknown): NormalizedDualViewSettings {
  const hasMode =
    !!value && typeof value === "object" && Object.hasOwn(value, "motionMode");
  const data = object(value, "Dual-view settings", [
    "character",
    "selection",
    "activeView",
    "previews",
    ...(hasMode ? ["motionMode"] : []),
  ]);
  if (
    hasMode &&
    data.motionMode !== "source" &&
    data.motionMode !== "single-jump"
  )
    throw Error("Unsupported dual-view motion mode.");
  if (data.character !== "male" && data.character !== "female")
    throw Error("Dual-view character must be male or female.");
  if (data.activeView !== "original" && data.activeView !== "side")
    throw Error("Unsupported dual-view source.");
  const choice = object(data.selection, "Dual-view selection", [
    "outfitId",
    "paletteId",
    "topId",
    "bottomId",
  ]);
  const selection: DualViewSelection = {
    outfitId: id(choice.outfitId, "Outfit"),
    paletteId: id(choice.paletteId, "Palette"),
    topId: choice.topId === null ? null : id(choice.topId, "Top"),
    bottomId: choice.bottomId === null ? null : id(choice.bottomId, "Bottom"),
  };
  const raw = object(data.previews, "Dual-view previews", DUAL_VIEWS);
  const previews = {} as Record<DualView, DualViewPreview>;
  for (const view of DUAL_VIEWS) {
    const hasTakeoff =
      !!raw[view] &&
      typeof raw[view] === "object" &&
      Object.hasOwn(raw[view] as object, "takeoff");
    const preview = object(raw[view], `${view} preview`, [
      "action",
      "facing",
      "position",
      ...(hasTakeoff ? ["takeoff"] : []),
    ]);
    if (!ACTIONS.includes(preview.action as PortableAnimationName))
      throw Error(`Unsupported ${view} action.`);
    if (preview.facing !== "left" && preview.facing !== "right")
      throw Error(`Invalid ${view} facing.`);
    if (
      !Number.isSafeInteger(preview.position) ||
      (preview.position as number) < 0
    )
      throw Error(`Invalid ${view} action position.`);
    let takeoff: DualViewPreview["takeoff"];
    if (hasTakeoff) {
      if (data.motionMode !== "single-jump")
        throw Error("A takeoff checkpoint requires single-jump playback.");
      const checkpoint = object(preview.takeoff, `${view} takeoff`, [
        "profile",
        "state",
      ]);
      const profile = checkpoint.profile as GameplayMotion;
      gameplayMotionMetadata(profile); // Exact reviewed current or historical profile.
      const state = object(checkpoint.state, `${view} takeoff state`, [
        "action",
        "elapsedMs",
        "pending",
        "returnAction",
        "jumpFrom",
        "leadIn",
      ]);
      const leadIn = object(state.leadIn, `${view} takeoff approach`, [
        "from",
        "exit",
        "elapsedMs",
      ]);
      if (
        state.action !== "jump" ||
        state.action !== preview.action ||
        leadIn.from !== "run" ||
        state.jumpFrom !== "run" ||
        state.pending === "jump" ||
        !["idle", "walk", "run"].includes(state.returnAction as string) ||
        (state.pending !== null &&
          !ACTIONS.includes(state.pending as PortableAnimationName))
      )
        throw Error(`Invalid ${view} takeoff state.`);
      const checked = state as unknown as GameplayState;
      gameplayFrameId(profile, checked);
      if (gameplayFramePosition(profile, checked) !== preview.position)
        throw Error(`Invalid ${view} takeoff position.`);
      takeoff = structuredClone({ profile, state: checked });
    }
    previews[view] = {
      action: preview.action as PortableAnimationName,
      facing: preview.facing,
      position: preview.position as number,
      ...(takeoff ? { takeoff } : {}),
    };
  }
  return {
    character: data.character,
    motionMode: hasMode ? (data.motionMode as GameplayMode) : "source",
    selection,
    activeView: data.activeView,
    previews,
  };
}

function assertProject(
  project: WardrobeProject,
  settings: DualViewSettings,
  view: DualView,
): void {
  const expected = sourceIdentity(settings.character, view);
  if (
    project.archive.config.characterId !== expected ||
    project.registration.characterId !== expected
  )
    throw Error(
      `${view} project does not belong to the selected Kling character and source.`,
    );
  if (
    project.document.sourceSha256 !== project.registration.sourceSha256 ||
    project.registration.frameWidth !==
      project.archive.manifest.spritesheet.frameWidth ||
    project.registration.frameHeight !==
      project.archive.manifest.spritesheet.frameHeight
  )
    throw Error(`${view} project source binding or dimensions do not match.`);
  const selected = project.document.selection;
  if (selected.fullBody !== null || selected.shoes !== null)
    throw Error(
      "Dual-view wardrobe V1 supports shared tops and bottoms with original shoes only.",
    );
  for (const slot of ["top", "bottom"] as const) {
    if (
      (settings.selection[`${slot}Id`] === null) !==
      (selected[slot] === null)
    )
      throw Error(
        `${view} ${slot} is missing the requested logical material variant.`,
      );
    if (
      selected[slot] !== null &&
      !project.items.some(
        (item) =>
          item.manifest.id === selected[slot] && item.manifest.slot === slot,
      )
    )
      throw Error(
        `${view} ${slot} selection is absent from its own source-bound inventory.`,
      );
  }
  const preview = settings.previews[view];
  const profile =
    settings.motionMode === "single-jump"
      ? (preview.takeoff?.profile ??
        resolveGameplayMotion(
          project.archive.manifest,
          project.document.sourceSha256,
        ))
      : null;
  if (settings.motionMode === "single-jump" && !profile)
    throw Error(`${view} source has no reviewed single-jump profile.`);
  if (
    profile &&
    (profile.characterId !== settings.character ||
      profile.view !== view ||
      profile.sourceSha256 !== project.document.sourceSha256)
  )
    throw Error(`${view} takeoff profile does not match its source.`);
  const manifest = profile
    ? gameplayManifest(project.archive.manifest, profile)
    : project.archive.manifest;
  const clip = manifest.animations[preview.action];
  if (!clip || preview.position >= clip.frames.length)
    throw Error(`${view} does not support the requested action or position.`);
}

/** Lightweight construction for already imported native projects. Deep byte,
 * atlas and ownership checks run again at persistence boundaries below. */
export function createDualViewWardrobe(
  projects: Record<DualView, WardrobeProject>,
  settings: DualViewSettings,
): DualViewWardrobe {
  const normalized = readSettings(settings);
  object(projects, "Dual-view projects", DUAL_VIEWS);
  const accepted = {} as Record<DualView, WardrobeProject>;
  for (const view of DUAL_VIEWS) {
    assertProject(projects[view], normalized, view);
    const { action, facing } = normalized.previews[view];
    accepted[view] = updateWardrobePreview(projects[view], { action, facing });
  }
  if (
    accepted.original.document.sourceSha256 ===
    accepted.side.document.sourceSha256
  )
    throw Error(
      "Original and side views must retain distinct native source packs.",
    );
  return { ...normalized, projects: accepted };
}

/** Neither project is returned to the caller until both have passed the native
 * validators. Cancellation/failure never partially replaces an open pair. */
export async function validateDualViewWardrobe(
  wardrobe: DualViewWardrobe,
  options: SourcePreparationOptions = {},
): Promise<DualViewWardrobe> {
  assertSourcePreparationActive(options);
  const { projects, ...settings } = wardrobe;
  const normalized = createDualViewWardrobe(projects, settings);
  const accepted = {} as Record<DualView, WardrobeProject>;
  for (const view of DUAL_VIEWS) {
    assertSourcePreparationActive(options);
    accepted[view] = await validateWardrobeProject(
      normalized.projects[view],
      options,
    );
  }
  assertSourcePreparationActive(options);
  return createDualViewWardrobe(accepted, settings);
}

export async function exportDualViewWardrobe(
  wardrobe: DualViewWardrobe,
  options: SourcePreparationOptions = {},
): Promise<Uint8Array> {
  const verified = await validateDualViewWardrobe(wardrobe, options);
  const { projects, motionMode, ...settings } = verified;
  const views = {} as Record<DualView, ProjectReference>;
  const files: Parameters<typeof zipSync>[0] = {};
  let total = DUAL_VIEW_METADATA_MAX_BYTES;
  for (const view of DUAL_VIEWS) {
    assertSourcePreparationActive(options);
    const project = projects[view];
    // Keep the existing portable project writer, including its full native
    // validation. An abort is checked again before any envelope is published.
    const bytes = await exportWardrobeProject(project);
    assertSourcePreparationActive(options);
    total += bytes.length;
    if (total > DUAL_VIEW_MAX_BYTES)
      throw Error(
        "Dual-view wardrobe exceeds its 256 MiB combined project budget.",
      );
    const file = projectFile(view);
    files[file] = [bytes, { level: 0 }];
    views[view] = {
      file,
      sha256: await sha256(bytes),
      sourceSha256: project.document.sourceSha256,
      registrationSha256: project.document.registrationSha256,
      characterId: project.registration.characterId,
      frameWidth: project.registration.frameWidth,
      frameHeight: project.registration.frameHeight,
    };
  }
  assertSourcePreparationActive(options);
  const manifest: DualViewManifest = {
    format: "gathria-dual-view-wardrobe",
    ...(motionMode === "single-jump"
      ? { version: 2 as const, motionMode }
      : { version: 1 as const }),
    ...settings,
    views,
  };
  const metadata = strToU8(JSON.stringify(manifest, null, 2));
  if (metadata.length > DUAL_VIEW_METADATA_MAX_BYTES)
    throw Error("Dual-view wardrobe metadata exceeds its size limit.");
  files["manifest.json"] = metadata;
  const bytes = zipSync(files, {
    level: 6,
    mtime: new Date(2020, 0, 1, 0, 0, 0),
  });
  if (bytes.length > DUAL_VIEW_MAX_BYTES)
    throw Error("Dual-view wardrobe ZIP exceeds 256 MiB.");
  assertSourcePreparationActive(options);
  return bytes;
}

export async function importDualViewWardrobe(
  bytes: Uint8Array,
  options: SourcePreparationOptions = {},
): Promise<DualViewWardrobe> {
  assertSourcePreparationActive(options);
  const files = await prepareBoundedArchive(
    bytes,
    {
      label: "Dual-view wardrobe",
      maxArchiveBytes: DUAL_VIEW_MAX_BYTES,
      maxExpandedBytes: DUAL_VIEW_MAX_BYTES,
      minFiles: 3,
      maxFiles: 3,
      files: {
        "manifest.json": DUAL_VIEW_METADATA_MAX_BYTES,
        "original.wardrobe.zip": WARDROBE_MAX_PROJECT_BYTES,
        "side.wardrobe.zip": WARDROBE_MAX_PROJECT_BYTES,
      },
      required: ["manifest.json", "original.wardrobe.zip", "side.wardrobe.zip"],
    },
    options,
  );
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(files["manifest.json"]));
  } catch {
    throw Error("Dual-view wardrobe manifest must be valid UTF-8 JSON.");
  }
  const version =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { version?: unknown }).version
      : undefined;
  const data = object(raw, "Dual-view manifest", [
    "format",
    "version",
    "character",
    "selection",
    "activeView",
    "previews",
    "views",
    ...(version === 2 ? ["motionMode"] : []),
  ]);
  if (
    data.format !== "gathria-dual-view-wardrobe" ||
    (data.version !== 1 && data.version !== 2)
  )
    throw Error("Unsupported dual-view wardrobe format/version.");
  const { format: _format, version: _version, views: rawViews, ...rest } = data;
  const settings = readSettings(rest);
  const views = object(rawViews, "Dual-view project references", DUAL_VIEWS);
  const projects = {} as Record<DualView, WardrobeProject>;
  for (const view of DUAL_VIEWS) {
    assertSourcePreparationActive(options);
    const ref = object(views[view], `${view} project reference`, [
      "file",
      "sha256",
      "sourceSha256",
      "registrationSha256",
      "characterId",
      "frameWidth",
      "frameHeight",
    ]);
    if (ref.file !== projectFile(view))
      throw Error(`Unexpected ${view} project filename.`);
    const bytes = files[projectFile(view)];
    if (
      wardrobeSha(ref.sha256, `${view} project hash`) !== (await sha256(bytes))
    )
      throw Error(`${view} embedded wardrobe checksum mismatch.`);
    assertSourcePreparationActive(options);
    const project = await importWardrobeProject(bytes, options);
    if (
      wardrobeSha(ref.sourceSha256, `${view} source hash`) !==
        project.document.sourceSha256 ||
      wardrobeSha(ref.registrationSha256, `${view} registration hash`) !==
        project.document.registrationSha256 ||
      ref.characterId !== project.registration.characterId ||
      ref.frameWidth !== project.registration.frameWidth ||
      ref.frameHeight !== project.registration.frameHeight
    )
      throw Error(
        `${view} project reference does not match its embedded native bindings.`,
      );
    if (
      project.document.preview.action !== settings.previews[view].action ||
      project.document.preview.facing !== settings.previews[view].facing
    )
      throw Error(`${view} saved preview does not match its native project.`);
    projects[view] = project;
  }
  assertSourcePreparationActive(options);
  return createDualViewWardrobe(projects, settings);
}
