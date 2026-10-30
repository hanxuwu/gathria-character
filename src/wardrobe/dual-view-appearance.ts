import {
  APPEARANCE_HAIR_COLORS,
  type AppearanceHairColor,
} from "../appearance/contract";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import { validateWardrobeDocument } from "./contract";
import {
  createDualViewWardrobe,
  DUAL_VIEWS,
  type DualView,
  type DualViewCharacter,
  type DualViewWardrobe,
} from "./dual-view";
import {
  addWardrobeAppearanceBank,
  getWardrobeAppearanceSelection,
  selectWardrobeAppearance,
} from "./project";

/** These are shared choices, not native sprite IDs or interchangeable artwork. */
export interface DualViewAppearanceSelection {
  hairId: "daily-hair" | null;
  faceId: "gentle" | null;
  hairColor: AppearanceHairColor;
}

export const DEFAULT_DUAL_VIEW_APPEARANCE: DualViewAppearanceSelection = {
  hairId: null,
  faceId: null,
  hairColor: "chestnut",
};

/** A reviewed head bank belongs to one character, native source and registration.
 * Catalogs may add URLs, display names and provenance; no hash is inferred here. */
export interface DualViewAppearanceRepresentation {
  character: DualViewCharacter;
  view: DualView;
  sourceSha256: string;
  registrationSha256: string;
  bankSha256: string;
  hairId: string;
  faceId: string | null;
}

export type DualViewAppearanceRepresentations = Readonly<
  Record<DualView, DualViewAppearanceRepresentation>
>;

export interface DualViewAppearanceDescription {
  status: "original" | "paired" | "custom";
  selection: DualViewAppearanceSelection | null;
  message?: string;
}

export type DualViewAppearanceLoader = (
  representation: DualViewAppearanceRepresentation,
  options: SourcePreparationOptions,
) => Promise<Uint8Array>;

/** Explicit reset only: retain clothes and source bytes, remove each embedded
 * head bank and return its native project to V1. The caller may stage this value
 * while preparing a complete look; a subsequent failure cannot clear the open
 * pair, because neither its projects nor documents are mutated here. */
export function clearDualViewAppearance(
  pair: DualViewWardrobe,
): DualViewWardrobe {
  const { projects, ...settings } = pair;
  createDualViewWardrobe(projects, settings);
  if (
    DUAL_VIEWS.every(
      (view) =>
        !projects[view].appearanceBank && projects[view].document.version === 1,
    )
  )
    return pair;
  const cleared = { ...projects };
  for (const view of DUAL_VIEWS) {
    const project = projects[view];
    if (!project.appearanceBank && project.document.version === 1) continue;
    const { appearanceBank: _bank, ...base } = project;
    const { appearance: _appearance, ...document } = project.document;
    cleared[view] = {
      ...base,
      document: validateWardrobeDocument({ ...document, version: 1 }, base),
    };
  }
  return createDualViewWardrobe(cleared, settings);
}

function assertSelection(selection: DualViewAppearanceSelection) {
  if (
    !selection ||
    typeof selection !== "object" ||
    Array.isArray(selection) ||
    Object.keys(selection).length !== 3 ||
    Object.keys(selection).some(
      (key) => !["hairId", "faceId", "hairColor"].includes(key),
    ) ||
    ![null, "daily-hair"].includes(selection.hairId) ||
    ![null, "gentle"].includes(selection.faceId) ||
    !APPEARANCE_HAIR_COLORS.includes(selection.hairColor)
  )
    throw Error("这组发型、表情或发色尚未提供经过检查的双视角版本。");
}

function assertRepresentation(
  pair: DualViewWardrobe,
  view: DualView,
  representation: DualViewAppearanceRepresentation,
) {
  const project = pair.projects[view];
  if (
    !representation ||
    representation.character !== pair.character ||
    representation.view !== view ||
    representation.sourceSha256 !== project.document.sourceSha256 ||
    representation.registrationSha256 !== project.document.registrationSha256 ||
    !/^[a-f0-9]{64}$/.test(representation.bankSha256) ||
    typeof representation.hairId !== "string" ||
    !representation.hairId ||
    (representation.faceId !== null &&
      (typeof representation.faceId !== "string" || !representation.faceId))
  )
    throw Error("这组外观与当前人物、视角或服装定位不匹配。两个视角均未更改。");
}

/** Describe embedded choices without upgrading, fetching or rejecting an imported
 * custom project. Unsupported banks stay renderable and can be saved unchanged.
 * No appearance fields are added to the portable V1 paired envelope: each native
 * Wardrobe V2 already embeds its actual bank, native IDs and selected hair color. */
