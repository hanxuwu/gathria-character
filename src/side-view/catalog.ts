import bindings from "../../docs/kling-side-workspace/assets/source-bindings.json" with { type: "json" };
import landingCatalog from "../../docs/kling-landing-production/assets/catalog.json" with { type: "json" };
import landingEditions from "./landing-candidate-editions.json" with { type: "json" };
import type { WardrobeProject, WardrobeSelection } from "../wardrobe/contract";
import {
  addWardrobeAppearanceBank,
  createWardrobeProject,
} from "../wardrobe/project";
import { fetchSideAsset, SideSourceCache } from "./source-cache";

export type SideCharacterId = "male" | "female";
export type SideCollection = "material" | "tailored" | "landing-candidate";
export type SideLookId = "original" | "daily" | "wedding";
export interface SideLookPreset {
  id: SideLookId;
  name: string;
  selection: WardrobeSelection;
}
export const SIDE_CHARACTERS: ReadonlyArray<{
  id: SideCharacterId;
  name: string;
}> = [
  { id: "male", name: "Kling 男版 · 侧视" },
  { id: "female", name: "Kling 女版 · 侧视" },
];

const files = {
  male: {
    source: new URL(
      "../../docs/kling-side-workspace/assets/male.source.zip",
      import.meta.url,
    ).href,
    registration: new URL(
      "../../docs/kling-side-workspace/assets/male.registration.json",
      import.meta.url,
    ).href,
    garments: [
      new URL(
        "../../docs/kling-side-workspace/assets/male-top.garment.zip",
        import.meta.url,
      ).href,
      new URL(
        "../../docs/kling-side-workspace/assets/male-bottom.garment.zip",
        import.meta.url,
      ).href,
      new URL(
        "../../docs/kling-side-workspace/assets/male-shoes.garment.zip",
        import.meta.url,
      ).href,
    ],
  },
  female: {
    source: new URL(
      "../../docs/kling-side-workspace/assets/female.source.zip",
      import.meta.url,
    ).href,
    registration: new URL(
      "../../docs/kling-side-workspace/assets/female.registration.json",
      import.meta.url,
    ).href,
    garments: [
      new URL(
        "../../docs/kling-side-workspace/assets/female-top.garment.zip",
        import.meta.url,
      ).href,
      new URL(
        "../../docs/kling-side-workspace/assets/female-bottom.garment.zip",
        import.meta.url,
      ).href,
      new URL(
        "../../docs/kling-side-workspace/assets/female-shoes.garment.zip",
        import.meta.url,
      ).href,
    ],
  },
} as const;

// The reviewed registration belongs to the new collection only. Existing
// material banks and saved projects keep their original registration bytes.
const tailored = {
  male: {
    registration: new URL(
      "../../artwork/kling-side-expansion/templates/male.registration.json",
      import.meta.url,
    ).href,
    garments: [
      new URL(
        "../../docs/kling-side-expansion/assets/male-shirt.garment.zip",
        import.meta.url,
      ).href,
      new URL(
        "../../docs/kling-side-expansion/assets/male-trousers.garment.zip",
        import.meta.url,
      ).href,
    ],
    appearance: new URL(
      "../../docs/kling-side-expansion/assets/male.appearance.zip",
      import.meta.url,
    ).href,
  },
  female: {
    registration: new URL(
      "../../artwork/kling-side-expansion/templates/female.registration.json",
      import.meta.url,
    ).href,
    garments: [
      new URL(
        "../../docs/kling-side-expansion/assets/female-blouse.garment.zip",
        import.meta.url,
      ).href,
      new URL(
        "../../docs/kling-side-expansion/assets/female-skirt.garment.zip",
        import.meta.url,
      ).href,
    ],
    appearance: new URL(
      "../../docs/kling-side-expansion/assets/female.appearance.zip",
      import.meta.url,
    ).href,
  },
} as const;

