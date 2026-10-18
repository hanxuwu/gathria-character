import { describe, expect, it } from "vitest";
import { strToU8, zipSync, zlibSync } from "fflate";
import { createAuthoringProject } from "./builtins";
import { importProject, validateProject } from "./skin-io";
import { importWardrobeItem } from "./wardrobe-item-io";
import { applyWardrobe, defaultWardrobeRecipe } from "./wardrobe";
import {
  addWardrobeItem,
  createWardrobeItemTemplate,
  decodeWardrobeItemPart,
} from "./wardrobe-items";
import type { AuthoringProject } from "./types";

function project() {
  return applyWardrobe(createAuthoringProject(), defaultWardrobeRecipe());
}
function template(group: "top" | "bottom" | "shoes" = "top") {
  return createWardrobeItemTemplate(defaultWardrobeRecipe(), group);
}
function files(): Record<string, Uint8Array> {
  const item = template();
  const metadata = {
    ...item,
    parts: item.parts.map(({ data: _data, ...part }) => part),
  };
  return {
    "item.json": strToU8(JSON.stringify(metadata)),
    ...Object.fromEntries(
      item.parts.flatMap(({ slot }) => [
        [`artwork/${slot}.png`, new Uint8Array([1, 2, 3])],
        [`masks/${slot}.png`, new Uint8Array([1, 2, 3])],
      ]),
    ),
  };
}
function archive(entries: Record<string, Uint8Array>) {
  return new Blob([zipSync(entries)]);
}
function mutateMetadata(
  entries: Record<string, Uint8Array>,
  change: (metadata: Record<string, unknown>) => void,
) {
  const metadata = JSON.parse(new TextDecoder().decode(entries["item.json"]));
  change(metadata);
  entries["item.json"] = strToU8(JSON.stringify(metadata));
  return entries;
}
function projectFiles(project: AuthoringProject, library?: unknown) {
  const { skin, wardrobeItems: _items, ...metadata } = project;
  return {
    "skin.json": strToU8(JSON.stringify(skin.metadata)),
    "project.json": strToU8(JSON.stringify(metadata)),
    ...Object.fromEntries(
      skin.metadata.slots.map((slot) => [
        `slots/${slot}.png`,
        new Uint8Array([1, 2, 3]),
      ]),
    ),
    ...(library === undefined
      ? {}
      : { "wardrobe.json": strToU8(JSON.stringify(library)) }),
  };
}
function centralEntry(bytes: Uint8Array, wanted: string) {
  const view = new DataView(bytes.buffer),
    decode = new TextDecoder();
  for (let p = 0; p < bytes.length - 46; p++) {
    if (view.getUint32(p, true) !== 0x02014b50) continue;
    const length = view.getUint16(p + 28, true);
    if (decode.decode(bytes.subarray(p + 46, p + 46 + length)) === wanted)
      return { view, p, local: view.getUint32(p + 42, true) };
  }
  throw Error("Test entry not found");
}

describe("portable wardrobe archive preflight", () => {
  it("rejects paths outside the item contract before image decoding", async () => {
    await expect(
      importWardrobeItem(
        archive({ ...files(), "../escape.png": new Uint8Array([1]) }),
      ),
    ).rejects.toThrow(/Unexpected ZIP path/);
    await expect(
      importWardrobeItem(
        archive({ ...files(), "slots/torso.png": new Uint8Array([1]) }),
      ),
    ).rejects.toThrow(/Unexpected ZIP path/);
  });

  it("requires exact artwork/mask pairs and rejects duplicate or extra declared slots", async () => {
    const missing = files();
    delete missing["masks/torso.png"];
    await expect(importWardrobeItem(archive(missing))).rejects.toThrow(
      /both artwork and mask/,
    );
    const extra = { ...files(), "artwork/garment.png": new Uint8Array([1]) };
    await expect(importWardrobeItem(archive(extra))).rejects.toThrow(
      /exactly match/,
    );
    const duplicate = mutateMetadata(files(), (metadata) => {
      const parts = metadata.parts as unknown[];
      parts.push(parts[0]);
    });
    await expect(importWardrobeItem(archive(duplicate))).rejects.toThrow(
      /duplicate slot/,
    );
  });

  it("requires both PNGs for each declared active forearm and rejects undeclared alternatives", async () => {
    const entries = mutateMetadata(files(), (metadata) => {
      const parts = metadata.parts as Record<string, unknown>[];
      metadata.version = 2;
      metadata.actionForearms = {
        run: {
          "near-forearm": "near-forearm-active",
          "far-forearm": "far-forearm-active",
        },
      };
      for (const side of ["near", "far"])
        parts.push({
          ...parts.find((part) => part.slot === `${side}-forearm`),
          slot: `${side}-forearm-active`,
        });
    });
    for (const side of ["near", "far"]) {
      entries[`artwork/${side}-forearm-active.png`] = new Uint8Array([1, 2, 3]);
      entries[`masks/${side}-forearm-active.png`] = new Uint8Array([1, 2, 3]);
    }
    delete entries["masks/far-forearm-active.png"];
    await expect(importWardrobeItem(archive(entries))).rejects.toThrow(
      /far-forearm-active requires both artwork and mask/,
    );
    await expect(
      importWardrobeItem(
        archive({
          ...files(),
          "artwork/near-forearm-active.png": new Uint8Array([1, 2, 3]),
          "masks/near-forearm-active.png": new Uint8Array([1, 2, 3]),
        }),
      ),
    ).rejects.toThrow(/exactly match/);
  });

  it("rejects embedded pixel data, malformed metadata and invalid PNG payloads", async () => {
    const embedded = mutateMetadata(files(), (metadata) => {
      (metadata.parts as Record<string, unknown>[])[0].data =
        template().parts[0].data;
    });
    await expect(importWardrobeItem(archive(embedded))).rejects.toThrow(
      /not item.json data/,
    );
    await expect(
      importWardrobeItem(archive({ ...files(), "item.json": strToU8("{") })),
    ).rejects.toThrow(/valid UTF-8 JSON/);
    await expect(importWardrobeItem(archive(files()))).rejects.toThrow(
      /intact PNG/,
    );
  });

  it("bounds archive metadata, inflated image size, CRC and actual decompressed output", async () => {
    await expect(
      importWardrobeItem(
        archive({ ...files(), "item.json": new Uint8Array(128 * 1024 + 1) }),
      ),
    ).rejects.toThrow(/uncompressed size limit/);
    await expect(
      importWardrobeItem(
        archive({
          ...files(),
          "artwork/torso.png": new Uint8Array(1024 * 1024 + 1),
        }),
      ),
    ).rejects.toThrow(/uncompressed size limit/);
    const liar = zipSync(files());
    const entry = centralEntry(liar, "item.json");
    entry.view.setUint32(entry.p + 24, 8, true);
    entry.view.setUint32(entry.local + 22, 8, true);
    await expect(importWardrobeItem(new Blob([liar]))).rejects.toThrow(
      /declared size/,
    );
    const damaged = zipSync(files());
    const corrupt = centralEntry(damaged, "item.json");
    corrupt.view.setUint32(corrupt.p + 16, 0, true);
    corrupt.view.setUint32(corrupt.local + 14, 0, true);
    await expect(importWardrobeItem(new Blob([damaged]))).rejects.toThrow(
      /checksum/,
    );
  });
});

