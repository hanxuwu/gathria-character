# Dress outline fitting revision 3

This revision reuses the recorded generated garment design in
`artwork/kling-wardrobe/source/outfit-designs.png`. No new image generation,
character artwork, pose, registration or body transformation is introduced.

Revision 2 fitted extra skirt clearance by stretching its outer 24 painted
pixels. This stretched the outline together with the cloth, creating a heavy
dark band in raised-thigh and crouched poses. Revision 3 moves the outer six
pixels as an intact strip and fits the required width through the remaining
interior cloth. Premultiplied RGB sampling keeps transparent black pixels from
darkening that sampled edge.

The accepted V2 alpha, silhouette, ownership masks, native positions, hem and
waist remain identical. Only cloth RGB inside the existing side-fit band changes.
Old archives remain byte-identical; new IDs are `coral-daydress-v3` and
`ivory-wedding-dress-v3`. Older saved projects retain their embedded garments.

Reproduce with:

```sh
python3 scripts/prepare-kling-wardrobe-dresses.py --fit-revision=3
python3 scripts/test_kling_dress_fit.py
python3 scripts/verify-kling-dress-outline.py
```

Preparation still defaults to revision 1 and supports revision 2. The recorded
reviewed per-frame masks are required, as documented in the wardrobe authoring
kit. `verification.json` checks the packaged authoring assets; browser-export
evidence is recorded separately in the current batch review.

This correction does not redraw the waist or simulate fabric. The existing
bodice shading, broad waist blend, fitted folds, source motion blur and small
painted edge irregularities remain visible. It is a focused outline improvement,
not a claim of complete visual acceptance.
