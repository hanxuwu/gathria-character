# Male native 89 → Run 48: two-pose drawing study

Read-only visual analysis, 2026-11-03. No repository changes, no generated artwork. All coordinates below use the existing 512 × 768 canvas (x right, y down). Proposed joints are visual drawing guides, not recovered anatomical truth. ± 4–6 px tolerance is appropriate for covered joints; preserve shoe silhouette/contact more strictly.

## Evidence and limb identity

Inspected `/tmp/landing-v7-visual/male-{89,48,49}.png` and the matching bare source frames extracted from `docs/kling-side-workspace/assets/male.source.zip`. Bare sources are saved beside this report because clothing conceals the leg connections. Native89 is a two-foot crouch recovery. Run48 is far-leg support with the near knee lifted. Run49 continues the same near knee forward while the far leg pushes back. Near/far do **not** mean screen-left/screen-right.

- Native89 near leg: thigh/knee at approximately (228, 614), ankle at (199, 673), foreground shoe x165–248, bottom y708. It is the leg on the viewer-left in this source pose.
- Native89 far leg: knee approximately (292, 614), ankle approximately (274, 665), rear shoe x244–326, bottom y694. It is the shoe on the viewer-right in this pose.
- Run48 near leg: visibly exposed forward thigh/knee around (255, 590), folds back to ankle around (196, 619); diagonal shoe from roughly (169, 604) to (230, 682). This is the lifted foot even though much of it is screen-left.
- Run48 far leg: body-occluded supporting leg reaches the flat shoe x172–258, bottom y698, visual center approximately (215, 684).
- Run49 near leg: exposed knee around (265, 578), lifted shoe around (234, 649), outline x194–269, bottom approximately y683.
- Run49 far leg: rear supporting leg around (175, 643), flat shoe x142–232, bottom approximately y698.

The foreground thigh in the bare sources, its knee outline, and its connection to the diagonal lifted shoe establish the identity. Existing `artwork/kling-side-workspace/registration/male/registration.json` is NOT a reliable drawing ground truth here: Run48 nearKnee=(216.1,622.1) does not describe the visible forward knee, and Run49's nearAnkle=(157,650) points to the other/rear shoe. Several wrist estimates also miss the visible wrists. These are tracked proposals and hidden estimates, not authoritative bones.

## Endpoint geometry that cannot be ignored

Far support shoe center travels approximately x285→215 between 89 and48, then x215→187 between48 and49. Adding two poses divides that first 70 px backward stroke into about23 px per interval. The source is an in-place run, so this controlled backward support travel is compatible with forward world movement; it is not a stationary-screen foot lock.

At world speed700px/s and24fps, world movement is29.17px/frame. Three equal24fps bridge intervals compensate87.5px, while the measured shoe stroke isabout70px: residual world-space foot drift isabout17.5px total. Therefore do not claim physically locked world contacts without evaluating rendering movement/timing. A full89→48 duration near100ms would better match the measured stroke at700px/s, but timing is a runtime decision and cannot be silently changed by a drawing study.

The relevant support sole changes y694→698, approximately4px. The global silhouette bottom708→698 compares DIFFERENT shoes and is not support-foot vertical drift. Do not force both feet to a single horizontal sole line; the source 3/4 projection places near/far feet at slightly different y.

## Pose A — transfer weight, last near-foot toe-off

A must be after89, beforeB, with the torso continuing upward and out of the crouch. It is not another squat or a standing reset.

| Landmark               | Approximate target | Intent                                                                        |
| ---------------------- | -----------------: | ----------------------------------------------------------------------------- |
| Far shoe visual center |          (262,680) | Begin smooth backward support stroke; retain shoe length and broad sole       |
| Far sole lowest y      |                695 | No support-foot hop                                                           |
| Near knee              |          (240,612) | Begin knee advance; do not swing the whole leg behind                         |
| Near ankle             |          (197,657) | Heel already lifting and knee flexing                                         |
| Near shoe toe          |          (242,697) | Last toe-off region; no second flat-foot contact pose                         |
| Hip midpoint           |          (242,568) | Pelvis rises about5px and shifts toward the support axis relative to far shoe |
| Near elbow             |          (176,488) | Continue source bend                                                          |
| Near wrist             |          (225,522) | Slight forward/downward continuation toward48, not dropped arm                |
| Far fist center        |          (346,516) | Keep fist in front and bent elbow                                             |

