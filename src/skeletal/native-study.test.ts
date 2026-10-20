import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { strToU8, unzipSync, zipSync } from "fflate";
import { readPortableCharacterPackArchive } from "../core/pack";
import { decodeSourceRgbaPng } from "../core/baked-source";
import { sha256 } from "../core/sha256";
import { createLimbMesh } from "../experiments/denim-rig/mesh";
import {
  NATIVE_PARTS,
  NATIVE_POSES,
  createNativeStudyArchive,
  createNativeStudyHoldPack,
  deformNativeLimb,
  exportNativeStudyProject,
  importNativeStudyArchive,
  makeNativePose,
  mirrorNativePixels,
  nativeSourceOver,
  nativeBodyMatrix,
  prepareNativeStudy,
  validateNativeStudyDocument,
  type NativeStudyDocument,
  type NativeStudyProject,
} from "./native-study";

const base = new URL(
  "../../artwork/kling-native-study/prepared/",
  import.meta.url,
);
const read = (name: string) =>
  new Uint8Array(readFileSync(new URL(name, base)));
let document: NativeStudyDocument;
let project: NativeStudyProject;
let archive: Uint8Array;
let prepared: ReturnType<typeof prepareNativeStudy>;
const same = (
  a: Uint8Array | Uint8ClampedArray,
  b: Uint8Array | Uint8ClampedArray,
) =>
  a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

beforeAll(async () => {
  document = validateNativeStudyDocument(
    JSON.parse(new TextDecoder().decode(read("registration.json"))),
  );
  const files = Object.fromEntries(
    ["reference.png", ...document.parts.map((p) => p.file)].map((name) => [
      name,
      read(name),
    ]),
  );
  archive = await createNativeStudyArchive(document, files);
  project = await importNativeStudyArchive(archive);
  prepared = prepareNativeStudy(project);
}, 30000);

