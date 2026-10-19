# A calibrated character kit

This batch turns one existing body into a small, repeatable clothing kit: two
hair silhouettes, two tops, one pair of trousers and two shoe designs. The
eight combinations share the same face/neck source, anatomical registration
and four-action motion library. They are prepared offline and assembled by the
existing browser-local renderer.

This document is the **authoring contract**, not visual approval. Machine
checks are recorded in [`standard-kit/contract-validation.json`](standard-kit/contract-validation.json).
Application exports, playback checks, visual findings and remaining limitations
belong to the batch's review evidence. A successful import or numerical check
does not establish that a sleeve, jaw or knee looks convincing.

## Scope and version boundaries

The body reference is the retained Theo ankle-follow project at
[`theo-ankle-follow/final/theo-ankle-follow.rig.zip`](theo-ankle-follow/final/theo-ankle-follow.rig.zip).
Its source is the V6-scale humanoid authoring family; its skeletal animation is
not a claim to reproduce the historical Studio V6 baked idle/walk artwork.

The reference main commit is `0a0fc061d6024a444b7d0a5bc377b4d39e48153c`.
The validator compares the actual saved rig, anatomical chains and full motion
library against this archive. It records canonical SHA-256 hashes and fails if
any of the eight combinations quietly changes the body or animation to fit an
item. Existing runtime, old artwork and old configuration results remain
unchanged by this asset-only batch.

Hair and face are separated during **offline source preparation**, then
compiled into ordinary complete-expression IdentityPack V1 heads. Skin Studio
still selects these as identity variants. This work does not add a runtime
hair slot, a free-form face/hair editor or a new import format. Preserve the
offline layers and processing instructions to author another hairstyle; a
compiled head PNG alone does not retain its editable hair/face separation.

## Fixed registration

| Property                                                  | Contract                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| Rig family                                                | `gathria-v6-humanoid-1`                                           |
| Full source canvas                                        | 192 × 256 pixels, retained for every part                         |
| Native direction                                          | Right-facing three-quarter view                                   |
| Ground anchor                                             | `(96, 240)`; native opaque support convention is row 239          |
| Neck registration                                         | `(96, 118)`                                                       |
| Root/torso pivot and hierarchy                            | Exact reference-project values                                    |
| Anatomical shoulder/elbow/wrist and hip/knee/ankle chains | Exact reference-project values for every look                     |
| Motion                                                    | Exact reference-project keys, timing, sequence and version        |
| Alpha                                                     | Binary 0/255; fully transparent pixels have zero RGB              |
| Enlargement                                               | Positive integer scale, nearest-neighbor sampling                 |
| Opposite direction                                        | Mirror the individual rendered frame about its frame-local anchor |

Source artwork must fit these coordinates. A differently posed source can be
registered and resampled during preparation, with its mapping retained in the
provenance record. Replacing the target chain with a more convenient source
chain would change the body and is outside this kit contract. Resampling must
not introduce partial alpha, blur, frame trimming or an independent limb scale
at runtime.

Rest limb registration and garment pose registration are different things.
Bent-trouser artwork can declare a different source joint triple while being
posed onto the same anatomical leg. A shoe can declare its own source ankle and
shin axis; these describe the drawing, not a new calf length. The run solver
must keep the posed shoe ankle coincident with the leg ankle and rotate the
shoe with that leg's solved shin direction.

## Clothing choices contain multiple animation parts

The user chooses a top, trousers or shoes. Those choices are groups of render
attachments, not necessarily single PNGs.

| Choice            | Parts and ownership                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hairstyle variant | Front hair compiled over the shared expression face; optional separate back hair. No clothing or torso pixels.                                                          |
| Top               | Complete torso and side waist; near/far upper sleeves; near/far forearm, cuff and hand; optional action forearms. No trousers, skirt hem or hair.                       |
| Trousers          | Hips, near/far thighs and shins; complete run bent-leg alternatives. No duplicate shoe pixels.                                                                          |
| Footwear          | Near/far ordinary shoes and run alternatives with source ankle/shin registration. Own the footwear outline; sock, skin and trouser allowances stay on leg/bottom parts. |

