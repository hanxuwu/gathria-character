# Portable character identity v1

An identity supplies registered heads and optional back hair independently of
clothing. Importing an identity adds it to the current project's library; it
does not replace the current picture. Explicit selection composes it with the
current wardrobe. A flat imported skin has no clothing recipe, so **Use identity
in new look** starts a new default outfit. Undo restores the original flat skin.

Download an identity template in Skin Studio, replace its artwork and masks, set
a new `custom-` ID/name/provenance, and import the ZIP. New identities do not need
a runtime rendering branch. They do need offline preparation for this rig's
proportions, neck registration, part ownership and overlap; arbitrary full-body
images are not automatically segmented or bound.

## ZIP members

```text
identity.json
TEMPLATE.md                     optional authoring instructions
artwork/head-neutral.png
artwork/head-gentle.png
artwork/head-joyful.png
masks/head-neutral.png
masks/head-gentle.png
masks/head-joyful.png
artwork/back-hair.png            optional paired part
masks/back-hair.png
```

All PNGs use the complete **192×256** canvas, binary alpha and transparent frame
margins. Heads include face, ears, front hair and the short registered neck.
No torso, arms or clothing belong in an identity. All expressions must retain
the same identity and neck placement. The fixed rig family is
`gathria-v6-humanoid-1`, ground anchor **(96,240)**, neck registration **(96,118)**.
Jaw binding and hair sway are explicit bounded metadata, not inferred from PNGs.

Masks have the exact artwork alpha. Their RGB is `(material,0,0)`: **0** fixed
eyes/outlines/details, **1** skin, **2** hair. Transparent pixels are all zero.
Prepare ownership masks deliberately, especially around irises, brows, ears,
sideburns and neck shadows. The runtime does no color classification. Declared
source skin/hair colors must match every part and the compatibility appearance
reference. At those colors, authored identity pixels are preserved exactly;
other colors use a continuous deterministic adjustment relative to that source.

Use template-generated metadata: the validator requires exact fields and checks
slots, palette, format, version, rig family, dimensions and bounds. IDs are at
most 32 characters matching `custom-[a-z0-9][a-z0-9-]*`; names are at most 60
characters and provenance at most 2,000. ZIP import rejects unknown paths,
missing/duplicate members, mismatched masks and partial alpha. Limits are 6 MiB
compressed/expanded, 10 members, 1 MiB per image and 128 KiB per text member.

## Saving and compatibility

- **Wardrobe recipe v3** selects a custom identity and adds a hair color. Existing
  v1/v2 recipes continue selecting their original built-in identities and colors.
  Choosing a built-in identity explicitly returns to the appropriate old recipe.
- A saved authoring project retains complete flat PNGs, the selected recipe,
  clothing items and optional `identities.json`. Its project envelope stays v1.
  A library can hold four identities within a 4 MiB serialized budget.
- Removing an unused identity is undoable. The selected identity cannot be
  removed. Detaching a wardrobe by editing flat artwork keeps the library.
- CharacterPacks remain baked self-contained PNG/manifest exports. Independent
  playback needs neither identity sources nor a generator. Keep the `.rig.zip`
  for subsequent editing; legacy appearance JSON cannot reproduce a custom head.
- Identity, wardrobe-recipe, clothing-item and SkinPack versions are independent.
  Recipe v3 can produce either a v1 skin or a v2 skin with active forearms.

The supplied [Maple/Willow example](PORTABLE_IDENTITIES_REVIEW.md) includes both
identity packages, two editable projects and a new reusable clothing set.
