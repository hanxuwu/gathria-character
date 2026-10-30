# Matched side-view hairstyle assets

The visual authorities are the already published original-view `side-part`
(male) and `soft-bob` (female), documented with exact native crops in
[source/references](source/references/README.md). The previous side-view crop and
longer bob are preserved in `docs/dual-looks/assets`; their names did not make
them the same design.

## Authored source and extraction

`source/generation.json`, `source/PROMPTS.md` and `source/MALE-V2-PROMPT.md`
record the image-generation inputs and exact outputs. The accepted donors are
`male-side-design-v2.png` and `female-side-design-v1.png`. Male v1 is retained as
a rejected study: its ear opening was too small to fit the approved source
without exposing the rear scalp or cutting a strand through the ear.

Generated portraits are **not replacement heads**. Reviewed inner boundary
polygons in `scripts/prepare-kling-matched-hair.py` discard all donor skin, eyes,
ears, neck, clothing and body. The original donor alpha supplies the outer hair
contour; a narrow cut-fringe exclusion removes peach contamination. Semantic
front/rear regions keep the scalp-covering hair in front and genuine nape and
far-side locks behind the source. No body-colored repair patches are introduced.

One similarity transform places each donor on the source's native standing
pose. Other poses use the **persisted** source-specific `headTransform` without
re-estimating it. The female ear opening uses a continuous local registration
field toward the existing `featureTransform`, since the scalp fit expands more
than the source ear during crouches. Both hair layers use the same field to
avoid seams; the crown and far-side outline keep their head registration.
Male jump poses 67 and 79 also receive a bounded rear-cap displacement to cover
source scalp extending past the donor. Their neighboring poses 66/68 and 78/80
receive reduced weights for continuity. This changes only the existing hair
texture in the rear-cap neighborhood, leaving the source ear, neck and crown
unchanged; exact field parameters and weights are recorded in the binding.
Existing `featureTransform` also registers an added neck/collar foreground
polygon. Source `headBounds`, `facePolygon`,
body anchors, frame IDs and source-video indices remain unchanged. These
constraints prevent fixing the fit by resizing or repainting the character.

Where an existing hand/body guard blocks front hair over a partially transparent
source edge, only that hair sample moves into the back layer. Normal
destination-over composition supplies hair behind the unchanged source edge.
It neither duplicates the whole hair alpha nor relaxes hand protection. Opaque
source scalp mistakenly included in an old hand mask remains a documented
limitation; a rear layer cannot cover it.

`male-binding.json` and `female-binding.json` record donor SHA, the exact
boundary polygons and matrices, bank SHA, per-frame neck protection and hair
bounds. Builder checks protect source face/neck and all pixels outside the hair
union. An independent verifier compares actual application exports; builder
assertions alone are not visual acceptance.

## Reproduction

Python 3 requires Pillow, NumPy and OpenCV. Node uses the repository lockfile.
The original committed sources and registrations are used directly; no video
regeneration is required.

```sh
# Inspect the two native fitting poses without replacing application assets.
python scripts/prepare-kling-matched-hair.py --output /tmp/matched-hair-preview

# Prepare every native pose and new archives in a separate candidate directory.
python scripts/prepare-kling-matched-hair.py --build-bank --output /tmp/matched-hair-candidate

# After reviewing that candidate, publish only this revision's new archives.
python scripts/prepare-kling-matched-hair.py --publish --output /tmp/matched-hair-candidate
node scripts/assemble-matched-hair-catalog.mjs
node scripts/assemble-matched-hair-catalog.mjs --check
```

The catalog assembler preserves the original-view rows exactly and independently
checks old/new side face crops, masks, offsets and fallback modes. It also checks
that only hair bounds and the added neck foreground differ in pose metadata.
The new catalog references existing original-view ZIPs rather than duplicating
them. Old catalogs and saved embedded appearances remain intact.

Source blur, video head deformation and green-screen edge remnants are retained.
Actual exported comparisons, compatibility checks and visual limits are in
[docs/matched-hair](../../docs/matched-hair/README.md).
