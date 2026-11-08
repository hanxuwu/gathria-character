# Landing wedding sleeve and source-cloth coverage review

This is an item-specific repair of the existing male wedding jacket. The 107
original native source frames and their shared registration stay unchanged;
the production builder keeps its separately authored frames 107/108 unchanged.

The old conservative hand polygons included visible forearms. For example,
frame 85's far-hand polygon protected 895 opaque source-skin pixels in the
visible forearm rectangle `[320, 526, 350, 556]`, before the wrist at x362. The
garment correctly respected that polygon, leaving a large bare section under
the long sleeve. Ownership/protection lint therefore passed while the worn
jacket was visibly incomplete.

`reviewed-cuffs.json` freezes per-pose cuff planes and retained hand polygons.
The initial contour proposals were checked against native source closeups;
ambiguous wrist anchors that fell inside fists were not used as cuff positions.
The raised-arm frames have additional bounded, source-visible forearm domains.
Each retained polygon is a raster subset of its original hand protection.
These reviews belong only to the garment's V2 manifest. No source, head region,
shared hand registration, pose anchor, timing, or default appearance is edited.

The same file records independently reviewed original-tank pixel targets from
`artwork/wardrobe-coverage/side/recipe.json`. Their retained hand polygons are
intersected with the cuff reviews once during authoring and frozen here; there
is no geometry-library dependency at runtime. The wedding jacket supplies its
own nearby painted fabric RGB at those targets, retaining original source
alpha. The existing wedding donor supplies the added sleeve fabric; generated
skin, faces and hands are never sampled.

Reproduce the 107-frame base with:

```sh
python scripts/refine-landing-wedding-coverage.py --output /tmp/wedding-coverage
```

The script verifies the exact baseline, source, registration, and donor hashes,
all retained hand/head protection, and exact unchanged patch/ownership bytes
outside the declared repair domains. It produces `audit.json`, the revised V2
base archive, and native per-frame PNGs. `baseline-wedding-top.garment.zip` is
the immutable authoring input, not an active catalog item. The completed base
is published at `../wedding/bases/male-wedding-top.garment.zip`; the existing
landing production builder rebinds it to the unchanged candidate source.

`baseline-wedding-bottom.garment.zip` similarly freezes the original navy
trouser base from commit `863d761bbdc927ea65080250c765b9c5c78c8fc4`.
`scripts/propagate-landing-trouser-coverage.py --check` verifies its pinned hash
and the exact current trouser repair. The side-cloth recipe uses its own
permanent main baseline; this wedding base was introduced later and must not
be read from that earlier commit. Both frozen archives are authoring inputs,
not additional selectable garments.

Visual limits remain distinct from coverage validation: several source hands
are blurred or distorted in the original Kling frames, and frame 97 still has
a fairly straight cuff. Added sleeves close the exposed forearm and old-tank
regions, but their folds and cuff shading are not a new fully painted animation.
Those remaining art issues must not be hidden by a claim that format checks
prove perfect clothing in motion.
