import catalog from "../../docs/dual-view-wardrobe/assets/catalog.json";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import { wardrobeAssetUrl } from "./catalog-assets";
import { createWardrobeProject, selectWardrobeGarment } from "./project";
import {
  createDualViewWardrobe,
  DUAL_VIEWS,
  type DualView,
  type DualViewCharacter,
  type DualViewSelection,
  type DualViewWardrobe,
} from "./dual-view";
import type { WardrobeProject } from "./contract";

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
  items: Array<{
    id: string;
    slot: "top" | "bottom";
    palette: string;
    name: string;
    url: string;
    sha256: string;
    bytes: number;
  }>;
}

/** Logical clothing IDs have independently painted/registered representations.
 * Only this reviewed collection is paired; arbitrary imported garments do not
 * acquire another view merely because their names or colors resemble it. */
export const DUAL_OUTFIT = {
  id: "cotton-day",
  name: "轻便日常",
  topId: "cotton-tank",
  bottomId: "cotton-shorts",
} as const;
export const DUAL_PALETTES = [
  { id: "sea", name: "海盐蓝 · 沙色短裤" },
  { id: "apricot", name: "暖杏色 · 蓝灰短裤" },
] as const;

const bundled = import.meta.glob<string>(
  [
    "../../docs/dual-view-wardrobe/assets/*.zip",
    "../../docs/kling-side-workspace/assets/*.source.zip",
    "../../docs/kling-side-workspace/assets/*.registration.json",
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

export function dualViewRepresentation(
  character: DualViewCharacter,
  view: DualView,
): Representation {
  const item = (catalog.representations as Representation[]).find(
    (row) => row.character === character && row.view === view,
  );
  if (!item)
    throw Error("这套服装还没有所选人物的对应视角素材。当前搭配已保留。");
  return item;
}

function assertSelection(selection: DualViewSelection) {
  if (
    selection.outfitId !== DUAL_OUTFIT.id ||
    !DUAL_PALETTES.some((item) => item.id === selection.paletteId) ||
    (selection.topId !== null && selection.topId !== DUAL_OUTFIT.topId) ||
    (selection.bottomId !== null && selection.bottomId !== DUAL_OUTFIT.bottomId)
  )
    throw Error(
      "这款衣服或配色尚未提供双视角版本。请使用已配对款式，或在原有换装工具中打开单视角项目。",
    );
}

function concreteItem(
  representation: Representation,
  selection: DualViewSelection,
  slot: "top" | "bottom",
) {
  const logical = slot === "top" ? selection.topId : selection.bottomId;
  if (logical === null) return null;
  const candidates = representation.items.filter(
    (item) => item.slot === slot && item.palette === selection.paletteId,
  );
  if (candidates.length !== 1)
    throw Error("对应视角的服装版本缺失或不明确，无法应用这套搭配。");
  return candidates[0];
}

/** Import validation checks labels against actual native clothing, rather than
 * silently relabelling an unrelated imported item as the chosen shared look. */
export function validateDualViewLook(pair: DualViewWardrobe): void {
  assertSelection(pair.selection);
  for (const view of DUAL_VIEWS) {
    const specification = dualViewRepresentation(pair.character, view);
    const project = pair.projects[view];
    if (
      project.document.sourceSha256 !== specification.sourceSha256 ||
      project.document.registrationSha256 !==
        specification.registrationSha256 ||
      project.registration.frameWidth !== specification.frameWidth ||
      project.registration.frameHeight !== specification.frameHeight
    )
      throw Error(
        "双视角项目的原片或服装定位版本不匹配。请保留原项目并使用对应素材。",
      );
    if (
      project.document.selection.fullBody !== null ||
      project.document.selection.shoes !== null
    )
      throw Error("首批双视角搭配保留原版鞋子，不包含连衣裙或替换鞋款。");
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

export function selectDualViewLook(
  pair: DualViewWardrobe,
  selection: DualViewSelection,
): DualViewWardrobe {
  assertSelection(selection);
  const projects = {} as Record<DualView, WardrobeProject>;
  for (const view of DUAL_VIEWS) {
    const specification = dualViewRepresentation(pair.character, view);
    let project = pair.projects[view];
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

export async function loadDualViewWardrobe(
  character: DualViewCharacter,
  options: SourcePreparationOptions = {},
): Promise<DualViewWardrobe> {
  if (character !== "male" && character !== "female")
    throw Error("无法识别这个人物。");
  const projects = {} as Record<DualView, WardrobeProject>;
  // Decode one native project at a time. Both must be available before the UI
  // can commit; a missing side variant never leaves a half-applied outfit.
  for (const view of DUAL_VIEWS) {
    assertSourcePreparationActive(options);
    const spec = dualViewRepresentation(character, view);
    const [source, registration] = await Promise.all([
      fetchAsset(spec.sourceUrl, spec.sourceSha256, 64 * 1024 * 1024, options),
      fetchAsset(
        spec.registrationUrl,
        spec.registrationSha256,
        1024 * 1024,
        options,
      ),
    ]);
    const garments: Uint8Array[] = [];
    for (const item of spec.items)
      garments.push(
        await fetchAsset(item.url, item.sha256, item.bytes, options),
      );
    projects[view] = await createWardrobeProject(
      source,
      registration,
      garments,
      options,
    );
  }
  const bare = createDualViewWardrobe(projects, {
    character,
    selection: {
      outfitId: DUAL_OUTFIT.id,
      paletteId: character === "male" ? "sea" : "apricot",
      topId: null,
      bottomId: null,
    },
    activeView: "original",
    previews: {
      original: { action: "idle", facing: "right", position: 0 },
      side: { action: "idle", facing: "right", position: 0 },
    },
  });
  return selectDualViewLook(bare, {
    ...bare.selection,
    topId: DUAL_OUTFIT.topId,
    bottomId: DUAL_OUTFIT.bottomId,
  });
}
