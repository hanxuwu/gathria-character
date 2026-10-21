# Female dress hem fitting V4

This is a garment-only derivative of the existing development-time image-generation
reference `../../source/outfit-designs.png`. No new reference image was generated.
The original Kling body, source poses, registration, canvas and anchor are kept.
V1–V3 garment ZIPs and previously saved/exported projects are not overwritten.

## Defects and repair

The previous donor extraction classified skirt-edge pixels by fabric colour.
That removed some dark painted outline and warm shadows from the coral hem,
leaving broken steps in the composed contour. For ivory it also classified a
neutral grey piece of the reference background below the left lace scallop as
cloth. In source pose 58 that background became a grey triangle over the real
left leg. Faint resampling rings produced narrow edge fragments near the shoe.

V4 traces the hem in the **existing painted reference**, within reviewed source
coordinate windows. Coral follows the continuous dark ink with a constrained
path; ivory follows its white lace border and only the immediately adjacent
thin dark outline. The process retains the donor's painted curves/scallops and
RGB, rather than drawing a replacement geometric skirt or changing the body.
Reference skin/background below that edge is outside the clothing mask.

Cloth fitting now samples premultiplied RGB/alpha. Very faint source-mask rings
at alpha 4/255 or below are removed before generating native clothing ownership.
The same existing waist guides, fitted folds, side-clearance rules and source
arm/hand protection are used. Pixels released by the corrected hem revert to
the source character (or the independently selected shoe layer) naturally.

Prototype inspection covered native poses 0, 58, 89 and 104, including 2× hem
crops. The frozen candidate was also inspected at idle endpoints 0/18 and jump
endpoints 83/121, in native right-facing and mirrored left-facing crops, plus
all 16 run poses and 39 jump poses on contact sheets. These authoring inspections
showed continuous hem edges and no new shoe disconnection; they are not a claim
of reviewing continuous application playback. A first ivory boundary trial followed a nearby reference leg outline;
it was rejected. The retained boundary uses the white lace as its primary
constraint and keeps only adjacent ink. No candidate containing that donor
skin was packaged for the catalog.

## Reproduce

```sh
python scripts/prepare-kling-dress-fit-v4.py
```

The default reads all masks, original source and registration from the committed
female authoring template. It does not require another session's `/tmp` files.
`--prototype --frames=0,58,89,104` limits an authoring inspection without writing
catalog garment archives. Generated inspection files in `/tmp/kling-wardrobe-dresses-v4`
are preparation previews, not application-export acceptance evidence.

New item IDs are `coral-daydress-v4` and `ivory-wedding-dress-v4`, each covering
all 96 source poses. `catalog-items.json` records paths/hashes and
`verification.json` records the source/template/donor bindings and preparation
coverage/protection checks. `legacy-hashes.json` verifies the previous dress ZIPs,
original donor, female registration/template and earlier preparation modules
against the branch base commit. Final acceptance must use the actual browser
exports and independent playback evidence in the batch review.

## Limits

The broad folds still come from one painted clothing reference fitted to source
poses. This change improves hem extraction and lower-body occlusion; it does
not add per-pose redrawn fabric dynamics or change the existing bodice/waist
shading. Source motion blur, pose variation and mirrored left-facing convention
remain. A few angular cloth corners in extreme poses can remain; successful
asset checks do not certify aesthetic acceptance.
