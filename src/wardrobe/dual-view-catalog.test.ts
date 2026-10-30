import { createHash } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { appearanceFixture } from "../appearance/fixture.test-support";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { createBakedCharacterPack } from "../core/pack";
import type {
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
} from "../core/types";
import { WARDROBE_ANCHORS, type WardrobeRegistration } from "./contract";
import {
  createDualViewWardrobe,
  exportDualViewWardrobe,
  importDualViewWardrobe,
  type DualView,
  type DualViewSelection,
} from "./dual-view";
import {
  addWardrobeAppearanceBank,
  getWardrobeAppearanceSelection,
  selectWardrobeAppearance,
} from "./project";
import {
  availableDualViewOutfits,
  dualViewOutfit,
  loadDualViewWardrobe,
  prepareDualViewLook,
  selectDualViewLook,
  validateDualViewLook,
} from "./dual-view-catalog";

type Item = {
  id: string;
  logicalId: string;
  slot: "top" | "bottom";
  palette: string;
  name: string;
  url: string;
  sha256: string;
  bytes: number;
};
type Representation = {
  character: "male";
  view: DualView;
  sourceUrl: string;
  registrationUrl: string;
  sourceSha256: string;
  registrationSha256: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  items: Item[];
};
const data = vi.hoisted(() => ({
  cotton: { representations: [] as Representation[] },
  tailored: { representations: [] as Representation[] },
  complete: { representations: [] as Representation[] },
}));
vi.mock("../../docs/dual-view-wardrobe/assets/catalog.json", () => ({
  default: data.cotton,
}));
vi.mock("../../docs/dual-tailored/assets/catalog.json", () => ({
  default: data.tailored,
}));
vi.mock("../../docs/dual-looks-cloth/assets/catalog.json", () => ({
  default: data.complete,
}));

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const files = new Map<string, Uint8Array>();
const requests: string[] = [];
const tailored: DualViewSelection = {
  outfitId: "tailored-day",
  paletteId: "apricot",
  topId: "daily-shirt",
  bottomId: "daily-trousers",
};
const png = (w: number, h: number, rgba: number[]) =>
  encodeSourceRgbaPng({
    width: w,
    height: h,
    pixels: new Uint8Array(Array.from({ length: w * h }, () => rgba).flat()),
    colorChunks: [],
  });

/** Small native archives exercise the actual binding/parser path; their dots
 * are test fixtures, never character art. Both collections retain one source. */
