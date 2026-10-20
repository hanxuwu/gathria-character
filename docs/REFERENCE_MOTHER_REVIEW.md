# Reference mother candidate 1

This batch turns the approved bald chibi reference into one coherent HD master,
registered body parts and **four static review poses**. It adds an independent
`/mother-study.html` page linked from Skin Studio. Studio defaults, earlier
characters and historical rendering remain unchanged.

The branch starts at `c074feb` on the still-unmerged `feat/base-character-study`
(PR #14), above merged main `19623f5`. The new review is stacked on that branch;
neither PR is merged by this batch.

[Review gallery and downloads](reference-mother/README.md) ·
[Source/provenance](../artwork/reference-mother/source/README.md) ·
[Browser export evidence](reference-mother/final/evidence-index.json) ·
[PNG/ZIP integrity](reference-mother/review/integrity.json)

## Artwork and registration

The fixed reference is Kling frame 348 / 14.50 s, selected after inspecting the
13–15 s interval. Other frames only guide poses. The user's PNG was visible in
the conversation; its desktop file was not available for byte-for-byte archival.
The full user-uploaded MP4 and extracted reference frames are retained.

Three development-time OpenAI image calls produced the complete master, its
alpha-cleanup edit and supplemental hidden-joint paint. The final source keeps
the round head, brown eyes, small nose and relaxed smile, short neck, compact
body, gray vest, dark shorts and white shoes. It retains a smooth 2D cartoon
finish; it is not converted into the earlier coarse pixel-art drawing style.

The 1024 × 1536 transparent master is separated into head, torso, pelvis and
near/far upper arms, forearms, hands, thighs, shins and shoes: **15 HD parts**.
The offline registration documents each canvas, bounds, pivot, parent and
occlusion order. Hidden coverage is supplementally painted; it is not described
as recovered original layers. A single uniform scale makes native 192 × 256
attachments. The rig uses the new source anatomy rather than changing the
approved proportions to match an old character. HD rest reconstruction retains
exact RGB for 99.79% of the pixels opaque in both HD images; this is a registration
check, not a measure of artistic quality or a claim of exact reference identity.

Two preparation issues found through real pose rendering were corrected:

- Broad arm masks picked up shorts pixels. Explicit vest/hand/shorts boundaries
  corrected ownership; tapered pelvis overlap reduced side flaps during bends.
- Separately filtered limb pieces introduced a bright elbow row. Sampling each
  complete limb before native splitting removed that seam without altering the
  mesh renderer. Detached low-alpha HD background residue was also cleaned.

## Actual skeletal support

The existing system already has eleven semantic bones, four two-bone limbs,
weighted pixel meshes, hierarchy, registered attachments and portable projects.
It does **not** have separate runtime hand/wrist or face-component slots, arbitrary
bone animation tracks, or a celebration action. Existing clips cannot raise the
two arms independently into this pose.

The added versioned `StaticRigPose` is therefore separate from timed clips.
It contains a rigid body transform and four explicit joint triples, validated
for parent attachment and bone length. `prepareRig().pose()` and `.inspectPose()`
use the existing meshes and draw order. Shoes follow their shin about the shared
ankle, including the original slight near/far sole-height difference. No ground
solver flattens the reference perspective. The earlier `.frame()` path keeps
its historical results.

Standing, walk contact, run flight and celebration are shown at native size,
integer zoom, both directions and with bone overlays. The candidate page offers
PNG, four-pose sheet, project/pose archive, HD asset and compatibility-pack exports.
It loads this bundled candidate; importing an arbitrary study archive into that
page is not implemented. Reproduction from the archive uses the documented APIs.

## Compatibility and unfinished work

The editable container is an ordinary authoring V1 / Skin V1 ZIP. Actual pose
coordinates are saved separately as `poses.json`; the rig and registration are
also plain JSON. The container includes the existing generic motion library for
format compatibility, but those cycles are **not reviewed candidate animations**.
The pose-study archive is the authoritative delivery for these four poses.

CharacterPack v1 requires idle/walk and supports run but not celebration. The
optional compatibility pack is explicitly named **Reference mother — static pose
holds**: idle=standing, walk=walk contact, run=run flight, one frame each, 1 FPS,
`loop:false`. Celebration is not mislabelled as jump. The independent player
loads this pack after the candidate page is closed and displays all six
pose/direction combinations exactly. This verifies file compatibility, not
completed running or walking animation.

Hands are independent HD sources but compile into forearms; they cannot yet
rotate at independent wrists. Neutral is the only authored face and is repeated
in the three required expression slots. Facial parts and clothing are not yet
independently editable runtime layers or portable wardrobe items. Complete
motion cycles, more expressions, more clothing and Gathria integration remain
later work.

## Visual review

Native, 2×, 4× joint crops and HD dark-background views were inspected this
session. These four selected poses preserve identity and overall proportions;
no detached limb, shoe, large clothing fragment or shoulder/ankle hole was
observed. Small shorts side flares, a pale inner shoulder transition and soft
knee/elbow contours remain under large bends. The celebration pose keeps the
neutral smile. Pose-specific fold/hand/expression artwork would improve those
limits. These are a reviewable candidate, **not user visual acceptance**.

## Reproduce and verify

Use the existing Node setup and system Chromium. Offline preparation also needs
Python with Pillow, NumPy and SciPy. No image API is needed to reproduce the
retained sources:

```sh
python scripts/prepare-reference-mother.py
node scripts/compile-reference-mother.mjs
node scripts/generate-reference-mother-evidence.mjs
python scripts/render-reference-mother-review.py
npm test
npm run build
```

The evidence harness refuses to overwrite an existing output directory; preserve
or move an earlier capture before rerunning, or choose a new `EVIDENCE_PHASE`.
This session's exact test results are in
[verification-results.json](reference-mother/verification-results.json).
Source images and historical generator files remain intact.