describe("native source registration and deterministic composition", () => {
  it("reconstructs the actual native source from fifteen parts with unchanged RGBA", () => {
    expect(document.parts).toHaveLength(15);
    expect(project.reference.width).toBe(704);
    expect(project.reference.height).toBe(1056);
    expect(same(prepared.render("standing"), project.reference.pixels)).toBe(
      true,
    );
    expect(
      project.reference.pixels.some(
        (value, i) => i % 4 === 3 && value > 0 && value < 255,
      ),
    ).toBe(true);
    // Reference pixels are comparison data, never the compositing source.
    const withoutReference = {
      ...project,
      reference: {
        ...project.reference,
        pixels: new Uint8Array(project.reference.pixels.length),
      },
    };
    expect(
      same(
        prepareNativeStudy(withoutReference).render("standing"),
        project.reference.pixels,
      ),
    ).toBe(true);
  });

  it("renders all four derived poses deterministically and mirrors complete native frames", () => {
    for (const id of NATIVE_POSES) {
      const right = prepared.render(id);
      expect(right).toHaveLength(704 * 1056 * 4);
      expect(same(prepared.render(id), right)).toBe(true);
      expect(same(prepared.render(id, "left"), mirrorNativePixels(right))).toBe(
        true,
      );
      if (id !== "standing")
        expect(same(right, project.reference.pixels)).toBe(false);
      let visible = 0,
        partial = 0;
      for (let p = 3; p < right.length; p += 4) {
        if (right[p]) visible++;
        if (right[p] > 0 && right[p] < 255) partial++;
      }
      expect(visible).toBeGreaterThan(100000);
      expect(partial).toBeGreaterThan(100);
    }
  }, 30000);

  it("composites smooth alpha instead of replacing or thresholding it", () => {
    const a = new Uint8ClampedArray(704 * 1056 * 4),
      b = new Uint8Array(a.length);
    a.set([200, 80, 20, 128]);
    b.set([20, 100, 220, 128]);
    nativeSourceOver(a, b);
    expect(Array.from(a.subarray(0, 4))).toEqual([80, 93, 154, 192]);
    expect(() => nativeSourceOver(new Uint8ClampedArray(4), b)).toThrow(/704/);
  });

  it("partitions the already-deformed near arm without resampling seams or double alpha", () => {
    const whole = structuredClone(document),
      split = structuredClone(document);
    whole.drawOrder = [
      "far-arm",
      "far-leg",
      "near-leg",
      "pelvis",
      "torso",
      "near-arm",
      "head",
    ];
    split.drawOrder = [
      "far-arm",
      "far-leg",
      "near-leg",
      "pelvis",
      "torso",
      "near-upper-arm",
      "near-forearm",
      "head",
    ];
    const a = prepareNativeStudy({ ...project, document: whole }),
      b = prepareNativeStudy({ ...project, document: split });
    for (const id of NATIVE_POSES)
      expect(same(a.render(id), b.render(id))).toBe(true);
  });

  it("keeps ankle transforms parented to the same lower-leg rotation", () => {
    for (const id of NATIVE_POSES)
      for (const shoe of prepared.inspect(id).shoes) {
        const source = document.chains[shoe.chain],
          posed = document.poses.find((p) => p.id === id)!.chains[shoe.chain];
        const expectedAngle =
          Math.atan2(posed[2][1] - posed[1][1], posed[2][0] - posed[1][0]) -
          Math.atan2(source[2][1] - source[1][1], source[2][0] - source[1][0]);
        expect(Math.sin(shoe.rotation)).toBeCloseTo(
          Math.sin(expectedAngle),
          10,
        );
        expect(Math.cos(shoe.rotation)).toBeCloseTo(
          Math.cos(expectedAngle),
          10,
        );
        const m = shoe.matrix,
          a = source[2];
        expect(m[0] * a[0] + m[2] * a[1] + m[4]).toBeCloseTo(posed[2][0], 8);
        expect(m[1] * a[0] + m[3] * a[1] + m[5]).toBeCloseTo(posed[2][1], 8);
      }
  });

  it("holds proximal shoulder vertices on the body and tapers to the unchanged limb", () => {
    const source = document.chains.farArm,
      root = source[0],
      upper = source[1],
      length = Math.hypot(upper[0] - root[0], upper[1] - root[1]);
    const pose = document.poses.find((p) => p.id === "walk-contact")!,
      body = nativeBodyMatrix(pose, document.pivot);
    const mesh = createLimbMesh(
      [root[0] - 40, root[1] - 40, root[0] + 80, root[1] + 140],
      source,
      document.mesh,
    );
    const base = deformNativeLimb(mesh, pose.chains.farArm),
      corrected = deformNativeLimb(mesh, pose.chains.farArm, {
        matrix: body,
        radius: 35,
      });
    let proximal = 0,
      downstream = 0;
    mesh.rest.forEach((point, i) => {
      const along =
        ((point[0] - root[0]) * (upper[0] - root[0]) +
          (point[1] - root[1]) * (upper[1] - root[1])) /
        length;
      expect(corrected[i].every(Number.isFinite)).toBe(true);
      if (along <= 0) {
        proximal++;
        expect(corrected[i][0]).toBeCloseTo(
          body[0] * point[0] + body[2] * point[1] + body[4],
          10,
        );
        expect(corrected[i][1]).toBeCloseTo(
          body[1] * point[0] + body[3] * point[1] + body[5],
          10,
        );
      } else if (along >= 35) {
        downstream++;
        expect(corrected[i]).toEqual(base[i]);
      }
    });
    expect(proximal).toBeGreaterThan(10);
    expect(downstream).toBeGreaterThan(10);
    const changed = structuredClone(document);
    changed.mesh.shoulderBlend = 35;
    const rig = prepareNativeStudy({ ...project, document: changed });
    expect(same(rig.render("standing"), project.reference.pixels)).toBe(true);
    expect(rig.inspect("walk-contact").chains).toEqual(
      prepared.inspect("walk-contact").chains,
    );
    expect(() =>
      validateNativeStudyDocument({
        ...changed,
        mesh: { ...changed.mesh, shoulderBlend: -1 },
      }),
    ).toThrow(/shoulderBlend/);
  });
});

