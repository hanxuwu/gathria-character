# Three warm daily and date dresses

OpenAI image generation authored `female-designs.png` on 2026-10-27 using the
approved `artwork/kling-appearance/source/female-reference.png` as its reference.
`female-prompt.txt` preserves the exact generation request. The generated PNG
is retained unchanged at 1774 × 887; it is donor artwork, not an application
export and not a newly accepted source character. Generated heads, skin,
limbs, shoes and background never enter the delivered garment banks.

The three designs are Butter collar (rounded cocoa collar, fabric bow, pearl
buttons and cocoa hem), Apricot garden (ivory neckline, sage waistband, inset
welt pockets), and Deep teal date (warm gold neckline, restrained waistband
and double hem piping). These details come from new painted cloth, rather than
an RGB recolor of the coral dress.

`female-donors.json` records manually reviewed cloth-only boundaries, plain
fabric areas and paint coordinates. Polygons only delimit generated cloth;
they do not draw a garment, invent skin or establish the delivered silhouette.
The process contains no skin-color rejection: warm buttercream and apricot
remain cloth. Plain adjacent donor material completes only sampling outside a
traced region. The script discards generated anatomy and copies no donor alpha
onto the character.

## Frozen fit contract

`scripts/prepare-kling-warm-date-female.py` uses
`docs/kling-wardrobe/garments/female/coral-daydress-v9.zip` as its exact geometry
and ownership contract. All 96 source frame IDs, page geometry, crop rectangles,
offsets, source/registration hashes, binary ownership PNG bytes and every
decoded alpha byte are retained. It changes RGB only where that existing bank
both owns the pixel and has nonzero alpha. Original exposed head, face, hands,
body proportions, anchors, source motion and action timing remain unchanged.

Visible neckline controls select cloth paint coordinates without changing
body registration. The old source tank supplies a small amount of native
pose shading and its existing dark edge ink; newly generated cloth supplies
the garment detail. Skirt coordinates follow the registered waist and hip.
Butter's separately traced painted hem is registered to the existing V9 hem.

Initial prototype review found two RGB fitting defects: flat material fins
above the waist and a detached gold sash end. The existing V9 silhouette has
small upper-skirt side extensions. Those regions now sample continuous painted
skirt folds below the complete generated sash, while waistband artwork stays
within the source bodice. The tiny gold rectangle is removed without changing
any ownership or alpha. Butter's cocoa hem initially disappeared where donor
and target hem curvature differed; the source hem trace now keeps it continuous.

## Reproduce and review

Run from the repository root with Pillow, NumPy and SciPy installed:

```sh
python3 scripts/prepare-kling-warm-date-female.py --prototype
python3 scripts/prepare-kling-warm-date-female.py
```

`--item <id>` builds one design. Full output goes to
`artwork/kling-collection/prepared/warm-date-v1/female/`; publication moves the
three new ZIPs into the wardrobe catalog's female garment directory. Old
archives are never rewritten. `asset-audit.json` records the exact donor,
trace, source, registration and baseline hashes, all 288 pose audits and new
archive hashes. The preparation code asserts exact alpha, ownership and
source pixels outside ownership for every pose.

The retained contact sheets and native PNGs are explicitly **offline authoring
checks**. They cover standing, walking, side/crossed-arm running, raised arms,
deep crouches, jump blur and recovery. They are not actual browser exports or
user visual acceptance; the collection's application-export review provides
that separate evidence.

## Existing limitations

These designs retain the sleeveless A-line V9 cut. The upper-skirt side shape,
compressed crouch folds and source blur remain inherited. Source protected
neckline fragments can remain in fast blurred poses. Trim uses the existing
moving opening rather than changing neck skin; the cream/cocoa/gold details
can compress in deep crouches. There are no new sleeves, cloth physics,
proportions or regenerated animation frames.
