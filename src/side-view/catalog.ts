import bindings from "../../docs/kling-side-workspace/assets/source-bindings.json";
import type { WardrobeProject, WardrobeSelection } from "../wardrobe/contract";
import { createWardrobeProject } from "../wardrobe/project";
import { sha256 } from "../core/sha256";

export type SideCharacterId = "male" | "female";
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

async function bytes(url: string, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw Error(`侧视素材加载失败（${response.status}），请重试。`);
  const size = Number(response.headers.get("content-length"));
  if (size > 64 * 1024 * 1024) throw Error("侧视素材超出可加载大小。");
  const data = new Uint8Array(await response.arrayBuffer());
  if (!data.length || data.length > 64 * 1024 * 1024)
    throw Error("侧视素材为空或超出可加载大小。");
  signal?.throwIfAborted();
  return data;
}

/** Every new material is bound to the exact side-view pack and registration. */
export async function loadSideProject(
  id: SideCharacterId,
  signal?: AbortSignal,
): Promise<WardrobeProject> {
  if (id !== "male" && id !== "female") throw Error("无法识别这个侧视人物。");
  const asset = files[id];
  const source = await bytes(asset.source, signal);
  if ((await sha256(source)) !== bindings[id].sha256)
    throw Error("侧视人物来源校验失败，请重新加载完整素材。");
  signal?.throwIfAborted();
  const registration = await bytes(asset.registration, signal);
  const garments: Uint8Array[] = [];
  for (const url of asset.garments) garments.push(await bytes(url, signal));
  return createWardrobeProject(source, registration, garments, { signal });
}

export function sideLookSelection(id: SideCharacterId): WardrobeSelection {
  if (id !== "male" && id !== "female") throw Error("无法识别这个侧视人物。");
  const style = id === "male" ? "seabreeze" : "apricot";
  return {
    top: `side-${id}-${style}-top-v1`,
    bottom: `side-${id}-${style}-bottom-v1`,
    shoes: `side-${id}-${style}-shoes-v1`,
    fullBody: null,
  };
}

/** Call after the existing project importer has verified embedded bytes. */
export function sideIdentityOf(project: WardrobeProject): SideCharacterId {
  for (const { id } of SIDE_CHARACTERS) {
    if (
      project.document.sourceSha256 === bindings[id].sha256 &&
      project.archive.config.characterId === `kling-${id}-side-workspace-v1`
    )
      return id;
  }
  throw Error("这个项目不属于本轮侧视人物，请在原换装工作台中打开。");
}
