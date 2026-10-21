// Small synthetic files exercise editor behavior, never used as artwork evidence.
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import type { Page } from "@playwright/test";
import { encodeSourceRgbaPng } from "../../src/core/baked-source";
import { createBakedCharacterPack } from "../../src/core/pack";
import type {
  BakedCharacterRecipe,
  CharacterPackV2Manifest,
  PortableAnimationName,
} from "../../src/core/types";
import {
  WARDROBE_ANCHORS,
  type WardrobeGarmentManifest,
  type WardrobeRegistration,
  type WardrobeSlot,
} from "../../src/wardrobe/contract";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => strToU8(JSON.stringify(value));
const stamp = new Date("2020-01-01T00:00:00.000Z");

async function character(key: "male" | "female", motionFlow = false) {
  const manifest: CharacterPackV2Manifest = {
    schemaVersion: 2,
    format: "gathria-character-pack",
    name: `Fixture ${key}`,
    generator: "test-fixture",
    spritesheet: {
      file: "spritesheet.png",
      width: 16,
      height: 8,
      frameWidth: 8,
      frameHeight: 8,
      columns: 2,
      rows: 1,
    },
    frames: [
      { id: 7, x: 0, y: 0, width: 8, height: 8 },
      { id: 19, x: 8, y: 0, width: 8, height: 8 },
    ],
    animations: {
      idle: { frames: [7, 19], fps: 2, loop: true },
      walk: { frames: [19, 7], fps: 8, loop: true },
      run: { frames: [7, 19], fps: 12, loop: true },
      jump: { frames: [7, 19, 7], fps: 8, loop: false },
      celebrate: { frames: [19, 7], fps: 8, loop: true },
    },
    anchor: { x: 4, y: 7, units: "pixels", origin: "top-left" },
    facing: { native: "right", right: "none", left: "mirror-x" },
    scale: { pixelArt: false, integerOnly: false, recommended: 1 },
    capabilities: { renderMode: "baked", editableAppearance: false },
    configuration: "character.json",
  };
  const config: BakedCharacterRecipe = {
    format: "gathria-baked-character",
    schemaVersion: 1,
    name: manifest.name,
    characterId: `kling-${key}-motion-v1`,
    source: {
      kind: "video-extraction",
      name: `${key}-test.mp4`,
      sha256: (key === "male" ? "a" : "b").repeat(64),
    },
    provenance: "Synthetic browser regression fixture. Not artwork evidence.",
    derivation: {
      method: "Synthetic test data",
      frames: [
        { frameId: 7, sourceFrame: 336, timeSeconds: 14 },
        { frameId: 19, sourceFrame: 348, timeSeconds: 14.5 },
      ],
    },
  };
  if (motionFlow) {
    const names = Object.keys(manifest.animations) as PortableAnimationName[];
    config.sourceMetadata = {
      motionFlow: {
        format: "gathria-motion-flow",
        version: 1,
        characterId: key,
        actions: JSON.parse(JSON.stringify(manifest.animations)),
        routes: names.flatMap((from) =>
          names
            .filter((to) => to !== from)
            .map((to) => ({
              from,
              to,
              exit: manifest.animations[from]!.frames.length,
              entry: 0,
            })),
        ),
        returnToIdle: ["jump"],
      },
    };
  }
  const pixels = new Uint8Array(16 * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 16; x++)
      pixels.set(
        [x * 12, y * 24, key === "male" ? 110 : 170, 255],
        (y * 16 + x) * 4,
      );
  const source = new Uint8Array(
    await (
      await createBakedCharacterPack(
        config,
        manifest,
        new Blob(
          [
            encodeSourceRgbaPng({
              width: 16,
              height: 8,
              pixels,
              colorChunks: [],
            }),
          ],
          { type: "image/png" },
        ),
      )
    ).arrayBuffer(),
  );
  const registration: WardrobeRegistration = {
    format: "gathria-wardrobe-registration",
    version: 1,
    sourceSha256: sha(source),
    characterId: config.characterId,
    frameWidth: 8,
    frameHeight: 8,
    anchor: { x: 4, y: 7 },
    frames: config.derivation.frames
      .map((frame) => ({
        ...frame,
        points: Object.fromEntries(
          WARDROBE_ANCHORS.map((name) => [
            name,
            { x: 4, y: 4, visibility: "visible" },
          ]),
        ) as WardrobeRegistration["frames"][number]["points"],
        protected: [
          {
            label: "head" as const,
            polygon: [
              { x: 0, y: 0 },
              { x: 8, y: 0 },
              { x: 8, y: 2 },
              { x: 0, y: 2 },
            ],
          },
        ],
      }))
      .map(({ frameId, sourceFrame, points, protected: regions }) => ({
        frameId,
        sourceFrame,
        points,
        protected: regions,
      })),
  };
  const registrationBytes = json(registration);
  const items: Array<{
    id: string;
    name: string;
    slot: WardrobeSlot;
    url: string;
    bytes: Uint8Array;
  }> = [];
  function garment(slot: WardrobeSlot, name: string, color: number[]) {
    const id = `${key}-${slot}`;
    const metadata: WardrobeGarmentManifest = {
      format: "gathria-sprite-garment",
      version: 1,
      id,
      name,
      slot,
      sourceSha256: registration.sourceSha256,
      registrationSha256: sha(registrationBytes),
      characterId: config.characterId,
      frameWidth: 8,
      frameHeight: 8,
      pages: [
        {
          file: "patches-0.png",
          maskFile: "ownership-0.png",
          width: 8,
          height: 4,
        },
      ],
      frames: [7, 19].map((frameId, index) => ({
        frameId,
        page: 0,
        rect: { x: index * 4, y: 0, width: 4, height: 4 },
        offset: { x: 2, y: 3 },
      })),
      provenance: "Synthetic clothing patch for browser behavior checks only.",
    };
    const patch = new Uint8Array(
      Array.from({ length: 32 }, () => color).flat(),
    );
    const ownership = new Uint8Array(
      Array.from({ length: 32 }, () => [255, 255, 255, 255]).flat(),
    );
    items.push({
      id,
      name,
      slot,
      url: `/fixture-wardrobe/${id}.zip`,
      bytes: zipSync(
        {
          "manifest.json": json(metadata),
          "patches-0.png": encodeSourceRgbaPng({
            width: 8,
            height: 4,
            pixels: patch,
            colorChunks: [],
          }),
          "ownership-0.png": encodeSourceRgbaPng({
            width: 8,
            height: 4,
            pixels: ownership,
            colorChunks: [],
          }),
        },
        { mtime: stamp },
      ),
    });
  }
  garment("top", "Daily top", [18, 137, 145, 255]);
  garment("bottom", "Daily shorts", [168, 115, 63, 255]);
  garment("fullBody", "Wedding outfit", [241, 219, 182, 255]);
  garment("shoes", "Dress shoes", [55, 48, 42, 255]);
  return {
    key,
    source,
    registrationBytes,
    items,
    entry: {
      key,
      name: `Kling ${key}`,
      characterId: config.characterId,
      sourceUrl: `/fixture-wardrobe/${key}.character.zip`,
      registrationUrl: `/fixture-wardrobe/${key}.json`,
      items: items.map(({ id, name, slot, url }) => ({ id, name, slot, url })),
      presets: [
        {
          id: "daily",
          name: "Daily",
          selection: {
            top: `${key}-top`,
            bottom: `${key}-bottom`,
            fullBody: null,
            shoes: null,
          },
        },
        {
          id: "wedding",
          name: "Wedding",
          selection: {
            top: null,
            bottom: null,
            fullBody: `${key}-fullBody`,
            shoes: `${key}-shoes`,
          },
        },
      ],
    },
  };
}

export async function installWardrobeFixture(
  page: Page,
  options: { motionFlow?: boolean } = {},
) {
  const [male, female] = await Promise.all([
    character("male", options.motionFlow),
    character("female", options.motionFlow),
  ]);
  const files = new Map<string, Uint8Array>();
  for (const fixture of [male, female]) {
    files.set(fixture.entry.sourceUrl, fixture.source);
    files.set(fixture.entry.registrationUrl, fixture.registrationBytes);
    for (const item of fixture.items) files.set(item.url, item.bytes);
  }
  await page.route("**/docs/kling-wardrobe/catalog.json", (route) =>
    route.fulfill({
      json: { version: 1, characters: [male.entry, female.entry] },
    }),
  );
  await page.route("**/fixture-wardrobe/**", (route) => {
    const bytes = files.get(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: bytes ? 200 : 404,
      body: bytes ? Buffer.from(bytes) : "Not found",
    });
  });
  return { male, female };
}
