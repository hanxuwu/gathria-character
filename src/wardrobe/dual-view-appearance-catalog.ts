import catalog from "../../docs/dual-looks/assets/catalog.json";
import { APPEARANCE_MAX_BYTES } from "../appearance/contract";
import { sha256 } from "../core/sha256";
import {
  assertSourcePreparationActive,
  type SourcePreparationOptions,
} from "../core/source-preparation";
import {
  DUAL_VIEWS,
  type DualView,
  type DualViewCharacter,
  type DualViewWardrobe,
} from "./dual-view";
import type { DualViewAppearanceRepresentation } from "./dual-view-appearance";

interface CatalogAppearance extends DualViewAppearanceRepresentation {
  url: string;
  bankId: string;
  bytes: number;
}

const bundled = import.meta.glob<string>(
  "../../docs/dual-looks/assets/**/*.zip",
  { query: "?url&no-inline", import: "default", eager: true },
);
const urls = new Map(
  Object.entries(bundled).map(([path, url]) => [
    path.replace("../..", ""),
    url,
  ]),
);

/** Only an exact native source/registration pair receives these head choices.
 * Loading an older or custom project never relabels its embedded artwork. */
export function pairedAppearanceCatalog(character: DualViewCharacter) {
  const result = {} as Record<DualView, CatalogAppearance>;
  for (const view of DUAL_VIEWS) {
    const matches = (catalog.representations as CatalogAppearance[]).filter(
      (item) => item.character === character && item.view === view,
    );
    if (matches.length !== 1) return null;
    result[view] = matches[0];
  }
  return result;
}

export function compatiblePairedAppearance(pair: DualViewWardrobe) {
  const entries = pairedAppearanceCatalog(pair.character);
  if (!entries) return null;
  for (const view of DUAL_VIEWS) {
    const project = pair.projects[view];
    if (
      entries[view].sourceSha256 !== project.document.sourceSha256 ||
      entries[view].registrationSha256 !== project.document.registrationSha256
    )
      return null;
  }
  return entries;
}

export async function loadPairedAppearanceBank(
  representation: DualViewAppearanceRepresentation,
  options: SourcePreparationOptions = {},
): Promise<Uint8Array> {
  const entry = (catalog.representations as CatalogAppearance[]).find(
    (item) =>
      item.character === representation.character &&
      item.view === representation.view &&
      item.sourceSha256 === representation.sourceSha256 &&
      item.registrationSha256 === representation.registrationSha256 &&
      item.bankSha256 === representation.bankSha256 &&
      item.hairId === representation.hairId &&
      item.faceId === representation.faceId,
  );
  if (
    !entry ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes < 1 ||
    entry.bytes > APPEARANCE_MAX_BYTES
  )
    throw Error("这套发型与表情没有可用的对应视角素材。");
  const url = urls.get(entry.url);
  if (!url) throw Error("对应的发型与表情素材尚未打包。");
  assertSourcePreparationActive(options);
  const response = await fetch(url, { signal: options.signal });
  if (!response.ok)
    throw Error(`发型与表情素材暂时无法载入（${response.status}）。`);
  if (Number(response.headers.get("content-length")) > entry.bytes) {
    await response.body?.cancel().catch(() => {});
    throw Error("外观素材文件超出登记大小。");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  if (!reader) throw Error("外观素材响应为空。");
  try {
    while (true) {
      assertSourcePreparationActive(options);
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > entry.bytes) throw Error("外观素材文件超出登记大小。");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  assertSourcePreparationActive(options);
  if (total !== entry.bytes || (await sha256(bytes)) !== entry.bankSha256)
    throw Error("发型与表情素材校验失败，两个视角均未更改。");
  assertSourcePreparationActive(options);
  return bytes;
}
