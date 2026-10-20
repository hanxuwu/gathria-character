# Kling characters: modular feasibility

The supplied male and female characters can be played faithfully as baked
frames. They are **not yet editable skins or interchangeable wardrobe parts**.
The next modular experiment should reuse Skin Studio's existing attachment,
identity, item, motion and project concepts. It must not silently replace this
batch's original-video playback with a skeletal approximation.

This report inspects the implementation inherited from main `d6cfcb7`, the two
original uploaded videos, and one stable pose from each video. It is a bounded
feasibility review; no new anatomy, expression, clothing or hidden-joint artwork
was generated for it. Historical documents' test counts are not new test runs.

## Source references and motion selection

Both videos contain 361 video frames at 24 FPS, 1920×1080, lasting 15.041667 s.
Frame indices below are zero-based decoded video frames, not indices in the old
Unified archive. Standing frame **348 / 14.50 s** is the fixed reference for both
characters. The female reference has its own face, neck, torso, waist and shoe
details; matching motion does not justify substituting the male's anatomy.

The complete timelines and all selected motion frames were inspected. These
forward-only candidates retain every source frame in their selected interval:

| Action | Source frames, inclusive | Time interval, end exclusive | Frames | Duration at 24 FPS |
| --- | --- | --- | --- | --- |
| Idle | 336–359 | 14.000000–15.000000 s | 24 | 1.000000 s |
| Walk | 26–52 | 1.083333–2.208333 s | 27 | 1.125000 s |
| Run | 140–155 | 5.833333–6.500000 s | 16 | 0.666667 s |
| Celebrate | 253–268 | 10.541667–11.208333 s | 16 | 0.666667 s |

The next source frame approximates the first pose of each motion cycle and is
excluded to avoid a repeated endpoint hold. No reverse or ping-pong movement is
introduced. Run 140/156 and celebrate 253/269 have particularly similar poses.
Walk 26/53 has a modest cadence/pose difference inherited from the accelerating
source walk; selection is a reviewable loop candidate, not a guarantee of a
mathematically seamless source. The idle tail is almost still, with compression
and tiny texture changes; it must not be described as newly authored breathing.

Source run frames around 143–145 and 151–154 include motion-softened hands,
forearms and shoes. The body turns slightly during the walk/run cycle. Those
features exist in the original videos. Redrawing or sharpening them would be a
separate visual change, not extraction. The male video includes a soft dark
ground shadow on muted green; the female uses a brighter green background.
Background removal therefore needs separate source-key parameters and visual
inspection on both light and dark backgrounds.

A conservative native-resolution foreground diagnostic over all 83 selected
frames found these source-space extents (right/bottom exclusive):

| Source | All selected frame bounds | Standing frame 348 bounds |
| --- | --- | --- |
| Male | (614,122)–(1256,978) | (738,158)–(1138,976) |
| Female | (612,112)–(1258,996) | (740,148)–(1138,994) |

This diagnostic uses green dominance and the largest connected component; it
does not certify the final alpha edge. A **704×1024** viewport at source x=586,
y=12 for male and y=28 for female encloses those silhouettes without resizing,
including celebration hands. Each source uses one constant crop for every
action. Per-frame centering, bottom alignment or scaling would erase original
flight, body motion and perspective and must not be introduced to make a rig
fit. The final extraction report remains authoritative for actual delivered
pixel comparisons and alpha validation.

## What already exists

| Existing implementation | What can be reused | Important constraint |
| --- | --- | --- |
| `src/skeletal/types.ts`, `definition.ts`, `renderer.ts` | Eleven semantic bones, four two-bone limbs, registered source joints, weighted meshes, draw order | Rig V1 explicitly fixes the frame to 192×256 and `gathria-v6-humanoid-1`; it is not a resolution-independent native-video rig |
| Skin Studio and skin/project ZIPs | Attachment replacement, joint registration, pose/timing edits, undo/redo, saved source pixels | Existing rasterization and import rules target crisp binary-alpha art; importing these native smooth frames directly is unsupported |
| IdentityPack V1 | Coherent complete expression heads, optional back hair, identity/material ownership | Front hair and face are part of each head; there are no independent facial feature tracks or freely interchangeable front-hair runtime slots |
| Wardrobe items and recipes | Separate top, bottom and shoe groups, explicit masks, saved reusable item libraries | A top owns torso and arm art; a bottom owns hips and leg art. These are registered garment groups, not clothing laid automatically over an invisible universal body |
| Motion libraries V1/V2 | Idle, walk, run and one-shot jump; explicit versioned run behavior | These are authored skeletal motions. They do not recover the video's exact poses, changing perspective, soft shading or cloth deformation. Timed celebration is not implemented in this rig |
| Static pose study | Four independent joint triples plus rigid body transform | A celebration still pose is not a timed celebration loop |

References: [skin contract](SKIN_PACK_V1.md),
[identity contract](IDENTITY_PACK_V1.md),
[wardrobe ownership](WARDROBE_ITEMS_REVIEW.md),
[motion versioning](MOTION_LIBRARY_V2.md), and
[previous mother study and limitations](REFERENCE_MOTHER_REVIEW.md).

