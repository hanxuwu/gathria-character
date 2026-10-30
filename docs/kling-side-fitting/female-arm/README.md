# Female sleeve and forearm diagnosis

This pass isolates the blouse from the skirt before changing either asset.
The squared lower forearm at run frames 39 and 49 is **skirt ownership**: the
bottom fitter truncated its foreground-arm mask at a horizontal wrist height.
The original source and the blouse-only reconstruction contain the complete arm.
Tight source-contour traces were handed to the skirt pass; no registration or
protected-hand mask is weakened to address that problem.
The [source / blouse / skirt / combined comparison](ownership-diagnosis.png)
shows that distinction before either repair, at the same native frame and crop.

The blouse has a separate defect. Its whole-torso affine fit uses the visible
waist width. A crossing foreground arm hides much of that width at frames 38,
39 and 49, shrinking the puff sleeve and moving it onto the chest. The same
method produces an oversized sleeve at frame 50. The original donor's hidden
bodice completion can also paint over part of the source near forearm.

## Retained correction

The existing painted forward-pose donor supplies one isolated puff sleeve and
its drawn cuff. Its cloth anchors follow the source shoulder/upper arm through
all 18 run frames, independently of the occluded torso width. The existing
torso/neckline fit is retained. Source arm pixels that had been assigned to the
old misplaced sleeve are restored locally; the new sleeve then covers only its
explicit cloth area. This is fitting and ownership correction, not body warping
or generated replacement skin. The donor's skin below the cuff is discarded.

All 84 idle, walk and jump blouse frames remain exact in reconstructed native
RGBA. Source frames, face/body proportions, timing, registration and strict
head/hand protection remain unchanged. The silhouette extends at the new puff
sleeve, as intended for this loose garment; it does not change the source arm.

The full-top affine trial was rejected because it distorted the neckline and
chest. The first independent sleeve trial left a bare shoulder gap and was
also rejected. The retained pass fits the full 18-frame run cycle so the local
repairs do not introduce isolated small/large sleeve substitutions.

## Reproduce and inspect

```sh
python scripts/polish-kling-side-female-sleeves.py
```

The script reads the pinned `220ea2f` blouse from Git and the pinned existing
painted donor, so reruns cannot accumulate deformation. It never regenerates
the other clothing assets. The [cloth anchor recipe](../../../artwork/kling-side-fitting/female-arm/sleeve-fit.json)
records source hashes, the donor cut and the source-inspected fit overrides.

- [Same-frame cuff details at integer 2×](cuff-details-2x.png)
- [Full right run, blouse only](run-top-compositor-right.gif)
- [Full left run, blouse only](run-top-compositor-left.gif)
- [Exact changed-frame / source-protection audit](audit.json)
- [Strict package audit](pack-audit.json)
- [Byte-exact rerun check](reproduction.json)

These images are decoded garment-compositor diagnostics. The parent review's
actual workbench exports provide full-outfit acceptance. GIFs use a shared
indexed palette with 10 ms duration rounding; native PNG and V1 package pixels
remain the lossless reference.

## Remaining limits

The far sleeve and torso still use existing pose donors and can change shape
at donor boundaries. This pass does not add cloth simulation or new source
poses. The lower-forearm notch needs the separate skirt correction; blouse-only
tests must not be reported as proof that the combined outfit fixes it. Source
blur and matte edges remain visible at high magnification.
