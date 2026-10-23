import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import {
  APPEARANCE_ANCHORS,
  type AppearanceBankManifest,
} from "../../src/appearance/contract";
import { encodeSourceRgbaPng } from "../../src/core/baked-source";
import type { WardrobeRegistration } from "../../src/wardrobe/contract";
import { installWardrobeFixture } from "./wardrobe-fixture";

// Synthetic pixels test controls and file contracts, never visual quality.
export async function installAppearanceFixture(page: Page) {
  const fixtures = await installWardrobeFixture(page);
  let bankRequests = 0;
  const banks = new Map<string, Uint8Array>();
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
          width: 20,
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
    const pixels = new Uint8Array(20 * 2 * 4);
    const ownership = new Uint8Array(pixels.length);
    for (let i = 0; i < 40; i++) {
      pixels.set(
        i % 20 < 8
          ? [130, 75, 45, 255]
          : i % 20 < 16
            ? [95, 55, 30, 255]
            : [225, 170, 120, 255],
        i * 4,
      );
      ownership.set([255, 255, 255, 255], i * 4);
    }
    const makeBank = (id: string, patch: Uint8Array) =>
      zipSync(
        {
          "manifest.json": strToU8(JSON.stringify({ ...manifest, id })),
          "patches-0.png": encodeSourceRgbaPng({
            width: 20,
            height: 2,
            pixels: patch,
            colorChunks: [],
          }),
          "ownership-0.png": encodeSourceRgbaPng({
            width: 20,
            height: 2,
            pixels: ownership,
            colorChunks: [],
          }),
        },
        { mtime: new Date(2020, 0, 1) },
      );
    const previousPixels = new Uint8Array(pixels);
    for (let i = 0; i < 40; i++) {
      if (i % 20 < 16) previousPixels[i * 4] -= 30;
    }
    const current = makeBank(manifest.id, pixels);
    const previous = makeBank(
      `${fixture.key}-appearance-previous`,
      previousPixels,
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
  }
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({
      json: {
        version: 1,
        characters: Object.values(fixtures).map((fixture) => ({
          ...fixture.entry,
          appearanceBankUrl: `/fixture-appearance/${fixture.key}.zip`,
          appearanceRevision: revisions[fixture.key],
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