## One-pose part and registration study

Use frame 348 of each video as a separate immutable visual reference. Measure
head outline, neck opening, shoulder centers, elbow centers, wrists, pelvis,
hip joints, knees, ankles and shoe baselines in that source image before any
part is moved. Source joint positions must be inside anatomical volumes rather
than placed at the visible end of an outline. Keep the near/far limb labels
consistent with the three-quarter source view. Store a single source-to-canvas
translation and all source coordinates explicitly; do not fit anatomy by
stretching individual parts.

| Existing slot/group | Required separation for each source pose | Hidden coverage that cannot be recovered accurately from the flattened frame |
| --- | --- | --- |
| `head-neutral`, later `head-gentle`/`head-joyful` | Head, ears, face, complete short neck, matching neckline registration | Lower neck behind the vest; new expressions retaining identity. Celebrate frames can guide expression but differ in pose/perspective and cannot simply be pasted over the neutral head |
| `torso` | Complete vest/body silhouette with unobstructed side waist | Axilla and side chest behind upper arms; continuous waist beneath the top hem |
| `hips` | Shorts pelvis, waistband and front/back overlap | Crotch and upper-thigh coverage as the legs separate; underlying anatomy for any future shorter garment |
| Near/far upper arm and forearm | Separate skin volumes with shoulder and elbow overlap; hands remain with forearms in the current runtime | Rounded shoulder/elbow coverage, wrist/hand surfaces concealed by the torso or fist. Independent HD hands can be retained as source but would compile into current forearms |
| Near/far thigh and shin | Separate short-covered upper thighs and bare legs around shared knee pivots | Inner thigh, knee bend and calf regions concealed by the opposite leg; shorts hem behind the thigh |
| Near/far shoe | Whole shoe registered to the same source ankle as its shin | Ankle beneath the shoe opening, heel/sole surfaces revealed in a new rotation |

The present vest and shorts contain body shading and are baked into the image.
Calling them separate clothing assets without preparing those complete groups
would repeat the arm/waist fragments and knee gaps encountered previously. New
hidden coverage must be labeled authored/reconstructed, with original source,
mask, revision and processing provenance. It is not an accurately extracted
original video layer.

Layer-order experiments should start from the existing renderer: back hair,
far arm, far leg, near leg, hips, garment overlay, torso, near arm, head. This
order needs pose review where an arm crosses the chest or a leg crosses the
pelvis; a flat source does not prove every future occlusion. Keep clothing/skin
ownership explicit at the shoulder, armpit, waistband, shorts hem and ankle.
Use material IDs 0 fixed detail, 1 skin, 2 hair, 3 upper clothing, 4 lower
clothing and 5 footwear. Brown eyes, outlines and highlights must not be
inferred from color and recolored as skin or hair.

Both references are bald. The current identity system can support a complete
painted front-hair/head state and an optional back-hair layer. A later hairstyle
needs a skull-fit guide, ear/neck occlusion and stable registration for every
expression. It cannot be obtained from these bald source pixels. Arbitrary
interchangeable front hair would require an explicit, versioned extension of
the existing identity format, not a second incompatible identity system.

## Resolution and retargeting decision

Fitting a 1024-high source viewport into the current 256-high skin canvas means
at least a 4:1 reduction, plus a canvas-width/aspect decision. Fine eyelashes,
cheek shading, outline antialiasing, shoes and soft folds would change. Current
binary-alpha import would further change the edge. A successful file import or
rig test cannot establish faithful reproduction at that lower resolution.

Keep native baked playback as the authoritative appearance. Before a native
modular conversion, make a separately reviewed resolution/alpha extension of
the **existing** rig, attachments, validators, material masks, rasterizer,
authoring canvases and storage limits. Extend saved formats explicitly while
preserving existing 192×256 files and rendering behavior. Raising only a frame
dimension constant would leave motion distances, mesh sampling, limits and
source-registration assumptions inconsistent.

Even after that extension, the old motions will require pose review. The two
new references have their own head/body balance, arm lengths, bent rest knees
and near/far ankle heights. Reusing a skeleton topology is reasonable; applying
the same old source coordinates, motions and ground solve without retargeting
would alter the approved proportions and stance. Deep bends and the source's
quarter-view turns will likely need pose-specific artwork. A mesh cannot infer
new anatomy or reproduce changing painted perspective from one standing image.

## Bounded next gate

After review of the native baked delivery, a useful modular trial is one
male/female rest reconstruction and one raised-arm or bent-knee pose each in
the existing authoring architecture. Compare native source versus reconstruction
at the same size, checking face/neck/shoulder/waist/knee/ankle silhouettes and
newly exposed regions. Retain originals and list every newly authored pixel
region. A rest reconstruction alone does not demonstrate animation quality.

No complete Kling SkinPack, independent clothing collection, skeletal video
retarget, new expression bank, or timed skeletal celebration is claimed by
this report. Recoloring whole baked frames would not complete any of those
capabilities. Production Gathria scene integration also remains unverified.