Material masks are authored ownership, never guessed from the chosen output
color. Preserve the existing `(material, 0, 0)` mask convention: 0 fixed detail,
1 skin, 2 hair, 3 top, 4 bottom and 5 shoe. The artwork and its mask must have
identical alpha. An outline, eye highlight, brass button or fixed trim may use
material 0 even when its visible color resembles another dyeable material.

For this kit, identity parts may use 0/1/2, tops 0/1/3, trousers 0/1/4 and shoes
0/5. Skin, sock and cloth allowances belong to the leg/bottom parts. A legal material number is necessary but does not prove correct
ownership: a blue skirt fragment mislabeled as top fabric remains wrong. Use
isolated-layer and posed visual checks to find such defects.

## Hidden coverage and overlap

Paint the full torso behind moving arms, including both shoulder roots and the
side waist. Keep forearm/cuff/hand contents separate from adjacent torso,
hair, skirt or trousers. Complete knee and ankle coverage belongs to the
appropriate leg material, not a duplicate foot.

Joint overlap is a painted allowance around the shared registration. Inspect
it in the deepest authored bend and with the arm or leg swung away. An
arbitrary overlap radius cannot guarantee good silhouettes: broad cuffs,
narrow wrists and trousers need different coverage. Record any trimmed or
extended region, its source pixels and the reason. Avoid a color-wide delete
or a rectangle that conceals an ownership error in only one pose.

This batch reuses the existing far-arm/body/near-arm and hair draw order. It
does not establish a general solution for long capes, held weapons, loose
skirts or items that must cross the torso during an action. Such items need
their own sublayers, pose assets and explicit occlusion contract.

## Face and hairstyle invariance

The two hairstyles must reuse one registered set of neutral, gentle and
joyful face/ear/neck source layers. Expressions can deliberately change eyes,
brows, cheeks and mouth; changing hair must not redraw those features, move
the head, alter the neck or recolor skin.

Preserve a source-only layer for every expression and an explicit hair
ownership/occlusion region. Compare those preserved source layers byte for
byte, and compare visible face pixels outside the declared hair overlap. A
hairstyle may naturally cover more forehead or ear pixels; this is different
from changing the underlying face. Do not claim the entire final head RGBA is
identical across hairstyles or infer face identity from a whole-head hash.

Within one hairstyle, all clothing/shoe combinations must have identical
decoded head and back-hair pixels. Changing hair must leave every torso,
limb, trouser and shoe attachment unchanged when the other choices match.
These cross-combination checks catch hidden replacements that a lineup alone
can miss.

## Provenance needed for another asset

Keep the original source, not only its cleaned PNG or final montage. A
reproducible source record should include:

- Source path and SHA-256, original author/tool and supplied rights context.
- Original canvas, reference pose and any generated-image prompt/version
  information actually available. Do not invent an unavailable model ID.
- Crop, transform, source/target landmarks, ownership masks and repair regions.
- The preparation script and output hashes, plus the shared reference-project
  hash and motion/body hashes.
- Item group, slots, source palette and expression or run-attachment variants.
- Actual fit results for idle, walk, run and jump, and explicit unsupported
  combinations.

The standard kit combines a separately documented generated head/hair source
with local derivatives of existing garment artwork. Keep those two provenance
paths distinct: adapting a garment is not a fresh image-generation API call.
The head registration is recorded in
[`head-registration.json`](../artwork/standard-kit/prepared/head-registration.json),
including original source hashes, face/neck transforms, separate hair
transforms and exact shared-face coverage counts. Every generated source is
subject to the same calibration, ownership and hidden-coverage checks before
entering this library.

## Validation and delivery

