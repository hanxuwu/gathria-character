# Portable Maple and Willow sources

Development date: 2026-10-17 UTC. These are development-time source assets for
the shared 192×256 humanoid skeleton, not runtime image-generation inputs.

## Original artwork

- `source/willow-design.png`: one complete Willow character and three complete
  expression heads, generated with OpenAI image generation. The retained Maple
  source sheet supplied the style and proportion reference. Willow has a rounded
  wavy bob, a plum cardigan, olive trousers and cream sneakers.
- `source/willow-clothing.png`: a second generated sheet of detached cardigan,
  arms, hips, trouser legs and shoes, using the complete Willow design as reference.
- `source/prompts.json`: exact prompts for both calls. The original output PNGs
  are retained without modification.
- Maple's three heads are reused exactly from the preceding
  [Maple project](../maple-action-poses/README.md). Maple receives new semantic
  masks, not a new drawing. Its original source remains in
  [`generated-traveler/source`](../generated-traveler/source/).
- Willow's active hands reuse the retained
  [`closed-fists.png`](../maple-action-poses/source/closed-fists.png) source.
  Preparation adjusts the hand source palette and registers it beneath the
  Willow cuffs. The relaxed base hands remain in idle/walk.

## Technical preparation

[`prepare-portable-identities.mjs`](../../scripts/prepare-portable-identities.mjs)
uses explicit source regions and destination rectangles, selects each isolated
part's connected component, thresholds alpha at 192 and samples with nearest
neighbors. This removes the generated sheets' translucent halos. It does not
infer parts in the browser. The hip plate is trimmed to an overlapping bridge,
and leg opening rims are removed so static partial trouser ends do not remain
above moving legs. Arms and legs retain overlap at their source joints.

Measured face, ear, neck, hair, eye and mouth regions define source-specific
semantic masks. Fixed facial details remain authored when skin/hair is recolored.
These decisions and material counts are recorded in `prepared/registration.json`
alongside source hashes, component bounds, targets and output hashes. Identity
heads retain their authored RGBA exactly at their declared source colors.

The generated character does not add a renderer branch: both identities reuse
the existing rig, bindings and idle/walk/run/jump motion data. Each identity owns
three complete heads; clothing remains in separate reusable top/bottom/shoe
items. The prepared projects embed both identity and clothing libraries so they
can be reopened without fetching external assets. Earlier flat Maple files stay
unchanged and do not silently acquire a wardrobe recipe.

## Reproduce and use

```sh
node scripts/prepare-portable-identities.mjs
node scripts/generate-identity-evidence.mjs
python3 scripts/render-identity-review.py
```

Open `prepared/maple.rig.zip` or `prepared/willow.rig.zip` in Skin Studio for a
complete editable look. Import `*.identity.zip` to add an identity to another
project without changing its current canvas; explicitly select it to use it.
Import `willow-{top,bottom,shoes}.wardrobe.zip` for the separate garments.

`prepared/diagnostics` contains technical renderer output. Review evidence comes
from actual application exports under
[`docs/portable-identities/final`](../../docs/portable-identities/final/).
See the [review](../../docs/PORTABLE_IDENTITIES_REVIEW.md) for checks and limits.
This is AI-assisted artwork with deterministic technical preparation, not a claim
of hand-painted source illustration or user visual acceptance.
