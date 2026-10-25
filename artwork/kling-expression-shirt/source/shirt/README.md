# Midnight sailor shirt artwork

`design.png` is the unchanged output of an `image_gen` reference edit on
2026-10-26 in Australia/Sydney. The source reference was
`artwork/kling-wardrobe/source/full-outfits-v1/designs.png`. Exact hashes,
the retained tool output path and the prompt summary are in `provenance.json`.

The left camp shirt was newly painted as a midnight navy sailor shirt, with an
ivory collar, two navy inset stripes, a short ivory neckerchief and striped
sleeve cuffs. Its plain front replaces the camp shirt's full button placket and
pocket. This is a new painted design on an existing short-sleeve cut, rather
than a recolor. The generated characters are reference illustrations only:
none of their faces, skin, body, trousers, shoes or background enter the asset.

`donor.json` records manually traced clothing-only domains and sampling axes.
`scripts/prepare-kling-midnight-sailor.py` uses the delivered male full-pose
authoring template and the reviewed Teal joined sleeve V5 bank. It preserves
V5's complete binary ownership and alpha, the source body outside clothing,
protected head and hands, native frame coordinates, anchors and timing.
The torso and sleeves receive the new painted cloth through the existing
source-bound registration workflow. Only plain inner navy cloth supplies
padding outside the traced donor; cream trim and generated skin cannot become
long extrapolated bands. The small V5 repaired sleeve tip uses nearest newly
sampled cloth inside the existing reviewed ownership.

The original U-shaped source neckline limits the deeper V-shaped painted
collar: its visible collar is fitted within that existing opening. There is no
new neck or source-body underpainting. This does not claim cloth simulation,
automatic fitting of an arbitrary silhouette, or reconstruction of hidden
source anatomy.

The initial prototype had chipped ivory near the collar/tie and a cuff stripe
too close to the skin boundary. Refined sampling uses an explicit traced donor
neck exclusion instead of classifying warm pixels as skin: shaded ivory is
therefore retained. Tighter torso/sleeve traces prevent neighboring trim from
entering the wrong clothing region, and adjusted sleeve sampling places the
stripes inside the existing cuff with a navy margin. No ownership or source
skin changes are involved. `prepared/shirt/prototype-v4` retains 2x before/after
comparisons with the initial version. The fixed source neckline and shoulder
overlap remain visible fitting constraints, particularly in crossed-arm poses.

Run a new, non-overwriting prototype first:

```sh
python scripts/prepare-kling-midnight-sailor.py --prototype --run prototype-v1
```

After reviewing its native and nearest-neighbor 2x views, build all 88 poses:

```sh
python scripts/prepare-kling-midnight-sailor.py --run final-v1
```

The result is a template garment with ID `midnight-sailor-template-v1`, stored
under `artwork/kling-expression-shirt/prepared/shirt/final-v1`. Import it into
the workbench, download the neighboring-pose painting kit, set the output to
`midnight-sailor-v1` / `Midnight sailor shirt`, preview and save the reusable
garment. An unchanged painting-kit roundtrip is a workflow check and is not
described as a further art correction. Save/reopen its wardrobe project and
export an independent CharacterPack before catalog registration.

All old artwork, source packs and garment banks remain unchanged. Offline
prototype PNGs are labeled separately from actual application export evidence.
