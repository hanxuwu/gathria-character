export interface PoseClip {
  frames: number[];
  loop: boolean;
}
export interface PoseNeighbor {
  role: "Previous" | "Current" | "Next";
  position: number;
  frameId: number;
}
/** Positions, not unique IDs: repeated frames are intentional holds. One-shot
 * boundaries are absent; only a declared loop wraps around. */
export function poseNeighborhood(
  clip: PoseClip,
  position: number,
): PoseNeighbor[] {
  if (
    !Number.isInteger(position) ||
    position < 0 ||
    position >= clip.frames.length
  )
    throw Error(
      "Choose a valid action position before inspecting neighboring poses.",
    );
  return ([-1, 0, 1] as const).flatMap((delta) => {
    let index = position + delta;
    if (index < 0 || index >= clip.frames.length) {
      if (!clip.loop) return [];
      index = (index + clip.frames.length) % clip.frames.length;
    }
    return [
      {
        role:
          delta === -1
            ? ("Previous" as const)
            : delta === 0
              ? ("Current" as const)
              : ("Next" as const),
        position: index,
        frameId: clip.frames[index],
      },
    ];
  });
}
