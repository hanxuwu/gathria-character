import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import {
  APPEARANCE_ANCHORS,
  type AppearanceBankManifest,
  type AppearanceStyle,
} from "../../src/appearance/contract";
import { encodeSourceRgbaPng } from "../../src/core/baked-source";
import type { WardrobeRegistration } from "../../src/wardrobe/contract";
import { installWardrobeFixture } from "./wardrobe-fixture";

// Synthetic pixels test controls and file contracts, never visual quality.
export async function installAppearanceFixture(
  page: Page,
  options: {
    expandedStyles?: boolean;
    libraryBank?: boolean;
    joyful?: boolean;
    refinedExpressions?: boolean;
  } = {},
) {
  const fixtures = await installWardrobeFixture(page);
  let bankRequests = 0;
  const banks = new Map<string, Uint8Array>();
  const libraries: Record<string, unknown[]> = {};
  const catalogStyles: Record<
    string,
    Array<Pick<AppearanceStyle, "id" | "name" | "slot">>
  > = {};
  const variants: Record<
    string,
    {
      current: Uint8Array;
      previous: Uint8Array;
      custom: Uint8Array;
      newer: Uint8Array;
    }
  > = {};
  const revisions: Record<
    string,
    {
      characterId: string;
      sourceSha256: string;
      registrationSha256: string;
      bankId: string;
      bankSha256: string;
      previousBankSha256s: string[];
    }
  > = {};
  const sha = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  for (const fixture of Object.values(fixtures)) {
    const pageWidth = options.refinedExpressions ? 24 : 20;
    const registration: WardrobeRegistration = JSON.parse(
      new TextDecoder().decode(fixture.registrationBytes),
    );
    const manifest: AppearanceBankManifest = {
      format: "gathria-sprite-appearance-bank",
      version: 1,
      id: `${fixture.key}-appearance-fixture`,
      name: "Synthetic appearance fixture",
      characterId: registration.characterId,
      sourceSha256: registration.sourceSha256,
      registrationSha256: createHash("sha256")
        .update(fixture.registrationBytes)
        .digest("hex"),
      frameWidth: 8,
      frameHeight: 8,
      padding: { left: 2, top: 2, right: 2, bottom: 0 },
      poses: registration.frames.map((frame) => ({
        frameId: frame.frameId,
        sourceFrame: frame.sourceFrame,
        anchors: Object.fromEntries(
          APPEARANCE_ANCHORS.map((key) => [key, { x: 4, y: 1 }]),
        ) as AppearanceBankManifest["poses"][number]["anchors"],
        headBounds: { x: 0, y: 0, width: 8, height: 2 },
        facePolygon: [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 2 },
          { x: 0, y: 2 },
        ],
        hairBounds: { x: 0, y: -2, width: 8, height: 4 },
        foreground: [],
      })),
      pages: [
        {
          file: "patches-0.png",
          maskFile: "ownership-0.png",
          width: pageWidth,
          height: 2,
        },
      ],
      styles: [
        {
          id: "soft-crop",
          name: "Soft crop",
          slot: "hair",
          layers: [
            {
              role: "hair-front",
              frames: registration.frames.map(({ frameId }) => ({
                frameId,
                mode: "paint",
                page: 0,
                rect: { x: 0, y: 0, width: 8, height: 2 },
                offset: { x: 0, y: -2 },
              })),
            },
          ],
        },
        {
          id: "soft-bob",
          name: "Soft bob",
          slot: "hair",
          layers: [
            {
              role: "hair-front",
              frames: registration.frames.map(({ frameId }) => ({
                frameId,
                mode: "paint",
                page: 0,
                rect: { x: 8, y: 0, width: 8, height: 2 },
                offset: { x: 0, y: -1 },
              })),
            },
          ],
        },
        {
          id: "gentle",
          name: "Gentle",
          slot: "face",
          layers: [
            {
              role: "face",
              frames: registration.frames.map(({ frameId }) => ({
                frameId,
                mode: "paint",
                page: 0,
                rect: { x: 16, y: 0, width: 2, height: 1 },
                offset: { x: 3, y: 1 },
              })),
            },
          ],
        },
      ],
      provenance: "Synthetic browser regression fixture. Not artwork evidence.",
    };
    let legacyStyles = structuredClone(manifest.styles);
    if (options.joyful || options.refinedExpressions) {
      const joyful = structuredClone(manifest.styles[2]);
      joyful.id = "joyful";
      joyful.name = "Joyful";
      for (const frame of joyful.layers[0].frames) {
        if (frame.mode === "paint") frame.rect.x = 18;
      }
      manifest.styles.push(joyful);
    }
    if (options.refinedExpressions) {
      legacyStyles = structuredClone(manifest.styles);
      for (const [id, name, x] of [
        ["gentle-v2", "Gentle smile · clearer", 20],
        ["joyful-v2", "Joyful · softer", 22],
      ] as const) {
        const refined = structuredClone(manifest.styles[2]);
        refined.id = id;
        refined.name = name;
        for (const frame of refined.layers[0].frames) {
          if (frame.mode === "paint") frame.rect.x = x;
        }
        manifest.styles.push(refined);
      }
    }
    if (options.expandedStyles) {
      // Reuse tiny fixture pixels to exercise metadata/UI, not new artwork.
      const added = structuredClone(
        manifest.styles[fixture.key === "male" ? 0 : 1],
      );
      added.id = fixture.key === "male" ? "side-part" : "tucked-bun";
      added.name = fixture.key === "male" ? "Side part" : "Tucked bun";
      manifest.styles.push(added);
    }
    catalogStyles[fixture.key] = manifest.styles.map(({ id, name, slot }) => ({
      id,
      name,
      slot,
    }));
    const pixels = new Uint8Array(pageWidth * 2 * 4);
    const ownership = new Uint8Array(pixels.length);
    for (let i = 0; i < pageWidth * 2; i++) {
      pixels.set(
        i % pageWidth < 8
          ? [130, 75, 45, 255]
          : i % pageWidth < 16
            ? [95, 55, 30, 255]
            : [225, 170, 120, 255],
        i * 4,
      );
      ownership.set([255, 255, 255, 255], i * 4);
    }
    const makeBank = (
      id: string,
      patch: Uint8Array,
      styles = manifest.styles,
    ) => {
      const patchPixels = new Uint8Array(patch);
      if (styles.some((style) => style.id === "joyful")) {
        // Distinct synthetic face pixels, not an example of accepted artwork.
        patchPixels.set([248, 208, 72, 255, 248, 208, 72, 255], 18 * 4);
      }
      for (const [id, x, color] of [
        ["gentle-v2", 20, [215, 158, 136, 255]],
        ["joyful-v2", 22, [238, 178, 92, 255]],
      ] as const) {
        if (styles.some((style) => style.id === id)) {
          patchPixels.set([...color, ...color], x * 4);
        }
      }
      return zipSync(
        {
          "manifest.json": strToU8(JSON.stringify({ ...manifest, id, styles })),
          "patches-0.png": encodeSourceRgbaPng({
            width: pageWidth,
            height: 2,
            pixels: patchPixels,
            colorChunks: [],
          }),
          "ownership-0.png": encodeSourceRgbaPng({
            width: pageWidth,
            height: 2,
            pixels: ownership,
            colorChunks: [],
          }),
        },
        { mtime: new Date(2020, 0, 1) },
      );
    };
    const previousPixels = new Uint8Array(pixels);
    for (let i = 0; i < pageWidth * 2; i++) {
      if (i % pageWidth < 16) previousPixels[i * 4] -= 30;
    }
    const current = makeBank(manifest.id, pixels);
    const previous = makeBank(
      `${fixture.key}-appearance-previous`,
      previousPixels,
      legacyStyles,
    );
    variants[fixture.key] = {
      current,
      previous,
      custom: makeBank(`${fixture.key}-custom-appearance`, previousPixels),
      newer: makeBank(`${fixture.key}-appearance-future`, pixels),
    };
    revisions[fixture.key] = {
      characterId: registration.characterId,
      sourceSha256: registration.sourceSha256,
      registrationSha256: manifest.registrationSha256,
      bankId: manifest.id,
      bankSha256: sha(current),
      previousBankSha256s: [sha(previous)],
    };
    banks.set(`/fixture-appearance/${fixture.key}.zip`, current);
    if (options.libraryBank) {
      const hair = structuredClone(manifest.styles[0]);
      hair.id = "volume-hair";
      hair.name = "Volume hair";
      const styles = [
        hair,
        ...manifest.styles.filter((style) => style.slot === "face"),
      ];
      const id = `${fixture.key}-volume-bank`;
      const bytes = makeBank(id, previousPixels, styles);
      const url = `/fixture-appearance/${fixture.key}-volume.zip`;
      banks.set(url, bytes);
      libraries[fixture.key] = [
        {
          url,
          bankId: id,
          sha256: sha(bytes),
          styles: styles.map(({ id, name, slot }) => ({ id, name, slot })),
        },
      ];
    }
  }
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({
      json: {
        version: 1,
        characters: Object.values(fixtures).map((fixture) => ({
          ...fixture.entry,
          appearanceBankUrl: `/fixture-appearance/${fixture.key}.zip`,
          appearanceRevision: revisions[fixture.key],
          appearanceLibraries: libraries[fixture.key],
          ...(options.expandedStyles ||
          options.joyful ||
          options.refinedExpressions
            ? { appearanceStyles: catalogStyles[fixture.key] }
            : {}),
        })),
      },
    }),
  );
  await page.route("**/fixture-appearance/**", (route) => {
    bankRequests++;
    return route.fulfill({
      body: Buffer.from(banks.get(new URL(route.request().url()).pathname)!),
    });
  });
  return {
    fixtures,
    banks,
    variants,
    revisions,
    bankRequests: () => bankRequests,
  };
}
