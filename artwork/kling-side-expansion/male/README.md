# Painted male side-view outfit

The design is a warm terracotta short-sleeve collared cotton shirt and warm
stone full-length trousers. `painted-donor.png` was generated on 2026-10-29
with the exact frozen source frame 0 as a visual reference; `donor-prompt.txt`
records the prompt and generation arguments.

The generated character is **only a garment reference**. Its head, face, neck,
skin, hands, shoes, body proportions and pose are never application artwork.
`provenance.json` records manually traced cloth-only contours. The four
`cloth-only-*.png` files show precisely the cloth pixels used for sampling.
Padding is completed from interior cloth; no generated skin or backdrop can
enter a fitted garment.

`scripts/prepare-kling-side-male-clothing.py` registers this painted cloth to
the exact native 512×768 source poses. The source supplies all anatomy and
motion. The script creates actual short sleeves and long trouser coverage,
with a small explicit cloth allowance outside the body silhouette. It never
warps a source body part, moves an anchor, retimes a frame or generates an
intermediate pose.

The original shoe masks are conservative. Five reviewed source poses use
explicit shoe-only contours to preserve missing toe, heel or tucked-shoe
regions; their native coordinates are recorded in `provenance.json`. No broad
color flood is used to infer footwear. A few pink video-spill islands on actual
calves/thighs use the independent source skin proof inside the reviewed leg
surface, ending before its ankle attachment.

The final running-hand repair retains the accepted cloth outside its local
contact region. Two source-measured leg-width hints prevent hand segmentation
from rescaling distant trouser texture. `stable-outer-cloth-pixels.json` stores
27 accepted shirt pixels and two trouser pixels for frame 56, bound to the
source frame and prior painted garment hashes. The authoring script uses this
small retained cloth record and still rejects ownership of protected pixels;
it does not depend on temporary checkpoint images.

The original source ZIP and registration remain immutable. New clothing binds
to the separately reviewed registration in
`artwork/kling-side-expansion/templates/male.registration.json`; strict
head/hand protection checks remain enabled. This separate candidate corrects
original hand/head polygons that accidentally covered thigh or shoulder skin.

```sh
python scripts/prepare-kling-side-male-clothing.py --preview-only \
  --registration artwork/kling-side-expansion/templates/male.registration.json
python scripts/prepare-kling-side-male-clothing.py \
  --registration artwork/kling-side-expansion/templates/male.registration.json
```

The final garment IDs are `side-male-oxford-shirt-v1` (top) and
`side-male-stone-trousers-v1` (bottom). Their source-bound archives are
`docs/kling-side-expansion/assets/male-shirt.garment.zip` and
`male-trousers.garment.zip`. Per-frame checks and offline review images are
under `docs/kling-side-expansion/male/`. Application exports are reviewed
separately from these authoring previews.
