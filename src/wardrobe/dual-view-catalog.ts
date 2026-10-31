import catalog from "../../docs/dual-view-wardrobe/assets/catalog.json";
import tailoredCatalog from "../../docs/dual-tailored/assets/catalog.json";
import completeCatalog from "../../docs/dual-looks-cloth/assets/catalog.json";
import polishedCatalog from "../../docs/paired-polish/assets/catalog.json";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import { wardrobeAssetUrl } from "./catalog-assets";
import {
  addWardrobeAppearanceBank,
  createWardrobeProject,
  getWardrobeAppearanceSelection,
  selectWardrobeAppearance,
  selectWardrobeGarment,
} from "./project";
import {
  createDualViewWardrobe,
  DUAL_VIEWS,
  type DualView,
  type DualViewCharacter,
  type DualViewSelection,
  type DualViewWardrobe,
} from "./dual-view";
import type { WardrobeProject } from "./contract";

type ClothingSlot = "top" | "bottom";
interface RepresentationItem {
  id: string;
  logicalId: string;
  slot: ClothingSlot;
  palette: string;
  name: string;
  url: string;
  sha256: string;
  bytes: number;
}
interface Representation {
  character: DualViewCharacter;
  view: DualView;
  sourceUrl: string;
  registrationUrl: string;
  sourceSha256: string;
  registrationSha256: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  items: RepresentationItem[];
}
export interface DualOutfit {
  id: "cotton-day" | "tailored-day" | "complete-day" | "polished-day";
  name: string;
  topId: string;
  bottomId: string;
  tops: Array<{ id: string; name: string }>;
  bottoms: Array<{ id: string; name: string }>;
}

/** Keep the original public IDs and defaults stable for V1 paired projects. */
export const DUAL_OUTFIT = {
  id: "cotton-day",
  name: "轻便日常",
  topId: "cotton-tank",
  bottomId: "cotton-shorts",
} as const;
export const DUAL_PALETTES = [
  { id: "sea", name: "海盐蓝 · 沙色" },
  { id: "apricot", name: "暖杏色 · 蓝灰" },
] as const;

