import { expect, it } from "vitest";
import { poseNeighborhood } from "./pose-neighborhood";
it("wraps only loops, keeps held source IDs at distinct action positions, and bounds one-shot endpoints", () => {
  const clip = { frames: [10, 10, 30, 40], loop: true };
  expect(poseNeighborhood(clip, 0).map((p) => [p.position, p.frameId])).toEqual(
    [
      [3, 40],
      [0, 10],
      [1, 10],
    ],
  );
  expect(
    poseNeighborhood({ ...clip, loop: false }, 0).map((p) => p.role),
  ).toEqual(["Current", "Next"]);
  expect(
    poseNeighborhood({ ...clip, loop: false }, 3).map((p) => p.frameId),
  ).toEqual([30, 40]);
  expect(poseNeighborhood({ frames: [99], loop: false }, 0)).toEqual([
    { role: "Current", position: 0, frameId: 99 },
  ]);
  expect(() => poseNeighborhood(clip, 4)).toThrow();
  expect(() => poseNeighborhood(clip, 1.2)).toThrow();
  expect(() => poseNeighborhood({ frames: [], loop: true }, 0)).toThrow();
});
