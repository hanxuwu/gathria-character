# Theo running pose attachments

This opt-in study starts from merged `main` at `30125e5`, on
`feat/theo-passing-poses`. It improves bent-trouser contours and gives both
running shoes a consistent side view. It does **not** finish natural running:
the ninth pose still crowds the boots, and source changes can alter trouser
width. Production defaults and existing projects are preserved.

## What changed

| Problem                                | Finding and change                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Folded trouser triangles               | The old near-leg source bends opposite the solved running knee. A newly generated complete bent leg supplies cloth closer to the required pose, with its own measured source joints.          |
| First replacement's pointed flap       | UV tracing located this at an off-center distal cuff, not the initially suspected hip cut. A complete centered cuff and rounded hidden hip allowance replace the cropped original run source. |
| Front-on near shoe during side running | Reuse the original model's side-view shoe, with its own ankle registration and opaque-sole support. Both shoes use this source throughout running.                                            |
| Reusable authoring                     | Explicit Skin V3 / bottom-and-shoe item V4 carry paired alternatives and material masks. Studio edits their source landmarks independently of anatomical joints.                              |

The base fifteen attachments, heads/expressions, top, anatomical bindings and
motion library are unchanged. Frame size, ground anchor, twelve run keys and
18 FPS remain. Idle, walk and jump use the original parts; no old project is
silently upgraded. Motion libraries V1 and V2 retain their foot-travel semantics.
The existing CharacterPack format and independent player need no new runtime
format because exports contain baked pixels.

The renderer selects base or bent cloth by the closest signed knee turn, not
by character name or frame index. Garment replacement removes only that
garment's alternatives. The [format contract](RUN_POSE_ATTACHMENTS.md) explains
registration and compatibility.

## Artwork and bounded iterations

The first trial reused the original complete model's run leg and shoe. It made
new cuff flaps and retained deep mesh folds, so it was rejected. The second
trial uses one OpenAI-generated isolated trouser leg; the exact prompt and
untouched source are retained. Its initial 0.059 registration was too thin.
A final uniform 0.078 source registration restores more cloth thickness while
the original anatomical chains continue to determine pose and height.

These are two source trials, with one width-registration comparison in the
second. Earlier projects, mappings, preparation text and diagnostics remain
recoverable in [`artwork/theo-passing-poses/`](../artwork/theo-passing-poses/README.md).
No final-frame painting, global color deletion or runtime image API is used.

## Review the actual exports

See [previews and editable downloads](theo-passing-poses/README.md): matched
native/2× run frames and GIFs in both directions, close-ups of poses 7–10,
isolated leg/shoe contributions, four-action previews, expressions, recoloring,
portable clothes, editable projects and standalone CharacterPacks.

These final review images are cropped or composed from actual Studio exports.
Source-attachment views and offline preparation diagnostics are labeled
separately. `final/evidence-index.json` records editor/playback checks and
input hashes; `verification-results.json` records this batch's commands.

## Verification executed in this batch

- `npm test`: **482 tests / 38 files passed**. The first full run passed 481
  and failed one obsolete assertion that item V4 was unsupported. That check
  now rejects unsupported V5 and still rejects V4 without its required color
  model; the full suite then passed. No rendering assertion was removed.
- `npm run build`: TypeScript and production build passed.
- **18 Chromium tests passed** across source editing, Skin Studio, portable
  clothing, source-relative colors, active forearms and Motion V2. Historical
  Theo, Rose, Maple and Willow exports remain exact.
- Preparation checks all 108 expression/action bounds and 96 variant/non-run
  equality cases; original base pixels, identity, rig and motions remain exact.
- Source/archive inspection decoded **82 PNGs, three GIFs and seven ZIPs**,
  including retained candidates. All diagnostic GIFs contain twelve frames
  with 670 ms total duration; ZIP CRC and embedded PNG/JSON checks pass.
- Actual UI capture passed **six semantic packs / 216 poses**, 80 editor
  frame/direction comparisons, two portable-item round trips, source-landmark
  edit/save/reopen/undo checks and ten timed independent-player cases after
  Studio closed. All **76 PNGs, sixteen GIFs and 23 ZIPs** in the final directory
  decode and pass the recorded integrity/timing checks.
- Independent inspection confirms all 24 non-run frames and the upper
  `y < 170` area of all twelve run frames remain pixel-exact. Final run pixels
  match the selected prepared source; native/2× outputs and enlarged close-ups
  expose the remaining lower-leg defects rather than hiding them.

These are current execution results, not reused historical counts. Visual
inspection found the improvements and remaining issues described below;
passing functional tests is not final visual approval.

## Known limits and next useful input

- Pose 9 still stacks the boots. A side-view shoe is more consistent, but the
  existing passing path and single recovery-shoe view cannot supply clear
  separation on their own.
- Pose 10 still has a conspicuous triangular fold on the rear/left trouser
  above the trailing boot. The near/front shin is cleaner; that does not mean
  the whole pose or both legs are repaired. This remains visible in actual
  exported pixels, independently of the near-leg mesh diagnostic.
- Base and bent trouser sources differ in folds and width. Check transitions
  near the start/end of the loop; selecting a closer drawing is not continuous
  cloth simulation. Some deepest-pose mesh inversions remain.
- Elbows remain fairly rigid. This batch preserves the existing shoulder,
  hand, stride and body motion rather than changing additional areas at once.
- The historical forehead recolor boundary and small expression identity drift
  remain separate issues.
- No production Gathria integration or user visual acceptance is claimed.

The next useful source is a matched family of medium/deep and rear recovery legs and a
recovery shoe, authored to the same cuff width and ankle coverage. This batch
stops at review instead of continuing global weight adjustments.
