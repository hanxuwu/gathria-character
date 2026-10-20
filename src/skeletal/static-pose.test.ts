import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { prepareRig } from "./renderer";
import { assembleWardrobe } from "./wardrobe";
import { validateProject } from "./skin-io";
import {
  createRestStaticPose,
  mapStaticPosePoint,
  staticPoseBodyMatrix,
  validateStaticRigPose,
} from "./static-pose";
import type { AuthoringProject, ChainName, JointTriple, Point } from "./types";
import legacyHashes from "./static-pose-legacy-hashes.json";

function project(
  path = "artwork/base-character/prepared/base-character.rig.zip",
): AuthoringProject {
  const files = unzipSync(readFileSync(path)),
    json = (name: string) => JSON.parse(strFromU8(files[name]));
  const p = json("project.json"),
    items = json("wardrobe.json").items,
    identities = json("identities.json").identities;
  return validateProject({
    ...p,
    wardrobeItems: items,
    wardrobeIdentities: identities,
    skin: assembleWardrobe(
      p.wardrobe,
      json("skin.json").name,
      items,
      identities,
    ),
  });
}
const hash = (pixels: Uint8ClampedArray) =>
  createHash("sha256").update(pixels).digest("hex");
const rotate = (p: Point, a: number): Point => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
];
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
function bent(
  rest: JointTriple,
  upper: number,
  lower: number,
  root: Point = rest[0],
): JointTriple {
  const elbow = add(root, rotate(sub(rest[1], rest[0]), upper));
  return [
    root,
    elbow,
    add(elbow, rotate(sub(rest[2], rest[1]), upper + lower)),
  ];
}
function markerCenter(
  pixels: Uint8ClampedArray,
  color: readonly number[],
): Point {
  const points: Point[] = [];
  for (let n = 0; n < 192 * 256; n++)
    if (pixels[n * 4 + 3] && color.every((c, i) => pixels[n * 4 + i] === c))
      points.push([n % 192, Math.floor(n / 192)]);
  expect(points.length).toBeGreaterThan(0);
  return [
    points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length,
  ];
}

