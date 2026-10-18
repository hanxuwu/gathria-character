# Theo and Rose: reference-guided character pair

Development date: 2026-10-18 UTC. These are development-time illustration
sources for the existing 192×256 shared humanoid skeleton. The browser does
not call an image model or infer body parts.

## Original sources

Three OpenAI image-generation calls produced the untouched transparent PNGs
in `source/`. Exact prompts are retained in `source/prompts.json`.

- `pair-design.png`: two complete character designs and three full expression
  heads per character. User-provided groom and coral-dress sprite sheets guide
  the rounded proportions, grouped brown hair, warm lighting and clothing.
  Those reference images are not bundled in the repository or exported packs.
- `theo-clothing.png`: isolated navy suit torso, arms, trouser parts, brown shoes
  and active forearms. It uses the new pair design as its visual reference.
- `rose-clothing.png`: isolated coral bodice, puff sleeves/arms, skirt, rear hair,
  bare legs/socks, brown shoes and active forearms, using the same design.

Theo has short fluffy chestnut hair, a navy suit, ivory waistcoat and rose tie
and boutonniere. Rose has long wavy chestnut hair, a floral hair clip, coral
dress, ivory puff sleeves and brown Mary-Jane shoes. Each identity supplies
neutral, gentle and joyful complete heads. The registered Rose outfit omits
the concept sheet's bag and crossbody strap: the current item contract has no
accessory attachment, and a strap crossing independently moving parts needs
a separate ownership and deformation design. The dress is otherwise retained.

## Preparation and use

[`prepare-reference-pair.mjs`](../../scripts/prepare-reference-pair.mjs)
registers explicit source regions, joint overlap and semantic material masks
offline. Prepared identities and garments reuse the existing skeleton, renderer
and idle/walk/run/jump motion library. They are new library entries; existing
identity, wardrobe, skin and legacy artwork files remain unchanged.

Open `prepared/theo.rig.zip` or `prepared/rose.rig.zip` in Skin Studio to use an
editable complete look. Each project embeds both identities and all six clothing
items. The separate `*.identity.zip` and `*.wardrobe.zip` files can be imported
and selected independently. Importing an identity only adds it to the library.

```sh
node scripts/prepare-reference-pair.mjs
node scripts/generate-reference-pair-evidence.mjs
python3 scripts/render-reference-pair-review.py
```

`prepared/registration.json` records source hashes, extraction regions,
registration and material ownership. `prepared/diagnostics` is technical render
output. Actual application exports and review media are separately recorded in
[`docs/reference-pair/final`](../../docs/reference-pair/final/).

This is AI-assisted source illustration with deterministic technical preparation.
Generated source boards are not evidence of the assembled character's animation
quality. The shared rig does not provide the reference sheets' individually
redrawn hair/skirt poses, props or celebration gestures. User visual acceptance
is still pending.