async function fixture(view: DualView, optionalCotton = false) {
  const characterId = `kling-male-${view === "original" ? "motion-v1" : "side-workspace-v1"}`;
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: `${view} fixture`,
    generator: "catalog-fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: 16,
      height: 8,
      frameWidth: 8,
      frameHeight: 8,
      columns: 2,
      rows: 1,
    },
    frames: [7, 19].map((id, n) => ({
      id,
      x: n * 8,
      y: 0,
      width: 8,
      height: 8,
    })),
    animations: {
      idle: { frames: [7], fps: 12, loop: true },
      walk: { frames: [19, 7], fps: 12, loop: true },
      run: { frames: [7, 19], fps: 24, loop: true },
      jump: { frames: [7, 19, 7], fps: 24, loop: false },
      ...(view === "original"
        ? { celebrate: { frames: [19, 7], fps: 12, loop: true } }
        : {}),
    },
    anchor: { x: 4, y: 7, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
  const recipe: BakedCharacterRecipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: manifest.name,
    characterId,
    source: {
      kind: "video-extraction",
      name: `${view}.mp4`,
      sha256: (view === "original" ? "a" : "b").repeat(64),
    },
    provenance: "Test fixture",
    derivation: {
      method: "Synthetic contract fixture",
      frames: [7, 19].map((frameId, n) => ({
        frameId,
        sourceFrame: 10 + n,
        timeSeconds: (10 + n) / 24,
      })),
    },
  };
  const source = new Uint8Array(
    await (
      await createBakedCharacterPack(
        recipe,
        manifest,
        new Blob([png(16, 8, [view === "original" ? 60 : 90, 80, 130, 255])], {
          type: "image/png",
        }),
      )
    ).arrayBuffer(),
  );
  const sourceUrl = `/test/${view}.source.zip`;
  files.set(sourceUrl, source);
  for (const collection of ["cotton", "tailored"] as const) {
    const registration: WardrobeRegistration = {
      format: "gathria-wardrobe-registration",
      version: 1,
      sourceSha256: sha(source),
      characterId,
      frameWidth: 8,
      frameHeight: 8,
      anchor: { x: 4, y: 7 },
      frames: [7, 19].map((frameId, n) => ({
        frameId,
        sourceFrame: 10 + n,
        points: Object.fromEntries(
          WARDROBE_ANCHORS.map((name) => [
            name,
            {
              x: collection === "tailored" && view === "side" ? 3 : 4,
              y: 4,
              visibility: "visible",
            },
          ]),
        ) as WardrobeRegistration["frames"][number]["points"],
        protected: [
          {
            label: "head",
            polygon: [
              { x: 0, y: 0 },
              { x: 8, y: 0 },
              { x: 8, y: 2 },
              { x: 0, y: 2 },
            ],
          },
        ],
      })),
    };
    const registrationBytes = json(registration);
    const registrationUrl = `/test/${collection}-${view}.registration.json`;
    files.set(registrationUrl, registrationBytes);
    const row: Representation = {
      character: "male",
      view,
      sourceUrl,
      registrationUrl,
      sourceSha256: sha(source),
      registrationSha256: sha(registrationBytes),
      frameWidth: 8,
      frameHeight: 8,
      frameCount: 2,
      items: [],
    };
    for (const slot of ["top", "bottom"] as const) {
      const logicals =
        slot === "top"
          ? ["cotton-tank", "daily-shirt"]
          : ["cotton-shorts", "daily-trousers"];
      for (const logicalId of logicals.slice(
        collection === "cotton" || optionalCotton ? 0 : 1,
        collection === "cotton" ? 1 : 2,
      ))
        for (const palette of ["sea", "apricot"]) {
          const id = `${collection}-${view}-${logicalId}-${palette}`;
          const g = {
            format: "gathria-sprite-garment",
            version: 1,
            id,
            name: id,
            slot,
            sourceSha256: row.sourceSha256,
            registrationSha256: row.registrationSha256,
            characterId,
            frameWidth: 8,
            frameHeight: 8,
            pages: [
              {
                file: "patches-0.png",
                maskFile: "ownership-0.png",
                width: 2,
                height: 1,
              },
            ],
            frames: [7, 19].map((frameId, n) => ({
              frameId,
              page: 0,
              rect: { x: n, y: 0, width: 1, height: 1 },
              offset: { x: 4, y: slot === "top" ? 4 : 5 },
            })),
            provenance: "Native source-specific fixture ownership",
          };
          const bytes = zipSync({
            "manifest.json": json(g),
            "patches-0.png": png(2, 1, [100, 50, 70, 255]),
            "ownership-0.png": png(2, 1, [255, 255, 255, 255]),
          });
          const url = `/test/${id}.zip`;
          files.set(url, bytes);
          row.items.push({
            id,
            logicalId,
            slot,
            palette,
            name: id,
            url,
            sha256: sha(bytes),
            bytes: bytes.length,
          });
        }
    }
    data[collection].representations.push(row);
  }
}