describe("explicit static rig review poses", () => {
  it.each([...new Set(legacyHashes.map((record) => record.file))])(
    "preserves every pre-edit legacy frame and expression: %s",
    (path) => {
      // Captured with the unchanged renderer at c074feb, before adding pose().
      const p = project(path),
        r = prepareRig(p.rig, p.skin, p.motions);
      for (const record of legacyHashes.filter(
        (record) => record.file === path,
      )) {
        const pixels = r.frame(
          record.action as "idle" | "walk" | "run" | "jump",
          record.key,
          record.expression as "neutral" | "gentle" | "joyful",
        );
        expect(
          hash(pixels),
          `${record.action}/${record.key}/${record.expression}`,
        ).toBe(record.sha256);
      }
    },
  );

  it("reassembles the native rest pose exactly and does not mutate the old clip", () => {
    const p = project(),
      r = prepareRig(p.rig, p.skin, p.motions),
      pose = createRestStaticPose(p.rig, p.skin.metadata);
    const motions = JSON.stringify(p.motions);
    expect(hash(r.pose(pose, "neutral"))).toBe(
      hash(r.frame("idle", 0, "neutral")),
    );
    const inspected = r.inspectPose(pose, "neutral");
    expect(inspected.poseShoes).toHaveLength(2);
    expect(inspected.shoes).toBeUndefined();
    expect(inspected.limbs.every((l) => l.variant === "base")).toBe(true);
    expect(JSON.stringify(p.motions)).toBe(motions);
  });

  it("supports independently raised arms, follows both hands and rotates shoes at shared ankles", () => {
    const p = project();
    for (const rgba of Object.values(p.skin.images))
      if (rgba)
        for (let n = 0; n < rgba.length; n += 4)
          if (rgba[n + 3]) rgba.set([120, 120, 120, 255], n);
    const markers = [
      {
        slot: "near-forearm" as const,
        chain: "nearArm" as ChainName,
        at: [67, 183] as Point,
        color: [230, 20, 30],
      },
      {
        slot: "far-forearm" as const,
        chain: "farArm" as ChainName,
        at: [130, 183] as Point,
        color: [30, 220, 40],
      },
      {
        slot: "near-shoe" as const,
        chain: "nearLeg" as ChainName,
        at: [89, 232] as Point,
        color: [30, 40, 230],
      },
    ];
    for (const marker of markers) {
      const rgba = p.skin.images[marker.slot]!;
      for (let y = marker.at[1] - 1; y <= marker.at[1] + 1; y++)
        for (let x = marker.at[0] - 1; x <= marker.at[0] + 1; x++)
          rgba.set([...marker.color, 255], (y * 192 + x) * 4);
    }
    const pose = createRestStaticPose(
      p.rig,
      p.skin.metadata,
      "independent-arms",
    );
    pose.chains.nearArm = bent(pose.chains.nearArm, 0.35, 0.55);
    pose.chains.farArm = bent(pose.chains.farArm, -0.6, -0.8);
    pose.chains.nearLeg = bent(pose.chains.nearLeg, -0.3, 0.9);
    const r = prepareRig(p.rig, p.skin, p.motions),
      pixels = r.pose(pose, "neutral"),
      inspection = r.inspectPose(pose, "neutral");
    for (const marker of markers) {
      const rest = p.skin.metadata.bindings.chains[marker.chain],
        posed = pose.chains[marker.chain];
      const angle =
        Math.atan2(posed[2][1] - posed[1][1], posed[2][0] - posed[1][0]) -
        Math.atan2(rest[2][1] - rest[1][1], rest[2][0] - rest[1][0]);
      const expected = add(posed[2], rotate(sub(marker.at, rest[2]), angle)),
        actual = markerCenter(pixels, marker.color);
      expect(
        Math.hypot(actual[0] - expected[0], actual[1] - expected[1]),
      ).toBeLessThan(1);
    }
    for (const shoe of inspection.poseShoes!) {
      expect(shoe.ankle).toEqual(pose.chains[shoe.chain][2]);
      expect(mapStaticPosePoint(shoe.matrix, shoe.sourceAnkle)[0]).toBeCloseTo(
        shoe.ankle[0],
        8,
      );
      expect(mapStaticPosePoint(shoe.matrix, shoe.sourceAnkle)[1]).toBeCloseTo(
        shoe.ankle[1],
        8,
      );
    }
    // A separate celebration can rotate upper arms beyond old jump control limits.
    pose.chains.nearArm = bent(
      p.skin.metadata.bindings.chains.nearArm,
      2.1,
      0.5,
    );
    pose.chains.farArm = bent(
      p.skin.metadata.bindings.chains.farArm,
      -2.1,
      -0.5,
    );
    const celebration = r.inspectPose(pose, "neutral");
    for (const arm of celebration.limbs.filter((l) => l.id.endsWith("Arm")))
      expect(arm.bones[2][1]).toBeLessThan(arm.bones[0][1]);
  });

  it("preserves a perspective-raised far sole instead of normalizing both shoes to one ground line", () => {
    const p = project(),
      original = p.skin.images["far-shoe"]!,
      raised = new Uint8ClampedArray(original.length),
      color = [23, 34, 231];
    for (let y = 3; y < 256; y++)
      for (let x = 0; x < 192; x++) {
        const from = (y * 192 + x) * 4;
        if (original[from + 3])
          raised.set([...color, 255], ((y - 3) * 192 + x) * 4);
      }
    p.skin.images["far-shoe"] = raised;
    const r = prepareRig(p.rig, p.skin, p.motions),
      rest = createRestStaticPose(p.rig, p.skin.metadata),
      bottom = (pixels: Uint8ClampedArray) => {
        const rows = [];
        for (let n = 0; n < 192 * 256; n++)
          if (
            pixels[n * 4 + 3] &&
            color.every((c, i) => pixels[n * 4 + i] === c)
          )
            rows.push(Math.floor(n / 192));
        expect(rows.length).toBeGreaterThan(0);
        return Math.max(...rows);
      };
    expect(bottom(r.pose(rest, "neutral"))).toBe(bottom(raised));
    expect(bottom(r.frame("idle", 0, "neutral"))).toBe(bottom(raised) + 3);
  });

  it("moves the body and all attachment roots together and returns detached pose metadata", () => {
    const p = project(),
      pose = createRestStaticPose(p.rig, p.skin.metadata);
    pose.body = { translation: [4, -6], rotation: 0.1 };
    const matrix = staticPoseBodyMatrix(pose, p.rig.pivot);
    for (const chain of Object.keys(pose.chains) as ChainName[])
      pose.chains[chain] = p.skin.metadata.bindings.chains[chain].map((point) =>
        mapStaticPosePoint(matrix, point),
      ) as unknown as JointTriple;
    const checked = validateStaticRigPose(pose, p.rig, p.skin.metadata);
    expect(checked.chains).toEqual(pose.chains);
    expect(checked.chains).not.toBe(pose.chains);
    expect(checked.body.translation).not.toBe(pose.body.translation);
    const r = prepareRig(p.rig, p.skin, p.motions);
    expect(r.pose(checked, "neutral").some((v) => v !== 0)).toBe(true);
  });

  it("rejects unknown fields, nonfinite or detached joints, collapsed/stretched anatomy and invalid IDs", () => {
    const p = project(),
      rest = createRestStaticPose(p.rig, p.skin.metadata),
      r = prepareRig(p.rig, p.skin, p.motions);
    const reject = (edit: (v: any) => void) => {
      const value = structuredClone(rest);
      edit(value);
      expect(() => r.pose(value, "neutral")).toThrow();
    };
    reject((v) => (v.version = 2));
    reject((v) => (v.id = "../bad"));
    reject((v) => (v.color = "red"));
    reject((v) => (v.body.scale = 2));
    reject((v) => (v.body.rotation = Infinity));
    reject((v) => (v.body.translation = [0, NaN]));
    reject((v) => delete v.chains.farArm);
    reject((v) => (v.chains.extra = v.chains.nearArm));
    reject((v) => (v.chains.nearArm[1][0] = 1000));
    reject((v) => (v.chains.nearArm[0][0] += 4));
    reject((v) => (v.chains.nearLeg[1] = [...v.chains.nearLeg[0]]));
    reject((v) => (v.chains.nearLeg[2][1] += 8));
    reject((v) => (v.body.translation[1] = -5));
  });
});
