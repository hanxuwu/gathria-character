# Complete paired looks: appearance assets

This batch selects one existing hairstyle per character and view, adds a restrained native side-view smile, and binds those assets to the already reviewed daily-clothing registrations. It does not redraw either Kling character or transform original frames into another view.

| Character | Original-view hairstyle | Side-view hairstyle | Original expression | Side expression |
| --- | --- | --- | --- | --- |
| Male | `side-part` | `side-swept-crop` | Existing `gentle-v2` | New `gentle-side-v1` |
| Female | `soft-bob` | `side-tucked-bob` | Existing `gentle-v2` | New `gentle-side-v1` |

Natural appearance remains an explicit null selection. Chestnut, espresso and copper use the existing appearance renderer's hair-only tint. The native drawings have corresponding cuts, not an exact turnaround-model guarantee: highlights, fringe shapes and bob length differ between the independently authored views.

## Existing artwork and binding proof

Original-view hair and the refined smile come from `docs/kling-expression-refined/banks/{male,female}-base.zip`. Native side hair comes from `docs/kling-side-expansion/assets/{male,female}.appearance.zip`, including its previously reviewed local corrections. The original hair donor sources and authorship remain documented in `artwork/kling-appearance/`, the original appearance revision records, and `artwork/kling-side-expansion/hair/`. No new hair or whole-face generation was performed for this batch.

`scripts/prepare-dual-looks-appearance.py` retains only the selected two styles and repacks their atlas rectangles losslessly. Original selected patch RGBA, ownership, native offsets, source-mode entries, pose metadata and padding remain exact. Unselected styles are not silently presented as newly reviewed choices.

Original-view clothing registration differs from the released appearance registration at male native ID 54 and female IDs 36, 37, 47, 48, 53 and 54. These are the prior clothing repair's hand contours. Before creating a new bank binding, the publisher checks all other registration fields, source hashes, source-frame mappings, every anchor and head-protection polygon for equality. It rasterizes the changed hand regions and proves zero intersection with every selected hair and face ownership mask. The side registrations already match the native side hair banks exactly.

The four `appearance/*-binding.json` records bind the source-bank SHA-256, old and current registration hashes, new bank hash, exact-copy checks and per-frame changed-protection intersections. This is an offline, source-specific review; there is no runtime hash rewrite or generic migration permission. Existing banks and registrations remain unchanged.

## Side-view smile

See [the side-expression source and review](side-face/README.md). The approved variant slightly widens the actual closed mouth and lifts its corners using compact source-pixel sampling. Eyes, brows, nose, ear/jaw silhouettes, source alpha and motion timing are unchanged. The first trial that thickened the mouth stroke was rejected.

There are 107 male and 102 female native poses. Each character retains ten source faces for blink/half-blink or uncertain/blurred mouth poses. The two nearest supported poses taper toward those retained drawings. The source already smiles naturally, so the new choice is intentionally subtle. It is not a replacement facial identity or a new lip-sync system.

The existing original-view `gentle-v2` has its own established behavior: it retains blink **eyes**, but may keep the refined mouth during a blink. Celebration laughter uses explicit source entries. The new side treatment preserves the entire face on its declared fallback frames. The two views are not forced into a shared expression phase.

## This batch's checks

- All four newly packaged banks reproduce byte-for-byte, including their catalog.
- All 393 native poses were rendered through the strict existing source parser, appearance parser and `AppearanceRenderer` in three hair colors, with natural and gentle face: 2,358 render combinations.
- Opaque pixels outside each existing validated head/hair-occlusion envelope remain exact. All pixels outside selected appearance ownership remain exact, including invisible RGB. Existing original hair permits a previously declared scalp fringe of at most three native pixels at the top and sides; the lower head boundary does not expand.
- Rear hair can correctly contribute behind semitransparent outline pixels. An opaque source body/hand pixel remains unchanged; source-transparent surroundings may acquire hair. This is not a claim that every antialiased boundary stays identical after adding a background layer.
- The source expressions' 382 side-face patch/mask/metadata files reproduce exactly. Eight offline source/smile review GIFs decode successfully.

`appearance/runtime/original-audit.json` and `side-audit.json` record this run. Their native PNGs are renderer-level asset checks, **not UI export evidence**. Final clothed PNG/GIF/CharacterPack validation is separately produced through the workbench under `docs/dual-looks/review/`.

## Rebuild

The side-expression authoring step needs NumPy, Pillow, SciPy and OpenCV (`opencv-python-headless`); the atlas publisher needs NumPy and Pillow. The image data is stored in the repository and no generation service is called. This run used Python 3.12.14, NumPy 2.3.5, Pillow 12.3.0, SciPy 1.17.0 and OpenCV 5.0.0. The renderer audit uses the repository's Node dependencies.

```sh
python scripts/prepare-dual-looks-side-face.py
python scripts/prepare-dual-looks-appearance.py
python scripts/prepare-dual-looks-appearance.py --check
node scripts/verify-dual-looks-appearance.mjs --view=original
node scripts/verify-dual-looks-appearance.mjs --view=side
```

The authoring runtime in this session had OpenCV installed in an isolated `/tmp/dual-side-face/python` directory, so the first command was run with that directory in `PYTHONPATH`. A normal compatible OpenCV installation works as well. The temporary install path is not a required asset source.

## Visual limits

The existing hair follows its native head fitting; it has no independent secondary-motion simulation. Original-view bob and side-view bob have different native artwork and slightly different lengths. Blur in the Kling source remains; hair may look sharper than the face during compressed jump drawings. Some existing hair/nape silhouettes remain fitted. Side gentle is small, and cannot repair ambiguous source mouths or invent hidden features. Judge the final clothed animation from the actual application exports, independently of these numerical preservation checks.
