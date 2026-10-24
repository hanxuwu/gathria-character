# Male sleeve ownership candidate

This is an additive **Teal joined sleeve** (`teal-camp-shirt-v5`) candidate over
`teal-camp-shirt-v4`. The old bank remains unchanged. It is not a new body,
source extraction or generated character drawing.

## Diagnosis and limited change

The actual everyday character exported by the application has a triangular
bare-skin wedge at the upper sleeve/foreground forearm join in source pose 59.
Inspecting the original source and individual garment ownership showed a
22-pixel-wide concave notch in the sleeve mask. Its apex is not an intentional
source hand boundary and is outside the protected head/fist regions. This is an
ownership/cloth registration defect, not a change to the character's neck,
shoulder anchors or running schedule.

The candidate measures intact sleeve hem locations on either side, continues
that hem with a shape-preserving interpolation and re-registers the existing
28-pixel-deep strip of cloth toward it. Existing painted RGB and edge shading
travel together. No generated donor, fill-color brush or new outline is used.
This operation covers 217 previously exposed upper-sleeve pixels, intentionally
changing their displayed material from skin to cloth. It does not change the
source archive, underlying body silhouette, head, hands, limbs, anchors or timing.

One offline trial was sufficient to remove the notch without extending the
outer silhouette. `notch-offline-3x.png` and `pose-58/59/60-offline.png` are explicitly
labeled **offline diagnostics**, not application acceptance evidence. Final
acceptance must use the candidate imported into the application and actual
before/after PNG and left/right animation exports.

## Reproduction and checks

```sh
python scripts/prepare-kling-male-repair.py --pack
python scripts/verify-kling-male-repair.py
```

The first script is restricted to source pose 59 and the recorded native sleeve
window. It writes only this candidate and its provenance files. The independent
checker decodes the old/new atlases, reconstructs every pose, checks protected
regions and compares final RGBA against the original source composition.

`asset-checks.json` records 88 decoded poses, 87 byte-exact pose patches and
ownership masks, and a single 671-pixel displayed RGB change within
`(x=374,y=512,width=22,height=50)`. All final silhouette alpha and protected
head/fist pixels remain exact. `audit.json` records source/registration/parent
hashes and measured per-column displacements.

Candidate ZIP SHA-256:
`a41b45869fe0a3b63c613f8ade0b188a7e8b9040fee618fb3e9800c05543145e`.
Source and registration are the unchanged male motion pack and
`male-full-outfits-v1` registration. Runtime contract remains garment V1.

## Remaining limits

This is deliberately a single-pose repair, not a claim that all seams are fixed.
The source still has motion blur. Jump pose 102 retains a stepped upper shoulder
and neck-side cloth contour. Several wedding crouch poses retain a straight cuff
transition. Fixing those requires a separate reviewed cloth drawing or broader
ownership study; extending this local notch correction to them would not be
justified. The default/recommended outfit should not silently replace saved V4
looks, and the candidate should remain opt-in until actual output review.