const LANDING_CHARACTER_ID = "kling-male-side-landing-candidate-v1";
const landing = {
  source: new URL(
    "../../docs/kling-landing-production/assets/male.source.zip",
    import.meta.url,
  ).href,
  registration: new URL(
    "../../docs/kling-landing-production/assets/male.registration.json",
    import.meta.url,
  ).href,
  garments: [
    new URL(
      "../../docs/kling-landing-production/assets/male-daily-top.garment.zip",
      import.meta.url,
    ).href,
    new URL(
      "../../docs/kling-landing-production/assets/male-daily-bottom.garment.zip",
      import.meta.url,
    ).href,
    new URL(
      "../../docs/kling-landing-production/assets/male-wedding-top.garment.zip",
      import.meta.url,
    ).href,
    new URL(
      "../../docs/kling-landing-production/assets/male-wedding-bottom.garment.zip",
      import.meta.url,
    ).href,
  ],
  appearance: new URL(
    "../../docs/kling-landing-production/assets/male.appearance.zip",
    import.meta.url,
  ).href,
} as const;

/** Saved projects embed their own source and garment bytes. Recognize only
 * frozen source/registration pairs, including previous candidate editions;
 * matching character or garment names alone never grant candidate identity. */
function isLandingCandidateProject(project: WardrobeProject): boolean {
  return (
    project.archive.config.characterId === LANDING_CHARACTER_ID &&
    project.registration.characterId === LANDING_CHARACTER_ID &&
    landingEditions.editions.some(
      (edition) =>
        edition.characterId === LANDING_CHARACTER_ID &&
        project.document.sourceSha256 === edition.sourceSha256 &&
        project.document.registrationSha256 === edition.registrationSha256 &&
        project.registration.sourceSha256 === edition.sourceSha256,
    )
  );
}

/** A fresh catalog load must use the current published pair, even though an
 * older, self-contained saved project remains valid for import. */
function isCurrentLandingCandidateProject(project: WardrobeProject): boolean {
  return (
    isLandingCandidateProject(project) &&
    landingCatalog.characterId === LANDING_CHARACTER_ID &&
    project.document.sourceSha256 === landingCatalog.sourceSha256 &&
    project.document.registrationSha256 === landingCatalog.registrationSha256
  );
}

export function sideCollectionAvailable(
  id: SideCharacterId,
  collection: SideCollection,
): boolean {
  return (
    (id === "male" || id === "female") &&
    (collection === "material" ||
      collection === "tailored" ||
      (collection === "landing-candidate" && id === "male"))
  );
}

function assertSideCollection(id: SideCharacterId, collection: SideCollection) {
  if (id !== "male" && id !== "female") throw Error("无法识别这个侧视人物。");
  if (collection === "landing-candidate" && id !== "male")
    throw Error("落地补帧候选目前仅提供男版。");
  if (!sideCollectionAvailable(id, collection))
    throw Error("无法识别这组服装。");
}

// Source packs are immutable and hash-bound. Garments and registration
// stay outside this cache so a newly published fitting edition is revalidated.
const sourceBytes = new SideSourceCache();

