# Kling female skeleton review

Open the app, then **Character library → Edit Kling female skeleton**.
Direct route: `/workbench.html?character=female&mode=rig`.
Use **Review pose** and **Display zoom** to inspect the four editable stills.
**Open character** continues to play the original five video actions.

## Actual application exports

| Review                                                | Files                                                                                                                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved reference vs layered standing                | [Native](final/review/source-reconstruction-1x.png) · [2×](final/review/source-reconstruction-2x.png)                                                                                                      |
| Standing, walk contact, run flight, raised arms       | [Native right](final/review/four-poses-right-1x.png) · [2× right](final/review/four-poses-right-2x.png) · [Native left](final/review/four-poses-left-1x.png)                                               |
| Head/neck, shoulder, elbow, hip, knee and ankle crops | [Near-side joints 2×](final/review/joints-2x.png) · [Far-side joints 2×](final/review/far-joints-2x.png)                                                                                                   |
| Initial registration → refined coverage               | [Run flight](final/review/run-flight-iteration-comparison-1x.png) · [Raised arms](final/review/celebrate-iteration-comparison-1x.png) · [Joint comparison](final/review/joint-iteration-comparison-2x.png) |
| Fifteen registered parts and reassembly               | [Parts and pivots](final/review/registered-parts.png)                                                                                                                                                      |
| Real frontend                                         | [Library entry](final/library-female-entry.png) · [Female workbench](final/workbench-female-skeleton.png)                                                                                                  |
| Independent player after closing editor               | [Screenshot](final/independent-player.png) · [Validation record](final/evidence-index.json)                                                                                                                |

These are four **static pose studies**, not continuous skeletal animations.
No GIF is presented as a completed cycle. All shown pose pixels come from actual
application downloads; generated source-bank artwork is not substituted as
implementation evidence. The initial folder is a preserved earlier registration.

## Downloads

- [Editable female project](final/kling-female-native-study.project.zip): source,
  fifteen HD parts, joint/pivot/parent/layer configuration, four poses and checksums.
  Open through **Open native project** in the skeleton editor.
- [Female static CharacterPack](final/kling-female-native-stills.character.zip):
  load in **Player** without the editor; four one-frame holds, each at1FPS with
  `loop:false`, both facing directions. No skeletal jump is supplied.
- [Transparent original reference](final/reference.png) ·
  [Standing reconstruction](final/standing-right-1x.png).
- [Source, supplementary paint and provenance](../../artwork/kling-native-female/source/README.md).

## Verification executed for this batch

- TypeScript and production build passed.
- **113 unit tests in 8 files** passed on final assets, including exact male
  project/pack compatibility and female source/pose/export regression checks.
- **17 Chromium E2E tests** passed on final assets and code: both identities,
  original five-action playback, project editing/save/reopen, cross-character
  imports, separate retained sessions, and rejection of spoofed identity messages.
- Real browser evidence: 8 PNG pose/direction exports and 8 independent-player
  cases after editor closure. All four exported atlas frames match actual PNGs;
  static timing/hold behavior and mirroring are checked.
- **49 final PNGs and 2 final ZIPs** decoded/CRC-checked. Standing comparison is
  exactly0 differing RGBA pixels out of743424; smooth alpha is preserved.
- **50 existing source/asset/export files** match baseline `8dfbf83` byte-for-byte.

[Recorded results](verification-results.json) · [Command logs](checks) ·
[Decoded-artifact report](final/artifact-validation.json) ·
[Preservation audit](preservation.json).

Earlier initial captures/tests are separate history. These counts describe the
final run in this batch; they are not evidence of user visual acceptance.

## Remaining visual limits

Far-side upper-arm coverage is connected but still lighter/flatter than the
source forearm. Small near-shoulder notches, compressed raised-arm contours,
angular hip/shorts folds and source matte fringes remain. The face is neutral and
the outfit fixed. Complete skeletal cycles, independent wrist controls, facial
layers, interchangeable clothing and production integration are not implemented.

[Implementation, compatibility and reproduction](../KLING_FEMALE_NATIVE_REVIEW.md).
