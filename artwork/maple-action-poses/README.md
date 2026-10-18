# Maple closed-hand source and registration

Development date: 2026-10-17. Source images were generated with OpenAI image
generation during this development task. No runtime image-generation call is
introduced. Exact prompts and untouched output PNGs are in `source/`.

- `hand-draft.png`: first generated arm/hand source, rejected because the fingers
  still looked relaxed/dangling. Retained for provenance; not used in the packs.
- `closed-fists.png`: corrected isolated near/far closed hands. Only these skin
  pixels contribute new artwork to the final alternate forearms.
- `prompts.json`: exact generation prompts. The first call referenced the prior
  Maple source sheet; the second referenced the rejected hand draft.

The deterministic offline script `scripts/prepare-maple-action-poses.mjs` imports
all original prepared Maple images, rig, motions and top material data. It removes
only material-1 pixels from a *copy* of each forearm, registers the new closed
hand beneath the retained original cuff/sleeve, and marks new visible hand pixels
as material 1. Original base forearms and all other attachments remain intact.
The script records measured source bounds, destination rectangles, binary-alpha
threshold, source hashes and compatibility checks in `prepared/registration.json`.
PNG preparation uses nearest-neighbor sampling on full 192×256 transparent
canvases. The original elbow/wrist source registration stays fixed.

`prepared/` contains the new SkinPack v2, complete editable project, top item v2,
and unchanged v1 trouser/shoe items. The active forearm pair is explicitly selected
for run and jump; idle and walk retain relaxed hands. The top item's two new masks
follow the existing skin/fixed-trim/upper-clothing ownership contract. The legacy
appearance reference alone cannot reproduce Maple; retain the full `.rig.zip`.

Reproduce from repository root:

```sh
node scripts/prepare-maple-action-poses.mjs
node scripts/generate-maple-pose-evidence.mjs
python3 scripts/render-maple-pose-review.py
```

`prepared/diagnostics` contains renderer checks, not presentation evidence.
Actual application exports and player captures are under
`docs/maple-action-poses/final`; see `docs/MAPLE_ACTION_POSES_REVIEW.md`.
