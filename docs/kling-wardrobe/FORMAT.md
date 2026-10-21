# Kling wardrobe V1: editable assets and independent playback

This wardrobe uses the approved Kling source sprites. Clothing is prepared for
each source pose **offline**; the browser replaces registered garment pixels in
the original frames. It does not redraw the head, infer a skeleton during
playback, stretch the approved body to fit clothing, or call an image API.

The format supports source-bound tops, bottoms, full-body outfits and shoes.
This is not a promise that an arbitrary standing clothing image will fit every
pose. Each new item must supply and pass review for every frame in its exact
source CharacterPack.

## Three separate deliverables

| File                          | Purpose                                  | Contents                                                                                                            |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Original `.character.zip`     | Immutable visual and motion reference    | Existing source PNG pages, frame IDs, anchor, source-frame mapping and action metadata                              |
| Editable wardrobe project ZIP | Continue dressing without network access | Exact original CharacterPack, registration JSON, embedded garment ZIPs, slot selection and preview action/direction |
| Exported `.character.zip`     | Independent player / consumer            | Composited PNG pages plus ordinary CharacterPack V2/V3 metadata; no wardrobe runtime is required                    |

Editable project and garment files have their own version `1`. They do not
redefine CharacterPack V2/V3. Baked exports retain
`capabilities.editableAppearance=false`: clothing is already in their pixels.
Keep the editable project when later changes are needed.

The initial motion sources are
`docs/kling-motion/exports/male.character.zip` (88 unique frames) and
`female.character.zip` (96 unique frames). Both use 704×1056 frames and attachment
`(352, 998)`. Their `characterId` values are `kling-male-motion-v1` and
`kling-female-motion-v1`. They are distinct from the older 122-frame originals,
keyframe candidates and native skeleton studies. Assets bound to one source
are deliberately rejected for another, even if the human-readable character
name is similar.

## Registration before clothing

`WardrobeRegistration` is implemented in `src/wardrobe/contract.ts`:

```ts
{
  format: "gathria-wardrobe-registration",
  version: 1,
  sourceSha256: "...", // SHA-256 of the exact source CharacterPack ZIP
  characterId: "kling-male-motion-v1",
  frameWidth: 704,
  frameHeight: 1056,
  anchor: { x: 352, y: 998 },
  frames: [{
    frameId: 0,
    sourceFrame: 336, // original video frame, not the atlas cell number
    points: {
      neck: { x: 0, y: 0, visibility: "visible", confidence: 0.5,
              method: "Record how the actual location was established." },
      // All 17 named points are required; zeros here are schema examples only.
    },
    protected: [{
      label: "head",
      polygon: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 3 }]
    }]
  }]
}
```

Points are frame-relative pixel coordinates, not percentages. Required keys:
`neck`, `nearShoulder`, `farShoulder`, `waistLeft`, `waistRight`, `nearHip`,
`farHip`, `nearElbow`, `farElbow`, `nearWrist`, `farWrist`, `nearKnee`,
`farKnee`, `nearAnkle`, `farAnkle`, `nearToe`, `farToe`.

These are authoring guides. An obscured elbow is an estimate, not an accurately
extracted original skeleton joint. `visibility` is `visible` or `occluded`;
optional `confidence` is 0–1 and `method` records contour analysis, manual
placement or interpolation. Changing a guide never moves source pixels at
runtime. Regenerating registration changes its SHA-256, so existing garments
must be explicitly re-prepared or revalidated against the new registration.

Each frame has a required `head` protection polygon and may also have
`nearHand` / `farHand` polygons. There are at most three distinct labels and
3–64 vertices per polygon. The compositor tests native pixel centers, including
polygon edges. An owned pixel is rejected if its **original source alpha is
nonzero** and its center is inside a protected polygon. This also protects
antialiased source outlines. Protection applies to the original source, not to
previously composited clothing. Reviewed head polygons include the neck
boundary where appropriate. Hands must remain separate from general skin
masks: protecting every arm pixel would prevent future sleeves from covering
forearms.

Registration contains every source manifest frame exactly once, and
`sourceFrame` must match `character.json.derivation.frames`. Repeated action
frame IDs are intentional held poses; they reuse the same registration.

## A garment archive is a complete pose bank

The garment ZIP has an exact allowlist:

```text
manifest.json
patches-0.png
ownership-0.png
patches-1.png       # optional, consecutive pages up to index 3
ownership-1.png
...
```

`WardrobeGarmentManifest` contains `format: "gathria-sprite-garment"`,
`version: 1`, a stable `id`, display `name`, `slot`, `characterId`,
`sourceSha256`, `registrationSha256`, native `frameWidth` / `frameHeight`,
`provenance`, `pages`, and `frames`. Hashes bind the exact source ZIP and exact
registration JSON bytes. The garment's own ZIP SHA-256 is retained by the
project and baked export.