/** Every new material is bound to the exact side-view pack and registration. */
export async function loadSideProject(
  id: SideCharacterId,
  signal?: AbortSignal,
  collection: SideCollection = "material",
): Promise<WardrobeProject> {
  assertSideCollection(id, collection);
  signal?.throwIfAborted();
  const candidate = collection === "landing-candidate";
  const asset = candidate
    ? landing
    : collection === "tailored"
      ? tailored[id]
      : files[id];
  const appearanceUrl = candidate
    ? landing.appearance
    : collection === "tailored"
      ? tailored[id].appearance
      : undefined;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    // Fetch independent compressed assets together. Strict source, garment and
    // appearance validation below remains serial to bound decoded memory.
    const [source, registration, garments, appearance] = await Promise.all([
      sourceBytes.get(
        candidate ? landing.source : files[id].source,
        candidate ? landingCatalog.sourceSha256 : bindings[id].sha256,
        controller.signal,
      ),
      fetchSideAsset(asset.registration, controller.signal),
      Promise.all(
        asset.garments.map((url) => fetchSideAsset(url, controller.signal)),
      ),
      appearanceUrl
        ? fetchSideAsset(appearanceUrl, controller.signal)
        : undefined,
    ]);
    const project = await createWardrobeProject(
      source,
      registration,
      garments,
      {
        signal: controller.signal,
      },
    );
    if (candidate) {
      if (!isCurrentLandingCandidateProject(project))
        throw Error("落地补帧候选的原片或定位绑定不匹配。");
      const expected = Object.values(landingCatalog.garmentIds);
      if (
        project.items.length !== expected.length ||
        expected.some(
          (itemId) =>
            project.items.filter((item) => item.manifest.id === itemId)
              .length !== 1,
        )
      )
        throw Error("落地补帧候选的服装素材不完整。");
    }
    return appearance
      ? await addWardrobeAppearanceBank(project, appearance, {
          signal: controller.signal,
        })
      : project;
  } finally {
    signal?.removeEventListener("abort", cancel);
    // Failed imports abort sibling requests too. Shared source readers belonging
    // to a different call continue through their own independent signal.
    controller.abort();
  }
}

export function sideLookSelection(
  id: SideCharacterId,
  collection: SideCollection = "material",
  look: SideLookId = "daily",
): WardrobeSelection {
  assertSideCollection(id, collection);
  if (collection === "landing-candidate") {
    const selection = landingCatalog.presets[look];
    if (!selection) throw Error("无法识别这个候选搭配。");
    return { ...selection };
  }
  if (look === "original")
    return { top: null, bottom: null, shoes: null, fullBody: null };
  if (look !== "daily") throw Error("这组服装没有对应的婚礼搭配。");
  if (collection === "tailored")
    return {
      top:
        id === "male"
          ? "side-male-oxford-shirt-v1"
          : "side-female-cream-blouse-v1",
      bottom:
        id === "male"
          ? "side-male-stone-trousers-v1"
          : "side-female-rose-skirt-v1",
      shoes: null,
      fullBody: null,
    };
  const style = id === "male" ? "seabreeze" : "apricot";
  return {
    top: `side-${id}-${style}-top-v1`,
    bottom: `side-${id}-${style}-bottom-v1`,
    shoes: `side-${id}-${style}-shoes-v1`,
    fullBody: null,
  };
}

export function sideLookPresets(
  id: SideCharacterId,
  collection: SideCollection = "material",
): SideLookPreset[] {
  assertSideCollection(id, collection);
  const looks: SideLookId[] =
    collection === "landing-candidate"
      ? ["original", "daily", "wedding"]
      : ["original", "daily"];
  const names: Record<SideLookId, string> = {
    original: "原版基础造型",
    daily: "日常搭配",
    wedding: "婚礼搭配",
  };
  return looks.map((look) => ({
    id: look,
    name: names[look],
    selection: sideLookSelection(id, collection, look),
  }));
}

/** Display classification only; imports are validated by the project parser. */
export function sideProjectCollection(
  project: WardrobeProject,
): SideCollection {
  if (isLandingCandidateProject(project)) return "landing-candidate";
  return project.items.some((item) =>
    [
      "side-male-oxford-shirt-v1",
      "side-male-stone-trousers-v1",
      "side-female-cream-blouse-v1",
      "side-female-rose-skirt-v1",
    ].includes(item.manifest.id),
  )
    ? "tailored"
    : "material";
}

/** Call after the existing project importer has verified embedded bytes. */
export function sideIdentityOf(project: WardrobeProject): SideCharacterId {
  if (isLandingCandidateProject(project)) return "male";
  for (const { id } of SIDE_CHARACTERS) {
    if (
      project.document.sourceSha256 === bindings[id].sha256 &&
      project.archive.config.characterId === `kling-${id}-side-workspace-v1`
    )
      return id;
  }
  throw Error("这个项目不属于本轮侧视人物，请在原换装工作台中打开。");
}
