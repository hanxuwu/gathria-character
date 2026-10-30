# Native hairstyle match references

These are exact existing-image crops and archive decodes. No new artwork, source body rescaling or smoothing was performed. `references.json` records file hashes, native frame IDs, source video indices, canvas sizes, padding and crop coordinates. `extract-references.py` reproduces them.

## Use for generation

For each character, use `{character}-original-head-native.png` as the hairstyle design authority and `{character}-side-bald-head-native.png` (or full `-side-bald-standing.png`) as the exact side-view head/face/ear/neck target. The side target is intentionally bald. `*-side-bald-head-roomy-native.png` provides a larger 370×370 native crop, source rectangle (60,150)–(430,520), with more transparent room for the correct full hairstyle. Do not use the previous side crop/bob as a hairstyle reference.

The original references use natural source facial expression with the accepted fitted hair on native pose 0; they come from prior renderer evidence in `artwork/dual-looks/appearance/runtime/{character}-original/0-natural.png`. They show the same original-view hair as the actual complete-look export without allowing changed clothes to obscure the nape. Full copies are `*-original-natural-standing.png`; `*-original-bald-standing.png` additionally records the untouched source pose.

Original pose 0 is source video frame 336 at 14.00s for both characters. Side male pose 0 is source 240 at 10.00s; side female pose 0 is source 243 at 10.125s. Original source is 704×1056, and the existing appearance renderer adds 32px left/right +128px top to 768×1184 without scaling source pixels. Side source is 512×768 with zero padding.

`*-original-donor-portrait.png` is a crop of the older generated design sheet. It is useful for hair painting quality, but its generated face/ear is not an authorized replacement for the native character. `*-original-hair-front-native.png` and the male back layer are the actual fitted hair-only patches in the same head-crop coordinate system.

## Visual authority: male side-part

- A rounded, broad, swept volume; a raised front/top ridge with a clear side part toward the front/right of the head in this view.
- Several **large flowing curved locks**, swept backward over the near temple. Keep coherent broad highlight bands and dark separations between large clumps.
- The front forelock curls outward slightly; the crown/back should not become a row of small spikes or messy short crop tufts.
- Near-ear hair partly covers the top of the ear; the short sideburn stops above the earlobe. The visible original ear stays connected to the face. The rear silhouette wraps close behind the ear/nape without a square notch.
- Warm chestnut base, copper highlight bands, dark brown outlines and underside shadow. Preserve the broad volumes in side view rather than introducing many fine strands.
- The approved drawing is visibly fuller and more swept than the old prompt's phrase “tidy short”; follow the actual native reference, not that stale text alone.

Source lineage: generated 1774×887 `artwork/kling-appearance/source/expansion-design.png`, left portrait; prompt `expansion-prompt.txt`. Reviewed front/rear donor polygons and fits are in `scripts/kling_hair_expansion.py`, published by `append-kling-hair-expansion.py`. Current source bank is `docs/kling-expression-refined/banks/male-base.zip`, selected `side-part`; PR59's `docs/dual-looks/assets/male-original.appearance.zip` repacks that selection without repainting it.

## Visual authority: female soft-bob

- A rounded, compact short bob, with broad smooth side-swept fringe and a small visible side part near the upper front/right.
- Near ear is largely visible with a thin temple lock; the back/near-side bob tucks around the ear and ends close to the jaw/ear line, clearly **above the shoulder**.
- Do not extend the back toward shoulder length or add a dangling lock under the chin. Do not turn the short bob into a medium bob, blunt shoulder cut, ponytail or bun.
- The far-side face-framing curve may remain near the jaw, but it must not leave a disconnected brown patch on the neck/collar during a crouch.
- Same warm chestnut palette and broad lock highlights as the original; smooth rounded volume, not flat helmet shading or many narrow streaks.

Source lineage: generated 1774×887 `artwork/kling-appearance/source/soft-bob-design.png`, right portrait; prompt `soft-bob-prompt.txt`. Reviewed hairline mask is in `prepare-kling-appearance.py`; donor-edge and ear corrections are in `kling_hair_donor_mask.py`, `kling_hair_ear_fit.py` and metadata revisions. Current source bank is `docs/kling-expression-refined/banks/female-base.zip`, selected `soft-bob`; PR59's `docs/dual-looks/assets/female-original.appearance.zip` repacks that selection without repainting it.

## Static acceptance before animation

1. Present original and new side **heads at a comparable reference head size**, with unchanged source faces. Also show same-height full figures using one fixed scale per source, not per-frame alpha-bound normalization.
2. Check the same partition, fringe direction, major clump pattern, ear exposure, short nape length and color family. Different projection should explain residual silhouette differences; a different haircut should not.
3. Inspect original source / new hair overlay / hair layers separately. Extract only new hair from any generated portrait; generated skin, ear, neck, eyes and clothing are discarded.
4. On side poses 0, run key poses, and crouch/jump 77, verify that neck/collar foreground occludes inappropriate front locks. A rectangle surrounding head and neck is not a sufficient anatomical foreground rule.
5. Preserve actual source timing and character proportions. Do not “match” the two hairstyles by distorting the face or drawing the same three-quarter hair asset over a side head.

## Why the previous pair was inconsistent

The old side hair was separately generated in `artwork/kling-side-expansion/hair/source/design.png`, fitted by `scripts/prepare-kling-side-hair.py` as `side-swept-crop` / `side-tucked-bob`. It is a different donor, with different cuts. Mapping those native IDs to logical `daily-hair` did not establish visual identity. Reusing those old donors as the new shape reference would repeat the problem.