export function describeDualViewAppearance(
  pair: DualViewWardrobe,
  representations: DualViewAppearanceRepresentations,
): DualViewAppearanceDescription {
  if (DUAL_VIEWS.every((view) => !pair.projects[view].appearanceBank))
    return {
      status: "original",
      selection: { ...DEFAULT_DUAL_VIEW_APPEARANCE },
    };
  try {
    const selections: DualViewAppearanceSelection[] = [];
    for (const view of DUAL_VIEWS) {
      const project = pair.projects[view];
      const representation = representations[view];
      assertRepresentation(pair, view, representation);
      const native = getWardrobeAppearanceSelection(project);
      if (
        project.appearanceBank &&
        project.appearanceBank.sha256 !== representation.bankSha256
      )
        throw Error("已保存的外观使用其他素材版本，当前人物仍按原工程显示。");
      if (
        (native.hairId !== null && native.hairId !== representation.hairId) ||
        (native.faceId !== null && native.faceId !== representation.faceId)
      )
        throw Error("已保存的发型或表情不属于这组双视角搭配，原选择已保留。");
      selections.push({
        hairId: native.hairId === null ? null : "daily-hair",
        faceId: native.faceId === null ? null : "gentle",
        hairColor: native.hairColor,
      });
    }
    if (
      selections[0].hairId !== selections[1].hairId ||
      selections[0].faceId !== selections[1].faceId ||
      selections[0].hairColor !== selections[1].hairColor
    )
      throw Error("两个视角保存了不同的外观选择，已分别保留。");
    return { status: "paired", selection: selections[0] };
  } catch (error) {
    return {
      status: "custom",
      selection: null,
      message: error instanceof Error ? error.message : "原外观已保留。",
    };
  }
}

/** Explicitly apply one shared choice using two independently reviewed native
 * banks. An explicit choice may replace an existing custom bank, but neither
 * accepted project is mutated or returned before both banks validate. Network,
 * archive, style or cancellation failures leave the caller's complete pair intact.
 * This function never rebinds an appearance bank to a different registration. */
export async function prepareDualViewAppearance(
  pair: DualViewWardrobe,
  selection: DualViewAppearanceSelection,
  representations: DualViewAppearanceRepresentations,
  loadBank: DualViewAppearanceLoader,
  options: SourcePreparationOptions = {},
): Promise<DualViewWardrobe> {
  assertSourcePreparationActive(options);
  assertSelection(selection);
  const { projects, ...settings } = pair;
  // Validate the pair shape and its native previews before any external work.
  createDualViewWardrobe(projects, settings);
  if (
    !selection.hairId &&
    !selection.faceId &&
    selection.hairColor === DEFAULT_DUAL_VIEW_APPEARANCE.hairColor &&
    DUAL_VIEWS.every((view) => !projects[view].appearanceBank)
  )
    return pair;

  for (const view of DUAL_VIEWS) {
    const representation = representations[view];
    assertRepresentation(pair, view, representation);
    if (selection.faceId !== null && representation.faceId === null)
      throw Error("这套表情尚未提供两个视角的完整素材，当前外观已保留。");
  }

  const prepared = { ...projects };
  for (const view of DUAL_VIEWS) {
    assertSourcePreparationActive(options);
    const representation = representations[view];
    const existing = projects[view].appearanceBank;
    const bytes =
      existing?.sha256 === representation.bankSha256
        ? existing.bytes
        : await loadBank(representation, options);
    assertSourcePreparationActive(options);
    if ((await sha256(bytes)) !== representation.bankSha256)
      throw Error("外观素材校验失败，两个视角的原搭配已保留。");
    assertSourcePreparationActive(options);
    const project = await addWardrobeAppearanceBank(
      projects[view],
      bytes,
      options,
    );
    const styles = project.appearanceBank!.manifest.styles;
    if (
      !styles.some(
        (style) => style.slot === "hair" && style.id === representation.hairId,
      ) ||
      (representation.faceId !== null &&
        !styles.some(
          (style) =>
            style.slot === "face" && style.id === representation.faceId,
        ))
    )
      throw Error("外观素材不包含声明的发型或表情，原搭配已保留。");
    prepared[view] = selectWardrobeAppearance(project, {
      hairId: selection.hairId === null ? null : representation.hairId,
      faceId: selection.faceId === null ? null : representation.faceId,
      hairColor: selection.hairColor,
    });
  }
  assertSourcePreparationActive(options);
  const accepted = createDualViewWardrobe(prepared, settings);
  if (describeDualViewAppearance(accepted, representations).status !== "paired")
    throw Error("两个视角的外观选择未能一致应用，原搭配已保留。");
  return accepted;
}
