# Rear hair fit and three-color audit

The concrete repair is male **pack frame 67 / video source frame 210**, during
the first jump's compressed blink pose. The painted rigid hairstyle missed the
rear skull contour, exposing a broad peach strip behind the ear. Inspection of
the front/back layers and registered head showed this was a hair fit problem,
not an incorrectly protected ear or an absent source layer.

[Same-frame native-detail comparison at integer 2×](male67-rear-2x.png) and
[neighboring poses 63–69](jump-neighbors.jpg) show the bounded repair. These are
compiled-bank inspection images; actual application exports are reported in the
[parent review](../README.md).

## Repair and reproduction

Only the existing painted rear hair strip is resampled. Each horizontal strip
keeps its ear-side endpoint fixed and extends toward the rear skull, with a
smooth vertical taper and a maximum 14-pixel mapping displacement. The native
hair envelope expands six pixels at its leftmost extent in this pose. The face,
ear, neck and original body are never warped or redrawn. An earlier uniform
translation trial moved the ear cutout and was rejected.

The source-pinned original hair for this one pose and the exact recipe are in
`artwork/kling-side-polish/hair/`. Run:

```sh
python scripts/polish-kling-side-hair.py
node scripts/verify-kling-side-hair-polish.mjs
```

The Python step requires NumPy, Pillow and OpenCV (the existing preparation
module additionally imports SciPy). It starts from the accepted compiled PR53
bank at commit `4fd27f9` or this corrected bank, validates every unrelated native
hair layer against persisted hashes, and always reapplies the correction from
the saved original pose. It does not accumulate deformation on repeated runs.
The original bank is available in repository history; no `/tmp` input is needed.

The original broad preparation script remains the donor-authoring workflow.
Re-running feature extraction with different OpenCV versions can change derived
pixels across many poses. This local step deliberately rejects such unrelated
changes instead of silently replacing a reviewed hairstyle.

Male registration was rebound to the reviewed walk-hand correction without
recalculating any head transform. The female appearance bank is unchanged.

## Technical checks from this iteration

- Male bank: `e259260d9d917bf7bb30e71dd22349f0d6a0af138e5f091840866b30eac4f5f6`.
- Male registration: `e4dc7c47dd3111a6a4941174a020fbec8d45ab7ead3fba1db0d91cdbb4e1aa31`.
- Female bank: `e09b5bdd06aed7053198ada973f657aef34ea6767d732a9a3d7da532b16784af`.
- [Local fit audit](male-fit-audit.json): 106 male native hair frames stay byte
  exact; frame 67 changes 2,910 rendered pixels. All 107 poses retain original
  opaque facial-core/foreground pixels and all RGBA outside hair ownership.
- [Strict runtime audit](runtime-audit.json): the real TypeScript source/bank
  parsers and `AppearanceRenderer` accept both banks and check **209 poses ×
  chestnut/espresso/copper = 627 color poses**. Opaque facial core, foreground
  and all original RGBA outside hair remain exact in every color. Mirror and
  downloadable GIF checks belong to the separate actual-UI export verification.
- Native edge clearance remains at least 34 pixels for the male and 17 for the
  female. No new canvas cutoffs, source frame changes or timing changes.

These are current checks, not inherited test counts from the original candidate.
The local audit uses the offline compositor; the additional runtime audit uses
the application renderer. Neither alone establishes visual acceptance.

## Visual review and remaining limits

The prominent rear-scalp strip is covered, the ear-side hair opening keeps its
shape, and adjacent poses retain their previous silhouettes. A small lower nape
transition remains; further enlargement would noticeably change this short
haircut. The very compressed source face is blurred, so sharp painted hair is
still stylistically clearer than that one source drawing. No source blur or
matte fringe was removed.

Female difficult-pose ears and foreground-arm overlaps were reviewed alongside
the male. There was no comparably clear defect that justified changing her
accepted hair; her entire appearance ZIP remains byte exact. Her bob still
follows the head without independently simulated secondary motion. Original
shoulder/hand occlusion can make its lower overlap abrupt when arms rise.
