import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { createAuthoringProject } from "./builtins";
import { prepareRig } from "./renderer";
import { createRestStaticPose } from "./static-pose";
import {
  STUDY_POSES,
  bakeStudyHolds,
  faceStudyPixels,
  parseMotherPoseStudy,
  studySheet,
} from "./mother-study";

// Native byte equality retains every RGBA assertion without expensive generic
// deep comparison of hundreds of thousands of numeric properties.
function samePixels(actual: Uint8ClampedArray, expected: Uint8ClampedArray) {
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
}

function example() {
  const project = createAuthoringProject();
  const study = parseMotherPoseStudy(
    {
      format: "gathria-pose-study",
      version: 1,
      name: "Test candidate",
      poses: STUDY_POSES.map(({ id, label }, index) => {
        const pose = createRestStaticPose(
          project.rig,
          project.skin.metadata,
          id,
        );
        pose.body.translation = [0, -index * 3];
        for (const chain of Object.keys(pose.chains) as Array<
          keyof typeof pose.chains
        >) {
          const points = pose.chains[chain];
          pose.chains[chain] = [
            [points[0][0], points[0][1] - index * 3],
            [points[1][0], points[1][1] - index * 3],
            [points[2][0], points[2][1] - index * 3],
          ];
        }
        return { label, pose };
      }),
    },
    project,
  );
  return { project, study };
}

describe("independent mother pose study", () => {
  it("rejects unsupported, missing, duplicate or detached poses", () => {
    const { project, study } = example();
    expect(parseMotherPoseStudy(study, project)).toEqual(study);
    expect(() =>
      parseMotherPoseStudy({ ...study, version: 2 }, project),
    ).toThrow();
    expect(() =>
      parseMotherPoseStudy({ ...study, poses: study.poses.slice(1) }, project),
    ).toThrow();
    const duplicate = structuredClone(study);
    duplicate.poses[3] = duplicate.poses[0];
    expect(() => parseMotherPoseStudy(duplicate, project)).toThrow(/order/);
    expect(() => bakeStudyHolds(project, duplicate)).toThrow(/order/);
    expect(() => studySheet(project, duplicate, "right")).toThrow(/order/);
    expect(() =>
      parseMotherPoseStudy({ ...study, animation: "jump" }, project),
    ).toThrow(/unsupported/);
    const detached = structuredClone(study);
    detached.poses[1].pose.chains.nearArm = [
      [0, 0],
      [10, 10],
      [20, 20],
    ];
    expect(() => parseMotherPoseStudy(detached, project)).toThrow();
  });

  it("mirrors RGBA exactly without altering the source or dirtying transparent pixels", () => {
    const { project, study } = example();
    const prepared = prepareRig(project.rig, project.skin, project.motions);
    for (const { pose } of study.poses) {
      const source = prepared.pose(pose, "neutral");
      const before = new Uint8ClampedArray(source);
      const left = faceStudyPixels(source, "left");
      samePixels(faceStudyPixels(left, "left"), source);
      samePixels(faceStudyPixels(source, "right"), source);
      samePixels(source, before);
      for (let y = 0; y < 256; y++)
        samePixels(
          left.slice((y * 192 + 15) * 4, (y * 192 + 16) * 4),
          source.slice((y * 192 + 176) * 4, (y * 192 + 177) * 4),
        );
    }
    expect(() => faceStudyPixels(new Uint8ClampedArray(4), "left")).toThrow(
      /192/,
    );
  });

  it("bakes three still holds and four review PNG frames without changing ordinary clips", () => {
    const { project, study } = example();
    const source = JSON.stringify(project);
    const oldRun = prepareRig(project.rig, project.skin, project.motions).frame(
      "run",
      3,
      "neutral",
    );
    const packed = bakeStudyHolds(project, study);
    expect(packed.manifest.animations).toEqual({
      idle: { frames: [0], fps: 1, loop: false },
      walk: { frames: [1], fps: 1, loop: false },
      run: { frames: [2], fps: 1, loop: false },
    });
    expect(packed.manifest.animations.jump).toBeUndefined();
    const sheet = studySheet(project, study, "left");
    expect([sheet.width, sheet.height]).toEqual([768, 256]);
    const prepared = prepareRig(project.rig, project.skin, project.motions);
    study.poses.forEach(({ pose }, index) => {
      const pixels = prepared.pose(pose, "neutral");
      const left = faceStudyPixels(pixels, "left");
      for (let y = 0; y < 256; y++) {
        samePixels(
          sheet.pixels.slice(
            (y * sheet.width + index * 192) * 4,
            (y * sheet.width + (index + 1) * 192) * 4,
          ),
          left.slice(y * 192 * 4, (y + 1) * 192 * 4),
        );
        if (index < 3)
          samePixels(
            packed.pixels.slice(
              (y * packed.width + index * 192) * 4,
              (y * packed.width + (index + 1) * 192) * 4,
            ),
            pixels.slice(y * 192 * 4, (y + 1) * 192 * 4),
          );
      }
    });
    expect(JSON.stringify(project)).toBe(source);
    samePixels(
      prepareRig(project.rig, project.skin, project.motions).frame(
        "run",
        3,
        "neutral",
      ),
      oldRun,
    );
  });
});
