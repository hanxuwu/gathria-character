# Local donor fitting revision V2

The donors are the existing OpenAI-generated volume-v1 artwork. No new image generation or changes to Kling source frames were made in this revision. The original ZIPs remain immutable.

- Ribbon pony: the traced front curl contained generated jaw-colored pixels inside the hair, beyond the old boundary cleanup. Remove that small donor-only region and the exposed rear wisp below the original ear. Keep the original source ear/face and full ponytail.
- Ivory celebration: the generic donor skin classifier excluded warm ivory sash pixels. Nearest-material completion then extended dark boundary ink into brown waist triangles. Replace that donor upper-sash ink with adjacent ivory material and refit only the owned waist band. Complete small bounded alpha concavities with adjacent cloth, excluding head, skin and hands. This is supplementary cloth completion, not original video data.
- The first alpha-only prototype did not solve the brown marks. The second prototype addresses the material cause. Existing fitted hems and motion registration are unchanged. Deep crouches still compress pleat detail; this is a local improvement, not a new draped-cloth model.

Reproduce with `PYTHONPATH=<Pillow/NumPy/SciPy environment> python3 scripts/prepare-kling-collection-fit-v2.py`. `--prototype` writes explicitly offline contact sheets under `/tmp/kling-collection-fit-v2`; those are not application export evidence. The final browser evidence is recorded under `docs/kling-sprints/`.

The refined pony library has a new bank ID/hash with an explicit previous hash. Saved old projects retain the old bytes until the user previews an update and saves a separate copy. Ivory refined is an additional outfit; the original Ivory celebration preset is retained.

## Actual-export correction: pony V3

The V2 pony color subtraction was not accepted as the final visual result: actual exported source frame 55 showed small holes in the narrow sideburn. The lower front curl also divided the original cheek into a peach-colored island. `scripts/prepare-kling-pony-occlusion-v3.py` returns to the original upper sideburn pixels and removes the traced lower curl that crossed the cheek, together with the rear fragment. The large ponytail, source ear/face and head fit remain intact. This is a change to the hair silhouette/occlusion, not repainting the original face. V1 and V2 banks and intermediate actual-export evidence remain available; the catalog now offers V3, with both prior hashes recognized only for explicit upgrade copies.

The actual ivory V2 export also retained a brown corner in source frame 86: its skin protection included original leg pixels already hidden under existing cloth ownership. The final dress V3 distinguishes visible source skin from material inside the original cloth footprint. It uses the same repaired donor band, protecting all head/hand regions and every visible original skin pixel. Reproduce with `scripts/prepare-kling-collection-fit-v2.py --part dress --dress-version 3`. Both V1/V2 garment bytes remain untouched; the **Ivory refined** preset selects the new V3 item explicitly. Its original hem, anchors and action timing are unchanged.
