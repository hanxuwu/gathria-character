import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { createAuthoringProject, createBuiltinSkin } from "./builtins";
import {
  decodeAttachment,
  exportProject,
  importProject,
  importSkinPack,
  validateProject,
  validateSkin,
  validateSkinMetadata,
} from "./skin-io";
import { REQUIRED_SLOTS, type SkinPack } from "./types";

function skin() {
  return createBuiltinSkin("denim-daytrip");
}
function files(): Record<string, Uint8Array> {
  return {
    "skin.json": strToU8(JSON.stringify(skin().metadata)),
    ...Object.fromEntries(
      REQUIRED_SLOTS.map((slot) => [
        `slots/${slot}.png`,
        new Uint8Array([1, 2, 3]),
      ]),
    ),
  };
}
function archive(entries = files()) {
  return new Blob([zipSync(entries)]);
}
function centralEntry(bytes: Uint8Array, wanted: string) {
  const view = new DataView(bytes.buffer),
    decode = new TextDecoder();
  for (let p = 0; p < bytes.length - 46; p++) {
    if (view.getUint32(p, true) !== 0x02014b50) continue;
    const len = view.getUint16(p + 28, true);
    if (decode.decode(bytes.subarray(p + 46, p + 46 + len)) === wanted)
      return { view, p, local: view.getUint32(p + 42, true) };
  }
  throw Error("Test entry not found");
}

describe("reusable skin contract", () => {
  it.each(["denim-daytrip", "coral-afternoon"] as const)(
    "accepts actual %s source slots and detaches all authoring buffers",
    (id) => {
      const original = createBuiltinSkin(id),
        parsed = validateSkin(original);
      expect(parsed.metadata).toEqual(original.metadata);
      for (const slot of original.metadata.slots)
        expect(
          Buffer.compare(
            Buffer.from(parsed.images[slot]!),
            Buffer.from(original.images[slot]!),
          ),
        ).toBe(0);
      expect(parsed.images.torso).not.toBe(original.images.torso);
      expect(parsed.metadata.bindings.chains.nearArm).not.toBe(
        original.metadata.bindings.chains.nearArm,
      );
      parsed.images.torso![0] = 78;
      expect(original.images.torso![0]).not.toBe(78);
    },
  );

  it("accepts new skin IDs and names without a built-in registry or appearance mutation", () => {
    const original = skin().metadata;
    const imported = validateSkinMetadata({
      ...original,
      id: "my-new-traveler",
      name: "An independently authored person",
    });
    expect(imported.id).toBe("my-new-traveler");
    expect(imported.sourceAppearance.name).toBe("Denim daytrip");
  });

  it("rejects missing, duplicate, unsupported and path-shaped slots", () => {
    const metadata = skin().metadata;
    expect(() =>
      validateSkinMetadata({ ...metadata, slots: metadata.slots.slice(1) }),
    ).toThrow(/slots/);
    const duplicate = [...metadata.slots];
    duplicate[1] = duplicate[0];
    expect(() =>
      validateSkinMetadata({ ...metadata, slots: duplicate }),
    ).toThrow(/duplicate/);
    expect(() =>
      validateSkinMetadata({
        ...metadata,
        slots: ["../head.png", ...metadata.slots.slice(1)],
      }),
    ).toThrow(/Unknown skin slot/);
    expect(() =>
      validateSkinMetadata({ ...metadata, rigId: "another-rig" }),
    ).toThrow(/rigId/);
    expect(() =>
      validateSkinMetadata({ ...metadata, ignoredNewBinding: 1 }),
    ).toThrow(/unsupported fields/);
  });

  it("checks finite bounded joint, offset and deformation geometry", () => {
    const base = skin().metadata;
    const mutate = (modify: (m: typeof base) => void) => {
      const m = structuredClone(base);
      modify(m);
      return () => validateSkinMetadata(m);
    };
    expect(
      mutate((m) => {
        m.bindings.chains.nearArm = [
          [60, 60],
          [60, 60],
          [90, 90],
        ];
      }),
    ).toThrow(/segment length/);
    expect(
      mutate((m) => {
        m.bindings.chains.nearLeg = [
          [90, 160],
          [400, 190],
          [90, 230],
        ];
      }),
    ).toThrow(/finite/);
    expect(
      mutate((m) => {
        m.bindings.offsets.torso = [NaN, 0];
      }),
    ).toThrow(/finite/);
    expect(
      mutate((m) => {
        m.bindings.offsets.torso = [0, 33];
      }),
    ).toThrow(/finite/);
    expect(
      mutate((m) => {
        m.bindings.offsets.torso = [0.5, 0];
      }),
    ).toThrow(/integer/);
    expect(
      mutate((m) => {
        m.bindings.offsets.torso = [0, -0.5];
      }),
    ).toThrow(/integer/);
    expect(
      mutate((m) => {
        m.bindings.mesh.volume = Infinity;
      }),
    ).toThrow(/finite/);
    expect(
      mutate((m) => {
        m.bindings.jaw.length = 0;
      }),
    ).toThrow(/finite/);
  });

  it("rejects mismatched pixel ownership, wrong dimensions, blank art and partial alpha", () => {
    const base = skin();
    expect(() =>
      validateSkin({
        ...base,
        images: { ...base.images, torso: new Uint8ClampedArray(16) },
      }),
    ).toThrow(/192×256/);
    expect(() =>
      validateSkin({
        ...base,
        images: { ...base.images, torso: new Uint8ClampedArray(192 * 256 * 4) },
      }),
    ).toThrow(/empty/);
    const semi = new Uint8ClampedArray(base.images.torso!);
    semi[3] = 128;
    expect(() =>
      validateSkin({ ...base, images: { ...base.images, torso: semi } }),
    ).toThrow(/binary alpha/);
    const opaque = new Uint8ClampedArray(192 * 256 * 4).fill(255);
    expect(() =>
      validateSkin({ ...base, images: { ...base.images, torso: opaque } }),
    ).toThrow(/transparent background/);
    expect(() =>
      validateSkin({
        ...base,
        images: { ...base.images, "ghost-layer": semi },
      } as SkinPack),
    ).toThrow(/exactly match/);
  });
});