Retain side-specific limb volume. Use the near shoe's forefoot to express release; its heel rises first. Do not introduce a heel slap, flat-foot slide of both shoes, or replace the near shoe with the far shoe. Once the toe releases, it must not regain contact before48.

## Pose B — far leg carries weight, near knee passes upward

| Landmark               | Approximate target | Intent                                                                         |
| ---------------------- | -----------------: | ------------------------------------------------------------------------------ |
| Far shoe visual center |          (239,682) | Continue support stroke toward native48 center215                              |
| Far sole lowest y      |                696 | Sole stays on the same projected ground track                                  |
| Near knee              |          (248,601) | Clearly advance/lift toward48 forward knee255,590                              |
| Near ankle             |          (195,638) | Fold lower leg under/behind near knee                                          |
| Near shoe toe          |          (230,689) | Fully airborne by this pose; continue to diagonal48 shoe                       |
| Hip midpoint           |          (236,563) | Continue rising/advancing relative to support foot, do not lift from both toes |
| Near elbow             |          (180,495) | Same arm, same bend sequence                                                   |
| Near wrist             |          (228,528) | Continue toward native48 visual wrist around232,534                            |
| Far fist center        |          (340,516) | Continue toward48 around334,515                                                |

The near knee must be visibly in front of the far thigh. Far thigh/lower leg remain partially occluded. No leg identity swap at the crossing, no identical mirrored leg pair, no invented hovering support shoe. Maintain the shirt/waist attachment during pelvis rise without duplicating belt/hem outlines.

## Head / face / neck handling

Use the existing89 full hair/face/ear drawing as the protected identity reference, preserving its exact shape and scale. A suggested purely rigid displacement of that protected head is:

- PoseA: delta(-9,-7) px from89.
- PoseB: delta(-18,-14) px from89.

This follows the observed movement of facial features toward48 (roughly24–30px left and15–23px up depending on feature), instead of holding89's head fixed then snapping it on the final frame. Do not re-render the eyes, smile, jaw, ear, hair part or hair volume. Maintain a short neck and bridge the collar beneath the moving head with appropriate local torso artwork; do not lengthen the neck.

These endpoint heads are not exact translated copies. Bare89 head bounds span approximatelyx167–392 while48 spansx139–350, and hair width also differs slightly. Pure translation cannot match every facial feature and outline simultaneously. Consequently this study cannot guarantee a perfectly matched final cut to48. If the remaining shape change becomes more visible, mark the candidate unsuccessful rather than scale/warp the approved face to conceal it.

The world/camera must not be translated independently to fake a better bridge. Head and body pose changes are local; shoe support strokes are assessed against the existing world trajectory separately.

## Review gates

1. Play89 → A → B →48 →49 →50 at actual playback cadence and in a one-frame-step contact sheet. Include source89/48/49 unchanged.
2. Inspect bare-source and current daily-clothing versions; clothing must not conceal an anatomical mistake.
3. Track far shoe sole through all frames and near shoe release exactly once. The close crossing at48 must not exchange identities.
4. Review eye, ear, jaw, hairline and collar at 1× and 2×. No head/face redesign, no increasing neck length, no new ear edge.
5. Confirm arms never straighten into walking, reverse swing abruptly or switch front/back occlusion without source evidence.
6. Review mirror-left too; preserve the same limb identity relative to the body after mirroring.
7. Keep this generated candidate independent. It is additional painted transition art, not an extracted original frame and not acceptance of a completed native transition.
