# One body, eight modular looks

This is a bounded production-template trial on main `0a0fc06`: two separately
authored hair overlays over one three-expression face bank, two tops, one
trouser set and two footwear designs. Each playable project uses the same
Theo V6-family anatomical chains and exact original four-action motion data.

## Source and preparation

- [New face/hair sheet, prompt and hash record](source/README.md).
- Tops: Ravi utility jacket and Lina pullover from
  `../character-roster/prepared/tops/`, registered onto Theo's arm chains.
- Trousers and boots: the selected items embedded in
  `../../docs/theo-ankle-follow/final/theo-ankle-follow.rig.zip`.
- Sneakers: Sage's portable source from
  `../character-roster/prepared/garments/sageShoes.wardrobe.zip`, fitted to the
  same body. The original frontal near-shoe source is retained in the rejected
  source-axis trial; the final pair uses the source's three-quarter shoe view.

Original garment files and runtime modules remain unchanged. New derivative
IDs opt into existing item V3/V4/V5 contracts. Face/hair separation is retained
in source files and compiled offline into existing IdentityPack V1 variants;
Skin Studio selects those variants through its identity control.

## Rebuild and validate

Use the repository's pinned Node environment, `npm ci`, and a Chromium browser.
The scripts default to `/usr/bin/chromium`; `CHROMIUM_PATH` can select another
installed binary. Each script starts and closes its own local Vite server.

```sh
node scripts/prepare-standard-kit-garments.mjs
node scripts/prepare-standard-kit-identities.mjs
node scripts/assemble-standard-kit.mjs
node scripts/validate-standard-kit.mjs
node scripts/generate-standard-kit-evidence.mjs
python scripts/render-standard-kit-review.py
```

The review renderer needs Pillow. The evidence script refuses to
overwrite an existing phase. Preserve earlier outputs and use its documented
`EVIDENCE_PHASE=iterations/<name>` option for another capture. Prepared source
outputs are reproducible development artifacts; historical kit versions should
be retained in Git before making a new preparation revision.

`prepared/head-registration.json` records the source cells, face and hair
transformations, binary-alpha threshold, source hashes and shared-face checks.
`prepared/garments/registration.json` records part ownership, transforms, exact
source joints, final joints and garment fit diagnostics. `prepared/assembly.json`
records the eight complete recipes, input hashes, body/motion reference and all
source-frame bounds. Each project embeds both identities and all five garment
items, including currently unselected choices.

Prepared diagnostic images are renderer-development checks. The authoritative
review images and animation previews come from [actual Studio exports](../../docs/standard-kit/README.md).
The [authoring contract](../../docs/STANDARD_CHARACTER_KIT.md) explains the
reusable rules and the limits of this calibrated body family.
