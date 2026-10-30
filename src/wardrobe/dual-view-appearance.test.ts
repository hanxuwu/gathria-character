import { createHash } from "node:crypto";
import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
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
} from "./dual-view";
import {
  DEFAULT_DUAL_VIEW_APPEARANCE,
  clearDualViewAppearance,
  describeDualViewAppearance,
  prepareDualViewAppearance,
  type DualViewAppearanceRepresentations,
  type DualViewAppearanceSelection,
} from "./dual-view-appearance";
import {
  addWardrobeAppearanceBank,
  createWardrobeProject,
  getWardrobeAppearanceSelection,
  selectWardrobeAppearance,
  selectWardrobeGarment,
} from "./project";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const parse = (bytes: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(bytes));
const png = (width: number, height: number, rgba: number[]) =>
  encodeSourceRgbaPng({
    width,
    height,
    pixels: new Uint8Array(
      Array.from({ length: width * height }, () => rgba).flat(),
    ),
    colorChunks: [],
  });
const choice: DualViewAppearanceSelection = {
  hairId: "daily-hair",
  faceId: "gentle",
  hairColor: "espresso",
};

/** Tiny actual ZIP/PNG fixtures exercise the native import path, not user art. */
async function native(view: DualView) {
  const characterId = `kling-male-${view === "original" ? "motion-v1" : "side-workspace-v1"}`;
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: `${view} appearance fixture`,
    generator: "dual-appearance-test",
    spritesheet: {
      file: "spritesheet.png",
      width: 16,
      height: 8,
      frameWidth: 8,
      frameHeight: 8,
      columns: 2,
      rows: 1,
    },
    frames: [7, 19].map((id, i) => ({
      id,
      x: i * 8,
      y: 0,
      width: 8,
      height: 8,
    })),
    animations: {
      idle: { frames: [7], fps: 12, loop: true },
      walk: { frames: [19, 7], fps: 12, loop: true },
      run: { frames: [7, 19], fps: 24, loop: true },
      jump: {
        frames: view === "side" ? [7, 19, 7, 19] : [7, 19, 7],
        fps: 24,
        loop: false,
      },
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
    provenance: "Contract test fixture, never shipped as character artwork.",
    derivation: {
      method: "Test frames",
      frames: [7, 19].map((frameId, i) => ({
        frameId,
        sourceFrame: 200 + i,
        timeSeconds: (200 + i) / 24,
      })),
    },
  };
  const source = new Uint8Array(
    await (
      await createBakedCharacterPack(
        recipe,
        manifest,
        new Blob([png(16, 8, [view === "original" ? 70 : 100, 90, 130, 255])], {
          type: "image/png",
        }),
      )
    ).arrayBuffer(),
  );
  const registration: WardrobeRegistration = {
    format: "gathria-wardrobe-registration",
    version: 1,
    sourceSha256: sha(source),
    characterId,
    frameWidth: 8,
    frameHeight: 8,
    anchor: { x: 4, y: 7 },
    frames: [7, 19].map((frameId, i) => ({
      frameId,
      sourceFrame: 200 + i,
      points: Object.fromEntries(
        WARDROBE_ANCHORS.map((name) => [
          name,
          { x: 4, y: 4, visibility: "visible" },
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
  const reg = json(registration);
  const garment = zipSync({
    "manifest.json": json({
      format: "gathria-sprite-garment",
      version: 1,
      id: `${view}-shirt`,
      name: "Native shirt fixture",
      slot: "top",
      sourceSha256: sha(source),
      registrationSha256: sha(reg),
      characterId,
      frameWidth: 8,
      frameHeight: 8,
      pages: [
        {
          file: "patches-0.png",
          maskFile: "ownership-0.png",
          width: 1,
          height: 1,
        },
      ],
      frames: [7, 19].map((frameId) => ({
        frameId,
        page: 0,
        rect: { x: 0, y: 0, width: 1, height: 1 },
        offset: { x: 4, y: 4 },
      })),
      provenance: "Test cloth.",
    }),
    "patches-0.png": png(1, 1, [120, 90, 50, 255]),
    "ownership-0.png": png(1, 1, [255, 255, 255, 255]),
  });
  const project = selectWardrobeGarment(
    await createWardrobeProject(source, reg, [garment]),
    "top",
    `${view}-shirt`,
  );
  const head = appearanceFixture(registration, sha(reg));
  head.manifest.id = `reviewed-${view}`;
  head.manifest.styles[0].id = `${view}-hair`;
  head.manifest.styles[1].id = `${view}-gentle`;
  const bytes = zipSync({
    ...head.files,
    "manifest.json": json(head.manifest),
  });
  return {
    project,
    bytes,
    representation: {
      character: "male" as const,
      view,
      sourceSha256: sha(source),
      registrationSha256: sha(reg),
      bankSha256: sha(bytes),
      hairId: `${view}-hair`,
      faceId: `${view}-gentle`,
    },
  };
}

async function fixture() {
  const original = await native("original"),
    side = await native("side");
  const pair = createDualViewWardrobe(
    { original: original.project, side: side.project },
    {
      character: "male",
      activeView: "side",
      selection: {
        outfitId: "tailored-day",
        paletteId: "sea",
        topId: "daily-shirt",
        bottomId: null,
      },
      previews: {
        original: { action: "celebrate", facing: "left", position: 1 },
        side: { action: "jump", facing: "right", position: 3 },
      },
    },
  );
  const representations: DualViewAppearanceRepresentations = {
    original: original.representation,
    side: side.representation,
  };
  const bytes = { original: original.bytes, side: side.bytes };
  const loader = vi.fn(
    async (row: (typeof representations)[DualView]) => bytes[row.view],
  );
  return { pair, representations, bytes, loader };
}

describe("reviewed dual-view appearance choices", () => {
  it("explicitly clears both embedded head banks to the exact original V1 pair without altering the accepted look", async () => {
    const f = await fixture(),
      before = await exportDualViewWardrobe(f.pair);
    expect(clearDualViewAppearance(f.pair)).toBe(f.pair);
    const dressed = await prepareDualViewAppearance(
      f.pair,
      choice,
      f.representations,
      f.loader,
    );
    const saved = await exportDualViewWardrobe(dressed);
    const cleared = clearDualViewAppearance(dressed);
    expect(await exportDualViewWardrobe(cleared)).toEqual(before);
    expect(await exportDualViewWardrobe(dressed)).toEqual(saved);
    for (const view of ["original", "side"] as const) {
      expect(cleared.projects[view].document.version).toBe(1);
      expect(cleared.projects[view].appearanceBank).toBeUndefined();
    }
  });

  it("keeps the original embedded appearance when a complete-look preparation fails after a staged clear", async () => {
    const f = await fixture();
    const accepted = await prepareDualViewAppearance(
      f.pair,
      choice,
      f.representations,
      f.loader,
    );
    const saved = await exportDualViewWardrobe(accepted);
    const staged = clearDualViewAppearance(accepted);
    const failed = vi.fn(async (row: (typeof f.representations)[DualView]) => {
      if (row.view === "side")
        throw Error("new complete-look asset unavailable");
      return f.bytes.original;
    });
    await expect(
      prepareDualViewAppearance(staged, choice, f.representations, failed),
    ).rejects.toThrow(/unavailable/);
    expect(await exportDualViewWardrobe(accepted)).toEqual(saved);
    expect(
      describeDualViewAppearance(accepted, f.representations).selection,
    ).toEqual(choice);
  });

  it("keeps bare old paired V1 projects byte-exact without loading appearance", async () => {
    const f = await fixture(),
      before = await exportDualViewWardrobe(f.pair);
    expect(describeDualViewAppearance(f.pair, f.representations)).toEqual({
      status: "original",
      selection: DEFAULT_DUAL_VIEW_APPEARANCE,
    });
    const result = await prepareDualViewAppearance(
      f.pair,
      DEFAULT_DUAL_VIEW_APPEARANCE,
      f.representations,
      f.loader,
    );
    expect(result).toBe(f.pair);
    expect(f.loader).not.toHaveBeenCalled();
    expect(await exportDualViewWardrobe(result)).toEqual(before);
    const envelope = unzipSync(before);
    expect(parse(envelope["manifest.json"]).version).toBe(1);
    for (const view of ["original", "side"] as const) {
      const native = unzipSync(envelope[`${view}.wardrobe.zip`]);
      expect(parse(native["document.json"]).version).toBe(1);
      expect(native["appearance.zip"]).toBeUndefined();
    }
  });

  it("maps one shared look to distinct native styles and round-trips all colors offline without changing clothes or source clocks", async () => {
    const f = await fixture();
    let result = await prepareDualViewAppearance(
      f.pair,
      choice,
      f.representations,
      f.loader,
    );
    expect(f.loader.mock.calls.map(([row]) => row.view)).toEqual([
      "original",
      "side",
    ]);
    for (const hairColor of ["chestnut", "espresso", "copper"] as const) {
      const current = { ...choice, hairColor };
      const offline = vi.fn(async () => {
        throw Error("offline");
      });
      result = await prepareDualViewAppearance(
        result,
        current,
        f.representations,
        offline,
      );
      expect(offline).not.toHaveBeenCalled();
      expect(describeDualViewAppearance(result, f.representations)).toEqual({
        status: "paired",
        selection: current,
      });
      const bytes = await exportDualViewWardrobe(result);
      const reopened = await importDualViewWardrobe(bytes);
      expect(await exportDualViewWardrobe(reopened)).toEqual(bytes);
      expect(
        describeDualViewAppearance(reopened, f.representations).selection,
      ).toEqual(current);
      expect(parse(unzipSync(bytes)["manifest.json"]).version).toBe(1);
      expect(reopened.previews).toEqual(f.pair.previews);
      expect(reopened.activeView).toBe(f.pair.activeView);
      expect(reopened.selection).toEqual(f.pair.selection);
      for (const view of ["original", "side"] as const) {
        const original = f.pair.projects[view],
          next = reopened.projects[view];
        expect(next.source).toEqual(original.source);
        expect(next.registrationBytes).toEqual(original.registrationBytes);
        expect(next.document.selection).toEqual(original.document.selection);
        expect(next.items[0].bytes).toEqual(original.items[0].bytes);
        expect(next.archive.manifest.animations).toEqual(
          original.archive.manifest.animations,
        );
        expect(next.appearanceBank!.bytes).toEqual(f.bytes[view]);
        expect(getWardrobeAppearanceSelection(next)).toEqual({
          hairId: `${view}-hair`,
          faceId: `${view}-gentle`,
          hairColor,
        });
      }
    }
  });

  it("keeps hair, expression and color independent including source resets", async () => {
    const f = await fixture();
    let current = await prepareDualViewAppearance(
      f.pair,
      choice,
      f.representations,
      f.loader,
    );
    for (const selection of [
      { ...choice, hairId: null },
      { ...choice, faceId: null },
      DEFAULT_DUAL_VIEW_APPEARANCE,
    ]) {
      current = await prepareDualViewAppearance(
        current,
        selection,
        f.representations,
        f.loader,
      );
      expect(
        describeDualViewAppearance(current, f.representations).selection,
      ).toEqual(selection);
      for (const view of ["original", "side"] as const)
        expect(current.projects[view].appearanceBank!.bytes).toEqual(
          f.bytes[view],
        );
    }
    expect(f.loader).toHaveBeenCalledTimes(2);
  });

  it.each(["view", "sourceSha256", "registrationSha256"] as const)(
    "rejects a mismatched side %s before loading either bank",
    async (key) => {
      const f = await fixture(),
        before = await exportDualViewWardrobe(f.pair);
      const representations = {
        ...f.representations,
        side: {
          ...f.representations.side,
          [key]: key === "view" ? ("original" as const) : "f".repeat(64),
        },
      };
      await expect(
        prepareDualViewAppearance(f.pair, choice, representations, f.loader),
      ).rejects.toThrow(/不匹配/);
      expect(f.loader).not.toHaveBeenCalled();
      expect(await exportDualViewWardrobe(f.pair)).toEqual(before);
    },
  );

  it.each([
    "missing",
    "wrong-bytes",
    "wrong-native-binding",
    "missing-style",
  ] as const)(
    "retains both accepted projects when the second bank has %s",
    async (failure) => {
      const f = await fixture(),
        before = await exportDualViewWardrobe(f.pair);
      let representations = f.representations;
      if (failure === "wrong-native-binding")
        representations = {
          ...representations,
          side: { ...representations.side, bankSha256: sha(f.bytes.original) },
        };
      if (failure === "missing-style")
        representations = {
          ...representations,
          side: { ...representations.side, faceId: "absent-face" },
        };
      const loader = vi.fn(async (row: (typeof representations)[DualView]) => {
        if (row.view === "original") return f.bytes.original;
        if (failure === "missing") throw Error("missing appearance asset");
        if (failure === "wrong-bytes" || failure === "wrong-native-binding")
          return f.bytes.original;
        return f.bytes.side;
      });
      await expect(
        prepareDualViewAppearance(f.pair, choice, representations, loader),
      ).rejects.toThrow();
      expect(loader).toHaveBeenCalledTimes(2);
      expect(await exportDualViewWardrobe(f.pair)).toEqual(before);
      expect(f.pair.projects.original.appearanceBank).toBeUndefined();
    },
  );

  it("rejects unavailable shared expressions and invalid colors before loading", async () => {
    const f = await fixture();
    await expect(
      prepareDualViewAppearance(
        f.pair,
        choice,
        {
          ...f.representations,
          side: { ...f.representations.side, faceId: null },
        },
        f.loader,
      ),
    ).rejects.toThrow(/表情/);
    await expect(
      prepareDualViewAppearance(
        f.pair,
        {
          ...choice,
          hairColor: "unknown",
        } as unknown as DualViewAppearanceSelection,
        f.representations,
        f.loader,
      ),
    ).rejects.toThrow(/发色/);
    expect(f.loader).not.toHaveBeenCalled();
  });

  it("cancels after the first prepared view without publishing either appearance", async () => {
    const f = await fixture(),
      before = await exportDualViewWardrobe(f.pair),
      controller = new AbortController();
    const loader = vi.fn(
      async (row: (typeof f.representations)[DualView], options) => {
        expect(options.signal).toBe(controller.signal);
        if (row.view === "side") controller.abort();
        return f.bytes[row.view];
      },
    );
    await expect(
      prepareDualViewAppearance(f.pair, choice, f.representations, loader, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await exportDualViewWardrobe(f.pair)).toEqual(before);
  });

  it("describes unknown embedded artwork without blocking import or silently resetting it, and replaces it only on explicit apply", async () => {
    const f = await fixture();
    const projects = { ...f.pair.projects };
    for (const view of ["original", "side"] as const) {
      const files = unzipSync(f.bytes[view]),
        manifest = parse(files["manifest.json"]);
      manifest.id = `custom-${view}`;
      manifest.name = "Saved local artwork";
      const bytes = zipSync({ ...files, "manifest.json": json(manifest) });
      projects[view] = selectWardrobeAppearance(
        await addWardrobeAppearanceBank(projects[view], bytes),
        { hairId: `${view}-hair`, hairColor: "copper" },
      );
    }
    const { projects: _, ...settings } = f.pair;
    const custom = createDualViewWardrobe(projects, settings),
      saved = await exportDualViewWardrobe(custom),
      reopened = await importDualViewWardrobe(saved);
    expect(
      describeDualViewAppearance(reopened, f.representations),
    ).toMatchObject({ status: "custom", selection: null });
    expect(await exportDualViewWardrobe(reopened)).toEqual(saved);
    const applied = await prepareDualViewAppearance(
      reopened,
      choice,
      f.representations,
      f.loader,
    );
    expect(
      describeDualViewAppearance(applied, f.representations).selection,
    ).toEqual(choice);
    expect(await exportDualViewWardrobe(reopened)).toEqual(saved);
    expect(f.loader).toHaveBeenCalledTimes(2);
  });

  it("retains asymmetric saved view selections instead of presenting a false shared look", async () => {
    const f = await fixture(),
      paired = await prepareDualViewAppearance(
        f.pair,
        choice,
        f.representations,
        f.loader,
      );
    const { projects, ...settings } = paired;
    const asymmetric = createDualViewWardrobe(
      {
        ...projects,
        side: selectWardrobeAppearance(projects.side, {
          faceId: null,
          hairColor: "copper",
        }),
      },
      settings,
    );
    const saved = await exportDualViewWardrobe(asymmetric),
      reopened = await importDualViewWardrobe(saved);
    expect(
      describeDualViewAppearance(reopened, f.representations),
    ).toMatchObject({ status: "custom", selection: null });
    expect(
      getWardrobeAppearanceSelection(reopened.projects.original).faceId,
    ).toBe("original-gentle");
    expect(getWardrobeAppearanceSelection(reopened.projects.side)).toEqual({
      hairId: "side-hair",
      faceId: null,
      hairColor: "copper",
    });
    expect(await exportDualViewWardrobe(reopened)).toEqual(saved);
  });
});