describe("authoring project data contract", () => {
  it("preserves fitted hierarchy, shared motion timing and preview as detached editable data", () => {
    const original = createAuthoringProject();
    const parsed = validateProject(original);
    expect(parsed.rig).toEqual(original.rig);
    expect(parsed.motions).toEqual(original.motions);
    expect(parsed.preview).toEqual(original.preview);
    expect(parsed.skin.metadata).toEqual(original.skin.metadata);
    expect(parsed.rig.bones).not.toBe(original.rig.bones);
    expect(parsed.motions.clips.run.keys).not.toBe(
      original.motions.clips.run.keys,
    );
  });

  it("rejects incompatible skeleton hierarchy, disconnected joints and duplicate render groups", () => {
    const p = createAuthoringProject();
    p.rig.bones[1].parent = "head";
    expect(() => validateProject(p)).toThrow(/parent/);
    const disconnected = createAuthoringProject();
    disconnected.rig.bones[3].to = [60, 140];
    expect(() => validateProject(disconnected)).toThrow(/same joint/);
    const duplicated = createAuthoringProject();
    duplicated.rig.drawOrder[0] = "head";
    expect(() => validateProject(duplicated)).toThrow(/drawOrder/);
    const anchor = createAuthoringProject();
    anchor.rig.anchor = [96, 220];
    expect(() => validateProject(anchor)).toThrow(/rig.anchor/);
  });

  it("rejects invalid playback indices, incompatible key counts, unbounded poses and missing preview", () => {
    const badIndex = createAuthoringProject();
    badIndex.motions.clips.run.sequence[0] = 12;
    expect(() => validateProject(badIndex)).toThrow(/sequence index/);
    const odd = createAuthoringProject();
    odd.motions.clips.run.keys.pop();
    expect(() => validateProject(odd)).toThrow(/exactly 12 keys/);
    const badPose = createAuthoringProject();
    badPose.motions.clips.run.keys[0].footLift = 99;
    expect(() => validateProject(badPose)).toThrow(/footLift/);
    expect(() =>
      validateProject({
        ...createAuthoringProject(),
        preview: { animation: "fly" },
      }),
    ).toThrow(/preview/);
  });

  it.each(["idle", "walk", "run"] as const)(
    "rejects even %s key counts that cannot be baked by format v1",
    (name) => {
      const project = createAuthoringProject();
      project.motions.clips[name].keys.splice(-2);
      project.motions.clips[name].sequence = [0, 1];
      expect(() => validateProject(project)).toThrow(/needs exactly .* keys/);
    },
  );

  it("validates before export touches the DOM or emits an archive", async () => {
    const p = createAuthoringProject();
    p.motions.clips.run.fps = 0;
    await expect(exportProject(p)).rejects.toThrow(/fps/);
  });
});

