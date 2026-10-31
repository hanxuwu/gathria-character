import type { PortableCharacterPackManifest } from "../core/types";
import type { SideAction } from "./motion";

const ACTIONS: SideAction[] = ["idle", "walk", "run", "jump"];

/** A transition may show a Jump drawing while its playback action is Run.
 * Inspect the actual native drawing, retaining a requested action when the
 * same drawing intentionally appears in more than one source clip. */
export function sideInspectionPose(
  manifest: Pick<PortableCharacterPackManifest, "animations">,
  preferredAction: SideAction,
  frameId: number,
): { action: SideAction; position: number; fps: number } | null {
  if (!Number.isSafeInteger(frameId) || frameId < 0) return null;
  for (const action of [
    preferredAction,
    ...ACTIONS.filter((candidate) => candidate !== preferredAction),
  ]) {
    const clip = manifest.animations[action];
    const position = clip?.frames.indexOf(frameId) ?? -1;
    if (clip && position >= 0) return { action, position, fps: clip.fps };
  }
  return null;
}
