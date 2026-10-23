import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { expect, it } from "vitest";
import {
  GARMENT_CACHE_MAX_BYTES,
  GARMENT_CACHE_MAX_PAGES,
} from "./garment-pages";

type Frame = { frameId: number; page: number; mode?: string };
type Bank = {
  pages: { width: number; height: number }[];
  frames: Frame[];
  styles?: { id: string; slot: string; layers: { frames: Frame[] }[] }[];
};
const root = new URL("../../", import.meta.url);
const catalog = JSON.parse(
  readFileSync(new URL("docs/kling-wardrobe/catalog.json", root), "utf8"),
) as {
  characters: {
    key: string;
    appearanceBankUrl: string;
    appearanceLibraries?: { url: string }[];
    items: { id: string; slot: string; url: string }[];
    presets: { id: string; selection: Record<string, string | null> }[];
  }[];
};
function bank(path: string): Bank {
  // Read actual shipped manifests, without inflating hundreds of MiB of PNGs.
  const files = unzipSync(
    readFileSync(new URL(path.replace(/^\//, ""), root)),
    {
      filter: (file) => file.name === "manifest.json",
    },
  );
  return JSON.parse(new TextDecoder().decode(files["manifest.json"]));
}

it("fits each shipped outfit / separates mix with every hair and face into the bounded per-frame page cache", () => {
  let checked = 0;
  for (const entry of catalog.characters) {
    const appearances = [
      entry.appearanceBankUrl,
      ...(entry.appearanceLibraries ?? []).map((b) => b.url),
    ].map(bank);
    const garments = new Map(
      entry.items.map((item) => [item.id, bank(item.url)]),
    );
    const groups = new Map(
      [...garments].map(([id, g]) => [
        id,
        new Map(g.frames.map((f) => [f.frameId, f])),
      ]),
    );
    const outfits = entry.presets.map((p) => ({
      id: p.id,
      items: Object.values(p.selection).filter((id): id is string => !!id),
    }));
    for (const top of entry.items.filter((i) => i.slot === "top"))
      for (const bottom of entry.items.filter((i) => i.slot === "bottom"))
        outfits.push({
          id: `${top.id}+${bottom.id}`,
          items: [top.id, bottom.id],
        });
    const frameIds = [...garments.values()][0].frames.map((f) => f.frameId);
    for (const appearance of appearances) {
      const styles = appearance.styles!.map((s) => ({
        ...s,
        layers: s.layers.map(
          (layer) => new Map(layer.frames.map((f) => [f.frameId, f])),
        ),
      }));
      for (const outfit of outfits)
        for (const shoe of [
          null,
          ...entry.items.filter((i) => i.slot === "shoes").map((i) => i.id),
        ])
          for (const hair of styles.filter((s) => s.slot === "hair"))
            for (const face of [
              null,
              ...styles.filter((s) => s.slot === "face"),
            ])
              for (const fid of frameIds) {
                const pages = new Map<string, number>();
                const add = (key: string, b: Bank, f: Frame | undefined) => {
                  expect(f, `${key} missing source pose ${fid}`).toBeDefined();
                  if (f!.mode === "source") return;
                  const p = b.pages[f!.page];
                  pages.set(`${key}/${f!.page}`, p.width * p.height * 5);
                };
                for (const style of [hair, face])
                  for (const layer of style?.layers ?? [])
                    add("appearance", appearance, layer.get(fid));
                for (const id of new Set([
                  ...outfit.items,
                  ...(shoe ? [shoe] : []),
                ]))
                  add(id, garments.get(id)!, groups.get(id)!.get(fid));
                const context = `${entry.key}/${outfit.id}/${shoe}/${hair.id}/${face?.id}/${fid}`;
                expect(pages.size, context).toBeLessThanOrEqual(
                  GARMENT_CACHE_MAX_PAGES,
                );
                expect(
                  [...pages.values()].reduce((a, b) => a + b, 0),
                  context,
                ).toBeLessThanOrEqual(GARMENT_CACHE_MAX_BYTES);
                checked++;
              }
    }
  }
  expect(checked).toBeGreaterThan(1000);
}, 30_000);
