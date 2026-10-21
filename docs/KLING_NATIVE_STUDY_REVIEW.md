# Kling male: native layered skeletal candidate

This bounded candidate uses the **approved original male frame 348 / 14.50 s**,
not a regenerated character or the earlier reduced-resolution mother study.
The original 704×1056 RGBA image is partitioned into fifteen registered parts.
Actual source-over standing reconstruction matches every source RGBA pixel.
Three additional skeletal poses test the joints; they are derived stills, not
extracted video frames or completed animation cycles.

Open `/workbench.html?mode=rig&study=kling-male` from the library's native-study
link, or `/skin-studio.html?study=kling-male` directly. The default Skin Studio,
original Kling player, classic editor and historical files retain their existing
behavior. There are still three primary navigation destinations.

## What is implemented

- Native-size original/posed comparison, 0.5×/1×/2× display, mirrored left view,
  bone overlays and dark-background inspection.
- Standing, walk contact, run flight and raised-arm celebration static poses.
- Source-length-preserving upper/lower joint angle edits, undo, pose reset,
  complete native project save/reopen and PNG export.
- Independent CharacterPack V2 with four explicitly named **static pose holds**,
  not new walking/running/celebration loops. Each selector has one frame at 1 FPS,
  `loop:false`; jump is absent.

The frame remains 704×1056 with anchor `[352,1000]`. No pixel thresholding,
192×256 conversion, face replacement, independent visible-part scaling or
automatic original-to-rig conversion is used. The head/neck and torso share
their rigid parent transform. Shoe orientation follows its own lower leg about
the same ankle rather than remaining fixed in world space.

## Source and material ownership

The exact source PNG and new supplementary painting are retained in
[`artwork/kling-native-study/source`](../artwork/kling-native-study/source/README.md).
One development-time OpenAI image-generation call produced a separate sheet of
arm, vest, leg and shorts coverage. Only explicitly masked hidden regions use
that painting. It is disclosed as newly authored, not recovered original layers.
The original visible image is a complete disjoint pixel partition.

The fifteen parts are head, torso, pelvis, and near/far upper arm, forearm, hand,
thigh, shin and shoe. Every part uses the original full canvas. The native
[`registration.json`](../artwork/kling-native-study/prepared/registration.json)
records parent, pivot, source joints, drawing order and all four pose coordinates.
[`preparation-report.json`](../artwork/kling-native-study/prepared/preparation-report.json)
records source hashes, supplementary patch boxes, counts and part bounds.

Initial posing exposed shoulder holes, cloth/skin slivers and shorts cuts that
the standing comparison alone did not reveal. Following the actual neckline,
armhole and arm/waist boundaries corrected pixel ownership. Hidden shoulder and
thigh caps now extend underneath opaque vest/pelvis regions. Near upper arm is
behind the torso; the forearm and hand remain in front. The continuous arm is
deformed once, then partitioned for occlusion, avoiding two independently sampled
cut edges. Shoes use a rigid transform with the exact shared shin angle/ankle.
The proximal 35 pixels of each arm blend into the torso's parent transform;
this prevents a tapered shoulder fragment rotating independently above the
vest. The optional setting defaults to zero for earlier candidate projects.
An early vest-side supplement produced a detached sliver when the arm moved.
Inspection showed that the original vest silhouette was already complete, so
that unnecessary supplement was removed; its source sheet remains retained.

## Compatibility and scope

The existing Skin V1 family intentionally requires 192×256 crisp art. This
candidate adds the explicit `gathria-native-pose-study` version 1 profile under
`src/skeletal`, reusing the existing limb-mesh geometry and matrix concepts with
native premultiplied sampling and source-over composition. It does not relax old
validators, change old renderers or silently reinterpret older projects.

The native project ZIP contains all fifteen PNGs, the immutable source image,
registered document and checksums. Archive ordering/timestamps are canonical;
save/reopen retains original image bytes and actual pose coordinates. It is
opened by the native study UI, **not** imported as a legacy Skin V1 project.
The separately exported CharacterPack V2 is baked and plays in the unchanged
independent player; its recipe refers to the saved native project hash and
explicitly discloses skeletal derivation and hidden paint.

This batch has one neutral expression and fixed vest/shorts/shoes. Hands are
separate source parts but currently follow the forearm; independent wrist
controls, separate face/clothing layers, wardrobe items and female registration
remain later work. Four poses do not demonstrate smooth animation transitions,
source-video motion fidelity or production Gathria integration.

## Review and verification

[Actual exported previews, source comparison, projects and validation](kling-native-study/README.md).
Visual acceptance is separate from technical checks and remains with the user.

Current-batch verification: TypeScript and production build passed; **595 unit
tests across 48 files and 74 Chromium browser tests passed**. Frozen-input actual
UI evidence covers eight pose/direction exports, edited-project save/reopen and
eight independent-player cases after the editor closed. All 46 delivery PNGs
decode; both exported ZIPs pass CRC checks. The 2,563 protected existing files
under the legacy source/artwork scopes are unchanged against merged main.
[Commands, logs and visual limits](kling-native-study/verification-results.json)
record this run separately from earlier milestone results.

The final visual inspection confirms unchanged standing identity/proportions,
connected selected limbs and shoe/ankle parenting, clearer forward/back walking
and both raised hands visible. There are still small notches at the near armhole,
rounded/compressed shoulder contours under extreme raises, and an angular
shorts/inner-thigh fold in the run-flight still. Existing source matte fringes
remain; the far upper arm also narrows sharply beside the vest in run flight.
The source is not silently cleaned or repainted to improve a metric.
These are disclosed limits of a one-standing-view deformation, not a claim that
every pose now has the original video's naturalness. Pose-specific fold/shoulder
paint and coherent facial/body expression belong in a subsequent visual batch.

Reproduce retained materials without any generation API:

```sh
python scripts/prepare-kling-native-study.py
node scripts/compile-kling-native-study.mjs
EVIDENCE_PHASE=iterations/review node scripts/verify-kling-native-study.mjs
EVIDENCE_PHASE=iterations/review python scripts/render-kling-native-study-review.py
```

The offline compiler requires Pillow and NumPy. Browser evidence uses Chromium;
the original artwork and all processing inputs remain in the repository.