const bundled = import.meta.glob<string>(
  [
    "../../docs/dual-view-wardrobe/assets/*.zip",
    "../../docs/dual-tailored/assets/**/*.zip",
    "../../docs/dual-tailored/assets/**/*.registration.json",
    "../../docs/dual-looks-cloth/assets/**/*.zip",
    "../../docs/paired-polish/assets/**/*.zip",
    "../../artwork/paired-polish/*.registration.json",
    "../../docs/kling-side-workspace/assets/*.source.zip",
    "../../docs/kling-side-workspace/assets/*.registration.json",
    "../../artwork/kling-side-expansion/templates/*.registration.json",
  ],
  { query: "?url&no-inline", import: "default", eager: true },
);
const urls = new Map(
  Object.entries(bundled).map(([path, url]) => [
    path.replace(/^\.\.\/\.\.\//, "/"),
    url,
  ]),
);
function assetUrl(path: string) {
  return import.meta.env.DEV
    ? path
    : (urls.get(path) ?? wardrobeAssetUrl(path));
}

export function dualViewOutfit(
  character: DualViewCharacter,
  id = DUAL_OUTFIT.id as string,
): DualOutfit {
  const cottonTops = [{ id: DUAL_OUTFIT.topId, name: "棉质背心" }];
  const cottonBottoms = [{ id: DUAL_OUTFIT.bottomId, name: "棉质短裤" }];
  if (id === DUAL_OUTFIT.id)
    return { ...DUAL_OUTFIT, tops: cottonTops, bottoms: cottonBottoms };
  if (id !== "tailored-day" && id !== "complete-day" && id !== "polished-day")
    throw Error("这套服装尚未提供经过检查的双视角版本。");
  const male = character === "male";
  const top = {
    id: male ? "daily-shirt" : "daily-blouse",
    name: male ? "短袖翻领衬衫" : "短袖上衣",
  };
  const bottom = {
    id: male ? "daily-trousers" : "daily-skirt",
    name: male ? "休闲长裤" : "短裙",
  };
  return {
    id,
    name:
      id === "polished-day"
        ? "日常造型 · 接缝修订"
        : id === "complete-day"
          ? "短袖上衣与短裙 · 裙摆修订"
          : male
            ? "休闲衬衫与长裤"
            : "短袖上衣与短裙",
    topId: top.id,
    bottomId: bottom.id,
    tops: [
      top,
      ...cottonTops.filter((item) =>
        completeLogicalPart(character, id, "top", item.id),
      ),
    ],
    bottoms: [
      bottom,
      ...cottonBottoms.filter((item) =>
        completeLogicalPart(character, id, "bottom", item.id),
      ),
    ],
  };
}

export function dualViewRepresentation(
  character: DualViewCharacter,
  view: DualView,
  outfitId = DUAL_OUTFIT.id as string,
): Representation {
  // The old descriptor has no logicalId: adapt its labels in memory without
  // changing any original assets, metadata, bytes or registration bindings.
  const rows =
    outfitId === DUAL_OUTFIT.id
      ? catalog.representations.map((row) => ({
          ...row,
          items: row.items.map((item) => ({
            ...item,
            logicalId:
              item.slot === "top" ? DUAL_OUTFIT.topId : DUAL_OUTFIT.bottomId,
          })),
        }))
      : outfitId === "tailored-day"
        ? tailoredCatalog.representations
        : outfitId === "complete-day"
          ? completeCatalog.representations
          : outfitId === "polished-day"
            ? polishedCatalog.representations
            : [];
  const matches = (rows as Representation[]).filter(
    (row) => row.character === character && row.view === view,
  );
  if (matches.length !== 1)
    throw Error("这套服装还没有完整且明确的对应视角素材。当前搭配已保留。");
  return matches[0];
}

function assertSelection(
  character: DualViewCharacter,
  selection: DualViewSelection,
) {
  const outfit = dualViewOutfit(character, selection.outfitId);
  if (
    !DUAL_PALETTES.some((item) => item.id === selection.paletteId) ||
    (selection.topId !== null &&
      !outfit.tops.some((item) => item.id === selection.topId)) ||
    (selection.bottomId !== null &&
      !outfit.bottoms.some((item) => item.id === selection.bottomId))
  )
    throw Error(
      "这款衣服或配色尚未提供双视角版本。请使用已配对款式，或在原有换装工具中打开单视角项目。",
    );
}

function concreteItem(
  representation: Representation,
  selection: DualViewSelection,
  slot: ClothingSlot,
) {
  const logical = slot === "top" ? selection.topId : selection.bottomId;
  if (logical === null) return null;
  const candidates = representation.items.filter(
    (item) =>
      item.slot === slot &&
      item.logicalId === logical &&
      item.palette === selection.paletteId,
  );
  if (candidates.length !== 1)
    throw Error("对应视角的服装版本缺失或不明确，无法应用这套搭配。");
  return candidates[0];
}

/** Optional mix-in cuts need their own reviewed banks for both native views
 * and every offered palette. A same-named item in another collection does not
 * grant permission to move its pixels across registration boundaries. */
function completeLogicalPart(
  character: DualViewCharacter,
  outfitId: string,
  slot: ClothingSlot,
  logicalId: string,
) {
  try {
    for (const view of DUAL_VIEWS) {
      const representation = dualViewRepresentation(character, view, outfitId);
      for (const palette of DUAL_PALETTES)
        concreteItem(
          representation,
          {
            outfitId,
            paletteId: palette.id,
            topId: slot === "top" ? logicalId : null,
            bottomId: slot === "bottom" ? logicalId : null,
          },
          slot,
        );
    }
    return true;
  } catch {
    return false;
  }
}

/** A collection is offered only when both views contain every selectable part
 * in both palettes. A half-published collection never becomes an enabled look. */
export function availableDualViewOutfits(
  character: DualViewCharacter,
): DualOutfit[] {
  return [
    DUAL_OUTFIT.id,
    "tailored-day",
    "complete-day",
    "polished-day",
  ].flatMap((id) => {
    const outfit = dualViewOutfit(character, id);
    try {
      for (const view of DUAL_VIEWS) {
        const representation = dualViewRepresentation(character, view, id);
        for (const palette of DUAL_PALETTES)
          for (const slot of ["top", "bottom"] as const)
            for (const item of slot === "top" ? outfit.tops : outfit.bottoms)
              concreteItem(
                representation,
                {
                  outfitId: id,
                  paletteId: palette.id,
                  topId: slot === "top" ? item.id : null,
                  bottomId: slot === "bottom" ? item.id : null,
                },
                slot,
              );
      }
      return [outfit];
    } catch {
      return [];
    }
  });
}

function assertBinding(
  project: WardrobeProject,
  specification: Representation,
) {
  if (
    project.document.sourceSha256 !== specification.sourceSha256 ||
    project.document.registrationSha256 !== specification.registrationSha256 ||
    project.registration.frameWidth !== specification.frameWidth ||
    project.registration.frameHeight !== specification.frameHeight ||
    project.archive.manifest.frames.length !== specification.frameCount
  )
    throw Error(
      "双视角项目的原片或服装定位版本不匹配。请保留原项目并使用对应素材。",
    );
}

/** Check logical labels against actual source-bound items on import. */
export function validateDualViewLook(pair: DualViewWardrobe): void {
  assertSelection(pair.character, pair.selection);
  for (const view of DUAL_VIEWS) {
    const specification = dualViewRepresentation(
      pair.character,
      view,
      pair.selection.outfitId,
    );
    const project = pair.projects[view];
    assertBinding(project, specification);
    if (
      project.document.selection.fullBody !== null ||
      project.document.selection.shoes !== null
    )
      throw Error("双视角日常搭配保留原版鞋子，不包含连衣裙或替换鞋款。");
    for (const slot of ["top", "bottom"] as const) {
      const expected = concreteItem(specification, pair.selection, slot);
      if (project.document.selection[slot] !== (expected?.id ?? null))
        throw Error("服装名称或配色与项目中的实际素材不一致，当前搭配未更改。");
      if (expected) {
        const item = project.items.find(
          (item) => item.manifest.id === expected.id,
        );
        if (
          !item ||
          item.sha256 !== expected.sha256 ||
          item.manifest.slot !== slot
        )
          throw Error(
            "对应视角的服装素材缺失或已被修改，请打开完整的双视角项目。",
          );
      }
    }
  }
}

/** Synchronous changes require an inventory already bound to this collection.
 * Cross-collection changes use prepareDualViewLook to fetch the reviewed banks. */
export function selectDualViewLook(
  pair: DualViewWardrobe,
  selection: DualViewSelection,
): DualViewWardrobe {
  assertSelection(pair.character, selection);
  const projects = {} as Record<DualView, WardrobeProject>;
  for (const view of DUAL_VIEWS) {
    const specification = dualViewRepresentation(
      pair.character,
      view,
      selection.outfitId,
    );
    let project = pair.projects[view];
    assertBinding(project, specification);
    for (const slot of ["fullBody", "shoes", "top", "bottom"] as const)
      project = selectWardrobeGarment(project, slot, null);
    for (const slot of ["top", "bottom"] as const) {
      const item = concreteItem(specification, selection, slot);
      if (item) {
        const loaded = project.items.find(
          (value) => value.manifest.id === item.id,
        );
        if (!loaded || loaded.sha256 !== item.sha256)
          throw Error("项目缺少这件衣服的对应视角版本。两边的搭配都未更改。");
        project = selectWardrobeGarment(project, slot, item.id);
      }
    }
    projects[view] = project;
  }
  const { projects: _previous, ...settings } = pair;
  const result = createDualViewWardrobe(projects, {
    ...settings,
    selection: { ...selection },
  });
  validateDualViewLook(result);
  return result;
}

async function fetchAsset(
  path: string,
  expected: string,
  maximum: number,
  options: SourcePreparationOptions,
) {
  assertSourcePreparationActive(options);
  const response = await fetch(assetUrl(path), { signal: options.signal });
  if (!response.ok)
    throw Error(`服装素材暂时无法载入（${response.status}），请重试。`);
  if (Number(response.headers.get("content-length")) > maximum)
    throw Error("素材文件超出大小限制。");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertSourcePreparationActive(options);
  if (
    !bytes.length ||
    bytes.length > maximum ||
    (await sha256(bytes)) !== expected
  )
    throw Error("服装素材校验失败。当前搭配已保留，请重新载入完整素材。");
  assertSourcePreparationActive(options);
  return bytes;
}

async function loadProjects(
  character: DualViewCharacter,
  selection: DualViewSelection,
  options: SourcePreparationOptions,
  previous?: DualViewWardrobe,
) {
  const projects = {} as Record<DualView, WardrobeProject>;
  // Check every source before fetching any new clothing. Retaining a frame
  // position is safe only for the exact same immutable source archive.
  for (const view of DUAL_VIEWS) {
    const spec = dualViewRepresentation(character, view, selection.outfitId);
    const before = previous?.projects[view];
    if (before && before.document.sourceSha256 !== spec.sourceSha256)
      throw Error("新款的原片版本不同，无法保留当前动作。两个视角均未更改。");
    if (
      before?.appearanceBank &&
      before.document.registrationSha256 !== spec.registrationSha256
    )
      throw Error(
        "当前项目保存的发型或表情使用另一套定位，不能自动迁移到此服装组。可应用完整日常造型，或先恢复原片头部再选服装。原项目已保留。",
      );
    // Resolve every requested logical part before doing any network work.
    for (const slot of ["top", "bottom"] as const)
      concreteItem(spec, selection, slot);
  }
  for (const view of DUAL_VIEWS) {
    assertSourcePreparationActive(options);
    const spec = dualViewRepresentation(character, view, selection.outfitId);
    const before = previous?.projects[view];
    const [source, registration] = await Promise.all([
      before
        ? Promise.resolve(before.source)
        : fetchAsset(
            spec.sourceUrl,
            spec.sourceSha256,
            64 * 1024 * 1024,
            options,
          ),
      before?.document.registrationSha256 === spec.registrationSha256
        ? Promise.resolve(before.registrationBytes)
        : fetchAsset(
            spec.registrationUrl,
            spec.registrationSha256,
            1024 * 1024,
            options,
          ),
    ]);
    const garments: Uint8Array[] = [];
    for (const item of spec.items) {
      const existing = before?.items.find(
        (candidate) =>
          candidate.manifest.id === item.id && candidate.sha256 === item.sha256,
      );
      garments.push(
        existing
          ? existing.bytes
          : await fetchAsset(item.url, item.sha256, item.bytes, options),
      );
    }
    let project = await createWardrobeProject(
      source,
      registration,
      garments,
      options,
    );
    if (before?.appearanceBank) {
      project = await addWardrobeAppearanceBank(
        project,
        before.appearanceBank.bytes,
        options,
      );
      project = selectWardrobeAppearance(
        project,
        getWardrobeAppearanceSelection(before),
      );
    }
    assertBinding(project, spec);
    projects[view] = project;
  }
  return projects;
}

/** Load both native inventories without mutating the accepted pair. Old cotton
 * ZIPs remain valid; new registrations are never inferred or rebound at runtime. */
export async function prepareDualViewLook(
  pair: DualViewWardrobe,
  selection: DualViewSelection,
  options: SourcePreparationOptions = {},
): Promise<DualViewWardrobe> {
  assertSourcePreparationActive(options);
  validateDualViewLook(pair);
  assertSelection(pair.character, selection);
  if (selection.outfitId === pair.selection.outfitId)
    return selectDualViewLook(pair, selection);
  const projects = await loadProjects(pair.character, selection, options, pair);
  assertSourcePreparationActive(options);
  const { projects: _previous, ...settings } = pair;
  const bare = createDualViewWardrobe(projects, {
    ...settings,
    selection: { ...selection, topId: null, bottomId: null },
  });
  return selectDualViewLook(bare, selection);
}

export async function loadDualViewWardrobe(
  character: DualViewCharacter,
  options: SourcePreparationOptions = {},
  selection: DualViewSelection = {
    outfitId: DUAL_OUTFIT.id,
    paletteId: character === "male" ? "sea" : "apricot",
    topId: DUAL_OUTFIT.topId,
    bottomId: DUAL_OUTFIT.bottomId,
  },
): Promise<DualViewWardrobe> {
  if (character !== "male" && character !== "female")
    throw Error("无法识别这个人物。");
  assertSelection(character, selection);
  const projects = await loadProjects(character, selection, options);
  const bare = createDualViewWardrobe(projects, {
    character,
    selection: { ...selection, topId: null, bottomId: null },
    activeView: "original",
    previews: {
      original: { action: "idle", facing: "right", position: 0 },
      side: { action: "idle", facing: "right", position: 0 },
    },
  });
  return selectDualViewLook(bare, selection);
}
