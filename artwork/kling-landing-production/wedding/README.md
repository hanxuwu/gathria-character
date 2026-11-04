# Native side wedding candidate

This directory contains the painted cloth donor, exact image-generation prompt,
cloth-only tracing recipe/cutouts, and the two appended landing-pose garments.
The navy jacket, ivory waistcoat, coral tie and navy trousers are sampled from
actual donor artwork. Generated head, skin, hands, body geometry, shoes and
background never enter the garment patches. Original white shoes are retained.

The 107-frame base is authored by `scripts/prepare-landing-side-wedding.py` against
the immutable original side source and existing polished registration. No
existing source, daily garment, registration, frame mapping or timing is edited.
The donor is resampled in cloth coordinates onto each source pose, then baked as
ordinary strict V1 RGBA patches with independent binary ownership.

The fit reuses accepted daily trouser ownership/alpha except for source shoe-edge
restorations: the old daily bank owned several sole/matte pixels. This wedding
edition restores those exact source pixels and removes corresponding transparent
cloth protrusions. The daily bank is unchanged. The recipe records the source
foot guard and explicit frame 57 sole-only review box.

Long sleeves use source-visible arms and strict existing head/hand protection.
Cloth sampling follows reviewed shoulder-cap guides at frames 80–95 and two
additional manually inspected arm texture guides at 102–103. These guides never
modify source joints, protection, anatomy or ownership. Raised-arm cap sampling
uses the observed source arm surface. Sloped source and donor neckline contours
prevent repeated padded cloth above the ivory collar. Conservative original
neck/hand protection and video matte remain visible in some legacy poses.

Frame 43 was specifically checked for a suspected bare forearm: all 1,780 warm
source-visible near-forearm pixels outside protection are replaced by cloth;
the exposed pixels belong to the protected palm/fist region.

## Reproduction

Run from the repository root with Pillow, numpy and scipy available:

```sh
python scripts/prepare-landing-side-wedding.py --output /tmp/landing-production/wedding
```

This writes complete 107-frame top/bottom banks, independent strict lint reports,
per-frame previews and all four action contact sheets. `--preview --frames ...`
limits diagnostic rendering but does not produce a partial garment bank.

The final 109-frame source and registration are assembled separately by the
production binder. New frame 107/108 patches are fitted from its exact source
RGBA and manually reviewed registration, reusing the actual newly derived daily
semantic masks. OpenCV is needed only by the new-pose semantic-mask context:

```sh
python scripts/prepare-landing-side-wedding.py \
  --extension-daily artwork/kling-landing-production/daily \
  --registration docs/kling-landing-production/assets/male.registration.json \
  --output artwork/kling-landing-production/wedding/extension
```

The extension directory contains full 512×768 patch and binary-alpha ownership
PNGs, exact source/registration hashes in its audit, and native composited
previews. The production binder appends those patches and validates all 109
frames. Original source frames 0–106 and their registration remain unchanged.

These are experimental candidate assets. Structural validation proves source
binding, complete coverage and protected-pixel preservation; visual quality and
the actual run→jump→run transition are reviewed through the production UI.

## PR62 raised-sleeve revision

The current base now includes a bounded raised-sleeve improvement at frames
63–66, 74–80 and 97–101. See [sleeve-refinement/README.md](sleeve-refinement/README.md)
for the actual painted donor, exact reproduction command, same-frame comparisons
and preservation audit. Run the `--refine-raised-sleeves` pass to reproduce that
revision; the original full authoring command above reproduces the earlier base.
