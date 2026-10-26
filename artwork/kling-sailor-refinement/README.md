# Midnight sailor V2: bounded collar and shoulder refinement

The [new garment](../../docs/kling-wardrobe/garments/male/midnight-sailor-v2.zip)
reuses the original painted sailor design and all 88 published V1 ownership
masks. It corrects two registration artifacts without moving or repainting
the original Kling body. The old V1 garment and authoring recipe are retained.

These boards are **offline registration previews**, not application exports or
user visual approval. Application export and saved-project validation belong to
the surrounding expression/fit release.

## Observed issue and selected correction

The frozen V1 torso sampler repeated donor row 411 for every shirt pixel above
`neckY - 10`. This created an upright cream strip beside the neck in running
pose 59, crouch 86, airborne 96 and landing 104. The old 28-pixel shoulder blend
also spread collar ivory into the navy sleeve, clearly visible in raised-arm
pose 78.

V2 keeps the existing donor X mapping and extrapolates donor Y above that old
clamp. This upper extension uses the donor recipe's cloth-only plain-navy
padding, so the tiny painted donor collar tip cannot appear as a detached chip
when the original shoulder occludes it. Nonnegative torso samples are unchanged
before shoulder composition.

Broad shoulder blending now applies only to two navy samples. The last five
pixels of collar on the torso side receive a narrow feather toward the sleeve
navy; ivory is not blended out onto the sleeve. Cuffs keep their original
painted RGB except where they participate in this existing shoulder join.

The selected result removes the repeated cream strips and broad shoulder haze.
The fixed source U-shaped opening and torso/sleeve division still limit the
V-shaped donor collar. Pose 104 retains a short, flat/angular collar termination.
This is not a new neckline, silhouette, cloth simulation or anatomy repair.
No waist correction was needed; the lower torso and waist remain pixel-exact.

## Two reviewed attempts

| Run | Result | Decision |
| --- | --- | --- |
| [prototype-v1](prototype-v1/) | Donor-Y extrapolation plus hard material separation removed the broad haze, but revealed a tiny ivory chip in 59 and a hard collar boundary in 96/104. | Rejected. |
| [prototype-v2](prototype-v2/) | Upper plain-navy padding removes the chip; a five-pixel torso-side feather softens the collar termination. | Selected, with the remaining source-domain limit above. |

The selected native comparisons cover [59](final-v2/pose-059-comparison-native.png),
[78](final-v2/pose-078-comparison-native.png),
[86](final-v2/pose-086-comparison-native.png),
[96](final-v2/pose-096-comparison-native.png) and
[104](final-v2/pose-104-comparison-native.png).
Neighbor boards cover [run](final-v2/offline-run-neighbors.jpg),
[raised arms](final-v2/offline-raised-arms-neighbors.jpg),
[crouch](final-v2/offline-crouch-neighbors.jpg),
[flight](final-v2/offline-flight-neighbors.jpg) and
[landing](final-v2/offline-landing-neighbors.jpg), including the idle control.
Both primary and independent visual review preferred the second attempt.
The [all-88-pose overview](final-v2/offline-all-88-poses.jpg) is rebuilt from the
delivered V2 ZIP by the independent checker and was also scanned for continuity.

## Preservation and provenance

- [Authoring audit](final-v2/audit.json): the unchanged V1 recipe first reproduces
  the published V1 pixels exactly for every pose; only the stated upper/shoulder
  regions may then differ.
- [Independent archive audit](final-v2/independent-validation.json): separately
  decodes both delivered ZIPs without importing authoring or fitting functions.
  It compares the ownership PNG bytes, frame/page records, alpha, protected
  pixels, lower torso/waist and source pixels outside clothing. Changed-pixel
  counts must agree with the authoring audit.
- Source dimensions, proportions, anchors, frame IDs and action clocks refer to
  the same unchanged source archive and registration. The garment adds no
  alternate animation schedule.
- The existing [painted donor and provenance](../kling-expression-shirt/source/shirt/README.md)
  are reused. No new generated body, skin, face or background is used.
- Archive, source, registration, donor, donor-definition and recipe hashes are
  recorded in the audits. Old saved projects retain their embedded V1 garment;
  the V2 ID enables a separate updated look.

## Reproduce

Use the Python dependencies in `scripts/requirements-kling-wardrobe.txt`:

```sh
python scripts/prepare-kling-midnight-sailor-refinement.py --prototype --run new-review-name
python scripts/prepare-kling-midnight-sailor-refinement.py --run new-full-name --garment-output artwork/kling-sailor-refinement/new-full-name/midnight-sailor-v2.zip
python scripts/check-kling-sailor-refinement.py
```

Run directories and garment outputs are never overwritten. The independent
check targets the delivered V1/V2 archives and `final-v2` audit. The unchanged
V1 authoring script remains available separately.
