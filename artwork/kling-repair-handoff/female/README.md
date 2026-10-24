# Female forearm / bodice repair candidate (V9)

This additive candidate corrects one visible defect in the existing Coral and Ivory dresses: a rectangular peach/coral strip above the crossing near forearm in source run poses **55 and 63**. It keeps the approved Kling face, body, hands, pose and timing. The existing V8 packages remain intact and selectable.

## Cause and correction

`scripts/kling_dress_fit.py::join_bodice()` introduced this strip in V2. It takes the last visible tank pixel in each image column as a hem and blends the skirt/sash color into a band near that edge. When the forearm crosses in front of the tank, that visible edge is an arm occlusion above the actual waist. The blend consequently replaces the original curved, shaded bodice edge with a flat sash-colored strip. The artifact persisted through V8.

The new authoring script `scripts/prepare-kling-female-repair.py` detects the arm-occluded tank edge using the existing immutable `tank`, `nearArm` and `nearHand` masks, plus the registered elbow, wrist and sloped waist. In the reviewed local domain it restores the already prepared V1 bodice RGB, tapering the correction toward the real waist. It does not change the mask, alpha channel, anchors, source anatomy, skirt silhouette, or the previous V8 waist repairs. This is a correction to the blend domain using existing pixels; it is not new anatomy or new generated artwork.

The V1 bodice material was recolored from the original Kling tank while retaining its neckline, contours and shading. Its palette came from the previously generated `artwork/kling-wardrobe/source/outfit-designs.png` artwork. Generated heads, skin and shoes were discarded in that earlier pipeline. V9 invokes no image generation tool and preserves those sources. Exact source, registration, V1 donor and V8 baseline hashes are recorded in [asset-audit.json](asset-audit.json).

## Scope and checks performed for this candidate

| Source pose | Changed RGB pixels per dress | Changed native bounds (exclusive right/bottom) |
| --- | ---: | --- |
| 55 | 451 | `(324, 668)–(388, 685)` |
| 63 | 320 | `(328, 662)–(384, 676)` |

Both packages contain all 96 registered source frames. The script independently reopens the completed ZIPs and decodes every frame, verifying:

- All 192 serialized garment frames equal the intended prepared pixels and ownership masks.
- All 192 alpha channels and ownership masks exactly equal their V8 baselines.
- The other 94 RGBA frames per dress (188 total) are exactly unchanged.
- The changed domain is owned tank cloth and excludes the protected head / hand regions.
- The source frame outside the garment ownership mask is unchanged in the before/after diagnostic compositions.

The garment packages have no independent animation timing. The unchanged source CharacterPack supplies frame order, durations and anchors. The two affected source frames already belong to the original 16-frame run schedule.

## Visual review and files

One local visual trial was necessary. The before/after crops show the flat rectangular strip removed and the original curved forearm-adjacent bodice shading restored in both dresses and both poses. No second trial was made. This is an engineering visual review, not final user acceptance.

- [Ivory, pose 55, 3× local comparison](ivory-wedding-dress-55-detail-3x.png)
- [Ivory, pose 63, 3× local comparison](ivory-wedding-dress-63-detail-3x.png)
- [Coral, pose 55, 3× local comparison](coral-daydress-55-detail-3x.png)
- [Coral, pose 63, 3× local comparison](coral-daydress-63-detail-3x.png)
- [Coral V9 garment package](coral-daydress-v9.zip)
- [Ivory V9 garment package](ivory-wedding-dress-v9.zip)

The PNGs in this folder are **offline diagnostic compositions** of the actual source and prepared garment pixels, with V8 on the left and V9 on the right. They do not claim to be browser exports. The application-export capture and playback evidence for this batch is recorded separately under `docs/kling-repair-handoff/evidence/` (the `female-day` and `female-wedding` cases).

## Remaining limits

This repair does not redesign the dresses or repaint their motion. The source-shaded tank bodice still differs in material treatment from the generated skirt. Other existing arm/waist shapes, broad skirt fitting approximations, and source-video pose variation remain. Those should not be called fixed by this narrow correction. No global skin-color removal or broad silhouette expansion was applied.

Reproduce with the project's Python image dependencies available:

```sh
python scripts/prepare-kling-female-repair.py --prototype
python scripts/prepare-kling-female-repair.py
```