describe("skin/project archive preflight", () => {
  it("rejects unexpected paths and duplicate filenames before PNG decoding", async () => {
    await expect(
      importSkinPack(
        archive({ ...files(), "../escape.png": new Uint8Array([1]) }),
      ),
    ).rejects.toThrow(/Unexpected ZIP path/);
    const bytes = zipSync(files()),
      old = "slots/far-shoe.png",
      duplicate = "slots/far-shin.png";
    const { p, local } = centralEntry(bytes, old);
    bytes.set(strToU8(duplicate), p + 46);
    bytes.set(strToU8(duplicate), local + 30);
    await expect(importSkinPack(new Blob([bytes]))).rejects.toThrow(
      /Duplicate ZIP file/,
    );
  });

  it("limits inflated entry sizes and catches a lying compressed stream", async () => {
    const tooLarge = zipSync({
      ...files(),
      "skin.json": new Uint8Array(128 * 1024 + 1),
    });
    await expect(importSkinPack(new Blob([tooLarge]))).rejects.toThrow(
      /uncompressed size limit/,
    );
    const liar = zipSync(files()),
      { p, local, view } = centralEntry(liar, "skin.json");
    view.setUint32(p + 24, 16, true);
    view.setUint32(local + 22, 16, true);
    await expect(importSkinPack(new Blob([liar]))).rejects.toThrow(
      /declared size/,
    );
  });

  it("verifies ZIP CRC, declared slot paths and complete project metadata", async () => {
    const bytes = zipSync(files()),
      { p, local, view } = centralEntry(bytes, "skin.json");
    view.setUint32(p + 16, 0, true);
    view.setUint32(local + 14, 0, true);
    await expect(importSkinPack(new Blob([bytes]))).rejects.toThrow(/checksum/);
    const f = files();
    f["slots/back-hair.png"] = new Uint8Array([1]);
    await expect(importSkinPack(archive(f))).rejects.toThrow(/exactly match/);
    await expect(importProject(archive())).rejects.toThrow(
      /number of files|missing/,
    );
  });

  it("accepts only a paired guide+instructions template and never treats guides as a slot", async () => {
    await expect(
      importSkinPack(
        archive({ ...files(), "guides.png": new Uint8Array([1]) }),
      ),
    ).rejects.toThrow(/supplied together/);
    await expect(
      importSkinPack(
        archive({
          ...files(),
          "TEMPLATE.md": strToU8("Guide"),
          "guides.png": new Uint8Array([1]),
        }),
      ),
    ).rejects.toThrow(/intact PNG/);
  });

  it("rejects corrupt or oversized PNG headers before invoking a browser decoder", async () => {
    await expect(
      decodeAttachment(new Blob([new Uint8Array([1, 2, 3])])),
    ).rejects.toThrow(/intact PNG/);
    const forged = new Uint8Array(33),
      v = new DataView(forged.buffer);
    forged.set([137, 80, 78, 71, 13, 10, 26, 10]);
    v.setUint32(8, 13);
    v.setUint32(12, 0x49484452);
    v.setUint32(16, 9999);
    v.setUint32(20, 9999);
    await expect(decodeAttachment(new Blob([forged]))).rejects.toThrow(
      /exactly 192×256/,
    );
    v.setUint32(16, 192);
    v.setUint32(20, 256);
    await expect(decodeAttachment(new Blob([forged]))).rejects.toThrow(
      /checksum/,
    );
  });
});
