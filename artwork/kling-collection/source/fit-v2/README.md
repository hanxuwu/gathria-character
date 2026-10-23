# Local donor fitting revision V2

The donors are the existing OpenAI-generated volume-v1 artwork. No new image generation or changes to Kling source frames were made in this revision. The original ZIPs remain immutable.

- Ribbon pony: the traced front curl contained generated jaw-colored pixels inside the hair, beyond the old boundary cleanup. Remove that small donor-only region and the exposed rear wisp below the original ear. Keep the original source ear/face and full ponytail.
- Ivory celebration: the generic donor skin classifier excluded warm ivory sash pixels. Nearest-material completion then extended dark boundary ink into brown waist triangles. Replace that donor upper-sash ink with adjacent ivory material and refit only the owned waist band. Complete small bounded alpha concavities with adjacent cloth, excluding head, skin and hands. This is supplementary cloth completion, not original video data.
- The first alpha-only prototype did not solve the brown marks. The second prototype addresses the material cause. Existing fitted hems and motion registration are unchanged. Deep crouches still compress pleat detail; this is a local improvement, not a new draped-cloth model.

Reproduce with `PYTHONPATH=<Pillow/NumPy/SciPy environment> python3 scripts/prepare-kling-collection-fit-v2.py`. `--prototype` writes explicitly offline contact sheets under `/tmp/kling-collection-fit-v2`; those are not application export evidence. The final browser evidence is recorded under `docs/kling-sprints/`.

The refined pony library has a new bank ID/hash with an explicit previous hash. Saved old projects retain the old bytes until the user previews an update and saves a separate copy. Ivory refined is an additional outfit; the original Ivory celebration preset is retained.