describe("native study validation and editable portable project", () => {
  it("rejects detached parents, changed anatomy, duplicate layers and old-size coercion", () => {
    const detached = structuredClone(document);
    detached.poses[1].chains.nearArm = [
      [0, 0],
      detached.poses[1].chains.nearArm[1],
      detached.poses[1].chains.nearArm[2],
    ];
    expect(() => validateNativeStudyDocument(detached)).toThrow(/detached/);
    const stretched = structuredClone(document);
    const points = stretched.poses[1].chains.nearArm;
    stretched.poses[1].chains.nearArm = [
      points[0],
      points[1],
      [points[2][0] + 30, points[2][1]],
    ];
    expect(() => validateNativeStudyDocument(stretched)).toThrow(/bone length/);
    const badParent = structuredClone(document);
    badParent.parts[0].parent = "root";
    expect(() => validateNativeStudyDocument(badParent)).toThrow(/parent/);
    expect(() =>
      validateNativeStudyDocument({
        ...document,
        drawOrder: [...document.drawOrder.slice(1), document.drawOrder[1]],
      }),
    ).toThrow(/seven/);
    expect(() =>
      validateNativeStudyDocument({
        ...document,
        frame: { width: 192, height: 256 },
      }),
    ).toThrow(/704/);
  });

  it("updates a pose with registered bone lengths, saves and reopens source PNG bytes", async () => {
    expect(same(await exportNativeStudyProject(project), archive)).toBe(true);
    const reordered = Object.fromEntries(
      Object.entries(project.files).reverse(),
    );
    expect(
      same(await createNativeStudyArchive(document, reordered), archive),
    ).toBe(true);
    const changed = structuredClone(document);
    changed.poses[1] = makeNativePose(
      changed,
      "walk-contact",
      "Edited contact",
      {
        body: { translation: [4, -3], rotation: 0.04 },
        angles: {
          nearArm: [0.3, -0.4],
          farArm: [-0.2, 0.35],
          nearLeg: [0.15, 0.25],
          farLeg: [-0.2, -0.3],
        },
      },
    );
    const edited = { ...project, document: changed };
    const bytes = await exportNativeStudyProject(edited),
      opened = await importNativeStudyArchive(bytes);
    expect(opened.document).toEqual(validateNativeStudyDocument(changed));
    for (const file of Object.keys(project.files))
      expect(same(opened.files[file], project.files[file])).toBe(true);
    expect(
      same(
        prepareNativeStudy(opened).render("walk-contact"),
        prepareNativeStudy(edited).render("walk-contact"),
      ),
    ).toBe(true);
  }, 30000);

  it("rejects unknown ZIP paths, corrupted checksums and changed reference identity", async () => {
    const files = unzipSync(archive);
    await expect(
      importNativeStudyArchive(
        zipSync({ ...files, "../other.png": files["reference.png"] }),
      ),
    ).rejects.toThrow(/number|path/);
    const modified = {
      ...files,
      "document.json": strToU8(
        JSON.stringify({ ...document, name: "Unverified change" }),
      ),
    };
    await expect(importNativeStudyArchive(zipSync(modified))).rejects.toThrow(
      /checksum/,
    );
    const wrong = {
      ...document,
      source: { ...document.source, referenceSha256: "0".repeat(64) },
    };
    await expect(
      createNativeStudyArchive(wrong, project.files),
    ).rejects.toThrow(/reference.png hash/);
    const missing = { ...project.files };
    delete missing[`parts/${NATIVE_PARTS[0]}.png`];
    await expect(createNativeStudyArchive(document, missing)).rejects.toThrow(
      /exactly/,
    );
  });

  it("exports four honest native V2 static holds with explicit derived provenance", async () => {
    const blob = await createNativeStudyHoldPack(project);
    const pack = readPortableCharacterPackArchive(
      new Uint8Array(await blob.arrayBuffer()),
    );
    expect(pack.manifest.schemaVersion).toBe(2);
    expect(pack.manifest.spritesheet.frameWidth).toBe(704);
    expect(pack.manifest.spritesheet.frameHeight).toBe(1056);
    expect(pack.manifest.scale.pixelArt).toBe(false);
    expect(Object.keys(pack.manifest.animations)).toEqual([
      "idle",
      "walk",
      "run",
      "celebrate",
    ]);
    for (const animation of Object.values(pack.manifest.animations)) {
      expect(animation?.frames).toHaveLength(1);
      expect(animation?.loop).toBe(false);
      expect(animation?.fps).toBe(1);
    }
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const png = decodeSourceRgbaPng(entries["spritesheet.png"], {
      width: 2816,
      height: 1056,
    });
    const first = new Uint8Array(704 * 1056 * 4);
    for (let y = 0; y < 1056; y++)
      first.set(
        png.pixels.subarray(y * 2816 * 4, (y * 2816 + 704) * 4),
        y * 704 * 4,
      );
    expect(same(first, project.reference.pixels)).toBe(true);
    expect(new TextDecoder().decode(entries["PROVENANCE.txt"])).toContain(
      "not completed animation cycles",
    );
    expect(await sha256(project.files["reference.png"])).toBe(
      document.source.referenceSha256,
    );
  }, 30000);
});
