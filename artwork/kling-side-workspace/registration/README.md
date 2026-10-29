# Side-source wardrobe registration candidate

These guides and masks are authored for the frozen four-action source packs in
`docs/kling-side-workspace/assets/`. They do not replace the existing front-view
wardrobe or change source RGB, alpha, timing, canvas, or animation poses.

- Male: 107 source frames, 24 native keyposes inspected.
- Female: 102 source frames, 27 native keyposes inspected, including extra run
  crossings and the second jump's raised arms.
- Every frame has all 17 v1 wardrobe anchors. Visible joint centers are visual
  estimates; hidden shoulders/hips/limbs are explicitly occluded and low
  confidence. Local optical flow proposes intermediate guides. The two waist
  points come from each actual tank contour. Foot guides that otherwise leave
  the source are projected to the observed shoe contour and audited.
- `registration.json` contains only the existing v1 contract fields, including
  exact source-pack SHA, character ID, source frame, 512×768 size and (256,710)
  anchor. The keypose inputs are also bound to that exact source-pack SHA.
- `masks/NNNN-{top,bottom,shoes}.png` are native-size binary ownership masks for
  the existing tank, shorts and shoes. Connected material interiors compete
  with skin for a small local outline neighborhood. Warm cloth is recovered
  only while connected to an observed neutral tank region. Masks are disjoint,
  remain inside source alpha and exclude head/hand protection and skin seeds.
- Final ownership excludes the exact `protection.ts` pixel-center scanlines,
  plus a two-native-pixel outward guard. Registration protection polygons stay
  unchanged; no runtime protection threshold is relaxed.
- `masks/NNNN-skin.png` is an **independent, partial skin proof mask** from source
  warm-color/alpha seeds, not the inverse of garment ownership. It does not
  prove all skin is covered: pale highlights, facial ink/eyes, blur and ambiguous
  boundaries can fall outside it. Head/hand polygons supply additional
  protection; occluded hands have no fabricated polygon.
- `reviewedMaterialOverrides` in each frame audit records narrow, source-bound
  material polygons, including their exact raster rule and number of raw warm
  skin-seed pixels excluded. Male source242 contains a reviewed warm tank
  interior and purple shorts-seam correction. Male source200 corrects a white
  raised heel island previously assigned to the tank; its two waist guides now
  follow the true tank hem. These independently inspected cloth/shoe regions
  are disclosed exclusions from the partial skin proof, not hidden skin edits.
- All masks preserve existing clothing silhouettes. They authorize material
  replacement of existing cloth, not new sleeves, hidden limbs, or new body
  shapes. Uncertain boundary pixels can retain their original material.

`audit.json` records per-frame source RGBA hashes, material mask hashes, original
source/video-frame mapping, tracked seed distance, foot corrections and checks.
`docs/kling-side-workspace/registration-review/` contains every native overlay,
all action contacts and native keypose pages. Pink points are visible estimates,
orange points are occluded estimates, green outlines are protected regions;
cyan/purple/green fills are top/bottom/shoe ownership.

Regenerate with Pillow, numpy, scipy and opencv-python-headless installed:

```sh
python scripts/prepare-kling-side-registration.py \
  --repo-root /path/to/source/repo --output-root /path/to/output/repo
```

The script only reads frozen packs under `--repo-root`; all generated output
lands under `--output-root`. Source images and videos remain immutable.