Run from the repository root after all eight prepared projects exist:

```sh
node scripts/validate-standard-kit.mjs
```

Expected input names are
`artwork/standard-kit/prepared/projects/{short|sweep}-{teal|ochre}-{boots|sneakers}.rig.zip`.
The script imports each archive with the real reader and checks:

- Exact reference rig, body chains and full motion library; native frame,
  anchor and neck registration; unchanged legacy source paths.
- Nonempty decoded source/rendered pixels, binary alpha, zero hidden RGB and
  transparent outer frame margin.
- Every authored idle/walk/run/jump key and all three expressions, with
  repeated rendering for deterministic pixel equality.
- Shared posed body/arm registration; fixed run segment lengths; run shoe
  angle, coincident ankle and bounded sole error.
- Material-category ownership and unchanged decoded attachments across
  combinations where the corresponding choice did not change.
- Independent shared-face/hair PNG hash verification and exact RGBA/material
  recomposition of the six packaged expression heads. Common visible face
  pixels must remain unchanged between hairstyles; differing forehead
  occlusion is reported separately.

The old renderer intentionally includes small idle/walk/joyful arm offsets.
This script compares their saved behavior to the reference rather than
claiming all historical actions are a perfectly rigid anatomical simulation.
Shoes can produce different solved run knees/ankle heights because their
opaque sole shapes differ; unchanged body proportions do not require those
posed coordinates to be identical.

Numerical validation does not replace the application workflow. Open each
project in Skin Studio, export its CharacterPack, decode its PNG, compare
native-size and integer-zoom output, and inspect full animation playback in
both directions. Verify GIF frame order and durations, archive members and
manifest timing. Close the editor before exercising the independent player.
Keep the editable `.rig.zip` alongside the baked `.character.zip`.

Record this batch's actual command results and visual findings separately from
historical tests. Do not declare UI import, independent playback, GIF review
or visual acceptance merely because the source-contract script passed.

### This batch's executed contract check

`node scripts/validate-standard-kit.mjs` passed on **2026-10-19, 07:37:31–07:38:11
UTC**. This session checked 8 projects, 288 authored action keys, 864
key/expression combinations and 864 repeated-render comparisons. It also
checked 192 running-shoe registrations, 28 pairs of clothing combinations and
all 6 head compositions against the separately preserved face/hair sources.
Both hairstyles leave the 426-pixel protected eye region uncovered. Maximum
run segment-length, ankle and angle residuals were floating-point rounding
only; maximum native sole support error was 0 px. Exact values and hashes are
in the linked JSON report. These results do not include the separate browser
export/player workflow.

The first full-body assembly exposed a real asset-fit defect: a tall hair
crown reached the frame's top edge at walk key 2, which the initial idle-only
inspection had missed. The correction adjusted only the crown registration
(4 px for the crop, 1 px for the sweep), preserving the shared face layers,
neck, body and motion. The final head preparation checks all 108
action-key/expression combinations per hairstyle. This was an artwork
boundary failure found during integration, not a reason to weaken the frame
margin check or silently change the walking motion.

## Boundaries for future expansion

This is one calibrated body and one three-quarter viewpoint. It does not
establish universal retargeting across taller/shorter bodies, true front/back
views, arbitrary loose clothing or production Gathria scene integration.
The three expression faces remain separate generated source drawings with
small contour and lighting differences. This kit proves an identical shared
face **for a given expression** across both hairstyles; it does not claim that
the expression drawings themselves have identical facial contours.
Existing identity V1, clothing-item V3/V4/V5, Skin V4 and motion V2 retain their
separate meanings; the offline kit specification does not silently upgrade
old files or add fields to their strict schemas.

Before adding another item category, prove its attachment ownership, hidden
coverage and action extremes on this small library. Keep failed fit studies
and explain their limits instead of stretching bones, changing motion per
outfit or mislabeling a partial loop as a supported combination.