beforeEach(async () => {
  data.cotton.representations.length = 0;
  data.tailored.representations.length = 0;
  data.complete.representations.length = 0;
  files.clear();
  requests.length = 0;
  await fixture("original");
  await fixture("side");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      requests.push(input);
      const bytes = files.get(input);
      return bytes
        ? new Response(new Uint8Array(bytes), { status: 200 })
        : new Response(null, { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("paired collection source and inventory transitions", () => {
  it("keeps the previous tailored project byte-exact when a reviewed collection changes garment revisions", async () => {
    const before = await loadDualViewWardrobe("male", {}, tailored);
    const saved = await exportDualViewWardrobe(before);
    data.complete.representations.push(
      ...structuredClone(data.tailored.representations),
    );
    for (const row of data.complete.representations) {
      for (const item of row.items.filter((item) => item.slot === "bottom")) {
        const entries = unzipSync(files.get(item.url)!);
        const manifest = JSON.parse(
          new TextDecoder().decode(entries["manifest.json"]),
        );
        manifest.provenance += " Reviewed revision fixture.";
        entries["manifest.json"] = json(manifest);
        const bytes = zipSync(entries);
        item.url = item.url.replace("/test/", "/test/reviewed-");
        item.sha256 = sha(bytes);
        item.bytes = bytes.length;
        files.set(item.url, bytes);
      }
    }
    const complete = await prepareDualViewLook(before, {
      ...tailored,
      outfitId: "complete-day",
    });
    validateDualViewLook(complete);
    expect(complete.projects.side.items.map((item) => item.sha256)).not.toEqual(
      before.projects.side.items.map((item) => item.sha256),
    );
    expect(complete.projects.side.source).toEqual(before.projects.side.source);
    expect(() =>
      validateDualViewLook({ ...complete, selection: tailored }),
    ).toThrow();
    const reopened = await importDualViewWardrobe(saved);
    validateDualViewLook(reopened);
    expect(await exportDualViewWardrobe(before)).toEqual(saved);
    const returned = await prepareDualViewLook(complete, tailored);
    expect(await exportDualViewWardrobe(returned)).toEqual(saved);
  });
  it("keeps legacy cotton defaults and portable bytes through an unchanged selection", async () => {
    const old = await loadDualViewWardrobe("male");
    expect(old.selection).toEqual({
      outfitId: "cotton-day",
      paletteId: "sea",
      topId: "cotton-tank",
      bottomId: "cotton-shorts",
    });
    expect(old.projects.side.document.selection.top).toBe(
      "cotton-side-cotton-tank-sea",
    );
    const before = await exportDualViewWardrobe(old);
    const restored = await importDualViewWardrobe(before);
    validateDualViewLook(restored);
    const same = await prepareDualViewLook(restored, { ...restored.selection });
    expect(await exportDualViewWardrobe(same)).toEqual(before);
  });

  it("loads each new native registration and preserves exact source clocks and preview positions", async () => {
    const old = await loadDualViewWardrobe("male");
    old.activeView = "side";
    old.previews.original = {
      action: "celebrate",
      facing: "left",
      position: 1,
    };
    old.previews.side = { action: "jump", facing: "right", position: 2 };
    const oldBytes = await exportDualViewWardrobe(old);
    const next = await prepareDualViewLook(old, tailored);
    expect(next.selection).toEqual(tailored);
    expect(next.previews).toEqual(old.previews);
    expect(next.activeView).toBe("side");
    for (const view of ["original", "side"] as const) {
      expect(next.projects[view].source).toEqual(old.projects[view].source);
      expect(next.projects[view].archive.manifest.animations).toEqual(
        old.projects[view].archive.manifest.animations,
      );
      expect(next.projects[view].document.selection.top).toBe(
        `tailored-${view}-daily-shirt-apricot`,
      );
    }
    expect(next.projects.side.document.registrationSha256).not.toBe(
      old.projects.side.document.registrationSha256,
    );
    expect(next.projects.original.document.registrationSha256).toBe(
      old.projects.original.document.registrationSha256,
    );
    expect(await exportDualViewWardrobe(old)).toEqual(oldBytes);
    const returned = await prepareDualViewLook(next, old.selection);
    expect(await exportDualViewWardrobe(returned)).toEqual(oldBytes);
  });

  it("mixes a new cut with original clothing and rejects unreviewed cross-collection cotton", async () => {
    const next = await loadDualViewWardrobe("male", {}, tailored);
    const mixed = selectDualViewLook(next, {
      ...tailored,
      topId: null,
      bottomId: "daily-trousers",
    });
    validateDualViewLook(mixed);
    expect(mixed.projects.side.document.selection.top).toBeNull();
    expect(mixed.projects.side.document.selection.bottom).toBe(
      "tailored-side-daily-trousers-apricot",
    );
    const noBottom = selectDualViewLook(mixed, {
      ...tailored,
      bottomId: null,
    });
    expect(noBottom.projects.original.document.selection.bottom).toBeNull();
    expect(noBottom.projects.side.document.selection.bottom).toBeNull();
    const before = await exportDualViewWardrobe(next);
    await expect(
      prepareDualViewLook(next, { ...tailored, topId: "cotton-tank" }),
    ).rejects.toThrow(/尚未提供/);
    await expect(
      prepareDualViewLook(next, { ...tailored, bottomId: "cotton-shorts" }),
    ).rejects.toThrow(/尚未提供/);
    expect(await exportDualViewWardrobe(next)).toEqual(before);
    expect(() =>
      selectDualViewLook(next, { ...tailored, topId: "daily-blouse" }),
    ).toThrow(/尚未提供/);
    expect(dualViewOutfit("female", "tailored-day").topId).toBe("daily-blouse");
  });

  it("offers future optional cotton mixes only with complete native banks in both views and palettes", async () => {
    data.cotton.representations.length = 0;
    data.tailored.representations.length = 0;
    await fixture("original", true);
    await fixture("side", true);
    expect(
      dualViewOutfit("male", "tailored-day").tops.map((item) => item.id),
    ).toEqual(["daily-shirt", "cotton-tank"]);
    const next = await loadDualViewWardrobe("male", {}, tailored);
    const mixed = selectDualViewLook(next, {
      ...tailored,
      topId: "cotton-tank",
    });
    expect(mixed.projects.side.document.selection.top).toBe(
      "tailored-side-cotton-tank-apricot",
    );
    const side = data.tailored.representations[1];
    side.items = side.items.filter(
      (item) => !(item.logicalId === "cotton-tank" && item.palette === "sea"),
    );
    expect(
      dualViewOutfit("male", "tailored-day").tops.map((item) => item.id),
    ).toEqual(["daily-shirt"]);
    expect(availableDualViewOutfits("male").map((item) => item.id)).toEqual([
      "cotton-day",
      "tailored-day",
    ]);
    expect(() =>
      selectDualViewLook(next, { ...tailored, topId: "cotton-tank" }),
    ).toThrow(/尚未提供/);
  });

  it("hides half-published and ambiguous collections rather than offering incomplete looks", () => {
    expect(availableDualViewOutfits("male").map((x) => x.id)).toEqual([
      "cotton-day",
      "tailored-day",
    ]);
    const side = data.tailored.representations[1];
    const missing = side.items.pop()!;
    expect(availableDualViewOutfits("male").map((x) => x.id)).toEqual([
      "cotton-day",
    ]);
    side.items.push(missing, { ...missing });
    expect(availableDualViewOutfits("male").map((x) => x.id)).toEqual([
      "cotton-day",
    ]);
  });

  it("rejects logical relabeling, wrong garments and a cross-collection synchronous swap", async () => {
    const old = await loadDualViewWardrobe("male");
    expect(() => selectDualViewLook(old, tailored)).toThrow();
    const next = await prepareDualViewLook(old, tailored);
    expect(() =>
      validateDualViewLook({
        ...next,
        selection: { ...tailored, topId: null },
      }),
    ).toThrow(/实际素材/);
    const broken = structuredClone(next);
    const selected = broken.projects.side.items.find(
      (item) =>
        item.manifest.id === broken.projects.side.document.selection.top,
    )!;
    selected.sha256 = "0".repeat(64);
    expect(() => validateDualViewLook(broken)).toThrow(/已被修改/);
  });

  it("rejects another source revision before fetching or changing either view", async () => {
    const old = await loadDualViewWardrobe("male");
    requests.length = 0;
    data.tailored.representations[1].sourceSha256 = "f".repeat(64);
    const before = await exportDualViewWardrobe(old);
    await expect(prepareDualViewLook(old, tailored)).rejects.toThrow(
      /原片版本不同/,
    );
    expect(requests).toEqual([]);
    expect(await exportDualViewWardrobe(old)).toEqual(before);
  });

  it("rejects an attached appearance bank with another registration before fetching and preserves the saved pair", async () => {
    const old = await loadDualViewWardrobe("male");
    const original = old.projects.side;
    const bank = appearanceFixture(
      original.registration,
      original.document.registrationSha256,
    );
    const side = selectWardrobeAppearance(
      await addWardrobeAppearanceBank(original, bank.bytes),
      { hairId: "soft-crop", faceId: "gentle", hairColor: "copper" },
    );
    const { projects, ...settings } = old;
    const styled = createDualViewWardrobe({ ...projects, side }, settings);
    const saved = await exportDualViewWardrobe(styled);
    const reopened = await importDualViewWardrobe(saved);
    requests.length = 0;

    await expect(prepareDualViewLook(reopened, tailored)).rejects.toThrow(
      /发型或表情使用另一套定位/,
    );

    expect(requests).toEqual([]);
    expect(await exportDualViewWardrobe(reopened)).toEqual(saved);
    expect(reopened.projects.side.appearanceBank?.bytes).toEqual(bank.bytes);
    expect(getWardrobeAppearanceSelection(reopened.projects.side)).toEqual({
      hairId: "soft-crop",
      faceId: "gentle",
      hairColor: "copper",
    });
  });

  it("retains compatible appearance artwork and selection through a clothing-group change and offline reopen", async () => {
    const old = await loadDualViewWardrobe("male");
    // Original-view fixture registrations are identical across collections;
    // the side view has distinct registrations and deliberately has no bank.
    const native = old.projects.original;
    const bank = appearanceFixture(
      native.registration,
      native.document.registrationSha256,
    );
    const appearance = {
      hairId: "soft-crop",
      faceId: "gentle",
      hairColor: "espresso" as const,
    };
    const original = selectWardrobeAppearance(
      await addWardrobeAppearanceBank(native, bank.bytes),
      appearance,
    );
    const { projects, ...settings } = old;
    const styled = createDualViewWardrobe({ ...projects, original }, settings);
    const before = await exportDualViewWardrobe(styled);
    const next = await prepareDualViewLook(styled, tailored);
    expect(next.projects.original.appearanceBank?.bytes).toEqual(bank.bytes);
    expect(getWardrobeAppearanceSelection(next.projects.original)).toEqual(
      appearance,
    );
    expect(next.projects.original.document.selection.top).toBe(
      "tailored-original-daily-shirt-apricot",
    );

    const saved = await exportDualViewWardrobe(next);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(Error("Offline"))),
    );
    const restored = await importDualViewWardrobe(saved);
    validateDualViewLook(restored);
    expect(restored.projects.original.appearanceBank?.bytes).toEqual(
      bank.bytes,
    );
    expect(getWardrobeAppearanceSelection(restored.projects.original)).toEqual(
      appearance,
    );
    expect(await exportDualViewWardrobe(restored)).toEqual(saved);
    expect(await exportDualViewWardrobe(styled)).toEqual(before);
  });

  it("a missing side bank or failed digest leaves the accepted pair byte-identical", async () => {
    const old = await loadDualViewWardrobe("male");
    const before = await exportDualViewWardrobe(old);
    const target = data.tailored.representations[1].items.at(-1)!;
    const bytes = files.get(target.url)!;
    files.delete(target.url);
    await expect(prepareDualViewLook(old, tailored)).rejects.toThrow(/404/);
    expect(await exportDualViewWardrobe(old)).toEqual(before);
    files.set(target.url, new Uint8Array(bytes).fill(0));
    await expect(prepareDualViewLook(old, tailored)).rejects.toThrow(
      /校验失败/,
    );
    expect(await exportDualViewWardrobe(old)).toEqual(before);
  });

  it("cancels preparation before a new pair is returned", async () => {
    const old = await loadDualViewWardrobe("male");
    const before = await exportDualViewWardrobe(old);
    const controller = new AbortController();
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string) => {
      const response = await realFetch(input);
      if (input.includes("tailored-side")) controller.abort();
      return response;
    });
    await expect(
      prepareDualViewLook(old, tailored, { signal: controller.signal }),
    ).rejects.toThrow(/cancelled|abort/i);
    expect(await exportDualViewWardrobe(old)).toEqual(before);
  });
});
