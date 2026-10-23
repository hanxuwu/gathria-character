# Five-sprint Kling wardrobe review

This batch continues the two existing Kling characters and the nine-outfit collection. It adds inspection and reusable look workflows, two localized asset revisions, and verified download reuse. Existing character source frames, timing and earlier garment/appearance banks remain unchanged. Technical verification and visual judgment are separate below.

## Open and use

Run `npm ci` and `npm run dev`, then open `/workbench.html?character=female&mode=wardrobe` (or `character=male`).

1. Select an outfit and hairstyle. **Ivory refined** is a separate choice alongside the old **Ivory celebration**. New Ribbon pony selections use its revised bank. Old saved pony projects retain their bytes and offer **Preview updated appearance → Save updated copy**.
2. Pause or use the previous/next frame arrows. **Preview speed** changes preview playback only. **Inspect connections** shows the original and current head, waist or feet in the same source coordinate rectangle. **Save comparison PNG** exports the diagnostic board; regular PNG/CharacterPack exports keep their original pixels.
3. Under **Saved looks**, enter a name and choose **Save look**. This browser remembers up to 12 combinations per character, including exact material revisions, action and facing. Reusing the name replaces that recipe. **Delete** removes the recipe only. Browser data clearing removes recipes; **Save wardrobe** is the portable backup containing the actual artwork.
4. **Cancel preparation** stops a pending selection or appearance preview while retaining the accepted outfit. Downloads show byte progress and reuse verified files in a 96 MiB session cache. Export remains a separate, non-cancellable operation. Preparation/pose validation still takes time on large banks; this change does not promise instant first loads.

Recipes with missing historical/custom material refuse to substitute a newer item. Reopen the original portable wardrobe ZIP in that case. Imported garments must still match the character's source and registration hashes; this is not automatic fitting of an arbitrary clothing image.

## Visual changes

- **Ribbon pony ear area:** a lower front curl divided the original cheek into an isolated peach-colored triangle, and a rear wisp showed below the ear. V2 color subtraction made small holes in the thin strand in actual exports and was rejected as the final visual candidate. V3 restores the original upper sideburn material and removes the traced lower curl/rear fragment. The original face/ear pixels, head placement and large ponytail mass remain authoritative.
- **Ivory waist:** donor skin classification excluded warm ivory sash pixels; subsequent material completion extended dark outline ink into brown triangles. The new donor upper-sash band uses adjacent ivory material, then refits only the owned waist band. Small alpha concavities are completed within that band, excluding head, skin and hands. An initial alpha-only prototype was insufficient and was not shipped.

Actual V2 exports exposed a second waist issue: the repair also protected original leg pixels already hidden under the dress, so one dark corner survived. Final V3 corrects material inside that existing cloth footprint while keeping visible source skin and every head/hand region protected. V2 actual exports remain in `evidence/final`; the final revisions are in `evidence/pony-final-v3` and `evidence/waist-final-v3`.

The [source and processing notes](../../artwork/kling-collection/source/fit-v2/README.md) distinguish supplementary cloth completion from video extraction. `scripts/prepare-kling-collection-fit-v2.py` reproduces V2; `scripts/prepare-kling-pony-occlusion-v3.py` reproduces the final pony revision. No image-generation API was called in this batch.

## Actual export review

The [review folder](review/) contains same-frame 1x/2x full-character comparisons, 2x ear/waist crops, 1x keyframe boards, left/right run comparisons and five-action GIFs. All review pixels come from workbench downloads. GIFs are labeled 0.5x compact previews; one-shot jump/celebrate actions repeat only as part of the review montage. CharacterPacks keep their action semantics and unquantized transparent PNG frames.

| Final look | Actual five-action GIF | Independent CharacterPack |
| --- | --- | --- |
| Honey garden / Ribbon pony V3 | [Right](review/pony-five-actions-right.gif) · [Left](review/pony-five-actions-left.gif) | [ZIP](evidence/pony-final-v3/female-pony-after.character.zip) |
| Ivory refined V3 / Braided crown | [Right](review/ivory-five-actions-right.gif) · [Left](review/ivory-five-actions-left.gif) | [ZIP](evidence/waist-final-v3/female-ivory-after.character.zip) |
| Oat weekend / Airy tousle (unchanged artwork regression) | [Right](review/oat-five-actions-right.gif) · [Left](review/oat-five-actions-left.gif) | [ZIP](evidence/final/male-oat.character.zip) |

Pony: [1x comparison](review/pony-before-after-1x.png), [2x comparison](review/pony-before-after-2x.png), [ear crops](review/pony-connections-2x.png), [keyframes](review/pony-keyframes-1x.png).
Ivory: [1x comparison](review/ivory-before-after-1x.png), [2x comparison](review/ivory-before-after-2x.png), [waist crops](review/ivory-connections-2x.png), [keyframes](review/ivory-keyframes-1x.png).

Capture records and independent-player screenshots are in [evidence](evidence/). Each final look is saved, reopened and restored from a named recipe after reload; editors are then closed before independent playback. `scripts/capture-kling-sprints.mjs` uses actual application UI and library files. The historical pony catalog in its before-case points to the real immutable V1 bank, not substituted artwork. Editable temporary projects are referenced by capture records; the retained recipe JSON, exact source/registration hashes and versioned repository banks preserve the material selections needed to reproduce them.

## Validation and scope

- [Asset verification](asset-verification.json): 96 dress poses protect visible original skin and all head/hand regions; 96 Gentle states and pony pose geometry remain unchanged.
- [Immutable baseline](immutable-baseline.json): 52 pre-existing ZIP assets match their Git blob and SHA-256 fingerprints at `c9867a8`.
- [Export verification](verification.json): decoded PNG/ZIP/GIF content, exact PNG-to-pack frame matching, source pixels outside selected ownership, native transparency, anchors and original action timing.
- [Sprint plan and status](../ITERATION_SPRINTS.md): recoverable stage commits and checks performed this turn. Older collection verification is historical evidence and is not reported as a new test run.
- [This turn's test summary](tests-this-turn.json): 239 full-suite unit tests, 25 final related unit checks, 26 distinct browser cases (with targeted reruns after fixes), TypeScript and production build. Three final looks passed 30 independent action/direction cases; 20 additional cases for the intermediate V2 candidates are retained separately. Test counts from overlapping runs are not added together.

Remaining visual limitations: the near-ear sideburn still has a sharp transition and small donor-edge notches at 2x; source motion blur and matte fringes remain at enlarged scale. Hair follows registered heads without secondary ponytail physics; deep crouches still compress skirt folds and retain an abrupt side-waist turn. These localized revisions reduce free hair fragments and dark waist wedges, but do not claim every difficult pose is seamless or that visual acceptance has been granted. Further silhouettes and material designs are outside this bounded batch.