describe("self-contained project wardrobe library", () => {
  it.each(["top", "bottom", "shoes"] as const)(
    "validates a selected custom %s against its flat exported artwork",
    (group) => {
      const original = addWardrobeItem(project(), template(group));
      const checked = validateProject(original);
      expect(checked.wardrobe).toEqual(original.wardrobe);
      expect(checked.wardrobeItems).toEqual(original.wardrobeItems);
      expect(checked.wardrobeItems).not.toBe(original.wardrobeItems);
      expect(checked.wardrobeItems![0].parts).not.toBe(
        original.wardrobeItems![0].parts,
      );
      expect(checked.skin.images.torso).toEqual(original.skin.images.torso);
    },
  );

  it("preserves independently validated unselected items after manual edits detach the recipe", () => {
    const original = addWardrobeItem(project(), template());
    const { wardrobe: _recipe, ...detached } = original;
    const checked = validateProject(detached);
    expect(checked.wardrobe).toBeUndefined();
    expect(checked.wardrobeItems).toEqual(original.wardrobeItems);
    expect(() =>
      validateProject({
        ...detached,
        wardrobeItems: [{ ...template(), rigId: "other-rig" }],
      }),
    ).toThrow(/format|rig/);
    expect(() =>
      validateProject({ ...detached, wardrobeItems: [template(), template()] }),
    ).toThrow(/Duplicate/);
  });

  it("rejects a missing library or valid but changed selected item without changing source pixels", () => {
    const original = addWardrobeItem(project(), template());
    const before = structuredClone(original.skin.images.torso);
    expect(() => validateProject({ ...original, wardrobeItems: [] })).toThrow(
      /wardrobe|top|item/i,
    );
    const changed = structuredClone(original.wardrobeItems!);
    const part = changed[0].parts[0],
      pixels = decodeWardrobeItemPart(part.data);
    const first =
      pixels.findIndex((value, index) => index % 5 === 3 && value === 255) - 3;
    pixels[first] = (pixels[first] + 37) % 256;
    part.data = Buffer.from(zlibSync(pixels)).toString("base64");
    expect(() =>
      validateProject({ ...original, wardrobeItems: changed }),
    ).toThrow(/match|recipe|wardrobe/i);
    expect(original.skin.images.torso).toEqual(before);
  });

  it("rejects duplicate on-disk library sources and unsupported library metadata before PNG decoding", async () => {
    const original = project(),
      entries = projectFiles(original);
    const metadata = JSON.parse(
      new TextDecoder().decode(entries["project.json"]),
    );
    metadata.wardrobeItems = [];
    entries["project.json"] = strToU8(JSON.stringify(metadata));
    await expect(importProject(archive(entries))).rejects.toThrow(
      /wardrobe.json, not project.json/,
    );
    await expect(
      importProject(
        archive(
          projectFiles(original, {
            format: "gathria-wardrobe-library",
            version: 2,
            items: [],
          }),
        ),
      ),
    ).rejects.toThrow(/version/);
    await expect(
      importProject(
        archive(
          projectFiles(original, {
            format: "gathria-wardrobe-library",
            version: 1,
            items: [{ ...template(), id: "builtin-overwrite" }],
          }),
        ),
      ),
    ).rejects.toThrow(/custom-/);
    const oversized = {
      ...projectFiles(original),
      "wardrobe.json": new Uint8Array(4 * 1024 * 1024 + 1),
    };
    await expect(importProject(archive(oversized))).rejects.toThrow(
      /uncompressed size limit/,
    );
  });
});