Each page describes `{file, maskFile, width, height}`. Each frame describes:

```ts
{
  frameId: 0,
  page: 0,
  rect: { x: 0, y: 0, width: 300, height: 400 },
  offset: { x: 220, y: 500 }
}
```

`rect` is the same crop in both atlases; `offset` places its top-left corner
in the source frame. Crops and offsets are integer pixels. Crops must fit the
page and their placed silhouettes must fit the native frame. Every registered
frame must appear exactly once. Missing run/jump/celebration poses cannot
silently display the original clothes or borrow an unrelated pose.

Patch PNGs are non-interlaced RGBA8 with normal smooth edge alpha. Ownership
PNGs are RGBA8 whose **alpha alone** is binary 0 or 255; mask RGB values have no
semantic meaning. Ownership and visible patch alpha are different:

| Ownership alpha | Patch RGBA                  | Result                                             |
| --------------- | --------------------------- | -------------------------------------------------- |
| 0               | Must have alpha 0           | Original pixel stays byte-for-byte unchanged       |
| 255             | Any RGBA, including alpha 0 | Replace all four original channels with patch RGBA |

Replacement is intentional, not source-over blending. An owned transparent
pixel can erase old clothing outside the new silhouette. A semi-transparent
patch edge retains its supplied RGBA exactly. New clothing may extend beyond
the old outline only inside its declared ownership/crop and the native frame.
Visible head and hand protection still applies. Newly exposed body areas need
authored underpainting; they are not claimed to be recovered hidden video
layers. No global color-removal rule is used.

The offline preparation must already resolve near/far sleeve, hand, torso,
garment and leg occlusion into each pose patch. A metadata label cannot repair
a wrong sleeve silhouette or missing underpainting. Review these at native
size and integer zoom and during complete loops.

## Slots, layering and conflicts

The four slots are `top`, `bottom`, `fullBody`, `shoes`; `null` means retain the
original appearance for that slot. Composition order is shoes → bottom → top
→ fullBody, so trouser cuffs and dress hems can cover footwear. Full-body
outfits are mutually exclusive with separate tops and bottoms.

Selecting a full-body outfit clears top and bottom. Selecting a top or bottom
clears fullBody. Importing a document that simultaneously specifies both is
an error. Shoes can accompany either mode. Duplicate garment IDs are rejected;
new revisions should receive new versioned IDs rather than silently replacing
an embedded item.

All allowed catalog combinations still require visual review. Exact source
binding and ownership protect pixels but do not, by themselves, prove that
two independently authored garments have compatible hems or waist coverage.

## Editable project and APIs

The project ZIP contains only:

```text
document.json
source.character.zip
registration.json
item-0.zip
item-1.zip
...                 # at most 16 embedded garments
```

`document.json` is `gathria-wardrobe-project`, version 1, with source and
registration hashes, `{id, sha256}` item references, the four-slot selection,
and `{action, facing}` preview state. The project embeds all its loaded items,
including currently unselected alternatives, for offline reopening. It does
not contain remote asset URLs. Item indexes refer to the saved document's
item list and must match its hashes. Canonical exports sort IDs and use fixed
local DOS timestamps so save bytes do not depend on the current time or time
zone.

Implemented in `src/wardrobe/project.ts`:

```ts
createWardrobeProject(sourceBytes, registrationBytes, garmentZipBytes[])
addWardrobeGarment(project, garmentZipBytes)
selectWardrobeGarment(project, slot, idOrNull)
updateWardrobePreview(project, { action, facing })
exportWardrobeProject(project)
importWardrobeProject(projectZipBytes)
validateWardrobeProject(project)
```

Functions return new project values. Import checks every embedded asset before
returning; failure does not mutate an existing project. Callers should stage
the imported project before replacing their visible state. The editor validates
the selected appearance across every source frame and composes the first
preview before accepting it. Ownership overlapping protected source pixels is
a composition check, not merely JSON validation: the complete baked export
also checks every frame, including frames not currently previewed.

Persistence re-reads source, registration and garment bytes, rechecks hashes
and reconstructs normalized metadata. Mutating cached parsed manifest fields
cannot redefine an export's source binding. `decodeGarments: false` is only a
preview preflight optimization: selected pages must still be decoded and
checked before rendering. Normal import and persistence decode every item.
Unchanged source archives have a private two-entry cache capped at 96 MiB of
PNG data. Their ZIP SHA-256 is still recomputed at each boundary, and callers
receive deep copies; mutating a project's source or PNG arrays cannot poison
another project's cached source.

## Independent CharacterPack export

