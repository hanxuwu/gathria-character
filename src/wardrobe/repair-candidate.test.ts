import { expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { encodeSourceRgbaPng } from "../core/baked-source";
import { appearanceFixture } from "../appearance/fixture.test-support";
import {
  WARDROBE_ANCHORS,
  type WardrobeGarmentManifest,
  type WardrobeProject,
  type WardrobeSlot,
} from "./contract";
import {
  addWardrobeAppearanceBank,
  selectWardrobeAppearance,
  updateWardrobePreview,
} from "./project";
import {
  assertCandidateBase,
  prepareGarmentCandidate,
} from "./repair-candidate";

/** A validated editor-project shape and real decoded garment archives. Full
 * source/compositor validation belongs to the existing project and UI tests. */
function base(): WardrobeProject {
  return {
    source: new Uint8Array([1]),
    registrationBytes: new Uint8Array([2]),
    archive: {
      manifest: {
        frames: [{ id: 7 }],
        animations: {
          idle: { frames: [7], fps: 24, loop: true },
          run: { frames: [7], fps: 24, loop: true },
        },
      },
    },
    registration: {
      format: "gathria-wardrobe-registration",
      version: 1,
      sourceSha256: "a".repeat(64),
      characterId: "candidate-fixture",
      frameWidth: 8,
      frameHeight: 8,
      anchor: { x: 4, y: 7 },
      frames: [
        {
          frameId: 7,
          sourceFrame: 42,
          protected: [
            {
              label: "head",
              polygon: [
                { x: 2, y: 0 },
                { x: 6, y: 0 },
                { x: 6, y: 2 },
                { x: 2, y: 2 },
              ],
            },
          ],
          points: Object.fromEntries(
            WARDROBE_ANCHORS.map((k) => [
              k,
              { x: 4, y: 4, visibility: "visible" },
            ]),
          ),
        },
      ],
    },
    document: {
      format: "gathria-wardrobe-project",
      version: 1,
      sourceSha256: "a".repeat(64),
      registrationSha256: "b".repeat(64),
      items: [],
      selection: { top: null, bottom: null, shoes: null, fullBody: null },
      preview: { action: "idle", facing: "right" },
    },
    items: [],
  } as unknown as WardrobeProject;
}
function garment(slot: WardrobeSlot, id = `${slot}-revision`, color = 90) {
  const manifest: WardrobeGarmentManifest = {
    format: "gathria-sprite-garment",
    version: 1,
    id,
    name: id,
    slot,
    sourceSha256: "a".repeat(64),
    registrationSha256: "b".repeat(64),
    characterId: "candidate-fixture",
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
    frames: [
      {
        frameId: 7,
        page: 0,
        rect: { x: 0, y: 0, width: 1, height: 1 },
        offset: { x: 4, y: 4 },
      },
    ],
    provenance:
      "Small source-bound cloth pixels for immutable-candidate tests.",
  };
  const png = (pixels: number[]) =>
    encodeSourceRgbaPng({
      width: 1,
      height: 1,
      pixels: new Uint8Array(pixels),
      colorChunks: [],
    });
  return zipSync(
    {
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "patches-0.png": png([color, 60, 30, 255]),
      "ownership-0.png": png([255, 255, 255, 255]),
    },
    { mtime: new Date("2020-01-01T00:00:00Z") },
  );
}

it("prepares a full outfit without changing the open look, preview or embedded bytes", async () => {
  const first = base();
  const top = await prepareGarmentCandidate(first, garment("top"));
  const bottom = await prepareGarmentCandidate(top.project, garment("bottom"));
  const shoes = await prepareGarmentCandidate(bottom.project, garment("shoes"));
  const before = structuredClone(shoes.project);
  const dress = await prepareGarmentCandidate(
    shoes.project,
    garment("fullBody"),
  );
  expect(dress.project.document.selection).toEqual({
    top: null,
    bottom: null,
    shoes: "shoes-revision",
    fullBody: "fullBody-revision",
  });
  expect(dress.changedSlots).toEqual(["top", "bottom", "fullBody"]);
  expect(dress.project.document.preview).toEqual(before.document.preview);
  expect(shoes.project).toEqual(before);
  expect(first.items).toEqual([]);
  const separated = await prepareGarmentCandidate(
    dress.project,
    garment("top"),
  );
  expect(separated.changedSlots).toEqual(["top", "fullBody"]);
  expect(separated.alreadyInInventory).toBe(true);
  expect(separated.project.document.selection.fullBody).toBeNull();
});

it("distinguishes already selected identical artwork from a different revision with a colliding ID", async () => {
  const bytes = garment("top");
  const first = await prepareGarmentCandidate(base(), bytes);
  const same = await prepareGarmentCandidate(first.project, bytes);
  expect(same.status).toBe("already-selected");
  expect(same.changedSlots).toEqual([]);
  expect(same.project.items).toHaveLength(1);
  expect(same.baseBinding).toEqual(same.candidateBinding);
  await expect(
    prepareGarmentCandidate(first.project, garment("top", "top-revision", 91)),
  ).rejects.toThrow("different artwork");
  expect(first.project.items[0].bytes).toEqual(bytes);
});

it("allows preview movement but refuses stale style, source and unused-inventory acceptance", async () => {
  const original = base(),
    candidate = await prepareGarmentCandidate(original, garment("top"));
  await expect(
    assertCandidateBase(
      candidate,
      updateWardrobePreview(original, { action: "run", facing: "left" }),
    ),
  ).resolves.toBeUndefined();
  await expect(
    assertCandidateBase(candidate, candidate.project),
  ).rejects.toThrow("changed");
  const newInventory = {
    ...original,
    items: candidate.project.items,
    document: { ...original.document, items: candidate.project.document.items },
  };
  await expect(assertCandidateBase(candidate, newInventory)).rejects.toThrow(
    "inventory changed",
  );
  const otherSource = {
    ...original,
    document: { ...original.document, sourceSha256: "c".repeat(64) },
  };
  await expect(assertCandidateBase(candidate, otherSource)).rejects.toThrow(
    "changed",
  );
});

it("cancels before and during archive preparation and rejects invalid bytes atomically", async () => {
  const p = base(),
    snapshot = structuredClone(p),
    controller = new AbortController();
  controller.abort();
  await expect(
    prepareGarmentCandidate(p, garment("top"), { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  const inFlight = new AbortController();
  const pending = prepareGarmentCandidate(p, garment("top"), {
    signal: inFlight.signal,
  });
  inFlight.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    prepareGarmentCandidate(p, new Uint8Array([1, 2, 3])),
  ).rejects.toThrow();
  await expect(prepareGarmentCandidate(p, new Uint8Array())).rejects.toThrow(
    "64 MiB",
  );
  expect(p).toEqual(snapshot);
});

it("owns the uploaded byte buffer even while asynchronous validation is running", async () => {
  const bytes = garment("top"),
    copy = new Uint8Array(bytes);
  const pending = prepareGarmentCandidate(base(), bytes);
  bytes.fill(0);
  const candidate = await pending;
  expect(candidate.item.bytes).toEqual(copy);
});

it("keeps the exact active appearance bank and preview while trying another clothing revision", async () => {
  const p = base();
  const bank = appearanceFixture(p.registration, p.document.registrationSha256);
  const styled = updateWardrobePreview(
    selectWardrobeAppearance(await addWardrobeAppearanceBank(p, bank.bytes), {
      hairId: "soft-crop",
      hairColor: "copper",
    }),
    { action: "run", facing: "left" },
  );
  const before = structuredClone(styled.document);
  const candidate = await prepareGarmentCandidate(styled, garment("top"));
  expect(candidate.project.appearanceBank).toBe(styled.appearanceBank);
  expect(candidate.project.document.appearance).toEqual(before.appearance);
  expect(candidate.project.document.preview).toEqual(before.preview);
  expect(styled.document).toEqual(before);
  await expect(assertCandidateBase(candidate, styled)).resolves.toBeUndefined();
});