`src/wardrobe/compositor.ts` composes integer RGBA replacements without Canvas
premultiplication. `exportWardrobeCharacterPack` writes ordinary baked V2/V3
PNG pages. It retains native frame rectangles, page layout, IDs, unused atlas
cells, color-profile chunks, anchor, facing behavior, animation frame order,
FPS, loop flags, source-frame/time mapping and existing motion-flow metadata.
Left playback mirrors the complete composed character around its original
anchor. No independent garment mirroring, per-pose recentering, or new
root-motion normalization is introduced.

The export includes truthful garment derivation notes and compact wardrobe
metadata: source pack hash, registration hash, selected item hashes, slot
selection and item provenance. It does not label composed clothing PNGs as
unchanged Kling video frames. A project with no selected garments and no name
override exports the exact original CharacterPack ZIP bytes. The independent
player needs no editable project, source video, wardrobe module, skeleton or
model API to play a dressed pack.

## Limits and rejection behavior

| Resource                    | Limit                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Original CharacterPack      | Existing 64 MiB archive limit                                                                        |
| Editable wardrobe project   | 128 MiB ZIP and expanded embedded-asset budget                                                       |
| Garment ZIP                 | 64 MiB ZIP and expanded file budget                                                                  |
| Registration / garment JSON | 1 MiB each                                                                                           |
| Project document JSON       | 64 KiB                                                                                               |
| Garments per project        | 16                                                                                                   |
| Garment atlas pages         | 1–4, each dimension ≤8192                                                                            |
| Garment atlas pixels        | ≤32 Mi pixels total per patch bank and matching ownership bank                                       |
| Baked CharacterPack         | Existing V2/V3 limits remain in force; V3 ≤4 pages, ≤128 Mi decoded pixels, ≤1024 cells, ≤64 MiB ZIP |

Bounded ZIP inspection rejects duplicate or unexpected paths, unsupported
compression, invalid directory bounds, oversized inflated data and CRC
failures before accepting assets. PNG validation checks dimensions, RGBA8
format, strict compressed rows, checksums, binary ownership and visible
pixels outside ownership. Unexpected fields, changed source/registration
hashes, missing poses, invalid crops, unavailable actions and conflicting
slots fail explicitly. Limits are not bypassed to make a large garment work;
prepare tighter crop atlases instead.

## Preparing another outfit for these characters

Download `templates/male.wardrobe-template.zip` or
`templates/female.wardrobe-template.zip` from this documentation directory, or
use **Download clothing template** in the wardrobe editor. These are offline
authoring kits, not garment/project import files. Each contains the exact source
CharacterPack and registration, all per-frame semantic masks, a frame/action
index, a practical `GUIDE.md` and a SHA-256 inventory. Semantic guides can
contain soft source coverage; they are not ready-made binary runtime ownership.

Rebuild the kits after running the registration preparation scripts:

```sh
python scripts/build-kling-wardrobe-templates.py \
  --male-prepared /tmp/kling-wardrobe-male-repro \
  --female-prepared /tmp/kling-wardrobe-female
```

The builder checks exact frame/action coverage, decodes every mask from both
its input and delivered ZIP, checks original source/registration identity and
verifies a second canonical ZIP build is byte-identical. No separately cropped
source frames are committed. `templates/inventory.json` records the delivered
archive hashes, byte counts and mask verification totals.

1. Choose and freeze the exact source pack. Reuse its reviewed registration;
   do not substitute the skeleton study's different attachment or proportions.
2. Inspect and, where needed, revise anchor confidence, visible/occluded
   classification and head/hand protection. Save the new registration hash
   before preparing matching clothes.
3. Make coherent original garment art offline. Record tool/model or source,
   prompts, authoring changes, licenses where applicable, and any reconstructed
   hidden surfaces. The current registration/preparation scripts live under
   `scripts/prepare-kling-wardrobe-*.py` and `scripts/kling_wardrobe_common.py`.
4. Prepare each required source-frame patch, ownership, silhouette and
   occlusion. Offline anchor deformation is an authoring step, not evidence
   that a pose is visually correct. Add a pose-specific garment drawing when
   deformation cannot preserve a cuff, skirt volume or joint connection.
5. Pack tight RGBA/ownership atlases and the source-bound manifest. Use all
   original frame IDs, including one-shot jump and repeated/held source poses.
6. Import, compose and export. Check protected pixels and exact RGBA equality
   outside the ownership union, then inspect native/2× frames and right/left
   playback for gaps, old clothes, drifting seams, wrong occlusion and loop
   jumps. Test combinations where hems or waists overlap.
7. Save the editable project and independently load the baked export after
   closing the editor. Keep actual PNG/GIF/ZIP evidence and distinguish
   technical checks from visual acceptance.

This format preserves the supplied motion. It does not repair pose changes or
transition discontinuities already present in the source videos. Passing its
validators establishes identity, bounded data, coverage and compositing rules;
it does not constitute the user's visual approval of new clothing.
